# CineBook full test checklist

Tick each box. Start with `npm run reset` and `npm start`. "Expect" says what you should see.

## Setup
- [ ] `npm install`, `npm run seed`, `npm start` finish without errors. Expect: "CineBook is running at http://localhost:3000".
- [ ] Open http://localhost:3000. Expect: 3 movies with synopsis, rating, genre and showtimes.

## Browsing and seats
- [ ] Click a showtime. Expect: seat map, screen on top, aisle gaps, some grey (taken) seats.
- [ ] Click grey seats. Expect: nothing happens.
- [ ] Select and unselect seats. Expect: gold when selected, running total updates.
- [ ] Select 9 seats. Expect: only 8 allowed, with a message.
- [ ] Shrink the browser to phone width. Expect: layout still usable, seat map scrolls sideways.

## Holding and double-booking
- [ ] Continue with 2 seats. Expect: checkout page, 5:00 countdown running.
- [ ] Open the same showtime in another tab. Expect: your held seats are grey.
- [ ] Open a showtime in two tabs. In tab A pick seat B2 and Continue. In tab B (still showing B2 green) pick B2 and Continue. Expect: "just taken", map refreshes.
- [ ] "Change my seats" on checkout. Expect: back to the map, seats green again.
- [ ] Wait 5 minutes on a checkout page (or just leave it). Expect: "Your seat hold expired".

## Payment
- [ ] Submit the empty form. Expect: every field flagged.
- [ ] Card `4000 0000 0000 0002`. Expect: declined message, can retry, seats still held.
- [ ] Card `4242 4242 4242 4242`. Expect: ticket page with a booking code.
- [ ] Card number box groups digits in 4s; expiry adds the slash.

## Tickets and finding a booking
- [ ] Ticket page shows one card per seat, each with a QR and a Valid badge.
- [ ] Scan a QR with a phone camera. Expect: text like TK-XXXXXXXX.
- [ ] Open the ticket page in a new tab. Expect: sent to "Find my booking".
- [ ] Find my booking with the right code + email. Expect: tickets. With a wrong email. Expect: "couldn't find a booking".
- [ ] `CB-DEMO01` with `demo@cinebook.test`. Expect: 4 tickets.

## Cancel and refund
- [ ] Cancel a booking, confirm. Expect: "refunded" message, seats green again on the map.
- [ ] Open the cancelled booking again. Expect: "This booking was cancelled".
- [ ] Cancel after a ticket was checked at the door. Expect: not allowed, reason shown.

## Staff
- [ ] Log in as staff. Expect: ticket checker page (no Admin link).
- [ ] Check a good ticket. Expect: green ENTRY GRANTED. Check it again. Expect: red ALREADY USED.
- [ ] Check a code that doesn't exist. Expect: TICKET NOT FOUND. Check a cancelled booking's ticket. Expect: DENIED.
- [ ] Open `/admin.html` while logged in as staff. Expect: "Access denied".

## Admin
- [ ] Log in as admin. Expect: admin page with showtimes and movies tables.
- [ ] Add a movie with an empty form. Expect: fields flagged. Add a valid movie. Expect: success, appears in the table.
- [ ] Add a showtime. Expect: success, and it shows on the home page with all seats free.
- [ ] Add an overlapping showtime in the same cinema. Expect: "already booked" message.
- [ ] Add a showtime in the past. Expect: "Pick a time in the future".

## Login and safety
- [ ] Wrong password. Expect: "Incorrect email or password."
- [ ] Open `/admin.html` while logged out. Expect: sent to the login page.
- [ ] Log out. Expect: back to the login page, and `/admin.html` sends you to login again.
- [ ] Try `http://localhost:3000/.env` and `/server.js`. Expect: "Page not found".

## When things break
- [ ] Stop MySQL and press reload. Expect: "Could not load movies" (the site stays up).
- [ ] Stop MySQL and run `npm start`. Expect: "Cannot reach MySQL" message.
- [ ] Run `npm run reset`. Expect: demo data is back.
