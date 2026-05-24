const TOKEN_URL='https://oauth2.googleapis.com/token';
const SCOPE='https://www.googleapis.com/auth/spreadsheets';
export const SHEET_BARANG_MASUK='Barang Masuk';
export const SHEET_BARANG_KELUAR='Barang KeIuar';
export const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const toB64=i=>btoa(typeof i==='string'?i:JSON.stringify(i)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const pemToBuf=p=>{const c=String(p||'').replace(/\\n/g,'\n').replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');const b=atob(c);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer;};
export async function token(env){const now=Math.floor(Date.now()/1000);const unsigned=`${toB64({alg:'RS256',typ:'JWT'})}.${toB64({iss:env.GOOGLE_CLIENT_EMAIL,scope:SCOPE,aud:TOKEN_URL,exp:now+3600,iat:now})}`;const key=await crypto.subtle.importKey('pkcs8',pemToBuf(env.GOOGLE_PRIVATE_KEY),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(unsigned));let bin='';new Uint8Array(sig).forEach(b=>bin+=String.fromCharCode(b));const jwt=`${unsigned}.${btoa(bin).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}`;const r=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});const d=await r.json();if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||'Gagal membuat access token');return d.access_token;}
export const FIELD_MAP={tanggal:'A',from:'B',to:'C',sku:'D',namaBarang:'E',qty:'F',status:'G',pic:'H',keterangan:'I'};
export const BARANG_COLUMNS=['tanggal','from','to','sku','namaBarang','qty','status','pic','keterangan'];
export function normalizeHeaderName(value=''){
  return String(value||'').trim().replace(/\s+/g,' ');
}
export function detectColumnsFromRows(rows=[]){
  const headerRow=Array.isArray(rows?.[0])?rows[0]:[];
  const maxCols=Math.max(headerRow.length,...rows.map(r=>Array.isArray(r)?r.length:0));
  return Array.from({length:maxCols},(_,index)=>normalizeHeaderName(headerRow[index]||'')||`Kolom ${index+1}`);
}
export function mapBarangSheetValues(values,startRowNumber=2){
  const rows=Array.isArray(values)?values:[];
  const columns=detectColumnsFromRows(rows);
  const dataRows=rows.slice(1);
  return dataRows
    .map((row,index)=>({row:Array.isArray(row)?row:[],rowNumber:startRowNumber+1+index}))
    .filter(({row})=>row.some(cell=>String(cell??'').trim()))
    .map(({row,rowNumber})=>{
      const item={rowNumber};
      columns.forEach((key,index)=>{item[key]=row[index]??'';});
      return item;
    });
}

export function toA1Column(index){
  let n=Number(index)+1;
  let out='';
  while(n>0){
    const rem=(n-1)%26;
    out=String.fromCharCode(65+rem)+out;
    n=Math.floor((n-1)/26);
  }
  return out;
}

export async function getSheetHeaders({env,sheetName}){
  const access=await token(env);
  const sheetId=env.SHEET_ID_2026;
  const range=`${sheetName}!A1:ZZ1`;
  const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,{headers:{Authorization:`Bearer ${access}`}});
  const out=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(out?.error?.message||'Gagal membaca header sheet');
  const firstRow=Array.isArray(out?.values?.[0])?out.values[0]:[];
  return detectColumnsFromRows([firstRow]);
}

export async function updateCells({env,sheetName,rowNumber,updates,headers=[]}){const access=await token(env);const sheetId=env.SHEET_ID_2026;const data=Object.entries(updates).map(([k,v])=>{const idx=headers.indexOf(k);if(idx<0)return null;return {range:`${sheetName}!${toA1Column(idx)}${rowNumber}`,values:[[v??'']]};}).filter(Boolean);
if(!data.length)throw new Error('updates kosong/tidak valid');
const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data})});
const out=await res.json();if(!res.ok)throw new Error(out.error?.message||'Gagal update');
}
export async function deleteRows({env,sheetName,rowNumbers}){const access=await token(env);const ss=env.SHEET_ID_2026;const meta=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ss}?fields=sheets.properties`,{headers:{Authorization:`Bearer ${access}`}});const m=await meta.json();const sh=(m.sheets||[]).find(s=>String(s.properties?.title||'')===sheetName);if(!sh){if(sheetName===SHEET_BARANG_KELUAR)throw new Error('Sheet Barang KeIuar tidak ditemukan di SHEET_ID_2026');throw new Error(`Sheet ${sheetName} tidak ditemukan di SHEET_ID_2026`);}const sorted=[...rowNumbers].sort((a,b)=>b-a);const requests=sorted.map(r=>({deleteDimension:{range:{sheetId:sh.properties.sheetId,dimension:'ROWS',startIndex:r-1,endIndex:r}}}));
const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ss}:batchUpdate`,{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({requests})});const out=await res.json();if(!res.ok)throw new Error(out.error?.message||'Gagal hapus');
}
