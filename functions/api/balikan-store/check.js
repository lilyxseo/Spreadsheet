import { json, getAccessToken, escSheet } from './_utils';

export async function onRequestPatch({ request, env }) {
  try {
    const body = await request.json();
    const sheetName = String(body?.sheetName || '').trim();
    const rowNumber = Number(body?.rowNumber);
    const checked = body?.checked === true;
    if (!sheetName) return json({ message: 'sheetName wajib diisi' }, 400);
    if (!Number.isInteger(rowNumber) || rowNumber <= 1) return json({ message: 'rowNumber tidak valid' }, 400);
    const accessToken = await getAccessToken(env);
    const range = `${escSheet(sheetName)}!A${rowNumber}`;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID_INVENTORY}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[checked ? 'TRUE' : 'FALSE']] }) });
    const data = await res.json();
    if (!res.ok) return json({ message: data.error?.message || 'Gagal update centang' }, res.status);
    return json({ success: true });
  } catch (err) { return json({ message: err?.message || 'Internal server error' }, 500); }
}
