// GET /api/showtimes/:id/seats  ->  the seat map for one showtime
const express = require('express');
const db = require('../db');
const { releaseExpiredHolds } = require('../lib/holds');
const router = express.Router();

router.get('/:id/seats', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid showtime id' });
    }

    await releaseExpiredHolds();

    const [rows] = await db.query(
      `SELECT st.id, st.starts_at, st.price,
              m.title AS movie_title, m.rating, m.duration_min,
              h.name AS hall_name
         FROM showtimes st
         JOIN movies m ON m.id = st.movie_id
         JOIN halls  h ON h.id = st.hall_id
        WHERE st.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Showtime not found' });
    const st = rows[0];

    // A seat is "taken" if a booking_seats row exists for this showtime.
    // (Availability is worked out from bookings - it is not stored on the seat.)
    const [seats] = await db.query(
      `SELECT s.id, s.row_label, s.seat_no, s.col_pos,
              (bs.seat_id IS NOT NULL) AS taken
         FROM showtimes st
         JOIN seats s ON s.hall_id = st.hall_id
    LEFT JOIN booking_seats bs ON bs.seat_id = s.id AND bs.showtime_id = st.id
        WHERE st.id = ?
        ORDER BY s.row_label, s.col_pos`,
      [id]
    );

    res.json({
      showtime: {
        id: st.id,
        movie_title: st.movie_title,
        rating: st.rating,
        duration_min: st.duration_min,
        hall_name: st.hall_name,
        starts_at: st.starts_at,
        price: Number(st.price),
      },
      columns: Math.max(...seats.map((s) => s.col_pos)),
      seats: seats.map((s) => ({
        id: s.id,
        row: s.row_label,
        number: s.seat_no,
        col: s.col_pos,
        taken: Boolean(s.taken),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
