const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM school_settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', (req, res) => {
  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO school_settings (key, value) VALUES (?, ?)');
    const updateAll = db.transaction((settings) => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, value);
      }
    });
    updateAll(req.body);

    const rows = db.prepare('SELECT key, value FROM school_settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
