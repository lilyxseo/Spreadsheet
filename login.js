import { loginWithEmailPassword, getSession } from './assets/js/supabase.js';

const form = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMsg');
const togglePasswordBtn = document.getElementById('togglePassword');

function setError(message = '') {
  errorMsg.textContent = message;
}

function setLoadingState(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.textContent = isLoading ? 'Signing in...' : 'Sign In';
}

(async function initLoginPage() {
  try {
    const existingSession = await getSession();
    if (existingSession) {
      location.replace('/index.html');
      return;
    }
  } catch {
    // Keep page accessible if session check fails.
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');
    setLoadingState(true);

    try {
      const email = emailEl.value.trim();
      const password = passwordEl.value;
      const { error } = await loginWithEmailPassword(email, password);

      if (error) {
        throw error;
      }

      location.replace('/index.html');
    } catch (error) {
      setError(error?.message || 'Login gagal. Periksa email/password lalu coba lagi.');
    } finally {
      setLoadingState(false);
    }
  });

  togglePasswordBtn.addEventListener('click', () => {
    const nextType = passwordEl.type === 'password' ? 'text' : 'password';
    const isHidden = nextType === 'password';

    passwordEl.type = nextType;
    togglePasswordBtn.textContent = isHidden ? 'Show' : 'Hide';
    togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Tampilkan password' : 'Sembunyikan password');
  });
})();
