require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const db = require('./db');
const { explainDbError } = require('./lib/dbhelp');

const app = express();

// a few safe default headers
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});

app.use(express.json());
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); }); // no/other body type = empty
app.use(express.static(path.join(__dirname, 'public'))); // serves the website pages

// login, staff and admin responses must never be cached by the browser
app.use(['/api/auth', '/api/admin', '/api/staff'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/movies', require('./routes/movies'));
app.use('/api/showtimes', require('./routes/showtimes'));
app.use('/api/bookings', require('./routes/bookings'));

// Anything under /api that doesn't exist
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Any other address that doesn't exist: a friendly page instead of plain text
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// Last-resort error handler
app.use((err, req, res, next) => {
  // a badly formed request (e.g. broken JSON, body too big) is the sender's mistake, not ours
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'bad_request', message: 'The request could not be read.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;

// Before starting, make sure the database is reachable and has been set up,
// so a missing step shows a helpful message instead of a broken website.
async function start() {
  let upcoming;
  try {
    await db.query('SELECT synopsis FROM movies LIMIT 1');
    [[upcoming]] = await db.query('SELECT COUNT(*) AS n FROM showtimes WHERE starts_at > NOW()');
  } catch (err) {
    console.error('\nCineBook could not start.\n' + explainDbError(err) + '\n');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`CineBook is running at http://localhost:${PORT}`);
    if (upcoming.n === 0) {
      console.log('Heads up: there are no upcoming showtimes, so the movie list will look empty.');
      console.log('Run  npm run seed  to load fresh demo data (or add showtimes on the admin page).');
    }
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use. Close the other program, or set a different PORT in your .env file.\n`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

start();
