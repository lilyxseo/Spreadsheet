function parseTrue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function pickContext(env = {}) {
  return String(env.CONTEXT || env.NETLIFY_CONTEXT || env.NODE_ENV || "").toLowerCase() || "unknown";
}

function publicSupabaseKey(value) {
  const key = String(value || "").trim();
  if (key.startsWith("sb_publishable_")) return key;
  try {
    const encoded = key.split(".")[1] || "";
    const payload = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "anon" ? key : "";
  } catch (_error) {
    return "";
  }
}

export async function onRequestGet({ env }) {
  try {
    const anonKey = String(env?.SUPABASE_ANON_KEY || "").trim();
    const serviceRoleKey = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    console.log("runtime-config Supabase env", {
      hasAnonKey: Boolean(anonKey),
      anonKeyPrefix: anonKey.slice(0, 20),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    const previewBypassLogin = parseTrue(
      env?.PREVIEW_BYPASS_LOGIN ?? env?.NEXT_PUBLIC_PREVIEW_BYPASS_LOGIN ?? env?.VITE_PREVIEW_BYPASS_LOGIN
    );
    return new Response(
      JSON.stringify({
        previewBypassLogin,
        environment: pickContext(env || {}),
        supabaseUrl: String(env?.SUPABASE_URL || "").trim(),
        supabaseAnonKey: publicSupabaseKey(anonKey),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Runtime-Config-Version": "27c9f6c",
          "X-Anon-Key-Prefix": anonKey.slice(0, 20),
        },
      }
    );
  } catch (_error) {
    return new Response(
      JSON.stringify({ success: false, message: "Failed to load runtime config" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
