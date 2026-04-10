const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStudentBalance, getStudentsWithBalance } = require('../utils/studentBalance');

const PROMOTION_MAP = {
  'Nursery 1': 'Nursery 2',
  'Nursery 2': 'Kinder',
  'Kinder': 'Grade 1',
  'Grade 1': 'Grade 2',
  'Grade 2': 'Grade 3',
  'Grade 3': 'Grade 4',
  'Grade 4': 'Grade 5',
  'Grade 5': 'Grade 6',
};

// Inverse of PROMOTION_MAP — used by the revert endpoint to un-promote
// students when rolling back an End-of-Year operation.
const DEMOTION_MAP = Object.fromEntries(
  Object.entries(PROMOTION_MAP).map(([from, to]) => [to, from])
);

function nextSchoolYear(sy) {
  if (!sy) return null;
  const parts = sy.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return `${parts[0] + 1}-${parts[1] + 1}`;
}

function getCurrentSchoolYearServer() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 6) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

function getActiveSchoolYear() {
  const row = db.prepare("SELECT value FROM school_settings WHERE key = 'current_school_year'").get();
  if (row && row.value) return row.value;
  return getCurrentSchoolYearServer();
}

function setSchoolSetting(key, value) {
  db.prepare(`INSERT INTO school_settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

// POST /api/admin/end-school-year-preview
router.post('/end-school-year-preview', (req, res) => {
  try {
    const currentSchoolYear = getActiveSchoolYear();
    const nextSY = nextSchoolYear(currentSchoolYear);

    // Count students by status
    const enrolled = db.prepare(`SELECT student_id, grade_level FROM students WHERE status = 'Enrolled'`).all();
    const loa = db.prepare(`SELECT COUNT(*) as c FROM students WHERE status = 'LOA'`).get().c;
    const dropped = db.prepare(`SELECT COUNT(*) as c FROM students WHERE status = 'Dropped'`).get().c;
    const registered = db.prepare(`SELECT COUNT(*) as c FROM students WHERE status = 'Registered'`).get().c;
    const notEnrolled = db.prepare(`SELECT COUNT(*) as c FROM students WHERE status = 'Not Enrolled'`).get().c;
    const graduating = enrolled.filter(s => s.grade_level === 'Grade 6').length;
    const promoting = enrolled.length - graduating;

    // Use the shared helper so this matches Dashboard, SOA /batch, and the
    // end-of-year snapshot exactly (global balance, no status or year filter).
    const withBalance = getStudentsWithBalance(db);
    const arrearsStudents = withBalance.map(s => ({
      student_id: s.student_id,
      name: `${s.last_name}, ${s.first_name}`,
      grade_level: s.grade_level,
      balance: s.balance,
    }));
    const arrearsTotal = withBalance.reduce((sum, s) => sum + s.balance, 0);

    const nextYearTuitionExists = !!db.prepare(`SELECT 1 FROM tuition_schedule WHERE school_year = ? LIMIT 1`).get(nextSY);

    res.json({
      currentSchoolYear,
      nextSchoolYear: nextSY,
      enrolled: enrolled.length,
      promoting,
      graduating,
      loa,
      dropped,
      registered,
      notEnrolled,
      arrearsStudents,
      arrearsTotal,
      nextYearTuitionExists,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/end-school-year
router.post('/end-school-year', (req, res) => {
  try {
    const { confirm, promote = true, clearSections = true, lockYear = true } = req.body;
    if (confirm !== 'CONFIRM') {
      return res.status(400).json({ error: 'You must type CONFIRM to proceed' });
    }

    const currentSchoolYear = getActiveSchoolYear();
    const nextSY = nextSchoolYear(currentSchoolYear);
    if (!nextSY) return res.status(400).json({ error: 'Could not determine next school year' });

    const performedBy = req.user?.username || 'unknown';
    const snapshotDate = new Date().toISOString().slice(0, 10);

    const result = db.transaction(() => {
      // 1. Snapshot arrears using the same global-balance definition as the
      // Dashboard and SOA. Includes every student who currently owes money
      // regardless of which school_year their obligations are labeled with.
      const snapshotStmt = db.prepare(`
        INSERT INTO year_end_snapshots (student_id, school_year, total_fees, total_paid, arrears_amount, snapshot_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, school_year) DO UPDATE SET
          total_fees = excluded.total_fees,
          total_paid = excluded.total_paid,
          arrears_amount = excluded.arrears_amount,
          snapshot_date = excluded.snapshot_date,
          created_by = excluded.created_by
      `);

      const withBalance = getStudentsWithBalance(db);
      let arrearsSnapshotted = 0;
      let arrearsTotal = 0;
      for (const s of withBalance) {
        snapshotStmt.run(
          s.student_id,
          currentSchoolYear,
          s.total_fees,
          s.total_paid,
          s.balance, // rounding fix already applied by the helper
          snapshotDate,
          performedBy,
        );
        arrearsSnapshotted++;
        arrearsTotal += s.balance;
      }

      // 2. Process Enrolled students
      const enrolled = db.prepare(`SELECT student_id, grade_level FROM students WHERE status = 'Enrolled'`).all();
      let promoted = 0;
      let graduated = 0;
      const updateEnrolledStmt = db.prepare(`
        UPDATE students SET status = ?, grade_level = ?, section = ?, updated_at = datetime('now','localtime')
        WHERE student_id = ?
      `);
      for (const s of enrolled) {
        const newSection = clearSections ? null : undefined;
        if (s.grade_level === 'Grade 6') {
          // Grade 6 → Graduated (grade stays)
          updateEnrolledStmt.run(
            'Graduated',
            s.grade_level,
            clearSections ? null : db.prepare('SELECT section FROM students WHERE student_id = ?').get(s.student_id).section,
            s.student_id
          );
          graduated++;
        } else {
          const newGrade = promote ? (PROMOTION_MAP[s.grade_level] || s.grade_level) : s.grade_level;
          updateEnrolledStmt.run(
            'Not Enrolled',
            newGrade,
            clearSections ? null : db.prepare('SELECT section FROM students WHERE student_id = ?').get(s.student_id).section,
            s.student_id
          );
          promoted++;
        }
      }

      // 3. Process LOA students → Not Enrolled, no grade change
      const loaStmt = db.prepare(`
        UPDATE students SET status = 'Not Enrolled'${clearSections ? ', section = NULL' : ''}, updated_at = datetime('now','localtime')
        WHERE status = 'LOA'
      `);
      const loaResult = loaStmt.run();
      const loaReset = loaResult.changes;

      // 4. Update current_school_year setting
      setSchoolSetting('current_school_year', nextSY);

      // 5. Lock year
      let yearLocked = false;
      if (lockYear) {
        const existing = db.prepare("SELECT value FROM school_settings WHERE key = 'locked_school_years'").get();
        let locked = [];
        try { locked = existing ? JSON.parse(existing.value) : []; } catch { locked = []; }
        if (!locked.includes(currentSchoolYear)) locked.push(currentSchoolYear);
        setSchoolSetting('locked_school_years', JSON.stringify(locked));
        yearLocked = true;
      }

      // 6. Audit log
      const auditDetails = {
        promoted,
        graduated,
        loaReset,
        arrearsSnapshotted,
        arrearsTotal,
        promote,
        clearSections,
        lockYear,
        fromSchoolYear: currentSchoolYear,
        toSchoolYear: nextSY,
      };
      db.prepare(`
        INSERT INTO audit_log (action, performed_by, school_year, details)
        VALUES (?, ?, ?, ?)
      `).run('END_OF_SCHOOL_YEAR', performedBy, currentSchoolYear, JSON.stringify(auditDetails));

      return { promoted, graduated, loaReset, arrearsSnapshotted, arrearsTotal, yearLocked };
    })();

    res.json({
      success: true,
      currentSchoolYear,
      nextSchoolYear: nextSY,
      ...result,
      message: `School year ${currentSchoolYear} ended successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/revert-end-school-year
// Undoes a previously-run End-of-Year rollover for the given schoolYear.
// Steps (atomic):
//   1. Confirm the year is currently locked and caller typed CONFIRM
//   2. Unlock it (remove from school_settings.locked_school_years)
//   3. Reset school_settings.current_school_year to that year
//   4. Clear year_end_snapshots for that year
//   5. If revertStudents is true (default): for every student who was
//      affected by the EOY run — status ∈ ('Not Enrolled', 'Graduated')
//      AND has obligations in schoolYear — set status back to 'Enrolled'
//      and demote grade_level by one via DEMOTION_MAP (Graduated students
//      keep their grade since EOY didn't promote them).
//   6. Write an END_OF_SCHOOL_YEAR_REVERTED audit entry with the per-
//      student change list so the operation can be inspected later.
//
// This endpoint is idempotent in the sense that re-calling it for a year
// that's already unlocked will just short-circuit and return a no-op.
router.post('/revert-end-school-year', (req, res) => {
  try {
    const { schoolYear, confirm, revertStudents = true } = req.body || {};
    if (!schoolYear) return res.status(400).json({ error: 'schoolYear is required' });
    if (confirm !== 'CONFIRM') return res.status(400).json({ error: 'You must type CONFIRM to proceed' });

    const lockedRow = db.prepare("SELECT value FROM school_settings WHERE key = 'locked_school_years'").get();
    let locked = [];
    try { locked = lockedRow ? JSON.parse(lockedRow.value) : []; } catch { locked = []; }
    if (!locked.includes(schoolYear)) {
      return res.status(400).json({
        error: `School year ${schoolYear} is not locked. Nothing to revert.`,
        currentLocked: locked,
      });
    }

    const performedBy = req.user?.username || 'unknown';
    const changedStudents = [];

    const result = db.transaction(() => {
      // 1) Reset current_school_year
      setSchoolSetting('current_school_year', schoolYear);

      // 2) Unlock the year
      const newLocked = locked.filter(sy => sy !== schoolYear);
      setSchoolSetting('locked_school_years', JSON.stringify(newLocked));

      // 3) Clear year_end_snapshots for this year (they were written by the
      //    EOY run we're reversing; the data will be re-snapshot if EOY is
      //    re-run later)
      const snapshotResult = db.prepare(
        `DELETE FROM year_end_snapshots WHERE school_year = ?`
      ).run(schoolYear);

      // 4) Restore student statuses
      let restoredPromoted = 0;
      let restoredGraduated = 0;
      if (revertStudents) {
        // Candidates: students who have obligations in schoolYear AND are
        // currently in a status EOY would have set them to. We include
        // 'Graduated' for students that were Grade 6 during the EOY run.
        const candidates = db.prepare(`
          SELECT s.student_id, s.first_name, s.last_name, s.grade_level, s.status
          FROM students s
          WHERE s.status IN ('Not Enrolled', 'Graduated')
            AND EXISTS (
              SELECT 1 FROM obligations o
              WHERE o.student_id = s.student_id AND o.school_year = ?
            )
        `).all(schoolYear);

        const updateStmt = db.prepare(
          `UPDATE students SET status = ?, grade_level = ?, updated_at = datetime('now','localtime')
           WHERE student_id = ?`
        );

        for (const s of candidates) {
          if (s.status === 'Graduated') {
            // Grade 6 graduates stay in Grade 6 when restored
            updateStmt.run('Enrolled', s.grade_level, s.student_id);
            changedStudents.push({
              student_id: s.student_id,
              name: `${s.last_name}, ${s.first_name}`,
              from: { status: 'Graduated', grade: s.grade_level },
              to: { status: 'Enrolled', grade: s.grade_level },
            });
            restoredGraduated++;
          } else {
            // Not Enrolled → demote grade back to what it was pre-EOY
            const prevGrade = DEMOTION_MAP[s.grade_level] || s.grade_level;
            updateStmt.run('Enrolled', prevGrade, s.student_id);
            changedStudents.push({
              student_id: s.student_id,
              name: `${s.last_name}, ${s.first_name}`,
              from: { status: 'Not Enrolled', grade: s.grade_level },
              to: { status: 'Enrolled', grade: prevGrade },
            });
            restoredPromoted++;
          }
        }
      }

      // 5) Audit log entry
      const auditDetails = {
        schoolYear,
        revertStudents,
        restoredPromoted,
        restoredGraduated,
        snapshotsCleared: snapshotResult.changes,
        unlocked: schoolYear,
        resetCurrentSY: schoolYear,
        students: changedStudents,
      };
      db.prepare(`
        INSERT INTO audit_log (action, performed_by, school_year, details)
        VALUES (?, ?, ?, ?)
      `).run('END_OF_SCHOOL_YEAR_REVERTED', performedBy, schoolYear, JSON.stringify(auditDetails));

      return {
        restoredPromoted,
        restoredGraduated,
        snapshotsCleared: snapshotResult.changes,
      };
    })();

    res.json({
      success: true,
      schoolYear,
      unlocked: true,
      currentSchoolYear: schoolYear,
      ...result,
      students: changedStudents,
      message: `School year ${schoolYear} has been unlocked and restored.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/audit-log
router.get('/audit-log', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, action, performed_by, school_year, details, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    const parsed = rows.map(r => {
      let details = null;
      try { details = r.details ? JSON.parse(r.details) : null; } catch { details = r.details; }
      return { ...r, details };
    });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
