import { SHEETS } from './config.js';
import { parseSheet } from './parser.js';

const BACKEND_SHEET_ENDPOINT = {
  'Kartu Stock': '/api/kartu-stok?mode=full',
  'Kartu Stok': '/api/kartu-stok?mode=full',
  'RPL': '/api/rpl?mode=full',
  'BULKY': '/api/bulky?mode=full',
  // Legacy dashboards need the complete inbound history; ordinary endpoint calls
  // remain paginated by default.
  'Barang Masuk': '/api/barang-masuk?mode=full',
  // Preserve the legacy full-history frontend contract while the endpoint itself
  // defaults to server-side pagination.
  'Barang Keluar': '/api/barang-keluar?mode=full'
};

async function fetchSheetViaBackend(sheetName){
  const endpoint = BACKEND_SHEET_ENDPOINT[sheetName];
  const res = await fetch(endpoint);
  const json = await res.json();
  if(!res.ok || !json?.success){
    throw new Error(`${sheetName}: ${json?.message || res.statusText}`);
  }
  if(sheetName === 'Kartu Stock') window.__kartuStokSyncStatus = json.syncStatus || null;
  if(sheetName === 'BULKY'){
    window.__bulkyLastSync = json.lastSync || null;
    window.__bulkySyncStatus = json.syncStatus || null;
  }
  if(Array.isArray(json.data)) return json.data;
  if(Array.isArray(json.rows)) return json.rows;
  return Array.isArray(json.values) ? json.values : [];
}

export async function fetchSheet(sheetName){
  if(BACKEND_SHEET_ENDPOINT[sheetName]) return fetchSheetViaBackend(sheetName);
  throw new Error(`${sheetName}: source frontend tidak didukung`);
}


export async function fetchAllSheets(){
  const DATA = {};
  const errors = [];

  await Promise.all(SHEETS.map(async (sheetName) => {
    try{
      const values = await fetchSheet(sheetName);
      const parsedRows = parseSheet(values, sheetName);
      console.log("PARSED DATA", sheetName, parsedRows.length);
      DATA[sheetName] = parsedRows;
    }catch(err){
      errors.push(`${sheetName}: ${err.message}`);
      DATA[sheetName] = [];
      console.error(`[fetchAllSheets] ${sheetName} failed`, err);
    }
  }));

  if(errors.length){
    const message = `Data belum berhasil dimuat: ${errors.join(' | ')}`;
    throw new Error(message);
  }

  return DATA;
}
