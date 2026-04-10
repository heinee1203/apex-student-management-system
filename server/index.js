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

// Warn about existing dropped students without dropped_date
{
  const droppedNoDate = db.prepare("SELECT COUNT(*) as count FROM students WHERE status = 'Dropped' AND dropped_date IS NULL").get().count;
  if (droppedNoDate > 0) {
    console.log(`WARNING: ${droppedNoDate} students have 'Dropped' status but no dropped_date. Their fees have not been adjusted. Set dropped_date manually or re-drop them via the app.`);
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
      UNIQUE(student_id, school_year)
    );
    CREATE INDEX idx_snapshots_student ON year_end_snapshots(student_id);
    CREATE INDEX idx_snapshots_sy ON year_end_snapshots(school_year);
  `);
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

// Admin-only routes
app.use('/api/settings', authenticate, requireRole('Admin'), require('./routes/settings'));
app.use('/api/users', authenticate, requireRole('Admin'), require('./routes/users'));
app.use('/api/admin', authenticate, requireRole('Admin'), require('./routes/admin'));

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
