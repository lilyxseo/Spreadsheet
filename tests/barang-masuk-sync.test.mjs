import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceRowKey, parseBarangMasukValues, syncBarangMasuk } from '../functions/api/sync/inventory/_barang-masuk-service.js';

const HEADER = ['TANGGAL', 'FROM', 'TO', 'SKU', 'NAMA BARANG', 'QTY', 'STATUS', 'PIC', 'KETERANGAN'];
const row = (sku, qty = '10') => ['2026-08-30', ' inbound ', ' a%20-01 ', sku, `Produk ${sku}`, qty, 'Received', 'Abi', 'Baik'];
const logger = { log() {}, error() {} };

function statefulGateway() {
  const records = new Map();
  return {
    records,
    async acquireLock(source) { assert.equal(source, 'barang_masuk'); return true; },
    async insertHistory() { return 'history-1'; }, async updateHistory() {},
    async existingMetadata() { return [...records.values()].map(({ source_row_key, source_hash }) => ({ source_row_key, source_hash })); },
    async upsertRows(rows) { rows.forEach(item => records.set(item.source_row_key, item)); },
    async deleteKeys(keys) { keys.forEach(key => records.delete(key)); },
    async finishSuccess(args) { assert.equal(args.source, 'barang_masuk'); }, async finishError() {},
  };
}

test('Barang Masuk maps headers, normalizes values, and retains original sheet identity', async () => {
  const parsed = await parseBarangMasukValues([HEADER.map(item => ` ${item.toLowerCase()} `), row('SKU–1'), [], row('SKU-2')]);
  assert.equal(buildSourceRowKey(2), 'barang_masuk:2');
  assert.deepEqual(parsed.rows.map(item => item.source_row_key), ['barang_masuk:2', 'barang_masuk:4']);
  assert.deepEqual(parsed.rows[0], {
    tanggal: '2026-08-30', from_location: 'INBOUND', to_location: 'A -01', sku: 'SKU-1', nama_barang: 'Produk SKU–1',
    qty: 10, status: 'Received', pic: 'Abi', keterangan: 'Baik', source_row_key: 'barang_masuk:2', source_row_number: 2,
    source_hash: parsed.rows[0].source_hash,
  });
  assert.match(parsed.rows[0].source_hash, /^[a-f0-9]{64}$/);
});

test('Barang Masuk rejects missing headers and diagnoses invalid rows without deleting their identity', async () => {
  await assert.rejects(() => parseBarangMasukValues([HEADER.slice(0, -1)]), error => error.code === 'INVALID_HEADER');
  const parsed = await parseBarangMasukValues([HEADER, row('', '#VALUE!')]);
  assert.deepEqual(parsed.invalidRows[0].errors, ['SKU_REQUIRED', 'INVALID_NUMBER:QTY']);
  assert.equal(parsed.sourceKeys.has('barang_masuk:2'), true);
});

test('Barang Masuk sync covers empty DB, idempotency, one update, one insert, and one delete', async () => {
  const gateway = statefulGateway();
  const run = values => syncBarangMasuk({}, { gateway, fetchValues: async () => values, logger });
  const initial = [HEADER, row('A'), row('B')];
  let result = await run(initial);
  assert.deepEqual([result.inserted, result.updated, result.deleted], [2, 0, 0]);
  result = await run(initial);
  assert.deepEqual([result.inserted, result.updated, result.deleted, result.unchanged], [0, 0, 0, 2]);
  result = await run([HEADER, row('A', '11'), row('B')]);
  assert.deepEqual([result.inserted, result.updated, result.deleted], [0, 1, 0]);
  result = await run([HEADER, row('A', '11'), row('B'), row('C')]);
  assert.deepEqual([result.inserted, result.updated, result.deleted], [1, 0, 0]);
  result = await run([HEADER, row('A', '11'), row('C')]);
  assert.deepEqual([result.inserted, result.updated, result.deleted], [0, 1, 1]);
});
