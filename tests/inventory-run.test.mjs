import assert from 'node:assert/strict';
import test from 'node:test';

import { runInventorySync } from '../functions/api/sync/inventory/_inventory-runner.js';
import { handleInventorySyncRun } from '../functions/api/sync/inventory/run.js';

const SECRET = 'inventory-test-secret';
const request = authorization => new Request('https://wms.example/api/sync/inventory/run', {
  method: 'POST',
  headers: authorization ? { Authorization: authorization } : {},
});

test('run endpoint requires the inventory bearer secret', async () => {
  for (const authorization of [undefined, 'Bearer wrong-secret', SECRET]) {
    const response = await handleInventorySyncRun(
      { request: request(authorization), env: { INVENTORY_SYNC_SECRET: SECRET } },
      { run: async () => assert.fail('sync must not run') },
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { success: false, reason: 'UNAUTHORIZED' });
  }
});

test('run endpoint accepts the Supabase Cron POST request', async () => {
  let receivedEnv;
  const env = { INVENTORY_SYNC_SECRET: SECRET };
  const response = await handleInventorySyncRun(
    { request: request(`Bearer ${SECRET}`), env },
    { run: async value => { receivedEnv = value; return { success: true, results: [] }; } },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(receivedEnv, env);
  assert.deepEqual(await response.json(), { success: true, results: [] });
});

test('full run executes all shared sync services sequentially in order', async () => {
  const events = [];
  let active = 0;
  const sources = ['kartu_stok', 'barang_masuk', 'barang_keluar', 'rpl', 'bulky'].map(source => [source, async () => {
    active += 1;
    assert.equal(active, 1);
    events.push(source);
    await Promise.resolve();
    active -= 1;
    return { success: true };
  }]);

  const result = await runInventorySync({}, { sources });
  assert.deepEqual(events, ['kartu_stok', 'barang_masuk', 'barang_keluar', 'rpl', 'bulky']);
  assert.equal(result.success, true);
});

test('full run reports failure only after attempting every source', async () => {
  const events = [];
  const sources = ['one', 'two', 'three'].map(source => [source, async () => {
    events.push(source);
    if (source === 'two') throw new Error('sheet unavailable');
    return { success: true };
  }]);

  const result = await runInventorySync({}, { sources });
  assert.deepEqual(events, ['one', 'two', 'three']);
  assert.equal(result.success, false);
  assert.deepEqual(result.results.map(item => item.success), [true, false, true]);
});
