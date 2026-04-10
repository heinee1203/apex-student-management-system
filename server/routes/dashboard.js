const express = require('express');
const router = express.Router();
const db = require('../db');
const { getYearFlooredBalance, getStudentYearView, getStudentsWithBalance } = require('../utils/studentBalance');

// GET /api/dashboard/school-years — school years available in dropdowns.
// Returns { years, current } where:
//   years    = union of: years that have data (obligations/payments/students)
//              + the date-computed current SY + next + prev (so registrars
//              can pre-configure tuition/fees for the upcoming year)
//   current  = the DB's school_settings.current_school_year — the
//              AUTHORITATIVE "active" school year that every page should
//              default their dropdown to. Falls back to the date-computed
//              value only if the setting is missing.
//
// The shape is { years, current } (not a bare array) so every page can
// initialize its SY state consistently and honor an admin rollback via
// End-of-Year revert.
router.get('/school-years', (req, res) => {
  try {
    // Date-computed SY for inclusion in the dropdown set
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const dateComputed = m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
    const [ca] = dateComputed.split('-').map(Number);
    const next = `${ca + 1}-${ca + 2}`;
    const prev = `${ca - 1}-${ca}`;

    // Authoritative current SY from the DB setting
    const row = db.prepare(
      `SELECT value FROM school_settings WHERE key = 'current_school_year'`
    ).get();
    const current = (row && row.value) || dateComputed;

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
    set.add(dateComputed);
    set.add(next);
    set.add(current); // ensure the DB current is always present

    const years = [...set].sort().reverse();
    res.json({ years, current });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/stats?school_year=2025-2026
// All figures respect the selected school year context:
//   totalStudents    — enrolled for this SY
//   totalFees        — obligations assessed in this SY
//   totalCollected   — payments tagged to this SY
//   currentOutstanding — Σ max(0, fees_y - paid_y) for THIS SY across all students
//   priorArrears     — Σ max(0, fees_y - paid_y) for all years < THIS SY
//   outstanding      — currentOutstanding + priorArrears (kept for backwards compat)
//   fullyPaid        — count of students who (a) are enrolled this SY,
//                      (b) had fees assessed, (c) have currentBalance === 0
//   collectionRate   — null when totalFees === 0 (shown as "—" in UI)
router.get('/stats', (req, res) => {
  try {
    const sy = req.query.school_year || null;

    const totalStudents = sy
      ? db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled' AND school_year = ?`).get(sy).count
      : db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled'`).get().count;

    const totalFees = sy
      ? db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE school_year = ?`).get(sy).total
      : db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations`).get().total;
    const totalCollected = sy
      ? db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE school_year = ?`).get(sy).total
      : db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments`).get().total;

    const allStudents = db.prepare(`SELECT * FROM students`).all();
    let currentOutstanding = 0;
    let priorArrears = 0;
    let fullyPaid = 0;

    if (sy) {
      // Per-SY view: split balance into current-year and prior-year buckets
      // and only count fullyPaid among students enrolled for THIS year with
      // fees actually assessed.
      for (const s of allStudents) {
        const view = getStudentYearView(db, s.student_id, s, sy);
        currentOutstanding += view.currentBalance;
        priorArrears += view.priorArrears;
        if (
          s.status === 'Enrolled' &&
          s.school_year === sy &&
          view.currentFees > 0 &&
          view.currentBalance === 0
        ) {
          fullyPaid++;
        }
      }
    } else {
      // Global view: currentOutstanding = full year-floored balance,
      // priorArrears = 0 (no year anchor to split against).
      for (const s of allStudents) {
        const { totalFees: f, balance } = getYearFlooredBalance(db, s.student_id);
        currentOutstanding += balance;
        if (balance === 0 && f > 0) fullyPaid++;
      }
    }

    const outstanding = currentOutstanding + priorArrears;
    const collectionRate = totalFees > 0 ? ((totalCollected / totalFees) * 100) : null;

    res.json({
      totalStudents,
      totalFees: Math.round(totalFees * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
      currentOutstanding: Math.round(currentOutstanding * 100) / 100,
      priorArrears: Math.round(priorArrears * 100) / 100,
      collectionRate: collectionRate === null ? null : Math.round(collectionRate * 100) / 100,
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
