function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ALLOWED_ACTIONS = new Set([
  "LOGIN_SUCCESS",
  "LOGIN_DEVELOPER",
  "SUBMIT_CYCLE_COUNT",
  "EDIT_CYCLE_COUNT",
  "DELETE_CYCLE_COUNT",
  "SUBMIT_MOVEMENT",
  "CREATE_BARANG_MASUK",
  "EDIT_MOVEMENT",
  "DELETE_MOVEMENT",
  "SCAN_BARCODE_SKU",
  "REGISTER_SUCCESS",
]);

const ALLOWED_MODULES = new Set(["Auth", "Cycle Count", "Movement", "Search"]);
const ALLOWED_STATUS = new Set(["SUCCESS", "FAILED"]);

function sanitizeText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function sanitizeMetadata(raw) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    const key = String(k || "").toLowerCase();
    if (key.includes("password") || key.includes("token") || key.includes("secret")) continue;
    if (typeof v === "string") out[k] = v.slice(0, 500);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else out[k] = JSON.stringify(v).slice(0, 500);
  }
  return out;
}


function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[0];
    if (!part) return null;
    return JSON.parse(atob(part));
  } catch (_err) {
    return null;
  }
}

function isDeveloperRequest(request) {
  const auth = String(request.headers.get("authorization") || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const payload = decodeJwtPayload(token);
  return payload?.isDeveloper === true;
}

function getSupabaseConfig(env) {
  const url = String(env.SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset");
  return { url, key };
}

async function supabaseInsertLog(env, payload) {
  const { url, key } = getSupabaseConfig(env);
  const res = await fetch(`${url}/rest/v1/activity_logs`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || body?.error || "Gagal insert activity log");
  return body;
}


async function getUserProfile(env, userId) {
  const id = sanitizeText(userId, 100);
  if (!id || id === "developer") return null;
  const { url, key } = getSupabaseConfig(env);
  const params = new URLSearchParams({
    select: "role",
    id: `eq.${id}`,
    limit: "1",
  });
  const res = await fetch(`${url}/rest/v1/users?${params.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => []);
  return Array.isArray(body) ? body[0] || null : null;
}

async function supabaseGetLogs(env, query) {
  const { url, key } = getSupabaseConfig(env);
  const params = new URLSearchParams();
  const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  params.set("select", "*");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  if (query.module && ALLOWED_MODULES.has(query.module)) params.set("module", `eq.${query.module}`);
  if (query.action && ALLOWED_ACTIONS.has(query.action)) params.set("action", `eq.${query.action}`);
  if (query.user_name) params.set("user_name", `ilike.*${sanitizeText(query.user_name, 100)}*`);
  if (query.status && ALLOWED_STATUS.has(query.status)) params.set("status", `eq.${query.status}`);

  const res = await fetch(`${url}/rest/v1/activity_logs?${params.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => []);
  if (!res.ok) throw new Error(body?.message || body?.error || "Gagal mengambil activity logs");
  return body;
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const action = sanitizeText(body?.action, 100);
    const module = sanitizeText(body?.module, 100);
    const status = sanitizeText(body?.status || "SUCCESS", 20).toUpperCase();

    if (!ALLOWED_ACTIONS.has(action)) return json({ success: false, message: "action tidak valid" }, 400);
    if (!ALLOWED_MODULES.has(module)) return json({ success: false, message: "module tidak valid" }, 400);
    if (!ALLOWED_STATUS.has(status)) return json({ success: false, message: "status tidak valid" }, 400);

    const userId = sanitizeText(body?.user_id, 100) || null;
    const sessionRole = sanitizeText(body?.role, 120) || null;
    const profile = userId === "developer" ? null : await getUserProfile(env, userId);
    const payload = {
      user_id: userId,
      user_name: sanitizeText(body?.user_name, 120) || null,
      role: userId === "developer" ? "Development Mode" : sanitizeText(profile?.role, 120) || sessionRole || "User",
      action,
      module,
      detail: sanitizeText(body?.detail, 1000) || null,
      reference: sanitizeText(body?.reference, 150) || null,
      status,
      metadata: sanitizeMetadata(body?.metadata),
    };

    const data = await supabaseInsertLog(env, payload);
    return json({ success: true, data }, 201);
  } catch (err) {
    return json({ success: false, message: err?.message || "Internal server error" }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    if (!isDeveloperRequest(request)) return json({ success: false, error: "Akses ditolak" }, 403);
    const url = new URL(request.url);
    const data = await supabaseGetLogs(env, Object.fromEntries(url.searchParams.entries()));
    return json({ success: true, data });
  } catch (err) {
    return json({ success: false, message: err?.message || "Internal server error" }, 500);
  }
}
