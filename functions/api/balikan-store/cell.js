import { json, getAccessToken, escSheet, buildHeaderInfo } from './_utils';

const EDITABLE_FIELDS = {
  qty: 'Qty',
  rakTujuan: 'Rak tujuan',
  lokasi: 'Lokasi',
  stokBulky: 'Stok Bulky',
  stokRetail: 'Stok Retail',
  status: 'Status',
  keterangan: 'Keterangan'
};

const colToLetter = (colIndex) => {
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
    if (!Object.keys(EDITABLE_FIELDS).includes(field)) return json({ message: 'field tidak valid atau tidak dapat diedit' }, 400);

    const accessToken = await getAccessToken(env);
    const readRange = `${escSheet(sheetName)}!A1:ZZ10`;
    const readRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID_INVENTORY}/values/${encodeURIComponent(readRange)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const readData = await readRes.json();
    if (!readRes.ok) return json({ message: readData.error?.message || 'Gagal membaca header sheet' }, readRes.status);

    const headerInfo = buildHeaderInfo(readData.values || []);
    if (!headerInfo) return json({ message: 'Header tidak valid. Pastikan ada kolom SKU, Nama Barang, dan Qty.' }, 400);

    const targetCol = headerInfo.columnMap[field];
    if (targetCol === undefined) return json({ message: `Kolom ${EDITABLE_FIELDS[field]} tidak ditemukan di sheet` }, 400);

    const protectedFields = ['no', 'sku', 'namaBarang'];
    if (protectedFields.includes(field)) return json({ message: 'Kolom ini tidak boleh diupdate' }, 400);

    const range = `${escSheet(sheetName)}!${colToLetter(targetCol)}${rowNumber}`;
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
