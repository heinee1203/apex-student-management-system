import { useState, useEffect, useMemo } from 'react';
import { api } from './api';
import { getCurrentSchoolYear } from './schoolYear';
import { useAuth } from '../context/AuthContext';

// School-year context hook used by every page that filters by SY.
//
// Fetches { years, current, locked, showDropdown } from the backend
// and exposes:
//
//   selectedSY      — state, seeded with the DB's current_school_year
//                     (never a date-computed guess)
//   setSelectedSY   — state setter for the <select> onChange
//   availableYears  — string[] for the dropdown options
//                     (empty for non-Admin, who get the current year only)
//   current         — authoritative current school year
//   lockedYears     — string[] of years the admin has closed via EOY
//   isLocked        — true when selectedSY is in lockedYears; pages
//                     should show read-only banners and hide write
//                     buttons when this is true
//   showDropdown    — true only for Admin users. Non-admins don't see
//                     the SY dropdown at all — they're hard-locked to
//                     the current year.
//   loading         — true until the first fetch resolves
//
// Fallback: if the endpoint is unreachable, seed with the date-computed
// current SY so the UI still renders offline.
export function useSchoolYear() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('Admin');

  const [selectedSY, setSelectedSY] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [current, setCurrent] = useState(null);
  const [lockedYears, setLockedYears] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getDashboardSchoolYears()
      .then(res => {
        if (cancelled) return;
        // Backward-compat: older deploys might still return a bare array
        const years = Array.isArray(res) ? res : res.years || [];
        const curr = Array.isArray(res) ? years[0] : res.current;
        const locked = Array.isArray(res) ? [] : (res.locked || []);
        const showDd = Array.isArray(res) ? true : !!res.showDropdown;

        setAvailableYears(years);
        setCurrent(curr);
        setLockedYears(locked);
        // Non-admin users never get a dropdown, server already collapsed
        // their years to [current]; we force showDropdown false too.
        setShowDropdown(showDd && isAdmin);
        setSelectedSY(curr || getCurrentSchoolYear());
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedSY(getCurrentSchoolYear());
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const isLocked = useMemo(
    () => !!(selectedSY && lockedYears.includes(selectedSY)),
    [selectedSY, lockedYears]
  );

  return {
    selectedSY,
    setSelectedSY,
    availableYears,
    current,
    lockedYears,
    isLocked,
    showDropdown,
    loading,
  };
}
