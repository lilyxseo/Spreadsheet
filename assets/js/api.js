import { API_KEY, SPREADSHEET_ID, SHEETS } from './config.js';
import { parseSheet } from './parser.js';

export async function fetchSheet(sheetName){
  const range = `${sheetName}!A1:ZZ20000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  console.log("FETCH RESULT", sheetName, json);
  if(!res.ok || json.error){
    throw new Error(`${sheetName}: ${(json.error && json.error.message) || res.statusText}`);
  }
  return json.values || [];
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
