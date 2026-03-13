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
    const balance = totalFees - totalPaid;

    let status = 'UNPAID';
    if (totalPaid >= totalFees && totalFees > 0) status = 'FULLY PAID';
    else if (totalPaid > 0) status = 'PARTIAL';

    // School info
    const settings = db.prepare('SELECT key, value FROM school_settings').all();
    const schoolInfo = {};
    settings.forEach(s => { schoolInfo[s.key] = s.value; });

    res.json({
      student,
      obligations,
      payments,
      totals: { totalFees, totalPaid, balance, status },
      schoolInfo,
      payment_term: student.payment_term || 'N/A',
      school_year: school_year || 'All'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
