-- CineBook schema (follows the "Class / Entity Concepts" slide)
-- Small changes from the slide, all on purpose:
--   * ids are auto-increment integers (easier to debug than UUIDs)
--   * users has email + password_hash (guests need an email, staff/admin need a password)
--   * seats has col_pos so aisles are "gaps" in the grid, not special seats
--   * booking_seats is a junction table (a booking can hold many seats)
--   * UNIQUE(showtime_id, seat_id) is what guarantees a seat is never sold twice
--   * bookings.hold_expires_at lets a PENDING hold expire
--   * tickets has seat_id (one ticket per seat) and used_at (so a QR can't be reused)
--   * movies has a synopsis, and showtimes have a price (set per showtime by the admin)

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS payments, tickets, booking_seats, bookings, showtimes, seats, halls, movies, users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NULL,                       -- NULL for guest customers
  role          ENUM('customer','staff','admin') NOT NULL DEFAULT 'customer'
);

CREATE TABLE movies (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  title        VARCHAR(150) NOT NULL,
  genre        VARCHAR(50)  NOT NULL,
  duration_min INT          NOT NULL,
  rating       VARCHAR(10)  NOT NULL,
  synopsis     TEXT         NULL                         -- short description shown on the movie list
);

CREATE TABLE halls (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  total_seats INT         NOT NULL
);

CREATE TABLE seats (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  hall_id   INT     NOT NULL,
  row_label CHAR(1) NOT NULL,
  seat_no   TINYINT NOT NULL,
  col_pos   TINYINT NOT NULL,                            -- column in the drawn grid (gaps = aisles)
  UNIQUE KEY uq_hall_seat (hall_id, row_label, seat_no),
  FOREIGN KEY (hall_id) REFERENCES halls(id)
);

CREATE TABLE showtimes (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  movie_id  INT          NOT NULL,
  hall_id   INT          NOT NULL,
  starts_at DATETIME     NOT NULL,
  price     DECIMAL(8,2) NOT NULL,
  FOREIGN KEY (movie_id) REFERENCES movies(id),
  FOREIGN KEY (hall_id)  REFERENCES halls(id)
);

CREATE TABLE bookings (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  booking_code    VARCHAR(12) NOT NULL UNIQUE,
  user_id         INT         NULL,                      -- filled in at checkout (a hold exists before we know who is paying)
  showtime_id     INT         NOT NULL,
  status          ENUM('PENDING','CONFIRMED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  hold_expires_at DATETIME    NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id),
  FOREIGN KEY (showtime_id) REFERENCES showtimes(id)
);

CREATE TABLE booking_seats (
  booking_id  INT NOT NULL,
  showtime_id INT NOT NULL,
  seat_id     INT NOT NULL,
  PRIMARY KEY (booking_id, seat_id),
  UNIQUE KEY uq_showtime_seat (showtime_id, seat_id),    -- the double-booking guard
  FOREIGN KEY (booking_id)  REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (showtime_id) REFERENCES showtimes(id),
  FOREIGN KEY (seat_id)     REFERENCES seats(id)
);

CREATE TABLE tickets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  booking_id  INT         NOT NULL,
  seat_id     INT         NOT NULL,
  ticket_code VARCHAR(20) NOT NULL UNIQUE,
  qr_code     MEDIUMTEXT  NULL,
  used_at     DATETIME    NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id)    REFERENCES seats(id)
);

CREATE TABLE payments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT          NOT NULL UNIQUE,               -- one payment per booking (1:1)
  amount     DECIMAL(8,2) NOT NULL,
  method     VARCHAR(20)  NOT NULL,
  status     ENUM('PAID','FAILED','REFUNDED') NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);
