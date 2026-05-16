import { loginWithEmailPassword, getSession, supabase } from './assets/js/supabase.js';

const form = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('formError');
const errorText = errorMsg?.querySelector('span');
const togglePasswordBtn = document.getElementById('togglePassword');
const googleLoginBtn = document.getElementById('googleLoginBtn');

function applyStoredTheme() {
  const savedTheme = localStorage.getItem('theme');
  const isDark = savedTheme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

async function resolveEmailFromLoginInput(loginInput) {
  const trimmedInput = String(loginInput || '').trim();
  if (!trimmedInput) return '';
  if (trimmedInput.includes('@')) return trimmedInput;

  const { data, error } = await supabase
    .from('users')
    .select('email')
    .eq('username', trimmedInput)
    .limit(2);

  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Username tidak ditemukan');
  }
  if (data.length > 1) {
    throw new Error('Username tidak unique. Hubungi admin.');
  }

  const email = data[0]?.email?.trim();
  if (!email) throw new Error('Email user tidak valid');
  return email;
}

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

function setPasswordVisibility() {
  passwordEl.type = passwordEl.type === 'password' ? 'text' : 'password';
  const isVisible = passwordEl.type === 'text';

  togglePasswordBtn.setAttribute('aria-pressed', String(isVisible));
  togglePasswordBtn.setAttribute('aria-label', isVisible ? 'Sembunyikan password' : 'Tampilkan password');
  togglePasswordBtn.innerHTML = `<i data-lucide="${isVisible ? 'eye' : 'eye-off'}" aria-hidden="true"></i>`;

  if (window.lucide) window.lucide.createIcons();
}

async function init() {
  applyStoredTheme();
  clearError();
  const loginLabel = document.querySelector('label[for="email"]');
  if (loginLabel) loginLabel.textContent = 'Email atau Username';
  emailEl.type = 'text';
  emailEl.setAttribute('autocomplete', 'username');
  emailEl.setAttribute('placeholder', 'Masukkan email atau username');
  passwordEl.type = 'password';
  togglePasswordBtn.innerHTML = '<i data-lucide="eye-off" aria-hidden="true"></i>';
  togglePasswordBtn?.setAttribute('type', 'button');
  if (window.lucide) window.lucide.createIcons();
  const existingSession = await getSession();
  if (existingSession) {
    location.replace('/index.html');
    return;
  }

  googleLoginBtn?.addEventListener('click', handleGoogleLogin);

  const rememberCheckbox = document.getElementById('rememberMe');
  rememberCheckbox?.classList.add('remember-checkbox');

  const formInputs = form?.querySelectorAll('input:not([type="checkbox"])');
  formInputs?.forEach((input) => input.classList.add('form-input'));

  togglePasswordBtn.addEventListener('click', (e) => {
    e.preventDefault();
    setPasswordVisibility();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);

    try {
      const loginInput = emailEl.value.trim();
      const password = passwordEl.value;
      const email = await resolveEmailFromLoginInput(loginInput);
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
