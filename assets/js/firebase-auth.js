import { FIREBASE_CONFIG } from "./config.js";

if (!window.firebase) {
  throw new Error("Firebase CDN belum dimuat. Tambahkan firebase-app-compat.js dan firebase-auth-compat.js di index.html.");
}

if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

export const auth = firebase.auth();

export async function ensureAuthSession() {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((currentUser) => {
      unsub();
      resolve(currentUser || null);
    });
  });
}

export async function loginWithEmailPassword(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

export async function signupWithEmailPassword(email, password) {
  return auth.createUserWithEmailAndPassword(email, password);
}

export async function getCurrentUser() {
  return auth.currentUser;
}

export async function logout() {
  await auth.signOut();
}

export function bindLogoutButtons(selector = '[data-logout-btn]') {
  document.querySelectorAll(selector).forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await logout();
        window.dispatchEvent(new CustomEvent('auth:logout'));
      } finally {
        btn.disabled = false;
      }
    });
  });
}
