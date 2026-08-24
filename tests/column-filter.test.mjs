import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_FILTER_VALUE,
  isEmptyFilterValue,
  normalizeColumnSearch,
  serializeFilterValue,
  matchesColumnFilters
} from '../assets/js/column-filter.js';

const columns = [
  { key: 'qty' }, { key: 'lokasi' }, { key: 'stokRetail' },
  { key: 'status' }, { key: 'keterangan' }, { key: 'sku' }
];
const rows = [
  { qty: 0, lokasi: 'A20-1', stokRetail: 0, status: '', keterangan: null, sku: 'GN-210047' },
  { qty: '0', lokasi: 'A20-1', stokRetail: 2, status: 'Sesuai', keterangan: '  ', sku: '2S BLUE' },
  { qty: 2, lokasi: 'A20-2', stokRetail: '', status: 'Sesuai', keterangan: '-', sku: '4S Purple' }
];

test('(Kosong) only matches null, undefined, empty, and whitespace', () => {
  assert.equal(isEmptyFilterValue(null), true);
  assert.equal(isEmptyFilterValue(undefined), true);
  assert.equal(isEmptyFilterValue('  '), true);
  assert.equal(isEmptyFilterValue(0), false);
  assert.equal(isEmptyFilterValue(false), false);
  assert.equal(isEmptyFilterValue('-'), false);
});

test('zero remains an exact filter value', () => {
  assert.equal(serializeFilterValue(0), '0');
  assert.equal(serializeFilterValue('0'), '0');
  assert.equal(serializeFilterValue(' '), EMPTY_FILTER_VALUE);
  assert.equal(rows.filter(row => matchesColumnFilters(row, columns, { qty: ['0'] })).length, 2);
  assert.equal(rows.filter(row => matchesColumnFilters(row, columns, { stokRetail: ['0'] })).length, 1);
});

test('empty status and notes filters are accurate', () => {
  assert.deepEqual(rows.filter(row => matchesColumnFilters(row, columns, { status: [EMPTY_FILTER_VALUE] })).map(row => row.sku), ['GN-210047']);
  assert.deepEqual(rows.filter(row => matchesColumnFilters(row, columns, { keterangan: [EMPTY_FILTER_VALUE] })).map(row => row.sku), ['GN-210047', '2S BLUE']);
});

test('column filters combine with AND semantics', () => {
  const result = rows.filter(row => matchesColumnFilters(row, columns, {
    lokasi: ['A20-1'], status: ['Sesuai'], keterangan: [EMPTY_FILTER_VALUE]
  }));
  assert.deepEqual(result.map(row => row.sku), ['2S BLUE']);
});

test('contains normalization preserves SKU hyphens and collapses spaces', () => {
  assert.equal(normalizeColumnSearch('  GN-210047  '), 'gn-210047');
  assert.equal(normalizeColumnSearch('2S   BLUE'), '2s blue');
  assert.deepEqual(rows.filter(row => matchesColumnFilters(row, columns, {}, { sku: 'gn-210047' })).map(row => row.sku), ['GN-210047']);
});
