import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('all five migrated inventory pages expose lazy server-pagination routes', () => {
  for (const [page, endpoint] of [['kartu-stok', '/api/kartu-stok'], ['rpl', '/api/rpl'], ['bulky', '/api/bulky']]) {
    assert.match(html, new RegExp(`data-route="/${page}"`));
    assert.match(main, new RegExp(`endpoint:"${endpoint.replaceAll('/', '\\/')}"`));
  }
  assert.match(main, /pageSize:50,serverTotal:0/);
  assert.match(main, /loadMovementPage\(mode,\{page,limit:st\.pageSize\}\)/);
  assert.match(main, /Halaman \$\{state\.page\} \/ \$\{totalPages\}/);
  assert.match(main, /state\.total=Number\(json\.total\)\|\|0/);
});

test('inventory searches reset to page one and current-page refresh preserves query state', () => {
  assert.match(main, /loadInventoryPage\(key,\{page:1,search:input\.value\}\)/);
  assert.match(main, /loadInventoryPage\(key,\{page:state\.page,limit:state\.limit,search:state\.search\}\)/);
  assert.match(main, /loadMovementPage\("in",\{page:1\}\)/);
  assert.match(main, /loadMovementPage\("out",\{page:1\}\)/);
});

test('manual refresh does not call the sync pipeline', () => {
  const refresh = main.slice(main.indexOf('async function triggerManualRefresh'), main.indexOf('function syncRefreshButton'));
  assert.doesNotMatch(refresh, /loadAllData|syncData|\/api\/sync/);
});

test('legacy Sheets modules retain their dedicated lazy loaders', () => {
  assert.match(main, /fetchSheet\("BARCODE"\)/);
  assert.match(main, /\/api\/balikan-store\/sheets/);
  assert.match(main, /fetchAssetStoreSheetData/);
  assert.match(main, /fetchArchiveSheetData/);
  assert.match(main, /\/api\/barang-reject/);
  assert.doesNotMatch(main, /'Kartu Stock':\{kind:'sheets'\}/);
});
