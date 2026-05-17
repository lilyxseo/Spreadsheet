import { json, getAccessToken, escSheet, buildHeaderInfo } from './_utils';

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
    const headerInfo = buildHeaderInfo(rows);
    if (!headerInfo) return json({ message: 'Header tidak valid. Pastikan ada kolom SKU, Nama Barang, dan Qty.' }, 400);

    const getCell = (row, field) => {
      const colIndex = headerInfo.columnMap[field];
      if (colIndex === undefined) return '';
      return String((row || [])[colIndex] || '').trim();
    };

    const out = [];
    for (let i = headerInfo.dataStartIndex; i < rows.length; i++) {
      const r = rows[i] || [];
      if (!r.some((cell) => String(cell || '').trim())) continue;
      const sku = getCell(r, 'sku');
      const namaBarang = getCell(r, 'namaBarang');
      if (!sku && !namaBarang) continue;
      const checked = (r || [])[headerInfo.columnMap.checked];
      out.push({
        rowNumber: i + 1,
        checked,
        no: getCell(r, 'no'),
        sku,
        namaBarang,
        qty: getCell(r, 'qty'),
        rakTujuan: getCell(r, 'rakTujuan'),
        lokasi: getCell(r, 'lokasi'),
        stokBulky: getCell(r, 'stokBulky'),
        stokRetail: getCell(r, 'stokRetail'),
        status: getCell(r, 'status'),
        keterangan: getCell(r, 'keterangan')
      });
    }
    return json({ sheetName, rows: out });
  } catch (err) { return json({ message: err?.message || 'Internal server error' }, 500); }
}
