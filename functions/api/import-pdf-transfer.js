import { requirePicRole } from './_authz.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const CONFIG_ERROR = 'Spreadsheet tujuan Import PDF belum dikonfigurasi.';
const BATCH_SIZE = 500;
let importInProgress = false;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function clean(value) { return String(value ?? '').trim(); }
function parseConfig(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

/** Resolve once per request. GOOGLE_SHEET_ID is deliberately not a fallback. */
export async function resolveImportPdfSpreadsheetId(env = {}) {
  const importConfig = parseConfig(env.IMPORT_PDF_CONFIG || env.IMPORT_PDF_SETTINGS);
  const mapping = parseConfig(env.SHEET_MAPPING || env.SHEET_MAPPINGS);
  const candidates = [
    [importConfig.spreadsheetId || env.IMPORT_PDF_SPREADSHEET_ID, 'settings'],
    [env.SHEET_ID_INVENTORY || env.SHEET_ID_2026, 'application-default'],
    [mapping.importPdf?.spreadsheetId || mapping.import_pdf?.spreadsheetId || mapping.importPdfSpreadsheetId, 'sheet-mapping'],
    [env.GOOGLE_SHEET_ID_IMPORT_PDF, 'environment-fallback'],
  ];
  const found = candidates.find(([id]) => clean(id));
  return found ? { spreadsheetId: clean(found[0]), source: found[1] } : { spreadsheetId: '', source: 'none' };
}

function devLog(env, message) {
  const mode = clean(env.CONTEXT || env.NETLIFY_CONTEXT || env.NODE_ENV).toLowerCase();
  if (mode === 'dev' || mode === 'development' || mode === 'local') console.info(`[ImportPDF] ${message}`);
}
function base64Url(input) { const text = typeof input === 'string' ? input : JSON.stringify(input); const bytes = new TextEncoder().encode(text); let binary = ''; bytes.forEach(b => binary += String.fromCharCode(b)); return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function pemToArrayBuffer(pem) { const raw = clean(pem).replace(/\\n/g, '\n').replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, ''); const binary = atob(raw); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes.buffer; }
async function createAccessToken(env) { const now = Math.floor(Date.now() / 1000); const header = { alg: 'RS256', typ: 'JWT' }; const payload = { iss: env.GOOGLE_CLIENT_EMAIL, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now }; const unsignedJwt = `${base64Url(header)}.${base64Url(payload)}`; const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']); const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedJwt)); let sig = ''; new Uint8Array(signature).forEach(b => sig += String.fromCharCode(b)); const jwt = `${unsignedJwt}.${btoa(sig).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`; const tokenRes = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) }); const data = await tokenRes.json(); if (!tokenRes.ok || !data.access_token) throw Object.assign(new Error(data.error_description || data.error || 'Gagal membuat access token'), { status: tokenRes.status }); return data.access_token; }

async function loadSheetNames(accessToken, spreadsheetId) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error?.message || 'Gagal memuat daftar sheet'), { status: res.status });
  return (data.sheets || []).map(sheet => clean(sheet?.properties?.title)).filter(Boolean);
}
function normalizeQty(value) { const raw = clean(value).replace(/\./g, '').replace(',', '.'); if (!raw) return { ok: false, reason: 'Jumlah/Qty kosong' }; const qty = Number(raw); return Number.isNaN(qty) ? { ok: false, reason: 'Jumlah/Qty wajib angka' } : { ok: true, qty }; }
function validateTransferItems(items) { const valid = []; const failed = []; for (let i = 0; i < items.length; i++) { const row = items[i] || {}; const reasons = []; const sku = clean(row.sku); if (!sku) reasons.push('SKU wajib ada'); const qtyCheck = normalizeQty(row.qty); if (!qtyCheck.ok) reasons.push(qtyCheck.reason); const empty = !sku && !['namaProduk', 'qty', 'diterima', 'batal', 'tolak', 'catatan'].some(k => clean(row[k])); if (empty) continue; if (reasons.length) { failed.push({ rowNumber: i + 1, reason: reasons.join(', ') }); continue; } valid.push({ sku, namaProduk: clean(row.namaProduk), qty: qtyCheck.qty, diterima: clean(row.diterima), batal: clean(row.batal), tolak: clean(row.tolak), catatan: clean(row.catatan) }); } return { valid, failed }; }
function apiError(error) {
  if (error?.status === 429) return json({ success: false, message: 'Batas request Google Sheets tercapai. Coba kembali beberapa saat lagi.' }, 429);
  if (error?.status === 401 || error?.status === 403) return json({ success: false, message: 'Akun aplikasi tidak memiliki akses ke spreadsheet tujuan.' }, 403);
  return json({ success: false, message: error?.message || 'Internal server error' }, error?.status >= 400 ? error.status : 500);
}

export async function onRequestGet({ request, env }) {
  const authz = await requirePicRole({ request, env }); if (!authz.ok) return authz.response;
  try {
    const config = await resolveImportPdfSpreadsheetId(env);
    devLog(env, `config source: ${config.source}`); devLog(env, `spreadsheet config found: ${Boolean(config.spreadsheetId)}`);
    if (!config.spreadsheetId) return json({ success: false, message: CONFIG_ERROR }, 500);
    const access = await createAccessToken(env);
    return json({ success: true, sheets: await loadSheetNames(access, config.spreadsheetId) });
  } catch (error) { return apiError(error); }
}

export async function onRequestPost({ request, env }) {
  const authz = await requirePicRole({ request, env }); if (!authz.ok) return authz.response;
  if (importInProgress) return json({ success: false, message: 'Import lain sedang berjalan. Tunggu hingga selesai.' }, 409);
  importInProgress = true;
  try {
    const body = await request.json();
    const sheetName = clean(body.sheetName);
    const source = clean(body.source).toLowerCase();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!sheetName) return json({ success: false, message: 'Pilih sheet tujuan terlebih dahulu.' }, 400);
    if (source !== 'csv') return json({ success: false, message: 'Data hasil PDF belum valid untuk diimport.' }, 400);
    const { valid, failed } = validateTransferItems(rows);
    if (failed.length || !valid.length) return json({ success: false, message: 'Data hasil PDF belum valid untuk diimport.', failedRows: failed }, 400);
    const config = await resolveImportPdfSpreadsheetId(env);
    devLog(env, `config source: ${config.source}`); devLog(env, `spreadsheet config found: ${Boolean(config.spreadsheetId)}`); devLog(env, `target sheet: ${sheetName}`); devLog(env, `valid rows: ${valid.length}`); devLog(env, `invalid rows: ${failed.length}`);
    if (!config.spreadsheetId) return json({ success: false, message: CONFIG_ERROR }, 500);
    const access = await createAccessToken(env);
    const sheets = await loadSheetNames(access, config.spreadsheetId);
    if (!sheets.includes(sheetName)) return json({ success: false, message: 'Sheet tujuan tidak ditemukan.' }, 404);
    const header = body.header || {};
    const values = [['Nomor Transfer', clean(header.nomorTransfer)], ['Dari', clean(header.dari)], ['Kepada', clean(header.kepada)], ['Nomor Referensi', clean(header.nomorReferensi)], [], ['SKU', 'Nama Produk', 'Jumlah', 'Diterima', 'Batal', 'Tolak', 'Catatan'], ...valid.map(r => [r.sku, r.namaProduk, r.qty, r.diterima, r.batal, r.tolak, r.catatan])];
    const chunks = []; for (let i = 0; i < values.length; i += BATCH_SIZE) chunks.push(values.slice(i, i + BATCH_SIZE));
    devLog(env, `batch count: ${chunks.length}`);
    for (let i = 0, start = 1; i < chunks.length; i++) { const chunk = chunks[i]; const range = `'${sheetName.replace(/'/g, "''")}'!A${start}:G${start + chunk.length - 1}`; const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { method: 'PUT', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: chunk }) }); const data = await res.json(); if (!res.ok) throw Object.assign(new Error(data.error?.message || 'Gagal menyimpan data'), { status: res.status }); start += chunk.length; }
    return json({ success: true, sheetName, importedRows: valid.length, batchCount: chunks.length });
  } catch (error) { return apiError(error); }
  finally { importInProgress = false; }
}
