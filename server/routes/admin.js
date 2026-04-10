const express = require('express');
const router = express.Router();
const db = require('../db');

// Audit log endpoint (read-only) + a one-shot cleanup endpoint used to
// wipe artifacts left behind by the now-removed End-of-Year rollover
// feature. The EOY feature was deleted entirely — see the commit that
// removed it. If a future release re-introduces end-of-year, do it with
// a dry-run preview, automatic DB backup, and precise per-student
// restore data in the audit log.

function setSchoolSetting(key, value) {
  db.prepare(`INSERT INTO school_settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

// POST /api/admin/cleanup-eoy-artifacts
// One-shot cleanup used to scrub EOY leftovers from a DB that was
// affected by the old feature. Idempotent. Requires Admin role and
// an explicit { confirm: "CONFIRM" } body.
//
// Operations (all in one transaction):
//   1. school_settings.current_school_year = requested schoolYear
//      (or left unchanged if not provided)
//   2. school_settings.locked_school_years = "[]"  (unlock everything)
//   3. DELETE FROM year_end_snapshots
//   4. DELETE FROM audit_log  (full wipe — the user asked for a clean slate)
//
// The endpoint itself writes NO audit log entry — the whole point is
// to leave the log empty. Callers should record the operation in their
// own runbook if traceability matters.
router.post('/cleanup-eoy-artifacts', (req, res) => {
  try {
    const { confirm, schoolYear } = req.body || {};
    if (confirm !== 'CONFIRM') {
      return res.status(400).json({ error: 'You must type CONFIRM to proceed' });
    }

    const result = db.transaction(() => {
      let setCurrent = null;
      if (schoolYear) {
        setSchoolSetting('current_school_year', schoolYear);
        setCurrent = schoolYear;
      }
      setSchoolSetting('locked_school_years', '[]');
      const snapshots = db.prepare('DELETE FROM year_end_snapshots').run().changes;
      const audits = db.prepare('DELETE FROM audit_log').run().changes;
      return { setCurrent, snapshots, audits };
    })();

    res.json({
      success: true,
      currentSchoolYear: result.setCurrent,
      lockedSchoolYears: [],
      snapshotsDeleted: result.snapshots,
      auditsDeleted: result.audits,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/audit-log
router.get('/audit-log', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, action, performed_by, school_year, details, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    const parsed = rows.map(r => {
      let details = null;
      try { details = r.details ? JSON.parse(r.details) : null; } catch { details = r.details; }
      return { ...r, details };
    });
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
