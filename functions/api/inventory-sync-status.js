import { getRequestRole } from './_authz.js';
import { getSecretSupabaseConfig } from './_supabase-config.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function handleInventorySyncStatusRequest({ request, env }) {
  if (!(await getRequestRole(request, env))) return json({ success: false, message: 'Sesi tidak valid' }, 401);

  try {
    const { url, key } = getSecretSupabaseConfig(env);
    const response = await fetch(`${url}/rest/v1/inventory_sync_status?select=*&last_success_at=not.is.null&order=last_success_at.desc&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const rows = await response.json().catch(() => null);
    if (!response.ok) throw new Error(rows?.message || `Supabase HTTP ${response.status}`);
    const syncStatus = Array.isArray(rows) ? rows[0] || null : null;
    return json({ success: true, source: 'public.inventory_sync_status', syncStatus, last_success_at: syncStatus?.last_success_at ?? null });
  } catch (error) {
    console.error('[InventorySyncStatus]', error?.message || error);
    return json({ success: false, message: 'Gagal memuat status sinkronisasi inventory.' }, 502);
  }
}

export function onRequestGet(context) {
  return handleInventorySyncStatusRequest(context);
}
