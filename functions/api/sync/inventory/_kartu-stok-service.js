import { token as getGoogleAccessToken } from '../../_barang-ops.js';

export const SYNC_SOURCE = 'kartu_stok';
export const KARTU_STOK_SHEET_NAME = 'Kartu Stock';
export const SYNC_BATCH_SIZE = 300;
export const SOURCE_SIZE_GUARD = Object.freeze({ previousMinimum: 100, minimumRatio: 0.25 });
export const GOOGLE_429_DELAYS_MS = Object.freeze([2000, 5000, 10000]);

export const REQUIRED_HEADERS = Object.freeze([
  'LOKASI BULKY', 'SKU', 'NAMA BARANG', 'STOK AWAL',
  'INTERNAL STOCK TRANSFER', 'REPLENISHMENT', 'PENGELUARAN', 'STOK AKHIR',
]);

const FIELD_BY_HEADER = Object.freeze({
  'LOKASI BULKY': 'lokasi_bulky', SKU: 'sku', 'NAMA BARANG': 'nama_barang',
  'STOK AWAL': 'stok_awal', 'INTERNAL STOCK TRANSFER': 'internal_stock_transfer',
  REPLENISHMENT: 'replenishment', PENGELUARAN: 'pengeluaran', 'STOK AKHIR': 'stok_akhir',
});
const NUMBER_FIELDS = Object.freeze(['stok_awal', 'internal_stock_transfer', 'replenishment', 'pengeluaran', 'stok_akhir']);
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const SMART_DASH = /[\u2010-\u2015\u2212]/g;

export class SyncError extends Error {
  constructor(code, message = code) { super(message); this.name = 'SyncError'; this.code = code; }
}

export function normalizeText(value) {
  return (value == null ? '' : String(value)).normalize('NFC').replace(ZERO_WIDTH, '').trim();
}
export function normalizeSku(value) { return normalizeText(value).replace(SMART_DASH, '-'); }
export function normalizeLocation(value) {
  let clean = normalizeText(value);
  try { clean = decodeURIComponent(clean); } catch (_error) { /* retain malformed URI text */ }
  return normalizeText(clean).replace(SMART_DASH, '-').replace(/\s+/g, ' ').toUpperCase();
}
export function normalizeNumber(value) {
  if (value == null || normalizeText(value) === '') return { valid: true, value: null };
  if (typeof value === 'number') return Number.isFinite(value) ? { valid: true, value } : { valid: false };
  const raw = normalizeText(value);
  // The current sheet uses comma as a thousands separator (for example 1,000).
  if (!/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(raw)) return { valid: false };
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? { valid: true, value: parsed } : { valid: false };
}
export function buildSourceRowKey(sourceRowNumber) { return `${SYNC_SOURCE}:${sourceRowNumber}`; }

function normalizedHeader(value) { return normalizeText(value).toUpperCase().replace(/\s+/g, ' '); }
function bytesToHex(buffer) { return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
export async function buildSourceHash(row) {
  return sha256(JSON.stringify([
    row.lokasi_bulky, row.sku, row.nama_barang, row.stok_awal,
    row.internal_stock_transfer, row.replenishment, row.pengeluaran, row.stok_akhir,
  ]));
}

export async function parseKartuStokValues(values) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) throw new SyncError('INVALID_HEADER', 'Header Kartu Stok tidak ditemukan');
  const headerIndexes = new Map(values[0].map((header, index) => [normalizedHeader(header), index]));
  const missing = REQUIRED_HEADERS.filter(header => !headerIndexes.has(header));
  if (missing.length) throw new SyncError('INVALID_HEADER', `Header wajib tidak ditemukan: ${missing.join(', ')}`);
  const rows = [];
  const invalidRows = [];
  const sourceKeys = new Set();
  let sourceRowCount = 0;
  for (let index = 1; index < values.length; index += 1) {
    const cells = Array.isArray(values[index]) ? values[index] : [];
    const sourceRowNumber = index + 1;
    const read = header => cells[headerIndexes.get(header)];
    const lokasi = normalizeLocation(read('LOKASI BULKY'));
    const sku = normalizeSku(read('SKU'));
    const nama = normalizeText(read('NAMA BARANG'));
    if (!lokasi && !sku && !nama) continue;
    sourceRowCount += 1;
    const source_row_key = buildSourceRowKey(sourceRowNumber);
    sourceKeys.add(source_row_key);
    const row = { lokasi_bulky: lokasi, sku, nama_barang: nama, source_row_key, source_row_number: sourceRowNumber };
    const errors = [];
    if (!sku) errors.push('SKU_REQUIRED');
    for (const header of REQUIRED_HEADERS.slice(3)) {
      const field = FIELD_BY_HEADER[header];
      const normalized = normalizeNumber(read(header));
      if (!normalized.valid) errors.push(`INVALID_NUMBER:${header}`);
      else row[field] = normalized.value;
    }
    if (errors.length) { invalidRows.push({ sourceRowNumber, sourceRowKey: source_row_key, errors }); continue; }
    row.source_hash = await buildSourceHash(row);
    rows.push(row);
  }
  return { rows, invalidRows, sourceKeys, sourceRowCount };
}

export function diffRows(sourceRows, sourceKeys, existingRows) {
  const existingByKey = new Map(existingRows.map(row => [row.source_row_key, row]));
  const rowsToInsert = [], rowsToUpdate = [];
  let unchanged = 0;
  for (const row of sourceRows) {
    const existing = existingByKey.get(row.source_row_key);
    if (!existing) rowsToInsert.push(row);
    else if (existing.source_hash !== row.source_hash) rowsToUpdate.push(row);
    else unchanged += 1;
  }
  const keysToDelete = existingRows.map(row => row.source_row_key).filter(key => !sourceKeys.has(key));
  return { rowsToInsert, rowsToUpdate, keysToDelete, unchanged };
}

function chunks(items, size = SYNC_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function spreadsheetId(env) {
  return normalizeText(env.SHEET_ID_2026 || env.GOOGLE_SHEET_ID);
}

export async function fetchKartuStokValues(env, dependencies = {}) {
  const id = spreadsheetId(env);
  if (!id) throw new SyncError('MISSING_SHEET_CONFIG', 'SHEET_ID_2026/GOOGLE_SHEET_ID belum diset');
  const accessToken = await (dependencies.getGoogleAccessToken || getGoogleAccessToken)(env);
  const fetchFn = dependencies.fetch || fetch;
  const wait = dependencies.sleep || sleep;
  const range = `'${KARTU_STOK_SHEET_NAME}'!A:ZZ`;
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchFn(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 429 && attempt < GOOGLE_429_DELAYS_MS.length) {
      await wait(GOOGLE_429_DELAYS_MS[attempt]);
      continue;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new SyncError(response.status === 429 ? 'GOOGLE_RATE_LIMITED' : 'GOOGLE_FETCH_FAILED', body?.error?.message || 'Gagal membaca Kartu Stock');
    return Array.isArray(body.values) ? body.values : [];
  }
}

function createSupabaseGateway(env, fetchFn = fetch) {
  const url = normalizeText(env.SUPABASE_URL).replace(/\/$/, '');
  const key = normalizeText(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new SyncError('MISSING_SUPABASE_CONFIG', 'Supabase server credential belum diset');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  async function request(path, options = {}) {
    const response = await fetchFn(`${url}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || body?.hint || `Supabase request gagal (${response.status})`);
    return body;
  }
  const rpc = (name, args) => request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  return {
    async acquireLock(source, lockId) { const result = await rpc('acquire_inventory_sync_lock', { source, lock_id: lockId }); return result === true || result?.acquire_inventory_sync_lock === true; },
    finishSuccess(args) { return rpc('finish_inventory_sync_success', args); },
    finishError(source, lockId, message) { return rpc('finish_inventory_sync_error', { source, lock_id: lockId, error_message: message }); },
    async insertHistory(row) { const result = await request('/rest/v1/inventory_sync_history?select=id', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }); return result?.[0]?.id; },
    updateHistory(id, row) { return request(`/rest/v1/inventory_sync_history?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }); },
    async existingMetadata() {
      const all = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await request(`/rest/v1/inventory_kartu_stok?select=source_row_key,source_hash&order=source_row_key&limit=1000&offset=${offset}`);
        all.push(...page); if (page.length < 1000) return all;
      }
    },
    async upsertRows(rows) { for (const batch of chunks(rows)) await request('/rest/v1/inventory_kartu_stok?on_conflict=source_row_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) }); },
    async deleteKeys(keys) { for (const batch of chunks(keys)) { const values = batch.map(key => `"${String(key).replace(/"/g, '\\"')}"`).join(','); await request(`/rest/v1/inventory_kartu_stok?source_row_key=in.(${encodeURIComponent(values)})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } },
  };
}

function errorText(error) { return `${error?.code ? `${error.code}: ` : ''}${error?.message || String(error)}`.slice(0, 2000); }
function log(logger, message) { (logger?.log || console.log)(`[InventorySync:${SYNC_SOURCE}] ${message}`); }

export async function syncKartuStok(env, dependencies = {}) {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const lockId = crypto.randomUUID();
  const gateway = dependencies.gateway || createSupabaseGateway(env, dependencies.fetch);
  const logger = dependencies.logger || console;
  let lockAcquired = false, historyId;
  let metrics = { sourceRows: 0, inserted: 0, updated: 0, deleted: 0, unchanged: 0, invalidRows: 0 };
  try {
    lockAcquired = await gateway.acquireLock(SYNC_SOURCE, lockId);
    if (!lockAcquired) {
      await gateway.insertHistory({ source: SYNC_SOURCE, status: 'skipped', started_at: startedAt, finished_at: new Date().toISOString(), source_row_count: 0, inserted_count: 0, updated_count: 0, deleted_count: 0, duration_ms: Date.now() - started, error_message: 'SYNC_ALREADY_RUNNING', source_version: null });
      return { success: false, skipped: true, reason: 'SYNC_ALREADY_RUNNING', source: SYNC_SOURCE, durationMs: Date.now() - started };
    }
    historyId = await gateway.insertHistory({ source: SYNC_SOURCE, status: 'syncing', started_at: startedAt, source_row_count: 0, inserted_count: 0, updated_count: 0, deleted_count: 0, duration_ms: 0, error_message: null, source_version: null });
    log(logger, 'START');
    const values = await (dependencies.fetchValues || fetchKartuStokValues)(env, dependencies);
    const parsed = await parseKartuStokValues(values);
    metrics.sourceRows = parsed.sourceRowCount; metrics.invalidRows = parsed.invalidRows.length;
    const existing = await gateway.existingMetadata();
    log(logger, `sheet rows: ${metrics.sourceRows}\nexisting rows: ${existing.length}`);
    if (existing.length > 0 && parsed.sourceRowCount === 0) {
      throw new SyncError('SUSPICIOUS_SOURCE_SIZE', 'Source kosong sementara database masih berisi data');
    }
    if (existing.length > SOURCE_SIZE_GUARD.previousMinimum && parsed.sourceRowCount < existing.length * SOURCE_SIZE_GUARD.minimumRatio) {
      throw new SyncError('SOURCE_ROW_COUNT_DROPPED_UNEXPECTEDLY', `Source ${parsed.sourceRowCount}, sebelumnya ${existing.length}`);
    }
    const diff = diffRows(parsed.rows, parsed.sourceKeys, existing);
    metrics = { ...metrics, inserted: diff.rowsToInsert.length, updated: diff.rowsToUpdate.length, deleted: diff.keysToDelete.length, unchanged: diff.unchanged };
    const sourceVersion = await sha256(JSON.stringify(parsed.rows.map(row => [row.source_row_key, row.source_hash])));
    await gateway.upsertRows([...diff.rowsToInsert, ...diff.rowsToUpdate].map(row => ({ ...row, synced_at: new Date().toISOString() })));
    await gateway.deleteKeys(diff.keysToDelete);
    const durationMs = Date.now() - started;
    await gateway.finishSuccess({ source: SYNC_SOURCE, lock_id: lockId, row_count: metrics.sourceRows, inserted_count: metrics.inserted, updated_count: metrics.updated, deleted_count: metrics.deleted, duration_ms: durationMs, source_version: sourceVersion });
    lockAcquired = false;
    await gateway.updateHistory(historyId, { status: 'success', finished_at: new Date().toISOString(), source_row_count: metrics.sourceRows, inserted_count: metrics.inserted, updated_count: metrics.updated, deleted_count: metrics.deleted, duration_ms: durationMs, error_message: null, source_version: sourceVersion });
    log(logger, `insert: ${metrics.inserted}\nupdate: ${metrics.updated}\ndelete: ${metrics.deleted}\nunchanged: ${metrics.unchanged}\nduration: ${durationMs}ms`);
    return { success: true, source: SYNC_SOURCE, ...metrics, invalidRowDiagnostics: parsed.invalidRows, durationMs, sourceVersion };
  } catch (error) {
    const durationMs = Date.now() - started;
    if (lockAcquired) {
      try { await gateway.finishError(SYNC_SOURCE, lockId, errorText(error)); lockAcquired = false; } catch (releaseError) { logger.error?.(`[InventorySync:${SYNC_SOURCE}] lock release failed: ${releaseError.message}`); }
    }
    if (historyId) {
      try { await gateway.updateHistory(historyId, { status: 'error', finished_at: new Date().toISOString(), source_row_count: metrics.sourceRows, inserted_count: metrics.inserted, updated_count: metrics.updated, deleted_count: metrics.deleted, duration_ms: durationMs, error_message: errorText(error), source_version: null }); } catch (historyError) { logger.error?.(`[InventorySync:${SYNC_SOURCE}] history update failed: ${historyError.message}`); }
    }
    throw error;
  }
}
