# CineBook vs the presentation

Built exactly as presented unless noted. "Designed, not built" items are listed with a one-line answer for Q&A.

## Features (slides 9 to 11)

| Deck | Status | Notes / what to say |
|---|---|---|
| Customer F1 Browse movies (synopsis, genre, rating) | Built | Movie list shows all three. |
| Customer F2 View showtimes (dates, times, halls) | Built | |
| Customer F3 Select seats on a live map | Built | Held for 5 minutes (the PENDING step). |
| Customer F4 Pay by card **or e-wallet** | Card built | "Payment is a mock gateway. E-wallet would plug into the same step." |
| Customer F5 QR e-ticket | Built | One ticket per seat. |
| Customer F6 Cancel before showtime + refund | Built | Blocked after the showtime starts or a ticket is used. |
| Staff F1 Validate ticket by QR | Built | Type or paste the code. "Camera scanning is the next step." |
| Staff F2 Assist walk-in booking | Built via the booking pages | Staff book on the customer's behalf. A card on the staff page links there. |
| Staff F3 Approve and process refunds | Designed, not built | "Refunds are automatic when a customer cancels. Staff approval is for exceptions." |
| Admin F1 Add, edit, remove films | Add only | "Add is built; editing and removing are the same form pattern." |
| Admin F2 Showtimes and pricing | Add only | Date, time, cinema and price per showtime; no overlaps allowed. |
| Admin F3 Halls and seat maps | Designed, not built | Two seeded halls (6 rows x 8, with aisles). No hall editor. |
| Admin F4 Sales reports | Designed, not built | The admin table shows seats sold per showtime. No revenue report. |

Responsibilities slide: "resolve escalated disputes" is also designed, not built.
Public / Internal / Restricted (slide 7): built. Customers need no login; staff and admin do.

## Algorithm (slide 15) to code

| Step | Where it happens |
|---|---|
| 1 Display movies and showtimes | `GET /api/movies`, `public/index.html` |
| 3 to 4 Seat map, choose seats | `GET /api/showtimes/:id/seats`, `public/seats.html` |
| 5 Seat check, then mark PENDING | `POST /api/bookings` (the UNIQUE(showtime, seat) rule), `routes/bookings.js` |
| 6 Enter payment details | `public/checkout.html` |
| 7 Verify with the gateway | `mockGateway()` in `routes/bookings.js` |
| 8 Payment fails: back to step 6 | pay returns 402, the hold stays |
| 9 Generate QR ticket | `lib/tickets.js` |
| 10 Save booking as CONFIRMED | the pay route |
| 11 Display the e-ticket | `public/booking.html` |

## Class / Entity (slide 17)

All eight entities exist with the same relationships. Small, deliberate differences:

- Ids are whole numbers, not UUIDs (easier to debug).
- `Booking.seatIds` (a list) became a `booking_seats` table; its UNIQUE(showtime, seat) rule prevents double-booking.
- Added: `Booking.booking_code` and `hold_expires_at`, `Ticket.seat_id`, `ticket_code` and `used_at`,
  `User.email` and `password_hash`, `Showtime.price`, `Movie.synopsis`.
- A seat's availability is worked out from bookings, not stored on the seat.
