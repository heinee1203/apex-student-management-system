const { generateTuitionObligations } = require('./generateTuition');

/**
 * Enroll a student: set status to Enrolled, generate tuition installments + default fees.
 * @param {string} studentId - The student_id (not the UUID id)
 * @param {object} db - The better-sqlite3 database instance
 * @returns {{ tuitionCount: number, otherFeesCount: number }}
 */
function enrollStudent(studentId, db) {
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) throw new Error(`Student ${studentId} not found`);
  if (student.status === 'Enrolled') throw new Error(`Student ${studentId} is already enrolled`);

  const schoolYear = student.school_year;
  if (!schoolYear) throw new Error(`Student ${studentId} has no school year assigned`);

  let tuitionCount = 0;
  let otherFeesCount = 0;

  const insertObl = db.prepare(`
    INSERT INTO obligations (id, student_id, fee_type, payment_term, installment_number, school_year, amount, due_date, description)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Look up tuition rate
  const rate = db.prepare(
    'SELECT * FROM tuition_schedule WHERE grade_level = ? AND school_year = ?'
  ).get(student.grade_level, schoolYear);

  let totalTuition = 0;
  if (rate && student.payment_term) {
    if (student.payment_term === 'Monthly') totalTuition = rate.monthly_rate * 10;
    else if (student.payment_term === 'Quarterly') totalTuition = rate.quarterly_rate * 4;
    else if (student.payment_term === 'Annually') totalTuition = rate.annual_rate;

    if (totalTuition > 0) {
      const obligations = generateTuitionObligations(studentId, student.payment_term, totalTuition, schoolYear);
      for (const o of obligations) {
        insertObl.run(o.student_id, o.fee_type, o.payment_term, o.installment_number, o.school_year, o.amount, o.due_date, o.description);
      }
      tuitionCount = obligations.length;
    }
  }

  // Generate default fees
  const defaultFees = db.prepare(
    `SELECT * FROM default_fees WHERE school_year = ? AND (grade_level = ? OR grade_level = 'ALL')`
  ).all(schoolYear, student.grade_level);

  const startYear = parseInt(schoolYear.split('-')[0]);
  const dueDate = `${startYear}-06-15`;

  for (const df of defaultFees) {
    insertObl.run(studentId, df.fee_type, null, null, schoolYear, df.amount, dueDate, df.description);
  }
  otherFeesCount = defaultFees.length;

  // Update student status and tuition
  const now = new Date().toISOString().split('T')[0];
  db.prepare(
    `UPDATE students SET status = 'Enrolled', date_enrolled = ?, total_tuition = ?, updated_at = datetime('now','localtime') WHERE student_id = ?`
  ).run(now, totalTuition || student.total_tuition || 0, studentId);

  return { tuitionCount, otherFeesCount };
}

module.exports = { enrollStudent };
