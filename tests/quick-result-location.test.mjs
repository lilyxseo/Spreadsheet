import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../assets/js/main.js', import.meta.url), 'utf8');
const summarySource = source.slice(
  source.indexOf('function buildQuickResultSummary(item){'),
  source.indexOf('function renderQuickResultCard(item,query,mode="hint"){'),
);

test('Quick Result hanya menampilkan lokasi dengan stok positif', () => {
  assert.match(summarySource, /const rowQty=sumRowQty\(row,sheet\);/);
  assert.match(summarySource, /if\(loc&&rowQty>0\)lokasiSet\.add\(String\(loc\)\);/);
  assert.match(summarySource, /distribution\[sheet\]\+=rowQty/);
  assert.doesNotMatch(summarySource, /if\(loc\)lokasiSet\.add/);
});
