const express = require('express');
const router = express.Router();
const db = require('../db');
const { getStudentsWithBalance } = require('../utils/studentBalance');

// GET /api/reports/by-grade-level
router.get('/by-grade-level', (req, res) => {
  try {
    const { school_year } = req.query;

    let feeFilter = '';
    let payFilter = '';
    const feeParams = [];
    const payParams = [];

    if (school_year) {
      feeFilter += ` AND o.school_year = ?`; feeParams.push(school_year);
      payFilter += ` AND p.school_year = ?`; payParams.push(school_year);
    }

    const grades = db.prepare(`SELECT DISTINCT grade_level FROM students ORDER BY grade_level`).all();

    const result = grades.map(g => {
      const studentCount = db.prepare(`SELECT COUNT(*) as count FROM students WHERE grade_level = ? AND status = 'Enrolled'`).get(g.grade_level).count;
      const totalFees = db.prepare(`SELECT COALESCE(SUM(o.amount), 0) as total FROM obligations o JOIN students s ON o.student_id = s.student_id WHERE s.grade_level = ?${feeFilter}`).get(g.grade_level, ...feeParams).total;
      const collected = db.prepare(`SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p JOIN students s ON p.student_id = s.student_id WHERE s.grade_level = ?${payFilter}`).get(g.grade_level, ...payParams).total;
      const rate = totalFees > 0 ? Math.round((collected / totalFees) * 10000) / 100 : 0;

      return { grade_level: g.grade_level, student_count: studentCount, total_fees: totalFees, collected, rate };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/by-payment-method
router.get('/by-payment-method', (req, res) => {
  try {
    const { school_year } = req.query;
    let filter = '';
    const params = [];
    if (school_year) { filter += ` AND school_year = ?`; params.push(school_year); }

    const methods = db.prepare(`
      SELECT method, COUNT(*) as transaction_count, SUM(amount) as total_amount
      FROM payments WHERE 1=1 ${filter}
      GROUP BY method ORDER BY total_amount DESC
    `).all(...params);

    const grandTotal = methods.reduce((sum, m) => sum + m.total_amount, 0);
    const result = methods.map(m => ({
      ...m,
      share: grandTotal > 0 ? Math.round((m.total_amount / grandTotal) * 10000) / 100 : 0
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/overdue
router.get('/overdue', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = db.prepare(`
      SELECT s.student_id, s.first_name, s.last_name, s.grade_level,
        COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) as total_fees,
        COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0) as total_paid,
        (SELECT COUNT(*) FROM obligations WHERE student_id = s.student_id AND due_date < ? AND due_date IS NOT NULL) as overdue_count
      FROM students s
      WHERE s.status = 'Enrolled'
      AND (SELECT COUNT(*) FROM obligations WHERE student_id = s.student_id AND due_date < ? AND due_date IS NOT NULL) > 0
      AND COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) >
          COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0)
      ORDER BY (COALESCE((SELECT SUM(amount) FROM obligations WHERE student_id = s.student_id), 0) -
                COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id), 0)) DESC
    `).all(today, today);

    const mapped = result.map(r => ({ ...r, balance: r.total_fees - r.total_paid }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/receivables — uses shared helper so numbers match the
// Dashboard, SOA batch, and End of Year preview exactly.
router.get('/receivables', (req, res) => {
  try {
    const students = getStudentsWithBalance(db);
    res.json({
      students,
      summary: {
        count: students.length,
        totalFees: students.reduce((sum, s) => sum + s.total_fees, 0),
        totalPaid: students.reduce((sum, s) => sum + s.total_paid, 0),
        totalBalance: students.reduce((sum, s) => sum + s.balance, 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/enrollment-summary — student count by grade and status
router.get('/enrollment-summary', (req, res) => {
  try {
    const grades = ['Nursery 1', 'Nursery 2', 'Kinder', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];
    const statuses = ['Enrolled', 'Dropped', 'LOA', 'Not Enrolled', 'Registered', 'Graduated'];

    const rows = grades.map(grade => {
      const row = { grade_level: grade };
      let total = 0;
      for (const status of statuses) {
        const c = db.prepare(
          `SELECT COUNT(*) as c FROM students WHERE grade_level = ? AND status = ?`
        ).get(grade, status).c;
        row[status] = c;
        total += c;
      }
      row.total = total;
      return row;
    });

    // Grand totals
    const totals = { grade_level: 'TOTAL', total: 0 };
    for (const status of statuses) {
      totals[status] = rows.reduce((sum, r) => sum + r[status], 0);
      totals.total += totals[status];
    }

    res.json({ rows, totals, statuses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/collections-daily?month=YYYY-MM or ?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/collections-daily', (req, res) => {
  try {
    const { month, start, end } = req.query;
    let where = '';
    const params = [];
    if (month) {
      // month is YYYY-MM
      where = 'WHERE substr(date, 1, 7) = ?';
      params.push(month);
    } else if (start && end) {
      where = 'WHERE date >= ? AND date <= ?';
      params.push(start, end);
    }

    const rows = db.prepare(`
      SELECT date, COUNT(*) as payment_count, SUM(amount) as total
      FROM payments
      ${where}
      GROUP BY date
      ORDER BY date ASC
    `).all(...params);

    const total = rows.reduce((sum, r) => sum + r.total, 0);
    const paymentCount = rows.reduce((sum, r) => sum + r.payment_count, 0);

    res.json({ rows, total, paymentCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/payment-term-distribution
router.get('/payment-term-distribution', (req, res) => {
  try {
    const { school_year } = req.query;
    const feeFilter = school_year ? ' AND o.school_year = ?' : '';
    const payFilter = school_year ? ' AND p.school_year = ?' : '';

    const terms = db.prepare(
      `SELECT DISTINCT COALESCE(payment_term, 'Unassigned') as term FROM students WHERE status = 'Enrolled'`
    ).all();

    const result = terms.map(({ term }) => {
      const studentCount = db.prepare(
        `SELECT COUNT(*) as c FROM students WHERE status = 'Enrolled' AND COALESCE(payment_term, 'Unassigned') = ?`
      ).get(term).c;

      const totalFees = db.prepare(`
        SELECT COALESCE(SUM(o.amount), 0) as total
        FROM obligations o
        JOIN students s ON o.student_id = s.student_id
        WHERE s.status = 'Enrolled' AND COALESCE(s.payment_term, 'Unassigned') = ?${feeFilter}
      `).get(term, ...(school_year ? [school_year] : [])).total;

      const collected = db.prepare(`
        SELECT COALESCE(SUM(p.amount), 0) as total
        FROM payments p
        JOIN students s ON p.student_id = s.student_id
        WHERE s.status = 'Enrolled' AND COALESCE(s.payment_term, 'Unassigned') = ?${payFilter}
      `).get(term, ...(school_year ? [school_year] : [])).total;

      const rate = totalFees > 0 ? Math.round((collected / totalFees) * 10000) / 100 : 0;
      return { term, student_count: studentCount, total_fees: totalFees, collected, rate };
    });

    result.sort((a, b) => b.total_fees - a.total_fees);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/aging — accounts receivable aging buckets
// Current (not yet due), 1-30, 31-60, 61-90, 90+ days overdue per student
router.get('/aging', (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const bucketDay = (days) => {
      const d = new Date(today);
      d.setDate(d.getDate() - days);
      return d.toISOString().slice(0, 10);
    };

    const withBalance = getStudentsWithBalance(db);
    const rows = [];
    let totals = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };

    for (const s of withBalance) {
      // Fetch unpaid obligations for this student — approximate "unpaid" by
      // allocating payments FIFO against obligations sorted by due_date
      const obs = db.prepare(
        `SELECT id, amount, due_date FROM obligations WHERE student_id = ? ORDER BY due_date ASC`
      ).all(s.student_id);

      let remainingPaid = s.total_paid;
      const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };

      for (const o of obs) {
        let unpaid;
        if (remainingPaid >= o.amount) {
          remainingPaid -= o.amount;
          unpaid = 0;
        } else {
          unpaid = o.amount - remainingPaid;
          remainingPaid = 0;
        }
        if (unpaid <= 0) continue;

        // Determine bucket by due_date
        if (!o.due_date || o.due_date > todayStr) {
          buckets.current += unpaid;
        } else {
          if (o.due_date > bucketDay(30)) buckets.d30 += unpaid;
          else if (o.due_date > bucketDay(60)) buckets.d60 += unpaid;
          else if (o.due_date > bucketDay(90)) buckets.d90 += unpaid;
          else buckets.d90plus += unpaid;
        }
      }

      const total = buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.d90plus;
      if (total < 1) continue;

      rows.push({
        student_id: s.student_id,
        first_name: s.first_name,
        last_name: s.last_name,
        grade_level: s.grade_level,
        status: s.status,
        ...buckets,
        total,
      });

      totals.current += buckets.current;
      totals.d30 += buckets.d30;
      totals.d60 += buckets.d60;
      totals.d90 += buckets.d90;
      totals.d90plus += buckets.d90plus;
      totals.total += total;
    }

    rows.sort((a, b) => b.total - a.total);
    res.json({ rows, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
