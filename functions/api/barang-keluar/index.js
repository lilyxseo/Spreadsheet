import { json, token, SHEET_BARANG_KELUAR, BARANG_COLUMNS, getBarangColumnsForWidth, mapBarangSheetValues } from '../_barang-ops.js';

const START_ROW = 2;
const RANGE = `${SHEET_BARANG_KELUAR}!A${START_ROW}:ZZ20000`;

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
    if (!res.ok) return json({ success: false, message: data?.error?.message || 'Gagal membaca sheet Barang KeIuar', detail: data }, res.status);
    const values = Array.isArray(data?.values) ? data.values : [];
    const rows = limitRows(mapBarangSheetValues(values, START_ROW), request);
    const maxWidth = rows.reduce((max, row) => Math.max(max, Object.keys(row || {}).filter(key => key !== 'rowNumber').length), BARANG_COLUMNS.length);
    const columns = getBarangColumnsForWidth(maxWidth);
    return json({ success: true, spreadsheetId, sheetName: SHEET_BARANG_KELUAR, columns, startRow: START_ROW, data: rows, rows, values: rows.map(row => columns.map(key => row[key] ?? '')) });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
