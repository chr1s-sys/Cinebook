// Run with:  npm run seed
// Creates the database (if needed), rebuilds every table from schema.sql,
// and fills it with demo data. Safe to run again any time - it also works
// as a "reset the demo" button.

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { createTickets } = require('../lib/tickets');
const { explainDbError } = require('../lib/dbhelp');

const DB_NAME = process.env.DB_NAME || 'cinebook';

// ---- helpers ---------------------------------------------------------------

// JS Date -> 'YYYY-MM-DD HH:MM:SS' (local time, what MySQL DATETIME expects)
function toSql(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

// "days from today at HH:MM" -> SQL datetime string
function when(daysFromNow, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return toSql(d);
}

// Build a hall's seats: rows A-F, 8 seats per row.
// `groups` splits each row into blocks; the space between blocks is an aisle.
//   [4, 4]    -> 1 2 3 4 | 5 6 7 8        (one aisle in the middle)
//   [2, 4, 2] -> 1 2 | 3 4 5 6 | 7 8      (two aisles)
function buildSeats(hallId, groups) {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F'];
  const seats = [];
  for (const row of rows) {
    let seatNo = 1;
    let col = 1;
    groups.forEach((size, g) => {
      if (g > 0) col += 1; // skip one column = aisle
      for (let i = 0; i < size; i++) {
        seats.push([hallId, row, seatNo, col]);
        seatNo += 1;
        col += 1;
      }
    });
  }
  return seats;
}

// ---- main ------------------------------------------------------------------

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4`);
  await conn.query(`USE \`${DB_NAME}\``);

  // 1. tables
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);

  // 2. users (staff + admin can log in later; the demo customer is a guest with no password)
  const staffHash = await bcrypt.hash('staff123', 10);
  const adminHash = await bcrypt.hash('admin123', 10);
  await conn.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES
       ('Admin',          'admin@cinebook.test', ?,    'admin'),
       ('Staff',          'staff@cinebook.test', ?,    'staff'),
       ('Demo Customer',  'demo@cinebook.test',  NULL, 'customer')`,
    [adminHash, staffHash]
  );
  const demoUserId = 3;

  // 3. movies
  await conn.query(
    `INSERT INTO movies (title, genre, duration_min, rating, synopsis) VALUES ?`,
    [[
      ['Starfall', 'Sci-Fi', 128, 'PG', 'When a failing space station drops out of orbit, a small crew has one night to reach the surface before the sky burns.'],
      ['The Last Reel', 'Drama', 115, 'R-13', 'An aging projectionist fights to keep his small-town cinema open for one final screening.'],
      ['Kapit-Bahay', 'Comedy', 102, 'G', 'Two feuding neighbors are forced to share one roof after a typhoon, just in time for the loudest barangay fiesta of the year.'],
    ]]
  );

  // 4. halls + seat grids
  await conn.query(`INSERT INTO halls (name, total_seats) VALUES ('Cinema 1', 48), ('Cinema 2', 48)`);
  const allSeats = [...buildSeats(1, [4, 4]), ...buildSeats(2, [2, 4, 2])];
  await conn.query(`INSERT INTO seats (hall_id, row_label, seat_no, col_pos) VALUES ?`, [allSeats]);

  // 5. showtimes (always in the future: tomorrow and the day after)
  await conn.query(
    `INSERT INTO showtimes (movie_id, hall_id, starts_at, price) VALUES ?`,
    [[
      [1, 1, when(1, 14, 0),  280],
      [1, 1, when(1, 19, 30), 320],
      [2, 2, when(1, 16, 0),  350],
      [3, 2, when(1, 21, 0),  300],
      [3, 1, when(2, 13, 0),  280],
      [2, 2, when(2, 18, 0),  350],
    ]]
  );

  // 6. a few pre-booked seats so the map isn't empty
  async function seatId(hallId, label) {
    const [[row]] = await conn.query(
      `SELECT id FROM seats WHERE hall_id = ? AND row_label = ? AND seat_no = ?`,
      [hallId, label[0], Number(label.slice(1))]
    );
    return row.id;
  }

  async function preBook(code, showtimeId, hallId, price, labels) {
    const [res] = await conn.query(
      `INSERT INTO bookings (booking_code, user_id, showtime_id, status) VALUES (?, ?, ?, 'CONFIRMED')`,
      [code, demoUserId, showtimeId]
    );
    const bookingId = res.insertId;
    for (const label of labels) {
      await conn.query(
        `INSERT INTO booking_seats (booking_id, showtime_id, seat_id) VALUES (?, ?, ?)`,
        [bookingId, showtimeId, await seatId(hallId, label)]
      );
    }
    await conn.query(
      `INSERT INTO payments (booking_id, amount, method, status) VALUES (?, ?, 'CARD', 'PAID')`,
      [bookingId, price * labels.length]
    );
    await createTickets(conn, bookingId);
  }

  await preBook('CB-DEMO01', 1, 1, 280, ['C3', 'C4', 'D5', 'D6']);
  await preBook('CB-DEMO02', 1, 1, 280, ['F1', 'F2']);
  await preBook('CB-DEMO03', 3, 2, 350, ['B3', 'B4', 'B5']);

  await conn.end();
  console.log('Database "' + DB_NAME + '" is ready.');
  console.log('  3 movies, 2 halls (48 seats each), 6 showtimes, 9 pre-booked seats (with tickets)');
  console.log('  Logins:  admin@cinebook.test / admin123   |   staff@cinebook.test / staff123');
}

main().catch((err) => {
  console.error('Seed failed: ' + explainDbError(err));
  process.exit(1);
});
