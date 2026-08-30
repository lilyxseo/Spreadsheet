import {
  createInventorySyncService, diffRows, GOOGLE_429_DELAYS_MS, normalizeLocation,
  normalizeNumber, normalizeSku, normalizeText, normalizedHeader, SOURCE_SIZE_GUARD,
  SYNC_BATCH_SIZE, SyncError,
} from './_sync-engine.js';

export { diffRows, GOOGLE_429_DELAYS_MS, normalizeLocation, normalizeNumber, normalizeSku, normalizeText, SOURCE_SIZE_GUARD, SYNC_BATCH_SIZE, SyncError };
export const SYNC_SOURCE = 'kartu_stok';
export const KARTU_STOK_SHEET_NAME = 'Kartu Stock';
export const REQUIRED_HEADERS = Object.freeze(['LOKASI BULKY', 'SKU', 'NAMA BARANG', 'STOK AWAL', 'INTERNAL STOCK TRANSFER', 'REPLENISHMENT', 'PENGELUARAN', 'STOK AKHIR']);
const FIELD_BY_HEADER = Object.freeze({ 'LOKASI BULKY': 'lokasi_bulky', SKU: 'sku', 'NAMA BARANG': 'nama_barang', 'STOK AWAL': 'stok_awal', 'INTERNAL STOCK TRANSFER': 'internal_stock_transfer', REPLENISHMENT: 'replenishment', PENGELUARAN: 'pengeluaran', 'STOK AKHIR': 'stok_akhir' });

async function parseValues(values, helpers) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) throw new SyncError('INVALID_HEADER', 'Header Kartu Stok tidak ditemukan');
  const headerIndexes = new Map(values[0].map((header, index) => [normalizedHeader(header), index]));
  const missing = REQUIRED_HEADERS.filter(header => !headerIndexes.has(header));
  if (missing.length) throw new SyncError('INVALID_HEADER', `Header wajib tidak ditemukan: ${missing.join(', ')}`);
  const rows = [], invalidRows = [], sourceKeys = new Set(); let sourceRowCount = 0;
  for (let index = 1; index < values.length; index += 1) {
    const cells = Array.isArray(values[index]) ? values[index] : [], sourceRowNumber = index + 1, read = header => cells[headerIndexes.get(header)];
    const lokasi = normalizeLocation(read('LOKASI BULKY')), sku = normalizeSku(read('SKU')), nama = normalizeText(read('NAMA BARANG'));
    if (!lokasi && !sku && !nama) continue;
    sourceRowCount += 1;
    const source_row_key = helpers.buildSourceRowKey(sourceRowNumber); sourceKeys.add(source_row_key);
    const row = { lokasi_bulky: lokasi, sku, nama_barang: nama, source_row_key, source_row_number: sourceRowNumber }, errors = [];
    if (!sku) errors.push('SKU_REQUIRED');
    for (const header of REQUIRED_HEADERS.slice(3)) { const field = FIELD_BY_HEADER[header], value = normalizeNumber(read(header)); if (!value.valid) errors.push(`INVALID_NUMBER:${header}`); else row[field] = value.value; }
    if (errors.length) { invalidRows.push({ sourceRowNumber, sourceRowKey: source_row_key, errors }); continue; }
    row.source_hash = await helpers.buildSourceHash(row); rows.push(row);
  }
  return { rows, invalidRows, sourceKeys, sourceRowCount };
}

const service = createInventorySyncService({
  source: SYNC_SOURCE, sheetName: KARTU_STOK_SHEET_NAME, tableName: 'inventory_kartu_stok', parseValues,
  hashFields: ['lokasi_bulky', 'sku', 'nama_barang', 'stok_awal', 'internal_stock_transfer', 'replenishment', 'pengeluaran', 'stok_akhir'],
});
export const buildSourceRowKey = service.buildSourceRowKey;
export const buildSourceHash = service.buildSourceHash;
export const fetchKartuStokValues = service.fetchValues;
export const syncKartuStok = service.sync;
export function parseKartuStokValues(values) { return parseValues(values, service); }
