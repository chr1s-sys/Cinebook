// Staff (and admin): check a ticket at the cinema entrance.
//   POST /api/staff/validate   { ticket_code }    check ONE ticket and let it in
//   POST /api/staff/booking    { booking_code }   show a booking's tickets (changes nothing)
//
// The QR code on a ticket contains the ticket code. A scanner (or a person typing)
// sends that code here. If the ticket is good it is marked USED, so it can't get in twice.
const express = require('express');
const db = require('../db');
const { requireRole } = require('../lib/auth');
const { releaseExpiredHolds } = require('../lib/holds');
const router = express.Router();

router.use(requireRole('staff', 'admin'));

router.post('/validate', async (req, res, next) => {
  try {
    const code = String(req.body.ticket_code || '').trim().toUpperCase();
    if (!/^TK-[A-Z0-9]{4,12}$/.test(code)) {
      return res.status(400).json({ result: 'bad_code', message: 'Enter a ticket code like TK-ABCD2345 (or a booking code like CB-ABC123).' });
    }

    const [rows] = await db.query(
      `SELECT t.id, t.ticket_code, t.used_at, b.status AS booking_status,
              s.row_label, s.seat_no,
              st.starts_at, m.title AS movie_title, h.name AS hall_name,
              (TIMESTAMPADD(MINUTE, m.duration_min, st.starts_at) < NOW()) AS ended,
              (DATE(st.starts_at) <> CURDATE()) AS other_day
         FROM tickets t
         JOIN bookings b ON b.id = t.booking_id
         JOIN seats s    ON s.id = t.seat_id
         JOIN showtimes st ON st.id = b.showtime_id
         JOIN movies m   ON m.id = st.movie_id
         JOIN halls h    ON h.id = st.hall_id
        WHERE t.ticket_code = ?`,
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ result: 'not_found', message: 'No ticket with that code.' });
    }
    const t = rows[0];
    const ticket = {
      ticket_code: t.ticket_code,
      seat: t.row_label + t.seat_no,
      movie_title: t.movie_title,
      hall_name: t.hall_name,
      starts_at: t.starts_at,
    };

    if (t.booking_status !== 'CONFIRMED') {
      return res.json({ result: 'cancelled', message: 'This booking was cancelled, so the ticket is not valid.', ticket });
    }
    if (t.used_at !== null) {
      return res.json({ result: 'already_used', message: 'This ticket has already been used.', ticket: { ...ticket, used_at: t.used_at } });
    }
    if (t.ended) {
      return res.json({ result: 'expired', message: 'This showing has already finished.', ticket });
    }

    // Let the person in: mark it used. The "AND used_at IS NULL" means that if two staff
    // scan the same ticket at the same moment, only one of them gets "valid".
    const [update] = await db.query(`UPDATE tickets SET used_at = NOW() WHERE id = ? AND used_at IS NULL`, [t.id]);
    if (update.affectedRows === 0) {
      const [[again]] = await db.query(`SELECT used_at FROM tickets WHERE id = ?`, [t.id]);
      return res.json({ result: 'already_used', message: 'This ticket has already been used.', ticket: { ...ticket, used_at: again.used_at } });
    }

    const response = { result: 'valid', message: 'Entry granted.', ticket };
    if (t.other_day) response.warning = `Note: this ticket is for a different day (${t.starts_at.slice(0, 10)}).`;
    res.json(response);
  } catch (err) { next(err); }
});

// ---- look up a whole booking by its booking code ---------------------------------
// For customers whose QR code won't scan or who forgot the ticket codes: staff type the booking
// code (CB-...), see every seat and whether its ticket is used, then let people in one ticket
// at a time through /validate. This route only READS - it never marks anything used.
router.post('/booking', async (req, res, next) => {
  try {
    const code = String(req.body.booking_code || '').trim().toUpperCase();
    if (!/^CB-[A-Z0-9]{4,10}$/.test(code)) {
      return res.status(400).json({ result: 'bad_code', message: 'Enter a booking code like CB-ABC123.' });
    }

    await releaseExpiredHolds(); // an unpaid hold that ran out counts as cancelled

    const [rows] = await db.query(
      `SELECT b.id, b.booking_code, b.status, u.name AS customer_name,
              st.starts_at, m.title AS movie_title, h.name AS hall_name,
              (TIMESTAMPADD(MINUTE, m.duration_min, st.starts_at) < NOW()) AS ended,
              (DATE(st.starts_at) <> CURDATE()) AS other_day
         FROM bookings b
         JOIN showtimes st ON st.id = b.showtime_id
         JOIN movies m     ON m.id  = st.movie_id
         JOIN halls h      ON h.id  = st.hall_id
    LEFT JOIN users u      ON u.id  = b.user_id
        WHERE b.booking_code = ?`,
      [code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ result: 'not_found', message: 'No booking with that code.' });
    }
    const b = rows[0];

    const booking = {
      booking_code: b.booking_code,
      movie_title: b.movie_title,
      hall_name: b.hall_name,
      starts_at: b.starts_at,
      customer_name: b.customer_name || null,
      tickets: [],
    };

    // an unpaid or cancelled booking has no usable tickets
    if (b.status === 'CANCELLED') {
      return res.json({ result: 'cancelled', message: 'This booking was cancelled, so its tickets are not valid.', booking });
    }
    if (b.status !== 'CONFIRMED') {
      return res.json({ result: 'not_paid', message: 'This booking has not been paid, so it has no tickets.', booking });
    }

    const [tickets] = await db.query(
      `SELECT t.ticket_code, t.used_at, s.row_label, s.seat_no
         FROM tickets t
         JOIN seats s ON s.id = t.seat_id
        WHERE t.booking_id = ?
        ORDER BY s.row_label, s.seat_no`,
      [b.id]
    );
    booking.tickets = tickets.map((t) => ({
      ticket_code: t.ticket_code,
      seat: t.row_label + t.seat_no,
      used: t.used_at !== null,
      used_at: t.used_at,
    }));

    if (b.ended) {
      return res.json({ result: 'expired', message: 'This showing has already finished.', booking });
    }

    const waiting = booking.tickets.filter((t) => !t.used).length;
    const response = {
      result: 'ok',
      message: waiting === 0
        ? 'Every ticket in this booking has already been used.'
        : `${waiting} of ${booking.tickets.length} ${booking.tickets.length === 1 ? 'ticket' : 'tickets'} not used yet.`,
      booking,
    };
    if (b.other_day) response.warning = `Note: this booking is for a different day (${b.starts_at.slice(0, 10)}).`;
    res.json(response);
  } catch (err) { next(err); }
});

module.exports = router;
