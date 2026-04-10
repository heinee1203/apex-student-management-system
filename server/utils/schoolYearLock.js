const db = require('../db');

function getLockedYears() {
  const row = db.prepare("SELECT value FROM school_settings WHERE key = 'locked_school_years'").get();
  if (!row || !row.value) return [];
  try { return JSON.parse(row.value); } catch { return []; }
}

function isYearLocked(schoolYear) {
  if (!schoolYear) return false;
  return getLockedYears().includes(schoolYear);
}

function assertCanModifyYear(req, schoolYear) {
  if (!isYearLocked(schoolYear)) return null;
  if (req.user && req.user.role === 'Admin') return null;
  return `S.Y. ${schoolYear} is closed. Only Admin can modify records from a closed year.`;
}

module.exports = { getLockedYears, isYearLocked, assertCanModifyYear };
