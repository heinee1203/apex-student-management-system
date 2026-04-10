const express = require('express');
const router = express.Router();
const db = require('../db');
const { getYearFlooredBalance, getStudentsWithBalance } = require('../utils/studentBalance');

// GET /api/dashboard/school-years — school years available in dropdowns.
// Returns the union of: years that have data (obligations/payments/students)
// AND the current school year AND the next school year (so registrars can
// pre-configure tuition/fees for the upcoming year starting in April).
router.get('/school-years', (req, res) => {
  try {
    // Compute current SY server-side (PH convention: June start)
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const current = m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
    const [ca] = current.split('-').map(Number);
    const next = `${ca + 1}-${ca + 2}`;
    const prev = `${ca - 1}-${ca}`;

    const rows = db.prepare(`
      SELECT DISTINCT school_year FROM (
        SELECT school_year FROM obligations
        UNION
        SELECT school_year FROM payments
        UNION
        SELECT school_year FROM students
      )
    `).all();

    const set = new Set(rows.map(r => r.school_year).filter(Boolean));
    set.add(prev);
    set.add(current);
    // Next year always shown from April onward, always shown anyway here
    // since setup can happen any time once the current year is underway.
    set.add(next);

    const years = [...set].sort().reverse();
    res.json(years);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/stats?school_year=2025-2026
// CRITICAL: balance math (Outstanding, Fully Paid, per-student balances) is
// computed ACROSS ALL YEARS so it matches the Student Profile exactly. The
// school_year parameter is IGNORED for balance calculations because payments
// may be labeled with a different school_year than the obligations they cover
// (e.g., a 2025-2026 tuition paid in advance during 2024-2025). Filtering by
// year would split payments from their obligations and produce phantom balances.
//
// Total Fees / Total Collected still respect the year filter — those answer
// "how much was assessed / collected in this school year?" which is a
// different question and can diverge from Outstanding.
router.get('/stats', (req, res) => {
  try {
    const sy = req.query.school_year || null;

    const totalStudents = sy
      ? db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled' AND school_year = ?`).get(sy).count
      : db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled'`).get().count;

    // "This year" fees and collected — respect school_year filter
    const totalFees = sy
      ? db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE school_year = ?`).get(sy).total
      : db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations`).get().total;
    const totalCollected = sy
      ? db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE school_year = ?`).get(sy).total
      : db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments`).get().total;

    // Outstanding and Fully Paid — computed per-year-floored across all years,
    // matching the spec: Σ max(0, fees_y - paid_y). Overpayments in one year
    // never offset underpayments in another year.
    // The per-year-floored balance can never be negative, so "fully paid" is
    // balance === 0 (with f > 0 to exclude students with no fees at all).
    const allStudents = db.prepare(`SELECT student_id FROM students`).all();
    let outstanding = 0;
    let fullyPaid = 0;
    for (const { student_id } of allStudents) {
      const { totalFees: f, balance } = getYearFlooredBalance(db, student_id);
      if (balance > 0) outstanding += balance;
      if (balance === 0 && f > 0) fullyPaid++;
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

// GET /api/dashboard/balance-list
// Returns students with TOTAL balance > 0 across all years via the shared
// helper — same data the End of Year preview and SOA /batch use, so all
// three views always agree on who owes money.
router.get('/balance-list', (req, res) => {
  try {
    res.json(getStudentsWithBalance(db));
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
