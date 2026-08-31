import test from 'node:test';
import assert from 'node:assert/strict';
import { handleManualRplSync } from '../functions/api/sync/inventory/rpl.js';

const SECRET = 'inventory-secret';
const request = authorization => new Request('https://example.test/api/sync/inventory/rpl', { method: 'POST', headers: authorization ? { Authorization: authorization } : {} });

test('RPL manual endpoint uses the shared bearer secret and response contract', async () => {
  const result = { success: true, source: 'rpl', sourceRows: 1, inserted: 1, updated: 0, deleted: 0, unchanged: 0, invalidRows: 0, invalidRowDiagnostics: [], durationMs: 1, sourceVersion: 'hash', requests: { estimatedRequests: 7 } };
  const response = await handleManualRplSync({ request: request(`Bearer ${SECRET}`), env: { INVENTORY_SYNC_SECRET: SECRET } }, { sync: async () => result });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
});

test('RPL manual endpoint rejects missing and incorrect secrets', async () => {
  for (const authorization of [undefined, 'Bearer wrong']) {
    const response = await handleManualRplSync({ request: request(authorization), env: { INVENTORY_SYNC_SECRET: SECRET } }, { sync: async () => assert.fail('sync must not run') });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, reason: 'UNAUTHORIZED' });
  }
});
