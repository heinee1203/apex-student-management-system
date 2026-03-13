const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../middleware/role');

// GET /api/payments
router.get('/', (req, res) => {
  try {
    const { student_id, school_year } = req.query;
    let sql = `SELECT p.*, s.first_name, s.last_name, s.middle_name
      FROM payments p
      JOIN students s ON p.student_id = s.student_id
      WHERE 1=1`;
    const params = [];

    if (student_id) { sql += ` AND p.student_id = ?`; params.push(student_id); }
    if (school_year) { sql += ` AND p.school_year = ?`; params.push(school_year); }

    sql += ` ORDER BY p.date DESC`;
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/:id
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`SELECT p.*, s.first_name, s.last_name FROM payments p JOIN students s ON p.student_id = s.student_id WHERE p.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Payment not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments
router.post('/', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const { student_id, amount, date, method, receipt_no, school_year, notes } = req.body;
    if (!student_id || !amount || !date || !method) {
      return res.status(400).json({ error: 'student_id, amount, date, and method are required' });
    }

    const student = db.prepare('SELECT student_id FROM students WHERE student_id = ?').get(student_id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Auto-generate receipt number if not provided
    let receiptNo = receipt_no;
    if (!receiptNo) {
      const dateStr = date.replace(/-/g, '');
      const count = db.prepare(`SELECT COUNT(*) as count FROM payments WHERE receipt_no LIKE ?`).get(`RCT-${dateStr}-%`).count;
      receiptNo = `RCT-${dateStr}-${String(count + 1).padStart(3, '0')}`;
    }

    db.prepare(`
      INSERT INTO payments (id, student_id, amount, date, method, receipt_no, school_year, notes)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)
    `).run(student_id, amount, date, method, receiptNo, school_year || null, notes || null);

    const created = db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 1').get();
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/payments/:id
router.put('/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Payment not found' });

    const { student_id, amount, date, method, receipt_no, school_year, notes } = req.body;

    db.prepare(`
      UPDATE payments SET student_id = ?, amount = ?, date = ?, method = ?, receipt_no = ?, school_year = ?, notes = ?
      WHERE id = ?
    `).run(
      student_id || existing.student_id, amount ?? existing.amount, date || existing.date,
      method || existing.method, receipt_no ?? existing.receipt_no,
      school_year ?? existing.school_year,
      notes ?? existing.notes, req.params.id
    );

    res.json(db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/payments/:id
router.delete('/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Payment not found' });

    db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
