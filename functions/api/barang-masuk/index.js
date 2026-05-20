import { json, token, SHEET_BARANG_MASUK } from '../_barang-ops.js';

const START_ROW = 2;
const RANGE = `${SHEET_BARANG_MASUK}!A1:ZZ20000`;

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
    const header = Array.isArray(values[0]) ? values[0] : [];
    const columns = header.map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`);
    const rowsRaw = values.slice(1);
    const mapped = rowsRaw
      .map((row, index) => ({ row: Array.isArray(row) ? row : [], rowNumber: START_ROW + index }))
      .filter(({ row }) => row.some(cell => String(cell ?? '').trim()))
      .map(({ row, rowNumber }) => {
        const item = { rowNumber };
        columns.forEach((col, colIndex) => { item[col] = row[colIndex] ?? ''; });
        return item;
      });
    const rows = limitRows(mapped, request);
    return json({ success: true, spreadsheetId, sheetName: SHEET_BARANG_MASUK, columns, startRow: START_ROW, data: rows, rows, values: rows.map(row => columns.map(key => row[key] ?? '')) });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
