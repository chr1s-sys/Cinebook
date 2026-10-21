// Tickets: one per seat, each with its own code and QR image.
// The QR code simply contains the ticket code (e.g. "TK-7KQ4MX2P"), so a staff
// member can scan it (or type the code) and the system looks the ticket up.
const crypto = require('crypto');
const QRCode = require('qrcode');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function makeTicketCode() {
  let code = 'TK-';
  for (let i = 0; i < 8; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

// Make the QR picture for a ticket code, as a "data URL" (a PNG you can put straight in an <img>).
function makeQr(ticketCode) {
  return QRCode.toDataURL(ticketCode, { margin: 1, width: 280, errorCorrectionLevel: 'M' });
}

// Create one ticket for every seat in a booking.
// `conn` can be a single connection (inside a transaction) or the pool.
async function createTickets(conn, bookingId) {
  const [seats] = await conn.query(
    'SELECT seat_id FROM booking_seats WHERE booking_id = ? ORDER BY seat_id',
    [bookingId]
  );
  for (const { seat_id } of seats) {
    for (let tries = 0; tries < 5; tries++) {
      const code = makeTicketCode();
      try {
        await conn.query(
          'INSERT INTO tickets (booking_id, seat_id, ticket_code, qr_code) VALUES (?, ?, ?, ?)',
          [bookingId, seat_id, code, await makeQr(code)]
        );
        break;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY' || tries === 4) throw err; // code clash: try another
      }
    }
  }
}

module.exports = { createTickets };
