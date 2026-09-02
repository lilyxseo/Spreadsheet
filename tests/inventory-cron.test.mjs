import assert from 'node:assert/strict';
import test from 'node:test';

import { INVENTORY_CRON_SOURCES, runInventoryCron } from '../functions/api/sync/inventory/_inventory-cron-orchestrator.js';
import { InventoryCronLock } from '../worker/inventory-cron.js';

test('scheduled orchestration runs all inventory sources sequentially in order', async () => {
  const events = [];
  let active = 0;
  const sources = INVENTORY_CRON_SOURCES.map(([source]) => [source, async () => {
    active += 1;
    assert.equal(active, 1);
    events.push(source);
    await Promise.resolve();
    active -= 1;
    return { success: true, sourceRows: 2, inserted: 1, updated: 1, deleted: 0, durationMs: 3 };
  }]);
  const result = await runInventoryCron({}, { sources, logger: { log() {}, error() {} } });
  assert.deepEqual(events, ['kartu_stok', 'barang_masuk', 'barang_keluar', 'rpl', 'bulky']);
  assert.equal(result.success, true);
});

test('a source failure is retained and later sources still run', async () => {
  const events = [];
  const sources = ['one', 'two', 'three'].map(source => [source, async () => {
    events.push(source);
    if (source === 'two') throw new Error('sheet unavailable');
    return { success: true, sourceRows: 1, inserted: 0, updated: 0, deleted: 0, durationMs: 1 };
  }]);
  const result = await runInventoryCron({}, { sources, logger: { log() {}, error() {} } });
  assert.deepEqual(events, ['one', 'two', 'three']);
  assert.equal(result.success, false);
  assert.deepEqual(result.results.map(item => item.status), ['success', 'failed', 'success']);
});

test('Durable Object rejects an overlapping full run', async () => {
  let release;
  const lock = new InventoryCronLock({}, {});
  lock.run = () => new Promise(resolve => { release = () => resolve({ success: true, results: [] }); });
  const first = lock.fetch();
  const overlap = await lock.fetch();
  assert.equal(overlap.status, 409);
  assert.equal((await overlap.json()).reason, 'SCHEDULE_ALREADY_RUNNING');
  release();
  await first;
});
