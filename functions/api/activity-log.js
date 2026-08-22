function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ACTION_PATTERN = /^[A-Z][A-Z0-9_]{1,59}$/;
const ALLOWED_STATUS = new Set(["SUCCESS", "FAILED", "DENIED"]);

function sanitizeText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function sanitizeMetadata(raw, depth = 0) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    const key = String(k || "").toLowerCase();
    if (/(password|passwd|token|cookie|secret|api.?key|private.?key|credential|authorization)/i.test(key)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 500);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (depth < 4 && v && typeof v === "object") out[k] = Array.isArray(v) ? v.slice(0, 250).map(x => typeof x === "object" ? sanitizeMetadata(x, depth + 1) : x) : sanitizeMetadata(v, depth + 1);
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

function parseTrue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function isPreviewBypassRequest(request, env) {
  const previewBypassLogin = parseTrue(
    env?.PREVIEW_BYPASS_LOGIN ?? env?.NEXT_PUBLIC_PREVIEW_BYPASS_LOGIN ?? env?.VITE_PREVIEW_BYPASS_LOGIN
  );
  return previewBypassLogin && request.headers.get("x-preview-bypass-login") === "true";
}

function isDeveloperRequest(request, env) {
  if (isPreviewBypassRequest(request, env)) return true;
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

  if (query.module) params.set("module", `eq.${sanitizeText(query.module, 100)}`);
  if (query.action && ACTION_PATTERN.test(query.action)) params.set("action", `eq.${query.action}`);
  if (query.user_name) params.set("user_name", `ilike.*${sanitizeText(query.user_name, 100)}*`);
  if (query.status && ALLOWED_STATUS.has(query.status)) params.set("status", `eq.${query.status}`);
  if (query.from) params.set("created_at", `gte.${sanitizeText(query.from, 40)}`);
  if (query.to) params.append("created_at", `lte.${sanitizeText(query.to, 40)}`);
  if (query.search) {
    const term = sanitizeText(query.search, 100).replace(/[(),]/g, "");
    params.set("or", `(user_name.ilike.*${term}*,module.ilike.*${term}*,detail.ilike.*${term}*,reference.ilike.*${term}*)`);
  }

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

    if (!ACTION_PATTERN.test(action)) return json({ success: false, message: "action tidak valid" }, 400);
    if (!module) return json({ success: false, message: "module wajib diisi" }, 400);
    if (!ALLOWED_STATUS.has(status)) return json({ success: false, message: "status tidak valid" }, 400);

    const userId = sanitizeText(body?.user_id, 100) || null;
    const sessionRole = sanitizeText(body?.role, 120) || null;
    const profile = userId === "developer" ? null : await getUserProfile(env, userId);
    const activityId = sanitizeText(request.headers.get("x-activity-id") || body?.id || body?.activityId, 150);
    const structured = sanitizeMetadata({
      id: activityId, timestamp: body?.timestamp, user: body?.user || body?.user_name,
      role: body?.role, isDeveloper: body?.isDeveloper, sessionId: body?.sessionId,
      action, category: body?.category, module, page: body?.page,
      description: body?.description || body?.detail, entityType: body?.entityType,
      entityId: body?.entityId || body?.reference, details: body?.details || body?.metadata,
      result: status, source: body?.source, correlationId: body?.correlationId,
    });
    if (activityId) {
      const duplicate = await supabaseGetLogs(env, { limit: 1, search: activityId });
      if (duplicate.some(row => row?.metadata?.id === activityId)) return json({ success: true, duplicate: true, data: duplicate[0] });
    }
    const payload = {
      user_id: userId,
      user_name: sanitizeText(body?.user || body?.user_name, 120) || null,
      role: userId === "developer" ? "Mode Development" : sanitizeText(profile?.role, 120) || sessionRole || "User",
      action,
      module,
      detail: sanitizeText(body?.description || body?.detail, 1000) || null,
      reference: sanitizeText(body?.entityId || body?.reference || activityId, 150) || null,
      status,
      metadata: structured,
    };

    const data = await supabaseInsertLog(env, payload);
    return json({ success: true, data }, 201);
  } catch (err) {
    return json({ success: false, message: err?.message || "Internal server error" }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  try {
    if (!isDeveloperRequest(request, env)) return json({ success: false, error: "Akses ditolak" }, 403);
    const url = new URL(request.url);
    const rows = await supabaseGetLogs(env, Object.fromEntries(url.searchParams.entries()));
    const data = rows.map(row => ({ ...row, ...(row.metadata || {}), id: row.metadata?.id || row.id, timestamp: row.metadata?.timestamp || row.created_at, user: row.metadata?.user || row.user_name, description: row.metadata?.description || row.detail, result: row.metadata?.result || row.status, entityId: row.metadata?.entityId || row.reference }));
    return json({ success: true, data, hasMore: data.length === Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100) });
  } catch (err) {
    return json({ success: false, message: err?.message || "Internal server error" }, 500);
  }
}
