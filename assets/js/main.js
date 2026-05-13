import { API_KEY, SPREADSHEET_ID, SHEETS, FILTERS } from "./config.js";
const ids=["searchInput","sortSearch","statsFilter","darkBtnHeader","openSidebar","closeSidebar","sidebarOverlay","sheetInfo","spreadsheetInfo","dashboardCards","recentMove","statsCards","statsChart","loadedState","countPerSheet","filterRow","lastSync","settingsApiState","sidebarApi","detail","locInput","locationResult","emptyLocationResult","inSearch","inSummary","inResults","outSearch","outSummary","outResults","inFiltersToggle","outFiltersToggle","anomalySummary","anomalySeverity","anomalyType","anomalySearch","anomalyTable"];
ids.forEach(id=>window[id]=document.getElementById(id));
const statusEl=document.getElementById("status");
console.log("CONFIG", API_KEY, SPREADSHEET_ID, SHEETS);
const CACHE_KEYS={data:"inventory_data",lastSync:"inventory_last_sync",version:"inventory_cache_version",searchHistory:"inventory_recent_search"};
const CACHE_VERSION="1";
const CACHE_TTL_MS=5*60*1000;
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
function showPage(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));document.getElementById(`page-${page}`).classList.remove("hidden");document.querySelectorAll(".side-link").forEach(b=>b.classList.toggle("active",b.dataset.page===page));closeSidebarMobile();if(window.__isDataReady)rerenderCurrentPage();}
function navigateTo(path){history.pushState({},"",path);routeFromPath(path);}
function navigateToSku(sku){const cleanSku=String(sku||"" ).trim();if(!cleanSku)return;navigateTo(`/sku/${encodeURIComponent(cleanSku)}`);}
function goBackToPreviousPage(){if(window.history.length>1){window.history.back();return;}navigateTo('/search');}
function routeFromPath(path){if(path==="/")return showPage("dashboard");if(path==="/search")return showPage("search");if(path==="/barang-masuk")return showPage("barang-masuk");if(path==="/barang-keluar")return showPage("barang-keluar");if(path==="/statistics")return showPage("stats");if(path==="/location")return showPage("location");if(path==="/settings")return showPage("settings");if(path==="/anomaly")return showPage("anomaly");if(path.startsWith("/sku/")){currentSku=decodeURIComponent(path.split("/sku/")[1]||"");if(currentSku)showDetail(currentSku);return showPage("detail");}showPage("dashboard");}
function setupSidebar(){openSidebar.onclick=()=>document.body.classList.add("sidebar-open");closeSidebar.onclick=()=>closeSidebarFn();sidebarOverlay.onclick=()=>closeSidebarFn();}
function closeSidebarFn(){document.body.classList.remove("sidebar-open");}
function closeSidebarMobile(){if(window.innerWidth<900)closeSidebarFn();}
function loadCache(){
try{
if(localStorage.getItem(CACHE_KEYS.version)!==CACHE_VERSION)return null;
const raw=localStorage.getItem(CACHE_KEYS.data);
if(!raw)return null;
const parsed=JSON.parse(raw);
if(!parsed||typeof parsed!=="object")return null;
return parsed;
}catch(_){return null;}
}
function saveCache(data){
try{localStorage.setItem(CACHE_KEYS.data,JSON.stringify(data));localStorage.setItem(CACHE_KEYS.lastSync,String(Date.now()));localStorage.setItem(CACHE_KEYS.version,CACHE_VERSION);}catch(_){}
}
function isCacheFresh(){const ts=Number(localStorage.getItem(CACHE_KEYS.lastSync)||0);return !!ts&&(Date.now()-ts)<CACHE_TTL_MS;}
function clearCache(){localStorage.removeItem(CACHE_KEYS.data);localStorage.removeItem(CACHE_KEYS.lastSync);localStorage.removeItem(CACHE_KEYS.version);}
function applyData(newData,{fromCache=false,deferRender=true}={}){
for(const sheet of SHEETS)DATA[sheet]=Array.isArray(newData?.[sheet])?newData[sheet]:[];
console.log("STATE DATA", DATA);
const hasAnyData = SHEETS.some(sheet => (DATA[sheet]||[]).length>0);
window.__isDataReady = hasAnyData;
console.log("IS READY", window.__isDataReady);
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
if(page==="location")renderEmptyLocations();
if(page==="detail"&&currentSku)showDetail(currentSku);
if(page==="search"&&String(lastQuery||"").trim())runSearch();
if(page==="barang-masuk")renderDataTablePage("in","Barang Masuk",true);
if(page==="barang-keluar")renderDataTablePage("out","Barang Keluar",true);
if(page==="anomaly")renderAnomalyPage();
if(fromCache)setStatus("loading","Data dari cache");
if(page==="anomaly")renderAnomalyPage();
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
console.log("PARSED DATA", sheet, freshData[sheet].length);
}
applyData(freshData,{deferRender:true});
saveCache(freshData);
setStatus("ok","");
toast("Data diperbarui","success");
return true;
}catch(err){
apiConnected=false;updateApiState();
const hasCache=!!loadCache();
if(hasCache){setStatus("error","Gagal sync, memakai cache");return false;}
setStatus("error","Gagal memuat data: "+err.message);renderError("results","Data belum berhasil dimuat");renderState("dashboardCards","Data belum berhasil dimuat");throw err;
}finally{
isSyncing=false;
updateSyncUI();
hideInitialLoader();
}
}
async function initAppData(){
const cached=loadCache();
if(cached){
applyData(cached,{fromCache:true});
hideInitialLoader();
}
const hasCacheData = cached && SHEETS.some(sheet => Array.isArray(cached[sheet]) && cached[sheet].length);
if(!hasCacheData){
await syncData({force:true,silent:false});
}
rerenderCurrentPage({fromCache:!!hasCacheData});
}
async function loadAllData(manual=false,silent=false){return syncData({force:!!manual,silent:!!silent});}
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
function renderTable(rows){if(!rows.length) return `<div class='empty-card'><strong>Data kosong</strong><div>Tidak ada baris untuk sumber ini.</div></div>`;const headers=Object.keys(rows[0]);let h=`<div class='table-wrap'><table><thead><tr>${headers.map(x=>`<th>${esc(String(x).toUpperCase())}</th>`).join("")}</tr></thead><tbody>`;rows.forEach(r=>h+=`<tr>${headers.map(k=>`<td>${esc(r[k])}</td>`).join("")}</tr>`);return h+"</tbody></table></div>";}
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
function updateStats(){const mode=statsFilter.value;const inMap={},outMap={},loc={};SHEETS.forEach(s=>(DATA[s]||[]).forEach(r=>{["from","to","lokasi"].forEach(k=>{const v=getVal(r,[k]);if(v)loc[clean(v)]=(loc[clean(v)]||0)+1;});}));(DATA["Barang Masuk"]||[]).forEach(r=>{const sku=getVal(r,["sku"]);if(!clean(sku))return;const k=sku;inMap[k]=(inMap[k]||0)+parseNumber(getVal(r,["qty"]));});(DATA["Barang Keluar"]||[]).forEach(r=>{const sku=getVal(r,["sku"]);if(!clean(sku))return;const k=sku;outMap[k]=(outMap[k]||0)+parseNumber(getVal(r,["qty"]));});
const topIn=Object.entries(inMap).sort((a,b)=>b[1]-a[1]).slice(0,10),topOut=Object.entries(outMap).sort((a,b)=>b[1]-a[1]).slice(0,10),topLoc=Object.entries(loc).sort((a,b)=>b[1]-a[1]).slice(0,10);statsCards.innerHTML=[["Top SKU Masuk",topIn[0]?.[0]||"-"],["Top SKU Keluar",topOut[0]?.[0]||"-"],["Top Lokasi",topLoc[0]?.[0]||"-"]].map(c=>`<div class='metric'><div class='k'>${c[0]}</div><div class='v'>${esc(c[1])}</div></div>`).join("");
let bars=[];if(mode==="all"||mode==="in")bars=bars.concat(topIn.map(([k,v])=>({k:`IN ${k}`,v})));if(mode==="all"||mode==="out")bars=bars.concat(topOut.map(([k,v])=>({k:`OUT ${k}`,v})));if(mode==="all")bars=bars.concat(topLoc.map(([k,v])=>({k:`LOC ${k}`,v})));const max=Math.max(...bars.map(b=>b.v),1);statsChart.innerHTML=bars.length?bars.map(b=>`<div class='bar-row'><small>${esc(b.k)}</small><div class='bar-fill' style='width:${(b.v/max)*100}%'></div><small>${b.v}</small></div>`).join(""):"<div class='state'>Belum ada data statistik.</div>";}
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


function normalizeMovementRows(sheet,type){return (DATA[sheet]||[]).slice().reverse().filter(r=>clean(getVal(r,["sku"]))).map(r=>{const sku=getVal(r,["sku"]);const nama=getVal(r,["nama barang","nama","item","description"])||"-";const qty=parseNumber(getVal(r,["qty"]));const tanggal=getVal(r,["tanggal","date","created at","waktu"])||"";const from=getVal(r,["from"])||"-";const to=getVal(r,["to"])||"-";const status=getVal(r,["status"])||"-";const pic=getVal(r,["pic","user","operator"])||"-";const lokasi=getVal(r,["lokasi","location","rak","bin","area"])||"-";const ket=getVal(r,["keterangan","notes","remark"])||"-";return {tanggal,from,to,sku,nama,qty,status,pic,lokasi,keterangan:ket,type,row:r};});}
const DEBOUNCED_RENDER={in:debounce(()=>renderDataTablePage("in","Barang Masuk",true),250),out:debounce(()=>renderDataTablePage("out","Barang Keluar",true),250)};
function debouncedTableRender(mode){return (DEBOUNCED_RENDER[mode]||(()=>{}))();}
const TABLE_STATE={in:{page:1,pageSize:25,rows:[],filtered:[]},out:{page:1,pageSize:25,rows:[],filtered:[]}};
function getUniqueOptions(rows,key){return [...new Set(rows.map(r=>String(r[key]||"-")).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function applyTableFilters(rows,mode){const q=clean((mode==="in"?inSearch:outSearch)?.value||"");const root=document.getElementById(`mv-filters-${mode}`);const get=name=>root?.querySelector(`[name="${name}"]`)?.value||"";return rows.filter(r=>{const fields=["from","to","status","pic","lokasi","sku"];if(fields.some(f=>{const v=get(f);return v&&String(r[f]||"-")!==v;}))return false;if(q&&!clean(`${r.sku} ${r.nama} ${r.from} ${r.to} ${r.status} ${r.pic} ${r.keterangan}`).includes(q))return false;return true;});}
function sortTableRows(rows,sort){const m={latest:(a,b)=>String(b.tanggal).localeCompare(String(a.tanggal)),oldest:(a,b)=>String(a.tanggal).localeCompare(String(b.tanggal)),sku:(a,b)=>a.sku.localeCompare(b.sku),name:(a,b)=>a.nama.localeCompare(b.nama),qtyDesc:(a,b)=>b.qty-a.qty,qtyAsc:(a,b)=>a.qty-b.qty};return [...rows].sort(m[sort]||m.latest);}
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
function getRecentSearches(){try{const raw=localStorage.getItem(CACHE_KEYS.searchHistory);const list=JSON.parse(raw||"[]");return Array.isArray(list)?list.filter(Boolean).slice(0,5):[];}catch(_){return [];}}
function saveRecentSearch(query){const q=String(query||"").trim();if(!q)return;const recent=[q,...getRecentSearches().filter(x=>clean(x)!==clean(q))].slice(0,5);try{localStorage.setItem(CACHE_KEYS.searchHistory,JSON.stringify(recent));}catch(_){}renderRecentHistory();}
function clearSearchHistory(){localStorage.removeItem(CACHE_KEYS.searchHistory);renderRecentHistory();}
function renderRecentHistory(){const wrap=document.getElementById("recentSearch");if(!wrap)return;const items=getRecentSearches();if(!items.length){wrap.innerHTML="";return;}wrap.innerHTML=`<div class='row recent-searches'>${items.map(x=>`<button class='chip' data-history='${encAttr(x)}'>${esc(x)}</button>`).join("")}</div>`;}
function handleSearchShortcuts(e){const key=(e.key||"").toLowerCase();if((e.ctrlKey||e.metaKey)&&key==="k"){e.preventDefault();openSearchModal();return;}if(key==="escape"&&searchModalOpen){e.preventDefault();closeSearchModal();}}
function openSearchModal(){prevRouteBeforeSearch=location.pathname||"/";searchModalOpen=true;if(location.pathname!=='/search')navigateTo('/search');setTimeout(()=>searchInput?.focus(),20);renderRecentHistory();}
function closeSearchModal(){searchModalOpen=false;if(location.pathname==='/search')navigateTo(prevRouteBeforeSearch==='/search'?'/':prevRouteBeforeSearch);}
function syncSearchModalUi(_open){}
window.loadAllData=loadAllData;window.syncData=syncData;window.loadCache=loadCache;window.saveCache=saveCache;window.isCacheFresh=isCacheFresh;window.clearCache=clearCache;window.checkLocation=checkLocation;window.renderEmptyLocations=renderEmptyLocations;window.toggleDark=toggleDark;window.toggleCompact=toggleCompact;window.setFilter=setFilter;window.copySku=copySku;window.copyText=copyText;window.showDetail=showDetail;window.navigateTo=navigateTo;window.navigateToSku=navigateToSku;window.showPage=showPage;window.resetMovementFilter=resetMovementFilter;window.renderDataTablePage=renderDataTablePage;window.applyTableFilters=applyTableFilters;window.sortTableRows=sortTableRows;window.paginateRows=paginateRows;window.exportFilteredCsv=exportFilteredCsv;window.getUniqueOptions=getUniqueOptions;window.toggleColumnVisibility=toggleColumnVisibility;

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
