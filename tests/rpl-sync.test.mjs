import test from 'node:test';
import assert from 'node:assert/strict';
import { RPL_SHEET_NAME, buildSourceRowKey, parseRplValues, syncRpl } from '../functions/api/sync/inventory/_rpl-service.js';

const HEADER = [
  'LOKASI BULKY', 'SKU', 'NAMA BARANG', 'STOK AKHIR', 'Safe Stock', 'Minimum Stock',
  'Maximum stock', 'Status', 'Estimasi Order', 'Iseller', 'Netsuite', 'Selisih', 'Pendingan IT',
];
const row = (sku, stokAkhir = '12') => [' rak%20rpl ', sku, ` Produk ${sku} `, stokAkhir, '5', '3', '20', 'Aman', '8', 'Active', 'Posted', '-1', '2'];
const logger = { log() {}, error() {} };

function statefulGateway() {
  const records = new Map();
  const status = { status: null, locked_at: null, lock_id: null };
  return {
    records, status,
    async acquireLock(source, lockId) { assert.equal(source, 'rpl'); status.status = 'syncing'; status.locked_at = new Date().toISOString(); status.lock_id = lockId; return true; },
    async insertHistory() { return 'history-rpl'; }, async updateHistory() {},
    async existingMetadata() { return [...records.values()].map(({ source_row_key, source_hash }) => ({ source_row_key, source_hash })); },
    async upsertRows(rows) { rows.forEach(item => records.set(item.source_row_key, item)); },
    async deleteKeys(keys) { keys.forEach(key => records.delete(key)); },
    async finishSuccess(args) { assert.equal(args.source, 'rpl'); status.status = 'success'; status.locked_at = null; status.lock_id = null; },
    async finishError() {},
  };
}

test('RPL maps and normalizes all business fields with the requested row key and hash', async () => {
  const parsed = await parseRplValues([HEADER.map(header => ` ${header.toLowerCase()} `), row('SKU–1')]);
  assert.equal(buildSourceRowKey(2), 'rpl:2');
  assert.deepEqual(parsed.rows[0], {
    lokasi_bulky: 'RAK RPL', sku: 'SKU-1', nama_barang: 'Produk SKU–1', stok_akhir: 12,
    safe_stock: 5, minimum_stock: 3, maximum_stock: 20, estimasi_order: 8,
    selisih: -1, pendingan_it: 2, status: 'Aman', iseller: 'Active', netsuite: 'Posted',
    source_row_key: 'rpl:2', source_row_number: 2, source_hash: parsed.rows[0].source_hash,
  });
  assert.match(parsed.rows[0].source_hash, /^[a-f0-9]{64}$/);
});

test('RPL validates headers and diagnoses invalid non-empty numbers without coercing them', async () => {
  await assert.rejects(() => parseRplValues([HEADER.slice(1)]), error => error.code === 'INVALID_HEADER');
  const invalid = row('SKU-1'); invalid[3] = '#VALUE!'; invalid[12] = 'not-a-number';
  const parsed = await parseRplValues([HEADER, invalid]);
  assert.equal(parsed.rows.length, 0);
  assert.deepEqual(parsed.invalidRows, [{ sourceRowNumber: 2, sourceRowKey: 'rpl:2', errors: ['INVALID_NUMBER:STOK AKHIR', 'INVALID_NUMBER:PENDINGAN IT'] }]);
  assert.equal(parsed.sourceKeys.has('rpl:2'), true);
});

test('RPL first and unchanged second sync have valid row count, idempotent diff, released lock, and safe request estimate', async () => {
  const gateway = statefulGateway();
  const invalid = row('INVALID'); invalid[8] = 'invalid';
  const values = [HEADER, row('A'), row('B'), invalid];
  const run = () => syncRpl({}, { gateway, fetchValues: async () => values, logger });

  const first = await run();
  assert.deepEqual([first.success, first.sourceRows, first.invalidRows, first.inserted, first.updated, first.deleted], [true, 3, 1, 2, 0, 0]);
  assert.equal(gateway.records.size, 2);
  assert.deepEqual(gateway.status, { status: 'success', locked_at: null, lock_id: null });

  const second = await run();
  assert.deepEqual([second.inserted, second.updated, second.deleted, second.unchanged], [0, 0, 0, 2]);
  assert.equal(gateway.records.size, 2);
  assert.deepEqual(gateway.status, { status: 'success', locked_at: null, lock_id: null });
  assert.ok(second.requests.estimatedRequests < 50);
});

test('RPL uses the actual configured tab name separately from its source identifier', async () => {
  const messages = [];
  await syncRpl({ SHEET_ID_2026: 'spreadsheet-id' }, {
    gateway: statefulGateway(), fetchValues: async () => [HEADER, row('A')],
    logger: { log(message) { messages.push(message); }, error() {} },
  });
  assert.equal(RPL_SHEET_NAME, 'stok retail');
  assert.equal(messages[0], "[InventorySync:rpl]\nsheetName: stok retail\nrange: 'stok retail'!A:ZZ");
  assert.doesNotMatch(messages.join('\n'), /spreadsheet-id/);
});
