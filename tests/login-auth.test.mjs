import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/login.js';

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key', SUPABASE_SECRET_KEY: 'sb_secret_must-not-be-used' };
const request = body => new Request('https://app.example/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('password login uses the email contract and publishable key, then returns both tokens', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`);
    assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    assert.equal(init.headers.Authorization, `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`);
    assert.ok(!JSON.stringify(init).includes(env.SUPABASE_SECRET_KEY));
    assert.deepEqual(JSON.parse(init.body), { email: 'user@example.com', password: 'correct-password' });
    return Response.json({ access_token: 'access-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: 12345, user: { id: 'user-id' } });
  };
  const response = await onRequestPost({ request: request({ email: 'user@example.com', password: 'correct-password' }), env });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.session.access_token, 'access-token');
  assert.equal(payload.session.refresh_token, 'refresh-token');
});

test('invalid credentials return an explicit safe reason and diagnostic', async t => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  t.after(() => { globalThis.fetch = originalFetch; console.warn = originalWarn; });
  console.warn = (...args) => warnings.push(args);
  globalThis.fetch = async () => Response.json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, { status: 400 });
  const response = await onRequestPost({ request: request({ email: 'user@example.com', password: 'wrong-password' }), env });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false, reason: 'INVALID_LOGIN_CREDENTIALS', message: 'Invalid login credentials' });
  assert.deepEqual(warnings[0], ['[SUPABASE_LOGIN_FAILED]', { status: 400, error_code: 'invalid_credentials', message: 'Invalid login credentials' }]);
  assert.ok(!JSON.stringify(warnings).includes('wrong-password'));
  assert.ok(!JSON.stringify(warnings).includes(env.SUPABASE_PUBLISHABLE_KEY));
});

test('legacy username field is not silently treated as email', async () => {
  const response = await onRequestPost({ request: request({ username: 'user', password: 'password' }), env });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, reason: 'INVALID_LOGIN_PAYLOAD', message: 'Email dan password wajib diisi.' });
});
