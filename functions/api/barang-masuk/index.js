import { json, token, SHEET_BARANG_MASUK, BARANG_COLUMNS, barangDataRange, mapBarangSheetValues } from '../_barang-ops.js';

const START_ROW = 2;
// Keep the end row open so new transactions beyond row 20,000 are included.
const RANGE = barangDataRange(SHEET_BARANG_MASUK, START_ROW);

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
    const access = await token(env);
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(RANGE)}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ success: false, message: data?.error?.message || 'Gagal membaca sheet Barang Masuk', detail: data }, res.status);
    const values = Array.isArray(data?.values) ? data.values : [];
    const rows = limitRows(mapBarangSheetValues(values, START_ROW), request);
    return json({ success: true, spreadsheetId, sheetName: SHEET_BARANG_MASUK, columns: BARANG_COLUMNS, startRow: START_ROW, data: rows, rows, values: rows.map(row => BARANG_COLUMNS.map(key => row[key] ?? '')) });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
