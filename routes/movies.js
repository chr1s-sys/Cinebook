// GET /api/movies  ->  every movie with its upcoming showtimes
const express = require('express');
const db = require('../db');
const { releaseExpiredHolds } = require('../lib/holds');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    await releaseExpiredHolds();
    const [movies] = await db.query(
      `SELECT id, title, genre, duration_min, rating, synopsis FROM movies ORDER BY id`
    );

    // upcoming showtimes + how many seats are already taken in each
    const [showtimes] = await db.query(
      `SELECT st.id, st.movie_id, st.starts_at, st.price,
              h.name AS hall_name, h.total_seats,
              (SELECT COUNT(*) FROM booking_seats bs WHERE bs.showtime_id = st.id) AS taken
         FROM showtimes st
         JOIN halls h ON h.id = st.hall_id
        WHERE st.starts_at > NOW()
        ORDER BY st.starts_at`
    );

    const result = movies.map((m) => ({
      ...m,
      showtimes: showtimes
        .filter((s) => s.movie_id === m.id)
        .map((s) => ({
          id: s.id,
          starts_at: s.starts_at,
          price: Number(s.price),
          hall_name: s.hall_name,
          seats_left: s.total_seats - s.taken,
        })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
