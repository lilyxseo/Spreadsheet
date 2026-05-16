import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function ensureAuthSession() {
  const session = await getSession();
  if (!session && !location.pathname.endsWith('/login.html')) {
    location.replace('/login.html');
    return null;
  }
  return session;
}

export async function loginWithEmailPassword(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function logout() {
  await supabase.auth.signOut();
  location.replace('/login.html');
}

export function bindLogoutButtons(selector = '[data-logout-btn]') {
  document.querySelectorAll(selector).forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await logout();
      } finally {
        btn.disabled = false;
      }
    });
  });
}
