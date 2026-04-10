// School year utilities — one source of truth for the app.
//
// Philippine school year convention: runs from June of year N through
// March/April/May of year N+1. Formatted as "YYYY-YYYY+1", e.g. "2025-2026".

// Returns the currently-active school year based on today's date.
// If the current month is June or later, the current SY starts this year;
// otherwise we're still inside the SY that started last June.
export function getCurrentSchoolYear(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 6) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

// Returns the school year AFTER the given one (e.g. "2025-2026" → "2026-2027").
export function getNextSchoolYear(sy) {
  if (!sy || !/^\d{4}-\d{4}$/.test(sy)) return null;
  const [a, b] = sy.split('-').map(Number);
  return `${a + 1}-${b + 1}`;
}

// Returns the school year BEFORE the given one.
export function getPrevSchoolYear(sy) {
  if (!sy || !/^\d{4}-\d{4}$/.test(sy)) return null;
  const [a, b] = sy.split('-').map(Number);
  return `${a - 1}-${b - 1}`;
}

// Returns a sorted list of school years that should be available in
// dropdowns across the app: always includes the current + next (so staff
// can set up enrollment for the upcoming year), always includes the
// previous year (for viewing history), plus any extras passed in (e.g.
// years fetched from the DB that may include older historical data).
//
// Starting in April of the current SY (≈ 2 months before the new SY
// begins), the next SY is added even if no data exists for it yet so
// registrars can pre-configure tuition, default fees, and obligations.
export function getAvailableSchoolYears(extras = [], now = new Date()) {
  const current = getCurrentSchoolYear(now);
  const next = getNextSchoolYear(current);
  const prev = getPrevSchoolYear(current);

  const set = new Set();
  if (prev) set.add(prev);
  set.add(current);
  // Make next year available from April onward (enrollment/setup window)
  if (next && now.getMonth() + 1 >= 4) set.add(next);
  for (const y of extras) if (y) set.add(y);

  return [...set].sort().reverse();
}
