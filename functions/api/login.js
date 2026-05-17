const DEV_SESSION_TTL_SECONDS = 60 * 60 * 12;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function createDevToken(secret, username) {
  const payload = {
    sub: "developer",
    username,
    role: "Development Mode",
    isDeveloper: true,
    exp: Math.floor(Date.now() / 1000) + DEV_SESSION_TTL_SECONDS,
  };
  const base = btoa(JSON.stringify(payload));
  const sig = btoa(`${base}.${secret}`).replace(/=+$/g, "");
  return `${base}.${sig}`;
}

export async function onRequestPost({ request, env }) {
  try {
    const { username = "", password = "" } = await request.json();
    const normalizedUsername = String(username).trim();
    const normalizedPassword = String(password);

    const devEnabled = String(env.DEV_LOGIN_ENABLED || "").toLowerCase() === "true";
    if (devEnabled) {
      const devUsername = String(env.DEV_USERNAME || "");
      const devPassword = String(env.DEV_PASSWORD || "");
      if (safeEquals(normalizedUsername, devUsername) && safeEquals(normalizedPassword, devPassword)) {
        const secret = String(env.DEV_SESSION_SECRET || env.SUPABASE_ANON_KEY || "dev-secret");
        const accessToken = createDevToken(secret, normalizedUsername);
        const expiresAt = Math.floor(Date.now() / 1000) + DEV_SESSION_TTL_SECONDS;
        return json({
          mode: "dev",
          session: {
            access_token: accessToken,
            refresh_token: null,
            token_type: "bearer",
            expires_in: DEV_SESSION_TTL_SECONDS,
            expires_at: expiresAt,
          },
          user: {
            id: "developer",
            name: "Developer",
            role: "Development Mode",
            isDeveloper: true,
          },
        });
      }
    }

    const supabaseUrl = String(env.SUPABASE_URL || "").trim();
    const supabaseAnonKey = String(env.SUPABASE_ANON_KEY || "").trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: "Konfigurasi auth belum lengkap." }, 500);
    }

    const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: normalizedUsername, password: normalizedPassword }),
    });
    const data = await resp.json();
    if (!resp.ok) return json({ error: data.error_description || data.msg || "Login gagal." }, 401);

    return json({
      mode: "supabase",
      session: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
        expires_at: data.expires_at,
      },
      user: data.user || null,
    });
  } catch (_err) {
    return json({ error: "Payload login tidak valid." }, 400);
  }
}
