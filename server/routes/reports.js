const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/reports/by-grade-level
router.get('/by-grade-level', (req, res) => {
  try {
    const { school_year } = req.query;

    let feeFilter = '';
    let payFilter = '';
    const feeParams = [];
    const payParams = [];

    if (school_year) {
      feeFilter += ` AND o.school_year = ?`; feeParams.push(school_year);
      payFilter += ` AND p.school_year = ?`; payParams.push(school_year);
    }

    const grades = db.prepare(`SELECT DISTINCT grade_level FROM students ORDER BY grade_level`).all();

    const result = grades.map(g => {
      const studentCount = db.prepare(`SELECT COUNT(*) as count FROM students WHERE grade_level = ? AND status = 'Enrolled'`).get(g.grade_level).count;
      const totalFees = db.prepare(`SELECT COALESCE(SUM(o.amount), 0) as total FROM obligations o JOIN students s ON o.student_id = s.student_id WHERE s.grade_level = ?${feeFilter}`).get(g.grade_level, ...feeParams).total;
      const collected = db.prepare(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN students s ON p.student_id = s.student_id WHERE s.grade_level = ?${payFilter}`).get(g.grade_level, ...payParams).total;
      const rate = totalFees > 0 ? Math.round((collected / totalFees) * 10000) / 100 : 0;

      return { grade_level: g.grade_level, student_count: studentCount, total_fees: totalFees, collected, rate };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/by-payment-method
router.get('/by-payment-method', (req, res) => {
  try {
    const { school_year } = req.query;
    let filter = '';
    const params = [];
    if (school_year) { filter += ` AND school_year = ?`; params.push(school_year); }

    const methods = db.prepare(`
      SELECT method, COUNT(*) as transaction_count, SUM(amount) as total_amount
      FROM payments WHERE 1=1 ${filter}
      GROUP BY method ORDER BY total_amount DESC
    `).all(...params);

    const grandTotal = methods.reduce((sum, m) => sum + m.total_amount, 0);
    const result = methods.map(m => ({
      ...m,
      share: grandTotal > 0 ? Math.round((m.total_amount / grandTotal) * 10000) / 100 : 0
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/scholarships
router.get('/scholarships', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT scholarship, COUNT(*) as student_count
      FROM students
      WHERE status = 'Enrolled'
      GROUP BY scholarship
      ORDER BY student_count DESC
    `).all();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/overdue
router.get('/overdue', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = db.prepare(`
      SELECT s.student_id, s.first_name, s.last_name, s.grade_level,
        COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) as total_fees,
        COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0) as total_paid,
        (SELECT COUNT(*) FROM obligations WHERE student_id = s.student_id AND due_date < ? AND due_date IS NOT NULL) as overdue_count
      FROM students s
      WHERE s.status = 'Enrolled'
      AND (SELECT COUNT(*) FROM obligations WHERE student_id = s.student_id AND due_date < ? AND due_date IS NOT NULL) > 0
      AND COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) >
          COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0)
      ORDER BY (COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) -
                COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0)) DESC
    `).all(today, today);

    const mapped = result.map(r => ({ ...r, balance: r.total_fees - r.total_paid }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
