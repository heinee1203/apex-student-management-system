const express = require('express');
const router = express.Router();
const db = require('../db');

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
router.get('/stats', (req, res) => {
  try {
    const sy = req.query.school_year;
    const syFilter = sy ? ' WHERE school_year = ?' : '';
    const syParams = sy ? [sy] : [];

    const totalStudents = sy
      ? db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled' AND school_year = ?`).get(sy).count
      : db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled'`).get().count;

    const totalFees = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations${syFilter}`).get(...syParams).total;
    const totalCollected = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments${syFilter}`).get(...syParams).total;
    const outstanding = totalFees - totalCollected;
    const collectionRate = totalFees > 0 ? ((totalCollected / totalFees) * 100) : 0;

    // Fully paid: any student (any status) whose payments >= obligations for the filter year.
    // Matches the Outstanding KPI which has no status filter.
    const sySubFilter = sy ? ' AND o.school_year = ?' : '';
    const sySubFilterP = sy ? ' AND p.school_year = ?' : '';
    const fullyPaid = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT s.student_id,
          COALESCE((SELECT SUM(o.amount) FROM obligations o WHERE o.student_id = s.student_id${sySubFilter}), 0) as fees,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.student_id${sySubFilterP}), 0) as paid
        FROM students s
      ) WHERE paid >= fees AND fees > 0
    `).get(...(sy ? [sy, sy] : [])).count;

    res.json({ totalStudents, totalFees, totalCollected, outstanding, collectionRate: Math.round(collectionRate * 100) / 100, fullyPaid });
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
// Returns ALL students with balance > 0 regardless of status. The Outstanding
// KPI is computed from total obligations - total payments with no status filter,
// so this list must match to stay consistent. Status is returned so the UI can
// badge Dropped/LOA/etc. students distinctly.
router.get('/balance-list', (req, res) => {
  try {
    const sy = req.query.school_year;
    const sySubFilter = sy ? ' AND o.school_year = ?' : '';
    const sySubFilterP = sy ? ' AND p.school_year = ?' : '';

    const students = db.prepare(`
      SELECT s.student_id, s.first_name, s.last_name, s.grade_level, s.section, s.status,
        COALESCE((SELECT SUM(o.amount) FROM obligations o WHERE o.student_id = s.student_id${sySubFilter}), 0) as total_fees,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.student_id${sySubFilterP}), 0) as total_paid
      FROM students s
      WHERE COALESCE((SELECT SUM(o.amount) FROM obligations o WHERE o.student_id = s.student_id${sySubFilter}), 0) >
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.student_id${sySubFilterP}), 0)
      ORDER BY (COALESCE((SELECT SUM(o.amount) FROM obligations o WHERE o.student_id = s.student_id${sySubFilter}), 0) -
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = s.student_id${sySubFilterP}), 0)) DESC
    `).all(...(sy ? [sy, sy, sy, sy, sy, sy] : []));

    const result = students.map(s => ({ ...s, balance: s.total_fees - s.total_paid }));
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
