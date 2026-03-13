const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../middleware/role');

const GRADE_ORDER = `CASE grade_level
  WHEN 'ALL' THEN 0
  WHEN 'Nursery 1' THEN 1
  WHEN 'Nursery 2' THEN 2
  WHEN 'Kinder' THEN 3
  WHEN 'Grade 1' THEN 4
  WHEN 'Grade 2' THEN 5
  WHEN 'Grade 3' THEN 6
  WHEN 'Grade 4' THEN 7
  WHEN 'Grade 5' THEN 8
  WHEN 'Grade 6' THEN 9
END`;

// GET /api/default-fees?school_year=2024-2025
router.get('/', (req, res) => {
  try {
    const { school_year } = req.query;
    if (!school_year) {
      return res.status(400).json({ error: 'school_year is required' });
    }
    const rows = db.prepare(
      `SELECT * FROM default_fees WHERE school_year = ? ORDER BY ${GRADE_ORDER}, fee_type`
    ).all(school_year);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/default-fees
router.post('/', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const { grade_level, school_year, fee_type, amount, description } = req.body;
    if (!grade_level || !school_year || !fee_type || amount == null) {
      return res.status(400).json({ error: 'grade_level, school_year, fee_type, and amount are required' });
    }
    db.prepare(
      `INSERT INTO default_fees (grade_level, school_year, fee_type, amount, description) VALUES (?, ?, ?, ?, ?)`
    ).run(grade_level, school_year, fee_type, amount, description || null);

    res.status(201).json({ message: 'Default fee created' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'This fee type already exists for this grade level and school year' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/default-fees/:id
router.put('/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM default_fees WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Default fee not found' });

    const { grade_level, fee_type, amount, description } = req.body;
    db.prepare(
      `UPDATE default_fees SET grade_level = ?, fee_type = ?, amount = ?, description = ? WHERE id = ?`
    ).run(
      grade_level || existing.grade_level,
      fee_type || existing.fee_type,
      amount != null ? amount : existing.amount,
      description !== undefined ? description : existing.description,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM default_fees WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'This fee type already exists for this grade level and school year' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/default-fees/:id
router.delete('/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM default_fees WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Default fee not found' });

    db.prepare('DELETE FROM default_fees WHERE id = ?').run(req.params.id);
    res.json({ message: 'Default fee deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
