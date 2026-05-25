const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});} 
function base64Url(input){const text=typeof input==='string'?input:JSON.stringify(input);const bytes=new TextEncoder().encode(text);let binary='';bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function pemToArrayBuffer(pem){const clean=String(pem||'').replace(/\\n/g,'\n').replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');const binary=atob(clean);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer;}
async function createAccessToken(env){const now=Math.floor(Date.now()/1000);const encodedHeader=base64Url({alg:'RS256',typ:'JWT'});const encodedPayload=base64Url({iss:env.GOOGLE_CLIENT_EMAIL,scope:SCOPE,aud:TOKEN_URL,exp:now+3600,iat:now});const unsignedJwt=`${encodedHeader}.${encodedPayload}`;const privateKey=await crypto.subtle.importKey('pkcs8',pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(unsignedJwt));let binary='';new Uint8Array(signature).forEach(b=>binary+=String.fromCharCode(b));const jwt=`${unsignedJwt}.${btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}`;const tokenRes=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});const tokenData=await tokenRes.json();if(!tokenRes.ok||!tokenData.access_token)throw new Error(tokenData.error_description||tokenData.error||'Gagal token');return tokenData.access_token;}

export async function onRequestPost({request,env}){
  try{
    const body=await request.json();
    const header=body?.header||{};
    const items=Array.isArray(body?.items)?body.items:[];
    if(!items.length)return json({success:false,message:'Data item kosong'},400);
    const filtered=items.filter(it=>String(it?.sku||'').trim());
    if(!filtered.length)return json({success:false,message:'Semua SKU kosong'},400);
    const accessToken=await createAccessToken(env);
    const sheetName=env.TRANSFER_IMPORT_SHEET||'Import PDF Transfer';
    const range=`${sheetName}!A:N`;
    const now=new Date().toISOString();
    const rows=filtered.map(it=>[header.nomorTransfer||'',header.tanggal||'',header.dari||'',header.kepada||'',header.status||'',header.nomorReferensi||'',it.sku||'',it.namaProduk||'',Number(it.jumlah)||0,Number(it.diterima)||0,Number(it.batal)||0,Number(it.tolak)||0,it.catatan||'',now]);
    const url=`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({values:rows})});
    const out=await res.json();
    if(!res.ok)return json({success:false,message:out?.error?.message||'Gagal import',detail:out},res.status);
    return json({success:true,message:'Import berhasil',imported:rows.length});
  }catch(err){return json({success:false,message:err?.message||'Internal server error'},500);} 
}
