const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStudentBalance } = require('../utils/studentBalance');

// GET /api/dashboard/school-years — distinct school years for dropdown
router.get('/school-years', (req, res) => {
  try {
    const years = db.prepare(`
      SELECT DISTINCT school_year FROM (
        SELECT school_year FROM obligations
        UNION
        SELECT school_year FROM payments
        UNION
        SELECT school_year FROM students WHERE status = 'Enrolled'
      ) ORDER BY school_year DESC
    `).all();
    res.json(years.map(r => r.school_year).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/stats?school_year=2025-2026
// All per-student balance logic goes through getStudentBalance() so that the
// Outstanding KPI sum exactly equals the sum of the Students With Balance list
// and both apply the same rounding fix (|balance| < 1 → 0).
router.get('/stats', (req, res) => {
  try {
    const sy = req.query.school_year || null;

    const totalStudents = sy
      ? db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled' AND school_year = ?`).get(sy).count
      : db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled'`).get().count;

    // Find every student who has obligations or payments in the filtered year
    const studentIdRows = sy
      ? db.prepare(`
          SELECT DISTINCT student_id FROM (
            SELECT student_id FROM obligations WHERE school_year = ?
            UNION
            SELECT student_id FROM payments WHERE school_year = ?
          )
        `).all(sy, sy)
      : db.prepare(`SELECT student_id FROM students`).all();

    let totalFees = 0;
    let totalCollected = 0;
    let outstanding = 0;
    let fullyPaid = 0;
    for (const { student_id } of studentIdRows) {
      const { totalFees: f, totalPaid: p, balance } = getStudentBalance(db, student_id, sy);
      totalFees += f;
      totalCollected += p;
      if (balance > 0) outstanding += balance;
      if (balance <= 0 && f > 0) fullyPaid++;
    }

    const collectionRate = totalFees > 0 ? ((totalCollected / totalFees) * 100) : 0;

    res.json({
      totalStudents,
      totalFees: Math.round(totalFees * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      collectionRate: Math.round(collectionRate * 100) / 100,
      fullyPaid,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/recent-payments?school_year=2025-2026
router.get('/recent-payments', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const sy = req.query.school_year;
    const syFilter = sy ? ' WHERE p.school_year = ?' : '';
    const params = sy ? [sy, limit] : [limit];

    const payments = db.prepare(`
      SELECT p.*, s.first_name, s.last_name
      FROM payments p
      JOIN students s ON p.student_id = s.student_id
      ${syFilter}
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT ?
    `).all(...params);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/balance-list?school_year=2025-2026
// Returns all students with balance > 0 using the shared getStudentBalance helper
// so the sum of balances equals the Outstanding KPI exactly. The rounding fix
// (|balance| < 1 → 0) prevents -₱0.01 rounding artifacts from showing as balances.
router.get('/balance-list', (req, res) => {
  try {
    const sy = req.query.school_year || null;

    const students = db.prepare(`
      SELECT student_id, first_name, last_name, grade_level, section, status FROM students
    `).all();

    const result = [];
    for (const s of students) {
      const { totalFees, totalPaid, balance } = getStudentBalance(db, s.student_id, sy);
      if (balance > 0) {
        result.push({ ...s, total_fees: totalFees, total_paid: totalPaid, balance });
      }
    }
    result.sort((a, b) => b.balance - a.balance);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/fee-breakdown?school_year=2025-2026
router.get('/fee-breakdown', (req, res) => {
  try {
    const sy = req.query.school_year;
    const syFilter = sy ? ' WHERE school_year = ?' : '';
    const syParams = sy ? [sy] : [];

    const breakdown = db.prepare(`
      SELECT fee_type,
        SUM(amount) as total_assessed,
        COUNT(*) as count
      FROM obligations${syFilter}
      GROUP BY fee_type
      ORDER BY total_assessed DESC
    `).all(...syParams);

    const totalFees = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations${syFilter}`).get(...syParams).total;
    const totalPaid = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments${syFilter}`).get(...syParams).total;
    const overallRate = totalFees > 0 ? totalPaid / totalFees : 0;

    const result = breakdown.map(b => ({
      ...b,
      collected: Math.round(b.total_assessed * overallRate * 100) / 100,
      rate: Math.round(overallRate * 10000) / 100
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
