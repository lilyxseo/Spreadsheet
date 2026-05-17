import { json, getAccessToken } from './_utils';

export async function onRequestGet({ env }) {
  try {
    if (!env.SHEET_ID_INVENTORY) return json({ message: 'SHEET_ID_INVENTORY belum di-set' }, 500);
    const accessToken = await getAccessToken(env);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID_INVENTORY}?fields=sheets.properties.title`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) return json({ message: data.error?.message || 'Gagal membaca metadata sheet' }, res.status);
    const sheets = (data.sheets || []).map(s => s?.properties?.title).filter(Boolean).filter(title => String(title).toUpperCase().includes('TRIP'));
    return json({ sheets });
  } catch (err) {
    return json({ message: err?.message || 'Internal server error' }, 500);
  }
}
