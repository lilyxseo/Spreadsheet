import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8');

function bodyBetween(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return source.slice(startIndex, endIndex);
}

test('dashboard initialization fetches and renders only its authoritative summary', () => {
  const init = bodyBetween('async function initAppData()', 'async function refreshDataInBackground()');
  const landing = init.slice(0, init.indexOf('await hydrateModuleCachesFromDb()'));
  assert.match(landing, /await loadDashboardSummary\(\)/);
  assert.doesNotMatch(landing, /hydrateAllDataOnInit|preloadData|mode=['"]full|BARCODE|barang-masuk|barang-keluar/);

  const summary = bodyBetween('async function loadDashboardSummary()', 'async function loadDetailPageData(page)');
  assert.match(summary, /fetchJsonSafe\('\/api\/dashboard-summary'/);
  assert.match(summary, /DASHBOARD_SUMMARY=data\.summary/);
  assert.match(summary, /updateDashboard\(\)/);
  assert.ok(summary.indexOf('DASHBOARD_SUMMARY=data.summary') < summary.indexOf('updateDashboard()'));
});

test('dashboard refresh only refetches dashboard summary', () => {
  const refresh = bodyBetween('async function triggerManualRefresh()', 'function syncRefreshButton()');
  const dashboardBranch = refresh.slice(refresh.indexOf("activePage==='dashboard'"), refresh.indexOf("activePage==='balikan-store'"));
  assert.match(dashboardBranch, /loadDashboardSummary\(\)/);
  assert.doesNotMatch(dashboardBranch, /loadAllData|hydrateAllDataOnInit|loadBarcodeMaster|mode=.?full|syncData/);
});

test('movement detail routes lazy-load independently', () => {
  const loader = bodyBetween('async function loadDetailPageData(page)', 'async function initAppData()');
  assert.match(loader, /page==='barang-masuk'[\s\S]*loadBarangMasuk\(\{mode:'full'\}\)/);
  assert.match(loader, /page==='barang-keluar'[\s\S]*loadBarangKeluar\(\{mode:'full'\}\)/);
  const showPage = bodyBetween('function showPage(page)', 'function pageTitleFromPath(path)');
  assert.match(showPage, /loadDetailPageData\(page\)/);
});

test('barcode master is memory-only and loaded only when scanner opens', () => {
  const rebuild = bodyBetween('function rebuildBarcodeMap(rows=[])', 'function detectHeaderIndex(values)');
  assert.doesNotMatch(rebuild, /localStorage\.setItem|inventory_barcode_master/);
  const startupHydration = bodyBetween('async function hydrateAllDataOnInit', 'function preloadInventoryData()');
  assert.doesNotMatch(startupHydration, /loadBarcodeMaster|BARCODE/);
  const scanner = bodyBetween('async function openBarcodeScanner', 'async function openScannerModal');
  assert.match(scanner, /await loadBarcodeMaster\(\)/);
});
