const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../middleware/role');

// GET /api/obligations
router.get('/', (req, res) => {
  try {
    const { student_id, school_year, payment_term } = req.query;
    let sql = `SELECT o.*, s.first_name, s.last_name, s.middle_name
      FROM obligations o
      JOIN students s ON o.student_id = s.student_id
      WHERE 1=1`;
    const params = [];

    if (student_id) { sql += ` AND o.student_id = ?`; params.push(student_id); }
    if (school_year) { sql += ` AND o.school_year = ?`; params.push(school_year); }
    if (payment_term) { sql += ` AND o.payment_term = ?`; params.push(payment_term); }

    sql += ` ORDER BY s.last_name, s.first_name, o.fee_type`;
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/obligations/bulk
router.post('/bulk', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const { grade_level, school_year, fee_type, amount, due_date, description } = req.body;
    if (!grade_level || !school_year || !fee_type || !amount) {
      return res.status(400).json({ error: 'grade_level, school_year, fee_type, and amount are required' });
    }

    const students = db.prepare(
      `SELECT student_id FROM students WHERE grade_level = ? AND school_year = ? AND status = 'Enrolled'`
    ).all(grade_level, school_year);

    if (students.length === 0) {
      return res.status(400).json({ error: `No enrolled students found for ${grade_level} in ${school_year}` });
    }

    const insertObl = db.prepare(`
      INSERT INTO obligations (id, student_id, fee_type, payment_term, installment_number, school_year, amount, due_date, description)
      VALUES (lower(hex(randomblob(16))), ?, ?, NULL, NULL, ?, ?, ?, ?)
    `);

    const bulkInsert = db.transaction(() => {
      for (const s of students) {
        insertObl.run(s.student_id, fee_type, school_year, amount, due_date || null, description || null);
      }
    });
    bulkInsert();

    res.status(201).json({ count: students.length, message: `Fee added to ${students.length} students` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/obligations/:id
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(`SELECT o.*, s.first_name, s.last_name FROM obligations o JOIN students s ON o.student_id = s.student_id WHERE o.id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Obligation not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/obligations
router.post('/', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const { student_id, fee_type, payment_term, installment_number, school_year, amount, due_date, description } = req.body;
    if (!student_id || !fee_type || !school_year || !amount) {
      return res.status(400).json({ error: 'student_id, fee_type, school_year, and amount are required' });
    }

    const student = db.prepare('SELECT student_id FROM students WHERE student_id = ?').get(student_id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const result = db.prepare(`
      INSERT INTO obligations (id, student_id, fee_type, payment_term, installment_number, school_year, amount, due_date, description)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(student_id, fee_type, payment_term || null, installment_number || null, school_year, amount, due_date || null, description || null);

    const created = db.prepare('SELECT * FROM obligations ORDER BY created_at DESC LIMIT 1').get();
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/obligations/:id
router.put('/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM obligations WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Obligation not found' });

    const { student_id, fee_type, payment_term, installment_number, school_year, amount, due_date, description } = req.body;

    db.prepare(`
      UPDATE obligations SET student_id = ?, fee_type = ?, payment_term = ?, installment_number = ?, school_year = ?, amount = ?, due_date = ?, description = ?
      WHERE id = ?
    `).run(
      student_id || existing.student_id, fee_type || existing.fee_type,
      payment_term ?? existing.payment_term, installment_number ?? existing.installment_number,
      school_year || existing.school_year,
      amount ?? existing.amount, due_date ?? existing.due_date,
      description ?? existing.description, req.params.id
    );

    res.json(db.prepare('SELECT * FROM obligations WHERE id = ?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/obligations/:id
router.delete('/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM obligations WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Obligation not found' });

    db.prepare('DELETE FROM obligations WHERE id = ?').run(req.params.id);
    res.json({ message: 'Obligation deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
