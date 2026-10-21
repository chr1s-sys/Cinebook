// Shared by the login, admin and staff pages.

function homeFor(role) {
  return role === 'admin' ? '/admin.html' : '/staff.html';
}

// Who is logged in? (null if nobody)
async function getCurrentUser() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    return (await res.json()).user;
  } catch (err) {
    return null;
  }
}

// Use at the top of a protected page. Sends visitors to the login page if nobody is logged in,
// and shows "Access denied" if the account has the wrong role.
async function requireRole(roles) {
  const user = await getCurrentUser();
  if (!user) {
    go('/login.html');
    return null;
  }
  if (!roles.includes(user.role)) {
    showDenied(user, roles);
    return null;
  }
  return user;
}

function showDenied(user, roles) {
  drawUserBar(user);
  const main = document.querySelector('main');
  main.textContent = '';
  const card = el('section', 'card');
  card.appendChild(el('h2', null, 'Access denied'));
  card.appendChild(el('p', 'empty', 'This page is only for ' + roles.join(' or ') + ' accounts. You are logged in as ' + user.name + ' (' + user.role + ').'));
  const back = el('a', 'btn', 'Go to my page');
  back.href = homeFor(user.role);
  card.appendChild(back);
  main.appendChild(card);
}

// top-right of the page: who you are, a link to the other staff page (admins only), and Log out
function drawUserBar(user) {
  const bar = document.getElementById('user-bar');
  if (!bar) return;
  bar.textContent = '';
  bar.appendChild(el('span', 'navlink who', user.name + ' (' + user.role + ')'));
  if (user.role === 'admin') {
    const onAdmin = location.pathname.endsWith('/admin.html');
    const other = el('a', 'navlink', onAdmin ? 'Ticket checker' : 'Admin');
    other.href = onAdmin ? '/staff.html' : '/admin.html';
    bar.appendChild(other);
  }
  const out = el('button', 'navlink linklike', 'Log out');
  out.type = 'button';
  out.id = 'logout-btn';
  out.addEventListener('click', logout);
  bar.appendChild(out);
}

async function logout() {
  try { await postJson('/api/auth/logout'); } catch (err) { /* ignore */ }
  go('/login.html');
}
