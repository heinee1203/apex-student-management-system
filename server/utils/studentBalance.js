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

module.exports = { getStudentBalance, getPayStatus };
