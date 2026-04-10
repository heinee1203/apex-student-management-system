const express = require('express');
const router = express.Router();
const db = require('../db');

function buildSOA(studentId, schoolYear) {
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) return null;

  let obligationSql = `SELECT * FROM obligations WHERE student_id = ?`;
  let paymentSql = `SELECT * FROM payments WHERE student_id = ?`;
  const oParams = [studentId];
  const pParams = [studentId];

  if (schoolYear) {
    obligationSql += ` AND school_year = ?`;
    paymentSql += ` AND school_year = ?`;
    oParams.push(schoolYear);
    pParams.push(schoolYear);
  }

  obligationSql += ` ORDER BY due_date ASC`;
  paymentSql += ` ORDER BY date ASC`;

  const obligations = db.prepare(obligationSql).all(...oParams);
  const payments = db.prepare(paymentSql).all(...pParams);

  const totalFees = obligations.reduce((sum, o) => sum + o.amount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  // Calculate arrears from previous school years (prefer snapshots, fallback to calculation)
  let arrears = [];
  let totalArrears = 0;
  if (schoolYear) {
    const prevYears = db.prepare(`
      SELECT DISTINCT school_year FROM (
        SELECT school_year FROM obligations WHERE student_id = ? AND school_year < ?
        UNION
        SELECT school_year FROM year_end_snapshots WHERE student_id = ? AND school_year < ?
      ) ORDER BY school_year ASC
    `).all(studentId, schoolYear, studentId, schoolYear);

    for (const py of prevYears) {
      const snap = db.prepare(
        `SELECT * FROM year_end_snapshots WHERE student_id = ? AND school_year = ?`
      ).get(studentId, py.school_year);

      if (snap) {
        if (snap.arrears_amount > 0) {
          arrears.push({
            school_year: snap.school_year,
            total_fees: snap.total_fees,
            total_paid: snap.total_paid,
            balance: snap.arrears_amount,
          });
          totalArrears += snap.arrears_amount;
        }
      } else {
        const pyFees = db.prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE student_id = ? AND school_year = ?`
        ).get(studentId, py.school_year).total;
        const pyPaid = db.prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE student_id = ? AND school_year = ?`
        ).get(studentId, py.school_year).total;
        const pyBalance = pyFees - pyPaid;
        if (pyBalance > 0) {
          arrears.push({ school_year: py.school_year, total_fees: pyFees, total_paid: pyPaid, balance: pyBalance });
          totalArrears += pyBalance;
        }
      }
    }
  }

  const totalObligations = totalFees + totalArrears;
  const remainingBalance = totalObligations - totalPaid;

  let status = 'UNPAID';
  if (totalFees === 0 && totalArrears === 0) status = 'NO OUTSTANDING BALANCE';
  else if (remainingBalance <= 0 && totalObligations > 0) status = 'FULLY PAID';
  else if (totalPaid > 0 && remainingBalance > 0) status = 'PARTIAL';
  else if (totalPaid === 0 && totalObligations > 0) status = 'UNPAID';

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
router.get('/batch', (req, res) => {
  try {
    const { school_year } = req.query;
    if (!school_year) return res.status(400).json({ error: 'school_year is required' });

    // Find all students with obligations in this year
    const studentIds = db.prepare(`
      SELECT DISTINCT student_id FROM obligations WHERE school_year = ? ORDER BY student_id
    `).all(school_year);

    const results = [];
    for (const { student_id } of studentIds) {
      const soa = buildSOA(student_id, school_year);
      if (soa && soa.totals.remainingBalance > 0) {
        results.push(soa);
      }
    }

    // Sort by last name, first name
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
