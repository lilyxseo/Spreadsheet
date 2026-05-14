export function buildAutoInsight(data,{movementRows=[],accuracyRows=[],anomalyRows=[]}={}){
  const masuk=data?.["Barang Masuk"]||[];
  const keluar=data?.["Barang Keluar"]||[];
  const kartu=data?.["Kartu Stock"]||[];
  if(!masuk.length&&!keluar.length&&!kartu.length&&!accuracyRows.length&&!anomalyRows.length)return {empty:true,categories:[]};

  const agg={inToday:0,outToday:0,inSkuToday:new Map(),outSkuToday:new Map(),locToday:new Map()};
  const rows=movementRows.length?movementRows:[...toRows(masuk,"Masuk"),...toRows(keluar,"Keluar")];
  const todayKey=getTodayKey();
  const last7Set=new Set(getRelativeDateKeys(7));
  rows.forEach(r=>{
    if(!r?.dateKey||!last7Set.has(r.dateKey))return;
    if(r.type==="Masuk"&&r.dateKey===todayKey){agg.inToday++;agg.inSkuToday.set(r.sku,(agg.inSkuToday.get(r.sku)||0)+1);}
    if(r.type==="Keluar"&&r.dateKey===todayKey){agg.outToday++;agg.outSkuToday.set(r.sku,(agg.outSkuToday.get(r.sku)||0)+1);}
    if(r.dateKey===todayKey&&r.location)agg.locToday.set(r.location,(agg.locToday.get(r.location)||0)+1);
  });
  const topOut=getTopSku(agg.outSkuToday);
  const topLoc=getTopSku(agg.locToday);
  const stats=[
    `Hari ini ada <strong>${agg.inToday}</strong> barang masuk`,
    `Hari ini ada <strong>${agg.outToday}</strong> barang keluar`,
    topOut.sku?`SKU paling sering keluar hari ini adalah <strong>${safe(topOut.sku)}</strong>`:"SKU paling sering keluar hari ini belum tersedia",
    topLoc.sku?`Lokasi paling aktif hari ini adalah <strong>${safe(topLoc.sku)}</strong>`:"Lokasi paling aktif hari ini belum tersedia"
  ];

  return {empty:false,categories:[
    {title:"📦 Insight Terbaru",items:stats}
  ].filter(c=>c.items.length)};
}

export function getMovementSummary(totalMasuk,totalKeluar){
  if(totalMasuk<=0&&totalKeluar<=0)return "";
  if(totalMasuk<=0&&totalKeluar>0)return `Barang keluar tercatat <strong>${totalKeluar}</strong> qty, belum ada data masuk`;
  if(totalKeluar<=0)return `Barang masuk tercatat <strong>${totalMasuk}</strong> qty, belum ada data keluar`;
  const diff=Math.abs(totalKeluar-totalMasuk); if(diff===0)return "Pergerakan barang masuk dan keluar saat ini seimbang";
  const pct=Math.round((diff/Math.max(totalMasuk,1))*100);
  return totalKeluar>totalMasuk
    ?`Barang keluar lebih tinggi <strong>${pct}%</strong> dibanding barang masuk`
    :`Barang masuk lebih tinggi <strong>${pct}%</strong> dibanding barang keluar`;
}
export function getTopSku(map){let sku="",count=0;for(const [k,v] of map.entries()){if(v>count){sku=k;count=v;}}return {sku,count};}
export function getDailyPeak(dayMap){let date="",count=0;for(const [d,c] of dayMap.entries()){if(c>count){date=d;count=c;}}return {date,count};}
export function getStockMinusSummary(accuracyRows=[],anomalyRows=[]){
  const minusSku=new Set();
  accuracyRows.forEach(r=>{if((Number(r.stokBulky)||0)<0||(Number(r.stokRetail)||0)<0||(Number(r.stokGlobal)||0)<0||String(r.status||"").toLowerCase().includes("minus"))minusSku.add(String(r.sku||""));});
  anomalyRows.forEach(r=>{if(String(r.issue||"").toLowerCase().includes("qty keluar > qty masuk"))minusSku.add(String(r.sku||""));});
  return {minusSku:[...minusSku].filter(Boolean).length,anomalyTotal:anomalyRows.length};
}
export function getLocationSummary(accuracyRows=[]){
  const map=new Map();
  accuracyRows.forEach(r=>{const loc=r.lokasi||"-";const val=Math.abs(Number(r.selisih)||0);map.set(loc,(map.get(loc)||0)+val);});
  let loc="",val=0;for(const [k,v] of map.entries()){if(v>val){loc=k;val=v;}}
  return {text:loc?`<strong>${safe(loc)}</strong> memiliki selisih terbesar (<strong>${val}</strong>)`:""};
}

function toRows(rows,type){return rows.map(r=>({type,sku:getField(r,["sku"]),qty:num(getField(r,["qty"])),dateKey:normDate(getField(r,["tanggal","date","created at","waktu"])),location:getField(r,["lokasi","location","rak","bin","area"])})).filter(r=>r.dateKey&&r.sku);}
function getTodayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function getRelativeDateKeys(days){const out=[];for(let i=0;i<days;i++){const d=new Date();d.setDate(d.getDate()-i);out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);}return out;}
const getField=(r,keys)=>{const cols=Object.keys(r||{});for(const k of keys){const f=cols.find(c=>String(c||"").toLowerCase().includes(String(k).toLowerCase()));if(f&&r[f]!=null)return String(r[f]);}return "";};
const num=v=>{const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0;};
const normDate=s=>{const t=String(s||"").trim();if(!t)return "";const m=t.replace(/\./g,"/").replace(/-/g,"/").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;return `${y}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;}const d=new Date(t);return Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const fmtDate=d=>{const dt=new Date(`${d}T00:00:00`);return Number.isNaN(dt.getTime())?d:dt.toLocaleDateString("id-ID",{day:"numeric",month:"long"});};
const safe=v=>String(v||"").replace(/[&<>"]/g,"");
