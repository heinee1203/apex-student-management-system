const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStudentsWithBalance } = require('../utils/studentBalance');

function buildSOA(studentId, schoolYear) {
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) return null;

  // === Current school year figures ===
  // Obligations for THIS year are what the student was billed for during sy.
  // Payments for THIS year are what's applied toward those bills.
  const obligations = db.prepare(
    `SELECT * FROM obligations WHERE student_id = ?${schoolYear ? ' AND school_year = ?' : ''} ORDER BY due_date ASC`
  ).all(...(schoolYear ? [studentId, schoolYear] : [studentId]));

  const currentYearPayments = db.prepare(
    `SELECT * FROM payments WHERE student_id = ?${schoolYear ? ' AND school_year = ?' : ''} ORDER BY date ASC`
  ).all(...(schoolYear ? [studentId, schoolYear] : [studentId]));

  // Full payment history (all years) — kept for transparency in the printout.
  const allPayments = db.prepare(
    `SELECT * FROM payments WHERE student_id = ? ORDER BY date ASC`
  ).all(studentId);

  const currentFees = obligations.reduce((sum, o) => sum + o.amount, 0);
  const currentPaid = currentYearPayments.reduce((sum, p) => sum + p.amount, 0);

  // === Prior-year arrears, per-year floored (spec rule) ===
  // For each prior school year, arrears_y = max(0, fees_y - paid_y). A year
  // that was overpaid contributes 0 — the school absorbs the credit instead
  // of carrying it forward. A year that was underpaid surfaces in its own
  // row so the parent sees exactly which year is outstanding.
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

  // === Summary ===
  // totalObligations = this year's fees + net prior-year arrears
  // remainingBalance = totalObligations − this year's payments
  // (Prior-year payments are already netted inside the arrears lines.)
  const totalObligations = currentFees + totalArrears;
  const rawRemaining = totalObligations - currentPaid;
  let remainingBalance = Math.abs(rawRemaining) < 1 ? 0 : rawRemaining;
  // Floor at zero — overpaid current year never shows as a negative balance.
  if (remainingBalance < 0) remainingBalance = 0;

  // Status must match the remaining balance shown on the SOA.
  let status;
  if (currentFees === 0 && totalArrears === 0) {
    status = 'NO OUTSTANDING BALANCE';
  } else if (remainingBalance === 0) {
    status = 'FULLY PAID';
  } else if (currentPaid > 0) {
    status = 'PARTIAL';
  } else {
    status = 'UNPAID';
  }

  // Keep `payments` field populated with current-year payments so the printout
  // "PAYMENTS APPLIED THIS YEAR" table ties out to the summary. `allPayments`
  // is returned separately for views that want full transparency.
  const totalFees = currentFees;
  const totalPaid = currentPaid;
  const payments = currentYearPayments;

  const settings = db.prepare('SELECT key, value FROM school_settings').all();
  const schoolInfo = {};
  settings.forEach(s => { schoolInfo[s.key] = s.value; });

  return {
    student,
    obligations,
    payments,          // current-year only — ties out to summary math
    allPayments,       // full history for transparency
    arrears,
    totals: {
      totalFees,       // alias for currentFees
      totalPaid,       // alias for currentPaid (this year only)
      balance: remainingBalance,
      status,
      arrears: totalArrears,
      currentFees,
      currentPaid,
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
