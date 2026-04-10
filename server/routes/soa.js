const express = require('express');
const router = express.Router();
const db = require('../db');

function buildSOA(studentId, schoolYear) {
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) return null;

  // Obligations: filter to the requested school year (these are fees assessed
  // for THIS year). Arrears from prior years are shown in their own section.
  let obligationSql = `SELECT * FROM obligations WHERE student_id = ?`;
  const oParams = [studentId];
  if (schoolYear) {
    obligationSql += ` AND school_year = ?`;
    oParams.push(schoolYear);
  }
  obligationSql += ` ORDER BY due_date ASC`;
  const obligations = db.prepare(obligationSql).all(...oParams);

  // Payments: show ALL payments for the student regardless of school_year label.
  // A payment is money received from the parent — it reduces the student's total
  // balance no matter what year it was tagged under. This matches how the Student
  // Profile calculates balance and fixes the recurring bug where payments and
  // obligations labeled with different school_years created phantom balances.
  const payments = db.prepare(
    `SELECT * FROM payments WHERE student_id = ? ORDER BY date ASC`
  ).all(studentId);

  const totalFees = obligations.reduce((sum, o) => sum + o.amount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  // Arrears = prior-year FEES ONLY. Do NOT subtract payments per-year here —
  // the Payment History table shows ALL payments, and the summary subtracts
  // ALL payments from (currentFees + priorYearFees) exactly once. Subtracting
  // payments per-year in this section + again in the summary would double-count
  // payments that happened to fall in a prior school year.
  //
  // We still skip the section entirely when the student is globally paid up,
  // so fully-settled students don't see a phantom "Previous Arrears" header.
  const allYearsFees = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE student_id = ?'
  ).get(studentId).total;
  const globallyPaidUp = totalPaid >= allYearsFees - 1;

  let arrears = [];
  let totalArrears = 0;
  if (schoolYear && !globallyPaidUp) {
    const prevYears = db.prepare(`
      SELECT DISTINCT school_year FROM obligations
      WHERE student_id = ? AND school_year < ?
      ORDER BY school_year ASC
    `).all(studentId, schoolYear);

    for (const py of prevYears) {
      const pyFees = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE student_id = ? AND school_year = ?`
      ).get(studentId, py.school_year).total;
      if (pyFees > 0) {
        arrears.push({ school_year: py.school_year, total_fees: pyFees });
        totalArrears += pyFees;
      }
    }
  }

  // totalObligations = current-year fees + raw prior-year fees
  // remainingBalance  = totalObligations - ALL payments (applied ONCE, here)
  const totalObligations = totalFees + totalArrears;
  const rawRemaining = totalObligations - totalPaid;
  // Apply rounding fix: balances between -1 and 1 are treated as 0
  const remainingBalance = Math.abs(rawRemaining) < 1 ? 0 : rawRemaining;

  // Status must match the remaining balance shown on the SOA.
  let status;
  if (totalFees === 0 && totalArrears === 0) {
    status = 'NO OUTSTANDING BALANCE';
  } else if (remainingBalance <= 0) {
    status = 'FULLY PAID';
  } else if (totalPaid > 0) {
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
    payments,
    arrears,
    totals: {
      totalFees,
      totalPaid,
      balance: remainingBalance,
      status,
      arrears: totalArrears,
      currentFees: totalFees,
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

    const studentsWithBalance = db.prepare(`
      SELECT s.student_id
      FROM students s
      LEFT JOIN (
        SELECT student_id, SUM(amount) as total_fees FROM obligations GROUP BY student_id
      ) o_sum ON o_sum.student_id = s.student_id
      LEFT JOIN (
        SELECT student_id, SUM(amount) as total_paid FROM payments GROUP BY student_id
      ) p_sum ON p_sum.student_id = s.student_id
      WHERE COALESCE(o_sum.total_fees, 0) - COALESCE(p_sum.total_paid, 0) > 1
      ORDER BY s.last_name, s.first_name
    `).all();

    const results = [];
    for (const { student_id } of studentsWithBalance) {
      const soa = buildSOA(student_id, school_year);
      if (soa && soa.totals.remainingBalance > 0) {
        results.push(soa);
      }
    }

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
