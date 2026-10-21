// Movie list page: fetch /api/movies and draw a card per movie.

async function loadMovies() {
  const box = document.getElementById('movies');
  try {
    const res = await fetch('/api/movies');
    if (!res.ok) throw new Error('Bad response');
    const movies = await res.json();
    box.textContent = '';
    movies.forEach((m) => box.appendChild(movieCard(m)));
  } catch (err) {
    box.textContent = '';
    box.appendChild(el('p', 'error', 'Could not load movies. Is the server running?'));
  }
}

function movieCard(m) {
  const card = el('article', 'movie');
  card.appendChild(el('h2', null, m.title));

  const meta = el('div', 'meta');
  meta.appendChild(el('span', 'tag rating', m.rating));
  meta.appendChild(el('span', 'tag', m.genre));
  meta.appendChild(el('span', 'tag', m.duration_min + ' min'));
  card.appendChild(meta);
  if (m.synopsis) card.appendChild(el('p', 'synopsis', m.synopsis));

  if (m.showtimes.length === 0) {
    card.appendChild(el('p', 'empty', 'No upcoming showtimes.'));
    return card;
  }

  // group the showtimes by day
  const byDay = {};
  m.showtimes.forEach((s) => {
    const day = s.starts_at.slice(0, 10);
    (byDay[day] = byDay[day] || []).push(s);
  });

  Object.keys(byDay).sort().forEach((day) => {
    card.appendChild(el('div', 'day', formatDay(byDay[day][0].starts_at)));
    const row = el('div', 'showtimes');
    byDay[day].forEach((s) => {
      const link = el('a', 'showtime');
      link.href = '/seats.html?showtime=' + s.id;
      link.appendChild(el('div', 'time', formatTime(s.starts_at)));
      link.appendChild(el('div', 'info', s.hall_name + ' · ' + formatPrice(s.price)));
      link.appendChild(
        s.seats_left === 0
          ? el('div', 'soldout', 'Sold out')
          : el('div', 'info', s.seats_left + ' seats left')
      );
      row.appendChild(link);
    });
    card.appendChild(row);
  });

  return card;
}

loadMovies();
