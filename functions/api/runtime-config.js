import { getPublishableSupabaseConfig } from './_supabase-config.js';

function parseTrue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function pickContext(env = {}) {
  return String(env.CONTEXT || env.NETLIFY_CONTEXT || env.NODE_ENV || "").toLowerCase() || "unknown";
}

export async function onRequestGet({ env }) {
  try {
    const { url, key } = getPublishableSupabaseConfig(env);
    const previewBypassLogin = parseTrue(
      env?.PREVIEW_BYPASS_LOGIN ?? env?.NEXT_PUBLIC_PREVIEW_BYPASS_LOGIN ?? env?.VITE_PREVIEW_BYPASS_LOGIN
    );
    return new Response(
      JSON.stringify({
        previewBypassLogin,
        environment: pickContext(env || {}),
        supabaseUrl: url,
        supabaseAnonKey: key,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error('Invalid Supabase runtime configuration:', error.message);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
