import { resolveRequestIdentity } from '../../_authz.js';
import { syncKartuStok, SyncError } from './_kartu-stok-service.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function handleManualKartuStokSync({ request, env }, dependencies = {}) {
  const identity = await (dependencies.resolveIdentity || resolveRequestIdentity)(request, env);
  console.log('[ManualSyncAuth]', JSON.stringify({
    authenticated: identity.authenticated,
    isDeveloper: identity.isDeveloper,
    role: identity.role || '',
    authSource: identity.authSource || 'none',
  }));
  if (!identity.authenticated) return json({ success: false, reason: 'UNAUTHORIZED', message: 'Session login diperlukan' }, 401);
  if (!identity.isDeveloper) return json({ success: false, reason: 'FORBIDDEN', message: 'Manual sync hanya untuk Developer' }, 403);
  try {
    const result = await (dependencies.sync || syncKartuStok)(env);
    return json(result, result.skipped ? 409 : 200);
  } catch (error) {
    console.error(`[InventorySync:kartu_stok] ERROR ${error?.code || 'SYNC_FAILED'}: ${error?.message || error}`);
    return json({ success: false, source: 'kartu_stok', reason: error instanceof SyncError ? error.code : 'SYNC_FAILED', message: error?.message || 'Sinkronisasi gagal' }, 500);
  }
}

export async function onRequestPost(context) {
  return handleManualKartuStokSync(context);
}
