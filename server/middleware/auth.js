const jwt = require('jsonwebtoken');
const db = require('../db');
const crypto = require('crypto');

// Use env var or generate a fallback (warns on startup)
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set. Using random secret — tokens will not survive server restarts.');
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Check user is still active
    const user = db.prepare('SELECT is_active FROM users WHERE id = ?').get(payload.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    req.user = { userId: payload.userId, username: payload.username, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authenticate, JWT_SECRET };
