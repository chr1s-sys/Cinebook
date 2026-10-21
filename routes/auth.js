// POST /api/auth/login    log in (staff or admin)
// POST /api/auth/logout   log out
// GET  /api/auth/me       who am I?
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { startSession, currentSession, endSession } = require('../lib/auth');
const router = express.Router();

// A fake hash, so a wrong email takes as long to reject as a wrong password
// (otherwise the response time would reveal which emails exist).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// After 5 wrong tries for one email, wait a minute before trying again.
const MAX_FAILURES = 5;
const LOCK_MS = 60 * 1000;
const attempts = new Map(); // email -> { count, lockedUntil }

function isLocked(email) {
  const a = attempts.get(email);
  return Boolean(a && a.lockedUntil > Date.now());
}
function recordFailure(email) {
  if (attempts.size > 5000) attempts.clear();
  const a = attempts.get(email) || { count: 0, lockedUntil: 0 };
  if (a.lockedUntil && a.lockedUntil <= Date.now()) { a.count = 0; a.lockedUntil = 0; }
  a.count += 1;
  if (a.count >= MAX_FAILURES) a.lockedUntil = Date.now() + LOCK_MS;
  attempts.set(email, a);
}

router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'bad_request', message: 'Please enter your email and password.' });
    }
    const bad = () => res.status(401).json({ error: 'bad_login', message: 'Incorrect email or password.' });
    if (email.length > 150 || password.length > 200) return bad();

    if (isLocked(email)) {
      return res.status(429).json({ error: 'too_many_attempts', message: 'Too many wrong attempts. Please wait a minute and try again.' });
    }

    // only staff and admin accounts can log in (guest customers have no password)
    const [rows] = await db.query(
      `SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND role IN ('staff', 'admin')`,
      [email]
    );
    const user = rows[0];
    const hash = user && user.password_hash ? user.password_hash : DUMMY_HASH;
    const matches = await bcrypt.compare(password, hash);

    if (!user || !user.password_hash || !matches) {
      recordFailure(email);
      return bad();
    }

    attempts.delete(email);
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    startSession(res, safeUser);
    res.json({ user: safeUser });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const s = currentSession(req);
  if (!s) return res.status(401).json({ error: 'not_logged_in', message: 'Please log in.' });
  res.json({ user: s.user });
});

module.exports = router;
