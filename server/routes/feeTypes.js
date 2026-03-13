const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/fee-types
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM fee_types ORDER BY sort_order, name').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fee-types
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { next } = db.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM fee_types"
    ).get();

    const result = db.prepare(
      'INSERT INTO fee_types (name, is_system, sort_order) VALUES (?, 0, ?)'
    ).run(name.trim(), next);

    const created = db.prepare('SELECT * FROM fee_types WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Fee type already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/fee-types/:id
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const feeType = db.prepare('SELECT * FROM fee_types WHERE id = ?').get(id);
    if (!feeType) {
      return res.status(404).json({ error: 'Fee type not found' });
    }
    if (feeType.is_system === 1) {
      return res.status(403).json({ error: 'Cannot rename system fee type' });
    }

    db.prepare('UPDATE fee_types SET name = ? WHERE id = ?').run(name.trim(), id);
    const updated = db.prepare('SELECT * FROM fee_types WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Fee type already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/fee-types/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const feeType = db.prepare('SELECT * FROM fee_types WHERE id = ?').get(id);
    if (!feeType) {
      return res.status(404).json({ error: 'Fee type not found' });
    }
    if (feeType.is_system === 1) {
      return res.status(403).json({ error: 'Cannot delete system fee type' });
    }

    const { count } = db.prepare(
      'SELECT COUNT(*) as count FROM obligations WHERE fee_type = ?'
    ).get(feeType.name);

    if (count > 0) {
      return res.status(409).json({ error: `Cannot delete: fee type is used by ${count} obligation(s)` });
    }

    db.prepare('DELETE FROM fee_types WHERE id = ?').run(id);
    res.json({ message: 'Fee type deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
