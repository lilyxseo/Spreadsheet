import { API_KEY, SPREADSHEET_ID, SHEETS, FILTERS } from "./config.js";
const ids=["searchInput","sortSearch","statsFilter","darkBtnHeader","openSidebar","closeSidebar","sidebarOverlay","sheetInfo","spreadsheetInfo","dashboardCards","recentMove","statsCards","statsChart","financeSummary","financeTrendChart","loadedState","countPerSheet","filterRow","lastSync","settingsApiState","sidebarApi","detail","locationsSummary","locSearchInput","locSkuSearchInput","locStatusFilter","locSort","locPageSize","locationsTable","locationDetail","inSearch","inSummary","inResults","outSearch","outSummary","outResults","inFiltersToggle","outFiltersToggle","anomalySummary","anomalySeverity","anomalyType","anomalySearch","anomalyTable"];
ids.forEach(id=>window[id]=document.getElementById(id));
const statusEl=document.getElementById("status");
console.log("CONFIG", API_KEY, SPREADSHEET_ID, SHEETS);
const CACHE_KEYS={lastSync:"inventory_last_sync",version:"inventory_cache_version",searchHistory:"inventory_recent_search"};
const CACHE_VERSION="2";
const IDB_NAME="inventory_cache_db";
const IDB_VERSION=1;
const IDB_STORE="sheets";
const DATA = {}; let CACHE_SKU = new Map(); let currentFilter="Semua", lastResults=[], lastQuery="", apiConnected=false, currentSku="", isSyncing=false, searchModalOpen=false, prevRouteBeforeSearch="/";
window.addEventListener("DOMContentLoaded",()=>{applyTheme();bindNav();bindEvents();setupSidebar();renderFilters();initDashboard();document.getElementById("sheetInfo").textContent=SHEETS.join(", ");document.getElementById("spreadsheetInfo").textContent=SPREADSHEET_ID;initAppData();renderRecentHistory();routeFromPath(location.pathname);if(window.lucide)lucide.createIcons();window.addEventListener("popstate",()=>routeFromPath(location.pathname));});
function bindNav(){document.querySelectorAll(".side-link").forEach(btn=>btn.addEventListener("click",()=>navigateTo(btn.dataset.route)));}
function bindEvents(){const d=debounce(()=>runSearch(),250);searchInput.addEventListener("input",d);sortSearch.addEventListener("change",()=>renderResults(lastResults,lastQuery));statsFilter.addEventListener("change",updateStats);darkBtnHeader.addEventListener("click",toggleDark);const din=debounce(()=>renderDataTablePage("in","Barang Masuk"),250),dout=debounce(()=>renderDataTablePage("out","Barang Keluar"),250);inSearch?.addEventListener("input",din);outSearch?.addEventListener("input",dout);document.addEventListener("change",e=>{const t=e.target;if(t?.matches("[data-mv-filter]")){const m=t.dataset.mvMode;debouncedTableRender(m);}});anomalySeverity?.addEventListener("change",()=>renderAnomalyPage());
searchInput.addEventListener("focus",()=>{if(!searchModalOpen)openSearchModal();});
window.addEventListener("keydown",handleSearchShortcuts);
const clearHistoryBtn=document.getElementById("clearSearchHistory");
clearHistoryBtn?.addEventListener("click",clearSearchHistory);
document.getElementById("recentSearch")?.addEventListener("click",e=>{const btn=e.target.closest("[data-history]");if(!btn)return;searchInput.value=decodeURIComponent(btn.dataset.history||"");runSearch();});
anomalyType?.addEventListener("change",()=>renderAnomalyPage());anomalySearch?.addEventListener("input",debounce(()=>renderAnomalyPage(),180));
document.addEventListener("click",e=>{const btn=e.target.closest("[data-mv-action]");if(!btn)return;const mode=btn.dataset.mvMode;const action=btn.dataset.mvAction;if(action==="reset")return resetMovementFilter(mode);if(action==="export")return exportFilteredCsv(mode);if(action==="prev"||action==="next")return paginateRows(mode,action);if(action==="toggle-filter"){document.getElementById(`mv-filters-${mode}`)?.classList.toggle("open");}if(action==="columns"){document.getElementById(`mv-cols-${mode}`)?.classList.toggle("open");}});}
function showPage(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));document.getElementById(`page-${page}`).classList.remove("hidden");document.querySelectorAll(".side-link").forEach(b=>b.classList.toggle("active",b.dataset.page===page));closeSidebarMobile();if(!window.__isDataReady){console.log("DATA READY", window.__isDataReady);return;}rerenderCurrentPage();}
function navigateTo(path){history.pushState({},"",path);routeFromPath(path);}
function navigateToSku(sku){const cleanSku=String(sku||"" ).trim();if(!cleanSku)return;navigateTo(`/sku/${encodeURIComponent(cleanSku)}`);}
function goBackToPreviousPage(){if(window.history.length>1){window.history.back();return;}navigateTo('/search');}
function routeFromPath(path){if(path==="/")return showPage("dashboard");if(path==="/search")return showPage("search");if(path==="/barang-masuk")return showPage("barang-masuk");if(path==="/barang-keluar")return showPage("barang-keluar");if(path==="/accuracy-dashboard")return showPage("stats");if(path==="/statistics")return showPage("statistics");if(path==="/locations"||path==="/location")return showPage("locations");if(path==="/settings")return showPage("settings");if(path==="/anomaly")return showPage("anomaly");if(path.startsWith("/sku/")){currentSku=decodeURIComponent(path.split("/sku/")[1]||"");if(currentSku)showDetail(currentSku);return showPage("detail");}showPage("dashboard");}
function setupSidebar(){openSidebar.onclick=()=>document.body.classList.add("sidebar-open");closeSidebar.onclick=()=>closeSidebarFn();sidebarOverlay.onclick=()=>closeSidebarFn();}
function closeSidebarFn(){document.body.classList.remove("sidebar-open");}
function closeSidebarMobile(){if(window.innerWidth<900)closeSidebarFn();}
async function openCacheDb(){
return await new Promise((resolve,reject)=>{
const req=indexedDB.open(IDB_NAME,IDB_VERSION);
req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE,{keyPath:"sheet"});};
req.onsuccess=()=>resolve(req.result);
req.onerror=()=>reject(req.error||new Error("Gagal membuka IndexedDB"));
});
}
async function loadCache(){
try{
const db=await openCacheDb();
const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(IDB_STORE,"readonly");const rq=tx.objectStore(IDB_STORE).getAll();rq.onsuccess=()=>resolve(rq.result||[]);rq.onerror=()=>reject(rq.error);});
const parsed={};
for(const sheet of SHEETS){const hit=rows.find(r=>r.sheet===sheet);parsed[sheet]=Array.isArray(hit?.rows)?hit.rows:[];}
return parsed;
}catch(err){console.warn("IndexedDB load failed, fallback ke fetch API langsung", err);return null;}
}
async function saveCache(data){
try{
const db=await openCacheDb();
await new Promise((resolve,reject)=>{const tx=db.transaction(IDB_STORE,"readwrite");const st=tx.objectStore(IDB_STORE);for(const sheet of SHEETS){st.put({sheet,rows:Array.isArray(data?.[sheet])?data[sheet]:[],updatedAt:Date.now(),version:CACHE_VERSION});}tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});
localStorage.setItem(CACHE_KEYS.lastSync,String(Date.now()));
localStorage.setItem(CACHE_KEYS.version,CACHE_VERSION);
}catch(err){console.warn("IndexedDB save failed", err); }
}
function isCacheFresh(){const ts=Number(localStorage.getItem(CACHE_KEYS.lastSync)||0);return !!ts;}
function hasValidData(data){
return data && typeof data==="object" && Object.keys(data).some(key=>Array.isArray(data[key])&&data[key].length>0);
}
async function clearCache(){
try{const db=await openCacheDb();await new Promise((resolve,reject)=>{const tx=db.transaction(IDB_STORE,"readwrite");const rq=tx.objectStore(IDB_STORE).clear();rq.onsuccess=()=>resolve(true);rq.onerror=()=>reject(rq.error);});}catch(_){}
localStorage.removeItem(CACHE_KEYS.lastSync);localStorage.removeItem(CACHE_KEYS.version);
}
function applyData(newData,{fromCache=false,deferRender=true}={}){
for(const sheet of SHEETS)DATA[sheet]=Array.isArray(newData?.[sheet])?newData[sheet]:[];
console.log("STATE DATA", DATA);
const hasAnyData = SHEETS.some(sheet => (DATA[sheet]||[]).length>0);
window.__isDataReady = hasAnyData;
console.log("DATA READY", window.__isDataReady);
rebuildSkuCache();
apiConnected=true;
updateApiState();
updateSyncTime();
updateSettings();
if(deferRender){scheduleUIWork(()=>rerenderCurrentPage({fromCache}));return;}
rerenderCurrentPage({fromCache});
}

function scheduleUIWork(cb){
const runner=()=>setTimeout(cb,16);
if(typeof window.requestIdleCallback==="function")return window.requestIdleCallback(runner,{timeout:120});
return setTimeout(cb,16);
}
function getActivePage(){
const active=document.querySelector(".page:not(.hidden)");
return active?.id?.replace("page-","")||"dashboard";
}
function rerenderCurrentPage({fromCache=false}={}){
const page=getActivePage();
if(page==="dashboard")updateDashboard();
if(page==="stats")updateStats();
if(page==="statistics")renderFinanceStatistics();
if(page==="locations")renderLocationsPage();
if(page==="detail"&&currentSku)showDetail(currentSku);
if(page==="search"&&String(lastQuery||"").trim())runSearch();
if(page==="barang-masuk")renderDataTablePage("in","Barang Masuk",true);
if(page==="barang-keluar")renderDataTablePage("out","Barang Keluar",true);
if(page==="anomaly")renderAnomalyPage();
if(fromCache)setStatus("loading","Data dari cache");
}
async function syncData({force=false,silent=true}={}){
if(isSyncing)return false;
isSyncing=true;
updateSyncUI();
if(!force&&!silent&&Object.keys(DATA).length===0){setStatus("loading","Memuat data dari Google Sheets...");showSkeleton();}
if(silent)setStatus("loading","Sinkronisasi...");
const freshData={};
try{
for(const sheet of SHEETS){
const raw=await fetchSheet(sheet);
await new Promise(resolve=>scheduleUIWork(resolve));
freshData[sheet]=parseSheet(raw, sheet);
console.log("FETCH RESULT", sheet, raw);
console.log("PARSED DATA", sheet, freshData[sheet].length);
}
applyData(freshData,{deferRender:true});
await saveCache(freshData);
setStatus("ok","");
toast("Data diperbarui","success");
return true;
}catch(err){
apiConnected=false;updateApiState();
const hasCache=!!(await loadCache());
if(hasCache){setStatus("error","Gagal sync, memakai cache");return false;}
setStatus("error","Gagal memuat data: "+err.message);renderError("results","Data belum berhasil dimuat");renderState("dashboardCards","Data belum berhasil dimuat");throw err;
}finally{
isSyncing=false;
updateSyncUI();
hideInitialLoader();
}
}
async function initAppData(){
console.log("INIT APP START");
console.log("CURRENT ROUTE", location.pathname);
const cachedData=await loadCache();
console.log("CACHE DATA", cachedData);
if(hasValidData(cachedData)){
applyData(cachedData,{fromCache:true});
hideInitialLoader();
rerenderCurrentPage({fromCache:true});
return;
}
try{
await syncData({force:true,silent:false});
}catch(err){
console.warn("Fallback fetch gagal", err);
}
if(!window.__isDataReady){
setStatus("error","Data belum siap dimuat");
}
}
async function loadAllData(manual=true,silent=false){return syncData({force:!!manual,silent:!!silent});}
async function fetchSheet(sheetName){const range=`${sheetName}!A1:ZZ`;const url=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;const res=await fetch(url);const json=await res.json();if(!res.ok||json.error) throw new Error(`${sheetName}: ${(json.error&&json.error.message)||res.statusText}`);return json.values||[];}
function parseSheet(values){if(!Array.isArray(values)||!values.length)return[];const h=detectHeaderIndex(values);if(h<0)return[];const headers=values[h].map((v,i)=>normalizeHeader(v)||`col_${i+1}`);const rows=[];for(let r=h+1;r<values.length;r++){const row=values[r]||[];if(!row.length||row.every(c=>!String(c||"").trim()))continue;const obj={};headers.forEach((k,i)=>obj[k]=row[i]||"");rows.push(obj);}return rows;}
function detectHeaderIndex(values){const req=["sku","nama","nama barang","item","description","qty","tanggal","from","to","lokasi"];let bi=-1,bs=0;for(let i=0;i<Math.min(values.length,25);i++){const t=(values[i]||[]).map(clean).join("|");let s=0;req.forEach(k=>t.includes(clean(k))&&s++);if(s>bs){bs=s;bi=i;}}return bs>=1?bi:-1;}
function rebuildSkuCache(){CACHE_SKU=new Map();for(const sheet of SHEETS){for(const row of DATA[sheet]||[]){const sku=getVal(row,["sku"]);const name=getVal(row,["nama barang","nama","item","description"]);const key=clean(sku||name);if(!key)continue;if(!CACHE_SKU.has(key))CACHE_SKU.set(key,{sku:sku||"-",nama:name||"-",sources:new Set(),rows:[]});const it=CACHE_SKU.get(key);it.sources.add(sheet);it.rows.push({sheet,row});}}}
function runSearch(){const qRaw=searchInput.value||"";const q=clean(qRaw);lastQuery=qRaw;if(!q){lastResults=[];renderRecentHistory();return renderState("results","Masukkan kata kunci pencarian.");}saveRecentSearch(qRaw);const words=q.split(" ").filter(Boolean);const isMultiWord=words.length>1;const out=[];for(const it of CACHE_SKU.values()){if(currentFilter!=="Semua"&&!it.sources.has(currentFilter))continue;const skuRaw=String(it.sku||"");const skuN=clean(skuRaw),nameN=clean(it.nama);const descriptions=(it.rows||[]).map(x=>getVal(x?.row,["description","item name","item","nama barang","nama"])).filter(Boolean).join(" ");const combined=clean(`${skuRaw} ${it.nama||""} ${descriptions}`);if(isMultiWord){const allWordsMatch=words.every(word=>combined.includes(word));if(!allWordsMatch)continue;}let rank=99;if(skuN===q)rank=1;else if(/^\d{4}$/.test(q)&&skuRaw.replace(/\D/g,"").endsWith(q))rank=2;else if(skuN.includes(q))rank=3;else if(nameN===q)rank=4;else if(words.length&&words.every(w=>combined.includes(w)))rank=5;else if(!isMultiWord&&words.some(w=>combined.includes(w)))rank=6;if(rank<99)out.push({...it,sources:[...it.sources],rank});}lastResults=out.sort((a,b)=>a.rank-b.rank||a.sku.localeCompare(b.sku)).slice(0,50);renderResults(lastResults,qRaw);}

function renderResults(items,query){if(sortSearch.value==="sku")items=[...items].sort((a,b)=>a.sku.localeCompare(b.sku));if(sortSearch.value==="name")items=[...items].sort((a,b)=>a.nama.localeCompare(b.nama));if(!items.length) return renderState("results","Data tidak ditemukan.");const resultsEl=`<div class='subtitle'>${items.length} hasil (maks 50).</div><div class='result-list'>`+items.map(r=>`<div class='result-card'><div class='result-head'><div><strong>${highlight(r.nama,query)}</strong><div>SKU: ${highlight(r.sku,query)}</div></div><div>${r.sources.map(s=>`<span class='badge ${badgeClass(s)}'>${esc(s)}</span>`).join(" ")}</div></div><div class='row'><button class='btn-ghost' onclick="copySku(decodeURIComponent('${encAttr(r.sku)}'))">Copy SKU</button><button class='btn-primary' onclick="showDetail(decodeURIComponent('${encAttr(r.sku)}'));navigateTo('/sku/'+encodeURIComponent(decodeURIComponent('${encAttr(r.sku)}')))">Lihat Detail</button></div></div>`).join("")+"</div>";document.getElementById("results").innerHTML=resultsEl;}
function showDetail(identifier){const key=clean(identifier);const sel=[...CACHE_SKU.values()].find(r=>clean(r.sku)===key||clean(r.nama)===key);if(!sel) return renderState("detail","Detail tidak tersedia.");
const sku=sel.sku,nama=sel.nama;const bySheet={};SHEETS.forEach(sheet=>{bySheet[sheet]=(DATA[sheet]||[]).filter(r=>clean(getVal(r,["sku"]))===clean(sku));});
const inRows=bySheet["Barang Masuk"]||[],outRows=bySheet["Barang Keluar"]||[];
const tIn=inRows.reduce((n,r)=>n+parseNumber(getVal(r,["qty"])),0),tOut=outRows.reduce((n,r)=>n+parseNumber(getVal(r,["qty"])),0);
const tAvailable=tIn-tOut;
const locationSet=new Set();
for(const r of (bySheet["Kartu Stock"]||[])){const stokAkhir=parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"]));if(stokAkhir<=0)continue;for(const k of Object.keys(r||{})){const nk=clean(k);if(["lokasi","location","rak","bin","area"].some(x=>nk.includes(x))){const v=r[k];if(v)locationSet.add(String(v).trim());}}}
const summary=[["Baris Kartu Stock",bySheet["Kartu Stock"].length],["Baris RPL",bySheet["RPL"].length],["Baris BULKY",bySheet["BULKY"].length],["Total Qty Masuk",tIn],["Total Qty Keluar",tOut],["Total Qty Tersedia",tAvailable]];
const sourceList=Array.isArray(sel.sources)?sel.sources:[...sel.sources||[]];
let html=`<div class='detail-profile'><div class='detail-hero'><div class='detail-top'><div><div class='detail-name'>${esc(nama)}</div><div class='detail-sku'>SKU: <strong>${esc(sku)}</strong> <button class='btn-ghost' onclick="copySku(decodeURIComponent('${encAttr(sku)}'))">Copy SKU</button></div></div><button class='btn-primary' onclick="goBackToPreviousPage()">Kembali ke hasil pencarian</button></div><div class='source-row'>${sourceList.map(s=>`<span class='badge ${badgeClass(s)}'>${esc(s)}</span>`).join(" ")}</div></div>`;
html+=`<div class='summary-grid'>${summary.map(([k,v])=>`<div class='summary-card'><div class='k'>${k}</div><div class='v'>${esc(v)}</div></div>`).join("")}</div>`;
html+=`<div class='detail-note'><div class='note-box'><div class='note-title'>Lokasi</div><div class='note-value'>${locationSet.size?[...locationSet].slice(0,12).map(esc).join(", "):"-"}</div></div></div>`;
for(const sheet of SHEETS){const rows=bySheet[sheet];html+=`<details class='source-card' ${rows.length?'open':''}><summary><span><span class='badge ${badgeClass(sheet)}'>${sheet}</span></span><span>${rows.length} baris</span></summary><div class='source-body'>${renderTable(rows)}</div></details>`;}
html+="</div>";detail.innerHTML=html;}
function renderTable(rows,page=1,pageSize=25){if(!rows.length) return `<div class='empty-card'><strong>Data kosong</strong><div>Tidak ada baris untuk sumber ini.</div></div>`;const headers=Object.keys(rows[0]);const safeSize=[25,50,100].includes(Number(pageSize))?Number(pageSize):25;const maxPage=Math.max(1,Math.ceil(rows.length/safeSize));const safePage=Math.min(maxPage,Math.max(1,Number(page)||1));const pageRows=rows.slice((safePage-1)*safeSize,safePage*safeSize);let h=`<div class='table-wrap'><table><thead><tr>${headers.map(x=>`<th>${esc(String(x).toUpperCase())}</th>`).join("")}</tr></thead><tbody>`;pageRows.forEach(r=>h+=`<tr>${headers.map(k=>`<td>${esc(r[k])}</td>`).join("")}</tr>`);h+=`</tbody></table></div><div class='mv-pagination'><span>Menampilkan ${rows.length?((safePage-1)*safeSize+1):0}–${Math.min(safePage*safeSize,rows.length)} dari ${rows.length} data</span></div>`;return h;}
function updateDashboard(){const skuSet=new Set();const totals={};SHEETS.forEach(s=>{totals[s]=(DATA[s]||[]).length;if(s==="Barang Masuk")totals[s]=(DATA[s]||[]).filter(r=>clean(getVal(r,["sku"]))).length;(DATA[s]||[]).forEach(r=>{const sku=getVal(r,["sku"]);if(sku)skuSet.add(clean(sku));});});
const lokasiTerpakaiSet=new Set();(DATA["Kartu Stock"]||[]).forEach(r=>{const lokasiRaw=getVal(r,["lokasi","location","rak","bin","area"]);const stokAkhir=parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"]));if(!lokasiRaw||stokAkhir<=0)return;const parsed=parseLocationCode(lokasiRaw);if(parsed.valid&&!parsed.blocked)lokasiTerpakaiSet.add(parsed.raw);});
const TOTAL_LOKASI_AKTIF=getAllValidLocations().length,lokasiTerpakai=lokasiTerpakaiSet.size,lokasiTersisa=Math.max(TOTAL_LOKASI_AKTIF-lokasiTerpakai,0);
const cards=[["Total SKU",skuSet.size],["Baris Kartu Stock",totals["Kartu Stock"]],["Baris RPL",totals["RPL"]],["Baris BULKY",totals["BULKY"]],["Barang Masuk",totals["Barang Masuk"]],["Barang Keluar",totals["Barang Keluar"]],["Lokasi terpakai",lokasiTerpakai],["Lokasi tersisa",lokasiTersisa]];
dashboardCards.innerHTML=cards.map(c=>`<div class='metric'><div class='k'>${c[0]}</div><div class='v'>${c[1]}</div></div>`).join("");
const inRows=getLatestRows("Barang Masuk",50,true),outRows=getLatestRows("Barang Keluar",50);
recentMove.innerHTML=`<div class='dashboard-sections'>
${renderDashboardTableSection("Barang Masuk","Data terbaru dari sheet Barang Masuk",inRows,"b-in")}
${renderDashboardTableSection("Barang Keluar","Data terbaru dari sheet Barang Keluar",outRows,"b-out")}
</div>`;}
function getLatestRows(sheetName,limit=50,requireSku=false){let rows=(DATA[sheetName]||[]).slice();if(requireSku)rows=rows.filter(r=>clean(getVal(r,["sku"])));return rows.reverse().slice(0,limit);}
function renderDashboardTableSection(title,subtitle,rows,badgeClassName){const badgeText=`${rows.length} terbaru`;return `<section class='dashboard-section'><div class='card'><div class='section-header'><div><h4>${esc(title)}</h4><small class='section-subtitle'>${esc(subtitle)}</small></div><span class='badge ${badgeClassName}'>${esc(badgeText)}</span></div>${renderDashboardSheetTable(rows,title)}</div></section>`;}
function renderDashboardSheetTable(rows,title){if(!rows.length)return `<div class='empty-card'><strong>Data kosong</strong><div>Belum ada data pada section ${esc(title)}.</div></div>`;const headers=[];rows.forEach(row=>Object.keys(row||{}).forEach(k=>{if(!headers.includes(k))headers.push(k);}));const th=headers.map(h=>`<th>${esc(String(h).toUpperCase())}</th>`).join("");const tr=rows.map(row=>`<tr>${headers.map(k=>`<td>${esc(row[k]??"")}</td>`).join("")}</tr>`).join("");return `<div class='table-scroll'><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;}
function normMv(row,type,sheet){
const sku=getVal(row,["sku"])||"-";
const nama=getVal(row,["nama barang","nama","item","description"])||"-";
const qty=parseNumber(getVal(row,["qty"]));
const tanggal=getVal(row,["tanggal","date","created at","waktu"])||"-";
return{sku,nama,qty,tanggal,type,sheet,row};
}
const STATS_STATE={page:1,pageSize:25,q:"",sort:"absDesc"};
function updateStats(){
const rows=[...(DATA["RPL"]||[]),...(DATA["BULKY"]||[])].filter(r=>clean(getVal(r,["sku"])));
if(!rows.length){statsCards.innerHTML="";statsChart.innerHTML="<div class='state'>Sheet RPL/BULKY belum ada data.</div>";return;}
const norm=rows.map(r=>{const sel=parseNumber(getVal(r,["selisih","selisih kartu stok","selisih kartu stock","selisih kartu stok vs iseller","selisih kartu stok vs netsuite"]));const iseller=parseNumber(getVal(r,["stok iseller","iseller"]));const netsuite=parseNumber(getVal(r,["stok netsuite","netsuite"]));return{lokasi:getVal(r,["lokasi"])||"-",sku:getVal(r,["sku"])||"-",nama:getVal(r,["nama barang","nama"])||"-",stokBulky:parseNumber(getVal(r,["stok bulky"])),stokRetail:parseNumber(getVal(r,["stok retail"])),stokGlobal:parseNumber(getVal(r,["stok global","kartu stok","stok kartu","stok kartu stok"])),iseller,netsuite,selisih:sel,status:getVal(r,["status"])||"-",selisihAbs:Math.abs(sel),nsIseller:getVal(r,["ns dan iseller","iseller vs netsuite"])||"-"};});
const totalSku=norm.length,skuAkurat=norm.filter(r=>r.selisih===0).length,skuTidakAkurat=totalSku-skuAkurat,akurasi=totalSku?((skuAkurat/totalSku)*100):0,selisihTotal=norm.reduce((n,r)=>n+r.selisih,0);
statsCards.innerHTML=[["Total SKU",totalSku,""],["Akurat (%)",`${akurasi.toFixed(2)}%`,"ok"],["Tidak Akurat",skuTidakAkurat,"err"],["Selisih Total",selisihTotal,"warn"]].map(c=>`<div class='metric ${c[2]||""}'><div class='k'>${c[0]}</div><div class='v'>${esc(c[1])}</div></div>`).join("");
const grouped={sama:0,isellerLebihBesar:0,netsuiteLebihBesar:0,tidakAdaStock:0,plusMinus:0};
norm.forEach(r=>{const s=clean(`${r.status} ${r.nsIseller}`);if(s.includes("tidak ada stock"))grouped.tidakAdaStock++;else if(s.includes("plus")||s.includes("minus"))grouped.plusMinus++;else if(s.includes("iseller lebih besar"))grouped.isellerLebihBesar++;else if(s.includes("netsuite lebih besar"))grouped.netsuiteLebihBesar++;else if(s.includes("sama")||r.selisih===0)grouped.sama++;});
const topSelisih=[...norm].sort((a,b)=>b.selisihAbs-a.selisihAbs).slice(0,10);
const byLoc={};norm.forEach(r=>{const k=r.lokasi||"-";if(!byLoc[k])byLoc[k]={lokasi:k,jumlah:0,totalSelisih:0,akurasi:0};byLoc[k].jumlah++;byLoc[k].totalSelisih+=Math.abs(r.selisih);if(r.selisih===0)byLoc[k].akurasi++;});
const locRows=Object.values(byLoc).map(x=>({...x,persenAkurat:x.jumlah?((x.akurasi/x.jumlah)*100):0}));
const worstLoc=[...locRows].sort((a,b)=>b.totalSelisih-a.totalSelisih)[0],bestLoc=[...locRows].sort((a,b)=>b.persenAkurat-a.persenAkurat)[0];
const mismatchIsellerNetsuite=norm.filter(r=>r.iseller!==r.netsuite).length,selisihSystemTotal=norm.reduce((n,r)=>n+Math.abs(r.iseller-r.netsuite),0),isellerLebihBesar=norm.filter(r=>r.iseller>r.netsuite).length;
if(statsFilter&&statsFilter.options.length<=1){const options=["",...new Set(norm.map(r=>r.status).filter(Boolean))];statsFilter.innerHTML=options.map(v=>`<option value="${encAttr(v)}">${esc(v||"Semua Status")}</option>`).join("");}
const statusFilter=decodeURIComponent(statsFilter?.value||"");
const q=clean(STATS_STATE.q||"");
let tableRows=norm.filter(r=>(!statusFilter||r.status===statusFilter)&&(!q||clean(`${r.sku} ${r.nama} ${r.lokasi}`).includes(q)));
const sorter={absDesc:(a,b)=>b.selisihAbs-a.selisihAbs,absAsc:(a,b)=>a.selisihAbs-b.selisihAbs,sku:(a,b)=>a.sku.localeCompare(b.sku)};
tableRows=[...tableRows].sort(sorter[STATS_STATE.sort]||sorter.absDesc);
const maxPage=Math.max(1,Math.ceil(tableRows.length/STATS_STATE.pageSize));if(STATS_STATE.page>maxPage)STATS_STATE.page=maxPage;
const paged=tableRows.slice((STATS_STATE.page-1)*STATS_STATE.pageSize,STATS_STATE.page*STATS_STATE.pageSize);
const insight=[`${akurasi.toFixed(1)}% SKU sudah akurat`,`Lokasi ${worstLoc?.lokasi||"-"} memiliki selisih terbesar`,`Terdapat ${mismatchIsellerNetsuite} SKU dengan perbedaan Iseller vs Netsuite`];
statsChart.innerHTML=`<div class='summary-grid stats-breakdown-grid'>${Object.entries({"SAMA":grouped.sama,"ISELLER LEBIH BESAR":grouped.isellerLebihBesar,"NETSUITE LEBIH BESAR":grouped.netsuiteLebihBesar,"TIDAK ADA STOCK":grouped.tidakAdaStock,"PLUS / MINUS":grouped.plusMinus}).map(([k,v])=>`<div class='summary-card'><div class='k'>${esc(k)}</div><div class='v'>${v} (${totalSku?((v/totalSku)*100).toFixed(1):0}%)</div></div>`).join("")}</div>
<div class='stats-insight-grid'><div class='metric warn'><div class='k'>Top Lokasi Bermasalah</div><div class='v'>${esc(worstLoc?.lokasi||"-")} (${worstLoc?.totalSelisih||0})</div></div><div class='metric ok'><div class='k'>Lokasi Paling Akurat</div><div class='v'>${esc(bestLoc?.lokasi||"-")} (${bestLoc?.persenAkurat?.toFixed(1)||0}%)</div></div><div class='metric warn'><div class='k'>Selisih Iseller vs Netsuite</div><div class='v'>${selisihSystemTotal} • mismatch ${mismatchIsellerNetsuite}</div></div><div class='metric'><div class='k'>Insight Sistem</div><div class='v'>Iseller lebih besar di ${isellerLebihBesar} SKU</div></div></div>
<div class='table-wrap stats-top-gap'><table><thead><tr><th>SKU</th><th>NAMA</th><th>SELISIH</th><th>LOKASI</th><th>STATUS</th></tr></thead><tbody>${topSelisih.map(r=>`<tr><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td class='${r.selisih!==0?"txt-danger":""}'>${r.selisih}</td><td>${esc(r.lokasi)}</td><td>${esc(r.status)}</td></tr>`).join("")}</tbody></table></div>
<div class='mv-toolbar stats-toolbar'><input id='statsSearch' placeholder='Search SKU/Nama/Lokasi' value='${esc(STATS_STATE.q)}'><select id='statsSort'><option value='absDesc'>Selisih terbesar</option><option value='absAsc'>Selisih terkecil</option><option value='sku'>SKU A-Z</option></select><select id='statsSize'><option value='25'>25</option><option value='50'>50</option><option value='100'>100</option></select></div>
<div class='table-wrap table-wrap-full'><table><thead><tr><th>LOKASI</th><th>SKU</th><th>NAMA BARANG</th><th>STOK BULKY</th><th>STOK RETAIL</th><th>STOK GLOBAL</th><th>ISELLER</th><th>NETSUITE</th><th>SELISIH</th><th>STATUS</th></tr></thead><tbody>${paged.map(r=>`<tr class='${r.selisih!==0?"row-mismatch":""}'><td>${esc(r.lokasi)}</td><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td>${r.stokBulky}</td><td>${r.stokRetail}</td><td>${r.stokGlobal}</td><td>${r.iseller}</td><td>${r.netsuite}</td><td class='${r.selisih!==0?"txt-danger":""}'>${r.selisih}</td><td>${esc(r.status)}</td></tr>`).join("")||`<tr><td colspan='10'><div class='state'>Tidak ada data.</div></td></tr>`}</tbody></table></div>
<div class='mv-pagination'><span>Menampilkan ${(tableRows.length?((STATS_STATE.page-1)*STATS_STATE.pageSize+1):0)}–${Math.min(STATS_STATE.page*STATS_STATE.pageSize,tableRows.length)} dari ${tableRows.length} data</span><div class='row'><button class='btn-ghost' id='statsPrev'>Prev</button><button class='btn-ghost' id='statsNext'>Next</button></div></div>
<div class='detail-note'><div class='note-box'><div class='note-title'>Insight Otomatis</div><div class='note-value'>${insight.map(x=>`• ${esc(x)}`).join("<br>")}</div></div></div>`;
document.getElementById("statsSearch")?.addEventListener("input",debounce(e=>{STATS_STATE.q=e.target.value;STATS_STATE.page=1;updateStats();},200));
document.getElementById("statsSort")&&(document.getElementById("statsSort").value=STATS_STATE.sort);
document.getElementById("statsSize")&&(document.getElementById("statsSize").value=String(STATS_STATE.pageSize));
document.getElementById("statsSort")?.addEventListener("change",e=>{STATS_STATE.sort=e.target.value;updateStats();});
document.getElementById("statsSize")?.addEventListener("change",e=>{STATS_STATE.pageSize=Number(e.target.value)||25;STATS_STATE.page=1;updateStats();});
document.getElementById("statsPrev")?.addEventListener("click",()=>{STATS_STATE.page=Math.max(1,STATS_STATE.page-1);updateStats();});
document.getElementById("statsNext")?.addEventListener("click",()=>{STATS_STATE.page=Math.min(maxPage,STATS_STATE.page+1);updateStats();});
}
function normalizeDateKey(raw){
  const s=String(raw||"").trim();
  if(!s)return "";
  const normalized=s.replace(/\./g,"/").replace(/-/g,"/");
  const m=normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){
    const d=Number(m[1]),mo=Number(m[2]);let y=Number(m[3]);if(y<100)y+=2000;
    if(d>=1&&d<=31&&mo>=1&&mo<=12)return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  const dt=new Date(s);if(Number.isNaN(dt.getTime()))return "";
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
const STATISTICS_STATE={startDate:"",endDate:"",sku:"",name:"",type:"all",granularity:"daily",page:1,pageSize:12,debounced:debounce(()=>renderFinanceStatistics(),250)};
function getWeekKey(dateKey){
  const dt=new Date(`${dateKey}T00:00:00`);
  const firstJan=new Date(dt.getFullYear(),0,1);
  const day=Math.floor((dt-firstJan)/86400000);
  const week=Math.ceil((day+firstJan.getDay()+1)/7);
  return `${dt.getFullYear()}-W${String(week).padStart(2,"0")}`;
}
function aggregatePeriod(rows,granularity){
  const map=new Map();
  rows.forEach(r=>{const key=granularity==="daily"?r.dateKey:(granularity==="weekly"?getWeekKey(r.dateKey):r.dateKey.slice(0,7));if(!map.has(key))map.set(key,{inCount:0,outCount:0,inQty:0,outQty:0});const t=map.get(key);if(r.type==="Masuk"){t.inCount++;t.inQty+=r.qty;}else{t.outCount++;t.outQty+=r.qty;}});
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}
function getMovementRows(){
  const toRows=(sheet,type)=>(DATA[sheet]||[]).map(r=>{const dateKey=normalizeDateKey(getVal(r,["tanggal","date","created at","waktu"]));if(!dateKey)return null;const sku=String(getVal(r,["sku"])||"-").trim();const name=String(getVal(r,["nama barang","nama","item","description"])||"-").trim();return{type,dateKey,qty:parseNumber(getVal(r,["qty"])),sku,name};}).filter(Boolean);
  return [...toRows("Barang Masuk","Masuk"),...toRows("Barang Keluar","Keluar")];
}
function buildStatisticsData(){
  const allRows=getMovementRows();
  const f=STATISTICS_STATE;
  const filtered=allRows.filter(r=>{
    if(f.startDate&&r.dateKey<f.startDate)return false;
    if(f.endDate&&r.dateKey>f.endDate)return false;
    if(f.type!=="all"&&r.type!==f.type)return false;
    if(f.sku&&!clean(r.sku).includes(clean(f.sku)))return false;
    if(f.name&&!clean(r.name).includes(clean(f.name)))return false;
    return true;
  });
  const dayMap=new Map();
  const skuIn=new Map(),skuOut=new Map(),nameMap=new Map();
  filtered.forEach(r=>{
    if(!dayMap.has(r.dateKey))dayMap.set(r.dateKey,{date:r.dateKey,inCount:0,outCount:0,inQty:0,outQty:0,total:0});
    const d=dayMap.get(r.dateKey);
    if(r.type==="Masuk"){d.inCount++;d.inQty+=r.qty;skuIn.set(r.sku,(skuIn.get(r.sku)||0)+1);}else{d.outCount++;d.outQty+=r.qty;skuOut.set(r.sku,(skuOut.get(r.sku)||0)+1);}
    d.total+=Math.abs(r.qty);nameMap.set(r.name,(nameMap.get(r.name)||0)+1);
  });
  const daily=[...dayMap.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const top=(map,limit=10)=>[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,limit);
  return{filtered,daily,period:aggregatePeriod(filtered,STATISTICS_STATE.granularity),topIn:top(skuIn),topOut:top(skuOut),topName:top(nameMap),topDate:daily.sort((a,b)=>b.total-a.total).slice(0,10)};
}
function bindStatisticsEvents(){
  if(window.__statsBound)return; window.__statsBound=true;
  document.addEventListener("input",e=>{if(!e.target?.matches("[data-stats-filter]"))return;const k=e.target.dataset.statsFilter;STATISTICS_STATE[k]=e.target.value;STATISTICS_STATE.page=1;STATISTICS_STATE.debounced();});
  document.addEventListener("click",e=>{const btn=e.target.closest("[data-stats-action]");if(!btn)return;const action=btn.dataset.statsAction;
    if(action==="granularity"){STATISTICS_STATE.granularity=btn.dataset.value;renderFinanceStatistics();}
    if(action==="reset"){Object.assign(STATISTICS_STATE,{startDate:"",endDate:"",sku:"",name:"",type:"all",page:1});renderFinanceStatistics();}
    if(action==="prev"||action==="next"){const max=Math.max(1,Math.ceil((window.__statsRows?.length||0)/STATISTICS_STATE.pageSize));STATISTICS_STATE.page=action==="prev"?Math.max(1,STATISTICS_STATE.page-1):Math.min(max,STATISTICS_STATE.page+1);renderFinanceStatistics();}
  });
}
function renderFinanceStatistics(){
  bindStatisticsEvents();
  const stats=buildStatisticsData();
  window.__statsRows=stats.daily;
  const totalIn=stats.filtered.filter(r=>r.type==="Masuk").length,totalOut=stats.filtered.filter(r=>r.type==="Keluar").length;
  const qtyIn=stats.filtered.filter(r=>r.type==="Masuk").reduce((n,r)=>n+r.qty,0),qtyOut=stats.filtered.filter(r=>r.type==="Keluar").reduce((n,r)=>n+r.qty,0);
  const active=stats.topDate[0]?.date||"-";
  const topIn=stats.topIn[0]?.[0]||"-",topOut=stats.topOut[0]?.[0]||"-";
  financeSummary.innerHTML=[["Total Barang Masuk",totalIn],["Total Barang Keluar",totalOut],["Total Qty Masuk",qtyIn],["Total Qty Keluar",qtyOut],["Selisih Qty",qtyIn-qtyOut],["Hari paling aktif",active],["SKU paling sering masuk",topIn],["SKU paling sering keluar",topOut]].map(c=>`<div class='metric'><div class='k'>${c[0]}</div><div class='v'>${esc(c[1])}</div></div>`).join("");
  const max=Math.max(...stats.period.map(([,v])=>Math.max(v.inQty,v.outQty)),1);
  const trendRows=stats.period.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.inCount}</td><td>${v.inQty}</td><td>${v.outCount}</td><td>${v.outQty}</td><td><div class='st-bars'><div class='st-bar in' style='width:${(v.inQty/max)*100}%'></div><div class='st-bar out' style='width:${(v.outQty/max)*100}%'></div></div></td></tr>`).join("");
  const start=(STATISTICS_STATE.page-1)*STATISTICS_STATE.pageSize;const pageRows=stats.daily.slice(start,start+STATISTICS_STATE.pageSize);
  financeTrendChart.innerHTML=`<div class='stats-filter-box'><input type='date' data-stats-filter='startDate' value='${esc(STATISTICS_STATE.startDate)}'><input type='date' data-stats-filter='endDate' value='${esc(STATISTICS_STATE.endDate)}'><input type='text' placeholder='Filter SKU' data-stats-filter='sku' value='${esc(STATISTICS_STATE.sku)}'><input type='text' placeholder='Filter nama barang' data-stats-filter='name' value='${esc(STATISTICS_STATE.name)}'><select data-stats-filter='type'><option value='all' ${STATISTICS_STATE.type==="all"?"selected":""}>Semua</option><option value='Masuk' ${STATISTICS_STATE.type==="Masuk"?"selected":""}>Masuk</option><option value='Keluar' ${STATISTICS_STATE.type==="Keluar"?"selected":""}>Keluar</option></select><button class='btn-ghost' data-stats-action='reset'>Reset Filter</button></div>
  <div class='stats-toggle'><button class='btn-ghost ${STATISTICS_STATE.granularity==="daily"?"active":""}' data-stats-action='granularity' data-value='daily'>Harian</button><button class='btn-ghost ${STATISTICS_STATE.granularity==="weekly"?"active":""}' data-stats-action='granularity' data-value='weekly'>Mingguan</button><button class='btn-ghost ${STATISTICS_STATE.granularity==="monthly"?"active":""}' data-stats-action='granularity' data-value='monthly'>Bulanan</button></div>
  <div class='stats-insight-grid'><div class='summary-card'>${qtyOut>qtyIn?"Barang keluar lebih tinggi dari barang masuk pada periode ini":"Barang masuk lebih tinggi atau seimbang pada periode ini"}</div><div class='summary-card'>Hari paling aktif adalah ${esc(active)}</div><div class='summary-card'>SKU paling sering keluar adalah ${esc(topOut)}</div><div class='summary-card'>Total selisih movement adalah ${qtyIn-qtyOut} qty</div></div>
  <div class='table-wrap table-wrap-full'><table><thead><tr><th>Periode</th><th>Barang Masuk</th><th>Qty Masuk</th><th>Barang Keluar</th><th>Qty Keluar</th><th>Trend</th></tr></thead><tbody>${trendRows||"<tr><td colspan='6'><div class='state'>Data trend kosong.</div></td></tr>"}</tbody></table></div>
  <div class='stats-rank-grid'>${[
    ["Top 10 SKU Barang Masuk",stats.topIn],
    ["Top 10 SKU Barang Keluar",stats.topOut],
    ["Top 10 Nama Barang paling aktif",stats.topName],
    ["Top tanggal movement terbanyak",stats.topDate.map(d=>[d.date,d.total])]
  ].map(([title,arr])=>`<div class='card'><h4>${title}</h4><ol>${arr.map(i=>`<li><span>${esc(i[0])}</span><strong>${i[1]}</strong></li>`).join("")||"<li>-</li>"}</ol></div>`).join("")}</div>
  <div class='table-wrap table-wrap-full'><table><thead><tr><th>Tanggal</th><th>Total Barang Masuk</th><th>Qty Masuk</th><th>Total Barang Keluar</th><th>Qty Keluar</th><th>Selisih Qty</th><th>Status</th></tr></thead><tbody>${pageRows.map(d=>{const diff=d.inQty-d.outQty;const st=diff>0?"Masuk lebih besar":(diff<0?"Keluar lebih besar":"Seimbang");return `<tr><td>${d.date}</td><td>${d.inCount}</td><td>${d.inQty}</td><td>${d.outCount}</td><td>${d.outQty}</td><td>${diff}</td><td>${st}</td></tr>`;}).join("")||"<tr><td colspan='7'><div class='state'>Tidak ada ringkasan tanggal.</div></td></tr>"}</tbody></table></div>
  <div class='mv-pagination'><span>Menampilkan ${stats.daily.length?start+1:0}-${Math.min(start+STATISTICS_STATE.pageSize,stats.daily.length)} dari ${stats.daily.length}</span><div class='row'><button class='btn-ghost' data-stats-action='prev'>Prev</button><button class='btn-ghost' data-stats-action='next'>Next</button></div></div>`;
}
function updateSettings(){loadedState.textContent=apiConnected?"Loaded":"Belum loaded";countPerSheet.textContent=SHEETS.map(s=>`${s}: ${(DATA[s]||[]).length}`).join(" | ");}
function renderFilters(){const searchFilters=FILTERS.filter(f=>!["Barang Masuk","Barang Keluar"].includes(f));filterRow.innerHTML=searchFilters.map(f=>`<button class='chip ${f===currentFilter?"active":""}' onclick="setFilter(decodeURIComponent('${encAttr(f)}'))">${esc(f)}</button>`).join("");if(!searchFilters.includes(currentFilter)){currentFilter="Semua";}}
function setFilter(f){currentFilter=f;renderFilters();runSearch();} function initDashboard(){dashboardCards.innerHTML="<div class='skeleton'></div><div class='skeleton'></div>";}
function showSkeleton(){dashboardCards.innerHTML="<div class='skeleton'></div><div class='skeleton'></div><div class='skeleton'></div><div class='skeleton'></div>";}
function setStatus(type,text){statusEl.textContent=type==="loading"?`⏳ ${text}`:(type==="error"?`❌ ${text}`:text)}
function updateSyncUI(){
const refreshBtn=document.querySelector("[data-refresh-btn]");
if(refreshBtn){refreshBtn.classList.toggle("is-syncing",isSyncing);refreshBtn.disabled=false;}
}
function renderState(id,text){document.getElementById(id).innerHTML=`<div class='state'>${esc(text)}</div>`;} function renderError(id,text){document.getElementById(id).innerHTML=`<div class='state error'>${esc(text)}</div>`;}
function updateSyncTime(){const ts=Number(localStorage.getItem(CACHE_KEYS.lastSync)||Date.now());lastSync.textContent="Sync: "+new Date(ts).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});}
function updateApiState(){const t=apiConnected?"Terhubung":"Tidak terhubung";settingsApiState.textContent=t;sidebarApi.textContent="";}
function copySku(sku){navigator.clipboard.writeText(sku||"").then(()=>toast(`SKU ${sku} disalin`));}
function copyText(value,message){navigator.clipboard.writeText(value||"").then(()=>toast(message));}
function applyTheme(){const saved=localStorage.getItem("theme");if(saved==="dark")document.body.classList.add("dark");syncThemeButton();}
function toggleDark(){document.body.classList.toggle("dark");localStorage.setItem("theme",document.body.classList.contains("dark")?"dark":"light");syncThemeButton();toast("Mode tema diubah");}
function syncThemeButton(){const dark=document.body.classList.contains("dark");darkBtnHeader.innerHTML=`<i data-lucide="${dark?"sun":"moon-star"}"></i>`;if(window.lucide)lucide.createIcons();}
function hideInitialLoader(){const ld=document.getElementById("initialLoader");if(ld)ld.remove();}
function toggleCompact(){document.body.classList.toggle("compact");toast("Compact mode diubah");}
function toast(msg,type="info",showClose=true){const t=document.getElementById("toast");if(!t)return;const map={success:"✓",error:"⨯",warning:"!",info:"i"};const item=document.createElement("div");item.className=`toast-item ${map[type]?type:"info"}`;const closeBtn=showClose?'<button class="toast-close" aria-label="Tutup" type="button">×</button>':"";item.innerHTML=`<span class="toast-icon" aria-hidden="true">${map[type]||map.info}</span><span class="toast-message">${esc(msg||"")}</span>${closeBtn}`;t.appendChild(item);requestAnimationFrame(()=>item.classList.add("show"));const remove=()=>{item.classList.remove("show");setTimeout(()=>item.remove(),220);};item.querySelector(".toast-close")?.addEventListener("click",remove);setTimeout(remove,2500);}
function getVal(row,keys){const cols=Object.keys(row||{});for(const key of keys){const f=cols.find(c=>clean(c).includes(clean(key)));if(f&&row[f]!=null)return String(row[f]);}return "";}
function highlight(text,query){const raw=String(text||"");const q=String(query||"").trim();if(!q) return esc(raw);const words=clean(q).split(" ").filter(Boolean).slice(0,6);let out=esc(raw);words.forEach(w=>{const e=w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");out=out.replace(new RegExp(`(${e})`,"ig"),"<mark>$1</mark>")});return out;}
function normalizeHeader(v){return clean(v).replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim();} function clean(v){return String(v||"").toLowerCase().trim().replace(/[_-]+/g," ").replace(/\s+/g," ");}
function parseNumber(v){const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0;} function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function encAttr(v){return encodeURIComponent(String(v??""));} function badgeClass(s){return s==="Kartu Stock"?"b-kartu":s==="RPL"?"b-rpl":s==="BULKY"?"b-bulky":s==="Barang Masuk"?"b-in":"b-out";}
function debounce(fn,wait){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}


function normalizeMovementRows(sheet,type){return (DATA[sheet]||[]).slice().reverse().filter(r=>clean(getVal(r,["sku"]))).map((r,idx)=>{const sku=getVal(r,["sku"]);const nama=getVal(r,["nama barang","nama","item","description"])||"-";const qty=parseNumber(getVal(r,["qty"]));const tanggal=getVal(r,["tanggal","date","created at","waktu"])||"";const from=getVal(r,["from"])||"-";const to=getVal(r,["to"])||"-";const status=getVal(r,["status"])||"-";const pic=getVal(r,["pic","user","operator"])||"-";const lokasi=getVal(r,["lokasi","location","rak","bin","area"])||"-";const ket=getVal(r,["keterangan","notes","remark"])||"-";return {tanggal,from,to,sku,nama,qty,status,pic,lokasi,keterangan:ket,type,row:r,_sheetOrder:idx};});}
const DEBOUNCED_RENDER={in:debounce(()=>renderDataTablePage("in","Barang Masuk",true),250),out:debounce(()=>renderDataTablePage("out","Barang Keluar",true),250)};
function debouncedTableRender(mode){return (DEBOUNCED_RENDER[mode]||(()=>{}))();}
const TABLE_STATE={in:{page:1,pageSize:25,rows:[],filtered:[]},out:{page:1,pageSize:25,rows:[],filtered:[]}};
function getUniqueOptions(rows,key){return [...new Set(rows.map(r=>String(r[key]||"-")).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function applyTableFilters(rows,mode){const q=clean((mode==="in"?inSearch:outSearch)?.value||"");const root=document.getElementById(`mv-filters-${mode}`);const get=name=>root?.querySelector(`[name="${name}"]`)?.value||"";return rows.filter(r=>{const fields=["from","to","status","pic","lokasi","sku"];if(fields.some(f=>{const v=get(f);return v&&String(r[f]||"-")!==v;}))return false;if(q&&!clean(`${r.sku} ${r.nama} ${r.from} ${r.to} ${r.status} ${r.pic} ${r.keterangan}`).includes(q))return false;return true;});}
function sortTableRows(rows,sort){const m={latest:(a,b)=>(a._sheetOrder??0)-(b._sheetOrder??0),oldest:(a,b)=>(b._sheetOrder??0)-(a._sheetOrder??0),sku:(a,b)=>a.sku.localeCompare(b.sku),name:(a,b)=>a.nama.localeCompare(b.nama),qtyDesc:(a,b)=>b.qty-a.qty,qtyAsc:(a,b)=>a.qty-b.qty};return [...rows].sort(m[sort]||m.latest);}
function paginateRows(mode,action){const st=TABLE_STATE[mode];const max=Math.max(1,Math.ceil(st.filtered.length/st.pageSize));if(action==="prev")st.page=Math.max(1,st.page-1);if(action==="next")st.page=Math.min(max,st.page+1);renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true);}
function toggleColumnVisibility(mode){const root=document.getElementById(`mv-cols-${mode}`);const cols=[...root.querySelectorAll('input[type="checkbox"]')].filter(c=>c.checked).map(c=>c.value);renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true,cols);}
function exportFilteredCsv(mode){const st=TABLE_STATE[mode];const cols=st.columns||["tanggal","from","to","sku","nama","qty","status","pic","keterangan"];const lines=[cols.join(","),...st.filtered.map(r=>cols.map(c=>`"${String(r[c]??"").replaceAll('"','""')}"`).join(","))];const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8;"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=mode==="in"?"barang-masuk-filtered.csv":"barang-keluar-filtered.csv";a.click();URL.revokeObjectURL(a.href);} 
function renderDataTablePage(mode,sheetName,keepPage=false,selectedCols){const isIn=mode==="in", resultEl=isIn?inResults:outResults, summaryEl=isIn?inSummary:outSummary;if(!resultEl)return;const st=TABLE_STATE[mode];if(!keepPage||!st.rows.length)st.rows=normalizeMovementRows(sheetName,isIn?"IN":"OUT");const rows=st.rows;if(!rows.length){resultEl.innerHTML='<div class="state">Belum ada data.</div>';summaryEl.textContent='0 data';return;}const allCols=["tanggal","from","to","sku","nama","qty","status","pic","keterangan","lokasi"];st.columns=selectedCols||st.columns||["tanggal","from","to","sku","nama","qty","status","pic","keterangan"];const filtered=applyTableFilters(rows,mode);const sort=document.getElementById(`mv-sort-${mode}`)?.value||"latest";st.filtered=sortTableRows(filtered,sort);st.pageSize=Number(document.getElementById(`mv-size-${mode}`)?.value||25);if(![25,50].includes(st.pageSize))st.pageSize=25;if(!keepPage)st.page=1;const size=st.pageSize;
const pageRows=st.filtered.slice((st.page-1)*size,st.page*size);const totalQty=st.filtered.reduce((n,r)=>n+r.qty,0),totalSku=new Set(st.filtered.map(r=>r.sku)).size;
summaryEl.innerHTML=`<div class='summary-grid'><div class='summary-card'><div class='k'>Total Row</div><div class='v'>${st.filtered.length}</div></div><div class='summary-card'><div class='k'>Total Qty</div><div class='v'>${totalQty}</div></div><div class='summary-card'><div class='k'>Total SKU</div><div class='v'>${totalSku}</div></div></div>`;
const filterHtml=`<div class='mv-toolbar'><button class='btn-ghost mv-mobile-only' data-mv-action='toggle-filter' data-mv-mode='${mode}'>Filter</button><div id='mv-filters-${mode}' class='mv-filters'>${["from","to","status","pic","lokasi","sku"].map(k=>`<select data-mv-filter data-mv-mode='${mode}' name='${k}'><option value=''>${k.toUpperCase()} (Semua)</option>${getUniqueOptions(rows,k).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select>`).join("")}<select id='mv-sort-${mode}' data-mv-filter data-mv-mode='${mode}'><option value='latest'>Terbaru</option><option value='oldest'>Terlama</option><option value='sku'>SKU A-Z</option><option value='name'>Nama A-Z</option><option value='qtyDesc'>Qty terbesar</option><option value='qtyAsc'>Qty terkecil</option></select><select id='mv-size-${mode}' data-mv-filter data-mv-mode='${mode}'><option value='25'>25</option><option value='50'>50</option></select><button class='btn-ghost' data-mv-action='reset' data-mv-mode='${mode}'>Reset Filter</button><button class='btn-ghost' data-mv-action='export' data-mv-mode='${mode}'>Export CSV</button><button class='btn-ghost' data-mv-action='columns' data-mv-mode='${mode}'>Kolom</button></div><div id='mv-cols-${mode}' class='mv-columns'>${allCols.map(c=>`<label><input type='checkbox' ${st.columns.includes(c)?"checked":""} value='${c}' onchange='toggleColumnVisibility("${mode}")'> ${c}</label>`).join("")}</div></div>`;
const headers=st.columns.map(c=>`<th>${esc(c.toUpperCase())}</th>`).join("");const bodyRows=[];for(const r of pageRows){bodyRows.push(`<tr>${st.columns.map(c=>`<td>${esc(r[c]??"-")}</td>`).join("")}</tr>`);}const body=bodyRows.join("");const start=st.filtered.length?((st.page-1)*st.pageSize+1):0;const end=st.filtered.length?Math.min(st.page*st.pageSize,st.filtered.length):0;
resultEl.innerHTML=`${filterHtml}<div class='table-wrap table-wrap-full'><table><thead><tr>${headers}</tr></thead><tbody>${body||`<tr><td colspan='${st.columns.length}'><div class='state'>Tidak ada data.</div></td></tr>`}</tbody></table></div><div class='mv-pagination'><span>Menampilkan ${start}–${end} dari ${st.filtered.length} data</span><div class='row'><button class='btn-ghost' data-mv-action='prev' data-mv-mode='${mode}'>Prev</button><button class='btn-ghost' data-mv-action='next' data-mv-mode='${mode}'>Next</button><span class='badge ${isIn?"b-in":"b-out"}'>${isIn?"IN":"OUT"}</span></div></div>`;}
function resetMovementFilter(mode){if(mode==="in"){if(inSearch)inSearch.value="";}else{if(outSearch)outSearch.value="";}const root=document.getElementById(`mv-filters-${mode}`);root?.querySelectorAll('select').forEach(el=>el.value="");TABLE_STATE[mode].page=1;renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true);} 
function getAllValidLocations(){const all=[];for(let zoneCode=65;zoneCode<=72;zoneCode++){const zone=String.fromCharCode(zoneCode);for(let slot=1;slot<=20;slot++){for(let floor=1;floor<=5;floor++){const code=`${zone}${String(slot).padStart(2,"0")}-${floor}`;const parsed=parseLocationCode(code);if(parsed.valid&&!parsed.blocked)all.push(parsed.raw);}}}return all;}
function renderEmptyLocations(){const used=new Set();(DATA["Kartu Stock"]||[]).forEach(r=>{const stokAkhir=parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"]));if(stokAkhir<=0)return;const locRaw=getVal(r,["lokasi","location","rak","bin","area"]);const parsed=parseLocationCode(locRaw);if(parsed.valid&&!parsed.blocked)used.add(parsed.raw);});const empty=getAllValidLocations().filter(code=>!used.has(code));if(!empty.length){emptyLocationResult.innerHTML='<div class="state">Tidak ada lokasi kosong.</div>';return;}const rows=empty.map((code,idx)=>`<tr><td>${idx+1}</td><td>${esc(code)}</td></tr>`).join("");emptyLocationResult.innerHTML=`<div class="detail-note"><div class="note-box"><div class="note-title">Daftar Lokasi Kosong</div><div class="note-value">${empty.length} lokasi kosong</div></div></div><div class="table-wrap"><table class="location-empty-table"><thead><tr><th>No</th><th>Lokasi Kosong</th></tr></thead><tbody>${rows}</tbody></table></div>`;}
function parseLocationCode(value){const raw=String(value||"").trim().toUpperCase();const m=raw.match(/^([A-H])(\d{2})-(\d)$/);if(!m)return{raw,valid:false,reason:"Format tidak valid. Gunakan pola seperti A01-1 sampai H20-5."};const zone=m[1],slot=Number(m[2]),floor=Number(m[3]);if(slot<1||slot>20)return{raw,valid:false,reason:"Nomor lokasi harus 01 sampai 20."};if(floor<1||floor>5)return{raw,valid:false,reason:"Lantai harus 1 sampai 5."};const blocked=slot===7&&floor>=1&&floor<=3;return{raw:`${zone}${String(slot).padStart(2,"0")}-${floor}`,valid:true,blocked,zone,slot,floor};}
function checkLocation(){const result=parseLocationCode(locInput.value);if(!result.valid){locationResult.innerHTML=`<div class="state error">${esc(result.reason)}</div>`;return;}if(result.blocked){locationResult.innerHTML=`<div class="state error">Lokasi <strong>${esc(result.raw)}</strong> tidak bisa digunakan (blokir A07-1 sampai H07-3).</div>`;return;}const rows=(DATA["Kartu Stock"]||[]).filter(r=>{const loc=getVal(r,["lokasi","location","rak","bin","area"]);return clean(loc)===clean(result.raw);});if(!rows.length){locationResult.innerHTML=`<div class="state">Lokasi <strong>${esc(result.raw)}</strong> belum ada data di Kartu Stock.</div>`;return;}const skuMap=new Map();rows.forEach(r=>{const sku=getVal(r,["sku"])||"-";const nama=getVal(r,["nama barang","nama","item","description"])||"-";const stokAwal=parseNumber(getVal(r,["stok awal","opening stock","beginning stock","saldo awal"]));const pengeluaran=parseNumber(getVal(r,["pengeluaran","qty keluar","keluar","out"]));const stokAkhir=parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"]));const key=clean(sku||nama);if(!skuMap.has(key))skuMap.set(key,{sku,nama,stokAwal:0,pengeluaran:0,stokAkhir:0});const item=skuMap.get(key);item.stokAwal+=stokAwal;item.pengeluaran+=pengeluaran;item.stokAkhir+=stokAkhir;});const details=[...skuMap.values()].filter(d=>d.stokAkhir!==0).sort((a,b)=>b.stokAkhir-a.stokAkhir||a.sku.localeCompare(b.sku));if(!details.length){locationResult.innerHTML=`<div class="state">Lokasi <strong>${esc(result.raw)}</strong> hanya memiliki data dengan stok akhir 0.</div>`;return;}locationResult.innerHTML=`<div class="detail-note"><div class="note-box"><div class="note-title">Ringkasan Lokasi ${esc(result.raw)}</div><div class="note-value">${details.length} SKU unik • ${rows.length} baris Kartu Stock</div></div></div><div class="table-wrap"><table><thead><tr><th>SKU</th><th>Nama</th><th>Stok Awal</th><th>Pengeluaran</th><th>Stok Akhir</th><th>DETAIL</th></tr></thead><tbody>${details.map(d=>{const skuValid=String(d.sku||"" ).trim()&&d.sku!=="-";return `<tr><td><div class="copy-cell"><span class="copy-cell-text">${esc(d.sku)}</span><button class="copy-mini-btn" type="button" title="Copy" aria-label="Copy SKU" onclick="copyText(decodeURIComponent('${encAttr(d.sku)}'),'SKU disalin')">⧉</button></div></td><td><div class="copy-cell"><span class="copy-cell-text">${esc(d.nama)}</span><button class="copy-mini-btn" type="button" title="Copy" aria-label="Copy nama barang" onclick="copyText(decodeURIComponent('${encAttr(d.nama)}'),'Nama barang disalin')">⧉</button></div></td><td>${esc(d.stokAwal)}</td><td>${esc(d.pengeluaran)}</td><td>${esc(d.stokAkhir)}</td><td class="action-cell">${skuValid?`<button class="detail-mini-btn" type="button" onclick="navigateToSku(decodeURIComponent('${encAttr(d.sku)}'))">Lihat</button>`:""}</td></tr>`;}).join("")}</tbody></table></div>`;}

const LOCATION_STATE={rows:[],filtered:[],page:1,pageSize:25,selected:""};
function getLocationValue(row){return getVal(row,["lokasi","location","rak","bin","area","LOKASI"])||"";}
function getTypeValue(row){return getVal(row,["tipe produk","type","kategori","category"])||"-";}
function buildLocationRows(){const skuMap=new Map();for(const row of (DATA["Kartu Stock"]||[])){const sku=String(getVal(row,["sku"])||"").trim();if(!sku)continue;const nama=getVal(row,["nama barang","nama","item","description"])||"-";const locRaw=String(getLocationValue(row)||"").trim()||"Tanpa Lokasi";const loc=locRaw||"Tanpa Lokasi";const qty=parseNumber(getVal(row,["stok akhir","qty","closing stock","ending stock","saldo akhir"]));const key=`${clean(loc)}__${clean(sku)}`;if(!skuMap.has(key))skuMap.set(key,{lokasi:loc,sku,nama,qty:0,type:getTypeValue(row)});const it=skuMap.get(key);it.qty+=qty;}const grouped={};for(const it of skuMap.values()){if(!grouped[it.lokasi])grouped[it.lokasi]={lokasi:it.lokasi,skus:[],totalQty:0};grouped[it.lokasi].skus.push(it);grouped[it.lokasi].totalQty+=it.qty;}return Object.values(grouped).map(g=>{const jumlahSku=g.skus.length,skuKosong=g.skus.filter(x=>x.qty<=0).length;const invalid=clean(g.lokasi)==='tanpa lokasi';const status=invalid?'Kosong / Tidak valid':(jumlahSku>=25||g.totalQty>=400?'Padat':'Normal');return {...g,jumlahSku,skuKosong,status};});}
function renderLocationsPage(){LOCATION_STATE.rows=buildLocationRows();if(!locSearchInput?.dataset.bound){const redraw=debounce(()=>{LOCATION_STATE.page=1;drawLocations();},180);[locSearchInput,locSkuSearchInput].forEach(el=>el?.addEventListener('input',redraw));[locStatusFilter,locSort,locPageSize].forEach(el=>el?.addEventListener('change',()=>{LOCATION_STATE.page=1;drawLocations();}));locSearchInput.dataset.bound='1';}drawLocations();}
function drawLocations(){const rows=LOCATION_STATE.rows||[];const qLoc=clean(locSearchInput?.value||'');const qSku=clean(locSkuSearchInput?.value||'');const status=locStatusFilter?.value||'all';const sorter=locSort?.value||'skuDesc';const pageSize=Number(locPageSize?.value||25);LOCATION_STATE.pageSize=[25,50,100].includes(pageSize)?pageSize:25;let filtered=rows.filter(r=>(!qLoc||clean(r.lokasi).includes(qLoc))&&(!qSku||r.skus.some(s=>clean(`${s.sku} ${s.nama}`).includes(qSku)))&&(status==='all'||r.status===status));filtered=[...filtered].sort(sorter==='qtyDesc'?(a,b)=>b.totalQty-a.totalQty:sorter==='az'?(a,b)=>a.lokasi.localeCompare(b.lokasi):(a,b)=>b.jumlahSku-a.jumlahSku||b.totalQty-a.totalQty);LOCATION_STATE.filtered=filtered;const totalLokasi=rows.length,totalSku=new Set(rows.flatMap(r=>r.skus.map(s=>clean(s.sku)))).size;const topSku=filtered[0];const topQty=[...filtered].sort((a,b)=>b.totalQty-a.totalQty)[0];locationsSummary.innerHTML=[["Total Lokasi",totalLokasi],["Total SKU berlokasi",totalSku],["Lokasi paling banyak SKU",topSku?.lokasi||'-'],["Lokasi dengan qty terbesar",topQty?.lokasi||'-']].map(c=>`<div class='metric'><div class='k'>${c[0]}</div><div class='v'>${esc(c[1])}</div></div>`).join('');const max=Math.max(1,Math.ceil(filtered.length/LOCATION_STATE.pageSize));if(LOCATION_STATE.page>max)LOCATION_STATE.page=max;const pageRows=filtered.slice((LOCATION_STATE.page-1)*LOCATION_STATE.pageSize,LOCATION_STATE.page*LOCATION_STATE.pageSize);locationsTable.innerHTML=`<div class='table-wrap table-wrap-full'><table><thead><tr><th>Lokasi</th><th>Jumlah SKU</th><th>Total Qty</th><th>Jumlah SKU kosong qty</th><th>Status</th><th>Action</th></tr></thead><tbody>${pageRows.map(r=>`<tr><td>${esc(r.lokasi)}</td><td>${r.jumlahSku}</td><td>${r.totalQty}</td><td>${r.skuKosong}</td><td>${esc(r.status)}</td><td><button class='btn-ghost' onclick="selectLocationDetail('${encAttr(r.lokasi)}')">Lihat SKU</button></td></tr>`).join('')||"<tr><td colspan='6'><div class='state'>Tidak ada data.</div></td></tr>"}</tbody></table></div><div class='mv-pagination'><span>Menampilkan ${filtered.length?((LOCATION_STATE.page-1)*LOCATION_STATE.pageSize+1):0}–${Math.min(LOCATION_STATE.page*LOCATION_STATE.pageSize,filtered.length)} dari ${filtered.length} data</span><div class='row'><button class='btn-ghost' onclick='changeLocationPage(-1)'>Prev</button><button class='btn-ghost' onclick='changeLocationPage(1)'>Next</button></div></div>`;if(LOCATION_STATE.selected)selectLocationDetail(encAttr(LOCATION_STATE.selected),true);}
function changeLocationPage(step){const max=Math.max(1,Math.ceil((LOCATION_STATE.filtered.length||0)/LOCATION_STATE.pageSize));LOCATION_STATE.page=Math.min(max,Math.max(1,LOCATION_STATE.page+step));drawLocations();}
function selectLocationDetail(locEncoded,keep=false){const lokasi=decodeURIComponent(locEncoded||'');LOCATION_STATE.selected=lokasi;const row=(LOCATION_STATE.filtered||LOCATION_STATE.rows).find(r=>r.lokasi===lokasi);if(!row){if(!keep)locationDetail.innerHTML='';return;}const skuRows=[...row.skus].sort((a,b)=>b.qty-a.qty);locationDetail.innerHTML=`<div class='card'><div class='section-header'><h4>Detail Lokasi: ${esc(lokasi)}</h4></div><div class='table-wrap table-wrap-full'><table><thead><tr><th>SKU</th><th>Nama Barang</th><th>Qty / Stok</th><th>Tipe Produk</th><th>Aksi</th></tr></thead><tbody>${skuRows.map(s=>`<tr><td>${esc(s.sku)}</td><td>${esc(s.nama)}</td><td>${s.qty}</td><td>${esc(s.type)}</td><td><button class='btn-ghost' onclick="copyText(decodeURIComponent('${encAttr(s.sku)}'),'SKU disalin')">Copy SKU</button> <button class='btn-primary' onclick="navigateTo('/sku/'+encodeURIComponent(decodeURIComponent('${encAttr(s.sku)}')))" ${String(s.sku).trim()?"":"disabled"}>Lihat Detail SKU</button></td></tr>`).join('')}</tbody></table></div></div>`;}
function exportLocationCsv(){const cols=["lokasi","jumlah_sku","total_qty","sku_qty_kosong","status"];const lines=[cols.join(',')].concat((LOCATION_STATE.filtered||[]).map(r=>[r.lokasi,r.jumlahSku,r.totalQty,r.skuKosong,r.status].map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(',')));const blob=new Blob([lines.join('
')],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='locations-analysis.csv';a.click();URL.revokeObjectURL(a.href);}
window.renderLocationsPage=renderLocationsPage;window.changeLocationPage=changeLocationPage;window.selectLocationDetail=selectLocationDetail;

function getRecentSearches(){try{const raw=localStorage.getItem(CACHE_KEYS.searchHistory);const list=JSON.parse(raw||"[]");return Array.isArray(list)?list.filter(Boolean).slice(0,5):[];}catch(_){return [];}}
function saveRecentSearch(query){const q=String(query||"").trim();if(!q)return;const recent=[q,...getRecentSearches().filter(x=>clean(x)!==clean(q))].slice(0,5);try{localStorage.setItem(CACHE_KEYS.searchHistory,JSON.stringify(recent));}catch(_){}renderRecentHistory();}
function clearSearchHistory(){localStorage.removeItem(CACHE_KEYS.searchHistory);renderRecentHistory();}
function renderRecentHistory(){const wrap=document.getElementById("recentSearch");if(!wrap)return;const items=getRecentSearches();if(!items.length){wrap.innerHTML="";return;}wrap.innerHTML=`<div class='row recent-searches'>${items.map(x=>`<button class='chip' data-history='${encAttr(x)}'>${esc(x)}</button>`).join("")}</div>`;}
function handleSearchShortcuts(e){const key=(e.key||"").toLowerCase();if((e.ctrlKey||e.metaKey)&&key==="k"){e.preventDefault();openSearchModal();return;}if(key==="escape"&&searchModalOpen){e.preventDefault();closeSearchModal();}}
function openSearchModal(){prevRouteBeforeSearch=location.pathname||"/";searchModalOpen=true;if(location.pathname!=='/search')navigateTo('/search');setTimeout(()=>searchInput?.focus(),20);renderRecentHistory();}
function closeSearchModal(){searchModalOpen=false;if(location.pathname==='/search')navigateTo(prevRouteBeforeSearch==='/search'?'/':prevRouteBeforeSearch);}
function syncSearchModalUi(_open){}
window.loadAllData=loadAllData;window.syncData=syncData;window.loadCache=loadCache;window.saveCache=saveCache;window.isCacheFresh=isCacheFresh;window.clearCache=clearCache;window.exportLocationCsv=exportLocationCsv;window.toggleDark=toggleDark;window.toggleCompact=toggleCompact;window.setFilter=setFilter;window.copySku=copySku;window.copyText=copyText;window.showDetail=showDetail;window.navigateTo=navigateTo;window.navigateToSku=navigateToSku;window.goBackToPreviousPage=goBackToPreviousPage;window.showPage=showPage;window.resetMovementFilter=resetMovementFilter;window.renderDataTablePage=renderDataTablePage;window.applyTableFilters=applyTableFilters;window.sortTableRows=sortTableRows;window.paginateRows=paginateRows;window.exportFilteredCsv=exportFilteredCsv;window.getUniqueOptions=getUniqueOptions;window.toggleColumnVisibility=toggleColumnVisibility;

const ANOMALY_STATE={page:1,pageSize:25,rows:[]};
function normalizeSku(v){return clean(String(v||'').replace(/[^A-Za-z0-9-]/g,''));}
function getSkuName(row){return String(getVal(row,["nama barang","nama","item","description"])||"").trim();}
function isValidSku(sku){const value=String(sku||"").trim().toLowerCase();return value&&value!=="-"&&value!=="null"&&value!=="undefined";}
function getSkuTotals(rows){const map={};rows.forEach(r=>{const rawSku=getVal(r,["sku"]);if(!isValidSku(rawSku))return;const sku=normalizeSku(rawSku);if(!sku)return;map[sku]=(map[sku]||0)+parseNumber(getVal(r,["qty"]));});return map;}
function buildAnomalyReport(){
const rows=[];const kartuSet=new Set((DATA["Kartu Stock"]||[]).map(r=>normalizeSku(getVal(r,["sku"]))).filter(Boolean));
const masuk=DATA["Barang Masuk"]||[], keluar=DATA["Barang Keluar"]||[], rpl=DATA["RPL"]||[], bulky=DATA["BULKY"]||[];
const inTotals=getSkuTotals(masuk),outTotals=getSkuTotals(keluar);
const skuNames={};[...DATA["Kartu Stock"]||[],...masuk,...keluar,...rpl,...bulky].forEach(r=>{const rawSku=getVal(r,["sku"]);if(!isValidSku(rawSku))return;const sku=normalizeSku(rawSku);const nama=getSkuName(r);if(!sku)return;if(!skuNames[sku])skuNames[sku]=new Set();if(nama)skuNames[sku].add(nama);});
Object.keys(outTotals).forEach(sku=>{if(!inTotals[sku])rows.push({severity:'High',sku,nama:[...(skuNames[sku]||[])][0]||'-',issue:'SKU keluar tanpa data masuk',source:'Barang Keluar',recommendation:'Verifikasi transaksi barang masuk sebelum pengeluaran.'});if(outTotals[sku]>(inTotals[sku]||0))rows.push({severity:'High',sku,nama:[...(skuNames[sku]||[])][0]||'-',issue:'Qty keluar > qty masuk',source:'Barang Masuk/Barang Keluar',recommendation:'Audit mutasi dan koreksi qty.'});});
[rpl,bulky].forEach((list,idx)=>list.forEach(r=>{const rawSku=getVal(r,["sku"]);if(!isValidSku(rawSku))return;const sku=normalizeSku(rawSku);if(sku&&!kartuSet.has(sku))rows.push({severity:'Medium',sku,nama:getSkuName(r)||'-',issue:idx===0?'SKU RPL tidak ada di Kartu Stock':'SKU BULKY tidak ada di Kartu Stock',source:idx===0?'RPL':'BULKY',recommendation:'Sinkronkan master SKU ke Kartu Stock.'});}));
Object.entries(skuNames).forEach(([sku,names])=>{if(names.size>1)rows.push({severity:'Medium',sku,nama:[...names].join(' | '),issue:'SKU sama nama berbeda',source:'Multi Source',recommendation:'Standarisasi nama barang per SKU.'});});
[...DATA["Kartu Stock"]||[],...masuk,...keluar,...rpl,...bulky].forEach(r=>{const rawSku=getVal(r,["sku"]);if(!isValidSku(rawSku))return;const sku=normalizeSku(rawSku);if(!sku)return;const nama=getSkuName(r);const source=SHEETS.find(s=>(DATA[s]||[]).includes(r))||'Unknown';if(!nama)rows.push({severity:'Low',sku:String(rawSku).trim()||sku,nama:'-',issue:'Nama barang kosong',source,recommendation:'Lengkapi nama barang.'});});
return rows;}
function renderAnomalyPage(){
const all=buildAnomalyReport();ANOMALY_STATE.rows=all;const sev=anomalySeverity?.value||'all',typ=anomalyType?.value||'all',q=clean(anomalySearch?.value||'');
const types=[...new Set(all.map(r=>r.issue))];if(anomalyType&&anomalyType.options.length<=1){anomalyType.innerHTML='<option value="all">Semua Jenis Masalah</option>'+types.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');}
let rows=all.filter(r=>(sev==='all'||r.severity===sev)&&(typ==='all'||r.issue===typ));if(q)rows=rows.filter(r=>clean(`${r.sku} ${r.nama}`).includes(q));
const cnt={High:rows.filter(r=>r.severity==='High').length,Medium:rows.filter(r=>r.severity==='Medium').length,Low:rows.filter(r=>r.severity==='Low').length};anomalySummary.innerHTML=[["Total anomaly",rows.length],["High severity",cnt.High],["Medium severity",cnt.Medium],["Low severity",cnt.Low]].map(c=>`<div class='metric'><div class='k'>${c[0]}</div><div class='v'>${c[1]}</div></div>`).join('');
const size=Number(document.getElementById('anomalySize')?.value||ANOMALY_STATE.pageSize||25);ANOMALY_STATE.pageSize=[25,50,100].includes(size)?size:25;const max=Math.max(1,Math.ceil(rows.length/ANOMALY_STATE.pageSize));if(ANOMALY_STATE.page>max)ANOMALY_STATE.page=max;const pageRows=rows.slice((ANOMALY_STATE.page-1)*ANOMALY_STATE.pageSize,ANOMALY_STATE.page*ANOMALY_STATE.pageSize);
const sevClass=s=>s==='High'?'b-high':s==='Medium'?'b-medium':'b-low';
anomalyTable.innerHTML=`<div class='row anomaly-toolbar'><select id='anomalySize' onchange='renderAnomalyPage()'><option value='25'>25</option><option value='50'>50</option><option value='100'>100</option></select><button class='btn-ghost' onclick='changeAnomalyPage(-1)'>Prev</button><button class='btn-ghost' onclick='changeAnomalyPage(1)'>Next</button></div><div class='table-wrap table-wrap-full anomaly-table-wrap'><table><thead><tr><th>Severity</th><th>SKU</th><th>Nama Barang</th><th>Masalah</th><th>Source</th><th>Rekomendasi</th><th>Action</th></tr></thead><tbody>${pageRows.map(r=>`<tr><td><span class='badge ${sevClass(r.severity)}'>${r.severity}</span></td><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td>${esc(r.issue)}</td><td>${esc(r.source)}</td><td>${esc(r.recommendation)}</td><td><button class='btn-ghost' onclick="navigateTo('/sku/'+encodeURIComponent('${encAttr(r.sku)}'))">Lihat Detail SKU</button></td></tr>`).join('')||`<tr><td colspan='7'><div class='state'>Tidak ada anomaly.</div></td></tr>`}</tbody></table></div>`;document.getElementById('anomalySize').value=String(ANOMALY_STATE.pageSize);}
function changeAnomalyPage(step){const max=Math.max(1,Math.ceil((ANOMALY_STATE.rows?.length||0)/ANOMALY_STATE.pageSize));ANOMALY_STATE.page=Math.min(max,Math.max(1,ANOMALY_STATE.page+step));renderAnomalyPage();}
window.renderAnomalyPage=renderAnomalyPage;window.changeAnomalyPage=changeAnomalyPage;
