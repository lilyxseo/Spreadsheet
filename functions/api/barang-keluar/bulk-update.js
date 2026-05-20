import {json,updateCells,SHEET_BARANG_KELUAR,token,parseBarangValuesWithHeader,columnIndexToLetter} from '../_barang-ops.js';
import { requirePicRole } from '../_authz.js';
async function getColumnMap(env,sheetName){
  const spreadsheetId=String(env.SHEET_ID_2026||'').trim();
  const access=await token(env);
  const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A1:ZZ1`)}`,{headers:{Authorization:`Bearer ${access}`}});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||'Gagal membaca header sheet');
  const parsed=parseBarangValuesWithHeader(Array.isArray(data?.values)?data.values:[],2);
  return Object.fromEntries((parsed.columns||[]).map((name,index)=>[name,columnIndexToLetter(index)]));
}
export async function onRequestPost({request,env}){const authz=await requirePicRole({request,env});if(!authz.ok)return authz.response;try{const {rowNumbers,updates}=await request.json();if(!Array.isArray(rowNumbers)||!rowNumbers.length)return json({success:false,message:'rowNumbers wajib diisi'},400);const columnMap=await getColumnMap(env,SHEET_BARANG_KELUAR);const cleanUpdates=Object.fromEntries(Object.entries(updates||{}).filter(([k])=>columnMap[k]));if(!Object.keys(cleanUpdates).length)return json({success:false,message:'updates kosong/tidak valid'},400);for(const rowNumber of rowNumbers.map(Number).filter(n=>Number.isInteger(n)&&n>1)){await updateCells({env,sheetName:SHEET_BARANG_KELUAR,rowNumber,updates:cleanUpdates,columnMap});}return json({success:true});}catch(err){return json({success:false,message:err?.message||'Internal server error'},500);}}
