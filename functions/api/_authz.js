function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

const READ_ONLY_REASON = 'READ_ONLY_ROLE';

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[0];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (_err) {
    return null;
  }
}

function parseCookie(header = '') {
  return Object.fromEntries(String(header || '').split(';').map(part => {
    const [key, ...rest] = part.trim().split('=');
    return [key, decodeURIComponent(rest.join('=') || '')];
  }).filter(([key]) => key));
}

function isTruthy(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return value === true || normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function getBearerToken(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

async function hasValidDeveloperToken(request, env) {
  const token = getBearerToken(request);
  const [base, signature] = token.split('.');
  const payload = decodeJwtPayload(token);
  if (!base || !signature || payload?.isDeveloper !== true || Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return false;
  const secret = String(env?.DEV_SESSION_SECRET || env?.SUPABASE_ANON_KEY || 'dev-secret');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  try {
    const normalized = signature.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(base));
  } catch (_err) {
    return false;
  }
}

async function isDeveloperRequest(request, env) {
  if (await hasValidDeveloperToken(request, env)) return true;
  const previewEnabled = isTruthy(env?.PREVIEW_BYPASS_LOGIN ?? env?.NEXT_PUBLIC_PREVIEW_BYPASS_LOGIN ?? env?.VITE_PREVIEW_BYPASS_LOGIN);
  return previewEnabled && request.headers.get('x-preview-bypass-login') === 'true';
}

async function getSupabaseAuthUser(request, env) {
  const token = getBearerToken(request);
  const supabaseUrl = String(env?.SUPABASE_URL || '').trim();
  const anonKey = String(env?.SUPABASE_ANON_KEY || '').trim();
  if (!token || !supabaseUrl || !anonKey) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function getUserProfileRole(userId, email, env) {
  const supabaseUrl = String(env?.SUPABASE_URL || '').trim();
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !key || (!userId && !email)) return '';
  const filters = [];
  if (userId) filters.push(`id.eq.${encodeURIComponent(userId)}`);
  if (email) filters.push(`email.eq.${encodeURIComponent(email)}`);
  const orFilter = filters.length > 1 ? `or=(${filters.join(',')})` : filters[0]?.replace('.', '=');
  const url = filters.length > 1
    ? `${supabaseUrl}/rest/v1/users?select=id,email,role&${orFilter}&limit=1`
    : `${supabaseUrl}/rest/v1/users?select=id,email,role&${orFilter}&limit=1`;
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) return '';
  const rows = await res.json().catch(() => []);
  return String(rows?.[0]?.role || '');
}

export async function getRequestRole(request, env) {
  if (await isDeveloperRequest(request, env)) return 'Developer';
  const authUser = await getSupabaseAuthUser(request, env);
  const role = await getUserProfileRole(authUser?.id, authUser?.email, env);
  return role || String(authUser?.user_metadata?.role || authUser?.role || '');
}

async function auditDeniedCrud({ request, env, role, action = 'CRUD' }) {
  const tokenPayload = decodeJwtPayload(getBearerToken(request));
  const authUser = await getSupabaseAuthUser(request, env).catch(() => null);
  const entry = {
    user: authUser?.email || tokenPayload?.username || tokenPayload?.sub || 'anonymous',
    role: role || '',
    action,
    page: new URL(request.url).pathname,
    timestamp: new Date().toISOString(),
    reason: READ_ONLY_REASON,
  };
  console.warn('[AUTHZ_DENIED]', JSON.stringify(entry));
  try {
    const supabaseUrl = String(env?.SUPABASE_URL || '').trim();
    const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (supabaseUrl && key) {
      await fetch(`${supabaseUrl}/rest/v1/activity_logs`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ user_name: entry.user, role: entry.role, action: `DENIED_${action}`, module: entry.page, detail: READ_ONLY_REASON, status: 'FAILED', metadata: entry }),
      }).catch(() => null);
    }
  } catch (_err) {}
}

export async function requirePicRole({ request, env, action = 'CRUD' }) {
  const developer = await isDeveloperRequest(request, env);
  const role = developer ? 'Developer' : await getRequestRole(request, env);
  const canCrud = developer || String(role || '').toLowerCase().includes('pic');
  if (canCrud) return { ok: true, role };
  await auditDeniedCrud({ request, env, role, action });
  return { ok: false, role, response: json({ success: false, message: 'Akses read-only. Hanya PIC atau Developer yang bisa mengubah data.', reason: READ_ONLY_REASON }, 403) };
}
