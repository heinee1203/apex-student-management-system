const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// GET /api/users — list all users
router.get('/', (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, full_name, role, is_active, created_at, last_login FROM users ORDER BY created_at').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — create user
router.post('/', (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;
    if (!username || !password || !fullName) {
      return res.status(400).json({ error: 'Username, password, and full name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const validRoles = ['Admin', 'Registrar', 'Viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role must be Admin, Registrar, or Viewer' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const id = require('crypto').randomBytes(16).toString('hex');
    db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role)
      VALUES (?, ?, ?, ?, ?)`
    ).run(id, username, hash, fullName, role || 'Viewer');

    const user = db.prepare('SELECT id, username, full_name, role, is_active, created_at, last_login FROM users WHERE id = ?').get(id);
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id — update user
router.put('/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { username, fullName, role, isActive } = req.body;

    // Protect last admin
    if (user.role === 'Admin' && (role && role !== 'Admin' || isActive === 0)) {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND is_active = 1").get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove or deactivate the last admin' });
      }
    }

    db.prepare(`UPDATE users SET
      username = COALESCE(?, username),
      full_name = COALESCE(?, full_name),
      role = COALESCE(?, role),
      is_active = COALESCE(?, is_active)
      WHERE id = ?`
    ).run(username || null, fullName || null, role || null, isActive !== undefined ? isActive : null, req.params.id);

    const updated = db.prepare('SELECT id, username, full_name, role, is_active, created_at, last_login FROM users WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id — delete user
router.delete('/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (req.user.userId === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    if (user.role === 'Admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND is_active = 1").get().count;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin' });
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/reset-password — reset password
router.post('/:id/reset-password', (req, res) => {
  try {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
