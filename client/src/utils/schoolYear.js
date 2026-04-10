// School year utilities.
//
// Philippine school year convention: runs from June of year N through
// March/April/May of year N+1. Formatted as "YYYY-YYYY+1", e.g. "2025-2026".
//
// All SY defaults and dropdown lists come from the backend
// (school_settings.current_school_year + the distinct years present in
// DB data). The client does NOT auto-generate future years — that
// prevents accidentally rolling into a year that hasn't actually
// started yet.

// Returns the currently-active school year based on today's date.
// Used only as a last-resort fallback when the backend is unreachable;
// pages should prefer the `current` value from /api/dashboard/school-years.
export function getCurrentSchoolYear(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 6) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}
