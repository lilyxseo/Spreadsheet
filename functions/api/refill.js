import { onRequestPost as movementIn } from './movement/in.js';

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const REFILL_SPREADSHEET_ID = "1eJ4ZsR8Oy0BqPEhMaWJkhMgZXPp2UwxiMI2tz4o3l4c";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function sanitize(v){return String(v??"").trim();}
function base64Url(input){const text=typeof input==="string"?input:JSON.stringify(input);const bytes=new TextEncoder().encode(text);let b="";bytes.forEach(x=>b+=String.fromCharCode(x));return btoa(b).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
function pemToArrayBuffer(pem){const clean=String(pem||"").replace(/\\n/g,"\n").replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\s/g,"");const bin=atob(clean);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes.buffer;}
async function createAccessToken(env){const now=Math.floor(Date.now()/1000);const unsigned=`${base64Url({alg:"RS256",typ:"JWT"})}.${base64Url({iss:env.GOOGLE_CLIENT_EMAIL,scope:SCOPE,aud:TOKEN_URL,exp:now+3600,iat:now})}`;const privateKey=await crypto.subtle.importKey("pkcs8",pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",privateKey,new TextEncoder().encode(unsigned));let bs="";new Uint8Array(sig).forEach(v=>bs+=String.fromCharCode(v));const jwt=`${unsigned}.${btoa(bs).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}`;const tokenRes=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})});const tokenData=await tokenRes.json();if(!tokenRes.ok||!tokenData.access_token)throw new Error(tokenData.error_description||tokenData.error||"Gagal membuat access token");return tokenData.access_token;}
async function readSheetValues({accessToken,sheetId,range}){const url=`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;const res=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});const data=await res.json().catch(()=>({}));return {res,data};}
async function appendToSheet({accessToken,sheetId,range,values}){const url=`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;const res=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({values})});const data=await res.json().catch(()=>({}));return {res,data};}

export async function onRequestGet({request,env}){
  const mode=sanitize(new URL(request.url).searchParams.get('mode')).toLowerCase();
  if(mode!=='history')return new Response('API OK',{status:200});
  try{
    const spreadsheetId=REFILL_SPREADSHEET_ID;
    const accessToken=await createAccessToken(env);
    const read=await readSheetValues({accessToken,sheetId:spreadsheetId,range:'REKAP RPL!A:F'});
    if(!read.res.ok)return json({success:false,message:read.data?.error?.message||'Gagal baca history'},read.res.status);
    const vals=Array.isArray(read.data?.values)?read.data.values:[];
    const rows=vals.slice(1).map((r,i)=>({rowNumber:i+2,tanggal:r?.[0]||'',from:r?.[1]||'',to:r?.[2]||'',sku:r?.[3]||'',nama_barang:r?.[4]||'',qty:r?.[5]||''})).filter(r=>Object.values(r).some(v=>String(v).trim()));
    return json({success:true,data:rows});
  }catch(err){return json({success:false,message:err?.message||'Internal server error'},500)}
}

export async function onRequestPost(ctx){
  const {request,env}=ctx;
  try{
    const body=await request.clone().json();
    const items=Array.isArray(body?.items)?body.items:[];
    const refillSpreadsheetId=sanitize(body?.spreadsheetId)||REFILL_SPREADSHEET_ID;
    if(!items.length)return json({success:false,message:'items wajib diisi'},400);
    const accessToken=await createAccessToken(env);
    const historyRows=items.map(it=>[it.tanggal||new Date().toISOString(),it.from||'',it.to||'',it.sku||'',it.namaBarang||'',it.qty||'']);
    const app=await appendToSheet({accessToken,sheetId:refillSpreadsheetId,range:'REKAP RPL!A:F',values:historyRows});
    if(!app.res.ok)return json({success:false,message:app.data?.error?.message||'Gagal simpan history refill'},app.res.status);
    const wrappedReq=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({items:items.map(it=>({...it,qty:it.qty,stokDiLokasiAwal:it.qty,stokAktual:it.qty,keterangan:'REPLENISMENT'}))})});
    const movementResp=await movementIn({request:wrappedReq,env});
    const movementJson=await movementResp.clone().json().catch(()=>({}));
    if(!movementResp.ok)return json({success:false,message:movementJson?.message||'Gagal kirim movement'},movementResp.status);
    return json({success:true});
  }catch(err){return json({success:false,message:err?.message||'Internal server error'},500)}
}
