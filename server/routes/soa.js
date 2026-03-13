const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/soa/:studentId
router.get('/:studentId', (req, res) => {
  try {
    const { school_year } = req.query;

    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    let obligationSql = `SELECT * FROM obligations WHERE student_id = ?`;
    let paymentSql = `SELECT * FROM payments WHERE student_id = ?`;
    const oParams = [req.params.studentId];
    const pParams = [req.params.studentId];

    if (school_year) {
      obligationSql += ` AND school_year = ?`;
      paymentSql += ` AND school_year = ?`;
      oParams.push(school_year);
      pParams.push(school_year);
    }

    obligationSql += ` ORDER BY due_date ASC`;
    paymentSql += ` ORDER BY date ASC`;

    const obligations = db.prepare(obligationSql).all(...oParams);
    const payments = db.prepare(paymentSql).all(...pParams);

    const totalFees = obligations.reduce((sum, o) => sum + o.amount, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    // Calculate arrears from previous school years
    let arrears = [];
    let totalArrears = 0;
    if (school_year) {
      const prevYears = db.prepare(
        `SELECT DISTINCT school_year FROM obligations WHERE student_id = ? AND school_year < ? ORDER BY school_year ASC`
      ).all(req.params.studentId, school_year);

      for (const py of prevYears) {
        const pyFees = db.prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE student_id = ? AND school_year = ?`
        ).get(req.params.studentId, py.school_year).total;
        const pyPaid = db.prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE student_id = ? AND school_year = ?`
        ).get(req.params.studentId, py.school_year).total;
        const pyBalance = pyFees - pyPaid;
        if (pyBalance > 0) {
          arrears.push({ school_year: py.school_year, total_fees: pyFees, total_paid: pyPaid, balance: pyBalance });
          totalArrears += pyBalance;
        }
      }
    }

    const totalObligations = totalFees + totalArrears;
    const remainingBalance = totalObligations - totalPaid;

    let status = 'UNPAID';
    if (totalPaid >= totalObligations && totalObligations > 0) status = 'FULLY PAID';
    else if (totalPaid > 0) status = 'PARTIAL';

    // School info
    const settings = db.prepare('SELECT key, value FROM school_settings').all();
    const schoolInfo = {};
    settings.forEach(s => { schoolInfo[s.key] = s.value; });

    res.json({
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
      school_year: school_year || 'All'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
