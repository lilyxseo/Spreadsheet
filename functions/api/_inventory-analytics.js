import { getSecretSupabaseConfig } from './_supabase-config.js';

const BATCH_SIZE = 1000;
const SOURCES = {
  kartuStok: { table: 'inventory_kartu_stok', select: 'sku,nama_barang,lokasi_bulky,stok_akhir,pengeluaran' },
  rpl: { table: 'inventory_rpl', select: 'sku,nama_barang,lokasi_bulky,stok_akhir' },
  bulky: { table: 'inventory_bulky', select: 'sku,nama_barang,lokasi_bulky,stok_akhir' },
  barangMasuk: { table: 'inventory_barang_masuk', select: 'sku,nama_barang,qty,status,tanggal,to_location' },
  barangKeluar: { table: 'inventory_barang_keluar', select: 'sku,nama_barang,qty,status,tanggal,from_location,keterangan' },
};

function number(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function key(value) {
  return String(value ?? '').normalize('NFKC').trim().toUpperCase();
}

function dateKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (local) {
    let year = Number(local[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(local[1]).padStart(2, '0')}-${String(local[2]).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

async function readAll(config, source) {
  const rows = [];
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const url = `${config.url}/rest/v1/${source.table}?select=${source.select}&offset=${offset}&limit=${BATCH_SIZE}`;
    const response = await fetch(url, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `Supabase HTTP ${response.status}`);
    if (!Array.isArray(payload)) throw new TypeError(`${source.table} returned an invalid response`);
    rows.push(...payload);
    if (payload.length < BATCH_SIZE) return rows;
  }
}

export async function loadInventoryAnalyticsRows(env) {
  const config = getSecretSupabaseConfig(env);
  const values = await Promise.all(Object.values(SOURCES).map(source => readAll(config, source)));
  return Object.fromEntries(Object.keys(SOURCES).map((name, index) => [name, values[index]]));
}

export function computeInventorySummary(rows, now = new Date()) {
  const all = Object.values(rows).flat();
  const skuSet = new Set(all.map(row => key(row.sku)).filter(Boolean));
  const today = now.toISOString().slice(0, 10);
  const validInbound = rows.barangMasuk.filter(row => key(row.sku));
  const inbound = validInbound.filter(row => key(row.status) === 'BARANG MASUK');
  const movement = validInbound.filter(row => key(row.status).includes('MOVEMENT'));
  const outbound = rows.barangKeluar.filter(row => dateKey(row.tanggal) && key(row.keterangan) === 'PENGELUARAN');
  const bySku = new Map();
  for (const row of [...rows.rpl, ...rows.bulky]) {
    const sku = key(row.sku);
    if (!sku) continue;
    const item = bySku.get(sku) || { difference: 0, names: new Set(), locations: new Set() };
    // This intentionally mirrors the previous browser accuracy calculation:
    // absent reconciliation/selisih values are treated as zero.
    item.difference += number(row.selisih);
    if (row.nama_barang) item.names.add(key(row.nama_barang));
    if (row.lokasi_bulky) item.locations.add(key(row.lokasi_bulky));
    bySku.set(sku, item);
  }
  const accurate = [...bySku.values()].filter(item => item.difference === 0).length;
  const minusRows = rows.kartuStok.filter(row => number(row.stok_akhir) < 0);
  const minusSkus = new Set(minusRows.map(row => key(row.sku)).filter(Boolean));
  const duplicateSku = [...bySku.values()].filter(item => item.names.size > 1).length;
  const locationMismatch = [...bySku.values()].filter(item => item.locations.size > 1).length;
  const missingSku = all.filter(row => !key(row.sku)).length;
  const warningCount = minusSkus.size + duplicateSku + missingSku + locationMismatch;
  const totalMovement = movement.length;
  return {
    barangMasuk: inbound.length,
    barangMasukHariIni: inbound.filter(row => dateKey(row.tanggal) === today).length,
    barangKeluar: outbound.length,
    barangKeluarHariIni: outbound.filter(row => dateKey(row.tanggal) === today).length,
    kartuStok: rows.kartuStok.length,
    rpl: rows.rpl.length,
    bulky: rows.bulky.length,
    totalSku: skuSet.size,
    totalMovement,
    totalMovementHariIni: movement.filter(row => dateKey(row.tanggal) === today).length,
    minusStock: minusSkus.size,
    minusQuantity: Math.abs(minusRows.reduce((sum, row) => sum + number(row.stok_akhir), 0)),
    warningCount,
    accuracy: bySku.size ? Number(((accurate / bySku.size) * 100).toFixed(2)) : 0,
    accurateSku: accurate,
    inaccurateSku: bySku.size - accurate,
    duplicateSku,
    missingSku,
    locationMismatch,
    reconciliationDifference: [...bySku.values()].reduce((sum, item) => sum + item.difference, 0),
    overstock: rows.kartuStok.filter(row => number(row.stok_akhir) > 0 && number(row.pengeluaran) === 0).length,
    deadStock: rows.kartuStok.filter(row => number(row.stok_akhir) > 0 && number(row.pengeluaran) === 0).length,
  };
}
