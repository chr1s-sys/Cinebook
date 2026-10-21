// Find my booking: booking code + email -> the booking page (tickets, cancel).

const params = new URLSearchParams(location.search);
const codeInput = document.getElementById('code');
const emailInput = document.getElementById('email');
const notice = document.getElementById('find-notice');
const errorBox = document.getElementById('find-error');
const button = document.getElementById('find-btn');

// arriving from a booking link: the code is already filled in
if (params.get('code')) {
  codeInput.value = params.get('code');
  notice.textContent = 'To see these tickets, enter the email address used for the booking.';
  notice.hidden = false;
}

document.getElementById('find-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const code = codeInput.value.trim();
  const email = emailInput.value.trim();

  if (!code || !email) {
    errorBox.textContent = 'Please enter your booking code and email.';
    errorBox.hidden = false;
    return;
  }

  if (/^TK-/i.test(code)) {
    errorBox.textContent = 'That looks like a ticket code. Please enter the booking code (CB-...) shown at the top of your tickets.';
    errorBox.hidden = false;
    return;
  }

  button.disabled = true;
  button.textContent = 'Searching...';
  try {
    const { status, data } = await postJson('/api/bookings/lookup', { code, email });
    if (status === 200) {
      try { sessionStorage.setItem('cb_email', email.toLowerCase()); } catch (e) { /* ignore */ }
      return go('/booking.html?code=' + encodeURIComponent(data.booking_code));
    }
    errorBox.textContent = (data && data.message) || 'Something went wrong. Please try again.';
  } catch (err) {
    errorBox.textContent = 'Could not reach the server. Please try again.';
  }
  errorBox.hidden = false;
  button.disabled = false;
  button.textContent = 'Find booking';
});
