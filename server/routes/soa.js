const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStudentBalance, getStudentsWithBalance } = require('../utils/studentBalance');

function buildSOA(studentId, schoolYear) {
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) return null;

  // === Current school year figures (for display) ===
  const obligations = db.prepare(
    `SELECT * FROM obligations WHERE student_id = ?${schoolYear ? ' AND school_year = ?' : ''} ORDER BY due_date ASC`
  ).all(...(schoolYear ? [studentId, schoolYear] : [studentId]));

  // Payment History table shows ALL payments regardless of school_year label.
  // A payment is money received from the parent — it reduces the student's
  // total balance regardless of which year column it was tagged with. This
  // is the only way the summary arithmetic ties out for students whose
  // payments happened to be labeled against a neighboring year.
  const allPayments = db.prepare(
    `SELECT * FROM payments WHERE student_id = ? ORDER BY date ASC`
  ).all(studentId);

  const currentFees = obligations.reduce((sum, o) => sum + o.amount, 0);
  const currentYearPaid = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE student_id = ?${schoolYear ? ' AND school_year = ?' : ''}`
  ).get(...(schoolYear ? [studentId, schoolYear] : [studentId])).t;

  // === Global (authoritative) totals — the source of truth ===
  const { totalFees: globalFees, totalPaid: globalPaid, balance: remainingBalance } =
    getStudentBalance(db, studentId);

  // === Prior-year arrears (informational) ===
  // Shown for transparency so the parent can see which past years were
  // underpaid. Capped at the global remaining balance so the per-year
  // breakdown never implies the student owes more than their actual total.
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
    // Cap the displayed arrears total at the global remaining balance so
    // a cross-year-labeled payment doesn't produce a higher "arrears"
    // number than the actual amount the student owes.
    if (totalArrears > remainingBalance) {
      totalArrears = remainingBalance;
    }
  }

  // === Status ===
  // Driven entirely by the authoritative remaining balance so the
  // printout status matches the Dashboard / Students list / Reports.
  let status;
  if (globalFees === 0) {
    status = 'NO OUTSTANDING BALANCE';
  } else if (remainingBalance === 0) {
    status = 'FULLY PAID';
  } else if (globalPaid > 0) {
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
    // Payment History table shows ALL payments so the "Total Paid" total
    // ties out against the authoritative global balance.
    payments: allPayments,
    allPayments,
    arrears,
    totals: {
      totalFees: globalFees,     // authoritative total fees across all years
      totalPaid: globalPaid,     // authoritative total paid across all years
      balance: remainingBalance, // globally-floored, matches Dashboard
      status,
      arrears: totalArrears,
      currentFees,
      currentPaid: currentYearPaid,
      totalObligations: globalFees,
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
