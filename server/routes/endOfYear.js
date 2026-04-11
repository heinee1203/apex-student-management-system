const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStudentBalance, getStudentsWithBalance } = require('../utils/studentBalance');
const { getLockedYears, isYearLocked } = require('../utils/schoolYearLock');

// =============================================================================
// End-of-Year v2 — rebuilt 2026-04-11 after the v1 incident (commit 5b468a4)
//
// Design rules (from the rebuild spec + the v1 postmortem):
//   1. Before mutating ANY student row, snapshot the FULL row as JSON into
//      year_end_snapshots.data. This is the only recovery path if revert is
//      needed. v1 only captured fees/payments/arrears — sections and grades
//      were unrecoverable.
//   2. Execute is a single DB transaction: all or nothing.
//   3. Only Admin can run execute / revert / preview. Mount handles auth.
//   4. Grade 6 students → status "Graduated", grade stays.
//      Other Enrolled students → status "Not Enrolled", grade bumped.
//      Not Enrolled / Dropped / LOA → NOT touched.
//   5. Balances (obligations - payments) are NOT mutated. EOY only touches
//      students.status and students.grade_level. Cross-year arrears stay
//      intact by construction.
//   6. The new school year is computed as previousYear+1 server-side — no
//      client input, no ambiguity.
//   7. Revert requires the snapshot rows to still exist and reads every
//      field from .data. The .data JSON is the source of truth for revert.
// =============================================================================

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

// Compute the next school year string (e.g. "2025-2026" → "2026-2027").
function nextSchoolYear(sy) {
  if (!sy) return null;
  const parts = sy.split('-').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return `${parts[0] + 1}-${parts[1] + 1}`;
}

function getActiveSchoolYear() {
  const row = db.prepare("SELECT value FROM school_settings WHERE key = 'current_school_year'").get();
  if (row && row.value) return row.value;
  // Fallback — should never hit this if settings is seeded
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() + 1 >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function setSchoolSetting(key, value) {
  db.prepare(`INSERT INTO school_settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

// Shape a student row + its balance into the object the frontend wizard
// needs for BOTH the pre-flight summary and the dry-run preview table.
function buildStudentPreview(s) {
  const { totalFees, totalPaid, balance } = getStudentBalance(db, s.student_id);

  let newGrade = s.grade_level;
  let newStatus = s.status;
  let action = 'unchanged'; // 'promoted' | 'graduated' | 'unchanged'

  if (s.status === 'Enrolled') {
    if (s.grade_level === 'Grade 6') {
      newStatus = 'Graduated';
      action = 'graduated';
    } else {
      newGrade = PROMOTION_MAP[s.grade_level] || s.grade_level;
      newStatus = 'Not Enrolled';
      action = 'promoted';
    }
  }
  // LOA / Dropped / Not Enrolled / Registered / Graduated → unchanged

  return {
    student_id: s.student_id,
    name: `${s.last_name}, ${s.first_name}${s.middle_name ? ' ' + s.middle_name : ''}`.trim(),
    current_grade: s.grade_level,
    new_grade: newGrade,
    current_status: s.status,
    new_status: newStatus,
    total_fees: totalFees,
    total_paid: totalPaid,
    balance_carried: balance,
    action,
  };
}

// -----------------------------------------------------------------------------
// GET /api/admin/end-of-school-year/preview
//
// Pre-flight summary + dry-run preview rolled into one response. Safe to
// call any time — does NOT mutate anything. The wizard hits this once on
// mount and uses the same payload for Step 1 (aggregates) and Step 2 (table).
// -----------------------------------------------------------------------------
router.get('/end-of-school-year/preview', (req, res) => {
  try {
    const currentSchoolYear = getActiveSchoolYear();
    const nextSY = nextSchoolYear(currentSchoolYear);
    const alreadyLocked = isYearLocked(currentSchoolYear);

    const students = db.prepare(
      `SELECT * FROM students ORDER BY last_name, first_name`
    ).all();

    const previews = students.map(buildStudentPreview);

    // Aggregates for Step 1
    const enrolled = previews.filter(p => p.current_status === 'Enrolled');
    const notEnrolled = previews.filter(p => p.current_status === 'Not Enrolled');
    const dropped = previews.filter(p => p.current_status === 'Dropped');
    const loa = previews.filter(p => p.current_status === 'LOA');
    const registered = previews.filter(p => p.current_status === 'Registered');
    const graduated = previews.filter(p => p.current_status === 'Graduated');

    const withBalance = getStudentsWithBalance(db);
    const fullyPaid = enrolled.filter(p => p.total_fees > 0 && p.balance_carried === 0);

    const promoting = previews.filter(p => p.action === 'promoted').length;
    const graduating = previews.filter(p => p.action === 'graduated').length;
    const unchanged = previews.filter(p => p.action === 'unchanged').length;

    // Sum of balances that will carry forward as prior arrears
    const totalArrearsCarried = withBalance.reduce((sum, s) => sum + s.balance, 0);

    // Does the next year already have a tuition schedule configured?
    const nextYearTuitionExists = !!db.prepare(
      `SELECT 1 FROM tuition_schedule WHERE school_year = ? LIMIT 1`
    ).get(nextSY);

    res.json({
      currentSchoolYear,
      nextSchoolYear: nextSY,
      alreadyLocked,
      nextYearTuitionExists,
      summary: {
        total: students.length,
        enrolled: enrolled.length,
        notEnrolled: notEnrolled.length,
        dropped: dropped.length,
        loa: loa.length,
        registered: registered.length,
        graduated: graduated.length,
        withBalance: withBalance.length,
        fullyPaid: fullyPaid.length,
        promoting,
        graduating,
        unchanged,
        totalArrearsCarried: Math.round(totalArrearsCarried * 100) / 100,
      },
      students: previews,
      withBalance: withBalance.map(s => ({
        student_id: s.student_id,
        name: `${s.last_name}, ${s.first_name}`,
        grade_level: s.grade_level,
        status: s.status,
        balance: s.balance,
      })),
    });
  } catch (err) {
    console.error('[eoy/preview]', err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/admin/end-of-school-year
//
// Execute EOY. Single transaction. Snapshots every student as JSON before
// mutating anything. Writes audit log. Idempotent guard: refuses if the
// current school year is already in locked_school_years.
// -----------------------------------------------------------------------------
router.post('/end-of-school-year', (req, res) => {
  try {
    const { schoolYear, confirm } = req.body || {};

    const currentSchoolYear = getActiveSchoolYear();
    const expectedConfirm = `CLOSE ${currentSchoolYear}`;

    if (confirm !== expectedConfirm) {
      return res.status(400).json({
        error: `You must type "${expectedConfirm}" to confirm.`,
      });
    }
    if (schoolYear && schoolYear !== currentSchoolYear) {
      return res.status(400).json({
        error: `schoolYear mismatch: active year is ${currentSchoolYear}, got ${schoolYear}.`,
      });
    }
    if (isYearLocked(currentSchoolYear)) {
      return res.status(409).json({
        error: `S.Y. ${currentSchoolYear} is already locked. EOY has already been executed for this year.`,
      });
    }

    const nextSY = nextSchoolYear(currentSchoolYear);
    if (!nextSY) {
      return res.status(500).json({ error: `Could not derive next school year from "${currentSchoolYear}"` });
    }

    const performedBy = req.user?.username || 'unknown';
    const snapshotDate = new Date().toISOString();

    const result = db.transaction(() => {
      // 1) Snapshot every student row as JSON BEFORE any mutation. This is
      //    the source of truth for revert. We also write the classical
      //    fees/paid/arrears columns so old reports still work.
      const allStudents = db.prepare('SELECT * FROM students').all();
      const insertSnap = db.prepare(`
        INSERT INTO year_end_snapshots
          (student_id, school_year, total_fees, total_paid, arrears_amount,
           snapshot_date, created_by, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, school_year) DO UPDATE SET
          total_fees     = excluded.total_fees,
          total_paid     = excluded.total_paid,
          arrears_amount = excluded.arrears_amount,
          snapshot_date  = excluded.snapshot_date,
          created_by     = excluded.created_by,
          data           = excluded.data
      `);

      const snapshotPreviews = [];
      for (const s of allStudents) {
        const { totalFees, totalPaid, balance } = getStudentBalance(db, s.student_id);
        insertSnap.run(
          s.student_id,
          currentSchoolYear,
          totalFees,
          totalPaid,
          balance,
          snapshotDate,
          performedBy,
          JSON.stringify(s) // full row
        );
        snapshotPreviews.push({ s, totalFees, totalPaid, balance });
      }

      // 2) Mutate: promote Enrolled, graduate Grade 6, leave others alone.
      //
      // For each promoted student, look up the tuition_schedule for the
      // NEW grade in the NEXT school year and update total_tuition so the
      // Students page reads the correct rate immediately after EOY (no
      // need to wait until the registrar clicks Enroll). Same Monthly /
      // Quarterly / Annually math as enrollStudent.js (lines 31-34) so
      // both code paths agree on the computed total. If no schedule row
      // exists for the new year + new grade, leave total_tuition as-is —
      // the registrar will set up the schedule before enrolling.
      const updateStmt = db.prepare(
        `UPDATE students SET status = ?, grade_level = ?, total_tuition = ?,
                              updated_at = datetime('now','localtime')
         WHERE student_id = ?`
      );
      const lookupRate = db.prepare(
        `SELECT * FROM tuition_schedule WHERE grade_level = ? AND school_year = ?`
      );
      const changes = [];
      let promoted = 0, graduated = 0, unchanged = 0;
      for (const { s, totalFees, totalPaid, balance } of snapshotPreviews) {
        let newGrade = s.grade_level;
        let newStatus = s.status;
        let newTotalTuition = s.total_tuition || 0;

        if (s.status === 'Enrolled') {
          if (s.grade_level === 'Grade 6') {
            newStatus = 'Graduated';
            graduated++;
            // Graduated students keep their existing total_tuition
            // (Grade 6 doesn't transition to a next year's schedule)
          } else {
            newGrade = PROMOTION_MAP[s.grade_level] || s.grade_level;
            newStatus = 'Not Enrolled';
            promoted++;

            // Look up new year's tuition rate for the new grade
            if (s.payment_term) {
              const rate = lookupRate.get(newGrade, nextSY);
              if (rate) {
                if (s.payment_term === 'Monthly')         newTotalTuition = rate.monthly_rate * 10;
                else if (s.payment_term === 'Quarterly')  newTotalTuition = rate.quarterly_rate * 4;
                else if (s.payment_term === 'Annually')   newTotalTuition = rate.annual_rate;
              }
              // If no schedule row, newTotalTuition stays at the old value
            }
          }
          updateStmt.run(newStatus, newGrade, newTotalTuition, s.student_id);
        } else {
          unchanged++;
        }

        changes.push({
          studentId: s.student_id,
          name: `${s.last_name}, ${s.first_name}`,
          oldGrade: s.grade_level,
          newGrade,
          oldStatus: s.status,
          newStatus,
          oldTotalTuition: s.total_tuition || 0,
          newTotalTuition,
          totalFees,
          totalPaid,
          balanceCarried: balance,
        });
      }

      // 3) Lock the closed year
      const lockedRow = db.prepare(
        "SELECT value FROM school_settings WHERE key = 'locked_school_years'"
      ).get();
      let locked = [];
      try { locked = lockedRow ? JSON.parse(lockedRow.value) : []; } catch { locked = []; }
      if (!locked.includes(currentSchoolYear)) locked.push(currentSchoolYear);
      setSchoolSetting('locked_school_years', JSON.stringify(locked));

      // 4) Flip the active year
      setSchoolSetting('current_school_year', nextSY);

      // 5) Audit
      const totalArrearsCarried = snapshotPreviews.reduce((sum, p) => sum + Math.max(0, p.balance), 0);
      db.prepare(`
        INSERT INTO audit_log (action, performed_by, school_year, details)
        VALUES (?, ?, ?, ?)
      `).run(
        'END_OF_SCHOOL_YEAR',
        performedBy,
        currentSchoolYear,
        JSON.stringify({
          previousYear: currentSchoolYear,
          newYear: nextSY,
          promoted,
          graduated,
          unchanged,
          totalArrearsCarried: Math.round(totalArrearsCarried * 100) / 100,
          changes,
        })
      );

      return {
        promoted,
        graduated,
        unchanged,
        totalArrearsCarried: Math.round(totalArrearsCarried * 100) / 100,
        changes,
      };
    })();

    res.json({
      success: true,
      previousYear: currentSchoolYear,
      newYear: nextSY,
      summary: {
        promoted: result.promoted,
        graduated: result.graduated,
        unchanged: result.unchanged,
        totalArrearsCarried: result.totalArrearsCarried,
      },
      changes: result.changes,
    });
  } catch (err) {
    console.error('[eoy/execute]', err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// POST /api/admin/revert-end-of-school-year
//
// Restore every student to their pre-EOY state from the snapshot's `data`
// JSON. Unlocks the year, resets current_school_year, writes an audit
// entry. Does NOT delete the snapshot (kept for historical auditing).
// -----------------------------------------------------------------------------
router.post('/revert-end-of-school-year', (req, res) => {
  try {
    const { schoolYear, confirm } = req.body || {};
    if (!schoolYear) return res.status(400).json({ error: 'schoolYear is required' });
    if (confirm !== `REVERT ${schoolYear}`) {
      return res.status(400).json({
        error: `You must type "REVERT ${schoolYear}" to confirm.`,
      });
    }

    if (!isYearLocked(schoolYear)) {
      return res.status(400).json({
        error: `S.Y. ${schoolYear} is not locked. Nothing to revert.`,
      });
    }

    const snapshots = db.prepare(
      `SELECT student_id, data FROM year_end_snapshots WHERE school_year = ? AND data IS NOT NULL`
    ).all(schoolYear);
    if (snapshots.length === 0) {
      return res.status(400).json({
        error: `No snapshot data found for S.Y. ${schoolYear}. Cannot revert.`,
      });
    }

    // Warn (but don't block) if new-year data already exists
    const newYearStr = nextSchoolYear(schoolYear);
    const newYearActivity = {
      obligations: db.prepare(
        `SELECT COUNT(*) as c FROM obligations WHERE school_year = ?`
      ).get(newYearStr).c,
      payments: db.prepare(
        `SELECT COUNT(*) as c FROM payments WHERE school_year = ?`
      ).get(newYearStr).c,
    };

    const performedBy = req.user?.username || 'unknown';
    const revertedChanges = [];

    const result = db.transaction(() => {
      const updateStmt = db.prepare(`
        UPDATE students SET status = ?, grade_level = ?, section = ?, payment_term = ?,
          total_tuition = ?, school_year = ?, updated_at = datetime('now','localtime')
        WHERE student_id = ?
      `);

      for (const snap of snapshots) {
        let s;
        try { s = JSON.parse(snap.data); } catch { continue; }
        if (!s || !s.student_id) continue;

        // Read the current live row to log the before/after
        const current = db.prepare('SELECT status, grade_level, section FROM students WHERE student_id = ?').get(snap.student_id);
        if (!current) continue;

        updateStmt.run(
          s.status,
          s.grade_level,
          s.section ?? null,
          s.payment_term ?? null,
          s.total_tuition ?? 0,
          s.school_year ?? schoolYear,
          snap.student_id
        );

        revertedChanges.push({
          studentId: snap.student_id,
          name: `${s.last_name}, ${s.first_name}`,
          from: { status: current.status, grade: current.grade_level, section: current.section },
          to: { status: s.status, grade: s.grade_level, section: s.section ?? null },
        });
      }

      // Unlock
      const lockedRow = db.prepare(
        "SELECT value FROM school_settings WHERE key = 'locked_school_years'"
      ).get();
      let locked = [];
      try { locked = lockedRow ? JSON.parse(lockedRow.value) : []; } catch { locked = []; }
      const newLocked = locked.filter(y => y !== schoolYear);
      setSchoolSetting('locked_school_years', JSON.stringify(newLocked));

      // Reset current
      setSchoolSetting('current_school_year', schoolYear);

      // Audit
      db.prepare(`
        INSERT INTO audit_log (action, performed_by, school_year, details)
        VALUES (?, ?, ?, ?)
      `).run(
        'END_OF_SCHOOL_YEAR_REVERTED',
        performedBy,
        schoolYear,
        JSON.stringify({
          schoolYear,
          restored: revertedChanges.length,
          newYearActivityAtRevert: newYearActivity,
          changes: revertedChanges,
        })
      );
    })();

    res.json({
      success: true,
      schoolYear,
      currentSchoolYear: schoolYear,
      restored: revertedChanges.length,
      newYearActivityAtRevert: newYearActivity,
      changes: revertedChanges,
    });
  } catch (err) {
    console.error('[eoy/revert]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
