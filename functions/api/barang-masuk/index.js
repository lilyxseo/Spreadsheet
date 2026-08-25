import { json, token, cachedGoogleRead, SHEET_BARANG_MASUK, BARANG_COLUMNS, mapBarangSheetValues } from '../_barang-ops.js';

const START_ROW = 2;
const RANGE = `${SHEET_BARANG_MASUK}!A${START_ROW}:I20000`;

function limitRows(rows, request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'full';
  const limit = Number(url.searchParams.get('limit') || 1000);
  if (mode === 'latest') return rows.slice(-Math.max(1, Number.isFinite(limit) ? limit : 1000));
  return rows;
}

export async function onRequestGet({ request, env }) {
  try {
    const spreadsheetId = String(env.SHEET_ID_2026 || '').trim();
    if (!spreadsheetId) return json({ success: false, message: 'SHEET_ID_2026 belum diset' }, 500);
    const force = new URL(request.url).searchParams.get('force') === '1';
    const cached = await cachedGoogleRead(`barang-masuk:${spreadsheetId}`, async () => {
      const access = await token(env);
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(RANGE)}`, { headers: { Authorization: `Bearer ${access}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || 'Gagal membaca sheet Barang Masuk');
      return { data, etag: res.headers.get('etag') || '' };
    }, { force });
    const data = cached.value.data;
    const values = Array.isArray(data?.values) ? data.values : [];
    const rows = limitRows(mapBarangSheetValues(values, START_ROW), request);
    return json({ success: true, spreadsheetId, sheetName: SHEET_BARANG_MASUK, columns: BARANG_COLUMNS, startRow: START_ROW, data: rows, rows, values: rows.map(row => BARANG_COLUMNS.map(key => row[key] ?? '')), version: cached.version, fromCache: cached.fromCache });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
