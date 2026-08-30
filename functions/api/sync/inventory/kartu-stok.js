import { syncKartuStok, SyncError } from './_kartu-stok-service.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function handleManualKartuStokSync({ request, env }, dependencies = {}) {
  const authorization = String(request.headers.get('authorization') || '');
  const suppliedSecret = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  const expectedSecret = String(env?.INVENTORY_SYNC_SECRET || '');
  if (!expectedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
    return json({ success: false, reason: 'UNAUTHORIZED' }, 401);
  }
  try {
    const result = await (dependencies.sync || syncKartuStok)(env);
    return json(result, result.skipped ? 409 : 200);
  } catch (error) {
    console.error(`[InventorySync:kartu_stok] ERROR ${error?.code || 'SYNC_FAILED'}: ${error?.message || error}`);
    return json({ success: false, source: 'kartu_stok', reason: error instanceof SyncError ? error.code : 'SYNC_FAILED', message: error?.message || 'Sinkronisasi gagal' }, 500);
  }
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const maximumLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function onRequestPost(context) {
  return handleManualKartuStokSync(context);
}
