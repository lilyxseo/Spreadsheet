import { json, getAccessToken, escSheet, buildHeaderInfo } from './_utils';

const EDITABLE_FIELDS = new Set(['qty', 'rakTujuan', 'lokasi', 'stokBulky', 'stokRetail', 'status', 'keterangan']);

const colIndexToLetter = (colIndex) => {
  let n = colIndex;
  let letter = '';
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
};

export async function onRequestPatch({ request, env }) {
  try {
    const body = await request.json();
    const sheetName = String(body?.sheetName || '').trim();
    const rowNumber = Number(body?.rowNumber);
    const field = String(body?.field || '').trim();
    const value = body?.value == null ? '' : String(body.value);

    if (!sheetName) return json({ message: 'sheetName wajib diisi' }, 400);
    if (!Number.isInteger(rowNumber) || rowNumber <= 1) return json({ message: 'rowNumber tidak valid' }, 400);
    if (!EDITABLE_FIELDS.has(field)) return json({ message: 'Kolom tidak bisa diedit' }, 400);

    const accessToken = await getAccessToken(env);
    const readRange = `${escSheet(sheetName)}!A1:ZZ10`;
    const readRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID_INVENTORY}/values/${encodeURIComponent(readRange)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const readData = await readRes.json();
    if (!readRes.ok) return json({ message: readData.error?.message || 'Gagal membaca header sheet' }, readRes.status);

    const headerInfo = buildHeaderInfo(readData.values || []);
    if (!headerInfo) return json({ message: 'Header tidak valid. Pastikan ada kolom SKU, Nama Barang, dan Qty.' }, 400);

    const colIndex = headerInfo.columnMap[field];
    if (colIndex === undefined) return json({ message: `Kolom ${field} tidak ditemukan` }, 400);

    const colLetter = colIndexToLetter(colIndex);
    const range = `${escSheet(sheetName)}!${colLetter}${rowNumber}`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID_INVENTORY}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[value]] })
    });
    const data = await res.json();
    if (!res.ok) return json({ message: data.error?.message || 'Gagal update cell' }, res.status);

    return json({ success: true });
  } catch (err) {
    return json({ message: err?.message || 'Internal server error' }, 500);
  }
}
