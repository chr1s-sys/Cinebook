// Seat map page: fetch /api/showtimes/:id/seats and draw the grid.

const params = new URLSearchParams(location.search);
const showtimeId = params.get('showtime');
const MAX_SEATS = 8;
const selected = new Map(); // seat id -> label like "C3"
let pricePerSeat = 0;

async function loadSeats() {
  const info = document.getElementById('show-info');
  try {
    if (!showtimeId) throw new Error('No showtime chosen');
    const res = await fetch('/api/showtimes/' + encodeURIComponent(showtimeId) + '/seats');
    if (!res.ok) throw new Error('Showtime not found');
    const data = await res.json();
    pricePerSeat = data.showtime.price;
    drawInfo(data);
    drawGrid(data);
    updateSummary();
  } catch (err) {
    info.textContent = '';
    info.appendChild(el('p', 'error', 'Could not load this showtime. Go back and pick another one.'));
  }
}

function drawInfo(data) {
  const s = data.showtime;
  const free = data.seats.filter((seat) => !seat.taken).length;
  const info = document.getElementById('show-info');
  info.textContent = '';
  info.appendChild(el('h1', 'show-title', s.movie_title));
  info.appendChild(
    el('p', 'show-meta',
      s.hall_name + ' · ' + formatDay(s.starts_at) + ', ' + formatTime(s.starts_at) +
      ' · ' + s.rating + ' · ' + s.duration_min + ' min · ' + formatPrice(s.price) + ' per seat')
  );
  info.appendChild(el('p', 'availability', free + ' of ' + data.seats.length + ' seats available'));
}

function drawGrid(data) {
  const grid = document.getElementById('seat-grid');
  grid.textContent = '';

  // group seats by row letter
  const rows = {};
  data.seats.forEach((seat) => (rows[seat.row] = rows[seat.row] || []).push(seat));

  Object.keys(rows).sort().forEach((rowLetter) => {
    const rowEl = el('div', 'seat-row');
    rowEl.appendChild(el('span', 'row-label', rowLetter));

    // walk every column; a column with no seat is an aisle (walkway)
    for (let col = 1; col <= data.columns; col++) {
      const seat = rows[rowLetter].find((x) => x.col === col);
      rowEl.appendChild(seat ? seatButton(seat) : el('span', 'aisle'));
    }

    rowEl.appendChild(el('span', 'row-label', rowLetter));
    grid.appendChild(rowEl);
  });
}

function seatButton(seat) {
  const label = seat.row + seat.number;
  const btn = el('button', 'seat' + (seat.taken ? ' taken' : ''), String(seat.number));
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Seat ' + label + (seat.taken ? ', taken' : ''));
  if (seat.taken) {
    btn.disabled = true;
  } else {
    btn.addEventListener('click', () => {
      hideMessage();
      if (selected.has(seat.id)) {
        selected.delete(seat.id);
        btn.classList.remove('selected');
      } else {
        if (selected.size >= MAX_SEATS) {
          showMessage('You can book up to ' + MAX_SEATS + ' seats at a time.');
          return;
        }
        selected.set(seat.id, label);
        btn.classList.add('selected');
      }
      updateSummary();
    });
  }
  return btn;
}

function updateSummary() {
  const text = document.getElementById('selected-text');
  const total = document.getElementById('total');
  document.getElementById('continue-btn').disabled = selected.size === 0;
  if (selected.size === 0) {
    text.textContent = 'Pick your seats';
    total.textContent = '';
    return;
  }
  const labels = [...selected.values()].sort();
  text.textContent = 'Selected: ' + labels.join(', ');
  total.textContent = labels.length + ' × ' + formatPrice(pricePerSeat) + ' = ' + formatPrice(labels.length * pricePerSeat);
}

loadSeats();


// ---- messages ----
function showMessage(text) {
  const box = document.getElementById('seat-message');
  box.textContent = text;
  box.hidden = false;
}
function hideMessage() {
  document.getElementById('seat-message').hidden = true;
}

// ---- "Continue to checkout": hold the chosen seats, then go to the checkout page ----
document.getElementById('continue-btn').addEventListener('click', async () => {
  if (selected.size === 0) return;
  const button = document.getElementById('continue-btn');
  button.disabled = true;
  button.textContent = 'Holding your seats...';
  hideMessage();

  try {
    const { status, data } = await postJson('/api/bookings', {
      showtime_id: Number(showtimeId),
      seat_ids: [...selected.keys()],
    });

    if (status === 201) {
      go('/checkout.html?code=' + encodeURIComponent(data.booking_code));
      return;
    }

    // someone else got there first (or something else went wrong): refresh the map
    selected.clear();
    await loadSeats();
    showMessage((data && data.message) || 'Something went wrong. Please try again.');
  } catch (err) {
    showMessage('Could not reach the server. Please try again.');
  }
  button.textContent = 'Continue to checkout';
  updateSummary();
});
