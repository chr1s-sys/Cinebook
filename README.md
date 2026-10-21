# CineBook

A cinema ticketing website. Customers browse movies, pick seats on a live seat map, pay (demo card),
get QR tickets, and can find or cancel their booking. Staff check tickets at the door. Admins add movies
and showtimes. Built with Node.js + Express + MySQL and plain HTML/CSS/JavaScript.

## Run it

1. Install **Node.js (LTS)** and make sure **MySQL is running**.
2. Open this folder in VS Code and open a terminal in it.
3. Copy `.env.example` to `.env` and put your MySQL password in it
   (Windows: `copy .env.example .env`   Mac/Linux: `cp .env.example .env`).
4. `npm install`
5. `npm run seed`  (creates the `cinebook` database and demo data)
6. `npm start`, then open http://localhost:3000

`npm run reset` puts the demo data back to how it started (run it before a demo).

## Logins

Customers do not log in. They book as guests and find their booking with the booking code + email.

| Role | Email | Password | Page |
|---|---|---|---|
| Admin | `admin@cinebook.test` | `admin123` | `/admin.html` |
| Staff | `staff@cinebook.test` | `staff123` | `/staff.html` |

Demo booking to look up: `CB-DEMO01` with `demo@cinebook.test`.

## What it does

- **Customer:** browse movies and showtimes, choose seats (held for 5 minutes), pay, get one QR ticket per seat,
  find a booking, cancel it for a refund (until the showtime starts).
- **Staff:** type or scan a ticket code. A good ticket is let in and marked used, so it only works once.
- **Admin:** add movies (with synopsis) and showtimes. A cinema can't have two overlapping shows.
- **Payment is a demo.** `4242 4242 4242 4242` is approved and `4000 0000 0000 0002` is declined.
  No real money moves and card numbers are never saved.

## If something goes wrong

| You see | Do this |
|---|---|
| "Cannot reach MySQL" | Start MySQL, then run `npm start` again. |
| "MySQL refused the username or password" | Fix `DB_USER` / `DB_PASSWORD` in your `.env` file. |
| "database does not exist" / "empty or out of date" | Run `npm run seed`. |
| "Port 3000 is already in use" | Close the other program, or set `PORT=3001` in `.env`. |
| The movie list looks empty | The demo showtimes have passed. Run `npm run reset`. |
| Logged out suddenly | Restarting the server logs everyone out. Log in again. |
| Locked out of login | 5 wrong passwords lock that email for a minute. Wait, or restart the server. |

## Folder guide

- `server.js` starts the website. `db.js` connects to MySQL.
- `routes/` the API (movies, showtimes, bookings, login, admin, staff).
- `lib/` hold expiry, QR tickets, login sessions, friendly database errors.
- `sql/schema.sql` the tables (from the Class / Entity slide). `sql/seed.js` the demo data.
- `public/` the pages and their scripts.
- `docs/` demo script, test checklist, and a comparison with the presentation.

## Progress

- [x] 20% schema, seed, movie list, live seat map
- [x] 40% seat hold, checkout, mock payment, booking code
- [x] 60% QR tickets, find booking, cancel and refund
- [x] 80% staff and admin login, add movie and showtime, ticket checker
- [x] 100% polish, friendly errors, docs