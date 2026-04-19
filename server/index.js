const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');

// Ensure uploads directory exists — use persistent volume on Railway
const UPLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/data/photos'
  : path.join(__dirname, 'uploads', 'photos');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Auto-seed on first run
const settingsCount = db.prepare('SELECT COUNT(*) as count FROM school_settings').get().count;
if (settingsCount === 0) {
  require('./seed');
}

// Migrate students: add photo_url column if missing
try {
  db.prepare('SELECT photo_url FROM students LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE students ADD COLUMN photo_url TEXT');
}

// Migrate students: add lrn, birth_date, gender, parent_name columns if missing
try {
  db.prepare('SELECT lrn FROM students LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE students ADD COLUMN lrn TEXT');
  db.exec('ALTER TABLE students ADD COLUMN birth_date TEXT');
  db.exec('ALTER TABLE students ADD COLUMN gender TEXT');
  db.exec('ALTER TABLE students ADD COLUMN parent_name TEXT');
}

// Migrate tuition_schedule: add monthly_rate and quarterly_rate columns if missing
try {
  db.prepare('SELECT monthly_rate FROM tuition_schedule LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE tuition_schedule ADD COLUMN monthly_rate REAL NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE tuition_schedule ADD COLUMN quarterly_rate REAL NOT NULL DEFAULT 0');
  db.prepare('UPDATE tuition_schedule SET monthly_rate = ROUND(annual_rate / 10.0, 2), quarterly_rate = ROUND(annual_rate / 4.0, 2)').run();
}

// Migrate students: add dropped_date column if missing
try {
  db.prepare('SELECT dropped_date FROM students LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE students ADD COLUMN dropped_date TEXT');
}

// One-time fix: Cancel all obligations for legacy dropped students with no dropped_date
// These were dropped before the Drop Student workflow was built, so their obligations
// were never cancelled. Delete all their current-year obligations and set dropped_date.
{
  const legacyDropped = db.prepare(`
    SELECT student_id, first_name, last_name FROM students
    WHERE status = 'Dropped' AND dropped_date IS NULL
  `).all();

  if (legacyDropped.length > 0) {
    const deleteObs = db.prepare('DELETE FROM obligations WHERE student_id = ? AND school_year = ?');
    const updateStudent = db.prepare('UPDATE students SET dropped_date = ? WHERE student_id = ?');
    const currentSY = '2025-2026';
    const today = new Date().toISOString().split('T')[0];

    const tx = db.transaction(() => {
      for (const s of legacyDropped) {
        const deleted = deleteObs.run(s.student_id, currentSY);
        updateStudent.run(today, s.student_id);
        console.log(`Fixed legacy dropped student: ${s.first_name} ${s.last_name} — deleted ${deleted.changes} obligations, set dropped_date=${today}`);
      }
    });
    tx();
    console.log(`Fixed ${legacyDropped.length} legacy dropped student${legacyDropped.length !== 1 ? 's' : ''} with no dropped_date`);
  }
}

// One-time fix: Create settlement obligations for dropped students with payments but no fees.
// After the legacy dropped students migration deleted their obligations, their payments
// still remained, creating negative balances. The correct state is balance = 0, meaning
// total fees = amount paid. Create a single "Settlement — Partial Tuition (Dropped)"
// obligation matching their total payments.
{
  const droppedWithPaymentsNoFees = db.prepare(`
    SELECT s.student_id, s.first_name, s.last_name, s.school_year,
      COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0) as total_paid,
      COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) as total_fees
    FROM students s
    WHERE s.status = 'Dropped'
      AND COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) = 0
      AND COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0) > 0
  `).all();

  if (droppedWithPaymentsNoFees.length > 0) {
    const insertOb = db.prepare(`
      INSERT INTO obligations (id, student_id, fee_type, description, payment_term, school_year, amount, due_date)
      VALUES (lower(hex(randomblob(16))), ?, 'Tuition Fee', 'Settlement — Partial Tuition (Dropped)', 'One-time', ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const s of droppedWithPaymentsNoFees) {
        const sy = s.school_year || '2025-2026';
        const today = new Date().toISOString().split('T')[0];
        insertOb.run(s.student_id, sy, s.total_paid, today);
        console.log(`Created settlement obligation for dropped student ${s.first_name} ${s.last_name}: ₱${s.total_paid}`);
      }
    });
    tx();
    console.log(`Fixed ${droppedWithPaymentsNoFees.length} dropped student${droppedWithPaymentsNoFees.length !== 1 ? 's' : ''} — fees now match payments`);
  }
}

// Migrate: create year_end_snapshots and audit_log tables if missing
try { db.prepare('SELECT id FROM year_end_snapshots LIMIT 1').get(); }
catch {
  db.exec(`
    CREATE TABLE year_end_snapshots (
      id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      student_id     TEXT NOT NULL,
      school_year    TEXT NOT NULL,
      total_fees     REAL NOT NULL DEFAULT 0,
      total_paid     REAL NOT NULL DEFAULT 0,
      arrears_amount REAL NOT NULL DEFAULT 0,
      snapshot_date  TEXT NOT NULL,
      created_by     TEXT,
      data           TEXT,
      UNIQUE(student_id, school_year)
    );
    CREATE INDEX idx_snapshots_student ON year_end_snapshots(student_id);
    CREATE INDEX idx_snapshots_sy ON year_end_snapshots(school_year);
  `);
}
// Migration: ensure year_end_snapshots has the `data` column.
// Added 2026-04-11 as part of the EOY v2 rebuild. The `data` column
// stores the full pre-EOY student row as JSON so revert can restore
// status, grade_level, section, payment_term, and any other mutable
// field. Without this column, revert can only restore status + grade.
try {
  db.prepare('SELECT data FROM year_end_snapshots LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE year_end_snapshots ADD COLUMN data TEXT');
  console.log('Migration: added data column to year_end_snapshots');
}
try { db.prepare('SELECT id FROM audit_log LIMIT 1').get(); }
catch {
  db.exec(`
    CREATE TABLE audit_log (
      id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      action       TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      school_year  TEXT,
      details      TEXT,
      created_at   TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX idx_audit_created ON audit_log(created_at);
  `);
}

// ============================================================
// SUMMER PROGRAM MODULE — tables for summer classes, tutorials,
// enrollments, payments (with FIFO allocation), and attendance.
// All tables prefixed summer_ to keep them isolated from the
// regular school year schema. Additive only — no existing tables
// are touched.
// ============================================================
{
  // Idempotent: CREATE TABLE IF NOT EXISTS + try/catch for indexes
  db.exec(`
    CREATE TABLE IF NOT EXISTS summer_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      school_year TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (status IN ('draft','active','closed'))
    );

    CREATE TABLE IF NOT EXISTS summer_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summer_program_id INTEGER NOT NULL REFERENCES summer_programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      class_type TEXT NOT NULL,
      subject TEXT,
      grade_level_min TEXT,
      grade_level_max TEXT,
      fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 0,
      schedule_days TEXT,
      schedule_time TEXT,
      start_date DATE,
      end_date DATE,
      teacher_id INTEGER,
      teacher_name TEXT,
      room TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (class_type IN ('class','tutorial')),
      CHECK (status IN ('open','closed','cancelled'))
    );

    CREATE TABLE IF NOT EXISTS summer_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summer_class_id INTEGER NOT NULL REFERENCES summer_classes(id) ON DELETE RESTRICT,
      student_id TEXT REFERENCES students(id),
      is_external INTEGER NOT NULL DEFAULT 0,
      external_full_name TEXT,
      external_grade_level TEXT,
      external_parent_name TEXT,
      external_parent_contact TEXT,
      fee_at_enrollment DECIMAL(10,2) NOT NULL,
      discount DECIMAL(10,2) NOT NULL DEFAULT 0,
      discount_reason TEXT,
      total_due DECIMAL(10,2) NOT NULL,
      total_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
      balance DECIMAL(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      enrolled_by TEXT REFERENCES users(id),
      withdrawn_at TEXT,
      withdrawn_reason TEXT,
      notes TEXT,
      CHECK (
        (student_id IS NOT NULL AND is_external = 0)
        OR
        (student_id IS NULL AND is_external = 1 AND external_full_name IS NOT NULL)
      ),
      CHECK (status IN ('active','withdrawn','completed'))
    );

    CREATE TABLE IF NOT EXISTS summer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      or_number TEXT UNIQUE,
      student_id TEXT REFERENCES students(id),
      is_external INTEGER NOT NULL DEFAULT 0,
      external_full_name TEXT,
      amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
      payment_method TEXT NOT NULL,
      reference_no TEXT,
      paid_at DATE NOT NULL,
      received_by TEXT REFERENCES users(id),
      remarks TEXT,
      voided INTEGER NOT NULL DEFAULT 0,
      voided_at TEXT,
      voided_by TEXT REFERENCES users(id),
      void_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (payment_method IN ('cash','gcash','bank_transfer','check')),
      CHECK (
        (student_id IS NOT NULL AND is_external = 0)
        OR
        (student_id IS NULL AND is_external = 1 AND external_full_name IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS summer_payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summer_payment_id INTEGER NOT NULL REFERENCES summer_payments(id) ON DELETE CASCADE,
      summer_enrollment_id INTEGER NOT NULL REFERENCES summer_enrollments(id) ON DELETE RESTRICT,
      amount_allocated DECIMAL(10,2) NOT NULL CHECK (amount_allocated > 0),
      allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS summer_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summer_enrollment_id INTEGER NOT NULL REFERENCES summer_enrollments(id) ON DELETE CASCADE,
      session_date DATE NOT NULL,
      status TEXT NOT NULL,
      remarks TEXT,
      recorded_by TEXT REFERENCES users(id),
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(summer_enrollment_id, session_date),
      CHECK (status IN ('present','absent','late','excused'))
    );
  `);
  // Indexes — wrapped in try/catch because CREATE INDEX IF NOT EXISTS
  // isn't supported in all SQLite versions for the same statement.
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_summer_classes_program ON summer_classes(summer_program_id)',
    'CREATE INDEX IF NOT EXISTS idx_summer_enrollments_class ON summer_enrollments(summer_class_id)',
    'CREATE INDEX IF NOT EXISTS idx_summer_enrollments_student ON summer_enrollments(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_summer_enrollments_status ON summer_enrollments(status)',
    'CREATE INDEX IF NOT EXISTS idx_summer_alloc_payment ON summer_payment_allocations(summer_payment_id)',
    'CREATE INDEX IF NOT EXISTS idx_summer_alloc_enrollment ON summer_payment_allocations(summer_enrollment_id)',
    'CREATE INDEX IF NOT EXISTS idx_summer_attendance_date ON summer_attendance(session_date)',
  ];
  for (const sql of indexes) {
    try { db.exec(sql); } catch { /* index already exists */ }
  }
}

// One-time fix: correct school year from 2024-2025 to 2025-2026
{
  const wrongSY = db.prepare("SELECT COUNT(*) as count FROM obligations WHERE school_year = '2024-2025'").get();
  if (wrongSY.count > 0) {
    db.exec("UPDATE obligations SET school_year = '2025-2026' WHERE school_year = '2024-2025'");
    db.exec("UPDATE payments SET school_year = '2025-2026' WHERE school_year = '2024-2025'");
    db.exec("UPDATE students SET school_year = '2025-2026' WHERE school_year = '2024-2025'");
    console.log('Fixed school year: 2024-2025 → 2025-2026');
  }
}

// One-time fix: correct 4 misrecorded payments
{
  const fixedPayments = db.prepare(`
    UPDATE payments SET school_year = '2025-2026'
    WHERE receipt_no IN ('RCT-20260325-001', 'RCT-20260325-002', 'RCT-20260324-001', 'RCT-20260324-002')
    AND school_year = '2024-2025'
  `).run();
  if (fixedPayments.changes > 0) {
    console.log(`Fixed ${fixedPayments.changes} payment records: school_year 2024-2025 → 2025-2026`);
  }
}

// One-time fix: revert prior-year records wrongly bulk-migrated from 2024-2025 to 2025-2026.
// The earlier blanket migration moved ALL 2024-2025 records forward, but records whose
// due_date/date was before 2025-06-01 (start of PH S.Y. 2025-2026) were genuinely from
// the prior school year. Revert them based on date, and revert any students who end up
// with NO current-year obligations (meaning they were never actually re-enrolled).
{
  // Step 1: Revert obligations whose due_date is before 2025-06-01
  const obsToRevert = db.prepare(`
    SELECT COUNT(*) as c FROM obligations
    WHERE school_year = '2025-2026' AND due_date IS NOT NULL AND due_date < '2025-06-01'
  `).get().c;

  // Step 2: Revert payments whose date is before 2025-06-01
  const paysToRevert = db.prepare(`
    SELECT COUNT(*) as c FROM payments
    WHERE school_year = '2025-2026' AND date IS NOT NULL AND date < '2025-06-01'
  `).get().c;

  if (obsToRevert > 0 || paysToRevert > 0) {
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE obligations SET school_year = '2024-2025'
        WHERE school_year = '2025-2026' AND due_date IS NOT NULL AND due_date < '2025-06-01'
      `).run();
      db.prepare(`
        UPDATE payments SET school_year = '2024-2025'
        WHERE school_year = '2025-2026' AND date IS NOT NULL AND date < '2025-06-01'
      `).run();
    });
    tx();
    console.log(`Reverted ${obsToRevert} obligations and ${paysToRevert} payments with due_date/date < 2025-06-01 back to S.Y. 2024-2025`);
  }

  // Step 3: Revert student records whose obligations are now all in 2024-2025
  // (they were never genuinely re-enrolled for the new year)
  const studentsToRevert = db.prepare(`
    SELECT s.student_id, s.first_name, s.last_name
    FROM students s
    WHERE s.school_year = '2025-2026'
    AND s.status = 'Enrolled'
    AND EXISTS (SELECT 1 FROM obligations o WHERE o.student_id = s.student_id)
    AND NOT EXISTS (
      SELECT 1 FROM obligations o
      WHERE o.student_id = s.student_id AND o.school_year = '2025-2026'
    )
  `).all();

  if (studentsToRevert.length > 0) {
    const tx = db.transaction(() => {
      const stmt = db.prepare(`
        UPDATE students SET status = 'Not Enrolled', school_year = '2024-2025'
        WHERE student_id = ?
      `);
      for (const s of studentsToRevert) {
        stmt.run(s.student_id);
        console.log(`Reverted student to Not Enrolled + S.Y. 2024-2025: ${s.first_name} ${s.last_name} (${s.student_id})`);
      }
    });
    tx();
    console.log(`Reverted ${studentsToRevert.length} student${studentsToRevert.length !== 1 ? 's' : ''} wrongly marked as S.Y. 2025-2026 Enrolled`);
  }
}

// Ensure fee_types are seeded for existing databases and add missing types
{
  const desiredFeeTypes = [
    ['Tuition Fee', 1, 0], ['Misc. Fee', 0, 1], ['Book Fee', 0, 2], ['Uniform Fee', 0, 3],
    ['PE Uniform', 0, 4], ['Graduation Fee', 0, 5], ['Laboratory Fee', 0, 6], ['Library Fee', 0, 7],
    ['Athletic Fee', 0, 8], ['ID Fee', 0, 9], ['Insurance Fee', 0, 10], ['Development Fee', 0, 11],
    ['Energy Fee', 0, 12], ['Internet Fee', 0, 13], ['Registration Fee', 0, 14],
    ['Recognition Fee', 0, 20], ['Moving-up Fee', 0, 21],
  ];
  const insertFT = db.prepare('INSERT OR IGNORE INTO fee_types (name, is_system, sort_order) VALUES (?, ?, ?)');
  const updateSort = db.prepare('UPDATE fee_types SET sort_order = ? WHERE name = ?');
  const migrateFeeTypes = db.transaction(() => {
    for (const [name, isSystem, sortOrder] of desiredFeeTypes) {
      insertFT.run(name, isSystem, sortOrder);
      updateSort.run(sortOrder, name);
    }
  });
  migrateFeeTypes();
}

// Ensure default admin user exists for existing databases
const bcrypt = require('bcryptjs');
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role)
    VALUES (lower(hex(randomblob(16))), 'admin', ?, 'Administrator', 'Admin')
  `).run(bcrypt.hashSync('apex2024', 10));
  console.log('Default admin user created (admin / apex2024)');
}

const app = express();
app.use(express.json());

// Auth middleware
const { authenticate } = require('./middleware/auth');
const { requireRole } = require('./middleware/role');

// Public auth routes
app.use('/api/auth', require('./routes/auth'));

// Authenticated API routes
app.use('/api/students', authenticate, require('./routes/students'));
app.use('/api/obligations', authenticate, require('./routes/obligations'));
app.use('/api/payments', authenticate, require('./routes/payments'));
app.use('/api/dashboard', authenticate, require('./routes/dashboard'));
app.use('/api/reports', authenticate, require('./routes/reports'));
app.use('/api/soa', authenticate, require('./routes/soa'));
app.use('/api/tuition-schedule', authenticate, require('./routes/tuitionSchedule'));
app.use('/api/fee-types', authenticate, require('./routes/feeTypes'));
app.use('/api/default-fees', authenticate, require('./routes/defaultFees'));

// Summer Program module — all authenticated users can read, writes are
// role-gated per-route inside summer.js via requireRole().
app.use('/api/summer', authenticate, require('./routes/summer'));

// Admin-only routes
app.use('/api/settings', authenticate, requireRole('Admin'), require('./routes/settings'));
app.use('/api/users', authenticate, requireRole('Admin'), require('./routes/users'));
app.use('/api/admin', authenticate, requireRole('Admin'), require('./routes/admin'));
// End-of-Year v2 — also admin-only, mounted under /api/admin so the wizard
// hits /api/admin/end-of-school-year/preview etc.
app.use('/api/admin', authenticate, requireRole('Admin'), require('./routes/endOfYear'));

// Serve uploaded files (photos)
app.use('/uploads/photos', express.static(UPLOADS_DIR));

// Serve frontend static files
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// SPA fallback — all non-API routes serve the frontend
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SchoolFinance API running on port ${PORT}`);
});
