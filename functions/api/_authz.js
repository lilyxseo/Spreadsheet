function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized));
  } catch (_err) {
    return null;
  }
}

function getBearerToken(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

async function getUserRoleFromSupabase(env, userId) {
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey || !userId) return '';
  const params = new URLSearchParams({ select: 'role', id: `eq.${userId}`, limit: '1' });
  const res = await fetch(`${supabaseUrl}/rest/v1/users?${params.toString()}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
  if (!res.ok) return '';
  const rows = await res.json().catch(() => []);
  return String(Array.isArray(rows) ? rows[0]?.role || '' : '').trim();
}

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function hasCrudAccess(role) {
  const normalized = normalizeRole(role);
  return normalized === 'pic' || normalized === 'developer' || normalized === 'mode development';
}

export function isReadOnlyRole(role) {
  return normalizeRole(role) === 'warga kst';
}

export async function getRequestRole(request, env) {
  const token = getBearerToken(request);
  const payload = decodeJwtPayload(token);
  if (payload?.isDeveloper === true) return 'Developer';
  const roleFromJwt = String(payload?.role || payload?.user_role || '').trim();
  if (roleFromJwt) return roleFromJwt;
  const userId = String(payload?.sub || payload?.user_id || '').trim();
  if (!userId) return '';
  return getUserRoleFromSupabase(env, userId);
}

export async function requirePicRole({ request, env }) {
  const role = await getRequestRole(request, env);
  if (!hasCrudAccess(role)) {
    return { ok: false, response: json({ success: false, message: 'Forbidden: hanya role Developer atau PIC yang diizinkan.' }, 403), role };
  }
  return { ok: true, role };
}
