const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStudentsWithBalance } = require('../utils/studentBalance');

// Build a Statement of Account for one student, scoped strictly to the
// requested school_year. The SOA is ALWAYS year-specific:
//
//   - Assessed Fees     = obligations WHERE school_year = sy
//   - Payments Applied  = payments    WHERE school_year = sy
//   - Previous Arrears  = per-year max(0, fees_y − paid_y) for y < sy,
//                         only rows where the per-year owed > 0
//   - Account Summary   = currentFees + totalArrears − currentYearPaid
//
// Previous-year fees and payments NEVER appear in the Assessed Fees or
// Payments Applied tables — they're only summarised in the Previous
// Arrears section, and only when the student actually has unpaid prior
// years. A fully-paid student viewing a fresh school year sees a clean
// slate (empty tables, ₱0 totals, NO OUTSTANDING BALANCE).
//
// Known limitation: students with cross-year-mislabeled payments (e.g.
// fees tagged 2025-2026 but some payments tagged 2024-2025) may show
// inconsistent per-year SOAs until the data is re-tagged. The strict-
// per-year approach is the user's chosen trade-off (vs. the older
// global-totals approach which was confusing for the no-arrears case).
function buildSOA(studentId, schoolYear) {
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) return null;

  // === Current school year obligations + payments (the visible tables) ===
  const obligations = db.prepare(
    `SELECT * FROM obligations WHERE student_id = ?${schoolYear ? ' AND school_year = ?' : ''} ORDER BY due_date ASC`
  ).all(...(schoolYear ? [studentId, schoolYear] : [studentId]));

  const currentYearPayments = db.prepare(
    `SELECT * FROM payments WHERE student_id = ?${schoolYear ? ' AND school_year = ?' : ''} ORDER BY date ASC`
  ).all(...(schoolYear ? [studentId, schoolYear] : [studentId]));

  const currentFees = obligations.reduce((sum, o) => sum + o.amount, 0);
  const currentYearPaid = currentYearPayments.reduce((sum, p) => sum + p.amount, 0);

  // === Prior-year arrears (Previous Arrears section) ===
  // Per-year netting. A year that was overpaid contributes 0 (the school
  // absorbs the credit). A year that was underpaid surfaces as one row.
  let arrears = [];
  let totalArrears = 0;
  if (schoolYear) {
    const prevYears = db.prepare(`
      SELECT DISTINCT sy FROM (
        SELECT school_year as sy FROM obligations
          WHERE student_id = ? AND school_year IS NOT NULL AND school_year < ?
        UNION
        SELECT school_year as sy FROM payments
          WHERE student_id = ? AND school_year IS NOT NULL AND school_year < ?
      )
      ORDER BY sy ASC
    `).all(studentId, schoolYear, studentId, schoolYear);

    for (const { sy } of prevYears) {
      const pyFees = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE student_id = ? AND school_year = ?`
      ).get(studentId, sy).total;
      const pyPaid = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE student_id = ? AND school_year = ?`
      ).get(studentId, sy).total;
      const raw = pyFees - pyPaid;
      const owed = Math.abs(raw) < 1 ? 0 : Math.max(0, raw);
      if (owed > 0) {
        arrears.push({
          school_year: sy,
          total_fees: pyFees,
          total_paid: pyPaid,
          balance: owed,
        });
        totalArrears += owed;
      }
    }
  }

  // === Account Summary totals — strictly per-year ===
  const totalObligations = currentFees + totalArrears;
  const rawRemaining = totalObligations - currentYearPaid;
  let remainingBalance = Math.abs(rawRemaining) < 1 ? 0 : Math.max(0, rawRemaining);

  // === Status — driven by the per-year remaining ===
  let status;
  if (totalObligations === 0) {
    status = 'NO OUTSTANDING BALANCE';
  } else if (remainingBalance === 0) {
    status = 'FULLY PAID';
  } else if (currentYearPaid > 0) {
    status = 'PARTIAL';
  } else {
    status = 'UNPAID';
  }

  const settings = db.prepare('SELECT key, value FROM school_settings').all();
  const schoolInfo = {};
  settings.forEach(s => { schoolInfo[s.key] = s.value; });

  return {
    student,
    obligations,
    payments: currentYearPayments, // current year only — strict scoping
    arrears,
    totals: {
      // totalFees / totalPaid are aliased to currentFees / currentYearPaid
      // for backward compat with the SOADocument's TOTAL row labels.
      totalFees: currentFees,
      totalPaid: currentYearPaid,
      balance: remainingBalance,
      status,
      arrears: totalArrears,
      currentFees,
      currentPaid: currentYearPaid,
      totalObligations,
      remainingBalance,
    },
    schoolInfo,
    payment_term: student.payment_term || 'N/A',
    school_year: schoolYear || 'All',
  };
}

// GET /api/soa/batch?school_year=2025-2026 — all students with balance > 0
// Finds every student whose total fees (all years) exceeds their total
// payments (all years), regardless of status or which school year their
// obligations were assessed in. Non-enrolled students with prior-year
// arrears (e.g. Pelausa, Calma) are included. Matches the same definition
// the dashboard /balance-list uses so both views agree on who owes money.
router.get('/batch', (req, res) => {
  try {
    const { school_year } = req.query;
    if (!school_year) return res.status(400).json({ error: 'school_year is required' });

    // Shared helper — same definition as Dashboard and End of Year preview
    const withBalance = getStudentsWithBalance(db);
    const results = [];
    for (const s of withBalance) {
      const soa = buildSOA(s.student_id, school_year);
      if (soa && soa.totals.remainingBalance > 0) {
        results.push(soa);
      }
    }
    // Sort by last name, first name for the print layout
    results.sort((a, b) => {
      const aName = `${a.student.last_name}, ${a.student.first_name}`;
      const bName = `${b.student.last_name}, ${b.student.first_name}`;
      return aName.localeCompare(bName);
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/soa/:studentId
router.get('/:studentId', (req, res) => {
  try {
    const { school_year } = req.query;
    const soa = buildSOA(req.params.studentId, school_year);
    if (!soa) return res.status(404).json({ error: 'Student not found' });
    res.json(soa);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
