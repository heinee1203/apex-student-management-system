const db = require('./db');

function seed() {
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM school_settings').get().count;
  if (settingsCount > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  console.log('Seeding database...');

  const insertSetting = db.prepare(`
    INSERT OR REPLACE INTO school_settings (key, value) VALUES (?, ?)
  `);

  const seedAll = db.transaction(() => {
    // School settings
    const settings = [
      ['school_name', 'Apex Learning Academy Incorporated'],
      ['school_address', 'J. Hernandez Ave, Naga City, 4400 Camarines Sur, Philippines'],
      ['school_contact', '(054) 472-4024'],
      ['school_email', 'registrar@apexlearning.edu.ph'],
      ['school_website', 'www.apexlearning.edu.ph'],
      ['registrar_name', 'Dr. Maria Teresa L. Gonzales'],
    ];

    for (const [key, value] of settings) {
      insertSetting.run(key, value);
    }

    // Fee types
    const insertFeeType = db.prepare('INSERT OR IGNORE INTO fee_types (name, is_system, sort_order) VALUES (?, ?, ?)');
    const defaultFeeTypes = [
      ['Tuition Fee', 1, 0], ['Misc. Fee', 0, 1], ['Laboratory Fee', 0, 2], ['Library Fee', 0, 3],
      ['Athletic Fee', 0, 4], ['ID Fee', 0, 5], ['Insurance Fee', 0, 6], ['Development Fee', 0, 7],
      ['Energy Fee', 0, 8], ['Internet Fee', 0, 9], ['Registration Fee', 0, 10], ['Graduation Fee', 0, 11],
    ];
    for (const [name, isSystem, sortOrder] of defaultFeeTypes) {
      insertFeeType.run(name, isSystem, sortOrder);
    }

    // Tuition schedule for S.Y. 2024-2025
    // [grade_level, annual_rate, monthly_rate, quarterly_rate]
    const insertSchedule = db.prepare('INSERT OR IGNORE INTO tuition_schedule (grade_level, school_year, annual_rate, monthly_rate, quarterly_rate) VALUES (?, ?, ?, ?, ?)');
    const tuitionRates = [
      ['Nursery 1', 25000, 2500, 6250], ['Nursery 2', 25000, 2500, 6250], ['Kinder', 30000, 3000, 7500],
      ['Grade 1', 35000, 3500, 8750], ['Grade 2', 35000, 3500, 8750], ['Grade 3', 38000, 3800, 9500],
      ['Grade 4', 40000, 4000, 10000], ['Grade 5', 42000, 4200, 10500], ['Grade 6', 45000, 4500, 11250],
    ];
    for (const [gl, annual, monthly, quarterly] of tuitionRates) {
      insertSchedule.run(gl, '2024-2025', annual, monthly, quarterly);
    }

    // Tuition schedule for S.Y. 2023-2024 (slightly lower rates)
    const tuitionRates2023 = [
      ['Nursery 1', 22000, 2200, 5500], ['Nursery 2', 22000, 2200, 5500], ['Kinder', 27000, 2700, 6750],
      ['Grade 1', 32000, 3200, 8000], ['Grade 2', 32000, 3200, 8000], ['Grade 3', 35000, 3500, 8750],
      ['Grade 4', 37000, 3700, 9250], ['Grade 5', 39000, 3900, 9750], ['Grade 6', 42000, 4200, 10500],
    ];
    for (const [gl, annual, monthly, quarterly] of tuitionRates2023) {
      insertSchedule.run(gl, '2023-2024', annual, monthly, quarterly);
    }

    // Default fees per grade level
    // [grade_level, fee_type, amount, description]
    const insertDefaultFee = db.prepare('INSERT OR IGNORE INTO default_fees (grade_level, school_year, fee_type, amount, description) VALUES (?, ?, ?, ?, ?)');
    const defaultFees = [
      ['ALL', 'Misc. Fee', 3500, 'Miscellaneous Fee'],
      ['ALL', 'ID Fee', 500, 'Student ID'],
      ['ALL', 'Insurance Fee', 800, 'Student Insurance'],
      ['ALL', 'Development Fee', 2000, 'Campus Development'],
      ['Grade 1', 'Laboratory Fee', 1500, 'Science Lab Materials'],
      ['Grade 2', 'Laboratory Fee', 1500, 'Science Lab Materials'],
      ['Grade 3', 'Laboratory Fee', 1500, 'Science Lab Materials'],
      ['Grade 4', 'Laboratory Fee', 1500, 'Science Lab Materials'],
      ['Grade 5', 'Laboratory Fee', 1500, 'Science Lab Materials'],
      ['Grade 6', 'Laboratory Fee', 1500, 'Science Lab Materials'],
      ['Nursery 1', 'Registration Fee', 1000, 'Pre-school Registration'],
      ['Nursery 2', 'Registration Fee', 1000, 'Pre-school Registration'],
      ['Kinder', 'Registration Fee', 1000, 'Pre-school Registration'],
    ];
    for (const sy of ['2024-2025', '2023-2024']) {
      for (const [gl, ft, amt, desc] of defaultFees) {
        insertDefaultFee.run(gl, sy, ft, amt, desc);
      }
    }
  });

  seedAll();
  console.log('Database seeded successfully.');
}

seed();

module.exports = seed;
