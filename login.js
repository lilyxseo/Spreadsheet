import { loginWithEmailPassword, getSession, supabase } from './assets/js/supabase.js';

const form = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('formError');
const errorText = errorMsg?.querySelector('span');
const togglePasswordBtn = document.getElementById('togglePassword');
const googleLoginBtn = document.getElementById('googleLoginBtn');

function showError(message) {
  if (!errorMsg || !errorText) return;
  if (!message) {
    clearError();
    return;
  }
  errorText.textContent = message;
  errorMsg.hidden = false;
  errorMsg.style.display = "flex";
  const icon = errorMsg.querySelector("i");
  if (icon) icon.setAttribute("data-lucide", "alert-circle");
  if (window.lucide) window.lucide.createIcons();
}

function clearError() {
  if (!errorMsg || !errorText) return;
  errorMsg.hidden = true;
  errorMsg.style.display = "none";
  errorText.textContent = '';
}

function setLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.classList.toggle('is-loading', isLoading);
  loginBtn.querySelector('span').textContent = isLoading ? 'Signing In...' : 'Login';
}


async function handleGoogleLogin() {
  clearError();
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/index.html` }
    });
    if (error) throw error;
  } catch (err) {
    showError(err?.message || 'Login Google gagal. Coba lagi.');
  }
}

function setPasswordVisibility(isVisible) {
  passwordEl.type = isVisible ? 'text' : 'password';
  togglePasswordBtn.setAttribute('aria-pressed', String(isVisible));
  togglePasswordBtn.setAttribute('aria-label', isVisible ? 'Sembunyikan password' : 'Tampilkan password');
  const icon = togglePasswordBtn.querySelector('i');
  if (icon) icon.setAttribute('data-lucide', isVisible ? 'eye' : 'eye-off');
  if (window.lucide) window.lucide.createIcons();
}

async function init() {
  clearError();
  setPasswordVisibility(false);
  togglePasswordBtn?.setAttribute('type', 'button');
  if (window.lucide) window.lucide.createIcons();
  const existingSession = await getSession();
  if (existingSession) {
    location.replace('/index.html');
    return;
  }

  googleLoginBtn?.addEventListener('click', handleGoogleLogin);

  togglePasswordBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const nextVisible = passwordEl.type === 'password';
    setPasswordVisibility(nextVisible);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);

    try {
      const email = emailEl.value.trim();
      const password = passwordEl.value;
      const { error } = await loginWithEmailPassword(email, password);
      if (error) throw error;
      location.replace('/index.html');
    } catch (err) {
      showError(err?.message || 'Login gagal. Coba lagi.');
    } finally {
      setLoading(false);
    }
  });
}

init();
