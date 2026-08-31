import { getSecretSupabaseConfig } from '../_supabase-config.js';

const TABLE = 'inventory_barang_masuk';
const COLUMNS = 'tanggal,from_location,to_location,sku,nama_barang,qty,status,pic,keterangan,source_row_number,synced_at';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const FULL_BATCH_SIZE = 1000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, match => `\\${match}`);
}

export function mapBarangMasukRow(row = {}) {
  return {
    tanggal: row.tanggal ?? '',
    from: row.from_location ?? '',
    from_location: row.from_location ?? '',
    to: row.to_location ?? '',
    to_location: row.to_location ?? '',
    sku: row.sku ?? '',
    namaBarang: row.nama_barang ?? '',
    nama_barang: row.nama_barang ?? '',
    qty: row.qty ?? 0,
    status: row.status ?? '',
    pic: row.pic ?? '',
    keterangan: row.keterangan ?? '',
    rowNumber: row.source_row_number ?? null,
    source_row_number: row.source_row_number ?? null,
    synced_at: row.synced_at ?? null,
  };
}

async function supabaseGet(env, path, { count = false } = {}) {
  const { url, key } = getSecretSupabaseConfig(env);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(count ? { Prefer: 'count=exact' } : {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `Supabase HTTP ${response.status}`);
  return { payload: Array.isArray(payload) ? payload : [], response };
}

function exactTotal(response, fallback) {
  const total = String(response.headers.get('content-range') || '').split('/')[1];
  return total && total !== '*' ? Number(total) : fallback;
}

async function fetchSyncStatus(env) {
  const path = 'inventory_sync_status?select=source,status,last_success_at,last_attempt_at,source_row_count,error_message&source=eq.barang_masuk&limit=1';
  const { payload } = await supabaseGet(env, path);
  return payload[0] || null;
}

export async function handleBarangMasukRequest({ request, env }) {
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') === 'full' ? 'full' : 'page';
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
    const filters = [];
    const sku = String(url.searchParams.get('sku') || '').trim();
    const search = String(url.searchParams.get('q') || '').trim();
    const from = String(url.searchParams.get('from') || '').trim();
    const to = String(url.searchParams.get('to') || '').trim();
    const status = String(url.searchParams.get('status') || '').trim();
    const startDate = String(url.searchParams.get('startDate') || '').trim();
    const endDate = String(url.searchParams.get('endDate') || '').trim();

    if (sku) filters.push(`sku=ilike.${encodeURIComponent(`%${escapeLike(sku)}%`)}`);
    if (search) {
      const term = encodeURIComponent(`*${escapeLike(search)}*`);
      filters.push(`or=(sku.ilike.${term},nama_barang.ilike.${term})`);
    }
    if (from) filters.push(`from_location=eq.${encodeURIComponent(from)}`);
    if (to) filters.push(`to_location=eq.${encodeURIComponent(to)}`);
    if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
    if (startDate) filters.push(`tanggal=gte.${encodeURIComponent(startDate)}`);
    if (endDate) filters.push(`tanggal=lte.${encodeURIComponent(endDate)}`);
    const filterQuery = filters.length ? `&${filters.join('&')}` : '';

    let rawRows = [];
    let total = 0;
    if (mode === 'full') {
      for (let offset = 0; ; offset += FULL_BATCH_SIZE) {
        const result = await supabaseGet(env, `${TABLE}?select=${COLUMNS}${filterQuery}&order=source_row_number.asc&offset=${offset}&limit=${FULL_BATCH_SIZE}`, { count: offset === 0 });
        rawRows.push(...result.payload);
        if (offset === 0) total = exactTotal(result.response, result.payload.length);
        if (result.payload.length < FULL_BATCH_SIZE) break;
      }
    } else {
      const offset = (page - 1) * limit;
      const result = await supabaseGet(env, `${TABLE}?select=${COLUMNS}${filterQuery}&order=source_row_number.asc&offset=${offset}&limit=${limit}`, { count: true });
      rawRows = result.payload;
      total = exactTotal(result.response, result.payload.length);
    }

    const syncStatus = await fetchSyncStatus(env);
    const rows = rawRows.map(mapBarangMasukRow);
    return json({
      success: true,
      source: 'supabase',
      table: `public.${TABLE}`,
      sheetName: 'Barang Masuk',
      startRow: 2,
      columns: ['tanggal', 'from', 'to', 'sku', 'namaBarang', 'qty', 'status', 'pic', 'keterangan'],
      data: rows,
      rows,
      values: rows.map(row => ['tanggal', 'from', 'to', 'sku', 'namaBarang', 'qty', 'status', 'pic', 'keterangan'].map(key => row[key] ?? '')),
      total,
      page,
      limit: mode === 'full' ? rows.length : limit,
      pageSize: mode === 'full' ? rows.length : limit,
      lastSync: syncStatus?.last_success_at ?? null,
      syncStatus,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[BarangMasukSupabase]', error?.message || error);
    return json({ success: false, source: 'supabase', message: `Gagal membaca Barang Masuk dari Supabase: ${error?.message || 'Unknown error'}` }, 502);
  }
}

export function onRequestGet(context) {
  return handleBarangMasukRequest(context);
}
