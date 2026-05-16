import { loginWithEmailPassword, getSession, supabase } from './assets/js/supabase.js';

const loginView = document.getElementById('loginView');
const signupView = document.getElementById('signupView');
const showSignupLink = document.getElementById('showSignupLink');
const showLoginLink = document.getElementById('showLoginLink');

const form = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('formError');
const errorText = errorMsg?.querySelector('span');
const togglePasswordBtn = document.getElementById('togglePassword');
const googleLoginBtn = document.getElementById('googleLoginBtn');

const signupForm = document.getElementById('signupForm');
const signupBtn = document.getElementById('signupBtn');
const signupError = document.getElementById('signupError');
const signupErrorText = signupError?.querySelector('span');
const signupSuccess = document.getElementById('signupSuccess');
const signupSuccessText = signupSuccess?.querySelector('span');

function applyStoredTheme() {
  const savedTheme = localStorage.getItem('theme');
  const isDark = savedTheme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

function toggleAuthView(view) {
  const showLogin = view === 'login';
  loginView.hidden = !showLogin;
  signupView.hidden = showLogin;
  clearError();
  clearSignupFeedback();
  if (window.lucide) window.lucide.createIcons();
}

function showError(message) {
  if (!errorMsg || !errorText) return;
  errorText.textContent = message || '';
  errorMsg.hidden = !message;
}
function clearError() { showError(''); }

function showSignupError(message) {
  if (!signupError || !signupErrorText) return;
  signupErrorText.textContent = message || '';
  signupError.hidden = !message;
}
function showSignupSuccess(message) {
  if (!signupSuccess || !signupSuccessText) return;
  signupSuccessText.textContent = message || '';
  signupSuccess.hidden = !message;
}
function clearSignupFeedback() {
  showSignupError('');
  showSignupSuccess('');
}

function setLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.classList.toggle('is-loading', isLoading);
  loginBtn.querySelector('span').textContent = isLoading ? 'Signing In...' : 'Login';
}
function setSignupLoading(isLoading) {
  signupBtn.disabled = isLoading;
  signupBtn.classList.toggle('is-loading', isLoading);
  signupBtn.querySelector('span').textContent = isLoading ? 'Signing Up...' : 'Sign Up';
}

function togglePassword(inputEl, btnEl) {
  inputEl.type = inputEl.type === 'password' ? 'text' : 'password';
  const isVisible = inputEl.type === 'text';
  btnEl.setAttribute('aria-pressed', String(isVisible));
  btnEl.innerHTML = `<i data-lucide="${isVisible ? 'eye' : 'eye-off'}" aria-hidden="true"></i>`;
  if (window.lucide) window.lucide.createIcons();
}

async function resolveEmailFromLoginInput(loginInput) {
  const trimmedInput = String(loginInput || '').trim();
  if (!trimmedInput) return '';
  if (trimmedInput.includes('@')) return trimmedInput;
  const { data, error } = await supabase.from('users').select('email').eq('username', trimmedInput).limit(2);
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) throw new Error('Username tidak ditemukan');
  if (data.length > 1) throw new Error('Username tidak unique. Hubungi admin.');
  const email = data[0]?.email?.trim();
  if (!email) throw new Error('Email user tidak valid');
  return email;
}

function validateSignupForm({ fullName, username, email, password, confirmPassword }) {
  if (!fullName || !username || !email || !password || !confirmPassword) return 'Semua field wajib diisi.';
  if (!username.trim() || /\s/.test(username)) return 'Username wajib diisi dan tidak boleh mengandung spasi.';
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'Format email tidak valid.';
  if (password !== confirmPassword) return 'Password dan Confirm Password harus sama.';
  return '';
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  clearSignupFeedback();
  setSignupLoading(true);

  const payload = {
    fullName: document.getElementById('fullName').value.trim(),
    username: document.getElementById('username').value.trim(),
    email: document.getElementById('signupEmail').value.trim(),
    password: document.getElementById('signupPassword').value,
    confirmPassword: document.getElementById('confirmPassword').value
  };

  const validationError = validateSignupForm(payload);
  if (validationError) {
    showSignupError(validationError);
    setSignupLoading(false);
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({ email: payload.email, password: payload.password });
    if (error) throw error;
    const userId = data?.user?.id;
    if (!userId) throw new Error('User ID tidak ditemukan setelah signup.');

    const { error: upsertError } = await supabase.from('users').upsert({
      id: userId,
      full_name: payload.fullName,
      username: payload.username,
      email: payload.email,
      role: 'User'
    }, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    showSignupSuccess('Sign up berhasil. Silakan login dengan akun Anda.');
    signupForm.reset();
    setTimeout(() => toggleAuthView('login'), 1200);
  } catch (err) {
    showSignupError(err?.message || 'Signup gagal. Coba lagi.');
  } finally {
    setSignupLoading(false);
  }
}

async function init() {
  applyStoredTheme();
  const existingSession = await getSession();
  if (existingSession) {
    location.replace('/index.html');
    return;
  }

  if (window.lucide) window.lucide.createIcons();

  showSignupLink?.addEventListener('click', (e) => { e.preventDefault(); toggleAuthView('signup'); });
  showLoginLink?.addEventListener('click', (e) => { e.preventDefault(); toggleAuthView('login'); });
  googleLoginBtn?.addEventListener('click', async () => {
    clearError();
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/index.html` } });
      if (error) throw error;
    } catch (err) { showError(err?.message || 'Login Google gagal. Coba lagi.'); }
  });

  togglePasswordBtn?.addEventListener('click', (e) => { e.preventDefault(); togglePassword(passwordEl, togglePasswordBtn); });
  document.getElementById('toggleSignupPassword')?.addEventListener('click', (e) => {
    e.preventDefault();
    togglePassword(document.getElementById('signupPassword'), e.currentTarget);
  });
  document.getElementById('toggleConfirmPassword')?.addEventListener('click', (e) => {
    e.preventDefault();
    togglePassword(document.getElementById('confirmPassword'), e.currentTarget);
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const email = await resolveEmailFromLoginInput(emailEl.value.trim());
      const { error } = await loginWithEmailPassword(email, passwordEl.value);
      if (error) throw error;
      location.replace('/index.html');
    } catch (err) {
      showError(err?.message || 'Login gagal. Coba lagi.');
    } finally {
      setLoading(false);
    }
  });

  signupForm?.addEventListener('submit', handleSignupSubmit);
}

init();
