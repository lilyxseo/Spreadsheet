const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const BALIKAN_SHEETS = new Set(["BRB TRIP 1", "TB TRIP 3", "TB TRIP 4", "TB TRIP 5"]);

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
const toB64=(i)=>btoa(typeof i==="string"?i:JSON.stringify(i)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
function pemToBuf(p){const c=String(p||"").replace(/\\n/g,"\n").replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\s/g,"");const b=atob(c);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer;}
async function token(env){const now=Math.floor(Date.now()/1000);const unsigned=`${toB64({alg:"RS256",typ:"JWT"})}.${toB64({iss:env.GOOGLE_CLIENT_EMAIL,scope:SCOPE,aud:TOKEN_URL,exp:now+3600,iat:now})}`;const key=await crypto.subtle.importKey("pkcs8",pemToBuf(env.GOOGLE_PRIVATE_KEY),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned));let bin="";new Uint8Array(sig).forEach(b=>bin+=String.fromCharCode(b));const jwt=`${unsigned}.${btoa(bin).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}`;const r=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})});const d=await r.json();if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||"Gagal membuat access token");return d.access_token;}
function norm(v){return String(v||"").trim().toLowerCase();}
function toBool(v){const n=norm(v);return n==="true"||n==="1"||n==="yes";}

function mapRows(values){if(!Array.isArray(values)||values.length<2)return[];const headers=(values[0]||[]).map(x=>norm(x));const c={check:headers.findIndex(h=>h.includes("centang")),no:headers.findIndex(h=>h==="no"),sku:headers.findIndex(h=>h==="sku"),nama:headers.findIndex(h=>h.includes("nama")),qty:headers.findIndex(h=>h==="qty"),rak:headers.findIndex(h=>h.includes("rak")),lokasi:headers.findIndex(h=>h.includes("lokasi")),bulky:headers.findIndex(h=>h.includes("bulky")),retail:headers.findIndex(h=>h.includes("retail")),status:headers.findIndex(h=>h==="status"),ket:headers.findIndex(h=>h.includes("keterangan"))};
return values.slice(1).map((r,i)=>({rowNumber:i+2,checked:toBool(r[c.check]),no:r[c.no]||"",sku:r[c.sku]||"",namaBarang:r[c.nama]||"",qty:r[c.qty]||"",rakTujuan:r[c.rak]||"",lokasi:r[c.lokasi]||"",stokBulky:r[c.bulky]||"",stokRetail:r[c.retail]||"",status:r[c.status]||"",keterangan:r[c.ket]||""})).filter(x=>x.sku||x.namaBarang);
}

export async function onRequestGet({ request, env }) {
  try {
    const u = new URL(request.url);
    const sheetName = String(u.searchParams.get("sheetName") || "BRB TRIP 1").trim();
    if (!BALIKAN_SHEETS.has(sheetName)) return json({ success:false, message:"sheetName tidak valid" },400);
    const sheetId = env.SHEET_ID_INVENTORY;
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`${sheetName}!A1:ZZ`)}`);
    const data = await res.json();
    if(!res.ok)return json({success:false,message:data.error?.message||"Gagal membaca sheet"},res.status);
    return json({ success:true, data: mapRows(data.values||[]) });
  } catch (err) { return json({ success:false, message: err?.message || "Internal server error" },500); }
}

export async function onRequestPatch({ request, env }) {
  try {
    const {sheetName,rowNumber,checked} = await request.json();
    if(!BALIKAN_SHEETS.has(String(sheetName||"").trim()))return json({success:false,message:"sheetName tidak valid"},400);
    if(!Number.isInteger(rowNumber)||rowNumber<2)return json({success:false,message:"rowNumber tidak valid"},400);
    const access = await token(env);
    const sheetId = env.SHEET_ID_INVENTORY;
    const getRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`${sheetName}!A1:ZZ`)}`,{headers:{Authorization:`Bearer ${access}`}});
    const getJson = await getRes.json(); if(!getRes.ok)return json({success:false,message:getJson.error?.message||"Gagal membaca sheet"},getRes.status);
    const headers=(getJson.values?.[0]||[]).map(x=>norm(x));
    const checkCol=headers.findIndex(h=>h.includes("centang")); const statusCol=headers.findIndex(h=>h==="status"); const skuCol=headers.findIndex(h=>h==="sku");
    if(checkCol<0)return json({success:false,message:"Kolom centang tidak ditemukan"},400);
    const col=(n)=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};
    const updates=[{range:`${sheetName}!${col(checkCol)}${rowNumber}`,values:[[checked?"TRUE":"FALSE"]]}];
    const currentStatus=String(getJson.values?.[rowNumber-1]?.[statusCol]||"").trim().toUpperCase();
    const nextStatus=checked?(currentStatus==="BELUM DI SCAN"?"SESUAI":currentStatus):((currentStatus==="SESUAI"||!currentStatus)?"BELUM DI SCAN":currentStatus);
    if(statusCol>=0 && nextStatus!==currentStatus){updates.push({range:`${sheetName}!${col(statusCol)}${rowNumber}`,values:[[nextStatus]]});}
    const batchRes=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'USER_ENTERED',data:updates})});
    const batchJson=await batchRes.json(); if(!batchRes.ok)return json({success:false,message:batchJson.error?.message||"Gagal update sheet"},batchRes.status);
    return json({success:true,row:{sku:getJson.values?.[rowNumber-1]?.[skuCol]||""}});
  } catch (err) { return json({ success:false, message: err?.message || "Internal server error" },500); }
}
