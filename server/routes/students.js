const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { generateTuitionObligations } = require('../utils/generateTuition');
const { enrollStudent } = require('../utils/enrollStudent');
const { getStudentBalance, getPayStatus } = require('../utils/studentBalance');
const { requireRole } = require('../middleware/role');

// Multer setup for photo uploads
const multer = require('multer');
const UPLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/data/photos'
  : path.join(__dirname, '..', 'uploads', 'photos');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.params.studentId}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// GET /api/students
router.get('/', (req, res) => {
  try {
    const { search, status, grade_level } = req.query;
    let sql = `SELECT s.*,
      COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) as total_fees,
      COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0) as total_paid
      FROM students s WHERE 1=1`;
    const params = [];

    if (search) {
      sql += ` AND (s.student_id LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR s.section LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    if (status) {
      sql += ` AND s.status = ?`;
      params.push(status);
    }
    if (grade_level) {
      sql += ` AND s.grade_level = ?`;
      params.push(grade_level);
    }

    sql += ` ORDER BY s.last_name, s.first_name`;
    const students = db.prepare(sql).all(...params);

    const result = students.map(s => {
      // Use shared helper so list, profile, and dashboard all agree
      const { totalFees, totalPaid, balance } = getStudentBalance(db, s.student_id);
      const payStatus = getPayStatus(db, s.student_id, totalFees, totalPaid, balance);
      return { ...s, total_fees: totalFees, total_paid: totalPaid, balance, pay_status: payStatus };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/students/:studentId
router.get('/:studentId', (req, res) => {
  try {
    const student = db.prepare(`SELECT * FROM students WHERE student_id = ?`).get(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { totalFees, totalPaid, balance } = getStudentBalance(db, req.params.studentId);
    const payStatus = getPayStatus(db, req.params.studentId, totalFees, totalPaid, balance);

    res.json({ ...student, total_fees: totalFees, total_paid: totalPaid, balance, pay_status: payStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students — Register (no auto-enrollment, no fee generation)
router.post('/', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const { student_id, first_name, middle_name, last_name, grade_level, section, status, email, phone, guardian, guardian_phone, scholarship, date_enrolled, address, payment_term, total_tuition, school_year, lrn, birth_date, gender, parent_name } = req.body;
    if (!student_id || !first_name || !last_name || !grade_level) {
      return res.status(400).json({ error: 'student_id, first_name, last_name, and grade_level are required' });
    }

    const existing = db.prepare('SELECT id FROM students WHERE student_id = ?').get(student_id);
    if (existing) return res.status(409).json({ error: 'Student ID already exists' });

    db.prepare(`
      INSERT INTO students (id, student_id, first_name, middle_name, last_name, grade_level, section, status, email, phone, guardian, guardian_phone, scholarship, date_enrolled, address, payment_term, total_tuition, school_year, lrn, birth_date, gender, parent_name)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(student_id, first_name, middle_name || null, last_name, grade_level, section || null, status || 'Registered', email || null, phone || null, guardian || null, guardian_phone || null, scholarship || 'None', date_enrolled || null, address || null, payment_term || null, total_tuition || 0, school_year || null, lrn || null, birth_date || null, gender || null, parent_name || null);

    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(student_id);
    res.status(201).json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/bulk-enroll — Enroll multiple students (before parameterized routes)
router.post('/bulk-enroll', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const { studentIds } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'studentIds array is required' });
    }

    const results = [];
    const bulkEnroll = db.transaction(() => {
      for (const sid of studentIds) {
        try {
          const r = enrollStudent(sid, db);
          results.push({ studentId: sid, success: true, ...r });
        } catch (err) {
          results.push({ studentId: sid, success: false, error: err.message });
        }
      }
    });
    bulkEnroll();

    const enrolled = results.filter(r => r.success).length;
    res.json({ enrolled, total: studentIds.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:studentId/enroll — Enroll a single student
router.post('/:studentId/enroll', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const result = db.transaction(() => enrollStudent(req.params.studentId, db))();
    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    res.json({ ...student, enrolled: true, tuitionCount: result.tuitionCount, otherFeesCount: result.otherFeesCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/students/:studentId/drop-preview — Preview what will be cancelled
router.post('/:studentId/drop-preview', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const { dropped_date } = req.body;
    if (!dropped_date) return res.status(400).json({ error: 'dropped_date is required' });

    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.status !== 'Enrolled' && student.status !== 'LOA') {
      return res.status(400).json({ error: `Cannot drop student with status "${student.status}"` });
    }

    const sy = student.school_year;
    const dropDate = new Date(dropped_date);
    const lastDayOfDropMonth = new Date(dropDate.getFullYear(), dropDate.getMonth() + 1, 0).toISOString().slice(0, 10);

    const cancelledTuition = db.prepare(`
      SELECT COUNT(*) as count FROM obligations
      WHERE student_id = ? AND school_year = ? AND fee_type = 'Tuition Fee' AND due_date > ?
    `).get(req.params.studentId, sy, lastDayOfDropMonth).count;

    const cancelledOtherFees = db.prepare(`
      SELECT COUNT(*) as count FROM obligations
      WHERE student_id = ? AND school_year = ? AND fee_type != 'Tuition Fee' AND due_date >= ?
    `).get(req.params.studentId, sy, dropped_date).count;

    res.json({ cancelledTuition, cancelledOtherFees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:studentId/drop — Drop a student with fee cancellation
router.post('/:studentId/drop', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const { dropped_date } = req.body;
    if (!dropped_date) return res.status(400).json({ error: 'dropped_date is required' });

    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.status !== 'Enrolled' && student.status !== 'LOA') {
      return res.status(400).json({ error: `Cannot drop student with status "${student.status}"` });
    }

    const sy = student.school_year;
    const dropDate = new Date(dropped_date);
    const lastDayOfDropMonth = new Date(dropDate.getFullYear(), dropDate.getMonth() + 1, 0).toISOString().slice(0, 10);

    const result = db.transaction(() => {
      // 1. Delete future tuition installments (after drop month)
      const tuitionResult = db.prepare(`
        DELETE FROM obligations
        WHERE student_id = ? AND school_year = ? AND fee_type = 'Tuition Fee' AND due_date > ?
      `).run(req.params.studentId, sy, lastDayOfDropMonth);

      // 2. Delete non-tuition fees with due_date on or after dropped_date
      const otherResult = db.prepare(`
        DELETE FROM obligations
        WHERE student_id = ? AND school_year = ? AND fee_type != 'Tuition Fee' AND due_date >= ?
      `).run(req.params.studentId, sy, dropped_date);

      // 3. Update student status
      db.prepare(`UPDATE students SET status = 'Dropped', dropped_date = ? WHERE student_id = ?`)
        .run(dropped_date, req.params.studentId);

      // 4. Calculate remaining fees
      const remainingFees = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM obligations WHERE student_id = ? AND school_year = ?
      `).get(req.params.studentId, sy).total;

      return {
        cancelledTuition: tuitionResult.changes,
        cancelledOtherFees: otherResult.changes,
        remainingFees,
      };
    })();

    const total = result.cancelledTuition + result.cancelledOtherFees;
    res.json({
      ...result,
      message: `Student dropped. ${total} fee${total !== 1 ? 's' : ''} cancelled.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:studentId/re-enroll — Re-enroll a dropped student
router.post('/:studentId/re-enroll', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.status !== 'Dropped') {
      return res.status(400).json({ error: `Cannot re-enroll student with status "${student.status}"` });
    }

    db.prepare(`UPDATE students SET status = 'Enrolled', dropped_date = NULL WHERE student_id = ?`)
      .run(req.params.studentId);

    const updated = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:studentId/photo — Upload student photo
router.post('/:studentId/photo', requireRole('Admin', 'Registrar', 'Treasurer'), upload.single('photo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded or invalid file type' });

    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    if (!student) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Student not found' });
    }

    // Delete old photo if exists
    if (student.photo_url) {
      const oldFilename = path.basename(student.photo_url);
      const oldPath = path.join(UPLOADS_DIR, oldFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const photoUrl = `/uploads/photos/${req.file.filename}`;
    db.prepare('UPDATE students SET photo_url = ? WHERE student_id = ?').run(photoUrl, req.params.studentId);

    res.json({ photo_url: photoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/students/:studentId/photo — Remove student photo
router.delete('/:studentId/photo', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const student = db.prepare('SELECT photo_url FROM students WHERE student_id = ?').get(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (student.photo_url) {
      const filename = path.basename(student.photo_url);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      db.prepare('UPDATE students SET photo_url = NULL WHERE student_id = ?').run(req.params.studentId);
    }

    res.json({ message: 'Photo removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/students/:studentId
router.put('/:studentId', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    if (!existing) return res.status(404).json({ error: 'Student not found' });

    const { first_name, middle_name, last_name, grade_level, section, status, email, phone, guardian, guardian_phone, scholarship, date_enrolled, address, payment_term, total_tuition, school_year, lrn, birth_date, gender, parent_name } = req.body;

    const newPaymentTerm = payment_term ?? existing.payment_term;
    const newTotalTuition = total_tuition ?? existing.total_tuition;
    const newSchoolYear = school_year ?? existing.school_year;

    const tuitionChanged = newPaymentTerm !== existing.payment_term || newTotalTuition !== existing.total_tuition;

    const updateStudent = db.transaction(() => {
      db.prepare(`
        UPDATE students SET first_name = ?, middle_name = ?, last_name = ?, grade_level = ?, section = ?, status = ?, email = ?, phone = ?, guardian = ?, guardian_phone = ?, scholarship = ?, date_enrolled = ?, address = ?, payment_term = ?, total_tuition = ?, school_year = ?, lrn = ?, birth_date = ?, gender = ?, parent_name = ?, updated_at = datetime('now','localtime')
        WHERE student_id = ?
      `).run(
        first_name || existing.first_name, middle_name ?? existing.middle_name, last_name || existing.last_name, grade_level || existing.grade_level,
        section ?? existing.section, status || existing.status, email ?? existing.email, phone ?? existing.phone,
        guardian ?? existing.guardian, guardian_phone ?? existing.guardian_phone, scholarship ?? existing.scholarship,
        date_enrolled ?? existing.date_enrolled, address ?? existing.address, newPaymentTerm, newTotalTuition, newSchoolYear,
        lrn ?? existing.lrn, birth_date ?? existing.birth_date, gender ?? existing.gender, parent_name ?? existing.parent_name, req.params.studentId
      );

      if (tuitionChanged && newPaymentTerm && newTotalTuition > 0) {
        db.prepare(`DELETE FROM obligations WHERE student_id = ? AND fee_type = 'Tuition Fee' AND school_year = ?`).run(req.params.studentId, newSchoolYear);

        const obligations = generateTuitionObligations(req.params.studentId, newPaymentTerm, newTotalTuition, newSchoolYear);
        const insertObl = db.prepare(`
          INSERT INTO obligations (id, student_id, fee_type, payment_term, installment_number, school_year, amount, due_date, description)
          VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const o of obligations) {
          insertObl.run(o.student_id, o.fee_type, o.payment_term, o.installment_number, o.school_year, o.amount, o.due_date, o.description);
        }
      }
    });

    updateStudent();

    const updated = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/students/:studentId
router.delete('/:studentId', requireRole('Admin', 'Registrar', 'Treasurer'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.params.studentId);
    if (!existing) return res.status(404).json({ error: 'Student not found' });

    db.prepare('DELETE FROM obligations WHERE student_id = ?').run(req.params.studentId);
    db.prepare('DELETE FROM payments WHERE student_id = ?').run(req.params.studentId);
    db.prepare('DELETE FROM students WHERE student_id = ?').run(req.params.studentId);

    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
