import { json, getAccessToken, escSheet } from '../balikan-store/_utils';

const SHEET_NAME = 'Retur Store';

function normalizeRow(row = []) {
  return {
    sku: String(row[0] || '').trim(),
    namaBarang: String(row[1] || '').trim(),
    qty: Number(String(row[2] || '').replace(/[^0-9.-]/g, '')) || 0,
    catatan: String(row[3] || '').trim(),
    status: String(row[4] || '').trim(),
    createdAt: String(row[5] || '').trim()
  };
}

export async function onRequestGet({ env }) {
  try {
    const token = await getAccessToken(env);
    const range = `${escSheet(SHEET_NAME)}!A2:F`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID_INVENTORY}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) return json({ message: data?.error?.message || 'Gagal memuat data Retur Store' }, res.status);
    const rows = Array.isArray(data.values) ? data.values.map(normalizeRow).filter(r => r.sku || r.namaBarang) : [];
    return json({ success: true, rows });
  } catch (err) {
    return json({ message: err?.message || 'Internal server error' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) return json({ message: 'Data item kosong' }, 400);

    const now = new Date().toISOString();
    const values = items
      .map((item) => ({
        sku: String(item?.sku || '').trim(),
        namaBarang: String(item?.namaBarang || '').trim(),
        qty: Number(item?.qty),
        catatan: String(item?.catatan || '').trim(),
        status: String(item?.status || 'Imported').trim()
      }))
      .filter((item) => item.sku && item.namaBarang && Number.isFinite(item.qty));

    if (!values.length) return json({ message: 'Tidak ada item valid untuk diimport' }, 400);

    const payload = {
      values: values.map((item) => [item.sku, item.namaBarang, String(item.qty), item.catatan, item.status, now])
    };

    const token = await getAccessToken(env);
    const range = `${escSheet(SHEET_NAME)}!A:F`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID_INVENTORY}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return json({ message: data?.error?.message || 'Gagal import Retur Store' }, res.status);

    return json({ success: true, imported: values.length });
  } catch (err) {
    return json({ message: err?.message || 'Internal server error' }, 500);
  }
}
