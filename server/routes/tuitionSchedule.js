const express = require('express');
const router = express.Router();
const db = require('../db');

const GRADE_ORDER = `CASE grade_level
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

// GET /api/tuition-schedule?school_year=2024-2025
router.get('/', (req, res) => {
  try {
    const { school_year } = req.query;
    if (!school_year) {
      return res.status(400).json({ error: 'school_year is required' });
    }
    const rows = db.prepare(
      `SELECT * FROM tuition_schedule WHERE school_year = ? ORDER BY ${GRADE_ORDER}`
    ).all(school_year);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tuition-schedule
router.put('/', (req, res) => {
  try {
    const { school_year, rates } = req.body;
    if (!school_year || !Array.isArray(rates)) {
      return res.status(400).json({ error: 'school_year and rates array are required' });
    }

    const stmt = db.prepare(
      `INSERT INTO tuition_schedule (grade_level, school_year, annual_rate, monthly_rate, quarterly_rate, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(grade_level, school_year) DO UPDATE SET
         annual_rate = excluded.annual_rate,
         monthly_rate = excluded.monthly_rate,
         quarterly_rate = excluded.quarterly_rate,
         updated_at = excluded.updated_at`
    );

    const upsertAll = db.transaction((rates) => {
      for (const { grade_level, annual_rate, monthly_rate, quarterly_rate } of rates) {
        stmt.run(grade_level, school_year, annual_rate || 0, monthly_rate || 0, quarterly_rate || 0);
      }
    });
    upsertAll(rates);

    const rows = db.prepare(
      `SELECT * FROM tuition_schedule WHERE school_year = ? ORDER BY ${GRADE_ORDER}`
    ).all(school_year);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tuition-schedule/school-years
router.get('/school-years', (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT DISTINCT school_year FROM tuition_schedule ORDER BY school_year DESC`
    ).all();
    res.json(rows.map(r => r.school_year));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tuition-schedule/copy
router.post('/copy', (req, res) => {
  try {
    const { from_school_year, to_school_year } = req.body;
    if (!from_school_year || !to_school_year) {
      return res.status(400).json({ error: 'from_school_year and to_school_year are required' });
    }
    if (from_school_year === to_school_year) {
      return res.status(400).json({ error: 'Source and target school years must be different' });
    }

    const existing = db.prepare(
      'SELECT COUNT(*) as count FROM tuition_schedule WHERE school_year = ?'
    ).get(to_school_year);
    if (existing.count > 0) {
      return res.status(409).json({ error: `Rates for ${to_school_year} already exist` });
    }

    const sourceRates = db.prepare(
      'SELECT grade_level, annual_rate, monthly_rate, quarterly_rate FROM tuition_schedule WHERE school_year = ?'
    ).all(from_school_year);

    if (sourceRates.length === 0) {
      return res.status(404).json({ error: `No rates found for ${from_school_year}` });
    }

    const stmt = db.prepare(
      `INSERT INTO tuition_schedule (grade_level, school_year, annual_rate, monthly_rate, quarterly_rate)
       VALUES (?, ?, ?, ?, ?)`
    );
    const copyAll = db.transaction((rates) => {
      for (const { grade_level, annual_rate, monthly_rate, quarterly_rate } of rates) {
        stmt.run(grade_level, to_school_year, annual_rate, monthly_rate, quarterly_rate);
      }
    });
    copyAll(sourceRates);

    res.json({ message: `Copied ${sourceRates.length} rates from ${from_school_year} to ${to_school_year}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tuition-schedule/rate?grade_level=Grade+3&school_year=2024-2025
router.get('/rate', (req, res) => {
  try {
    const { grade_level, school_year } = req.query;
    if (!grade_level || !school_year) {
      return res.status(400).json({ error: 'grade_level and school_year are required' });
    }
    const row = db.prepare(
      'SELECT annual_rate, monthly_rate, quarterly_rate FROM tuition_schedule WHERE grade_level = ? AND school_year = ?'
    ).get(grade_level, school_year);

    res.json({
      annual_rate: row ? row.annual_rate : null,
      monthly_rate: row ? row.monthly_rate : null,
      quarterly_rate: row ? row.quarterly_rate : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
