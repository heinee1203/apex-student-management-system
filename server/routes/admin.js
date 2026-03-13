const express = require('express');
const router = express.Router();
const db = require('../db');

const PROMOTION_MAP = {
  'Nursery 1': 'Nursery 2',
  'Nursery 2': 'Kinder',
  'Kinder': 'Grade 1',
  'Grade 1': 'Grade 2',
  'Grade 2': 'Grade 3',
  'Grade 3': 'Grade 4',
  'Grade 4': 'Grade 5',
  'Grade 5': 'Grade 6',
};

// POST /api/admin/end-school-year
router.post('/end-school-year', (req, res) => {
  try {
    const { confirm, promote } = req.body;
    if (confirm !== 'CONFIRM') {
      return res.status(400).json({ error: 'You must type CONFIRM to proceed' });
    }

    let studentsReset = 0;
    let studentsPromoted = 0;
    let studentsGraduated = 0;

    const endYear = db.transaction(() => {
      // Get all enrolled students
      const enrolled = db.prepare("SELECT student_id, grade_level FROM students WHERE status = 'Enrolled'").all();
      studentsReset = enrolled.length;

      if (promote) {
        for (const s of enrolled) {
          if (s.grade_level === 'Grade 6') {
            // Grade 6 graduates
            db.prepare("UPDATE students SET status = 'Graduated', grade_level = 'Grade 6', updated_at = datetime('now','localtime') WHERE student_id = ?").run(s.student_id);
            studentsGraduated++;
          } else {
            const nextGrade = PROMOTION_MAP[s.grade_level] || s.grade_level;
            db.prepare("UPDATE students SET status = 'Not Enrolled', grade_level = ?, updated_at = datetime('now','localtime') WHERE student_id = ?").run(nextGrade, s.student_id);
            studentsPromoted++;
          }
        }
      } else {
        // Just reset status without promotion
        db.prepare("UPDATE students SET status = 'Not Enrolled', updated_at = datetime('now','localtime') WHERE status = 'Enrolled'").run();
      }
    });

    endYear();

    res.json({
      message: 'School year ended successfully',
      studentsReset,
      studentsPromoted,
      studentsGraduated,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
