import test from "node:test";
import assert from "node:assert/strict";
import { createAuthSession, resolvePermissions, unauthenticatedSession } from "../assets/js/auth-session.js";
import { onRequestPost as login } from "../functions/api/login.js";
import { requirePicRole } from "../functions/api/_authz.js";

const tokenSession = { access_token: "token" };

test("manual and auto-login developer identities resolve to identical CRUD permissions", () => {
  for (const authSource of ["manual-login", "auto-login"]) {
    const auth = createAuthSession({ session: tokenSession, user: { id: "developer" }, isDeveloper: true, authSource });
    assert.deepEqual(resolvePermissions(auth), { read: true, create: true, update: true, delete: true, crud: true, source: "developer" });
  }
});

test("PIC is CRUD, non-PIC is read-only, and hydration is not read-only", () => {
  const auth = createAuthSession({ session: tokenSession, user: { id: "user" }, authSource: "auto-login" });
  assert.equal(resolvePermissions(auth, { role: "Warehouse PIC" }).crud, true);
  assert.equal(resolvePermissions(auth, { role: "Viewer" }).crud, false);
  assert.equal(resolvePermissions(unauthenticatedSession), null);
});

test("expired or forged developer sessions cannot mutate through backend", async () => {
  const env = { DEV_LOGIN_ENABLED: "true", DEV_USERNAME: "dev", DEV_PASSWORD: "secret", DEV_SESSION_SECRET: "test-signing-secret" };
  const response = await login({ request: new Request("https://test/api/login", { method: "POST", body: JSON.stringify({ username: "dev", password: "secret" }) }), env });
  const body = await response.json();
  const valid = await requirePicRole({ request: new Request("https://test/api/update", { headers: { Authorization: `Bearer ${body.session.access_token}` } }), env });
  assert.equal(valid.ok, true);

  const forged = `${body.session.access_token.split(".")[0]}.invalid`;
  const denied = await requirePicRole({ request: new Request("https://test/api/update", { headers: { Authorization: `Bearer ${forged}` } }), env: {} });
  assert.equal(denied.ok, false);
  assert.equal(denied.response.status, 403);
});
