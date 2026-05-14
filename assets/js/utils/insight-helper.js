export function buildAutoInsight(data,{movementRows=[],accuracyRows=[],anomalyRows=[]}={}){
  const masuk=data?.["Barang Masuk"]||[];
  const keluar=data?.["Barang Keluar"]||[];
  const kartu=data?.["Kartu Stock"]||[];
  if(!masuk.length&&!keluar.length&&!kartu.length&&!accuracyRows.length&&!anomalyRows.length)return {empty:true,categories:[]};

  const agg={inQty:0,outQty:0,day:new Map(),inSku:new Map(),outSku:new Map(),lastMove:new Map()};
  const rows=movementRows.length?movementRows:[...toRows(masuk,"Masuk"),...toRows(keluar,"Keluar")];
  rows.forEach(r=>{
    if(!r?.dateKey)return;
    const qty=Number(r.qty)||0;
    if(r.type==="Masuk")agg.inQty+=qty; else agg.outQty+=qty;
    if(r.type==="Masuk")agg.inSku.set(r.sku,(agg.inSku.get(r.sku)||0)+1); else agg.outSku.set(r.sku,(agg.outSku.get(r.sku)||0)+1);
    const d=agg.day.get(r.dateKey)||0; agg.day.set(r.dateKey,d+1);
    if(r.sku){const prev=agg.lastMove.get(r.sku)||""; if(!prev||r.dateKey>prev)agg.lastMove.set(r.sku,r.dateKey);}    
  });

  const topOut=getTopSku(agg.outSku); const peak=getDailyPeak(agg.day);
  const minusSummary=getStockMinusSummary(accuracyRows,anomalyRows);
  const locSummary=getLocationSummary(accuracyRows);
  const moveSummary=getMovementSummary(agg.inQty,agg.outQty);

  const inactiveSummary=getInactiveSummary(agg.lastMove);
  const stats=[
    moveSummary,
    peak.date?`Hari paling aktif adalah <strong>${fmtDate(peak.date)}</strong> dengan <strong>${peak.count}</strong> transaksi`:"",
    topOut.sku?`SKU paling sering keluar adalah <strong>${safe(topOut.sku)}</strong> (<strong>${topOut.count}</strong>x)`:"",
    inactiveSummary
  ].filter(Boolean);

  const masalah=[
    minusSummary.minusSku>0?`Terdapat <strong>${minusSummary.minusSku}</strong> SKU stok minus`:"",
    minusSummary.anomalyTotal>0?`Ditemukan <strong>${minusSummary.anomalyTotal}</strong> anomaly pada data`:""
  ].filter(Boolean);

  const lokasi=[locSummary.text].filter(Boolean);

  return {empty:false,categories:[
    {title:"📦 Movement",items:stats.slice(0,3)},
    {title:"⚠️ Masalah",items:masalah.slice(0,2)},
    {title:"📊 Statistik",items:stats.slice(3)},
    {title:"📍 Lokasi",items:lokasi}
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

function getInactiveSummary(lastMoveMap){
  const today=new Date(); let stale=0,total=0;
  for(const d of lastMoveMap.values()){total++; const dt=new Date(`${d}T00:00:00`); if(!Number.isNaN(dt.getTime())){const days=(today-dt)/86400000; if(days>=7)stale++;}}
  if(!total||!stale)return "";
  return `<strong>${Math.round((stale/total)*100)}%</strong> SKU tidak bergerak dalam <strong>7 hari</strong> terakhir`;
}
function toRows(rows,type){return rows.map(r=>({type,sku:getField(r,["sku"]),qty:num(getField(r,["qty"])),dateKey:normDate(getField(r,["tanggal","date","created at","waktu"]))})).filter(r=>r.dateKey&&r.sku);}
const getField=(r,keys)=>{const cols=Object.keys(r||{});for(const k of keys){const f=cols.find(c=>String(c||"").toLowerCase().includes(String(k).toLowerCase()));if(f&&r[f]!=null)return String(r[f]);}return "";};
const num=v=>{const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0;};
const normDate=s=>{const t=String(s||"").trim();if(!t)return "";const m=t.replace(/\./g,"/").replace(/-/g,"/").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;return `${y}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;}const d=new Date(t);return Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const fmtDate=d=>{const dt=new Date(`${d}T00:00:00`);return Number.isNaN(dt.getTime())?d:dt.toLocaleDateString("id-ID",{day:"numeric",month:"long"});};
const safe=v=>String(v||"").replace(/[&<>"]/g,"");
