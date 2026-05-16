const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEET_RANGE = "Cycle Count!A4:I";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function base64Url(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem) {
  const cleanPem = String(pem || "")
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(cleanPem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function createAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const unsignedJwt = `${base64Url({ alg: "RS256", typ: "JWT" })}.${base64Url({
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  })}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedJwt)
  );

  let binarySignature = "";
  new Uint8Array(signature).forEach((b) => {
    binarySignature += String.fromCharCode(b);
  });

  const jwt = `${unsignedJwt}.${btoa(binarySignature)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}`;

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "Gagal membuat access token");
  }
  return tokenData.access_token;
}

function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatTanggal(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function validateItem(item, index) {
  const lokasi = String(item?.lokasi || "").trim();
  const sku = String(item?.sku || "").trim();
  const namaBarang = String(item?.nama_barang || "").trim();
  const bulky = toNumberOrNull(item?.bulky);
  const retail = toNumberOrNull(item?.retail);
  const aktualBulky = toNumberOrNull(item?.aktual_bulky);
  const aktualRetail = toNumberOrNull(item?.aktual_retail);
  const catatan = String(item?.catatan || "").trim();

  if (!lokasi) return { error: `items[${index}].lokasi wajib diisi` };
  if (!sku) return { error: `items[${index}].sku wajib diisi` };
  if (!namaBarang) return { error: `items[${index}].nama_barang wajib diisi` };
  if (bulky === null) return { error: `items[${index}].bulky wajib angka` };
  if (retail === null) return { error: `items[${index}].retail wajib angka` };
  if (aktualBulky === null) return { error: `items[${index}].aktual_bulky wajib angka` };
  if (aktualRetail === null) return { error: `items[${index}].aktual_retail wajib angka` };

  return {
    value: {
      lokasi,
      sku,
      nama_barang: namaBarang,
      bulky,
      retail,
      aktual_bulky: aktualBulky,
      aktual_retail: aktualRetail,
      catatan,
    },
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const SHEET_MAP = {
      cycle_count: env.SHEET_ID_INVENTORY,
    };
    const sheetId = SHEET_MAP["cycle_count"];

    if (!sheetId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Sheet tidak ditemukan",
        }),
        { status: 400 }
      );
    }

    if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
      return json({ success: false, message: "Environment variable belum lengkap" }, 500);
    }

    const body = await request.json();
    const tanggal = String(body?.tanggal || formatTanggal(new Date())).trim();
    const items = body?.items;

    if (!Array.isArray(items)) return json({ success: false, message: "items wajib array" }, 400);
    if (!items.length) return json({ success: false, message: "items tidak boleh kosong" }, 400);

    const validated = [];
    for (let i = 0; i < items.length; i++) {
      const result = validateItem(items[i], i);
      if (result.error) return json({ success: false, message: result.error }, 400);
      validated.push(result.value);
    }

    const accessToken = await createAccessToken(env);
    const rows = validated.map((item) => [
      tanggal,
      item.lokasi,
      item.sku,
      item.nama_barang,
      item.bulky,
      item.retail,
      item.aktual_bulky,
      item.aktual_retail,
      item.catatan,
    ]);

    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}` +
      `/values/${encodeURIComponent(SHEET_RANGE)}:append?valueInputOption=USER_ENTERED`;

    const sheetRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    });

    const result = await sheetRes.json();
    if (!sheetRes.ok) {
      return json({ success: false, message: result.error?.message || "Gagal append ke Google Sheet", detail: result }, sheetRes.status);
    }

    return json({ success: true, message: "Cycle count berhasil disimpan", total_items: rows.length, result });
  } catch (err) {
    return json({ success: false, message: err?.message || "Internal server error" }, 500);
  }
}

export async function onRequestGet() {
  return new Response("API OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
