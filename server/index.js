const express = require('express');
const path = require('path');
const db = require('./db');

// Auto-seed on first run
const settingsCount = db.prepare('SELECT COUNT(*) as count FROM school_settings').get().count;
if (settingsCount === 0) {
  require('./seed');
}

// Migrate tuition_schedule: add monthly_rate and quarterly_rate columns if missing
try {
  db.prepare('SELECT monthly_rate FROM tuition_schedule LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE tuition_schedule ADD COLUMN monthly_rate REAL NOT NULL DEFAULT 0');
  db.exec('ALTER TABLE tuition_schedule ADD COLUMN quarterly_rate REAL NOT NULL DEFAULT 0');
  db.prepare('UPDATE tuition_schedule SET monthly_rate = ROUND(annual_rate / 10.0, 2), quarterly_rate = ROUND(annual_rate / 4.0, 2)').run();
}

// Ensure fee_types are seeded for existing databases
const feeTypeCount = db.prepare('SELECT COUNT(*) as count FROM fee_types').get().count;
if (feeTypeCount === 0) {
  const defaultFeeTypes = [
    ['Tuition Fee', 1, 0], ['Misc. Fee', 0, 1], ['Laboratory Fee', 0, 2], ['Library Fee', 0, 3],
    ['Athletic Fee', 0, 4], ['ID Fee', 0, 5], ['Insurance Fee', 0, 6], ['Development Fee', 0, 7],
    ['Energy Fee', 0, 8], ['Internet Fee', 0, 9], ['Registration Fee', 0, 10], ['Graduation Fee', 0, 11],
  ];
  const insertFT = db.prepare('INSERT OR IGNORE INTO fee_types (name, is_system, sort_order) VALUES (?, ?, ?)');
  const seedFeeTypes = db.transaction(() => {
    for (const [name, isSystem, sortOrder] of defaultFeeTypes) insertFT.run(name, isSystem, sortOrder);
  });
  seedFeeTypes();
}

const app = express();
app.use(express.json());

// API routes
app.use('/api/students', require('./routes/students'));
app.use('/api/obligations', require('./routes/obligations'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/soa', require('./routes/soa'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/tuition-schedule', require('./routes/tuitionSchedule'));
app.use('/api/fee-types', require('./routes/feeTypes'));
app.use('/api/default-fees', require('./routes/defaultFees'));

// Serve frontend static files
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// SPA fallback — all non-API routes serve the frontend
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SchoolFinance API running on port ${PORT}`);
});
