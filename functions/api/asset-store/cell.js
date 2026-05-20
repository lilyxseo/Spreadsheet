import { onRequestPatch } from '../_cell-update.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});

export async function onRequest(context){
  const { request } = context;
  if(request.method!=='PATCH') return json({ success:false, message:'Method not allowed' },405);
  try{
    const payload=await request.clone().json();
    const headers=Array.isArray(payload?.headers)?payload.headers:[];
    const field=String(payload?.field||'');
    const colIndex=headers.findIndex(h=>String(h||'').trim()===field);
    if(colIndex<0) return json({ success:false, message:'Kolom tidak ditemukan di header sheet' },400);
    const toCol=(idx)=>{let n=idx+1;let out='';while(n>0){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26);}return out;};
    const fieldMap={ [field]: toCol(colIndex) };
    const sheetName=String(payload?.sheetName||'').trim();
    const spreadsheetId=String(payload?.spreadsheetId||'').trim();
    if(!sheetName||!spreadsheetId) return json({ success:false, message:'sheetName/spreadsheetId wajib diisi' },400);

    const body={ rowNumber:Number(payload.rowNumber), field, value: payload.value };
    const wrapped = new Request(request.url,{method:'PATCH',headers:request.headers,body:JSON.stringify(body)});
    const envProxy = new Proxy(context.env,{get(target,prop){ if(prop==='ASSET_STORE_SPREADSHEET_ID') return spreadsheetId; return target[prop]; }});
    return onRequestPatch({request:wrapped,env:envProxy},{fieldMap,sheetName,spreadsheetIdEnv:'ASSET_STORE_SPREADSHEET_ID'});
  }catch(err){
    return json({ success:false, message:err?.message||'Invalid payload' },400);
  }
}
