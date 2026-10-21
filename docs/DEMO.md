# CineBook demo script (about 6 minutes)

Before you start: `npm run reset`, `npm start`, open http://localhost:3000 in two browser tabs.

## 1. Customer books seats  (deck: customer flowchart, algorithm steps 1 to 11)
1. Home page: "Customers see every movie with its synopsis and upcoming showtimes."
2. Click a Starfall showtime. Seat map: green = free, grey = taken, gaps = aisles, screen at the top.
3. Pick 3 seats, press **Continue to checkout**. "The seats are now PENDING. They are held for 5 minutes" (point at the countdown).
4. Pay with `4000 0000 0000 0002`. "Declined, and the hold stays so they can retry." (the payment 'No' loop)
5. Pay with `4242 4242 4242 4242` (any name, email, 12/30, 123).
6. Ticket page: one QR ticket per seat, plus the booking code. Point the QR at a phone camera if you want.

## 2. The double-booking guard  (deck: "Seat available?" decision)
1. Open the same showtime in **both** tabs. Both maps show seat B2 as green.
2. Tab A: pick B2 and press Continue (don't pay).
3. Tab B (its map is now out of date): pick B2 and press Continue. It says "just taken" and refreshes the map. Say: "The database itself refuses a seat that's already held, so two people can never get the same one."

## 3. Find and cancel  (deck: cancel and refund flowchart)
1. Top bar: **Find my booking**, enter the code and email. Open the ticket page.
2. **Cancel booking**, confirm. "Refunded, and the seats are free again." Show the seat map: they are green.

## 4. Staff at the door  (deck: staff flow)
1. **Staff login** (`staff@cinebook.test` / `staff123`). Paste a ticket code from step 1, **Check ticket**. Green: ENTRY GRANTED.
2. Check the same code again: red, ALREADY USED. "A ticket works once."

## 5. Admin  (deck: admin flow)
1. Log out, log in as `admin@cinebook.test` / `admin123`.
2. Add a movie (with a synopsis). Add a showtime for it.
3. Try an overlapping showtime in the same cinema: refused with a clear message.
4. Open the home page: the new movie and showtime are there.

## If something goes wrong
- Page won't load: is `npm start` still running?  Movie list empty: `npm run reset`.
- Locked out of login: wait a minute or restart the server.
