import { json, getAccessToken, escSheet } from './_utils';

const TRIP_DATA_START_ROW = 6;

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const sheetName = String(url.searchParams.get('sheetName') || '').trim();
    if (!sheetName) return json({ message: 'sheetName wajib diisi' }, 400);
    const accessToken = await getAccessToken(env);
    const range = `${escSheet(sheetName)}!A1:ZZ`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID_INVENTORY}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) return json({ message: data.error?.message || 'Gagal membaca data sheet' }, res.status);
    const rows = data.values || [];
    const out = [];
    for (let i = TRIP_DATA_START_ROW - 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const sku = String(r[2] || '').trim();
      const namaBarang = String(r[3] || '').trim();
      if (!sku && !namaBarang) continue;
      out.push({
        rowNumber: i + 1,
        checked: String(r[0] || '').toUpperCase() === 'TRUE',
        no: String(r[1] || ''),
        sku,
        namaBarang,
        qty: String(r[4] || ''),
        rakTujuan: String(r[5] || ''),
        lokasi: String(r[6] || ''),
        stokBulky: String(r[7] || ''),
        stokRetail: String(r[8] || ''),
        status: String(r[9] || ''),
        keterangan: String(r[10] || '')
      });
    }
    return json({ sheetName, rows: out });
  } catch (err) { return json({ message: err?.message || 'Internal server error' }, 500); }
}
