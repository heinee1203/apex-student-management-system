const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'schoolfinance.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      student_id    TEXT UNIQUE NOT NULL,
      first_name    TEXT NOT NULL,
      middle_name   TEXT,
      last_name     TEXT NOT NULL,
      grade_level   TEXT NOT NULL,
      section       TEXT,
      status        TEXT NOT NULL DEFAULT 'Registered',
      photo_url     TEXT,
      lrn           TEXT,
      birth_date    TEXT,
      gender        TEXT,
      parent_name   TEXT,
      email         TEXT,
      phone         TEXT,
      guardian      TEXT,
      guardian_phone TEXT,
      scholarship   TEXT DEFAULT 'None',
      payment_term  TEXT,
      total_tuition REAL DEFAULT 0,
      school_year   TEXT,
      date_enrolled TEXT,
      address       TEXT,
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      updated_at    TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS obligations (
      id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      student_id          TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
      fee_type            TEXT NOT NULL,
      payment_term        TEXT,
      installment_number  TEXT,
      school_year         TEXT NOT NULL,
      amount              REAL NOT NULL,
      due_date            TEXT,
      description         TEXT,
      created_at          TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      student_id    TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
      amount        REAL NOT NULL,
      date          TEXT NOT NULL,
      method        TEXT NOT NULL,
      receipt_no    TEXT,
      school_year   TEXT,
      notes         TEXT,
      created_at    TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS school_settings (
      key           TEXT PRIMARY KEY,
      value         TEXT
    );

    CREATE TABLE IF NOT EXISTS tuition_schedule (
      id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      grade_level     TEXT NOT NULL,
      school_year     TEXT NOT NULL,
      annual_rate     REAL NOT NULL DEFAULT 0,
      monthly_rate    REAL NOT NULL DEFAULT 0,
      quarterly_rate  REAL NOT NULL DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now','localtime')),
      updated_at      TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(grade_level, school_year)
    );

    CREATE TABLE IF NOT EXISTS default_fees (
      id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      grade_level  TEXT NOT NULL,
      school_year  TEXT NOT NULL,
      fee_type     TEXT NOT NULL,
      amount       REAL NOT NULL,
      description  TEXT,
      created_at   TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(grade_level, school_year, fee_type)
    );

    CREATE TABLE IF NOT EXISTS fee_types (
      id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name         TEXT UNIQUE NOT NULL,
      is_system    INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name     TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'Viewer',
      is_active     INTEGER DEFAULT 1,
      created_at    TEXT DEFAULT (datetime('now','localtime')),
      last_login    TEXT
    );

    -- ============================================================
    -- NOTE FOR FUTURE END-OF-YEAR REIMPLEMENTATION
    -- ------------------------------------------------------------
    -- The original End-of-Year rollover feature was deleted on
    -- 2026-04-11 (commit 5b468a4) after repeated data integrity
    -- incidents. If/when a new EOY is built, the implementation
    -- MUST meet the following requirements. These come from the
    -- postmortem of the previous version's failure modes — in
    -- particular the 2026-04-10 incident where 18 students' grade
    -- levels, statuses, AND sections were mutated, but only
    -- grade/status could be restored on revert because sections
    -- were never captured anywhere (each section had to be
    -- re-entered by the registrar from memory):
    --
    --   1. Before mutating ANY student row, the old row must be
    --      snapshotted in full as JSON. Add a "data TEXT" column
    --      to this table and store the complete students row
    --      (status, grade_level, section, payment_term,
    --       total_tuition, school_year, date_enrolled, ...).
    --   2. The revert endpoint reads the "data" column and
    --      restores every column, not just status + grade_level.
    --   3. The audit_log entry must include a per-student change
    --      list with from/to for status, grade_level, AND section
    --      (at minimum).
    --   4. A dry-run preview endpoint must show exactly what will
    --      change per-student before the user commits. The old
    --      version only showed aggregate counts.
    --   5. The cleanup/revert endpoints MUST NOT wipe the most
    --      recent year_end_snapshots rows unless explicitly
    --      instructed with a confirmation flag. The old cleanup
    --      was too eager and destroyed the only recovery path.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS year_end_snapshots (
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

    CREATE TABLE IF NOT EXISTS audit_log (
      id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      action       TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      school_year  TEXT,
      details      TEXT,
      created_at   TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_student ON year_end_snapshots(student_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_sy ON year_end_snapshots(school_year);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_obligations_student ON obligations(student_id);
    CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
    CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
    CREATE INDEX IF NOT EXISTS idx_obligations_sy ON obligations(school_year, payment_term);
    CREATE INDEX IF NOT EXISTS idx_payments_sy ON payments(school_year);
    CREATE INDEX IF NOT EXISTS idx_tuition_schedule_sy ON tuition_schedule(school_year);
    CREATE INDEX IF NOT EXISTS idx_default_fees_sy ON default_fees(school_year);
  `);
}

initializeDatabase();

module.exports = db;
