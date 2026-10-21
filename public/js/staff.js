// Ticket checker for staff (and admins).
//   * a ticket code (TK-...)  -> checked and let in straight away
//   * a booking code (CB-...) -> shows the booking's tickets; staff choose who to let in

const TITLES = {
  valid: 'ENTRY GRANTED',
  already_used: 'DENIED: ALREADY USED',
  cancelled: 'DENIED: BOOKING CANCELLED',
  expired: 'DENIED: SHOW FINISHED',
  not_found: 'TICKET NOT FOUND',
  bad_code: 'CHECK THE CODE',
};
const BOOKING_TITLES = {
  ok: 'BOOKING FOUND',
  not_paid: 'DENIED: NOT PAID',
  cancelled: 'DENIED: BOOKING CANCELLED',
  expired: 'DENIED: SHOW FINISHED',
};

const verdictBox = () => document.getElementById('verdict');
const panelBox = () => document.getElementById('booking-panel');

function detail(label, value) {
  const line = el('div', 'detail');
  line.appendChild(el('strong', null, label + ': '));
  line.appendChild(document.createTextNode(value));
  return line;
}

// ---------- one ticket ----------

function showVerdict(data, titleOverride) {
  panelBox().hidden = true;
  const box = verdictBox();
  box.textContent = '';
  box.className = 'verdict ' + (data.result === 'valid' ? 'granted' : 'denied');
  box.appendChild(el('h2', null, titleOverride || TITLES[data.result] || 'CHECK FAILED'));
  box.appendChild(el('p', null, data.message));

  const t = data.ticket;
  if (t) {
    box.appendChild(detail('Seat', t.seat));
    box.appendChild(detail('Movie', t.movie_title));
    box.appendChild(detail('Cinema', t.hall_name));
    box.appendChild(detail('Showing', formatDay(t.starts_at) + ', ' + formatTime(t.starts_at)));
    if (t.used_at) box.appendChild(detail('Used at', formatWhen(t.used_at)));
  }
  if (data.warning) box.appendChild(el('p', 'warn-line', data.warning));
  box.hidden = false;
}

async function checkTicket(code) {
  const { status, data } = await postJson('/api/staff/validate', { ticket_code: code });
  if (status === 401) return go('/login.html');
  showVerdict(data || { result: 'bad_code', message: 'Something went wrong. Please try again.' });
}

// ---------- a whole booking ----------

function ticketRow(t, canAdmit) {
  const row = el('div', 'ticket-row');
  row.appendChild(el('span', 'seat-label', 'Seat ' + t.seat));
  row.appendChild(el('span', 'badge ' + (t.used ? 'used' : 'valid'), t.used ? 'Used' : 'Valid'));
  row.appendChild(el('span', 'row-note', t.used ? 'Used at ' + formatWhen(t.used_at) : t.ticket_code));
  if (canAdmit && !t.used) {
    const btn = el('button', 'btn admit-btn', 'Let in');
    btn.type = 'button';
    btn.setAttribute('data-ticket', t.ticket_code);
    btn.addEventListener('click', () => admit([t.ticket_code], t.seat));
    row.appendChild(btn);
  }
  return row;
}

function showBooking(data, note) {
  verdictBox().hidden = true;
  const box = panelBox();
  const b = data.booking;
  box.textContent = '';
  box.className = 'booking-panel ' + (data.result === 'ok' ? 'found' : 'denied');

  box.appendChild(el('h2', null, BOOKING_TITLES[data.result] || 'CHECK FAILED'));
  box.appendChild(el('div', 'booking-code-line', b.booking_code));
  if (note) box.appendChild(el('p', 'action-note ' + (note.ok ? 'good' : 'bad'), note.text));
  box.appendChild(el('p', null, data.message));

  box.appendChild(detail('Movie', b.movie_title));
  box.appendChild(detail('Cinema', b.hall_name));
  box.appendChild(detail('Showing', formatDay(b.starts_at) + ', ' + formatTime(b.starts_at)));
  if (b.customer_name) box.appendChild(detail('Booked by', b.customer_name));
  if (data.warning) box.appendChild(el('p', 'warn-line', data.warning));

  if (b.tickets.length > 0) {
    const canAdmit = data.result === 'ok';
    const list = el('div', 'ticket-rows');
    b.tickets.forEach((t) => list.appendChild(ticketRow(t, canAdmit)));
    box.appendChild(list);

    const waiting = b.tickets.filter((t) => !t.used);
    if (canAdmit && waiting.length >= 2) {
      const all = el('button', 'btn', 'Let in all (' + waiting.length + ')');
      all.type = 'button';
      all.id = 'admit-all-btn';
      all.addEventListener('click', () => admit(waiting.map((t) => t.ticket_code), waiting.length + ' tickets'));
      box.appendChild(all);
    }
  }
  box.hidden = false;
}

async function lookupBooking(code, note) {
  const { status, data } = await postJson('/api/staff/booking', { booking_code: code });
  if (status === 401) return go('/login.html');
  if (status === 404) return showVerdict(data, 'BOOKING NOT FOUND');
  if (!data || !data.booking) return showVerdict(data || { result: 'bad_code', message: 'Something went wrong. Please try again.' });
  showBooking(data, note);
}

// Let one or more tickets in. Each ticket is checked on its own, so a ticket still only works once.
async function admit(ticketCodes, what) {
  const bookingCode = panelBox().querySelector('.booking-code-line').textContent;
  panelBox().querySelectorAll('button').forEach((b) => { b.disabled = true; });

  let granted = 0;
  const problems = [];
  for (const code of ticketCodes) {
    try {
      const { status, data } = await postJson('/api/staff/validate', { ticket_code: code });
      if (status === 401) return go('/login.html');
      if (data && data.result === 'valid') granted += 1;
      else problems.push(data && data.message ? data.message : 'Could not check a ticket.');
    } catch (err) {
      problems.push('Could not reach the server.');
    }
  }

  const note = granted === ticketCodes.length
    ? { ok: true, text: 'ENTRY GRANTED for ' + what + '.' }
    : { ok: false, text: 'Let in ' + granted + ' of ' + ticketCodes.length + '. ' + problems[0] };
  await lookupBooking(bookingCode, note); // show what the system now says
  document.getElementById('ticket_code').focus();
}

// ---------- the box at the top ----------

async function init() {
  const user = await requireRole(['staff', 'admin']);
  if (!user) return;
  drawUserBar(user);
  document.getElementById('page').hidden = false;

  const input = document.getElementById('ticket_code');
  const button = document.getElementById('check-btn');
  input.focus();

  document.getElementById('check-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (!code) {
      showVerdict({ result: 'bad_code', message: 'Type or scan a ticket code or booking code first.' });
      return;
    }
    button.disabled = true;
    try {
      if (code.startsWith('CB-')) await lookupBooking(code);
      else await checkTicket(code);
    } catch (err) {
      showVerdict({ result: 'bad_code', message: 'Could not reach the server. Please try again.' });
    }
    button.disabled = false;
    input.value = '';
    input.focus(); // ready for the next customer
  });
}

init();
