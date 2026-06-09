import { json, token } from '../_barang-ops.js';

const SPREADSHEET_ID = '1BVGcIWnYqrG-DefzmnO_hZjNn3H3c4sriI7CBAWsxw8';
const SHEET_NAMES = {
  stock: 'Kartu Stock Reject',
  masuk: 'Barang Masuk Reject',
  keluar: 'Barang Keluar Reject',
  audit: 'Audit Trail',
};
const STOCK_COLUMNS = ['sku', 'namaBarang', 'lokasi', 'qty', 'keterangan'];
const MASUK_COLUMNS = ['tanggal', 'sku', 'namaBarang', 'qty', 'lokasi', 'keterangan'];
const KELUAR_COLUMNS = ['tanggal', 'sku', 'namaBarang', 'qty', 'tujuan', 'keterangan'];

function normalizeHeader(value) {
  return String(value || '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

function getValue(row, headers, aliases, index) {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    const found = headers.findIndex(h => h === normalized || h.includes(normalized));
    if (found >= 0) return row[found] ?? '';
  }
  return row[index] ?? '';
}

function mapRows(values, startRowNumber, columns) {
  const rows = Array.isArray(values) ? values : [];
  if (!rows.length) return [];
  const headerIndex = rows.findIndex(row => Array.isArray(row) && row.some(cell => String(cell || '').trim()));
  if (headerIndex < 0) return [];
  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  return rows.slice(headerIndex + 1)
    .map((row, idx) => ({ row: Array.isArray(row) ? row : [], rowNumber: startRowNumber + headerIndex + 1 + idx }))
    .filter(({ row }) => row.some(cell => String(cell ?? '').trim()))
    .map(({ row, rowNumber }) => {
      const out = { rowNumber };
      columns.forEach((column, index) => {
        const aliases = {
          tanggal: ['tanggal', 'date'],
          sku: ['sku', 'kode sku', 'kode barang'],
          namaBarang: ['nama barang', 'nama', 'item', 'description'],
          qty: ['qty', 'quantity', 'jumlah'],
          lokasi: ['lokasi', 'location', 'rak'],
          tujuan: ['tujuan', 'destination', 'to'],
          keterangan: ['keterangan', 'notes', 'remark'],
        }[column] || [column];
        out[column] = getValue(row, headers, aliases, index);
      });
      return out;
    });
}

async function fetchValues(access, sheetName, range = 'A1:Z20000') {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`${sheetName}!${range}`)}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message || `Gagal membaca sheet ${sheetName}`;
    if (res.status === 403) throw new Error(`Permission Google Sheet ditolak untuk ${sheetName}. Pastikan Google client email sudah diberi akses editor. Detail: ${message}`);
    if (res.status === 404 || /unable to parse range|not found|no grid/i.test(message)) return [];
    throw new Error(message);
  }
  return Array.isArray(body?.values) ? body.values : [];
}

async function appendValues(access, sheetName, row) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`${sheetName}!A:Z`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message || `Gagal append ke sheet ${sheetName}`;
    if (res.status === 403) throw new Error(`Permission Google Sheet ditolak. Pastikan Google client email sudah diberi akses editor. Detail: ${message}`);
    throw new Error(message);
  }
  return body;
}

export async function onRequestGet({ env }) {
  try {
    const access = await token(env);
    const [stockValues, masukValues, keluarValues] = await Promise.all([
      fetchValues(access, SHEET_NAMES.stock),
      fetchValues(access, SHEET_NAMES.masuk),
      fetchValues(access, SHEET_NAMES.keluar),
    ]);
    return json({
      success: true,
      spreadsheetId: SPREADSHEET_ID,
      data: {
        stock: mapRows(stockValues, 1, STOCK_COLUMNS),
        masuk: mapRows(masukValues, 1, MASUK_COLUMNS),
        keluar: mapRows(keluarValues, 1, KELUAR_COLUMNS),
      },
    });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const tanggal = String(body?.tanggal || new Date().toISOString().slice(0, 10)).trim();
    const sku = String(body?.sku || '').trim();
    const namaBarang = String(body?.namaBarang || body?.nama_barang || '').trim();
    const qty = Number(body?.qty);
    const lokasi = String(body?.lokasi || '').trim();
    const keterangan = String(body?.keterangan || '').trim();
    if (!sku) return json({ success: false, message: 'SKU wajib diisi' }, 400);
    if (!Number.isFinite(qty) || qty <= 0) return json({ success: false, message: 'Qty wajib berupa angka lebih dari 0' }, 400);

    const access = await token(env);
    const result = await appendValues(access, SHEET_NAMES.masuk, [tanggal, sku, namaBarang, qty, lokasi, keterangan]);
    const auditResult = await appendValues(access, SHEET_NAMES.audit, [new Date().toISOString(), 'CREATE_BARANG_REJECT_MASUK', sku, namaBarang, qty, lokasi, keterangan]).catch(err => ({ warning: err?.message || 'Audit Trail gagal disimpan' }));
    return json({ success: true, message: 'Barang masuk reject berhasil disimpan', data: { tanggal, sku, namaBarang, qty, lokasi, keterangan }, result, auditResult });
  } catch (err) {
    return json({ success: false, message: err?.message || 'Internal server error' }, 500);
  }
}
