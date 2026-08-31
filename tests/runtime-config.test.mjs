import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/runtime-config.js";

test("runtime config exposes only safe deployment diagnostics in headers", async () => {
  const anonKey = "sb_publishable_abcdefghijklmnopqrstuvwxyz";
  const response = await onRequestGet({
    env: {
      SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_must-never-be-exposed",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Runtime-Config-Version"), "27c9f6c");
  assert.equal(response.headers.get("X-Anon-Key-Prefix"), anonKey.slice(0, 20));
  assert.equal(response.headers.get("X-Anon-Key-Prefix").length, 20);
  assert.equal(response.headers.has("X-Service-Role-Key-Prefix"), false);
});
