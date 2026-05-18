import { json, token, SHEET_BARANG_KELUAR } from '../_barang-ops.js';

const MAX_LIMIT = 1000;
const DEFAULT_PREVIEW_LIMIT = 50;

function toLimit(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_LIMIT);
}

function sliceLatest(values, limit) {
  if (!Array.isArray(values) || values.length <= 1) return Array.isArray(values) ? values : [];
  const [header, ...rows] = values;
  return [header, ...rows.slice(-limit)];
}

export async function onRequestGet({ request, env }) {
  try {
    const spreadsheetId = String(env.SHEET_ID_2026 || '').trim();
    if (!spreadsheetId) return json({ success: false, message: 'SHEET_ID_2026 belum diset' }, 500);

    const url = new URL(request.url);
    const mode = String(url.searchParams.get('mode') || 'full').trim().toLowerCase();
    const limit = toLimit(url.searchParams.get('limit'), mode === 'preview' ? DEFAULT_PREVIEW_LIMIT : MAX_LIMIT);

    const access = await token(env);
    const range = `${SHEET_BARANG_KELUAR}!A1:I20000`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ success: false, message: data?.error?.message || 'Gagal membaca sheet Barang KeIuar', detail: data }, res.status);

    const allValues = Array.isArray(data?.values) ? data.values : [];
    const values = (mode === 'preview' || mode === 'latest') ? sliceLatest(allValues, limit) : allValues;

    return json({ success: true, spreadsheetId, sheetName: SHEET_BARANG_KELUAR, mode, limit, values, totalRows: Math.max(allValues.length - 1, 0) });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
