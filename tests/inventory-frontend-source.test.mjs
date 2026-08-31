import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const INVENTORY_SOURCES = ['Kartu Stock', 'Barang Masuk', 'Barang Keluar', 'RPL', 'BULKY'];
const mainSource = await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8');

test('main dashboard routes every inventory source through a Supabase-backed API', () => {
  const routing = mainSource.slice(mainSource.indexOf('const FRONTEND_SOURCE_ROUTES'), mainSource.indexOf('function parseSheet(values)'));
  for (const name of INVENTORY_SOURCES) assert.match(routing, new RegExp(`['"]${name}['"]`), `${name} must have an explicit backend route`);
  for (const endpoint of ['/api/kartu-stok', '/api/barang-masuk', '/api/barang-keluar', '/api/rpl', '/api/bulky']) assert.match(routing, new RegExp(endpoint));
  assert.match(routing, /['"]BARCODE['"]:\{kind:['"]sheets['"]\}/);
  assert.match(routing, /throw new Error\(`\$\{sourceName\}: source frontend tidak didukung`\)/);
  assert.doesNotMatch(routing, /\/api\/sync\/inventory\//);
});

test('module API maps all inventory names and has no Google Sheets fallback', async () => {
  const source = await readFile(new URL('../assets/js/api.js', import.meta.url), 'utf8');
  const mapping = source.slice(source.indexOf('const BACKEND_SHEET_ENDPOINT'), source.indexOf('async function fetchSheetViaBackend'));
  for (const name of [...INVENTORY_SOURCES, 'Kartu Stok']) assert.match(mapping, new RegExp(`['"]${name}['"]`));
  for (const endpoint of ['kartu-stok', 'barang-masuk', 'barang-keluar', 'rpl', 'bulky']) assert.match(mapping, new RegExp(`/api/${endpoint}`));
  assert.match(source, /if\(BACKEND_SHEET_ENDPOINT\[sheetName\]\) return fetchSheetViaBackend\(sheetName\)/);
  assert.doesNotMatch(source, /sheets\.googleapis\.com|API_KEY|SPREADSHEET_ID|\/api\/sync\/inventory\//);
});

test('manual refresh keeps the non-migrated Balikan source on its existing loader', () => {
  assert.match(mainSource, /if\(getActivePage\?\.\(\)===['"]balikan-store['"]\)return loadBalikanRows\(\{background:true,force:true\}\)/);
});

test('login verifies its persisted session and migrated inventory fetches require auth', async () => {
  const authSource = await readFile(new URL('../assets/js/supabase.js', import.meta.url), 'utf8');
  assert.match(authSource, /JSON\.stringify\(\{ email, password \}\)/);
  assert.match(authSource, /supabase\.auth\.setSession\(\{[\s\S]*access_token:[\s\S]*refresh_token:/);
  assert.match(authSource, /supabase\.auth\.getSession\(\)/);
  for (const endpoint of ['kartu-stok', 'barang-masuk', 'barang-keluar', 'rpl', 'bulky']) assert.match(mainSource, new RegExp(`'/api/${endpoint}'`));
  assert.match(mainSource, /AUTHENTICATED_INVENTORY_PATHS\.has\(apiPath\)&&!headers\.has\('Authorization'\)/);
});
