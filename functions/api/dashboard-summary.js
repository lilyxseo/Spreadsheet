import { getRequestRole } from './_authz.js';
import { getSecretSupabaseConfig } from './_supabase-config.js';

const SOURCES = Object.freeze({
  kartuStok: { table: 'inventory_kartu_stok', select: 'sku,stok_akhir' },
  rpl: { table: 'inventory_rpl', select: 'sku,stok_akhir' },
  bulky: { table: 'inventory_bulky', select: 'sku,stok_akhir' },
  barangMasuk: { table: 'inventory_barang_masuk', select: 'sku,qty,status,tanggal' },
  barangKeluar: { table: 'inventory_barang_keluar', select: 'sku,qty,status,tanggal' },
});
const BATCH_SIZE = 1000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, max-age=30' } });
}

async function query(config, path, count = false) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, { headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, ...(count ? { Prefer: 'count=exact' } : {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload)) throw new Error(payload?.message || `Supabase HTTP ${response.status}`);
  const exact = Number(String(response.headers.get('content-range') || '').split('/')[1]);
  return { rows: payload, total: Number.isFinite(exact) ? exact : payload.length };
}

async function aggregateSource(config, source) {
  const sku = new Set(); let rows = 0, totalQty = 0, validCount = 0, todayCount = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const result = await query(config, `${source.table}?select=${source.select}&offset=${offset}&limit=${BATCH_SIZE}`, offset === 0);
    if (offset === 0) rows = result.total;
    for (const row of result.rows) {
      const code = String(row.sku || '').trim(); if (code) sku.add(code.toUpperCase());
      const qty = Number(row.stok_akhir ?? row.qty); if (Number.isFinite(qty)) totalQty += qty;
      if (code) validCount++;
      if (String(row.tanggal || '').slice(0, 10) === today) todayCount++;
    }
    if (result.rows.length < BATCH_SIZE || offset + result.rows.length >= rows) break;
  }
  return { rows, totalQty, validCount, excludedCount: Math.max(0, rows - validCount), todayCount, sku };
}

function mapMovement(row = {}) {
  return { tanggal: row.tanggal ?? '', from: row.from_location ?? '', to: row.to_location ?? '', sku: row.sku ?? '', namaBarang: row.nama_barang ?? '', qty: row.qty ?? 0, status: row.status ?? '', pic: row.pic ?? '', keterangan: row.keterangan ?? '', rowNumber: row.source_row_number ?? null };
}

export async function handleDashboardSummaryRequest({ request, env }) {
  const role = await getRequestRole(request, env);
  if (!role) return json({ success: false, message: 'Sesi tidak valid' }, 401);
  try {
    const config = getSecretSupabaseConfig(env);
    const entries = await Promise.all(Object.entries(SOURCES).map(async ([key, source]) => [key, await aggregateSource(config, source)]));
    const raw = Object.fromEntries(entries); const uniqueSku = new Set();
    Object.values(raw).forEach(item => item.sku.forEach(value => uniqueSku.add(value)));
    const [masuk, keluar] = await Promise.all([
      query(config, 'inventory_barang_masuk?select=*&order=source_row_number.desc&limit=50'),
      query(config, 'inventory_barang_keluar?select=*&order=source_row_number.desc&limit=50'),
    ]);
    const summary = {}; for (const [key, value] of Object.entries(raw)) summary[key] = { rows: value.rows, totalQty: value.totalQty, validCount: value.validCount, excludedCount: value.excludedCount, todayCount: value.todayCount };
    summary.uniqueSku = uniqueSku.size;
    summary.totalStock = raw.kartuStok.totalQty + raw.rpl.totalQty + raw.bulky.totalQty;
    summary.excludedCount = Object.values(raw).reduce((sum, item) => sum + item.excludedCount, 0);
    return json({ success: true, source: 'supabase', summary, recent: { barangMasuk: masuk.rows.map(mapMovement), barangKeluar: keluar.rows.map(mapMovement) } });
  } catch (error) {
    console.error('[DashboardSummary]', error?.message || error);
    return json({ success: false, message: 'Gagal membaca ringkasan dashboard dari Supabase.' }, 502);
  }
}

export function onRequestGet(context) { return handleDashboardSummaryRequest(context); }
