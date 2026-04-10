// Shared balance calculation used by students.js, dashboard.js, soa.js,
// reports.js, and admin.js. Every balance display in the system goes
// through these helpers so the numbers always agree.
//
// School year rollover rule (spec):
//   - Per-year accounting: for each SY, balance_y = max(0, fees_y - paid_y)
//   - Overpayments are absorbed by the school — never carry forward as a
//     credit into later years.
//   - Underpayments DO carry forward as "Previous Arrears".
//   - Global balance = Σ max(0, fees_y - paid_y)   (never negative)
//   - Per-year balances with |x| < 1 are treated as 0 (installment rounding
//     tolerance so ₱0.30 residuals don't show as arrears).
//
// A student row for a given SY can be in one of three shapes:
//   a) hasCurrentYearRecord=true  — student is enrolled / has fees for this
//      year; balance = currentYearBalance + priorArrears, status from the
//      students.status column.
//   b) hasCurrentYearRecord=false, priorArrears>0 — student has leftover
//      arrears from a past year but is not enrolled this year; status is
//      overridden to 'Not Enrolled', balance shows the arrears only.
//   c) hasCurrentYearRecord=false, priorArrears=0 — student has no record
//      for this year and nothing owed. Callers may hide these.

const ROUND_TOLERANCE = 1; // pesos; |x| < 1 → 0

function floorYear(fees, paid) {
  const raw = fees - paid;
  if (Math.abs(raw) < ROUND_TOLERANCE) return 0;
  return Math.max(0, raw);
}

// Global balance across all years, with each year floored at 0.
// Returns { totalFees, totalPaid, balance, perYear }
//   totalFees  = raw SUM(obligations) across all years
//   totalPaid  = raw SUM(payments) across all years
//   balance    = Σ max(0, fees_y - paid_y)
//   perYear    = { [sy]: { fees, paid, floored } }  (useful for reuse)
function getYearFlooredBalance(db, studentId) {
  const obligRows = db.prepare(
    `SELECT COALESCE(school_year,'') as sy, COALESCE(SUM(amount),0) as total
     FROM obligations WHERE student_id = ? GROUP BY school_year`
  ).all(studentId);
  const payRows = db.prepare(
    `SELECT COALESCE(school_year,'') as sy, COALESCE(SUM(amount),0) as total
     FROM payments WHERE student_id = ? GROUP BY school_year`
  ).all(studentId);

  const perYear = {};
  let totalFees = 0;
  let totalPaid = 0;
  for (const r of obligRows) {
    perYear[r.sy] = perYear[r.sy] || { fees: 0, paid: 0, floored: 0 };
    perYear[r.sy].fees += r.total;
    totalFees += r.total;
  }
  for (const r of payRows) {
    perYear[r.sy] = perYear[r.sy] || { fees: 0, paid: 0, floored: 0 };
    perYear[r.sy].paid += r.total;
    totalPaid += r.total;
  }

  let balance = 0;
  for (const sy of Object.keys(perYear)) {
    perYear[sy].floored = floorYear(perYear[sy].fees, perYear[sy].paid);
    balance += perYear[sy].floored;
  }

  // Apply tolerance at the global level too (belt-and-suspenders)
  if (Math.abs(balance) < ROUND_TOLERANCE) balance = 0;

  return { totalFees, totalPaid, balance, perYear };
}

// Legacy shim: used to be `getStudentBalance(db, id)` returning global
// (all years) totals. Now routes through getYearFlooredBalance so the
// balance respects the per-year floor rule.
function getStudentBalance(db, studentId) {
  const { totalFees, totalPaid, balance } = getYearFlooredBalance(db, studentId);
  return { totalFees, totalPaid, balance };
}

// Year-context view used by Students list (when ?school_year= is set),
// Student detail, and SOA. Returns everything the UI needs for one row
// in one SY context.
//
// studentRow is the row from the `students` table — pass it in to avoid
// re-SELECTing on hot paths.
function getStudentYearView(db, studentId, studentRow, schoolYear) {
  if (!schoolYear) {
    // Fall back to global view
    const { totalFees, totalPaid, balance } = getYearFlooredBalance(db, studentId);
    return {
      currentFees: totalFees,
      currentPaid: totalPaid,
      currentBalance: balance,
      priorArrears: 0,
      balance,
      status: studentRow ? studentRow.status : null,
      payStatus: derivePayStatusGlobal(db, studentId, totalFees, totalPaid, balance),
      hasCurrentYearRecord: true,
    };
  }

  const currentFees = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as total FROM obligations WHERE student_id = ? AND school_year = ?`
  ).get(studentId, schoolYear).total;
  const currentPaid = db.prepare(
    `SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE student_id = ? AND school_year = ?`
  ).get(studentId, schoolYear).total;
  const currentBalance = floorYear(currentFees, currentPaid);

  // Sum prior-year arrears using per-year flooring
  const prevYears = db.prepare(`
    SELECT DISTINCT sy FROM (
      SELECT school_year as sy FROM obligations
        WHERE student_id = ? AND school_year IS NOT NULL AND school_year < ?
      UNION
      SELECT school_year as sy FROM payments
        WHERE student_id = ? AND school_year IS NOT NULL AND school_year < ?
    )
  `).all(studentId, schoolYear, studentId, schoolYear);

  let priorArrears = 0;
  for (const { sy } of prevYears) {
    const f = db.prepare(
      `SELECT COALESCE(SUM(amount),0) as t FROM obligations WHERE student_id = ? AND school_year = ?`
    ).get(studentId, sy).t;
    const p = db.prepare(
      `SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE student_id = ? AND school_year = ?`
    ).get(studentId, sy).t;
    priorArrears += floorYear(f, p);
  }
  if (Math.abs(priorArrears) < ROUND_TOLERANCE) priorArrears = 0;

  const balance = currentBalance + priorArrears;

  const hasCurrentYearRecord =
    currentFees > 0 || (studentRow && studentRow.school_year === schoolYear);

  const rawStatus = studentRow ? studentRow.status : null;
  const status = hasCurrentYearRecord ? rawStatus : 'Not Enrolled';

  // Pay status derivation
  let payStatus = null;
  if (currentFees === 0 && priorArrears === 0) {
    payStatus = null; // blank — nothing owed, nothing assessed
  } else if (currentFees === 0 && priorArrears > 0) {
    payStatus = 'Unpaid'; // arrears only
  } else {
    // Current year has fees assessed
    if (currentBalance === 0 && priorArrears === 0) {
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
    if (balance > 0 && hasOverdue) payStatus = 'Overdue';
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

// Derive pay status for GLOBAL (all-years) view. Used by the Students list
// when no school_year is provided and by Student detail.
function derivePayStatusGlobal(db, studentId, totalFees, totalPaid, balance) {
  const today = new Date().toISOString().slice(0, 10);
  const hasOverdue = db.prepare(
    `SELECT COUNT(*) as c FROM obligations
     WHERE student_id = ? AND due_date IS NOT NULL AND due_date < ?`
  ).get(studentId, today).c > 0;

  if (totalFees === 0) return null;
  let payStatus;
  if (balance === 0) payStatus = 'Paid';
  else if (totalPaid > 0) payStatus = 'Partial';
  else payStatus = 'Unpaid';
  if (balance > 0 && hasOverdue) payStatus = 'Overdue';
  return payStatus;
}

// Legacy alias kept for call sites that pass (db, id, totalFees, totalPaid, balance).
function getPayStatus(db, studentId, totalFees, totalPaid, balance) {
  return derivePayStatusGlobal(db, studentId, totalFees, totalPaid, balance);
}

// Single source of truth for "students who owe money" used by Dashboard
// /balance-list, SOA /batch, End of Year preview + snapshot, and any other
// endpoint that needs to list students with outstanding balances.
//
// Uses per-year floor rule — a student with a prior-year overpayment and a
// current-year arrears will be listed at the current-year amount, not the
// (smaller) global net.
function getStudentsWithBalance(db) {
  const students = db.prepare(`
    SELECT student_id, first_name, last_name, middle_name,
           grade_level, section, status, school_year
    FROM students
    ORDER BY last_name, first_name
  `).all();

  const rows = [];
  for (const s of students) {
    const { totalFees, totalPaid, balance } = getYearFlooredBalance(db, s.student_id);
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
  getYearFlooredBalance,
  getStudentYearView,
  getPayStatus,
  getStudentsWithBalance,
  floorYear,
};
