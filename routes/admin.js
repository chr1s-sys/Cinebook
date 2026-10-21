// Admin only: manage movies and showtimes.
//   GET  /api/admin/movies      GET  /api/admin/halls      GET  /api/admin/showtimes
//   POST /api/admin/movies      POST /api/admin/showtimes
const express = require('express');
const db = require('../db');
const { requireRole } = require('../lib/auth');
const router = express.Router();

router.use(requireRole('admin'));

const RATINGS = ['G', 'PG', 'R-13', 'R-16', 'R-18']; // MTRCB ratings
const CLEANING_MINUTES = 15; // gap needed between two shows in the same cinema

const validation = (res, fields) =>
  res.status(400).json({ error: 'validation', message: 'Please check the highlighted fields.', fields });

// ---- lists --------------------------------------------------------------------

router.get('/movies', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT m.id, m.title, m.genre, m.duration_min, m.rating,
              (SELECT COUNT(*) FROM showtimes s WHERE s.movie_id = m.id) AS showtime_count
         FROM movies m ORDER BY m.id`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/halls', async (req, res, next) => {
  try {
    const [rows] = await db.query(`SELECT id, name, total_seats FROM halls ORDER BY id`);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/showtimes', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT st.id, st.starts_at, st.price, m.title AS movie_title, h.name AS hall_name, h.total_seats,
              (SELECT COUNT(*) FROM booking_seats bs WHERE bs.showtime_id = st.id) AS seats_taken,
              (st.starts_at > NOW()) AS upcoming
         FROM showtimes st
         JOIN movies m ON m.id = st.movie_id
         JOIN halls h  ON h.id = st.hall_id
        ORDER BY st.starts_at
        LIMIT 300`
    );
    const list = rows.map((r) => ({
      id: r.id, starts_at: r.starts_at, price: Number(r.price),
      movie_title: r.movie_title, hall_name: r.hall_name,
      seats_taken: r.seats_taken, total_seats: r.total_seats, upcoming: Boolean(r.upcoming),
    }));
    // upcoming first (soonest first), then past ones (most recent first)
    const upcoming = list.filter((s) => s.upcoming);
    const past = list.filter((s) => !s.upcoming).reverse();
    res.json([...upcoming, ...past]);
  } catch (err) { next(err); }
});

// ---- add a movie ---------------------------------------------------------------

router.post('/movies', async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const genre = String(req.body.genre || '').trim();
    const rating = String(req.body.rating || '').trim();
    const synopsis = String(req.body.synopsis === undefined || req.body.synopsis === null ? '' : req.body.synopsis).trim();
    const durationRaw = String(req.body.duration_min === undefined ? '' : req.body.duration_min).trim();
    const duration = /^\d{1,3}$/.test(durationRaw) ? Number(durationRaw) : NaN;

    const fields = {};
    if (title.length < 1 || title.length > 150) fields.title = 'Enter the movie title (up to 150 characters).';
    if (genre.length < 1 || genre.length > 50) fields.genre = 'Enter a genre (up to 50 characters).';
    if (!Number.isInteger(duration) || duration < 1 || duration > 600) fields.duration_min = 'Enter the length in minutes (1 to 600).';
    if (!RATINGS.includes(rating)) fields.rating = 'Choose a rating.';
    if (synopsis.length > 1000) fields.synopsis = 'Keep the synopsis under 1000 characters.';
    if (Object.keys(fields).length > 0) return validation(res, fields);

    const [result] = await db.query(
      `INSERT INTO movies (title, genre, duration_min, rating, synopsis) VALUES (?, ?, ?, ?, ?)`,
      [title, genre, duration, rating, synopsis || null]
    );
    res.status(201).json({ id: result.insertId, title, genre, duration_min: duration, rating, synopsis: synopsis || null });
  } catch (err) { next(err); }
});

// ---- add a showtime --------------------------------------------------------------

function parseStart(raw) {
  // "2026-10-20T14:00" (from the date/time box) or "2026-10-20 14:00"
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(raw || '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const check = new Date(y, mo - 1, d, h, mi);
  const real = check.getFullYear() === y && check.getMonth() === mo - 1 && check.getDate() === d &&
               check.getHours() === h && check.getMinutes() === mi;
  if (!real) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)} ${p(h)}:${p(mi)}:00`;
}

router.post('/showtimes', async (req, res, next) => {
  try {
    const movieId = Number(req.body.movie_id);
    const hallId = Number(req.body.hall_id);
    const startsAt = parseStart(req.body.starts_at);
    const priceRaw = String(req.body.price === undefined ? '' : req.body.price).trim();
    const price = /^\d{1,4}(\.\d{1,2})?$/.test(priceRaw) ? Number(priceRaw) : NaN;

    const fields = {};
    if (!Number.isInteger(movieId) || movieId < 1) fields.movie_id = 'Choose a movie.';
    if (!Number.isInteger(hallId) || hallId < 1) fields.hall_id = 'Choose a cinema.';
    if (!startsAt) fields.starts_at = 'Pick a date and time.';
    if (!(price > 0 && price <= 5000)) fields.price = 'Enter a price between 0.01 and 5000.';
    if (Object.keys(fields).length > 0) return validation(res, fields);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Lock this cinema while we check and insert, so two admins can't add
      // overlapping shows at the same moment.
      const [[hall]] = await conn.query(`SELECT id, name FROM halls WHERE id = ? FOR UPDATE`, [hallId]);
      const [[movie]] = await conn.query(`SELECT id, title, duration_min FROM movies WHERE id = ?`, [movieId]);
      const missing = {};
      if (!hall) missing.hall_id = 'Choose a cinema.';
      if (!movie) missing.movie_id = 'Choose a movie.';
      if (Object.keys(missing).length > 0) {
        await conn.rollback();
        return validation(res, missing);
      }

      const [[future]] = await conn.query(`SELECT (? > NOW()) AS ok`, [startsAt]);
      if (!future.ok) {
        await conn.rollback();
        return validation(res, { starts_at: 'Pick a time in the future.' });
      }

      // does this show (plus cleaning time) overlap another show in the same cinema?
      const [clash] = await conn.query(
        `SELECT st.starts_at, m.title
           FROM showtimes st
           JOIN movies m ON m.id = st.movie_id
          WHERE st.hall_id = ?
            AND st.starts_at < TIMESTAMPADD(MINUTE, ?, ?)
            AND TIMESTAMPADD(MINUTE, m.duration_min + ?, st.starts_at) > ?
          ORDER BY st.starts_at LIMIT 1`,
        [hallId, movie.duration_min + CLEANING_MINUTES, startsAt, CLEANING_MINUTES, startsAt]
      );
      if (clash.length > 0) {
        await conn.rollback();
        return res.status(409).json({
          error: 'hall_busy',
          message: `${hall.name} is already booked at that time (it shows "${clash[0].title}" at ${clash[0].starts_at.slice(11, 16)} on ${clash[0].starts_at.slice(0, 10)}). Shows need at least ${CLEANING_MINUTES} minutes between them.`,
        });
      }

      const [result] = await conn.query(
        `INSERT INTO showtimes (movie_id, hall_id, starts_at, price) VALUES (?, ?, ?, ?)`,
        [movieId, hallId, startsAt, price]
      );
      await conn.commit();
      res.status(201).json({ id: result.insertId, movie_title: movie.title, hall_name: hall.name, starts_at: startsAt, price });
    } catch (err) {
      try { await conn.rollback(); } catch (e) { /* ignore */ }
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { next(err); }
});

module.exports = router;
