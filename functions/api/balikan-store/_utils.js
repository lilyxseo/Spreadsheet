const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

const toB64 = (i) => btoa(typeof i === "string" ? i : JSON.stringify(i)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const pemToBuf = (p) => {
  const c = String(p || "").replace(/\\n/g, "\n").replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const b = atob(c); const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u.buffer;
};

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL || env.GOOGLE_CLIENT_EMAIL;
  const unsigned = `${toB64({ alg: "RS256", typ: "JWT" })}.${toB64({ iss: email, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now })}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToBuf(env.GOOGLE_PRIVATE_KEY), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  let bin = ""; new Uint8Array(sig).forEach((b) => (bin += String.fromCharCode(b)));
  const jwt = `${unsigned}.${btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error(d.error_description || d.error || "Gagal membuat access token");
  return d.access_token;
}

const escSheet = (name) => `'${String(name || "").replace(/'/g, "''")}'`;

export { json, getAccessToken, escSheet };
