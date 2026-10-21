// Checkout page: shows the held seats, a countdown, and the (fake) payment form.

const code = new URLSearchParams(location.search).get('code');
const root = document.getElementById('checkout-root');
let booking = null;
let secondsLeft = 0;
let timerId = null;

async function init() {
  try {
    if (!code) throw new Error('No booking code');
    const res = await fetch('/api/bookings/' + encodeURIComponent(code));
    if (!res.ok) throw new Error('Booking not found');
    booking = await res.json();

    if (booking.status === 'CONFIRMED') return go('/booking.html?code=' + encodeURIComponent(code));
    if (booking.status !== 'PENDING' || booking.seats.length === 0) return showExpired();

    drawPage();
    startCountdown(booking.seconds_left);
  } catch (err) {
    root.textContent = '';
    root.appendChild(el('p', 'error', 'We could not find that booking. Go back and choose your seats again.'));
    root.appendChild(backLink('/', 'Back to movies'));
  }
}

function backLink(href, text) {
  const a = el('a', 'btn secondary', text);
  a.href = href;
  return a;
}

// ---------- page layout ----------

function drawPage() {
  root.textContent = '';
  const grid = el('div', 'checkout-grid');
  grid.appendChild(summaryCard());
  grid.appendChild(paymentCard());
  root.appendChild(grid);
}

function line(label, valueNode) {
  const row = el('div', 'row-line');
  row.appendChild(el('span', null, label));
  if (typeof valueNode === 'string') row.appendChild(el('span', null, valueNode));
  else row.appendChild(valueNode);
  return row;
}

function summaryCard() {
  const card = el('section', 'card');
  card.appendChild(el('h2', null, 'Your order'));
  card.appendChild(line('Movie', booking.movie_title + ' (' + booking.rating + ')'));
  card.appendChild(line('Cinema', booking.hall_name));
  card.appendChild(line('When', formatDay(booking.starts_at) + ', ' + formatTime(booking.starts_at)));

  const chips = el('span', 'chips');
  booking.seats.forEach((label) => chips.appendChild(el('span', 'chip', label)));
  card.appendChild(line('Seats', chips));

  card.appendChild(line(booking.seat_count + ' × ' + formatPrice(booking.price_per_seat), formatPrice(booking.total)));

  const total = line('Total', formatPrice(booking.total));
  total.classList.add('total-line');
  card.appendChild(total);

  const actions = el('div', 'actions');
  const release = el('button', 'btn secondary', 'Change my seats');
  release.type = 'button';
  release.id = 'release-btn';
  release.addEventListener('click', releaseHold);
  actions.appendChild(release);
  card.appendChild(actions);
  return card;
}

function field(id, label, attrs) {
  const wrap = el('div', 'field');
  wrap.id = 'field-' + id;
  const lab = el('label', null, label);
  lab.setAttribute('for', id);
  const input = el('input');
  input.id = id;
  input.name = id;
  Object.keys(attrs || {}).forEach((k) => input.setAttribute(k, attrs[k]));
  wrap.appendChild(lab);
  wrap.appendChild(input);
  wrap.appendChild(el('div', 'msg'));
  return wrap;
}

function paymentCard() {
  const card = el('section', 'card');
  card.appendChild(el('h2', null, 'Payment'));

  const countdown = el('p', 'countdown', '');
  countdown.id = 'countdown';
  card.appendChild(countdown);

  const form = el('form');
  form.id = 'pay-form';
  form.noValidate = true;
  form.appendChild(field('name', 'Full name', { type: 'text', autocomplete: 'name', maxlength: '100' }));
  form.appendChild(field('email', 'Email', { type: 'email', autocomplete: 'email', maxlength: '150' }));
  form.appendChild(field('card_number', 'Card number', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '1234 5678 9012 3456', maxlength: '23' }));

  const two = el('div', 'two-cols');
  two.appendChild(field('expiry', 'Expiry (MM/YY)', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'MM/YY', maxlength: '5' }));
  two.appendChild(field('cvv', 'CVV', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '123', maxlength: '4' }));
  form.appendChild(two);

  const hint = el('div', 'hint');
  hint.appendChild(document.createTextNode('Demo mode: no real payment is made. Use '));
  hint.appendChild(el('code', null, '4242 4242 4242 4242'));
  hint.appendChild(document.createTextNode(' to pay, or '));
  hint.appendChild(el('code', null, '4000 0000 0000 0002'));
  hint.appendChild(document.createTextNode(' to see a declined payment. Any future expiry and any 3 digits work.'));
  form.appendChild(hint);

  const formError = el('p', 'notice bad');
  formError.id = 'form-error';
  formError.hidden = true;
  form.appendChild(formError);

  const pay = el('button', 'btn', 'Pay ' + formatPrice(booking.total));
  pay.type = 'submit';
  pay.id = 'pay-btn';
  form.appendChild(pay);

  form.addEventListener('submit', submitPayment);
  card.appendChild(form);

  // tidy typing: groups of 4 for the card, "/" for the expiry, digits only for the CVV
  form.querySelector('#card_number').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 19);
    e.target.value = digits.replace(/(.{4})/g, '$1 ').trim();
  });
  form.querySelector('#expiry').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
  });
  form.querySelector('#cvv').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  });

  return card;
}

// ---------- countdown ----------

function startCountdown(seconds) {
  secondsLeft = seconds;
  tick();
  timerId = setInterval(() => {
    secondsLeft -= 1;
    tick();
  }, 1000);
}

function tick() {
  const box = document.getElementById('countdown');
  if (!box) return;
  if (secondsLeft <= 0) {
    clearInterval(timerId);
    showExpired();
    return;
  }
  box.textContent = 'Your seats are held for ' + formatCountdown(secondsLeft);
  box.classList.toggle('warn', secondsLeft <= 60);
}

function showExpired() {
  if (timerId) clearInterval(timerId);
  root.textContent = '';
  const box = el('div', 'card');
  box.appendChild(el('h2', null, 'Your seat hold expired'));
  box.appendChild(el('p', 'empty', 'Seats are only held for a few minutes. Please choose your seats again.'));
  const back = backLink(booking ? '/seats.html?showtime=' + booking.showtime_id : '/', booking ? 'Choose seats again' : 'Back to movies');
  back.classList.remove('secondary');
  box.appendChild(back);
  root.appendChild(box);
}

// ---------- actions ----------

function clearErrors() {
  document.querySelectorAll('.field').forEach((f) => {
    f.classList.remove('invalid');
    f.querySelector('.msg').textContent = '';
  });
  const fe = document.getElementById('form-error');
  fe.hidden = true;
  fe.textContent = '';
}

async function submitPayment(event) {
  event.preventDefault();
  clearErrors();

  const button = document.getElementById('pay-btn');
  button.disabled = true;
  button.textContent = 'Processing payment...';

  const get = (id) => document.getElementById(id).value;
  try {
    const { status, data } = await postJson('/api/bookings/' + encodeURIComponent(code) + '/pay', {
      name: get('name'),
      email: get('email'),
      card_number: get('card_number'),
      expiry: get('expiry'),
      cvv: get('cvv'),
    });

    if (status === 200) {
      try { sessionStorage.setItem('cb_email', get('email').trim().toLowerCase()); } catch (e) { /* ignore */ }
      return go('/booking.html?code=' + encodeURIComponent(code));
    }
    if (status === 409) return go('/booking.html?code=' + encodeURIComponent(code)); // already paid
    if (status === 410) return showExpired();

    if (status === 400 && data && data.fields) {
      Object.keys(data.fields).forEach((id) => {
        const f = document.getElementById('field-' + id);
        if (f) {
          f.classList.add('invalid');
          f.querySelector('.msg').textContent = data.fields[id];
        }
      });
    } else {
      const fe = document.getElementById('form-error');
      fe.textContent = (data && data.message) || 'Something went wrong. Please try again.';
      fe.hidden = false;
    }
  } catch (err) {
    const fe = document.getElementById('form-error');
    fe.textContent = 'Could not reach the server. Please try again.';
    fe.hidden = false;
  }
  button.disabled = false;
  button.textContent = 'Pay ' + formatPrice(booking.total);
}

async function releaseHold() {
  const button = document.getElementById('release-btn');
  button.disabled = true;
  try {
    await postJson('/api/bookings/' + encodeURIComponent(code) + '/release');
  } catch (err) { /* even if this fails the hold expires by itself */ }
  go('/seats.html?showtime=' + booking.showtime_id);
}

init();
