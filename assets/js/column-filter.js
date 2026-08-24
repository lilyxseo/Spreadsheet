export const EMPTY_FILTER_VALUE = '__WMS_EMPTY__';

export function isEmptyFilterValue(value) {
  return value == null || String(value).trim() === '';
}

export function normalizeColumnSearch(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function serializeFilterValue(value) {
  return isEmptyFilterValue(value) ? EMPTY_FILTER_VALUE : String(value).trim();
}

export function matchesColumnFilters(row, columns, exactFilters = {}, containsFilters = {}, omitColumn = '') {
  return columns.every(column => {
    if (column.key === omitColumn) return true;
    const value = typeof column.value === 'function' ? column.value(row) : row?.[column.key];
    const selected = exactFilters[column.key] || [];
    const contains = normalizeColumnSearch(containsFilters[column.key]);
    if (selected.length && !selected.includes(serializeFilterValue(value))) return false;
    return !contains || normalizeColumnSearch(value).includes(contains);
  });
}
