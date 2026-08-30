import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequestIdentity } from '../functions/api/_authz.js';
import { handleManualKartuStokSync } from '../functions/api/sync/inventory/kartu-stok.js';

const SECRET = 'test-session-secret';

function developerToken(overrides = {}) {
  const payload = { sub: 'developer', username: 'dev', role: 'Mode Development', isDeveloper: true, exp: Math.floor(Date.now() / 1000) + 3600, ...overrides };
  const base = btoa(JSON.stringify(payload));
  const signature = btoa(`${base}.${SECRET}`).replace(/=+$/g, '');
  return `${base}.${signature}`;
}

function request(token = '') {
  return new Request('https://example.test/api/sync/inventory/kartu-stok', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function responseBody(response) { return response.json(); }
const syncResult = { success: true, source: 'kartu_stok', sourceRows: 1, inserted: 1, updated: 0, deleted: 0, unchanged: 0 };

test('Developer manual login session can start sync', async () => {
  let syncCalls = 0;
  const response = await handleManualKartuStokSync({ request: request(developerToken()), env: { DEV_SESSION_SECRET: SECRET } }, {
    sync: async () => { syncCalls += 1; return syncResult; },
  });
  assert.equal(response.status, 200);
  assert.equal(syncCalls, 1);
  assert.equal((await responseBody(response)).success, true);
});

test('restored Developer auto-login session resolves identically', async () => {
  const tokenRestoredFromExistingSession = developerToken();
  const identity = await resolveRequestIdentity(request(tokenRestoredFromExistingSession), { DEV_SESSION_SECRET: SECRET });
  assert.deepEqual(identity, { authenticated: true, isDeveloper: true, role: 'Developer', authSource: 'developer_session' });
  const response = await handleManualKartuStokSync({ request: request(tokenRestoredFromExistingSession), env: { DEV_SESSION_SECRET: SECRET } }, { sync: async () => syncResult });
  assert.equal(response.status, 200);
});

test('Supabase session with existing Developer profile is accepted', async () => {
  const identity = await resolveRequestIdentity(request('supabase-access-token'), {}, {
    getSupabaseAuthUser: async () => ({ id: 'user-1', email: 'developer@example.test' }),
    getUserProfileRole: async () => 'Mode Development',
  });
  assert.deepEqual(identity, { authenticated: true, isDeveloper: true, role: 'Mode Development', authSource: 'supabase_profile' });
});

test('authenticated non-Developer remains forbidden', async () => {
  let syncCalled = false;
  const response = await handleManualKartuStokSync({ request: request('supabase-access-token'), env: {} }, {
    resolveIdentity: async () => ({ authenticated: true, isDeveloper: false, role: 'PIC', authSource: 'supabase_profile' }),
    sync: async () => { syncCalled = true; return syncResult; },
  });
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).reason, 'FORBIDDEN');
  assert.equal(syncCalled, false);
});

test('anonymous request receives 401 and cannot start sync', async () => {
  let syncCalled = false;
  const response = await handleManualKartuStokSync({ request: request(), env: {} }, {
    resolveIdentity: async () => ({ authenticated: false, isDeveloper: false, role: '', authSource: 'none' }),
    sync: async () => { syncCalled = true; return syncResult; },
  });
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).reason, 'UNAUTHORIZED');
  assert.equal(syncCalled, false);
});

test('forged Developer payload without valid session signature is rejected', async () => {
  const forged = `${btoa(JSON.stringify({ sub: 'developer', isDeveloper: true, exp: Math.floor(Date.now() / 1000) + 3600 }))}.invalid`;
  const identity = await resolveRequestIdentity(request(forged), { DEV_SESSION_SECRET: SECRET }, { getSupabaseAuthUser: async () => null });
  assert.equal(identity.authenticated, false);
  assert.equal(identity.isDeveloper, false);
});
