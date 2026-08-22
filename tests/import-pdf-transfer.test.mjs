import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveImportPdfSpreadsheetId } from '../functions/api/import-pdf-transfer.js';

test('uses saved Import PDF config while global GOOGLE_SHEET_ID is empty', async () => {
  const result = await resolveImportPdfSpreadsheetId({
    GOOGLE_SHEET_ID: '',
    IMPORT_PDF_CONFIG: JSON.stringify({ spreadsheetId: 'configured-import-pdf' }),
  });
  assert.deepEqual(result, { spreadsheetId: 'configured-import-pdf', source: 'settings' });
});

test('never uses global GOOGLE_SHEET_ID as an Import PDF fallback', async () => {
  const result = await resolveImportPdfSpreadsheetId({ GOOGLE_SHEET_ID: 'global-sheet' });
  assert.equal(result.spreadsheetId, '');
  assert.equal(result.source, 'none');
});

test('uses application default before mapping and dedicated env fallback', async () => {
  const result = await resolveImportPdfSpreadsheetId({
    SHEET_ID_INVENTORY: 'application-sheet',
    SHEET_MAPPING: JSON.stringify({ importPdf: { spreadsheetId: 'mapped-sheet' } }),
    GOOGLE_SHEET_ID_IMPORT_PDF: 'fallback-sheet',
  });
  assert.deepEqual(result, { spreadsheetId: 'application-sheet', source: 'application-default' });
});

test('frontend commit sends selected sheet context and preserves CSV source', async () => {
  const source = await readFile(new URL('../assets/js/main.js', import.meta.url), 'utf8');
  assert.match(source, /sheetName:PDF_TRANSFER_STATE\.selectedSheetName/);
  assert.match(source, /rows:valid/);
  assert.match(source, /source:'csv'/);
  assert.match(source, /if\(PDF_TRANSFER_STATE\.isImporting\)return/);
});

test('backend batches writes and does not create sheets from user input', async () => {
  const source = await readFile(new URL('../functions/api/import-pdf-transfer.js', import.meta.url), 'utf8');
  assert.match(source, /const BATCH_SIZE = 500/);
  assert.doesNotMatch(source, /addSheet/);
  assert.match(source, /if \(!sheets\.includes\(sheetName\)\)/);
});
