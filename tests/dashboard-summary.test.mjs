import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as login } from '../functions/api/login.js';
import { handleDashboardSummaryRequest } from '../functions/api/dashboard-summary.js';

const env = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
  SUPABASE_SECRET_KEY: 'sb_secret_test-key',
  DEV_USERNAME: 'developer',
  DEV_PASSWORD: 'correct-password',
  DEV_SESSION_SECRET: 'a-long-server-only-signing-secret',
};

test('dashboard summary uses database totals while returning only 50 recent rows per transaction source', async t => {
  const loginResponse = await login({ request: new Request('https://app.test/api/login', { method: 'POST', body: JSON.stringify({ identifier: 'developer', password: 'correct-password' }) }), env });
  const token = (await loginResponse.json()).session.access_token;
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const totals = { inventory_kartu_stok: 7000, inventory_rpl: 4000, inventory_bulky: 3000, inventory_barang_masuk: 21808, inventory_barang_keluar: 15669 };
  globalThis.fetch = async url => {
    const table = Object.keys(totals).find(name => String(url).includes(`/rest/v1/${name}?`));
    assert.ok(table, `unexpected URL ${url}`);
    const recent = String(url).includes('order=source_row_number.desc');
    const size = recent ? 50 : 1;
    const rows = Array.from({ length: size }, (_, index) => ({ sku: `SKU-${index}`, qty: 1, stok_akhir: 1, source_row_number: index + 1 }));
    return Response.json(rows, { headers: { 'content-range': `0-${size - 1}/${totals[table]}` } });
  };
  const response = await handleDashboardSummaryRequest({ request: new Request('https://app.test/api/dashboard-summary', { headers: { authorization: `Bearer ${token}` } }), env });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.summary.barangMasuk.rows, 21808);
  assert.equal(payload.summary.barangKeluar.rows, 15669);
  assert.equal(payload.summary.kartuStok.rows, 7000);
  assert.equal(payload.recent.barangMasuk.length, 50);
  assert.equal(payload.recent.barangKeluar.length, 50);
});
