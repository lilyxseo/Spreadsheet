import { API_KEY, SPREADSHEET_ID, SHEETS } from './config.js';
import { parseSheet } from './parser.js';

const BACKEND_SHEET_ENDPOINT = {
  'Barang Masuk': '/api/barang-masuk',
  'Barang Keluar': '/api/barang-keluar'
};

async function fetchSheetViaBackend(sheetName){
  const endpoint = BACKEND_SHEET_ENDPOINT[sheetName];
  const res = await fetch(endpoint);
  const json = await res.json();
  if(!res.ok || !json?.success){
    throw new Error(`${sheetName}: ${json?.message || res.statusText}`);
  }
  return Array.isArray(json.values) ? json.values : [];
}

function buildSheetCandidateNames(sheetName){
  const variants = [sheetName];
  const upper = String(sheetName || '').toUpperCase();

  if(upper === 'RPL') variants.push('rpl', 'Rpl');
  if(upper === 'BULKY') variants.push('bulky', 'Bulky');

  return [...new Set(variants)];
}

export async function fetchSheet(sheetName){
  if(BACKEND_SHEET_ENDPOINT[sheetName]) return fetchSheetViaBackend(sheetName);

  const candidates = buildSheetCandidateNames(sheetName);
  let lastError = null;

  for(const candidate of candidates){
    const range = `${candidate}!A1:ZZ20000`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    console.log("FETCH RESULT", candidate, json);

    if(res.ok && !json.error){
      return json.values || [];
    }

    lastError = `${candidate}: ${(json.error && json.error.message) || res.statusText}`;
  }

  throw new Error(`${sheetName}: ${lastError || 'Gagal membaca sheet'}`);
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
