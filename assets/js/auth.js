import { supabase } from "./supabase.js";

const LOGIN_PATH = "/login.html";
const DASHBOARD_PATH = "/dashboard/index.html";

export async function loginWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function logout() {
  await supabase.auth.signOut();
  location.href = LOGIN_PATH;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    location.href = LOGIN_PATH;
    return null;
  }
  return session;
}

export async function redirectIfLoggedIn() {
  const session = await getSession();
  if (session) {
    location.href = DASHBOARD_PATH;
  }
  return session;
}
