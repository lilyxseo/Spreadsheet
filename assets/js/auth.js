import { supabase } from '../../src/lib/supabase.js';

let currentSession = null;

const AUTH_EXEMPT_PATHS = ['/login'];
const isAuthExemptPath = (path) => AUTH_EXEMPT_PATHS.includes(path);

export async function restoreSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  currentSession = data?.session || null;
  return currentSession;
}

export function getCurrentSession() {
  return currentSession;
}

export async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentSession = data?.session || null;
  return currentSession;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentSession = null;
}

export function onAuthStateChanged(onChange) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session || null;
    onChange?.(currentSession);
  });
  return data?.subscription;
}

export function enforceProtectedRoute(pathname, navigateTo) {
  if (!getCurrentSession() && !isAuthExemptPath(pathname)) {
    navigateTo('/login', { replace: true });
    return false;
  }

  if (getCurrentSession() && pathname === '/login') {
    navigateTo('/', { replace: true });
    return false;
  }

  return true;
}
