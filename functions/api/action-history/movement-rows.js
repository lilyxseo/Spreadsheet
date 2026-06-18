import { json, insertRows, SHEET_BARANG_MASUK, SHEET_BARANG_KELUAR, BARANG_COLUMNS } from '../_barang-ops.js';
import { requirePicRole } from '../_authz.js';

export async function onRequestPost({ request, env }) {
  const authz = await requirePicRole({ request, env });
  if (!authz.ok) return authz.response;
  try {
    const { mode, rows } = await request.json();
    const sheetName = mode === 'in' ? SHEET_BARANG_MASUK : mode === 'out' ? SHEET_BARANG_KELUAR : '';
    if (!sheetName) return json({ success: false, message: 'mode tidak valid' }, 400);
    const cleanRows = (Array.isArray(rows) ? rows : [])
      .filter(row => Number.isInteger(Number(row?.rowNumber)) && Number(row.rowNumber) > 1)
      .map(row => ({ rowNumber: Number(row.rowNumber), values: BARANG_COLUMNS.map(key => row?.[key] ?? '') }));
    if (!cleanRows.length) return json({ success: false, message: 'rows wajib diisi' }, 400);
    await insertRows({ env, sheetName, rows: cleanRows });
    return json({ success: true, restored: cleanRows.length });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
