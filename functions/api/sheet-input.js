const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SHEET_RANGE = 'Sheet1!A:G';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function normalizePrivateKey(key = '') {
  return String(key).replace(/\\n/g, '\n').trim();
}

function base64UrlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem) {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem) {
  const keyData = pemToArrayBuffer(pem);
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signJwt(payload, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsignedToken));

  return `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    {
      iss: clientEmail,
      scope: GOOGLE_SHEETS_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    privateKey
  );

  const tokenRes = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson?.error_description || tokenJson?.error || 'Gagal mendapatkan Google access token');
  }

  return tokenJson.access_token;
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;
    const { GOOGLE_SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY } = env;

    if (!GOOGLE_SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
      return jsonResponse({ success: false, error: 'Konfigurasi env Cloudflare belum lengkap.' }, 500);
    }

    const body = await request.json();
    const tanggal = String(body?.tanggal || '').trim();
    const sku = String(body?.sku || '').trim();
    const nama_barang = String(body?.nama_barang || '').trim();
    const qty = Number(body?.qty);
    const lokasi = String(body?.lokasi || '').trim();
    const keterangan = String(body?.keterangan || '').trim();

    if (!sku || !nama_barang || !lokasi || Number.isNaN(qty)) {
      return jsonResponse(
        { success: false, error: 'Validasi gagal: sku, nama_barang, qty, lokasi wajib diisi dengan benar.' },
        400
      );
    }

    const createdAt = new Date().toISOString();
    const accessToken = await getAccessToken(GOOGLE_CLIENT_EMAIL, normalizePrivateKey(GOOGLE_PRIVATE_KEY));
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      GOOGLE_SHEET_ID
    )}/values/${encodeURIComponent(SHEET_RANGE)}:append?valueInputOption=USER_ENTERED`;

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        values: [[tanggal, sku, nama_barang, qty, lokasi, keterangan, createdAt]],
      }),
    });

    const appendJson = await appendRes.json();
    if (!appendRes.ok) {
      return jsonResponse({ success: false, error: appendJson?.error?.message || 'Gagal append data ke Google Sheet.' }, 502);
    }

    return jsonResponse({ success: true, message: 'Data berhasil disimpan ke Google Sheet.', result: appendJson });
  } catch (error) {
    return jsonResponse({ success: false, error: error?.message || 'Terjadi kesalahan server.' }, 500);
  }
}
export async function onRequestGet() {
  return new Response("API OK", { status: 200 });
}
