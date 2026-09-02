import { SHEETS } from './config.js';
import { parseSheet } from './parser.js';
import { authFetch } from './supabase.js';

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

const MIGRATED_INVENTORY_SOURCES = new Set(Object.keys(BACKEND_SHEET_ENDPOINT));

export function routeSourceRows(sheetName, payload){
  if(MIGRATED_INVENTORY_SOURCES.has(sheetName)){
    if(!Array.isArray(payload) || payload.some(row => !row || typeof row !== 'object' || Array.isArray(row))){
      throw new TypeError(`${sheetName}: respons Supabase harus berupa object rows`);
    }
    return payload;
  }
  return parseSheet(payload, sheetName);
}

async function fetchSheetViaBackend(sheetName){
  const endpoint = BACKEND_SHEET_ENDPOINT[sheetName];
  const res = await authFetch(endpoint);
  const json = await res.json();
  if(!res.ok || !json?.success){
    throw new Error(`${sheetName}: ${json?.message || res.statusText}`);
  }
  if(sheetName === 'Kartu Stock') window.__kartuStokSyncStatus = json.syncStatus || null;
  if(sheetName === 'BULKY'){
    window.__bulkyLastSync = json.lastSync || null;
    window.__bulkySyncStatus = json.syncStatus || null;
  }
  if(Array.isArray(json.rows)) return json.rows;
  if(Array.isArray(json.data)) return json.data;
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
      const parsedRows = routeSourceRows(sheetName, values);
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
