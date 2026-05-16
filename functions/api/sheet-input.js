export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const {
      tanggal,
      sku,
      nama_barang,
      qty,
      lokasi,
      keterangan
    } = body;

    if (!sku || !nama_barang || !qty || !lokasi) {
      return new Response(JSON.stringify({
        success: false,
        message: "Field wajib kosong"
      }), { status: 400 });
    }

    // =========================
    // 1. CREATE JWT
    // =========================
    const header = {
      alg: "RS256",
      typ: "JWT"
    };

    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    };

    function base64url(source) {
      return btoa(JSON.stringify(source))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    }

    const encodedHeader = base64url(header);
    const encodedPayload = base64url(payload);

    const toSign = `${encodedHeader}.${encodedPayload}`;

    // Import private key
    const key = await crypto.subtle.importKey(
      "pkcs8",
      str2ab(env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")),
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(toSign)
    );

    const signed = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const jwt = `${toSign}.${signed}`;

    // =========================
    // 2. GET ACCESS TOKEN
    // =========================
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return new Response(JSON.stringify(tokenData), { status: 500 });
    }

    // =========================
    // 3. APPEND TO SHEET
    // =========================
    const row = [
      tanggal || new Date().toISOString().split("T")[0],
      sku,
      nama_barang,
      qty,
      lokasi,
      keterangan || "",
      new Date().toISOString()
    ];

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/Sheet1!A:G:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          values: [row]
        })
      }
    );

    const result = await sheetRes.json();

    return new Response(JSON.stringify({
      success: true,
      result
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      message: err.message
    }), { status: 500 });
  }
}

// helper
function str2ab(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}
