import { loginWithEmailPassword, getSession } from './assets/js/supabase.js';

const form = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const togglePasswordBtn = document.getElementById('togglePassword');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMsg');
const errorMsgText = errorMsg.querySelector('span');

function renderIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function setError(message = '') {
  if (!message) {
    errorMsg.hidden = true;
    errorMsgText.textContent = '';
    return;
  }
  errorMsg.hidden = false;
  errorMsgText.textContent = message;
}

function setLoadingState(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.classList.toggle('is-loading', isLoading);
  loginBtn.querySelector('span').textContent = isLoading ? 'Signing In...' : 'Sign In';
}

async function redirectIfAuthenticated() {
  const existingSession = await getSession();
  if (existingSession) {
    location.replace('/index.html');
  }
}

togglePasswordBtn.addEventListener('click', () => {
  const isHidden = passwordEl.type === 'password';
  passwordEl.type = isHidden ? 'text' : 'password';
  togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Sembunyikan password' : 'Tampilkan password');
  togglePasswordBtn.setAttribute('aria-pressed', String(isHidden));
  togglePasswordBtn.innerHTML = `<i data-lucide="${isHidden ? 'eye-off' : 'eye'}"></i>`;
  renderIcons();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setLoadingState(true);

  try {
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const { error } = await loginWithEmailPassword(email, password);
    if (error) throw error;
    location.replace('/index.html');
  } catch (err) {
    setError(err?.message || 'Login gagal. Silakan coba lagi.');
  } finally {
    setLoadingState(false);
  }
});

await redirectIfAuthenticated();
renderIcons();
