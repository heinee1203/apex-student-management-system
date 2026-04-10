// Shared balance calculation used by students.js, dashboard.js, soa.js,
// reports.js, and admin.js. Every balance display in the system goes
// through these helpers so the numbers always agree.
//
// Balance rule (spec):
//   balance = max(0, Σ all fees − Σ all payments)
//
// - GLOBAL sum across all school years. Payments labeled to any year
//   reduce the student's total obligation. This matches what a parent
//   expects: "I paid ₱76k against ₱76k of fees — I'm paid up", regardless
//   of which school_year column a payment was tagged with. The earlier
//   per-year-floored rule produced phantom balances for every student
//   whose payments happened to be mislabeled across years.
// - Floored at 0. Overpayments are absorbed by the school and never
//   carry forward as a credit into later years.
// - Near-zero (|balance| < 1 peso) is treated as 0 to swallow installment
//   rounding residuals like ₱0.30.
//
// Year-view breakdown (for SOA / per-SY students list):
//   - currentFees / currentPaid: SUM for the requested school year only
//   - priorArrears:  sum of max(0, fees_y − paid_y) for all y < schoolYear,
//                    capped to the global balance so the per-year display
//                    never exceeds the global truth
//   - currentBalance: balance − priorArrears  (never negative)

const ROUND_TOLERANCE = 1; // pesos; |x| < 1 → 0

function normalize(raw) {
  if (Math.abs(raw) < ROUND_TOLERANCE) return 0;
  return raw;
}

// Global balance — the authoritative number. Sum all obligations, sum
// all payments, floor at 0, apply tolerance. Used by Dashboard stats,
// Students list, SOA summary, Reports, End-of-Year (historical).
//
// Returns { totalFees, totalPaid, balance }.
function getStudentBalance(db, studentId) {
  const totalFees = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as t FROM obligations WHERE student_id = ?`
  ).get(studentId).t;
  const totalPaid = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as t FROM payments WHERE student_id = ?`
  ).get(studentId).t;
  const raw = totalFees - totalPaid;
  const normalized = normalize(raw);
  const balance = Math.max(0, normalized); // floor: no negative balances
  return { totalFees, totalPaid, balance };
}

// Alias kept so existing callers (dashboard.js, students.js) don't break
// while we consolidate the name. They call it as a drop-in for the old
// per-year helper.
function getYearFlooredBalance(db, studentId) {
  return getStudentBalance(db, studentId);
}

// Year-context view used by Students list (when ?school_year= is set),
// Student detail, and SOA. Returns everything the UI needs for one row
// in one SY context.
//
// Key invariants:
//   - balance is ALWAYS the global truth (max(0, totalFees − totalPaid))
//   - priorArrears + currentBalance === balance
//   - priorArrears ≤ balance  (caller can trust the breakdown never
//     exceeds the authoritative total)
//
// studentRow is the row from the `students` table — pass it in to avoid
// re-SELECTing on hot paths.
function getStudentYearView(db, studentId, studentRow, schoolYear) {
  const { totalFees: globalFees, totalPaid: globalPaid, balance } =
    getStudentBalance(db, studentId);

  if (!schoolYear) {
    return {
      currentFees: globalFees,
      currentPaid: globalPaid,
      currentBalance: balance,
      priorArrears: 0,
      balance,
      status: studentRow ? studentRow.status : null,
      payStatus: derivePayStatusGlobal(db, studentId, globalFees, globalPaid, balance),
      hasCurrentYearRecord: true,
    };
  }

  const currentFees = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as t FROM obligations WHERE student_id = ? AND school_year = ?`
  ).get(studentId, schoolYear).t;
  const currentPaid = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) as t FROM payments WHERE student_id = ? AND school_year = ?`
  ).get(studentId, schoolYear).t;

  // Prior-year arrears: sum per-year floored (informational) then cap
  // at the global balance so the breakdown is internally consistent.
  const prevYears = db.prepare(`
    SELECT DISTINCT sy FROM (
      SELECT school_year as sy FROM obligations
        WHERE student_id = ? AND school_year IS NOT NULL AND school_year < ?
      UNION
      SELECT school_year as sy FROM payments
        WHERE student_id = ? AND school_year IS NOT NULL AND school_year < ?
    )
  `).all(studentId, schoolYear, studentId, schoolYear);

  let rawPriorArrears = 0;
  for (const { sy } of prevYears) {
    const f = db.prepare(
      `SELECT COALESCE(SUM(amount),0) as t FROM obligations WHERE student_id = ? AND school_year = ?`
    ).get(studentId, sy).t;
    const p = db.prepare(
      `SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE student_id = ? AND school_year = ?`
    ).get(studentId, sy).t;
    const pyNet = f - p;
    rawPriorArrears += Math.max(0, pyNet);
  }
  // Cap at global balance — can't owe more for prior years than the
  // student owes in total (handles the case where current year is
  // overpaid and absorbs some prior year debt).
  let priorArrears = Math.min(rawPriorArrears, balance);
  if (Math.abs(priorArrears) < ROUND_TOLERANCE) priorArrears = 0;

  const currentBalance = balance - priorArrears; // always ≥ 0 by construction

  const hasCurrentYearRecord =
    currentFees > 0 || (studentRow && studentRow.school_year === schoolYear);

  const rawStatus = studentRow ? studentRow.status : null;
  const status = hasCurrentYearRecord ? rawStatus : 'Not Enrolled';

  // Pay status derivation — STRICTLY about current-year fees. Students
  // with no current-year assessment render a BLANK badge regardless of
  // prior arrears (arrears are already visible in the Balance column).
  let payStatus = null;
  if (currentFees === 0) {
    payStatus = null;
  } else {
    if (currentBalance === 0) {
      payStatus = 'Paid';
    } else if (currentPaid > 0) {
      payStatus = 'Partial';
    } else {
      payStatus = 'Unpaid';
    }
    // Overdue: any past-due obligation in the CURRENT year
    const today = new Date().toISOString().slice(0, 10);
    const hasOverdue = db.prepare(
      `SELECT COUNT(*) as c FROM obligations
       WHERE student_id = ? AND school_year = ?
         AND due_date IS NOT NULL AND due_date < ?`
    ).get(studentId, schoolYear, today).c > 0;
    if (currentBalance > 0 && hasOverdue) payStatus = 'Overdue';
  }

  return {
    currentFees,
    currentPaid,
    currentBalance,
    priorArrears,
    balance,
    status,
    payStatus,
    hasCurrentYearRecord,
  };
}

// Derive pay status for the GLOBAL (all-years) view — used by the
// Students list when no school_year is provided.
function derivePayStatusGlobal(db, studentId, totalFees, totalPaid, balance) {
  if (totalFees === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const hasOverdue = db.prepare(
    `SELECT COUNT(*) as c FROM obligations
     WHERE student_id = ? AND due_date IS NOT NULL AND due_date < ?`
  ).get(studentId, today).c > 0;
  let payStatus;
  if (balance === 0) payStatus = 'Paid';
  else if (totalPaid > 0) payStatus = 'Partial';
  else payStatus = 'Unpaid';
  if (balance > 0 && hasOverdue) payStatus = 'Overdue';
  return payStatus;
}

// Legacy alias for call sites that pass pre-computed totals.
function getPayStatus(db, studentId, totalFees, totalPaid, balance) {
  return derivePayStatusGlobal(db, studentId, totalFees, totalPaid, balance);
}

// Single source of truth for "students who owe money" used by Dashboard
// /balance-list, Reports /receivables, /aging, etc. Global-floored rule
// — matches getStudentBalance, so every "who owes?" view agrees.
function getStudentsWithBalance(db) {
  const students = db.prepare(`
    SELECT student_id, first_name, last_name, middle_name,
           grade_level, section, status, school_year
    FROM students
    ORDER BY last_name, first_name
  `).all();

  const rows = [];
  for (const s of students) {
    const { totalFees, totalPaid, balance } = getStudentBalance(db, s.student_id);
    if (balance > 0) {
      rows.push({
        ...s,
        total_fees: totalFees,
        total_paid: totalPaid,
        balance,
      });
    }
  }
  rows.sort((a, b) => b.balance - a.balance);
  return rows;
}

module.exports = {
  getStudentBalance,
  getYearFlooredBalance, // alias, kept for backward compat
  getStudentYearView,
  getPayStatus,
  getStudentsWithBalance,
};
