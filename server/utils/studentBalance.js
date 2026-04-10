// Shared balance calculation used by students.js and dashboard.js.
// Both endpoints MUST use this helper to stay consistent.
//
// Rules:
// - When schoolYear is null/undefined: sum ALL obligations and payments across all years.
// - When schoolYear is provided: sum only obligations/payments for that year.
// - Apply rounding fix: balances where |balance| < 1 are treated as 0 (installment
//   division artifacts). Without this, a student could show -₱0.01 balance and
//   appear in "Students With Balance" even though they are effectively fully paid.

function getStudentBalance(db, studentId, schoolYear = null) {
  let feesQuery = 'SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE student_id = ?';
  let paidQuery = 'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE student_id = ?';
  const feesParams = [studentId];
  const paidParams = [studentId];

  if (schoolYear) {
    feesQuery += ' AND school_year = ?';
    paidQuery += ' AND school_year = ?';
    feesParams.push(schoolYear);
    paidParams.push(schoolYear);
  }

  const totalFees = db.prepare(feesQuery).get(...feesParams).total;
  const totalPaid = db.prepare(paidQuery).get(...paidParams).total;
  const rawBalance = totalFees - totalPaid;
  const balance = Math.abs(rawBalance) < 1 ? 0 : rawBalance;

  return { totalFees, totalPaid, balance };
}

// Derive pay status from the balance calculation.
// Matches the logic previously duplicated in students.js and Dashboard frontend.
function getPayStatus(db, studentId, totalFees, totalPaid, balance) {
  const today = new Date().toISOString().split('T')[0];
  const hasOverdue = db.prepare(
    `SELECT COUNT(*) as count FROM obligations WHERE student_id = ? AND due_date < ? AND due_date IS NOT NULL`
  ).get(studentId, today).count > 0;

  let payStatus = 'Unpaid';
  if (balance <= 0 && totalFees > 0) payStatus = 'Paid';
  else if (totalPaid > 0) payStatus = 'Partial';
  if (balance > 0 && hasOverdue) payStatus = 'Overdue';
  return payStatus;
}

// Single source of truth for "students who owe money" used by Dashboard
// /balance-list, SOA /batch, End of Year preview + snapshot, and any other
// endpoint that needs to list students with outstanding balances.
//
// Rules (must match getStudentBalance above):
//   - Global: no status filter, no school_year filter
//   - balance = SUM(obligations) - SUM(payments)
//   - |balance| < 1 → treated as 0 (rounding tolerance)
//   - returned ordered by balance DESC
function getStudentsWithBalance(db) {
  const rows = db.prepare(`
    SELECT s.student_id, s.first_name, s.last_name, s.middle_name,
           s.grade_level, s.section, s.status, s.school_year,
      COALESCE(o_sum.total_fees, 0) as total_fees,
      COALESCE(p_sum.total_paid, 0) as total_paid,
      COALESCE(o_sum.total_fees, 0) - COALESCE(p_sum.total_paid, 0) as balance
    FROM students s
    LEFT JOIN (
      SELECT student_id, SUM(amount) as total_fees FROM obligations GROUP BY student_id
    ) o_sum ON o_sum.student_id = s.student_id
    LEFT JOIN (
      SELECT student_id, SUM(amount) as total_paid FROM payments GROUP BY student_id
    ) p_sum ON p_sum.student_id = s.student_id
    WHERE COALESCE(o_sum.total_fees, 0) - COALESCE(p_sum.total_paid, 0) > 1
    ORDER BY balance DESC
  `).all();
  // Apply rounding fix defensively
  return rows.map(r => ({
    ...r,
    balance: Math.abs(r.balance) < 1 ? 0 : r.balance,
  })).filter(r => r.balance > 0);
}

module.exports = { getStudentBalance, getPayStatus, getStudentsWithBalance };
