// Booking page: one booking by its code.
// The code alone only tells us the status. To show the tickets we also need the email used
// (remembered from checkout, or typed on the "Find my booking" page).

const code = new URLSearchParams(location.search).get('code');
const root = document.getElementById('booking-root');

function rememberedEmail() {
  try { return sessionStorage.getItem('cb_email'); } catch (e) { return null; }
}
function forgetEmail() {
  try { sessionStorage.removeItem('cb_email'); } catch (e) { /* ignore */ }
}

function row(label, value) {
  const r = el('div', 'row-line');
  r.appendChild(el('span', null, label));
  if (typeof value === 'string') r.appendChild(el('span', null, value));
  else r.appendChild(value);
  return r;
}

function message(title, text, linkHref, linkText) {
  root.textContent = '';
  const box = el('div', 'card');
  box.appendChild(el('h2', null, title));
  box.appendChild(el('p', 'empty', text));
  const a = el('a', 'btn', linkText);
  a.href = linkHref;
  box.appendChild(a);
  root.appendChild(box);
}

async function init() {
  try {
    if (!code) throw new Error('No code');
    const res = await fetch('/api/bookings/' + encodeURIComponent(code));
    if (!res.ok) throw new Error('Not found');
    const pub = await res.json();
    const enc = encodeURIComponent(pub.booking_code);

    if (pub.status === 'PENDING') return go('/checkout.html?code=' + enc);
    if (pub.status === 'CANCELLED') {
      return message('This booking was cancelled', 'The seats were released. You can choose new ones any time.', '/', 'Back to movies');
    }

    // paid booking: we need the email to show the tickets
    const email = rememberedEmail();
    if (!email) return go('/find.html?code=' + enc);

    const { status, data } = await postJson('/api/bookings/lookup', { code: pub.booking_code, email });
    if (status === 404) {
      forgetEmail();
      return go('/find.html?code=' + enc + '&retry=1');
    }
    if (status !== 200) throw new Error('Lookup failed');
    drawBooking(data, email);
  } catch (err) {
    message('Booking not found', 'Please check the booking code and try again.', '/find.html', 'Find my booking');
  }
}

function ticketCard(t, b) {
  const card = el('div', 'ticket');
  card.setAttribute('data-ticket', t.ticket_code);

  const info = el('div', 'ticket-info');
  info.appendChild(el('div', 'ticket-movie', b.movie_title + ' (' + b.rating + ')'));
  info.appendChild(el('div', 'ticket-meta', b.hall_name + ' · ' + formatDay(b.starts_at) + ', ' + formatTime(b.starts_at)));
  info.appendChild(el('div', 'ticket-seat', 'Seat ' + t.seat));
  info.appendChild(el('div', 'ticket-code', t.ticket_code));
  info.appendChild(el('span', 'badge ' + (t.used ? 'used' : 'valid'), t.used ? 'Used' : 'Valid'));
  card.appendChild(info);

  const img = el('img', 'qr');
  img.src = t.qr_code;
  img.alt = 'QR code for ticket ' + t.ticket_code;
  card.appendChild(img);
  return card;
}

function drawBooking(b, email) {
  root.textContent = '';

  const top = el('div', 'confirmed');
  top.appendChild(el('div', 'tick', '✓'));
  top.appendChild(el('h1', null, 'Booking confirmed!'));
  top.appendChild(el('p', 'small', 'Your booking code'));
  const codeBox = el('div', 'code-box', b.booking_code);
  codeBox.id = 'booking-code';
  top.appendChild(codeBox);
  root.appendChild(top);

  root.appendChild(el('h2', 'section-title', b.tickets.length === 1 ? 'Your ticket' : 'Your tickets'));
  const list = el('div', 'tickets');
  b.tickets.forEach((t) => list.appendChild(ticketCard(t, b)));
  root.appendChild(list);
  root.appendChild(el('p', 'small', 'Show the QR code at the cinema entrance.'));

  const card = el('section', 'card');
  card.appendChild(el('h2', null, 'Booking details'));
  card.appendChild(row('Movie', b.movie_title + ' (' + b.rating + ')'));
  card.appendChild(row('Cinema', b.hall_name));
  card.appendChild(row('When', formatDay(b.starts_at) + ', ' + formatTime(b.starts_at)));
  const chips = el('span', 'chips');
  b.seats.forEach((label) => chips.appendChild(el('span', 'chip', label)));
  card.appendChild(row('Seats', chips));
  card.appendChild(row('Booked by', b.customer_name));
  card.appendChild(row('Paid', formatPrice(b.amount_paid)));

  // cancel
  const panel = el('div', 'cancel-panel');
  panel.id = 'cancel-panel';
  panel.hidden = true;
  panel.appendChild(el('p', null, 'Cancel this booking? ' + formatPrice(b.amount_paid) + ' will be refunded and your seats will be released.'));
  const panelActions = el('div', 'actions');
  const yes = el('button', 'btn danger', 'Yes, cancel booking');
  yes.type = 'button'; yes.id = 'cancel-yes';
  const no = el('button', 'btn secondary', 'Keep my booking');
  no.type = 'button'; no.id = 'cancel-no';
  panelActions.appendChild(yes);
  panelActions.appendChild(no);
  panel.appendChild(panelActions);
  const cancelError = el('p', 'notice bad', '');
  cancelError.id = 'cancel-error';
  cancelError.hidden = true;
  panel.appendChild(cancelError);

  const actions = el('div', 'actions');
  const home = el('a', 'btn', 'Back to movies');
  home.href = '/';
  actions.appendChild(home);
  const print = el('button', 'btn secondary', 'Print tickets');
  print.type = 'button'; print.id = 'print-btn';
  print.addEventListener('click', () => window.print());
  actions.appendChild(print);

  if (b.can_cancel) {
    const cancel = el('button', 'btn outline-danger', 'Cancel booking');
    cancel.type = 'button'; cancel.id = 'cancel-btn';
    cancel.addEventListener('click', () => { panel.hidden = false; cancel.hidden = true; });
    actions.appendChild(cancel);
    no.addEventListener('click', () => { panel.hidden = true; cancelError.hidden = true; cancel.hidden = false; });
    yes.addEventListener('click', () => cancelBooking(b, email, yes, cancelError));
  } else if (b.cancel_blocked_reason) {
    card.appendChild(el('p', 'small', b.cancel_blocked_reason));
  }
  card.appendChild(actions);
  card.appendChild(panel);
  root.appendChild(card);
}

async function cancelBooking(b, email, yesButton, errorBox) {
  errorBox.hidden = true;
  yesButton.disabled = true;
  yesButton.textContent = 'Cancelling...';
  try {
    const { status, data } = await postJson('/api/bookings/' + encodeURIComponent(b.booking_code) + '/cancel', { email });
    if (status === 200) {
      root.textContent = '';
      const box = el('div', 'card');
      box.appendChild(el('div', 'tick bad-tick', '✓'));
      box.appendChild(el('h2', null, 'Booking cancelled'));
      box.appendChild(el('p', 'empty', formatPrice(data.refunded) + ' has been refunded. Your seats were released.'));
      const a = el('a', 'btn', 'Back to movies');
      a.href = '/';
      box.appendChild(a);
      root.appendChild(box);
      return;
    }
    errorBox.textContent = (data && data.message) || 'Something went wrong. Please try again.';
  } catch (err) {
    errorBox.textContent = 'Could not reach the server. Please try again.';
  }
  errorBox.hidden = false;
  yesButton.disabled = false;
  yesButton.textContent = 'Yes, cancel booking';
}

init();
