import test from 'node:test';
import assert from 'node:assert/strict';
import { handleManualBulkySync } from '../functions/api/sync/inventory/bulky.js';

const SECRET = 'inventory-secret';
const request = authorization => new Request('https://example.test/api/sync/inventory/bulky', { method: 'POST', headers: authorization ? { Authorization: authorization } : {} });

test('BULKY manual endpoint uses the shared inventory bearer secret and response contract', async () => {
  const result = { success: true, source: 'bulky', sourceRows: 1, inserted: 1, updated: 0, deleted: 0, unchanged: 0, invalidRows: 0, invalidRowDiagnostics: [], durationMs: 1, sourceVersion: 'hash', requests: { estimatedRequests: 7 } };
  const response = await handleManualBulkySync({ request: request(`Bearer ${SECRET}`), env: { INVENTORY_SYNC_SECRET: SECRET } }, { sync: async () => result });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
});

test('BULKY manual endpoint rejects missing or incorrect secrets', async () => {
  for (const authorization of [undefined, 'Bearer wrong']) {
    const response = await handleManualBulkySync({ request: request(authorization), env: { INVENTORY_SYNC_SECRET: SECRET } }, { sync: async () => assert.fail('sync must not run') });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, reason: 'UNAUTHORIZED' });
  }
});
