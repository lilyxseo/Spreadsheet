import { json, token, SHEET_BARANG_MASUK, SHEET_BARANG_KELUAR } from './_barang-ops.js';

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function countToday(values, now = new Date()) {
  if (!Array.isArray(values) || values.length <= 1) return 0;
  const rows = values.slice(1);
  return rows.reduce((acc, row) => {
    const d = toDate(row?.[0]);
    return d && isSameDay(d, now) ? acc + 1 : acc;
  }, 0);
}

function monthlyInsight(inValues, outValues, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const countInMonth = (values) => (Array.isArray(values) ? values.slice(1) : []).reduce((acc, row) => {
    const d = toDate(row?.[0]);
    return d && d >= start && d < end ? acc + 1 : acc;
  }, 0);
  const masuk = countInMonth(inValues);
  const keluar = countInMonth(outValues);
  return { month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, masuk, keluar, netMovement: masuk - keluar };
}

async function readSheet(access, spreadsheetId, sheetName) {
  const range = `${sheetName}!A1:I20000`;
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${access}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Gagal membaca ${sheetName}`);
  return Array.isArray(data?.values) ? data.values : [];
}

export async function onRequestGet({ env }) {
  try {
    const spreadsheetId = String(env.SHEET_ID_2026 || '').trim();
    if (!spreadsheetId) return json({ success: false, message: 'SHEET_ID_2026 belum diset' }, 500);

    const access = await token(env);
    const [inValues, outValues] = await Promise.all([
      readSheet(access, spreadsheetId, SHEET_BARANG_MASUK),
      readSheet(access, spreadsheetId, SHEET_BARANG_KELUAR),
    ]);

    const totalBarangMasuk = Math.max(inValues.length - 1, 0);
    const totalBarangKeluar = Math.max(outValues.length - 1, 0);

    return json({
      success: true,
      totalBarangMasuk,
      totalBarangKeluar,
      totalMovement: totalBarangMasuk + totalBarangKeluar,
      barangMasukHariIni: countToday(inValues),
      barangKeluarHariIni: countToday(outValues),
      insightBulanan: monthlyInsight(inValues, outValues),
    });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
