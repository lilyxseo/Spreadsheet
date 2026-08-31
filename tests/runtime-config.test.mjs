import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/runtime-config.js";
import { getSecretSupabaseConfig } from "../functions/api/_supabase-config.js";

test("runtime config exposes the publishable key under the compatibility property", async () => {
  const publishableKey = "sb_publishable_abcdefghijklmnopqrstuvwxyz";
  const response = await onRequestGet({
    env: {
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SECRET_KEY: "sb_secret_must-never-be-exposed",
    },
  });

  assert.equal(response.status, 200);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), {
    previewBypassLogin: false,
    environment: "unknown",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: publishableKey,
  });
  assert.equal(text.includes("sb_secret_"), false);
});

test("runtime config rejects malformed publishable keys", async () => {
  const response = await onRequestGet({
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "legacy-jwt",
    },
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    message: "SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_",
  });
});

test("server config validates the new secret-key prefix", () => {
  assert.deepEqual(
    getSecretSupabaseConfig({
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_SECRET_KEY: "sb_secret_server",
    }),
    { url: "https://example.supabase.co", key: "sb_secret_server" }
  );
  assert.throws(
    () => getSecretSupabaseConfig({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "legacy-jwt" }),
    /SUPABASE_SECRET_KEY must start with sb_secret_/
  );
});

test("legacy environment key names are rejected", async () => {
  const response = await onRequestGet({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "legacy-public-jwt" } });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).message, "SUPABASE_PUBLISHABLE_KEY is required");
  assert.throws(
    () => getSecretSupabaseConfig({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "legacy-service-jwt" }),
    /SUPABASE_SECRET_KEY is required/
  );
});
