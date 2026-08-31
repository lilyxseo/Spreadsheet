import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const INVENTORY_SOURCES = ['Kartu Stock', 'Barang Masuk', 'Barang Keluar', 'RPL', 'BULKY'];

test('main dashboard routes every inventory source through a Supabase-backed API', async () => {
  const source = await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8');
  const fetchSheetBody = source.slice(source.indexOf('async function fetchSheet(sheetName){'), source.indexOf('function parseSheet(values)'));

  for (const name of INVENTORY_SOURCES) {
    assert.match(fetchSheetBody, new RegExp(`['"]${name}['"]`), `${name} must have an explicit backend route`);
  }
  for (const endpoint of ['/api/kartu-stok', '/api/rpl', '/api/bulky']) {
    assert.match(fetchSheetBody, new RegExp(endpoint), `${endpoint} must be used by fetchSheet`);
  }
  assert.match(source, /fetchJsonSafe\(`\/api\/barang-masuk/);
  assert.match(source, /fetchJsonSafe\(`\/api\/barang-keluar/);

  const googleFallback = fetchSheetBody.indexOf('https://sheets.googleapis.com');
  assert.ok(googleFallback > fetchSheetBody.indexOf("if(inventoryEndpoints[sheetName])"));
  assert.match(fetchSheetBody, /Google Sheets remains available only for non-inventory sources/);
});

test('module API maps all inventory names before its legacy non-inventory fallback', async () => {
  const source = await readFile(new URL('../assets/js/api.js', import.meta.url), 'utf8');
  const mapping = source.slice(source.indexOf('const BACKEND_SHEET_ENDPOINT'), source.indexOf('async function fetchSheetViaBackend'));
  for (const name of INVENTORY_SOURCES) assert.match(mapping, new RegExp(`['"]${name}['"]`));
  for (const endpoint of ['kartu-stok', 'barang-masuk', 'barang-keluar', 'rpl', 'bulky']) assert.match(mapping, new RegExp(`/api/${endpoint}`));
  assert.match(source, /if\(BACKEND_SHEET_ENDPOINT\[sheetName\]\) return fetchSheetViaBackend\(sheetName\)/);
});
