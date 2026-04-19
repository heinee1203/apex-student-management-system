// =============================================================================
// APEX SUMMER PROGRAM MODULE — API routes
//
// All routes mount under /api/summer/* (see server/index.js).
// RBAC: READ endpoints open to all authenticated users. WRITE endpoints
// gated per the §6 matrix via requireRole() on each route.
// =============================================================================
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireRole } = require('../middleware/role');

// ─── Helpers ────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString(); }

// Generate summer OR number: SOR-YYYYMMDD-NNN
function generateSummerOR(paidAt) {
  const dateStr = paidAt.replace(/-/g, '');
  const count = db.prepare(
    `SELECT COUNT(*) as c FROM summer_payments WHERE or_number LIKE ?`
  ).get(`SOR-${dateStr}-%`).c;
  return `SOR-${dateStr}-${String(count + 1).padStart(3, '0')}`;
}

// Admin-only: wipe ALL summer data (test cleanup). Deletes in FK order.
router.post('/cleanup', requireRole('Admin'), (req, res) => {
  try {
    if (req.body?.confirm !== 'WIPE') return res.status(400).json({ error: 'Send { confirm: "WIPE" }' });
    db.transaction(() => {
      db.exec('DELETE FROM summer_attendance');
      db.exec('DELETE FROM summer_payment_allocations');
      db.exec('DELETE FROM summer_payments');
      db.exec('DELETE FROM summer_enrollments');
      db.exec('DELETE FROM summer_classes');
      db.exec('DELETE FROM summer_programs');
    })();
    res.json({ message: 'All summer data wiped' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// §4.1 PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/summer/programs — list all, newest first
router.get('/programs', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM summer_classes WHERE summer_program_id = p.id) as class_count,
        (SELECT COUNT(*) FROM summer_enrollments e
           JOIN summer_classes c ON e.summer_class_id = c.id
           WHERE c.summer_program_id = p.id AND e.status = 'active') as enrollment_count
      FROM summer_programs p
      ORDER BY p.start_date DESC, p.id DESC
    `).all();
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/summer/programs — create
router.post('/programs', requireRole('Admin'), (req, res) => {
  try {
    const { name, school_year, start_date, end_date, notes } = req.body;
    if (!name || !school_year || !start_date || !end_date) {
      return res.status(400).json({ error: 'name, school_year, start_date, end_date are required' });
    }
    const result = db.prepare(`
      INSERT INTO summer_programs (name, school_year, start_date, end_date, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, school_year, start_date, end_date, notes || null);
    const created = db.prepare('SELECT * FROM summer_programs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/summer/programs/:id — detail + aggregates
router.get('/programs/:id', (req, res) => {
  try {
    const program = db.prepare('SELECT * FROM summer_programs WHERE id = ?').get(req.params.id);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT c.id) as class_count,
        COUNT(DISTINCT CASE WHEN e.status = 'active' THEN e.id END) as enrollment_count,
        COALESCE(SUM(CASE WHEN e.status = 'active' THEN e.total_due ELSE 0 END), 0) as total_billed,
        COALESCE(SUM(CASE WHEN e.status = 'active' THEN e.total_paid ELSE 0 END), 0) as total_collected,
        COALESCE(SUM(CASE WHEN e.status = 'active' THEN e.balance ELSE 0 END), 0) as total_outstanding
      FROM summer_classes c
      LEFT JOIN summer_enrollments e ON e.summer_class_id = c.id
      WHERE c.summer_program_id = ?
    `).get(req.params.id);

    res.json({ ...program, ...stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/summer/programs/:id — update fields + status transitions
router.patch('/programs/:id', requireRole('Admin'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM summer_programs WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Program not found' });

    const { name, school_year, start_date, end_date, status, notes } = req.body;

    // Status transition rules: draft→active→closed (no skipping, no going back)
    if (status && status !== existing.status) {
      const allowed = { draft: 'active', active: 'closed' };
      if (allowed[existing.status] !== status) {
        return res.status(400).json({
          error: `Cannot transition from "${existing.status}" to "${status}". Allowed: ${existing.status} → ${allowed[existing.status] || '(none)'}`,
        });
      }
    }

    db.prepare(`
      UPDATE summer_programs SET
        name = ?, school_year = ?, start_date = ?, end_date = ?,
        status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ?? existing.name,
      school_year ?? existing.school_year,
      start_date ?? existing.start_date,
      end_date ?? existing.end_date,
      status ?? existing.status,
      notes !== undefined ? notes : existing.notes,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM summer_programs WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/summer/programs/:id — hard delete ONLY if no classes
router.delete('/programs/:id', requireRole('Admin'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM summer_programs WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Program not found' });

    const classCount = db.prepare(
      'SELECT COUNT(*) as c FROM summer_classes WHERE summer_program_id = ?'
    ).get(req.params.id).c;
    if (classCount > 0) {
      return res.status(409).json({
        error: `Cannot delete program with ${classCount} class(es). Remove all classes first.`,
      });
    }

    db.prepare('DELETE FROM summer_programs WHERE id = ?').run(req.params.id);
    res.json({ message: 'Program deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// §4.2 CLASSES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/summer/classes — list with optional filters
router.get('/classes', (req, res) => {
  try {
    const { program_id, status } = req.query;
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM summer_enrollments WHERE summer_class_id = c.id AND status = 'active') as enrolled_count
      FROM summer_classes c WHERE 1=1`;
    const params = [];
    if (program_id) { sql += ' AND c.summer_program_id = ?'; params.push(program_id); }
    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    sql += ' ORDER BY c.name';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/summer/classes — create
router.post('/classes', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const {
      summer_program_id, name, class_type, subject,
      grade_level_min, grade_level_max, fee, capacity,
      schedule_days, schedule_time, start_date, end_date,
      teacher_id, teacher_name, room, notes,
    } = req.body;

    if (!summer_program_id || !name || !class_type) {
      return res.status(400).json({ error: 'summer_program_id, name, class_type are required' });
    }

    const program = db.prepare('SELECT status FROM summer_programs WHERE id = ?').get(summer_program_id);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const result = db.prepare(`
      INSERT INTO summer_classes (
        summer_program_id, name, class_type, subject,
        grade_level_min, grade_level_max, fee, capacity,
        schedule_days, schedule_time, start_date, end_date,
        teacher_id, teacher_name, room, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      summer_program_id, name, class_type, subject || null,
      grade_level_min || null, grade_level_max || null,
      fee || 0, capacity || 0,
      schedule_days || null, schedule_time || null,
      start_date || null, end_date || null,
      teacher_id || null, teacher_name || null,
      room || null, notes || null
    );
    const created = db.prepare('SELECT * FROM summer_classes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/summer/classes/:id — detail + enrollment count + remaining capacity
router.get('/classes/:id', (req, res) => {
  try {
    const cls = db.prepare('SELECT * FROM summer_classes WHERE id = ?').get(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    const enrolled = db.prepare(
      `SELECT COUNT(*) as c FROM summer_enrollments WHERE summer_class_id = ? AND status = 'active'`
    ).get(req.params.id).c;

    res.json({
      ...cls,
      enrolled_count: enrolled,
      remaining_capacity: cls.capacity === 0 ? null : Math.max(0, cls.capacity - enrolled),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/summer/classes/:id
router.patch('/classes/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM summer_classes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Class not found' });

    const fields = [
      'name', 'class_type', 'subject', 'grade_level_min', 'grade_level_max',
      'fee', 'capacity', 'schedule_days', 'schedule_time', 'start_date',
      'end_date', 'teacher_id', 'teacher_name', 'room', 'notes', 'status',
    ];
    const updates = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (Object.keys(updates).length === 0) {
      return res.json(existing);
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    db.prepare(`UPDATE summer_classes SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...values, req.params.id);

    res.json(db.prepare('SELECT * FROM summer_classes WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/summer/classes/:id — hard delete ONLY if no enrollments
router.delete('/classes/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM summer_classes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Class not found' });

    const enrollCount = db.prepare(
      'SELECT COUNT(*) as c FROM summer_enrollments WHERE summer_class_id = ?'
    ).get(req.params.id).c;
    if (enrollCount > 0) {
      return res.status(409).json({
        error: `Cannot delete class with ${enrollCount} enrollment(s). Withdraw or cancel instead.`,
      });
    }

    db.prepare('DELETE FROM summer_classes WHERE id = ?').run(req.params.id);
    res.json({ message: 'Class deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/summer/classes/:id/cancel — set status=cancelled
router.post('/classes/:id/cancel', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM summer_classes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Class not found' });
    if (existing.status === 'cancelled') {
      return res.status(400).json({ error: 'Class is already cancelled' });
    }

    db.prepare(
      `UPDATE summer_classes SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(req.params.id);

    // TODO Phase 2: optional refund logic for existing enrollments
    res.json(db.prepare('SELECT * FROM summer_classes WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// §4.3 ENROLLMENTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/summer/enrollments — list with filters
router.get('/enrollments', (req, res) => {
  try {
    const { class_id, student_id, external_name, program_id } = req.query;
    let sql = `
      SELECT e.*,
        c.name as class_name, c.class_type, c.fee as class_fee,
        s.first_name, s.last_name, s.student_id as student_code
      FROM summer_enrollments e
      JOIN summer_classes c ON e.summer_class_id = c.id
      LEFT JOIN students s ON e.student_id = s.id
      WHERE 1=1`;
    const params = [];
    if (class_id) { sql += ' AND e.summer_class_id = ?'; params.push(class_id); }
    if (student_id) { sql += ' AND e.student_id = ?'; params.push(student_id); }
    if (external_name) { sql += ' AND e.external_full_name LIKE ?'; params.push(`%${external_name}%`); }
    if (program_id) { sql += ' AND c.summer_program_id = ?'; params.push(program_id); }
    sql += ' ORDER BY e.enrolled_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/summer/enrollments/:id — detail + payment allocations
router.get('/enrollments/:id', (req, res) => {
  try {
    const enrollment = db.prepare(`
      SELECT e.*,
        c.name as class_name, c.class_type, c.summer_program_id,
        s.first_name, s.last_name, s.student_id as student_code
      FROM summer_enrollments e
      JOIN summer_classes c ON e.summer_class_id = c.id
      LEFT JOIN students s ON e.student_id = s.id
      WHERE e.id = ?
    `).get(req.params.id);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

    const allocations = db.prepare(`
      SELECT a.*, p.or_number, p.payment_method, p.paid_at, p.voided
      FROM summer_payment_allocations a
      JOIN summer_payments p ON a.summer_payment_id = p.id
      WHERE a.summer_enrollment_id = ?
      ORDER BY a.allocated_at ASC
    `).all(req.params.id);

    res.json({ ...enrollment, allocations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/summer/enrollments — enroll student
router.post('/enrollments', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const {
      summer_class_id, student_id, is_external,
      external_full_name, external_grade_level,
      external_parent_name, external_parent_contact,
      discount, discount_reason, notes,
    } = req.body;

    if (!summer_class_id) {
      return res.status(400).json({ error: 'summer_class_id is required' });
    }

    // Validate class exists, is open, and program is active
    const cls = db.prepare(`
      SELECT c.*, p.status as program_status
      FROM summer_classes c
      JOIN summer_programs p ON c.summer_program_id = p.id
      WHERE c.id = ?
    `).get(summer_class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (cls.status !== 'open') {
      return res.status(400).json({ error: `Class is "${cls.status}", not open for enrollment` });
    }
    if (cls.program_status !== 'active') {
      return res.status(400).json({ error: `Program is "${cls.program_status}", not active` });
    }

    // Capacity check
    if (cls.capacity > 0) {
      const enrolled = db.prepare(
        `SELECT COUNT(*) as c FROM summer_enrollments WHERE summer_class_id = ? AND status = 'active'`
      ).get(summer_class_id).c;
      if (enrolled >= cls.capacity) {
        return res.status(409).json({ error: `Class is full (${enrolled}/${cls.capacity})` });
      }
    }

    // Internal vs external validation
    let resolvedStudentId = null;
    let resolvedExternal = 0;
    if (is_external) {
      if (!external_full_name || !external_grade_level) {
        return res.status(400).json({ error: 'external_full_name and external_grade_level are required for external students' });
      }
      if (!external_parent_name && !external_parent_contact) {
        return res.status(400).json({ error: 'At least one parent contact field is required for external students' });
      }
      resolvedExternal = 1;
    } else {
      if (!student_id) {
        return res.status(400).json({ error: 'student_id is required for internal students' });
      }
      const student = db.prepare('SELECT id FROM students WHERE id = ?').get(student_id);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      resolvedStudentId = student_id;

      // Duplicate check: same internal student + same class with active enrollment
      const existing = db.prepare(
        `SELECT id FROM summer_enrollments WHERE student_id = ? AND summer_class_id = ? AND status = 'active'`
      ).get(student_id, summer_class_id);
      if (existing) {
        return res.status(409).json({ error: 'Student already has an active enrollment in this class' });
      }
    }

    // Snapshot fee + compute financials
    const feeAtEnrollment = cls.fee;
    const discountAmt = Math.max(0, parseFloat(discount) || 0);
    const totalDue = feeAtEnrollment - discountAmt;
    const balance = totalDue; // no payments yet

    const result = db.prepare(`
      INSERT INTO summer_enrollments (
        summer_class_id, student_id, is_external,
        external_full_name, external_grade_level,
        external_parent_name, external_parent_contact,
        fee_at_enrollment, discount, discount_reason,
        total_due, total_paid, balance,
        enrolled_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      summer_class_id, resolvedStudentId, resolvedExternal,
      external_full_name || null, external_grade_level || null,
      external_parent_name || null, external_parent_contact || null,
      feeAtEnrollment, discountAmt, discount_reason || null,
      totalDue, balance,
      req.user?.id || null, notes || null
    );

    const created = db.prepare(`
      SELECT e.*, c.name as class_name
      FROM summer_enrollments e
      JOIN summer_classes c ON e.summer_class_id = c.id
      WHERE e.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/summer/enrollments/:id — allow discount edit; recompute balance
router.patch('/enrollments/:id', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM summer_enrollments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Enrollment not found' });

    const { discount, discount_reason, notes } = req.body;
    const newDiscount = discount !== undefined ? Math.max(0, parseFloat(discount) || 0) : existing.discount;
    const newTotalDue = existing.fee_at_enrollment - newDiscount;
    const newBalance = newTotalDue - existing.total_paid;

    db.prepare(`
      UPDATE summer_enrollments SET
        discount = ?, discount_reason = ?, notes = ?,
        total_due = ?, balance = ?
      WHERE id = ?
    `).run(
      newDiscount,
      discount_reason !== undefined ? discount_reason : existing.discount_reason,
      notes !== undefined ? notes : existing.notes,
      newTotalDue, newBalance,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM summer_enrollments WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/summer/enrollments/:id/withdraw
router.post('/enrollments/:id/withdraw', requireRole('Admin', 'Registrar'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM summer_enrollments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Enrollment not found' });
    if (existing.status !== 'active') {
      return res.status(400).json({ error: `Cannot withdraw enrollment with status "${existing.status}"` });
    }

    const { reason } = req.body || {};
    // TODO Phase 2: auto-refund logic. For MVP, withdraw only sets status.
    db.prepare(`
      UPDATE summer_enrollments SET
        status = 'withdrawn', withdrawn_at = CURRENT_TIMESTAMP,
        withdrawn_reason = ?
      WHERE id = ?
    `).run(reason || null, req.params.id);

    res.json(db.prepare('SELECT * FROM summer_enrollments WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// §4.4 PAYMENTS + FIFO ALLOCATION
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/summer/payments — list with filters
router.get('/payments', (req, res) => {
  try {
    const { student_id, external_name, program_id, from, to } = req.query;
    let sql = `SELECT p.* FROM summer_payments p WHERE 1=1`;
    const params = [];
    if (student_id) { sql += ' AND p.student_id = ?'; params.push(student_id); }
    if (external_name) { sql += ' AND p.external_full_name LIKE ?'; params.push(`%${external_name}%`); }
    if (from) { sql += ' AND p.paid_at >= ?'; params.push(from); }
    if (to) { sql += ' AND p.paid_at <= ?'; params.push(to); }
    if (program_id) {
      // Join through allocations → enrollments → classes to filter by program
      sql = `SELECT DISTINCT p.* FROM summer_payments p
        JOIN summer_payment_allocations a ON a.summer_payment_id = p.id
        JOIN summer_enrollments e ON a.summer_enrollment_id = e.id
        JOIN summer_classes c ON e.summer_class_id = c.id
        WHERE c.summer_program_id = ?`;
      params.length = 0;
      params.push(program_id);
      if (from) { sql += ' AND p.paid_at >= ?'; params.push(from); }
      if (to) { sql += ' AND p.paid_at <= ?'; params.push(to); }
    }
    sql += ' ORDER BY p.paid_at DESC, p.id DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/summer/payments/:id — payment + allocations
router.get('/payments/:id', (req, res) => {
  try {
    const payment = db.prepare('SELECT * FROM summer_payments WHERE id = ?').get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const allocations = db.prepare(`
      SELECT a.*, e.summer_class_id,
        c.name as class_name,
        CASE WHEN e.is_external = 1 THEN e.external_full_name
             ELSE (SELECT first_name || ' ' || last_name FROM students WHERE id = e.student_id)
        END as payer_name
      FROM summer_payment_allocations a
      JOIN summer_enrollments e ON a.summer_enrollment_id = e.id
      JOIN summer_classes c ON e.summer_class_id = c.id
      WHERE a.summer_payment_id = ?
      ORDER BY a.allocated_at
    `).all(req.params.id);

    res.json({ ...payment, allocations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/summer/payments — create + FIFO auto-allocate
// Non-negotiable: entire operation inside a DB transaction.
router.post('/payments', requireRole('Admin', 'Treasurer'), (req, res) => {
  try {
    const {
      student_id, is_external, external_full_name,
      amount, payment_method, reference_no, paid_at, remarks,
    } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be > 0' });
    if (!payment_method) return res.status(400).json({ error: 'payment_method is required' });
    if (!paid_at) return res.status(400).json({ error: 'paid_at is required' });

    // Determine payer
    const isExt = !!is_external;
    if (!isExt && !student_id) return res.status(400).json({ error: 'student_id required for internal payer' });
    if (isExt && !external_full_name) return res.status(400).json({ error: 'external_full_name required for external payer' });

    const result = db.transaction(() => {
      // 1) Insert payment
      const orNumber = generateSummerOR(paid_at);
      const payResult = db.prepare(`
        INSERT INTO summer_payments (
          or_number, student_id, is_external, external_full_name,
          amount, payment_method, reference_no, paid_at,
          received_by, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orNumber,
        isExt ? null : student_id,
        isExt ? 1 : 0,
        isExt ? external_full_name : null,
        amount, payment_method, reference_no || null, paid_at,
        req.user?.id || null, remarks || null
      );
      const paymentId = payResult.lastInsertRowid;

      // 2) Fetch open enrollments for this payer (balance > 0), oldest first
      let enrollments;
      if (isExt) {
        enrollments = db.prepare(`
          SELECT * FROM summer_enrollments
          WHERE is_external = 1 AND external_full_name = ? AND balance > 0
          ORDER BY enrolled_at ASC
        `).all(external_full_name);
      } else {
        enrollments = db.prepare(`
          SELECT * FROM summer_enrollments
          WHERE student_id = ? AND balance > 0
          ORDER BY enrolled_at ASC
        `).all(student_id);
      }

      // 3) FIFO allocate
      const allocations = [];
      let remaining = amount;
      const allocStmt = db.prepare(`
        INSERT INTO summer_payment_allocations (summer_payment_id, summer_enrollment_id, amount_allocated)
        VALUES (?, ?, ?)
      `);
      const updateEnroll = db.prepare(`
        UPDATE summer_enrollments SET total_paid = total_paid + ?, balance = balance - ? WHERE id = ?
      `);

      for (const e of enrollments) {
        if (remaining <= 0) break;
        const alloc = Math.min(remaining, e.balance);
        if (alloc > 0) {
          allocStmt.run(paymentId, e.id, alloc);
          updateEnroll.run(alloc, alloc, e.id);
          allocations.push({
            enrollment_id: e.id,
            amount_allocated: alloc,
            class_name: null, // will be resolved in response
          });
          remaining -= alloc;
        }
      }

      // 4) remaining > 0 → unallocated credit (Phase 2: auto-apply on next payment)
      // NOTE Phase 2: MVP does not auto-apply credits across future payments.
      // Unallocated amount is returned in the response for the UI to surface
      // as "advance payment / credit on account".

      return { paymentId, orNumber, allocations, unallocated: Math.round(remaining * 100) / 100 };
    })();

    // Resolve class names for allocations
    const payment = db.prepare('SELECT * FROM summer_payments WHERE id = ?').get(result.paymentId);
    const fullAllocations = db.prepare(`
      SELECT a.*, c.name as class_name, e.enrolled_at, e.balance as new_balance
      FROM summer_payment_allocations a
      JOIN summer_enrollments e ON a.summer_enrollment_id = e.id
      JOIN summer_classes c ON e.summer_class_id = c.id
      WHERE a.summer_payment_id = ?
      ORDER BY a.allocated_at
    `).all(result.paymentId);

    res.status(201).json({
      ...payment,
      allocations: fullAllocations,
      unallocated: result.unallocated,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/summer/payments/:id/void — soft-delete + reverse FIFO allocations
router.post('/payments/:id/void', requireRole('Admin', 'Treasurer'), (req, res) => {
  try {
    const payment = db.prepare('SELECT * FROM summer_payments WHERE id = ?').get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.voided) return res.status(400).json({ error: 'Payment is already voided' });

    const { reason } = req.body || {};

    db.transaction(() => {
      // Mark voided
      db.prepare(`
        UPDATE summer_payments SET voided = 1, voided_at = CURRENT_TIMESTAMP,
          voided_by = ?, void_reason = ?
        WHERE id = ?
      `).run(req.user?.id || null, reason || null, req.params.id);

      // Reverse each allocation
      const allocations = db.prepare(
        'SELECT * FROM summer_payment_allocations WHERE summer_payment_id = ?'
      ).all(req.params.id);

      const reverseStmt = db.prepare(
        'UPDATE summer_enrollments SET total_paid = total_paid - ?, balance = balance + ? WHERE id = ?'
      );
      for (const a of allocations) {
        reverseStmt.run(a.amount_allocated, a.amount_allocated, a.summer_enrollment_id);
      }
      // Keep allocation rows for audit trail — do NOT delete.
    })();

    res.json(db.prepare('SELECT * FROM summer_payments WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// §4.5 ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/summer/attendance — roster with marks for a date
router.get('/attendance', (req, res) => {
  try {
    const { class_id, date } = req.query;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });

    // Get all active enrollments for this class
    const enrollments = db.prepare(`
      SELECT e.id as enrollment_id,
        CASE WHEN e.is_external = 1 THEN e.external_full_name
             ELSE s.last_name || ', ' || s.first_name
        END as student_name,
        e.is_external, e.student_id
      FROM summer_enrollments e
      LEFT JOIN students s ON e.student_id = s.id
      WHERE e.summer_class_id = ? AND e.status = 'active'
      ORDER BY student_name
    `).all(class_id);

    if (!date) return res.json({ enrollments, date: null, records: [] });

    // Get attendance marks for the date
    const records = db.prepare(`
      SELECT a.* FROM summer_attendance a
      WHERE a.summer_enrollment_id IN (
        SELECT id FROM summer_enrollments WHERE summer_class_id = ? AND status = 'active'
      ) AND a.session_date = ?
    `).all(class_id, date);

    const recordMap = {};
    for (const r of records) recordMap[r.summer_enrollment_id] = r;

    // Merge: each enrollment gets its attendance mark (or null)
    const merged = enrollments.map(e => ({
      ...e,
      attendance: recordMap[e.enrollment_id] || null,
    }));

    res.json({ enrollments: merged, date, record_count: records.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/summer/attendance/bulk — upsert attendance for a class on one date
router.post('/attendance/bulk', requireRole('Admin', 'Registrar', 'Staff'), (req, res) => {
  try {
    const { class_id, session_date, records } = req.body;
    if (!class_id || !session_date || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'class_id, session_date, and records[] are required' });
    }

    const upsertStmt = db.prepare(`
      INSERT INTO summer_attendance (summer_enrollment_id, session_date, status, remarks, recorded_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(summer_enrollment_id, session_date) DO UPDATE SET
        status = excluded.status, remarks = excluded.remarks,
        recorded_by = excluded.recorded_by, recorded_at = CURRENT_TIMESTAMP
    `);

    const upsert = db.transaction(() => {
      let count = 0;
      for (const r of records) {
        if (!r.enrollment_id || !r.status) continue;
        upsertStmt.run(r.enrollment_id, session_date, r.status, r.remarks || null, req.user?.id || null);
        count++;
      }
      return count;
    })();

    res.json({ upserted: upsert, session_date, class_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/summer/attendance/summary — per-enrollment attendance counts
router.get('/attendance/summary', (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });

    const rows = db.prepare(`
      SELECT e.id as enrollment_id,
        CASE WHEN e.is_external = 1 THEN e.external_full_name
             ELSE s.last_name || ', ' || s.first_name
        END as student_name,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_count,
        SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) as excused_count,
        COUNT(a.id) as total_sessions
      FROM summer_enrollments e
      LEFT JOIN students s ON e.student_id = s.id
      LEFT JOIN summer_attendance a ON a.summer_enrollment_id = e.id
      WHERE e.summer_class_id = ? AND e.status = 'active'
      GROUP BY e.id
      ORDER BY student_name
    `).all(class_id);

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// §4.6 REPORTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/summer/reports/enrollment — per-class enrollment breakdown
router.get('/reports/enrollment', (req, res) => {
  try {
    const { program_id } = req.query;
    if (!program_id) return res.status(400).json({ error: 'program_id is required' });

    const isRegistrar = req.user?.role === 'Registrar';

    const rows = db.prepare(`
      SELECT c.id as class_id, c.name, c.class_type, c.fee, c.capacity,
        COUNT(CASE WHEN e.status = 'active' THEN 1 END) as enrolled,
        COUNT(CASE WHEN e.status = 'active' AND e.is_external = 0 THEN 1 END) as internal_count,
        COUNT(CASE WHEN e.status = 'active' AND e.is_external = 1 THEN 1 END) as external_count,
        COALESCE(SUM(CASE WHEN e.status = 'active' THEN e.total_due ELSE 0 END), 0) as total_billed,
        COALESCE(SUM(CASE WHEN e.status = 'active' THEN e.total_paid ELSE 0 END), 0) as total_collected,
        COALESCE(SUM(CASE WHEN e.status = 'active' THEN e.balance ELSE 0 END), 0) as total_outstanding
      FROM summer_classes c
      LEFT JOIN summer_enrollments e ON e.summer_class_id = c.id
      WHERE c.summer_program_id = ?
      GROUP BY c.id
      ORDER BY c.name
    `).all(program_id);

    // Strip financial fields for Registrar per §6
    if (isRegistrar) {
      for (const r of rows) {
        delete r.fee;
        delete r.total_billed;
        delete r.total_collected;
        delete r.total_outstanding;
      }
    }

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/summer/reports/revenue — revenue by class and method
router.get('/reports/revenue', (req, res) => {
  try {
    const { program_id, from, to } = req.query;
    if (!program_id) return res.status(400).json({ error: 'program_id is required' });

    // Registrar cannot see revenue data at all
    if (req.user?.role === 'Registrar') {
      return res.status(403).json({ error: 'Registrars cannot access revenue reports' });
    }

    let dateFilter = '';
    const params = [program_id];
    if (from) { dateFilter += ' AND p.paid_at >= ?'; params.push(from); }
    if (to) { dateFilter += ' AND p.paid_at <= ?'; params.push(to); }

    const byClass = db.prepare(`
      SELECT c.name as class_name, c.class_type,
        SUM(a.amount_allocated) as revenue
      FROM summer_payment_allocations a
      JOIN summer_payments p ON a.summer_payment_id = p.id AND p.voided = 0
      JOIN summer_enrollments e ON a.summer_enrollment_id = e.id
      JOIN summer_classes c ON e.summer_class_id = c.id
      WHERE c.summer_program_id = ? ${dateFilter}
      GROUP BY c.id
      ORDER BY revenue DESC
    `).all(...params);

    const byMethod = db.prepare(`
      SELECT p.payment_method, SUM(p.amount) as total
      FROM summer_payments p
      JOIN summer_payment_allocations a ON a.summer_payment_id = p.id
      JOIN summer_enrollments e ON a.summer_enrollment_id = e.id
      JOIN summer_classes c ON e.summer_class_id = c.id
      WHERE p.voided = 0 AND c.summer_program_id = ? ${dateFilter}
      GROUP BY p.payment_method
      ORDER BY total DESC
    `).all(...params);

    const grandTotal = db.prepare(`
      SELECT COALESCE(SUM(p.amount), 0) as total
      FROM summer_payments p
      JOIN summer_payment_allocations a ON a.summer_payment_id = p.id
      JOIN summer_enrollments e ON a.summer_enrollment_id = e.id
      JOIN summer_classes c ON e.summer_class_id = c.id
      WHERE p.voided = 0 AND c.summer_program_id = ? ${dateFilter}
    `).get(...params);

    res.json({ by_class: byClass, by_method: byMethod, total: grandTotal.total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/summer/reports/outstanding — enrollments with balance > 0
router.get('/reports/outstanding', (req, res) => {
  try {
    const { program_id } = req.query;
    if (!program_id) return res.status(400).json({ error: 'program_id is required' });

    const isRegistrar = req.user?.role === 'Registrar';

    const rows = db.prepare(`
      SELECT e.id as enrollment_id,
        CASE WHEN e.is_external = 1 THEN e.external_full_name
             ELSE s.last_name || ', ' || s.first_name
        END as payer_name,
        e.is_external,
        c.name as class_name,
        e.total_due, e.total_paid, e.balance,
        e.enrolled_at,
        CAST(julianday('now') - julianday(e.enrolled_at) AS INTEGER) as days_since_enrollment
      FROM summer_enrollments e
      JOIN summer_classes c ON e.summer_class_id = c.id
      LEFT JOIN students s ON e.student_id = s.id
      WHERE c.summer_program_id = ? AND e.status = 'active' AND e.balance > 0
      ORDER BY e.balance DESC
    `).all(program_id);

    if (isRegistrar) {
      for (const r of rows) {
        delete r.total_due;
        delete r.total_paid;
        delete r.balance;
      }
    }

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Internal student search — used by EnrollStudentDialog to pick from
// existing Apex students. Excludes Graduated (terminal).
// ═══════════════════════════════════════════════════════════════════════════
router.get('/students/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const term = `%${q}%`;
    const rows = db.prepare(`
      SELECT id, student_id, first_name, last_name, middle_name,
             grade_level, section, status, school_year
      FROM students
      WHERE status != 'Graduated'
        AND (student_id LIKE ? OR first_name LIKE ? OR last_name LIKE ?)
      ORDER BY last_name, first_name
      LIMIT 20
    `).all(term, term, term);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
