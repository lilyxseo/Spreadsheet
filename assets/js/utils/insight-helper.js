export function buildAutoInsight(data,{movementRows=[],accuracyRows=[],anomalyRows=[]}={}){
  const masuk=(data?.["Barang Masuk"]||[]).filter(r=>isMovementType(r,"receipt"));
  const keluar=(data?.["Barang Keluar"]||[]).filter(r=>isMovementType(r,"pengeluaran"));
  const kartu=data?.["Kartu Stock"]||[];
  if(!masuk.length&&!keluar.length&&!kartu.length&&!accuracyRows.length&&!anomalyRows.length)return {empty:true,categories:[]};

  const currentMonth=getCurrentMonthKey();
  const agg={inQty:0,outQty:0,inSku:new Set(),outSku:new Set(),inSkuQty:new Map(),outSkuQty:new Map()};
  const rows=(movementRows.length?movementRows:[...toRows(masuk,"Masuk"),...toRows(keluar,"Keluar")]).filter(r=>r?.dateKey&&r.monthKey===currentMonth);
  rows.forEach(r=>{
    const qty=Number(r.qty)||0;
    if(r.type==="Masuk")agg.inQty+=qty; else agg.outQty+=qty;
    if(r.type==="Masuk"){agg.inSku.add(r.sku);agg.inSkuQty.set(r.sku,(agg.inSkuQty.get(r.sku)||0)+qty);}
    else{agg.outSku.add(r.sku);agg.outSkuQty.set(r.sku,(agg.outSkuQty.get(r.sku)||0)+qty);}
  });

  const topOut=getTopSkuByQty(agg.outSkuQty);
  const topIn=getTopSkuByQty(agg.inSkuQty);
  const monthLabel=new Date().toLocaleDateString("id-ID",{month:"long",year:"numeric"});
  const diff=agg.inQty-agg.outQty;
  const items=[
    `Barang Masuk bulan ini (${monthLabel}) total <strong>${agg.inSku.size}</strong> SKU / <strong>${agg.inQty}</strong> qty`,
    `Barang Keluar bulan ini (${monthLabel}) total <strong>${agg.outSku.size}</strong> SKU / <strong>${agg.outQty}</strong> qty`,
    topOut.sku?`SKU paling sering keluar bulan ini adalah <strong>${safe(topOut.sku)}</strong> dengan total <strong>${topOut.count}</strong> pcs`:"Belum ada data barang keluar bulan ini",
    topIn.sku?`SKU paling sering masuk bulan ini adalah <strong>${safe(topIn.sku)}</strong> dengan total <strong>${topIn.count}</strong> pcs`:"Belum ada data barang masuk bulan ini",
    `Selisih qty masuk vs keluar bulan ini: <strong>${diff}</strong>`
  ];
  return {empty:false,categories:[{title:"📦 Auto Insight Bulanan",items}]};
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
export function getTopSkuByQty(map){let sku="",count=0;for(const [k,v] of map.entries()){if(v>count){sku=k;count=v;}}return {sku,count};}
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

function toRows(rows,type){return rows.map(r=>({type,sku:getField(r,["sku"]),qty:num(getField(r,["qty"])),dateKey:normDate(getField(r,["tanggal","date","created at","waktu"]))})).filter(r=>r.dateKey&&r.sku).map(r=>({...r,monthKey:r.dateKey.slice(0,7)}));}
function isMovementType(row,expected){return clean(getField(row,["keterangan","description","tipe"]))===clean(expected);}
function getCurrentMonthKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
const getField=(r,keys)=>{const cols=Object.keys(r||{});for(const k of keys){const f=cols.find(c=>String(c||"").toLowerCase().includes(String(k).toLowerCase()));if(f&&r[f]!=null)return String(r[f]);}return "";};
const num=v=>{const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0;};
const normDate=s=>{const t=String(s||"").trim();if(!t)return "";const m=t.replace(/\./g,"/").replace(/-/g,"/").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;return `${y}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;}const d=new Date(t);return Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const safe=v=>String(v||"").replace(/[&<>"]/g,"");
const clean=v=>String(v||"").toLowerCase().trim();
