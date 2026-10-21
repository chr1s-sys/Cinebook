// Login page: staff and admin only.
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorBox = document.getElementById('login-error');
const button = document.getElementById('login-btn');

// already logged in? go straight to your page
getCurrentUser().then((user) => { if (user) go(homeFor(user.role)); });

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    errorBox.textContent = 'Please enter your email and password.';
    errorBox.hidden = false;
    return;
  }

  button.disabled = true;
  button.textContent = 'Logging in...';
  try {
    const { status, data } = await postJson('/api/auth/login', { email, password });
    if (status === 200) return go(homeFor(data.user.role));
    errorBox.textContent = (data && data.message) || 'Something went wrong. Please try again.';
  } catch (err) {
    errorBox.textContent = 'Could not reach the server. Please try again.';
  }
  errorBox.hidden = false;
  passwordInput.value = '';
  button.disabled = false;
  button.textContent = 'Log in';
});
