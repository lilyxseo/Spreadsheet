const INSIGHT_CACHE={key:"",value:null};

export function buildAutoInsight(data,{movementRows=[],accuracyRows=[],anomalyRows=[],stokMinusRows=[],balikanRows=[],barangReject=null}={}){
  const input={
    masuk:data?.["Barang Masuk"]||[],keluar:data?.["Barang Keluar"]||[],kartu:data?.["Kartu Stock"]||[],rpl:data?.RPL||[],bulky:data?.BULKY||[],
    movementRows,accuracyRows,anomalyRows,stokMinusRows,balikanRows,barangReject
  };
  const key=hashInput(input);
  if(INSIGHT_CACHE.key===key&&INSIGHT_CACHE.value)return INSIGHT_CACHE.value;
  const now=new Date(), current=monthKey(now), prev=prevMonthKey(now);
  const inRows=normalizeRows(input.masuk,"in"), outRows=normalizeRows(input.keluar,"out");
  const moveRows=normalizeRows(input.movementRows,"move");
  const balRows=normalizeRows(input.balikanRows,"balikan");
  const rejectRows=[...normalizeRows(barangReject?.masuk||[],"reject"),...normalizeRows(barangReject?.keluar||[],"reject")];
  const stockRows=normalizeStockRows([...input.kartu,...input.rpl,...input.bulky]);
  const allMonthly=[...inRows,...outRows];
  if(!allMonthly.length&&!stockRows.length&&!moveRows.length&&!balRows.length&&!rejectRows.length&&!input.accuracyRows.length&&!input.anomalyRows.length){
    const empty={empty:true,cards:[],recommendations:[]}; INSIGHT_CACHE.key=key; INSIGHT_CACHE.value=empty; return empty;
  }

  const curIn=inRows.filter(r=>r.monthKey===current), prevIn=inRows.filter(r=>r.monthKey===prev);
  const curOut=outRows.filter(r=>r.monthKey===current), prevOut=outRows.filter(r=>r.monthKey===prev);
  const inQty=sum(curIn), outQty=sum(curOut), prevInQty=sum(prevIn), prevOutQty=sum(prevOut);
  const topOut=topSku(curOut), prevTopOutQty=sum(prevOut.filter(r=>r.sku===topOut.sku));
  const topIn=topSku(curIn), fastest=fastestSku(curIn,curOut,prevOut);
  const stockBySku=stockTotals(stockRows), lastOut=lastDateBySku(outRows);
  const low=lowStockRisks(stockBySku,curOut);
  const over=overstock(stockBySku,curOut);
  const dead=deadStock(stockBySku,lastOut,60,now);
  const locActive=topLocations([...curIn,...curOut]);
  const minus=stockMinus(input.accuracyRows,input.anomalyRows,input.stokMinusRows,stockRows);
  const curMove=moveRows.filter(r=>r.monthKey===current), prevMove=moveRows.filter(r=>r.monthKey===prev);
  const curBal=balRows.filter(r=>r.monthKey===current), prevBal=balRows.filter(r=>r.monthKey===prev);
  const curReject=rejectRows.filter(r=>r.monthKey===current), prevReject=rejectRows.filter(r=>r.monthKey===prev);
  const recommendations=buildRecommendations({topOut,low,over,dead,minus,locActive});
  const insights=selectImportantInsights([
    insightLine(100+Math.min(minus.count,50),"🚨","bad",minus.count>0,`Terdapat <strong>${fmt(minus.count)} SKU</strong> dengan stok minus${minus.location?`, paling sering terjadi di lokasi <strong>${safe(minus.location)}</strong>`:""}.`),
    insightLine(95+Math.min(low.length,50),"⚠️","warn",low.length>0,`Terdapat <strong>${fmt(low.length)} SKU</strong> yang diperkirakan habis dalam 7 hari ke depan${low[0]?.sku?`; prioritas ${toSkuDetailLink(low[0].sku)}`:""}.`),
    insightLine(82+Math.min(dead.length/10,30),"💤","warn",dead.length>0,`Sebanyak <strong>${fmt(dead.length)} SKU</strong> tidak bergerak selama 60 hari dengan stok tertahan <strong>${fmt(sumObj(dead,"qty"))} pcs</strong>.`),
    insightLine(78+Math.min(over.length/10,25),"📦","warn",over.length>0,`Sebanyak <strong>${fmt(over.length)} SKU</strong> memiliki stok tinggi tetapi pergerakan rendah; potensi dead stock <strong>${fmt(sumObj(over,"qty"))} pcs</strong>.`),
    insightLine(72,"🔥","good",!!topOut.sku,`SKU terlaris bulan ini adalah ${toSkuDetailLink(topOut.sku)} dengan total <strong>${fmt(topOut.qty)} pcs</strong> keluar (${trendText(topOut.qty,prevTopOutQty)}).`),
    insightLine(68,"⚡","good",!!fastest.sku,`Pergerakan tertinggi: ${toSkuDetailLink(fastest.sku)} — masuk <strong>${fmt(fastest.inQty)} pcs</strong>, keluar <strong>${fmt(fastest.outQty)} pcs</strong>, sell-through <strong>${fastest.sellThrough}%</strong>.`),
    insightLine(62,"📊",outQty>inQty?"warn":"good",inQty>0||outQty>0,`${movementText(inQty,outQty)} bulan ini. Masuk <strong>${fmt(inQty)} pcs</strong>, keluar <strong>${fmt(outQty)} pcs</strong>.`),
    insightLine(58,"📍","info",!!locActive.primary,`Lokasi paling aktif bulan ini adalah <strong>${locActive.primary}</strong>${locActive.detail?` (${locActive.detail})`:""}.`),
    insightLine(54+Math.min(curMove.length/20,20),"🔄","info",curMove.length>0,`Terdapat <strong>${fmt(curMove.length)} movement</strong> bulan ini${topField(curMove,"to")?`; tujuan tersering <strong>${safe(topField(curMove,"to"))}</strong>`:""}.`),
    insightLine(sum(curBal)>0?52:20,"↩️","info",true,sum(curBal)>0?`Balikan Store bulan ini mencapai <strong>${fmt(sum(curBal))} pcs</strong>${topField(curBal,"sheet")?`; sheet tertinggi <strong>${safe(topField(curBal,"sheet"))}</strong>`:""}.`:`Tidak ada aktivitas Balikan Store bulan ini.`),
    insightLine(sum(curReject)>0?50:0,"❌","bad",sum(curReject)>0,`Barang reject bulan ini <strong>${fmt(sum(curReject))} pcs</strong>${topField(curReject,"kategori")?`; kategori terbesar <strong>${safe(topField(curReject,"kategori"))}</strong>`:""}.`),
    insightLine(48,"🏆","info",curOut.length>0,`Top SKU keluar: ${rankSku(curOut,outQty).slice(0,3).map(x=>`${toSkuDetailLink(x.sku)} <strong>${fmt(x.qty)} pcs</strong> (${x.pct}%)`).join(", ")}.`),
    insightLine(46,"🏆","info",curIn.length>0,`Top SKU masuk: ${rankSku(curIn,inQty).slice(0,3).map(x=>`${toSkuDetailLink(x.sku)} <strong>${fmt(x.qty)} pcs</strong> (${x.pct}%)`).join(", ")}.`)
  ]);
  if(recommendations[0])insights.push(insightLine(110,"💡","info",true,`Rekomendasi: ${recommendations[0]}`));
  const important=pickMostImportant(insights);
  const result={empty:false,title:"💡 Auto Insight Bulanan",subtitle:"Insight otomatis berdasarkan aktivitas gudang bulan ini.",monthLabel:now.toLocaleDateString("id-ID",{month:"long",year:"numeric"}),important,insights,recommendations};
  INSIGHT_CACHE.key=key; INSIGHT_CACHE.value=result; return result;
}

export function getMovementSummary(totalMasuk,totalKeluar){if(totalMasuk<=0&&totalKeluar<=0)return "";const diff=Math.abs(totalKeluar-totalMasuk);const pct=Math.round((diff/Math.max(totalMasuk,1))*100);return totalKeluar>totalMasuk?`Barang keluar lebih tinggi <strong>${pct}%</strong> dibanding barang masuk`:totalKeluar<totalMasuk?`Barang masuk lebih tinggi <strong>${pct}%</strong> dibanding barang keluar`:"Pergerakan barang masuk dan keluar saat ini seimbang";}
export function getTopSkuByQty(map){let sku="",count=0;for(const [k,v]of map.entries())if(v>count){sku=k;count=v;}return{sku,count};}
export function getStockMinusSummary(accuracyRows=[],anomalyRows=[]){return{minusSku:stockMinus(accuracyRows,anomalyRows,[],[]).count,anomalyTotal:anomalyRows.length};}
export function getLocationSummary(accuracyRows=[]){const loc=topField(accuracyRows.map(r=>({lokasi:getField(r,["lokasi"]),qty:num(getField(r,["selisih"]))})),"lokasi");return{text:loc?`<strong>${safe(loc)}</strong> memiliki selisih terbesar`:""};}

const card=(icon,title,value,detail,trend,tone)=>({type:"card",icon,title,value,detail,trend,tone});
const rankingCard=(icon,title,items)=>({type:"ranking",icon,title,items,tone:"neutral"});
const normalizeRows=(rows,type)=>rows.map(r=>{const dateKey=normDate(getField(r,["tanggal","date","created_at","waktu","last update"]));return{raw:r,type,sku:getField(r,["sku","kode sku"]),qty:num(getField(r,["qty","quantity","pcs","jumlah"])),from:getField(r,["from","asal","lokasi"]),to:getField(r,["to","tujuan","lokasi"]),sheet:getField(r,["sheet","sheetName","trip"]),kategori:getField(r,["kategori","category","nama barang","namabarang"]),dateKey,monthKey:dateKey.slice(0,7)}}).filter(r=>r.sku||r.qty||r.dateKey);
const normalizeStockRows=rows=>rows.map(r=>({sku:getField(r,["sku"]),qty:num(getField(r,["stok akhir","closing stock","ending stock","saldo akhir","qty","stok","quantity"])),lokasi:getField(r,["lokasi","location","rak","bin","area"])})).filter(r=>r.sku);
function topSku(rows){const m=new Map();rows.forEach(r=>r.sku&&m.set(r.sku,(m.get(r.sku)||0)+r.qty));let sku="",qty=0;for(const[k,v]of m)if(v>qty){sku=k;qty=v;}return{sku,qty};}
function fastestSku(ins,outs,prevOuts=[]){const skus=new Set([...ins.map(r=>r.sku),...outs.map(r=>r.sku)].filter(Boolean));let best={sku:"",inQty:0,outQty:0,sellThrough:0,prevOutQty:0};skus.forEach(sku=>{const inQty=sum(ins.filter(r=>r.sku===sku)),outQty=sum(outs.filter(r=>r.sku===sku)),prevOutQty=sum(prevOuts.filter(r=>r.sku===sku));const score=inQty+outQty;if(score>(best.inQty+best.outQty))best={sku,inQty,outQty,sellThrough:inQty?Math.round(outQty/inQty*100):0,prevOutQty};});return best;}
const stockTotals=rows=>{const m=new Map();rows.forEach(r=>m.set(r.sku,{sku:r.sku,qty:(m.get(r.sku)?.qty||0)+r.qty,locations:[...(m.get(r.sku)?.locations||[]),r.lokasi].filter(Boolean)}));return[...m.values()];};
const lowStockRisks=(stock,outs)=>stock.map(s=>{const daily=sum(outs.filter(r=>r.sku===s.sku))/30;return{...s,days:daily?s.qty/daily:999};}).filter(s=>s.qty>0&&s.days<7).sort((a,b)=>a.days-b.days);
const overstock=(stock,outs)=>stock.filter(s=>s.qty>0&&sum(outs.filter(r=>r.sku===s.sku))<=Math.max(1,s.qty*.05)).sort((a,b)=>b.qty-a.qty);
const lastDateBySku=rows=>{const m=new Map();rows.forEach(r=>{if(r.sku&&r.dateKey&&(!m.get(r.sku)||r.dateKey>m.get(r.sku)))m.set(r.sku,r.dateKey);});return m;};
const deadStock=(stock,last,days,now)=>stock.filter(s=>s.qty>0&&((now-new Date(last.get(s.sku)||"2000-01-01"))/86400000)>days);
function topLocations(rows){const retail=topField(rows.filter(r=>clean(r.to||r.from).includes("ruang")||clean(r.to||r.from).includes("retail")),"to")||topField(rows,"to");const bulky=topField(rows.filter(r=>clean(r.to||r.from).includes("bulky")||clean(r.to||r.from).includes("area")),"to");return{primary:retail?`RETAIL: ${safe(retail)}`:"",detail:bulky?`BULKY: ${safe(bulky)}`:""};}
function stockMinus(acc,anom,rows,stock){const locs=[];const skus=new Set();stock.forEach(r=>{if(r.qty<0){skus.add(r.sku); if(r.lokasi)locs.push({lokasi:r.lokasi});}});[...acc,...anom,...rows].forEach(r=>{if(String(r.status||r.issue||"").toLowerCase().includes("minus")||num(getField(r,["stok","qty","stok global"]))<0){const sku=getField(r,["sku"]); if(sku)skus.add(sku); locs.push({lokasi:getField(r,["lokasi","location","area"])});}});return{count:skus.size,location:topField(locs,"lokasi")};}
const rankSku=(rows,total)=>{const m=new Map();rows.forEach(r=>r.sku&&m.set(r.sku,(m.get(r.sku)||0)+r.qty));return[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([sku,qty])=>({sku,qty,pct:total?Math.round(qty/total*100):0}));};
const buildRecommendations=o=>[o.topOut.sku&&`Restock SKU ${safe(o.topOut.sku)} jika tren keluar berlanjut.`,o.low[0]&&`Prioritaskan replenishment SKU ${safe(o.low[0].sku)} (risiko habis < 7 hari).`,o.over[0]&&`Review overstock SKU ${safe(o.over[0].sku)} dan redistribusi ke lokasi aktif.`,o.dead[0]&&`Audit dead stock SKU ${safe(o.dead[0].sku)} karena tidak bergerak > 60 hari.`,o.minus.count&&`Periksa stok minus${o.minus.location?` di ${safe(o.minus.location)}`:""}.`].filter(Boolean).slice(0,5);
const insightLine=(priority,icon,tone,show,text)=>show?{priority,icon,tone,text}:null;
const selectImportantInsights=items=>items.filter(Boolean).sort((a,b)=>b.priority-a.priority).slice(0,9).sort((a,b)=>a.icon==="💡"?1:b.icon==="💡"?-1:b.priority-a.priority);
const pickMostImportant=items=>{const top=items.filter(x=>x.icon!=="💡").sort((a,b)=>b.priority-a.priority)[0];return top?{icon:top.icon,tone:top.tone,text:stripLinks(top.text)}:null;};
const stripLinks=html=>String(html||"").replace(/<button[^>]*>(.*?)<\/button>/g,"$1").replace(/<[^>]+>/g,"");
const trendText=(cur,prev)=>{const t=trend(cur,prev);return t.label.toLowerCase()};
function movementText(inQty,outQty){if(outQty>inQty)return`Keluar lebih tinggi ${Math.round((outQty-inQty)/Math.max(inQty,1)*100)}%`;if(inQty>outQty)return`Masuk lebih tinggi ${Math.round((inQty-outQty)/Math.max(outQty,1)*100)}%`;return"Masuk dan keluar seimbang";}
const trend=(cur,prev,invert=false)=>{const diff=cur-prev,pct=prev?Math.round(Math.abs(diff)/Math.max(Math.abs(prev),1)*100):(cur?100:0);const up=diff>=0;return{label:`${up?"▲ Naik":"▼ Turun"} ${pct}% vs bulan lalu`,className:(up!==invert)?"good":"bad"};};
const topField=(rows,field)=>{const m=new Map();rows.forEach(r=>{const v=r?.[field]||getField(r,[field]);if(v)m.set(v,(m.get(v)||0)+(Number(r.qty)||1));});let k="",v=0;for(const[a,b]of m)if(b>v){k=a;v=b;}return k;};
const sum=rows=>rows.reduce((n,r)=>n+(Number(r.qty)||0),0); const sumObj=(rows,k)=>rows.reduce((n,r)=>n+(Number(r[k])||0),0);
const fmt=n=>new Intl.NumberFormat("id-ID").format(Math.round(Number(n)||0));
function hashInput(o){return JSON.stringify(Object.values(o).map(v=>Array.isArray(v)?[v.length,v[0],v[v.length-1]]:v&&typeof v==="object"?Object.keys(v).map(k=>[k,Array.isArray(v[k])?v[k].length:v[k]]):v));}
function getField(r,keys){if(Array.isArray(r)){const idx={tanggal:0,date:0,from:1,to:2,sku:3,"nama barang":4,namabarang:4,nama:4,item:4,description:4,qty:5,status:6,pic:7,keterangan:8,lokasi:1,sheet:9,kategori:4};for(const k of keys){const i=idx[String(k).toLowerCase()];if(Number.isInteger(i)&&r[i]!=null)return String(r[i]);}return"";}const cols=Object.keys(r||{});for(const k of keys){const f=cols.find(c=>clean(c).replace(/[_\s-]/g,"").includes(clean(k).replace(/[_\s-]/g,"")));if(f&&r[f]!=null)return String(r[f]);}return"";}
const num=v=>{const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0;};
function parseSheetDate(v){if(!v)return null;const s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}/.test(s)){const d=new Date(s);return isNaN(d)?null:d;}const p=s.split(/[\/\-]/);if(p.length===3){let a=+p[0],b=+p[1],y=+p[2];if(y<100)y+=2000;const d=new Date(y,b-1,a);return isNaN(d)?null:d;}const d=new Date(s);return isNaN(d)?null:d;}
const normDate=s=>{const d=parseSheetDate(s);return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`:"";};
const monthKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; const prevMonthKey=d=>{const x=new Date(d);x.setMonth(x.getMonth()-1);return monthKey(x);};
const safe=v=>String(v||"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m])); const clean=v=>String(v||"").toLowerCase().trim();
const toSkuDetailLink=sku=>{const v=String(sku||"").trim(),a=encodeURIComponent(v);return v?`<button class='btn-link' onclick="showDetail(decodeURIComponent('${a}'));navigateTo('/sku/'+encodeURIComponent(decodeURIComponent('${a}')))" style='padding:0;border:none;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit'><strong>${safe(v)}</strong></button>`:"-";};
