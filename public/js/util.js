// Small helpers shared by both pages.

// MySQL gives dates as 'YYYY-MM-DD HH:MM:SS' (local time). Turn that into a JS Date.
function parseDbDate(str) {
  return new Date(str.replace(' ', 'T'));
}
function formatDay(str) {
  return parseDbDate(str).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatTime(str) {
  return parseDbDate(str).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function formatPrice(n) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// el('div', 'class-name', 'text')  ->  a new element (text is inserted safely, never as HTML)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Go to another page (one place to change if we ever need to; also easy to test)
function go(url) {
  window.lastRedirect = url; // remembered so tests can check where we were sent
  window.location.href = url;
}

// Send JSON to the API and give back { status, data }
async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, data };
}

// 295 -> "4:55"
function formatCountdown(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// "Oct 20, 2:00 PM" (short, for tables)
function formatWhen(str) {
  return parseDbDate(str).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
