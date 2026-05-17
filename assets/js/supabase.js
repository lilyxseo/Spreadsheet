import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

const DEV_SESSION_KEY = "dev_auth_session";

export async function ensureAuthSession() {
  const raw = localStorage.getItem(DEV_SESSION_KEY);
  if (raw) {
    try {
      const dev = JSON.parse(raw);
      if (dev?.expires_at && Number(dev.expires_at) > Math.floor(Date.now() / 1000)) {
        return { isDeveloper: true, user: dev.user, ...dev.session };
      }
      localStorage.removeItem(DEV_SESSION_KEY);
    } catch (_err) {
      localStorage.removeItem(DEV_SESSION_KEY);
    }
  }
  const session = await getSession();
  return session;
}

export async function loginWithEmailPassword(username, password) {
  const resp = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || "Login gagal.");

  if (data?.mode === "dev") {
    localStorage.setItem(DEV_SESSION_KEY, JSON.stringify({ session: data.session, user: data.user }));
    return { data, error: null };
  }

  localStorage.removeItem(DEV_SESSION_KEY);
  const { error } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (error) throw error;
  return { data, error: null };
}

export async function logout() {
  localStorage.removeItem(DEV_SESSION_KEY);
  return supabase.auth.signOut();
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
