import { json, token, SHEET_BARANG_KELUAR } from '../_barang-ops.js';

const RANGE = `${SHEET_BARANG_KELUAR}!A1:I20000`;

export async function onRequestGet({ env }) {
  try {
    const spreadsheetId = String(env.SHEET_ID_2026 || '').trim();
    if (!spreadsheetId) return json({ success: false, message: 'SHEET_ID_2026 belum diset' }, 500);
    const access = await token(env);
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(RANGE)}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ success: false, message: data?.error?.message || 'Gagal membaca sheet Barang KeIuar', detail: data }, res.status);
    return json({ success: true, spreadsheetId, sheetName: SHEET_BARANG_KELUAR, values: Array.isArray(data?.values) ? data.values : [] });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
