import { useState, useEffect } from 'react';
import { api } from './api';
import { getCurrentSchoolYear } from './schoolYear';

// Fetches the authoritative { years, current } from the backend and
// exposes them as React state. `current` comes from the DB's
// school_settings.current_school_year so every page defaults to the
// same active year — including after an admin rolls back End-of-Year.
//
// Returns:
//   selectedSY       — state, seeded with DB current once loaded
//   setSelectedSY    — state setter for the dropdown onChange
//   availableYears   — string[] for the dropdown options
//   loading          — true until the first fetch resolves
//
// Fallback: if the endpoint is unreachable, seed with the date-computed
// current SY so the UI still works offline.
export function useSchoolYear() {
  const [selectedSY, setSelectedSY] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getDashboardSchoolYears()
      .then(res => {
        if (cancelled) return;
        const years = Array.isArray(res) ? res : res.years || [];
        const current = Array.isArray(res) ? (years[0] || getCurrentSchoolYear()) : res.current;
        setAvailableYears(years);
        setSelectedSY(current || getCurrentSchoolYear());
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedSY(getCurrentSchoolYear());
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { selectedSY, setSelectedSY, availableYears, loading };
}
