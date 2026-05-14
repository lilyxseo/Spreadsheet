export function buildAutoInsight(data){
  const masuk=data?.["Barang Masuk"]||[];
  const keluar=data?.["Barang Keluar"]||[];
  if(!masuk.length&&!keluar.length)return {empty:true,categories:[]};

  const now=new Date();
  const monthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const isReceipt=row=>clean(getField(row,["keterangan"]))==="receipt";
  const isPengeluaran=row=>clean(getField(row,["keterangan"]))==="pengeluaran";

  const inMonth=masuk.map(r=>normalizeMovementRow(r,"Masuk")).filter(r=>r&&r.monthKey===monthKey&&isReceipt(r.raw));
  const outMonth=keluar.map(r=>normalizeMovementRow(r,"Keluar")).filter(r=>r&&r.monthKey===monthKey&&isPengeluaran(r.raw));

  const inSku=new Set(inMonth.map(r=>r.sku).filter(Boolean)).size;
  const outSku=new Set(outMonth.map(r=>r.sku).filter(Boolean)).size;
  const inQty=inMonth.reduce((n,r)=>n+r.qty,0);
  const outQty=outMonth.reduce((n,r)=>n+r.qty,0);

  const topOut=getTopSkuByQty(outMonth);
  const topIn=getTopSkuByQty(inMonth);
  const diff=inQty-outQty;

  return {empty:false,categories:[{title:"📦 Insight Bulan Berjalan",items:[
    `Barang Masuk bulan ini total <strong>${inSku}</strong> SKU / <strong>${inQty}</strong> qty`,
    `Barang Keluar bulan ini total <strong>${outSku}</strong> SKU / <strong>${outQty}</strong> qty`,
    topOut.name?`SKU paling sering keluar bulan ini adalah <strong>${safe(topOut.name)}</strong> dengan total <strong>${topOut.qty}</strong> pcs`:"Belum ada data SKU keluar bulan ini",
    topIn.name?`SKU paling sering masuk bulan ini adalah <strong>${safe(topIn.name)}</strong> dengan total <strong>${topIn.qty}</strong> pcs`:"Belum ada data SKU masuk bulan ini",
    `Selisih qty masuk vs keluar bulan ini: <strong>${diff}</strong>`
  ]}]};
}

function normalizeMovementRow(row,type){
  const dateKey=normDate(getField(row,["tanggal","date","created at","waktu"]));
  if(!dateKey)return null;
  const sku=getField(row,["sku"]);
  const name=getField(row,["nama barang","nama","item","description"])||sku||"-";
  const qty=num(getField(row,["qty"]));
  return {type,sku,name,qty,dateKey,monthKey:dateKey.slice(0,7),raw:row};
}

function getTopSkuByQty(rows){
  const map=new Map();
  rows.forEach(r=>{const key=r.sku||r.name; if(!key)return; const prev=map.get(key)||{name:r.name||r.sku||"-",qty:0}; prev.qty+=r.qty; map.set(key,prev);});
  let best={name:"",qty:0};
  for(const v of map.values())if(v.qty>best.qty)best=v;
  return best;
}

const getField=(r,keys)=>{const cols=Object.keys(r||{});for(const k of keys){const f=cols.find(c=>String(c||"").toLowerCase().includes(String(k).toLowerCase()));if(f&&r[f]!=null)return String(r[f]);}return "";};
const num=v=>{const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0;};
const clean=v=>String(v||"").trim().toLowerCase();
const normDate=s=>{const t=String(s||"").trim();if(!t)return "";const m=t.replace(/\./g,"/").replace(/-/g,"/").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;return `${y}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;}const d=new Date(t);return Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const safe=v=>String(v||"").replace(/[&<>\"]/g,"");
