import { getRequestRole } from '../../_authz.js';
import { syncKartuStok, SyncError } from './_kartu-stok-service.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  const role = await getRequestRole(request, env);
  if (String(role).toLowerCase() !== 'developer') return json({ success: false, reason: 'FORBIDDEN', message: 'Manual sync hanya untuk Developer' }, 403);
  try {
    const result = await syncKartuStok(env);
    return json(result, result.skipped ? 409 : 200);
  } catch (error) {
    console.error(`[InventorySync:kartu_stok] ERROR ${error?.code || 'SYNC_FAILED'}: ${error?.message || error}`);
    return json({ success: false, source: 'kartu_stok', reason: error instanceof SyncError ? error.code : 'SYNC_FAILED', message: error?.message || 'Sinkronisasi gagal' }, 500);
  }
}
