import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function parseJsonResponse(resp, fallbackMessage) {
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return resp.json();
  }
  const rawText = await resp.text();
  const trimmed = String(rawText || "").trim();
  const isHtml = trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html");
  const message = isHtml
    ? `${fallbackMessage} (HTTP ${resp.status} ${resp.statusText})`
    : `${fallbackMessage}: ${trimmed || "Respons tidak valid"}`;
  throw new Error(message);
}

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
      const expiresAt = Number(dev?.session?.expires_at || dev?.expires_at || 0);
      if (expiresAt > Math.floor(Date.now() / 1000) && dev?.session?.access_token) {
        return { isDeveloper: true, user: dev.user || null, ...dev.session };
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
  const data = await parseJsonResponse(resp, "Endpoint login tidak ditemukan");
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
