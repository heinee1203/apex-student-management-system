const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard/stats
router.get('/stats', (req, res) => {
  try {
    const totalStudents = db.prepare(`SELECT COUNT(*) as count FROM students WHERE status = 'Enrolled'`).get().count;
    const totalFees = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations`).get().total;
    const totalCollected = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments`).get().total;
    const outstanding = totalFees - totalCollected;
    const collectionRate = totalFees > 0 ? ((totalCollected / totalFees) * 100) : 0;

    // Fully paid students: total paid >= total fees and total fees > 0
    const fullyPaid = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT s.student_id,
          COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) as fees,
          COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0) as paid
        FROM students s WHERE s.status = 'Enrolled'
      ) WHERE paid >= fees AND fees > 0
    `).get().count;

    res.json({ totalStudents, totalFees, totalCollected, outstanding, collectionRate: Math.round(collectionRate * 100) / 100, fullyPaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/recent-payments
router.get('/recent-payments', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const payments = db.prepare(`
      SELECT p.*, s.first_name, s.last_name
      FROM payments p
      JOIN students s ON p.student_id = s.student_id
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT ?
    `).all(limit);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/balance-list
router.get('/balance-list', (req, res) => {
  try {
    const students = db.prepare(`
      SELECT s.student_id, s.first_name, s.last_name, s.grade_level, s.section,
        COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) as total_fees,
        COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0) as total_paid
      FROM students s
      WHERE s.status = 'Enrolled'
      AND COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) >
          COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0)
      ORDER BY (COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) -
                COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0)) DESC
    `).all();

    const result = students.map(s => ({ ...s, balance: s.total_fees - s.total_paid }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/fee-breakdown
router.get('/fee-breakdown', (req, res) => {
  try {
    const breakdown = db.prepare(`
      SELECT fee_type,
        SUM(amount) as total_assessed,
        COUNT(*) as count
      FROM obligations
      GROUP BY fee_type
      ORDER BY total_assessed DESC
    `).all();

    // Get total collected per fee type (approximate by proportional allocation)
    const totalFees = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM obligations`).get().total;
    const totalPaid = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM payments`).get().total;
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
