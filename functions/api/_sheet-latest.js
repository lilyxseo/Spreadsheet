import { token } from './_barang-ops.js';

async function getSheetMeta({access,spreadsheetId,sheetName}){
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,{headers:{Authorization:`Bearer ${access}`}});
  const d=await r.json();
  if(!r.ok) throw new Error(d?.error?.message||'Gagal baca metadata sheet');
  const target=(d.sheets||[]).find(s=>s.properties?.title===sheetName);
  if(!target) throw new Error(`Sheet ${sheetName} tidak ditemukan`);
  return target;
}

export async function getLatestRowsFromSheet({env,spreadsheetId,sheetName,columns='A:I',limit=1000}){
  const access=await token(env);
  const target=await getSheetMeta({access,spreadsheetId,sheetName});
  const lastRow=Number(target.properties?.gridProperties?.rowCount||0);
  const safeLimit=Math.max(1,Number(limit)||1000);
  const startRow=Math.max(2,lastRow-safeLimit+1);
  const [startCol,endCol]=columns.split(':');
  const range=`'${sheetName}'!${startCol}${startRow}:${endCol}${lastRow}`;
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,{headers:{Authorization:`Bearer ${access}`}});
  const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message||'Gagal membaca latest rows');
  return {startRow,rows:d.values||[]};
}

export async function getFullRowsFromSheet({env,spreadsheetId,sheetName,columns='A:I'}){
  const access=await token(env);
  const range=`'${sheetName}'!${columns}`;
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,{headers:{Authorization:`Bearer ${access}`}});
  const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message||'Gagal membaca full rows');
  return d.values||[];
}
