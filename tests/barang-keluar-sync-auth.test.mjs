import test from 'node:test';
import assert from 'node:assert/strict';
import { handleManualBarangKeluarSync } from '../functions/api/sync/inventory/barang-keluar.js';

const SECRET = 'inventory-secret';
const request = authorization => new Request('https://example.test/api/sync/inventory/barang-keluar', { method: 'POST', headers: authorization ? { Authorization: authorization } : {} });

test('Barang Keluar manual endpoint uses the shared inventory bearer secret', async () => {
  const response = await handleManualBarangKeluarSync({ request: request(`Bearer ${SECRET}`), env: { INVENTORY_SYNC_SECRET: SECRET } }, { sync: async () => ({ success: true, source: 'barang_keluar' }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source, 'barang_keluar');
});

test('Barang Keluar manual endpoint rejects missing or incorrect secrets', async () => {
  for (const authorization of [undefined, 'Bearer wrong']) {
    const response = await handleManualBarangKeluarSync({ request: request(authorization), env: { INVENTORY_SYNC_SECRET: SECRET } }, { sync: async () => assert.fail('sync must not run') });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, reason: 'UNAUTHORIZED' });
  }
});
