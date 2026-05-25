import { json, token, SHEET_BARANG_MASUK, SHEET_BARANG_KELUAR } from './_barang-ops.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const targetSheet = String(body?.targetSheet || SHEET_BARANG_MASUK).trim();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) return json({ success: false, message: 'Rows kosong' }, 400);
    const access = await token(env);
    const spreadsheetId = String(env.SHEET_ID_2026 || '').trim();
    if (!spreadsheetId) return json({ success: false, message: 'SHEET_ID_2026 belum diset' }, 500);

    const sheetName = targetSheet === 'Barang Keluar' ? SHEET_BARANG_KELUAR : SHEET_BARANG_MASUK;
    const tanggal = String(body?.header?.['Tanggal Dibuat'] || new Date().toISOString().slice(0, 10));
    const from = String(body?.header?.['Dari'] || '');
    const to = String(body?.header?.['Kepada'] || '');
    const status = String(body?.header?.['Status Transfer'] || 'Transfer');
    const ref = String(body?.header?.['Nomor Referensi'] || body?.header?.['Nomor Transfer'] || '');

    const values = rows.map((r) => [tanggal, from, to, String(r?.sku || ''), String(r?.nama || ''), Number(r?.jumlah || 0), status, 'SYSTEM', ref || String(r?.catatan || '')]);
    const range = `${sheetName}!A:I`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values })
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return json({ success: false, message: out?.error?.message || 'Gagal append data', detail: out }, res.status);
    return json({ success: true, imported: values.length, targetSheet: sheetName, result: out });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
