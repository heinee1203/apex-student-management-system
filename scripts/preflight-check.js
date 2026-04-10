#!/usr/bin/env node
// Pre-flight check before running End of School Year.
// Read-only — no data modifications.
//
// Usage:
//   node scripts/preflight-check.js
//
// To run against production, set DATABASE_PATH to the production DB file:
//   DATABASE_PATH=/path/to/schoolfinance.db node scripts/preflight-check.js

const path = require('path');
const db = require(path.join(__dirname, '..', 'server', 'db'));

const PROMO = {
  'Nursery 1': 'Nursery 2', 'Nursery 2': 'Kinder', 'Kinder': 'Grade 1',
  'Grade 1': 'Grade 2', 'Grade 2': 'Grade 3', 'Grade 3': 'Grade 4',
  'Grade 4': 'Grade 5', 'Grade 5': 'Grade 6',
};
const ORDER = ['Nursery 1','Nursery 2','Kinder','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6'];
const fmt = v => '₱' + (v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log('═══ END OF SCHOOL YEAR PRE-FLIGHT CHECK ═══');
console.log('Date: ' + new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }));

const currentSY = db.prepare("SELECT value FROM school_settings WHERE key = 'current_school_year'").get();
const lockedSY = db.prepare("SELECT value FROM school_settings WHERE key = 'locked_school_years'").get();
const cur = currentSY?.value || 'not set';
const locked = lockedSY?.value || 'none';
console.log('Current S.Y.: ' + cur);
console.log('Locked years: ' + locked);

// Derive next SY
let nextSY = null;
if (cur.match(/^\d{4}-\d{4}$/)) {
  const [a, b] = cur.split('-').map(Number);
  nextSY = `${a + 1}-${b + 1}`;
}
console.log('Next S.Y.:    ' + (nextSY || '(cannot derive)'));
console.log();

const issues = [];

// Check 1: Tuition schedule for next year
const tuition = nextSY
  ? db.prepare('SELECT grade_level, annual_rate, monthly_rate, quarterly_rate FROM tuition_schedule WHERE school_year = ? ORDER BY grade_level').all(nextSY)
  : [];
console.log((tuition.length > 0 ? '✅' : '❌') + ' Tuition Schedule ' + nextSY + ': ' + (tuition.length > 0 ? tuition.length + ' rows found' : 'MISSING'));
if (tuition.length === 0) issues.push('tuition schedule for ' + nextSY + ' missing');
else {
  tuition.forEach(t => console.log('    ' + t.grade_level.padEnd(12) + ' annual ' + fmt(t.annual_rate)));
}
console.log();

// Check 2: Default fees for next year
const defaults = nextSY
  ? db.prepare('SELECT grade_level, fee_type, amount FROM default_fees WHERE school_year = ? ORDER BY grade_level, fee_type').all(nextSY)
  : [];
console.log((defaults.length > 0 ? '✅' : '❌') + ' Default Fees ' + nextSY + ': ' + (defaults.length > 0 ? defaults.length + ' rows found' : 'MISSING'));
if (defaults.length === 0) issues.push('default fees for ' + nextSY + ' missing');
console.log();

// Check 3: Students with outstanding balance
const withBalance = db.prepare(`
  SELECT s.student_id, s.first_name || ' ' || s.last_name as name, s.grade_level, s.status,
    COALESCE(o.total_fees, 0) as total_fees,
    COALESCE(p.total_paid, 0) as total_paid,
    COALESCE(o.total_fees, 0) - COALESCE(p.total_paid, 0) as balance
  FROM students s
  LEFT JOIN (SELECT student_id, SUM(amount) as total_fees FROM obligations GROUP BY student_id) o ON o.student_id = s.student_id
  LEFT JOIN (SELECT student_id, SUM(amount) as total_paid FROM payments GROUP BY student_id) p ON p.student_id = s.student_id
  WHERE COALESCE(o.total_fees, 0) - COALESCE(p.total_paid, 0) > 1
  ORDER BY balance DESC
`).all();
const arrearsTotal = withBalance.reduce((s, r) => s + r.balance, 0);
console.log('STUDENTS WITH BALANCE (' + withBalance.length + ') — will carry as arrears:');
if (withBalance.length === 0) console.log('  None');
else {
  withBalance.forEach((r, i) => {
    console.log('  ' + String(i + 1).padStart(2) + '. ' + r.name + ' (' + r.grade_level + ', ' + r.status + ') — ' + fmt(r.balance));
  });
  console.log('  TOTAL ARREARS: ' + fmt(arrearsTotal));
}
console.log();

// Check 4: Enrolled with 0 payments but non-zero fees
const lastPayment = db.prepare('SELECT MAX(date) as d FROM payments').get();
console.log('Last recorded payment: ' + (lastPayment?.d || 'none'));
const enrolledNoPay = db.prepare(`
  SELECT s.student_id, s.first_name || ' ' || s.last_name as name, s.grade_level,
    COALESCE(o.total_fees, 0) as total_fees
  FROM students s
  LEFT JOIN (SELECT student_id, SUM(amount) as total_fees FROM obligations GROUP BY student_id) o ON o.student_id = s.student_id
  LEFT JOIN (SELECT student_id, SUM(amount) as total_paid FROM payments GROUP BY student_id) p ON p.student_id = s.student_id
  WHERE s.status = 'Enrolled' AND COALESCE(o.total_fees, 0) > 0 AND COALESCE(p.total_paid, 0) = 0
`).all();
console.log('ENROLLED STUDENTS WITH ₱0 PAYMENTS (' + enrolledNoPay.length + ') — verify these:');
if (enrolledNoPay.length === 0) console.log('  None — all clear');
else enrolledNoPay.forEach(r => console.log('  - ' + r.name + ' (' + r.grade_level + ') — fees ' + fmt(r.total_fees)));
console.log();

// Check 5: Status summary
console.log('STATUS SUMMARY:');
const statusCounts = db.prepare('SELECT status, COUNT(*) as c FROM students GROUP BY status ORDER BY c DESC').all();
if (statusCounts.length === 0) console.log('  No students');
else statusCounts.forEach(r => console.log('  ' + r.status.padEnd(14) + ' ' + r.c));
console.log();

// Check 6: Grade distribution
const grades = db.prepare("SELECT grade_level, COUNT(*) as c FROM students WHERE status = 'Enrolled' GROUP BY grade_level").all();
console.log('GRADE DISTRIBUTION (Enrolled, will be promoted):');
if (grades.length === 0) console.log('  No enrolled students');
else {
  ORDER.forEach(g => {
    const row = grades.find(r => r.grade_level === g);
    if (row) {
      const next = g === 'Grade 6' ? 'Graduated' : (PROMO[g] || g);
      console.log('  ' + g.padEnd(12) + ' ' + String(row.c).padStart(3) + ' → ' + next);
    }
  });
}
console.log();

// Check 8: Data integrity
const orphanedObs = db.prepare('SELECT COUNT(*) as c FROM obligations o LEFT JOIN students s ON s.student_id = o.student_id WHERE s.id IS NULL').get().c;
const orphanedPays = db.prepare('SELECT COUNT(*) as c FROM payments p LEFT JOIN students s ON s.student_id = p.student_id WHERE s.id IS NULL').get().c;
const negBalances = db.prepare(`
  SELECT s.student_id, s.first_name || ' ' || s.last_name as name,
    COALESCE(o.total_fees, 0) - COALESCE(p.total_paid, 0) as balance
  FROM students s
  LEFT JOIN (SELECT student_id, SUM(amount) as total_fees FROM obligations GROUP BY student_id) o ON o.student_id = s.student_id
  LEFT JOIN (SELECT student_id, SUM(amount) as total_paid FROM payments GROUP BY student_id) p ON p.student_id = s.student_id
  WHERE COALESCE(o.total_fees, 0) - COALESCE(p.total_paid, 0) < -1
`).all();
console.log('DATA INTEGRITY:');
console.log('  ' + (orphanedObs === 0 ? '✅' : '❌') + ' Orphaned obligations: ' + orphanedObs);
console.log('  ' + (orphanedPays === 0 ? '✅' : '❌') + ' Orphaned payments:    ' + orphanedPays);
console.log('  ' + (negBalances.length === 0 ? '✅' : '❌') + ' Negative balances:    ' + negBalances.length);
negBalances.forEach(r => console.log('     - ' + r.name + ' — ' + fmt(r.balance)));
if (orphanedObs > 0) issues.push(orphanedObs + ' orphaned obligations');
if (orphanedPays > 0) issues.push(orphanedPays + ' orphaned payments');
if (negBalances.length > 0) issues.push(negBalances.length + ' negative balance(s)');
console.log();

console.log('═══════════════════════════════════════════');
console.log('RECOMMENDATION: ' + (issues.length === 0 ? 'SAFE TO PROCEED ✅' : 'FIX ISSUES FIRST ❌'));
if (issues.length > 0) issues.forEach(i => console.log('  • ' + i));
console.log('═══════════════════════════════════════════');
