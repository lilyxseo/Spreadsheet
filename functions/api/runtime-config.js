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
    const previewBypassLogin = parseTrue(
      env?.PREVIEW_BYPASS_LOGIN ?? env?.NEXT_PUBLIC_PREVIEW_BYPASS_LOGIN ?? env?.VITE_PREVIEW_BYPASS_LOGIN
    );
    return new Response(
      JSON.stringify({
        previewBypassLogin,
        environment: pickContext(env || {}),
        supabaseUrl: String(env?.SUPABASE_URL || "").trim(),
        supabaseAnonKey: publicSupabaseKey(env?.SUPABASE_ANON_KEY),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
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
