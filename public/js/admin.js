// Admin page: add movies and showtimes, and see what exists.

async function getJson(url) {
  const res = await fetch(url);
  if (res.status === 401) { go('/login.html'); throw new Error('Not logged in'); }
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

function cell(text) { return el('td', null, text); }

function fillTable(tableId, rows) {
  const body = document.querySelector('#' + tableId + ' tbody');
  body.textContent = '';
  rows.forEach((cells) => {
    const tr = el('tr');
    cells.forEach((c) => (typeof c === 'string' ? tr.appendChild(cell(c)) : tr.appendChild(c)));
    body.appendChild(tr);
  });
}

function statusCell(upcoming) {
  const td = el('td');
  td.appendChild(el('span', 'badge ' + (upcoming ? 'valid' : 'used'), upcoming ? 'Upcoming' : 'Past'));
  return td;
}

function fillSelect(id, items, label) {
  const select = document.getElementById(id);
  const keep = select.value;
  select.textContent = '';
  const first = el('option', null, 'Choose...');
  first.value = '';
  select.appendChild(first);
  items.forEach((item) => {
    const o = el('option', null, label(item));
    o.value = String(item.id);
    select.appendChild(o);
  });
  select.value = keep;
}

async function refreshData() {
  const [movies, halls, showtimes] = await Promise.all([
    getJson('/api/admin/movies'),
    getJson('/api/admin/halls'),
    getJson('/api/admin/showtimes'),
  ]);

  fillTable('movies-table', movies.map((m) => [m.title, m.genre, m.duration_min + ' min', m.rating, String(m.showtime_count)]));
  fillTable('showtimes-table', showtimes.map((s) => [
    s.movie_title, s.hall_name, formatWhen(s.starts_at), formatPrice(s.price),
    s.seats_taken + ' / ' + s.total_seats, statusCell(s.upcoming),
  ]));
  fillSelect('movie_id', movies, (m) => m.title + ' (' + m.duration_min + ' min)');
  fillSelect('hall_id', halls, (h) => h.name + ' (' + h.total_seats + ' seats)');
}

// ---- forms ----

function clearForm(prefix, ids) {
  ids.forEach((id) => {
    const f = document.getElementById('field-' + id);
    f.classList.remove('invalid');
    f.querySelector('.msg').textContent = '';
  });
  document.getElementById(prefix + '-error').hidden = true;
  document.getElementById(prefix + '-ok').hidden = true;
}

function showFieldErrors(fields) {
  Object.keys(fields).forEach((id) => {
    const f = document.getElementById('field-' + id);
    if (f) {
      f.classList.add('invalid');
      f.querySelector('.msg').textContent = fields[id];
    }
  });
}

function setupForm({ formId, prefix, url, ids, read, onSuccess }) {
  const form = document.getElementById(formId);
  const button = document.getElementById(prefix + '-btn');
  const label = button.textContent;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearForm(prefix, ids);
    button.disabled = true;
    button.textContent = 'Saving...';
    try {
      const { status, data } = await postJson(url, read());
      if (status === 201) {
        form.reset();
        await refreshData();
        const ok = document.getElementById(prefix + '-ok');
        ok.textContent = '';
        onSuccess(ok, data);
        ok.hidden = false;
      } else if (status === 401) {
        return go('/login.html');
      } else if (status === 400 && data && data.fields) {
        showFieldErrors(data.fields);
      } else {
        const box = document.getElementById(prefix + '-error');
        box.textContent = (data && data.message) || 'Something went wrong. Please try again.';
        box.hidden = false;
      }
    } catch (err) {
      const box = document.getElementById(prefix + '-error');
      box.textContent = 'Could not reach the server. Please try again.';
      box.hidden = false;
    }
    button.disabled = false;
    button.textContent = label;
  });
}

async function init() {
  const user = await requireRole(['admin']);
  if (!user) return;
  drawUserBar(user);
  document.getElementById('page').hidden = false;

  try {
    await refreshData();
  } catch (err) {
    return; // (a missing login already sent us to the login page)
  }

  const val = (id) => document.getElementById(id).value;

  setupForm({
    formId: 'movie-form', prefix: 'movie', url: '/api/admin/movies',
    ids: ['title', 'genre', 'duration_min', 'rating', 'synopsis'],
    read: () => ({ title: val('title'), genre: val('genre'), duration_min: val('duration_min'), rating: val('rating'), synopsis: val('synopsis') }),
    onSuccess: (box, movie) => { box.textContent = 'Added "' + movie.title + '". You can now give it showtimes.'; },
  });

  setupForm({
    formId: 'show-form', prefix: 'show', url: '/api/admin/showtimes',
    ids: ['movie_id', 'hall_id', 'starts_at', 'price'],
    read: () => ({ movie_id: val('movie_id'), hall_id: val('hall_id'), starts_at: val('starts_at'), price: val('price') }),
    onSuccess: (box, show) => {
      box.appendChild(document.createTextNode('Added: ' + show.movie_title + ' in ' + show.hall_name + ', ' + formatWhen(show.starts_at) + '. '));
      const link = el('a', null, 'See it on the customer site');
      link.href = '/';
      box.appendChild(link);
    },
  });
}

init();
