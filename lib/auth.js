// Login sessions for staff and admin (customers never log in).
//
// How it works, in plain words:
//   * When someone logs in we make a long random "session token" and remember it on the server.
//   * The browser keeps that token in a cookie and sends it back with every request.
//   * Pages that need a login look the token up to find out who you are.
// Sessions live in memory, so restarting the server logs everybody out. That is fine here.
const crypto = require('crypto');

const COOKIE_NAME = 'cb_session';
const SESSION_HOURS = 8;
const sessions = new Map(); // token -> { user, expires }

// remove expired sessions now and then
setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) if (s.expires < now) sessions.delete(token);
}, 10 * 60 * 1000).unref();

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 1) return;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* ignore bad cookie */ }
  });
  return out;
}

function setCookie(res, value, maxAgeSeconds) {
  // HttpOnly: page scripts can't read it. SameSite=Lax: other websites can't make us act for you.
  res.append('Set-Cookie', `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`);
}

function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, expires: Date.now() + SESSION_HOURS * 3600 * 1000 });
  setCookie(res, token, SESSION_HOURS * 3600);
}

function currentSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return { token, user: s.user };
}

function endSession(req, res) {
  const s = currentSession(req);
  if (s) sessions.delete(s.token);
  setCookie(res, '', 0); // tell the browser to forget the cookie
}

// Use on routes that need a login:  router.use(requireRole('admin'))
function requireRole(...roles) {
  return (req, res, next) => {
    const s = currentSession(req);
    if (!s) return res.status(401).json({ error: 'not_logged_in', message: 'Please log in.' });
    if (!roles.includes(s.user.role)) {
      return res.status(403).json({ error: 'forbidden', message: "Your account can't do that." });
    }
    req.user = s.user;
    next();
  };
}

module.exports = { startSession, currentSession, endSession, requireRole };
