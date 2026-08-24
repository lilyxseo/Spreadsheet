import test from 'node:test';
import assert from 'node:assert/strict';

const requests = [];
globalThis.fetch = async (_url, init) => { requests.push(JSON.parse(init.body)); return { ok: true }; };
const logger = await import('../assets/js/activity-log.js');

test('logUpdate creates one human-readable structured inline edit', async () => {
  const id = 'inline-1';
  await logger.logUpdate({ id, module: 'Balikan Store', entityType: 'SKU', entityId: 'GN-210047', source: 'INLINE_EDIT', changes: [{ field: 'LOKASI', oldValue: 'AREA HOLD', newValue: 'RUANG TR 2' }] });
  await logger.logUpdate({ id, module: 'Balikan Store', entityType: 'SKU', entityId: 'GN-210047', changes: [] });
  await logger.flushActivityQueue();
  assert.equal(requests.length, 1);
  assert.match(requests[0].description, /Inline edit LOKASI SKU GN-210047/);
  assert.deepEqual(requests[0].details.changes[0], { field: 'LOKASI', oldValue: 'AREA HOLD', newValue: 'RUANG TR 2' });
});

test('login never includes password and duplicate activity id is suppressed', async () => {
  await logger.logLogin({ id: 'login-1', user: 'Lily', module: 'Auth', details: { method: 'PASSWORD', password: 'forbidden' } });
  await logger.logLogin({ id: 'login-1', user: 'Lily', module: 'Auth' });
  const login = requests.find(x => x.id === 'login-1');
  assert.equal(login.action, 'LOGIN');
  assert.equal(login.details.password, undefined);
  assert.equal(requests.filter(x => x.id === 'login-1').length, 1);
});

test('batch import is represented by one activity', async () => {
  await logger.logImport({ id: 'import-1', module: 'CLD TRIP 6', description: 'Import PDF berhasil menambahkan 200 row ke sheet CLD TRIP 6.', details: { validRows: 200, failedRows: 0 } });
  await logger.flushActivityQueue();
  const entries = requests.filter(x => x.id === 'import-1');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].details.validRows, 200);
});
