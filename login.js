import { loginWithEmailPassword, getSession } from './assets/js/supabase.js';

const form = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMsg');
const togglePasswordBtn = document.getElementById('togglePassword');

const DASHBOARD_URL = '/index.html';

function setLoadingState(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.textContent = isLoading ? 'Signing in...' : 'Sign In';
}

function setError(message = '') {
  errorMsg.textContent = message;
}

togglePasswordBtn?.addEventListener('click', () => {
  const isHidden = passwordEl.type === 'password';
  passwordEl.type = isHidden ? 'text' : 'password';
  togglePasswordBtn.textContent = isHidden ? 'Hide' : 'Show';
  togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Sembunyikan password' : 'Tampilkan password');
  togglePasswordBtn.setAttribute('aria-pressed', String(isHidden));
});

(async () => {
  const existingSession = await getSession();
  if (existingSession) {
    location.replace(DASHBOARD_URL);
  }
})();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');
  setLoadingState(true);

  try {
    const email = emailEl.value.trim();
    const password = passwordEl.value;

    const { error } = await loginWithEmailPassword(email, password);
    if (error) throw error;

    location.replace(DASHBOARD_URL);
  } catch (err) {
    setError(err?.message || 'Login gagal. Periksa email dan password lalu coba lagi.');
  } finally {
    setLoadingState(false);
  }
});
