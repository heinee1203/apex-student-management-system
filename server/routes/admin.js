const express = require('express');
const router = express.Router();
const db = require('../db');

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

function computeArrearsForStudent(studentId, schoolYear) {
  const fees = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE student_id = ? AND school_year = ?`).get(studentId, schoolYear).total;
  const paid = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE student_id = ? AND school_year = ?`).get(studentId, schoolYear).total;
  return { totalFees: fees, totalPaid: paid, balance: fees - paid };
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

    // Find all students with obligations in current year and compute their balance
    const studentsWithObligations = db.prepare(`
      SELECT DISTINCT s.student_id, s.first_name, s.last_name, s.grade_level
      FROM students s
      INNER JOIN obligations o ON o.student_id = s.student_id
      WHERE o.school_year = ?
      ORDER BY s.last_name, s.first_name
    `).all(currentSchoolYear);

    const arrearsStudents = [];
    let arrearsTotal = 0;
    for (const s of studentsWithObligations) {
      const { balance } = computeArrearsForStudent(s.student_id, currentSchoolYear);
      if (balance > 0) {
        arrearsStudents.push({
          student_id: s.student_id,
          name: `${s.last_name}, ${s.first_name}`,
          grade_level: s.grade_level,
          balance,
        });
        arrearsTotal += balance;
      }
    }
    arrearsStudents.sort((a, b) => b.balance - a.balance);

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
      // 1. Snapshot arrears for every student with obligations in current year
      const withObligations = db.prepare(`
        SELECT DISTINCT student_id FROM obligations WHERE school_year = ?
      `).all(currentSchoolYear);

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

      let arrearsSnapshotted = 0;
      let arrearsTotal = 0;
      for (const { student_id } of withObligations) {
        const { totalFees, totalPaid, balance } = computeArrearsForStudent(student_id, currentSchoolYear);
        const arrears = Math.max(0, balance);
        snapshotStmt.run(student_id, currentSchoolYear, totalFees, totalPaid, arrears, snapshotDate, performedBy);
        if (arrears > 0) {
          arrearsSnapshotted++;
          arrearsTotal += arrears;
        }
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
