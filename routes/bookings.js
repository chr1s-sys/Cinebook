// Booking API
//   POST /api/bookings              hold seats  (booking becomes PENDING)
//   GET  /api/bookings/:code        look a booking up
//   POST /api/bookings/:code/pay    pay with the (fake) card -> CONFIRMED
//   POST /api/bookings/:code/release  give the held seats back
//   POST /api/bookings/lookup       find a booking with its code + the email used (shows the tickets)
//   POST /api/bookings/:code/cancel cancel a paid booking and refund it (needs the email too)
//
// This follows the flowchart: seat available? -> reserve seat (PENDING) ->
// enter payment -> verify payment -> payment successful? -> confirmed.

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { releaseExpiredHolds } = require('../lib/holds');
const { createTickets } = require('../lib/tickets');
const router = express.Router();

const HOLD_MINUTES = 5;
const MAX_SEATS = 8;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I so codes are easy to read out
const CODE_PATTERN = /^CB-[A-Z0-9]{4,10}$/;

// ---- small helpers ---------------------------------------------------------

function makeCode() {
  let code = 'CB-';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function cleanCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

// Pretend payment gateway. No real money, and the card number is never stored.
//   4000 0000 0000 0002  ->  always declined (so the "payment failed" path can be shown)
//   any other valid-looking card -> approved
async function mockGateway(cardNumber) {
  await new Promise((resolve) => setTimeout(resolve, 600)); // feels like a real check
  if (cardNumber === '4000000000000002') {
    return { approved: false, message: 'Your card was declined. Please check the details or try another card.' };
  }
  return { approved: true };
}

// Everything the pages need to know about one booking.
async function loadBooking(code) {
  const [rows] = await db.query(
    `SELECT b.id, b.booking_code, b.status, b.showtime_id,
            TIMESTAMPDIFF(SECOND, NOW(), b.hold_expires_at) AS seconds_left,
            st.starts_at, st.price,
            m.title AS movie_title, m.rating,
            h.name AS hall_name
       FROM bookings b
       JOIN showtimes st ON st.id = b.showtime_id
       JOIN movies m     ON m.id  = st.movie_id
       JOIN halls h      ON h.id  = st.hall_id
      WHERE b.booking_code = ?`,
    [code]
  );
  if (rows.length === 0) return null;
  const b = rows[0];

  const [seats] = await db.query(
    `SELECT s.id, s.row_label, s.seat_no
       FROM booking_seats bs
       JOIN seats s ON s.id = bs.seat_id
      WHERE bs.booking_id = ?
      ORDER BY s.row_label, s.seat_no`,
    [b.id]
  );

  const price = Number(b.price);
  return {
    booking_code: b.booking_code,
    status: b.status,
    showtime_id: b.showtime_id,
    seconds_left: b.status === 'PENDING' ? Math.max(0, b.seconds_left) : null,
    movie_title: b.movie_title,
    rating: b.rating,
    hall_name: b.hall_name,
    starts_at: b.starts_at,
    price_per_seat: price,
    seats: seats.map((s) => s.row_label + s.seat_no),
    seat_count: seats.length,
    total: price * seats.length,
  };
}

// ---- POST /api/bookings : hold seats ---------------------------------------

router.post('/', async (req, res, next) => {
  try {
    const showtimeId = Number(req.body.showtime_id);
    const seatIds = req.body.seat_ids;

    const fail = (message) => res.status(400).json({ error: 'bad_request', message });
    if (!Number.isInteger(showtimeId) || showtimeId < 1) return fail('Invalid showtime.');
    if (!Array.isArray(seatIds) || seatIds.length === 0) return fail('Pick at least one seat.');
    if (seatIds.length > MAX_SEATS) return fail(`You can book up to ${MAX_SEATS} seats at a time.`);
    if (!seatIds.every((n) => Number.isInteger(n) && n > 0) || new Set(seatIds).size !== seatIds.length) {
      return fail('Invalid seat selection.');
    }
    const sortedSeatIds = [...seatIds].sort((a, b) => a - b); // same order every time = fewer lock clashes

    await releaseExpiredHolds();

    const [showtimes] = await db.query(
      `SELECT id, hall_id FROM showtimes WHERE id = ? AND starts_at > NOW()`,
      [showtimeId]
    );
    if (showtimes.length === 0) return fail('This showtime is not available.');

    const [validSeats] = await db.query(
      `SELECT id FROM seats WHERE hall_id = ? AND id IN (?)`,
      [showtimes[0].hall_id, sortedSeatIds]
    );
    if (validSeats.length !== sortedSeatIds.length) return fail('Those seats do not belong to this showtime.');

    // The important part. Insert a PENDING booking, then try to claim every seat.
    // UNIQUE(showtime_id, seat_id) means the database itself refuses a seat that is already
    // taken, so if two people click at the same moment, only one of them gets it.
    // If any seat is refused, everything is rolled back and the customer holds nothing.
    //
    // (Each attempt uses ONE connection and gives it back before doing anything else,
    //  otherwise many people clicking at once could use up all the connections.)
    for (let attempt = 1; attempt <= 3; attempt++) {
      const conn = await db.getConnection();
      let outcome = null; // { code } | { conflict: true } | { retry: true }
      try {
        await conn.beginTransaction();

        let bookingId = null;
        let code = null;
        for (let tries = 0; tries < 5 && bookingId === null; tries++) {
          code = makeCode();
          try {
            const [result] = await conn.query(
              `INSERT INTO bookings (booking_code, user_id, showtime_id, status, hold_expires_at)
               VALUES (?, NULL, ?, 'PENDING', DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
              [code, showtimeId, HOLD_MINUTES]
            );
            bookingId = result.insertId;
          } catch (err) {
            if (err.code !== 'ER_DUP_ENTRY') throw err; // code clash: try another one
          }
        }
        if (bookingId === null) throw new Error('Could not create a booking code');

        await conn.query(
          `INSERT INTO booking_seats (booking_id, showtime_id, seat_id) VALUES ?`,
          [sortedSeatIds.map((seatId) => [bookingId, showtimeId, seatId])]
        );

        await conn.commit();
        outcome = { code };
      } catch (err) {
        try { await conn.rollback(); } catch (e) { /* ignore */ }
        if (err.code === 'ER_DUP_ENTRY') outcome = { conflict: true }; // somebody else got there first
        else if (err.code === 'ER_LOCK_DEADLOCK' && attempt < 3) outcome = { retry: true }; // just try again
        else throw err;
      } finally {
        conn.release();
      }

      if (outcome.retry) continue;

      if (outcome.conflict) {
        const [taken] = await db.query(
          `SELECT seat_id FROM booking_seats WHERE showtime_id = ? AND seat_id IN (?)`,
          [showtimeId, sortedSeatIds]
        );
        return res.status(409).json({
          error: 'seat_taken',
          message: 'Sorry, one or more of those seats was just taken. Please choose again.',
          taken_seat_ids: taken.map((t) => t.seat_id),
        });
      }

      return res.status(201).json(await loadBooking(outcome.code));
    }
  } catch (err) {
    next(err);
  }
});

// ---- GET /api/bookings/:code ------------------------------------------------

router.get('/:code', async (req, res, next) => {
  try {
    const code = cleanCode(req.params.code);
    if (!code) return res.status(404).json({ error: 'not_found', message: 'Booking not found.' });
    await releaseExpiredHolds();
    const booking = await loadBooking(code);
    if (!booking) return res.status(404).json({ error: 'not_found', message: 'Booking not found.' });
    res.json(booking);
  } catch (err) {
    next(err);
  }
});

// ---- POST /api/bookings/:code/pay -------------------------------------------

router.post('/:code/pay', async (req, res, next) => {
  try {
    const code = cleanCode(req.params.code);
    if (!code) return res.status(404).json({ error: 'not_found', message: 'Booking not found.' });

    // 1. check what the customer typed
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const card = String(req.body.card_number || '').replace(/[\s-]/g, '');
    const expiry = String(req.body.expiry || '').trim();
    const cvv = String(req.body.cvv || '').trim();

    const fields = {};
    if (name.length < 2 || name.length > 100) fields.name = 'Please enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) fields.email = 'Please enter a valid email address.';
    if (!/^\d{13,19}$/.test(card)) fields.card_number = 'Please enter a valid card number.';
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) fields.expiry = 'Use the format MM/YY.';
    if (!/^\d{3,4}$/.test(cvv)) fields.cvv = 'Enter the 3 or 4 digit code.';
    if (Object.keys(fields).length > 0) {
      return res.status(400).json({ error: 'validation', message: 'Please check the highlighted fields.', fields });
    }

    await releaseExpiredHolds();

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // lock this booking so it can't be paid / released twice at the same time
      const [[booking]] = await conn.query(
        `SELECT id, status, showtime_id, (hold_expires_at > NOW()) AS still_held
           FROM bookings WHERE booking_code = ? FOR UPDATE`,
        [code]
      );
      if (!booking) {
        await conn.rollback();
        return res.status(404).json({ error: 'not_found', message: 'Booking not found.' });
      }
      if (booking.status === 'CONFIRMED') {
        await conn.rollback();
        return res.status(409).json({ error: 'already_confirmed', message: 'This booking is already paid.' });
      }
      if (booking.status !== 'PENDING' || !booking.still_held) {
        await conn.rollback();
        return res.status(410).json({ error: 'hold_expired', message: 'Your seat hold expired. Please choose your seats again.', showtime_id: booking.showtime_id });
      }

      const [[priceRow]] = await conn.query(`SELECT price FROM showtimes WHERE id = ?`, [booking.showtime_id]);
      const [[countRow]] = await conn.query(`SELECT COUNT(*) AS n FROM booking_seats WHERE booking_id = ?`, [booking.id]);
      const amount = Number(priceRow.price) * countRow.n;

      // 2. verify the payment with the (pretend) gateway
      const result = await mockGateway(card);

      if (!result.approved) {
        // payment failed: remember the failed attempt, keep the hold, let them try again
        await conn.query(
          `INSERT INTO payments (booking_id, amount, method, status) VALUES (?, ?, 'CARD', 'FAILED')
           ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = 'FAILED'`,
          [booking.id, amount]
        );
        await conn.commit();
        return res.status(402).json({ error: 'payment_declined', message: result.message });
      }

      // 3. payment worked: find or create the customer (guest checkout, no password)
      const [[existing]] = await conn.query(`SELECT id, role FROM users WHERE email = ?`, [email]);
      let userId;
      if (existing) {
        if (existing.role !== 'customer') {
          await conn.rollback();
          return res.status(400).json({ error: 'validation', message: 'Please check the highlighted fields.', fields: { email: 'Please use a different email address.' } });
        }
        userId = existing.id;
        await conn.query(`UPDATE users SET name = ? WHERE id = ?`, [name, userId]);
      } else {
        const [created] = await conn.query(
          `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, NULL, 'customer')`,
          [name, email]
        );
        userId = created.insertId;
      }

      // 4. confirm the booking and record the payment
      await conn.query(
        `INSERT INTO payments (booking_id, amount, method, status) VALUES (?, ?, 'CARD', 'PAID')
         ON DUPLICATE KEY UPDATE amount = VALUES(amount), status = 'PAID'`,
        [booking.id, amount]
      );
      await conn.query(
        `UPDATE bookings SET status = 'CONFIRMED', user_id = ?, hold_expires_at = NULL WHERE id = ?`,
        [userId, booking.id]
      );
      await createTickets(conn, booking.id); // one QR ticket per seat
      await conn.commit();

      res.json({ booking_code: code, status: 'CONFIRMED' });
    } catch (err) {
      try { await conn.rollback(); } catch (e) { /* ignore */ }
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// ---- POST /api/bookings/:code/release ---------------------------------------
// "Change my seats": gives a held booking's seats back right away.

router.post('/:code/release', async (req, res, next) => {
  try {
    const code = cleanCode(req.params.code);
    if (!code) return res.status(404).json({ error: 'not_found', message: 'Booking not found.' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[booking]] = await conn.query(
        `SELECT id, status, showtime_id FROM bookings WHERE booking_code = ? FOR UPDATE`,
        [code]
      );
      if (!booking) {
        await conn.rollback();
        return res.status(404).json({ error: 'not_found', message: 'Booking not found.' });
      }
      if (booking.status === 'CONFIRMED') {
        await conn.rollback();
        return res.status(409).json({ error: 'not_pending', message: 'Only a seat hold can be released.' });
      }
      if (booking.status === 'PENDING') {
        await conn.query(`DELETE FROM booking_seats WHERE booking_id = ?`, [booking.id]);
        await conn.query(`UPDATE bookings SET status = 'CANCELLED', hold_expires_at = NULL WHERE id = ?`, [booking.id]);
      }
      await conn.commit();
      res.json({ ok: true, showtime_id: booking.showtime_id });
    } catch (err) {
      try { await conn.rollback(); } catch (e) { /* ignore */ }
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

// ---- POST /api/bookings/lookup ----------------------------------------------
// "Find my booking": the booking code AND the email used must match.
// This is the only way to see the tickets (and their QR codes).

router.post('/lookup', async (req, res, next) => {
  try {
    const rawCode = String(req.body.code || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!rawCode || !email) {
      return res.status(400).json({ error: 'bad_request', message: 'Please enter your booking code and email.' });
    }
    const notFound = () =>
      res.status(404).json({ error: 'not_found', message: "We couldn't find a booking with that code and email." });

    const code = cleanCode(rawCode);
    if (!code) return notFound();

    await releaseExpiredHolds();

    const [rows] = await db.query(
      `SELECT b.id, u.name AS customer_name
         FROM bookings b
         JOIN users u ON u.id = b.user_id
        WHERE b.booking_code = ? AND u.email = ?`,
      [code, email]
    );
    if (rows.length === 0) return notFound();

    const booking = await loadBooking(code);
    booking.customer_name = rows[0].customer_name;

    const [[payment]] = await db.query(
      `SELECT status, amount FROM payments WHERE booking_id = ?`,
      [rows[0].id]
    );
    booking.payment_status = payment ? payment.status : null;
    booking.amount_paid = payment ? Number(payment.amount) : 0;

    booking.tickets = [];
    booking.can_cancel = false;
    booking.cancel_blocked_reason = null;

    if (booking.status === 'CONFIRMED') {
      const [tickets] = await db.query(
        `SELECT t.ticket_code, t.qr_code, t.used_at, s.row_label, s.seat_no
           FROM tickets t
           JOIN seats s ON s.id = t.seat_id
          WHERE t.booking_id = ?
          ORDER BY s.row_label, s.seat_no`,
        [rows[0].id]
      );
      booking.tickets = tickets.map((t) => ({
        ticket_code: t.ticket_code,
        seat: t.row_label + t.seat_no,
        qr_code: t.qr_code,
        used: t.used_at !== null,
      }));

      const [[show]] = await db.query(
        `SELECT (starts_at > NOW()) AS upcoming FROM showtimes WHERE id = ?`,
        [booking.showtime_id]
      );
      if (!show.upcoming) booking.cancel_blocked_reason = 'This showtime has already started, so the booking can no longer be cancelled.';
      else if (booking.tickets.some((t) => t.used)) booking.cancel_blocked_reason = 'A ticket from this booking has already been used.';
      booking.can_cancel = booking.cancel_blocked_reason === null;
    }

    res.json(booking);
  } catch (err) {
    next(err);
  }
});

// ---- POST /api/bookings/:code/cancel ----------------------------------------
// Cancel a paid booking: seats are freed, the payment is marked REFUNDED.
// (The refund is pretend, like the payment. Tickets are kept for the record
//  but no longer count, because the booking is CANCELLED.)

router.post('/:code/cancel', async (req, res, next) => {
  try {
    const code = cleanCode(req.params.code);
    const email = String(req.body.email || '').trim().toLowerCase();
    const notFound = () =>
      res.status(404).json({ error: 'not_found', message: "We couldn't find a booking with that code and email." });
    if (!code || !email) return notFound();

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // lock the booking so two cancels at once can't both refund
      const [[booking]] = await conn.query(
        `SELECT id, status, showtime_id, user_id FROM bookings WHERE booking_code = ? FOR UPDATE`,
        [code]
      );
      let owner = null;
      if (booking && booking.user_id) {
        [[owner]] = await conn.query(`SELECT email FROM users WHERE id = ?`, [booking.user_id]);
      }
      if (!booking || !owner || owner.email !== email) {
        await conn.rollback();
        return notFound();
      }

      if (booking.status === 'CANCELLED') {
        await conn.rollback();
        return res.status(409).json({ error: 'already_cancelled', message: 'This booking has already been cancelled.' });
      }
      if (booking.status !== 'CONFIRMED') {
        await conn.rollback();
        return res.status(409).json({ error: 'not_confirmed', message: 'Only a paid booking can be cancelled.' });
      }

      const [[show]] = await conn.query(`SELECT (starts_at > NOW()) AS upcoming FROM showtimes WHERE id = ?`, [booking.showtime_id]);
      if (!show.upcoming) {
        await conn.rollback();
        return res.status(409).json({ error: 'showtime_started', message: 'This showtime has already started, so the booking can no longer be cancelled.' });
      }
      const [[used]] = await conn.query(`SELECT COUNT(*) AS n FROM tickets WHERE booking_id = ? AND used_at IS NOT NULL`, [booking.id]);
      if (used.n > 0) {
        await conn.rollback();
        return res.status(409).json({ error: 'ticket_used', message: 'A ticket from this booking has already been used.' });
      }

      const [[payment]] = await conn.query(`SELECT amount FROM payments WHERE booking_id = ?`, [booking.id]);
      const refunded = payment ? Number(payment.amount) : 0;

      await conn.query(`DELETE FROM booking_seats WHERE booking_id = ?`, [booking.id]); // seats are free again
      await conn.query(`UPDATE bookings SET status = 'CANCELLED' WHERE id = ?`, [booking.id]);
      await conn.query(`UPDATE payments SET status = 'REFUNDED' WHERE booking_id = ?`, [booking.id]);
      await conn.commit();

      res.json({ ok: true, status: 'CANCELLED', refunded });
    } catch (err) {
      try { await conn.rollback(); } catch (e) { /* ignore */ }
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
