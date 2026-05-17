import { json, getAccessToken, escSheet } from './_utils';

const COLUMNS = ['Centang', 'No', 'SKU', 'Nama Barang', 'Qty', 'Rak tujuan', 'Lokasi', 'Stok Bulky', 'Stok Retail', 'Status', 'Keterangan'];

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
    const header = rows[0] || [];
    const idx = Object.fromEntries(COLUMNS.map(c => [c, header.indexOf(c)]));
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const get = (c) => (idx[c] >= 0 ? (r[idx[c]] || '') : '');
      out.push({ rowNumber: i + 1, checked: String(get('Centang')).toUpperCase() === 'TRUE', no: get('No'), sku: get('SKU'), namaBarang: get('Nama Barang'), qty: get('Qty'), rakTujuan: get('Rak tujuan'), lokasi: get('Lokasi'), stokBulky: get('Stok Bulky'), stokRetail: get('Stok Retail'), status: get('Status'), keterangan: get('Keterangan') });
    }
    return json({ sheetName, columns: COLUMNS, rows: out });
  } catch (err) { return json({ message: err?.message || 'Internal server error' }, 500); }
}
