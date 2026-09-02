import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInventorySummary } from '../functions/api/_inventory-analytics.js';

test('inventory summary preserves dashboard, accuracy, warning and minus semantics', () => {
  const rows = {
    kartuStok: [
      { sku: 'A', stok_akhir: -3, pengeluaran: 2 },
      { sku: 'B', stok_akhir: 5, pengeluaran: 0 },
    ],
    rpl: [
      { sku: 'A', nama_barang: 'Alpha', lokasi_bulky: 'AA-1-1-A', selisih: 0 },
      { sku: 'B', nama_barang: 'Beta', lokasi_bulky: 'AA-1-1-B', selisih: 2 },
    ],
    bulky: [
      { sku: 'A', nama_barang: 'Alpha', lokasi_bulky: 'A01-1', selisih: 0 },
      { sku: 'B', nama_barang: 'Beta changed', lokasi_bulky: 'A01-1', selisih: 0 },
    ],
    barangMasuk: [
      { sku: 'A', status: 'Barang Masuk', tanggal: '2026-09-02' },
      { sku: 'A', status: 'Movement', tanggal: '2026-09-02' },
      { sku: '', status: 'Barang Masuk', tanggal: '2026-09-02' },
    ],
    barangKeluar: [{ sku: 'B', keterangan: 'Pengeluaran', tanggal: '2026-09-02' }],
  };

  const summary = computeInventorySummary(rows, new Date('2026-09-02T12:00:00Z'));
  assert.equal(summary.totalSku, 2);
  assert.equal(summary.barangMasuk, 1);
  assert.equal(summary.barangKeluar, 1);
  assert.equal(summary.totalMovement, 1);
  assert.equal(summary.minusStock, 1);
  assert.equal(summary.minusQuantity, 3);
  assert.equal(summary.accuracy, 50);
  assert.equal(summary.duplicateSku, 1);
  assert.equal(summary.missingSku, 1);
  assert.equal(summary.locationMismatch, 2);
  assert.equal(summary.deadStock, 1);
  assert.equal(summary.reconciliationDifference, 2);
});

test('dashboard bootstrap uses summary API without full mode', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8'));
  const summaryBootstrap = source.slice(source.indexOf('async function initAppData()'), source.indexOf('await hydrateModuleCachesFromDb()', source.indexOf('async function initAppData()')));
  assert.match(summaryBootstrap, /\/api\/dashboard-summary/);
  assert.doesNotMatch(summaryBootstrap, /mode=full/);
  assert.match(source, /!\["dashboard","search"\]\.includes\(page\)&&isSummaryOnlyLoaded/);
});
