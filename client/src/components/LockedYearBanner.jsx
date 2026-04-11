// Read-only banner shown on any page when the currently-selected school
// year is in `locked_school_years`. Pages get `isLocked` from the
// useSchoolYear hook and conditionally render this at the top of their
// content. When a year is locked, pages should ALSO hide their action
// buttons (Add / Edit / Delete / Enroll / etc.) — the backend will
// return 403 anyway, but hiding them gives a cleaner UX.
export default function LockedYearBanner({ schoolYear }) {
  if (!schoolYear) return null;
  return (
    <div className="no-print bg-brand-light border-l-4 border-brand-steel rounded-lg p-3 mb-4 text-sm flex items-center gap-3">
      <span className="text-lg">🔒</span>
      <div>
        <strong className="text-brand-navy">School Year {schoolYear} is closed.</strong>
        <span className="text-brand-slate"> This view is read-only — no new enrollments, fees, or payments can be recorded for this year.</span>
      </div>
    </div>
  );
}
