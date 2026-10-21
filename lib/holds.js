// A PENDING booking holds its seats for a few minutes. If nobody pays in time,
// the hold expires and the seats go back to being free.
// We clean up "lazily": whenever someone looks at seats, we release expired holds first.
// (No timer or scheduler needed.)
const db = require('../db');

async function releaseExpiredHolds() {
  await db.query(
    `DELETE bs FROM booking_seats bs
       JOIN bookings b ON b.id = bs.booking_id
      WHERE b.status = 'PENDING' AND b.hold_expires_at < NOW()`
  );
  await db.query(
    `UPDATE bookings SET status = 'CANCELLED'
      WHERE status = 'PENDING' AND hold_expires_at < NOW()`
  );
}

module.exports = { releaseExpiredHolds };
