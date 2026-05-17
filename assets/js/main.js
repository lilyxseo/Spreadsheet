import { ensureAuthSession, bindLogoutButtons, loginWithEmailPassword, supabase } from "./supabase.js";
import { API_KEY, SPREADSHEET_ID, SHEETS, FILTERS } from "./config.js";
import { buildAutoInsight } from "./utils/insight-helper.js";
(function () {
  const KEY = "wms_first_load_refreshed";
  const alreadyRefreshed = sessionStorage.getItem(KEY);

  if (!alreadyRefreshed) {
    sessionStorage.setItem(KEY, "1");

    const url = new URL(window.location.href);
    url.searchParams.set("v", Date.now());

    window.location.replace(url.toString());
  }
})();

const ids=["searchInput","sortSearch","statsFilter","refreshToggleHeader","darkBtnHeader","openSidebar","closeSidebar","sidebarOverlay","sheetInfo","spreadsheetInfo","dashboardCards","recentMove","statsCards","statsChart","loadedState","countPerSheet","filterRow","lastSync","settingsApiState","sidebarApi","detail","locationsSummary","locSearchInput","locSkuSearchInput","locStatusFilter","locSort","locPageSize","locationsTable","locationsEmpty","locationDetail","inSearch","inSummary","inResults","outSearch","outSummary","outResults","inFiltersToggle","outFiltersToggle","anomalySummary","anomalySeverity","anomalyType","anomalySearch","anomalyTable","stokMinusSummary","stokMinusPanel","stokMinusTable","cycleCountApp","movementApp","settingsLastRefresh","settingsTotalRows","settingsSystemStatus","settingsSystemDot","settingsDataSources","settingsCacheStatus","settingsCacheTime","archiveApp","mainContentSkeleton","mainContentPages"];
ids.forEach(id=>window[id]=document.getElementById(id));
const statusEl=document.getElementById("status");
console.log("CONFIG", API_KEY, SPREADSHEET_ID, SHEETS);
const CACHE_KEYS={lastSync:"inventory_last_sync",version:"inventory_cache_version",searchHistory:"inventory_recent_search"};
const CACHE_VERSION="2";
const AUTO_SYNC_INTERVAL_MS=5*60*1000;
const AUTO_SYNC_CHECK_INTERVAL_MS=30*1000;
const IDB_NAME="inventory_cache_db";
const IDB_VERSION=1;
const IDB_STORE="sheets";
const DATA = {}; let CACHE_SKU = new Map(); let currentFilter="Semua", lastResults=[], lastQuery="", apiConnected=false, currentSku="", isSyncing=false, searchModalOpen=false, prevRouteBeforeSearch="/";
const SEARCH_STATE={inputValue:"",filterValue:"",page:1,pageSize:25,debounceTimer:null,idleTimer:null};
let authChecking=true;
let user=null;
window.mainDataCache=window.mainDataCache||null;
window.mainDataPromise=window.mainDataPromise||null;
let appInitialized=false;
function setAppAuthState(state){
const appRoot=document.getElementById("appRoot");
if(!appRoot)return;
appRoot.classList.remove("is-auth-checking","is-logged-out","is-logged-in");
appRoot.classList.add(state);
}

function preloadMainData(){
if(window.mainDataCache){
console.log("[preloadData] gunakan cache global yang sudah ada");
return Promise.resolve(window.mainDataCache);
}
if(window.mainDataPromise){
console.log("[preloadData] gunakan promise global yang sedang berjalan");
return window.mainDataPromise;
}
console.time("preloadData");
window.mainDataPromise=(async()=>{
const freshData={};
for(const sheet of SHEETS){
const raw=await fetchSheet(sheet);
await new Promise(resolve=>scheduleUIWork(resolve));
freshData[sheet]=parseSheet(raw, sheet);
}
window.mainDataCache=freshData;
console.log("[preloadData] selesai fetch baru");
return freshData;
})().catch(err=>{
window.mainDataCache=null;
window.mainDataPromise=null;
throw err;
}).finally(()=>{
console.timeEnd("preloadData");
});
return window.mainDataPromise;
}

async function fetchUserProfile(authUserId){
if(!authUserId)return null;
const {data,error}=await supabase.from("users").select("full_name, role, username, email").eq("id",authUserId).maybeSingle();
if(error){console.error("Gagal mengambil profile user",error);return null;}
return data||null;
}

function renderSidebarProfile(profile,authUser){
const accountMeta=document.querySelector(".account-meta");
if(!accountMeta)return;
const nameEl=accountMeta.querySelector("strong");
const roleEl=accountMeta.querySelector("small");
const fallbackEmail=String(profile?.email||authUser?.email||"").trim();
const fallbackUsername=String(profile?.username||"").trim();
const displayName=String(profile?.full_name||"").trim()||fallbackUsername||fallbackEmail;
const displayRole=String(profile?.role||"").trim()||"User";
if(nameEl)nameEl.textContent=displayName||"-";
if(roleEl)roleEl.textContent=displayRole;
}

function renderAuthState(){
const loadingScreen=document.getElementById("authLoadingScreen");
const appRoot=document.getElementById("appRoot");
const loginView=document.getElementById("loginView");
if(authChecking){
setAppAuthState("is-auth-checking");
if(loadingScreen){loadingScreen.hidden=false;loadingScreen.style.display="flex";loadingScreen.style.pointerEvents="auto";}
if(appRoot){appRoot.hidden=true;appRoot.style.display="none";}
if(loginView){loginView.hidden=true;loginView.style.display="none";}
return;
}
if(!user){
setAppAuthState("is-logged-out");
if(loadingScreen){loadingScreen.hidden=true;loadingScreen.style.display="none";loadingScreen.style.pointerEvents="none";}
if(appRoot){appRoot.hidden=true;appRoot.style.display="none";}
if(loginView){loginView.hidden=false;loginView.style.display="grid";}
return;
}
if(loadingScreen){
loadingScreen.hidden=true;
loadingScreen.style.display="none";
loadingScreen.style.pointerEvents="none";
}
setAppAuthState("is-logged-in");
if(loginView){loginView.hidden=true;loginView.style.display="none";}
if(appRoot){appRoot.hidden=false;appRoot.style.display="block";}
}
async function resolveEmailFromLoginInput(loginInput){
const trimmedInput=String(loginInput||"").trim();
if(!trimmedInput)return "";
if(trimmedInput.includes("@"))return trimmedInput;
const {data,error}=await supabase.from("users").select("email").eq("username",trimmedInput).limit(2);
if(error)throw error;
if(!Array.isArray(data)||data.length===0)throw new Error("Username tidak ditemukan");
if(data.length>1)throw new Error("Username tidak unique. Hubungi admin.");
const email=data[0]?.email?.trim();
if(!email)throw new Error("Email user tidak valid");
return email;
}

window.addEventListener("DOMContentLoaded",async ()=>{
authChecking=true;
applyTheme();
renderAuthState();
try{
const session=await ensureAuthSession();
if(session){
const {data:userData,error:userErr}=await supabase.auth.getUser();
if(userErr)throw userErr;
user=userData?.user||null;
console.log("Auth user id:",user?.id||null);
}else{
user=null;
}
}catch(err){
console.error("Auth session check failed",err);
user=null;
}finally{
authChecking=false;
renderAuthState();
}
if(!user){bindLoginView();if(window.lucide)lucide.createIcons();return;}
const profile=await fetchUserProfile(user.id);
console.log("Profile public.users:",profile);
if(!profile){
console.warn("Profile tidak ditemukan / tidak bisa diakses. Pastikan RLS public.users mengizinkan select untuk user id sendiri.");
}
renderSidebarProfile(profile,user);
if(!appInitialized){
bindNav();bindEvents();bindLogoutButtons();setupSidebar();renderFilters();setMainContentLoading(true);document.getElementById("sheetInfo").textContent=SHEETS.join(", ");document.getElementById("spreadsheetInfo").textContent=SPREADSHEET_ID;renderRecentHistory();routeFromPath(location.pathname);window.addEventListener("popstate",()=>routeFromPath(location.pathname));appInitialized=true;
}
preloadMainData().catch(err=>console.warn("Main sheet preload gagal",err));
await initAppData();
if(window.lucide)lucide.createIcons();
});
window.addEventListener("auth:logout",()=>{showLoginView();});

function bindLoginView(){
const form=document.getElementById("loginForm"),emailEl=document.getElementById("email"),passwordEl=document.getElementById("password"),loginBtn=document.getElementById("loginBtn"),errorMsg=document.getElementById("formError"),errorText=errorMsg?.querySelector("span"),togglePasswordBtn=document.getElementById("togglePassword"),signupForm=document.getElementById("signupForm"),signupError=document.getElementById("signupError"),signupErrorText=signupError?.querySelector("span"),signupLink=document.getElementById("signupLink"),loginLink=document.getElementById("loginLink"),googleLoginBtn=document.getElementById("googleLoginBtn"),divider=document.querySelector(".divider"),rememberRow=document.querySelector(".remember-row"),loginLine=document.getElementById("loginLine"),signupBtn=document.getElementById("signupBtn");
if(!form||form.dataset.bound==="1")return;
const showError=(message)=>{if(!errorMsg||!errorText)return;errorText.textContent=message||"";errorMsg.hidden=!message;errorMsg.style.display=message?"flex":"none";if(window.lucide)lucide.createIcons();};
const showSignupError=(message)=>{if(!signupError||!signupErrorText)return;signupErrorText.textContent=message||"";signupError.hidden=!message;signupError.style.display=message?"flex":"none";if(window.lucide)lucide.createIcons();};
const setLoading=(isLoading)=>{const labelEl=loginBtn.querySelector("span");const spinnerEl=loginBtn.querySelector(".btn-spinner");loginBtn.disabled=isLoading;loginBtn.classList.toggle("is-loading",isLoading);if(labelEl)labelEl.textContent=isLoading?"Memproses":"Login";if(spinnerEl)spinnerEl.hidden=!isLoading;loginBtn.style.cursor=isLoading?"not-allowed":"";};
const setSignupLoading=(isLoading)=>{const labelEl=signupBtn?.querySelector("span");const spinnerEl=signupBtn?.querySelector(".btn-spinner");if(!signupBtn)return;signupBtn.disabled=isLoading;signupBtn.classList.toggle("is-loading",isLoading);if(labelEl)labelEl.textContent=isLoading?"Memproses":"Sign Up";if(spinnerEl)spinnerEl.hidden=!isLoading;};
const showAuthMode=(mode)=>{const isSignup=mode==="signup";if(signupForm)signupForm.hidden=!isSignup;form.hidden=isSignup;if(googleLoginBtn)googleLoginBtn.hidden=isSignup;if(divider)divider.hidden=isSignup;if(rememberRow)rememberRow.hidden=isSignup;if(loginLine)loginLine.hidden=!isSignup;if(signupLink?.parentElement)signupLink.parentElement.hidden=isSignup;showError("");showSignupError("");if(window.lucide)lucide.createIcons();};
const emailRegex=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mapSignupError=(err)=>{const msg=String(err?.message||"").toLowerCase();if(msg.includes("email")&&(msg.includes("already")||msg.includes("registered")||msg.includes("exists")||msg.includes("duplicate")))return "Email sudah dipakai.";if(msg.includes("username")&&(msg.includes("exists")||msg.includes("duplicate")||msg.includes("already")))return "Username sudah dipakai.";if(err?.code==="23505"&&String(err?.details||"").toLowerCase().includes("username"))return "Username sudah dipakai.";if(err?.code==="23505")return "Email sudah dipakai.";return err?.message||"Sign up gagal. Coba lagi.";};
togglePasswordBtn?.addEventListener("click",(e)=>{e.preventDefault();passwordEl.type=passwordEl.type==="password"?"text":"password";const isVisible=passwordEl.type==="text";togglePasswordBtn.setAttribute("aria-pressed",String(isVisible));togglePasswordBtn.innerHTML=`<i data-lucide="${isVisible?"eye":"eye-off"}"></i>`;if(window.lucide)lucide.createIcons();});
signupLink?.addEventListener("click",(e)=>{e.preventDefault();showAuthMode("signup");});
loginLink?.addEventListener("click",(e)=>{e.preventDefault();showAuthMode("login");});
form.addEventListener("submit",async (e)=>{e.preventDefault();showError("");setLoading(true);try{const email=await resolveEmailFromLoginInput(emailEl.value.trim());const {error}=await loginWithEmailPassword(email,passwordEl.value);if(error)throw error;const {data:userData,error:userErr}=await supabase.auth.getUser();if(userErr)throw userErr;user=userData?.user||null;authChecking=false;renderAuthState();if(user){const profile=await fetchUserProfile(user.id);renderSidebarProfile(profile,user);if(!appInitialized){bindNav();bindEvents();bindLogoutButtons();setupSidebar();renderFilters();setMainContentLoading(true);document.getElementById("sheetInfo").textContent=SHEETS.join(", ");document.getElementById("spreadsheetInfo").textContent=SPREADSHEET_ID;renderRecentHistory();routeFromPath(location.pathname);window.addEventListener("popstate",()=>routeFromPath(location.pathname));appInitialized=true;}preloadMainData().catch(err=>console.warn("Main sheet preload gagal",err));await initAppData();}}catch(err){showError(err?.message||"Login gagal. Coba lagi.");}finally{setLoading(false);}});
signupForm?.addEventListener("submit",async(e)=>{e.preventDefault();showSignupError("");const fullNameInput=document.getElementById("signupFullName"),usernameInput=document.getElementById("signupUsername"),emailInput=document.getElementById("signupEmail"),passwordInput=document.getElementById("signupPassword"),confirmPasswordInput=document.getElementById("signupConfirmPassword");const fullName=fullNameInput?.value?.trim()||"";const username=usernameInput?.value?.trim()||"";const email=emailInput?.value?.trim()||"";const password=passwordInput?.value||"";const confirmPassword=confirmPasswordInput?.value||"";if(!fullName||!username||!email||!password||!confirmPassword)return showSignupError("Semua field wajib diisi.");if(username.includes(" "))return showSignupError("Username tidak boleh mengandung spasi.");if(!emailRegex.test(email))return showSignupError("Format email tidak valid.");if(password!==confirmPassword)return showSignupError("Confirm password harus sama.");setSignupLoading(true);try{const {data:authData,error:signupErr}=await supabase.auth.signUp({email,password});console.log("auth signup result",authData,signupErr);let authUserId=authData?.user?.id;if(signupErr){const signupMsg=String(signupErr?.message||"").toLowerCase();const emailExists=signupMsg.includes("email")&&(signupMsg.includes("already")||signupMsg.includes("registered")||signupMsg.includes("exists")||signupMsg.includes("duplicate"));if(!emailExists)throw signupErr;const {data:sessionData,error:sessionErr}=await supabase.auth.getSession();if(sessionErr)throw sessionErr;const {data:userData,error:getUserErr}=await supabase.auth.getUser();if(getUserErr)throw getUserErr;authUserId=userData?.user?.id||sessionData?.session?.user?.id||"";if(!authUserId)throw signupErr;}if(!authUserId)throw new Error("Gagal mendapatkan ID user.");console.log("user id",authUserId);const profilePayload={id:authUserId,email,username,full_name:fullName,role:"User"};console.log("payload public.users",profilePayload);const {error:upsertErr}=await supabase.from("users").upsert(profilePayload,{onConflict:"id"});if(upsertErr){console.log("error upsert",upsertErr);const upsertMsg=String(upsertErr?.message||"").toLowerCase();if(upsertErr?.code==="42501"||upsertMsg.includes("row-level security")||upsertMsg.includes("rls"))return showSignupError("Akun berhasil dibuat, tapi profile gagal disimpan.");throw upsertErr;}signupForm.reset();showAuthMode("login");showError("Registrasi berhasil. Silakan login.");}catch(err){showSignupError(mapSignupError(err));}finally{setSignupLoading(false);}});
showAuthMode("login");
form.dataset.bound="1";
}
function bindNav(){
document.querySelectorAll(".side-link[data-route]").forEach(btn=>btn.addEventListener("click",()=>{navigateTo(btn.dataset.route);closeSidebarMobile();}));
}
function bindEvents(){searchInput?.addEventListener("input",e=>scheduleSearchFilter(e.target?.value||""));sortSearch?.addEventListener("change",()=>renderResults(lastResults,lastQuery));statsFilter?.addEventListener("change",updateStats);darkBtnHeader?.addEventListener("click",toggleDark);refreshToggleHeader?.addEventListener("click",triggerManualRefresh);const din=debounce(()=>renderDataTablePage("in","Barang Masuk"),250),dout=debounce(()=>renderDataTablePage("out","Barang Keluar"),250);inSearch?.addEventListener("input",din);outSearch?.addEventListener("input",dout);window.addEventListener("resize",()=>{document.querySelectorAll("[data-col-filter-menu]:not([hidden])").forEach(menu=>positionColumnFilterMenu(menu));document.querySelectorAll(".mv-columns.open").forEach(panel=>positionColumnMenu(panel.id.replace("mv-cols-","")));});document.addEventListener("change",e=>{const t=e.target;if(t?.matches("[data-mv-filter]")){const m=t.dataset.mvMode;debouncedTableRender(m);}if(t?.closest("[data-col-filter-menu]")&&t?.matches('input[type="checkbox"]')){const menu=t.closest("[data-col-filter-menu]");const mode=menu.dataset.mode,col=menu.dataset.col;const selected=[...menu.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);ensureColumnFilterState(mode);TABLE_STATE[mode].columnFilters[col]=selected;TABLE_STATE[mode].openFilterCol=col;TABLE_STATE[mode].page=1;renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true);}});document.addEventListener("input",e=>{const t=e.target;if(!t?.matches("[data-col-filter-search]"))return;const q=clean(t.value);const menu=t.closest("[data-col-filter-menu]");menu?.querySelectorAll("[data-opt-item]").forEach(item=>{item.style.display=!q||clean(item.textContent).includes(q)?"":"none";});});document.addEventListener("click",e=>{const btn=e.target.closest("[data-search-page]");if(!btn)return;changeSearchPage(Number(btn.dataset.searchPage)||0);});anomalySeverity?.addEventListener("change",()=>renderAnomalyPage());
searchInput?.addEventListener("focus",()=>{if(!searchModalOpen)openSearchModal();});
window.addEventListener("keydown",handleSearchShortcuts);
const clearHistoryBtn=document.getElementById("clearSearchHistory");
clearHistoryBtn?.addEventListener("click",clearSearchHistory);
document.getElementById("recentSearch")?.addEventListener("click",e=>{const btn=e.target.closest("[data-history]");if(!btn)return;searchInput.value=decodeURIComponent(btn.dataset.history||"");SEARCH_STATE.inputValue=searchInput.value;SEARCH_STATE.filterValue=searchInput.value;runSearch();});
anomalyType?.addEventListener("change",()=>renderAnomalyPage());anomalySearch?.addEventListener("input",debounce(()=>renderAnomalyPage(),180));
bindSheetInputForm();
bindArchiveEvents();
document.addEventListener("click",e=>{const btn=e.target.closest("[data-mv-action]");if(btn){const mode=btn.dataset.mvMode;const action=btn.dataset.mvAction;if(action==="reset")return resetMovementFilter(mode);if(action==="export")return exportFilteredCsv(mode);if(action==="prev"||action==="next")return paginateRows(mode,action);if(action==="toggle-filter"){document.getElementById(`mv-filters-${mode}`)?.classList.toggle("open");}if(action==="columns"){toggleColumnMenu(mode);return;}return;}
const accountToggle=e.target.closest("[data-account-menu-toggle]"),accountMenu=document.querySelector("[data-account-menu]");
if(accountToggle){if(accountMenu)accountMenu.hidden=!accountMenu.hidden;return;}
if(accountMenu&&!e.target.closest(".account-card"))accountMenu.hidden=true;
const closeBtn=e.target.closest("[data-mv-columns-close]");if(closeBtn){closeColumnMenus();return;}
if(!e.target.closest(".mv-column-dropdown-wrap"))closeColumnMenus();
const toggle=e.target.closest("[data-col-filter-toggle]");if(toggle){const mode=toggle.dataset.mode,col=toggle.dataset.col;document.querySelectorAll(`[data-col-filter-menu][data-mode="${mode}"]`).forEach(menu=>menu.hidden=true);const menu=document.querySelector(`[data-col-filter-menu][data-mode="${mode}"][data-col="${col}"]`);if(menu){menu.hidden=!menu.hidden;const st=TABLE_STATE[mode];if(st)st.openFilterCol=menu.hidden?"":col;if(!menu.hidden)positionColumnFilterMenu(menu);}return;}
if(e.target.closest("[data-col-filter-menu]")){const menu=e.target.closest("[data-col-filter-menu]");const mode=menu.dataset.mode,col=menu.dataset.col;const st=TABLE_STATE[mode];ensureColumnFilterState(mode);if(e.target.matches("[data-col-filter-clear]")){st.columnFilters[col]=[];st.openFilterCol=col;st.page=1;renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true);}if(e.target.matches("[data-col-filter-all]")){st.columnFilters[col]=getUniqueOptions(applyTableFilters(st.rows,mode,col),col);st.openFilterCol=col;st.page=1;renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true);}return;}
document.querySelectorAll("[data-col-filter-menu]").forEach(menu=>menu.hidden=true);});}
window.addEventListener("keydown",e=>{if(e.key==="Escape")closeColumnMenus();});
function showPage(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));document.getElementById(`page-${page}`).classList.remove("hidden");document.querySelectorAll(".side-link[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));if(!window.__isDataReady){console.log("DATA READY", window.__isDataReady);return;}rerenderCurrentPage();}
function navigateTo(path){history.pushState({},"",path);routeFromPath(path);}
function navigateToSku(sku){const cleanSku=String(sku||"" ).trim();if(!cleanSku)return;navigateTo(`/sku/${encodeURIComponent(cleanSku)}`);}
function goBackToPreviousPage(){if(window.history.length>1){window.history.back();return;}navigateTo('/search');}
function showLoginView(){
authChecking=false;
user=null;
renderAuthState();
bindLoginView();
}

function routeFromPath(path){if(!user)return showLoginView();if(path==="/")return showPage("dashboard");if(path==="/search")return showPage("search");if(path==="/barang-masuk")return showPage("barang-masuk");if(path==="/barang-keluar")return showPage("barang-keluar");if(path==="/accuracy-dashboard"||path==="/accuracy"||path==="/dashboard-akurasi")return showPage("stats");if(path==="/statistics"){history.replaceState({},"","/");return showPage("dashboard");}if(path==="/locations"||path==="/location")return showPage("locations");if(path==="/settings")return showPage("settings");if(path==="/sheet-input")return showPage("sheet-input");if(path==="/arsip")return showPage("arsip");if(path==="/cycle-count")return showPage("cycle-count");if(path==="/movement")return showPage("movement");if(path==="/anomaly"){history.replaceState({},"","/warning");return showPage("anomaly");}if(path==="/warning")return showPage("anomaly");if(path==="/stok-minus")return showPage("stok-minus");if(path.startsWith("/sku/")){currentSku=decodeURIComponent(path.split("/sku/")[1]||"");if(currentSku)showDetail(currentSku);return showPage("detail");}showPage("dashboard");}
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
updateSyncTime();
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
setMainContentLoading(false);
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
setMainContentLoading(false);
const page=getActivePage();
if(page==="dashboard")updateDashboard();
if(page==="stats")updateStats();
if(page==="locations")renderLocationsPage();
if(page==="detail"&&currentSku)showDetail(currentSku);
if(page==="search"&&String(lastQuery||"").trim()){SEARCH_STATE.filterValue=lastQuery;runSearch();}
if(page==="barang-masuk")renderDataTablePage("in","Barang Masuk",true);
if(page==="barang-keluar")renderDataTablePage("out","Barang Keluar",true);
if(page==="anomaly")renderAnomalyPage();
if(page==="stok-minus")renderStokMinusPage();
if(page==="cycle-count")renderCycleCountPage();
if(page==="movement")renderMovementPage();
if(page==="arsip")renderArchivePage();
if(fromCache)setStatus("ready","");
}
async function syncData({force=false,silent=true}={}){
if(isSyncing)return false;
isSyncing=true;
updateSyncUI();
if(!force&&!silent&&Object.keys(DATA).length===0){setStatus("loading","Memuat data dari Google Sheets...");setMainContentLoading(true);}
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
setMainContentLoading(false);
}
}
async function initAppData(){
console.log("INIT APP START");
console.log("CURRENT ROUTE", location.pathname);

if(hasValidData(window.mainDataCache)){
console.log("[initAppData] data dari window.mainDataCache");
applyData(window.mainDataCache,{deferRender:true});
await saveCache(window.mainDataCache);
hideInitialLoader();
setMainContentLoading(false);
rerenderCurrentPage();
startAutoSync();
return;
}

const cachedData=await loadCache();
console.log("CACHE DATA", cachedData);
if(hasValidData(cachedData)){
applyData(cachedData,{fromCache:true});
hideInitialLoader();
setMainContentLoading(false);
rerenderCurrentPage({fromCache:true});
startAutoSync();
if(window.mainDataPromise){
window.mainDataPromise.then(async (preloadedData)=>{
if(!hasValidData(preloadedData))return;
console.log("[initAppData] refresh dari window.mainDataPromise setelah cache");
applyData(preloadedData,{deferRender:true});
await saveCache(preloadedData);
rerenderCurrentPage();
}).catch(err=>console.warn("Preload utama gagal setelah cache",err));
}
return;
}

if(window.mainDataPromise){
try{
const preloadedData=await window.mainDataPromise;
console.log("[initAppData] data dari window.mainDataPromise");
if(hasValidData(preloadedData)){
applyData(preloadedData,{deferRender:true});
await saveCache(preloadedData);
hideInitialLoader();
setMainContentLoading(false);
rerenderCurrentPage();
startAutoSync();
return;
}
}catch(err){
console.warn("Preload utama gagal, lanjut cache/fetch biasa",err);
}
}

try{
await syncData({force:true,silent:false});
}catch(err){
console.warn("Fallback fetch gagal", err);
}
if(!window.__isDataReady){
setStatus("error","Data belum siap dimuat");
}
startAutoSync();
}
function getLastSyncTs(){return Number(localStorage.getItem(CACHE_KEYS.lastSync)||0);}
function shouldAutoSyncNow(){const ts=getLastSyncTs();return !ts||Date.now()-ts>=AUTO_SYNC_INTERVAL_MS;}
function maybeAutoSync(){if(shouldAutoSyncNow())syncData({force:true,silent:true});}
function startAutoSync(){
maybeAutoSync();
setInterval(maybeAutoSync,AUTO_SYNC_CHECK_INTERVAL_MS);
}

async function loadAllData(manual=true,silent=false){return syncData({force:!!manual,silent:!!silent});}
async function fetchSheet(sheetName){const range=`${sheetName}!A1:ZZ`;const url=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;const res=await fetch(url);const json=await res.json();if(!res.ok||json.error) throw new Error(`${sheetName}: ${(json.error&&json.error.message)||res.statusText}`);return json.values||[];}
function parseSheet(values){if(!Array.isArray(values)||!values.length)return[];const h=detectHeaderIndex(values);if(h<0)return[];const headers=values[h].map((v,i)=>normalizeHeader(v)||`col_${i+1}`);const rows=[];for(let r=h+1;r<values.length;r++){const row=values[r]||[];if(!row.length||row.every(c=>!String(c||"").trim()))continue;const obj={};headers.forEach((k,i)=>obj[k]=row[i]||"");rows.push(obj);}return rows;}
function detectHeaderIndex(values){const req=["sku","nama","nama barang","item","description","qty","tanggal","from","to","lokasi"];let bi=-1,bs=0;for(let i=0;i<Math.min(values.length,25);i++){const t=(values[i]||[]).map(clean).join("|");let s=0;req.forEach(k=>t.includes(clean(k))&&s++);if(s>bs){bs=s;bi=i;}}return bs>=1?bi:-1;}
function rebuildSkuCache(){CACHE_SKU=new Map();for(const sheet of SHEETS){for(const row of DATA[sheet]||[]){const sku=getVal(row,["sku"]);const name=getVal(row,["nama barang","nama","item","description"]);const key=clean(sku||name);if(!key)continue;if(!CACHE_SKU.has(key))CACHE_SKU.set(key,{sku:sku||"-",nama:name||"-",sources:new Set(),rows:[]});const it=CACHE_SKU.get(key);it.sources.add(sheet);it.rows.push({sheet,row});}}}
function scheduleSearchFilter(nextValue){
SEARCH_STATE.inputValue=String(nextValue||"");
clearTimeout(SEARCH_STATE.debounceTimer);
SEARCH_STATE.debounceTimer=setTimeout(()=>{
const run=()=>{SEARCH_STATE.filterValue=SEARCH_STATE.inputValue;runSearch();};
if(typeof requestIdleCallback==="function"){requestIdleCallback(run,{timeout:250});return;}
if(SEARCH_STATE.idleTimer)clearTimeout(SEARCH_STATE.idleTimer);
SEARCH_STATE.idleTimer=setTimeout(run,0);
},400);
}
function runSearch(){const qRaw=SEARCH_STATE.filterValue||"";const q=clean(qRaw);const prevQuery=lastQuery;lastQuery=qRaw;if(!q){lastResults=[];SEARCH_STATE.page=1;renderRecentHistory();return renderState("results","Masukkan kata kunci pencarian.");}saveRecentSearch(qRaw);const words=q.split(" ").filter(Boolean);const isMultiWord=words.length>1;const out=[];for(const it of CACHE_SKU.values()){if(currentFilter!=="Semua"&&!it.sources.has(currentFilter))continue;const skuRaw=String(it.sku||"");const skuN=clean(skuRaw),nameN=clean(it.nama);const searchableLocations=(it.rows||[]).map(x=>getVal(x?.row,["lokasi","location","rak","bin","area"])).filter(Boolean).join(" ");const descriptions=(it.rows||[]).map(x=>getVal(x?.row,["description","item name","item","nama barang","nama"])).filter(Boolean).join(" ");const combined=clean(`${skuRaw} ${it.nama||""} ${descriptions} ${searchableLocations}`);if(isMultiWord){const allWordsMatch=words.every(word=>combined.includes(word));if(!allWordsMatch)continue;}let rank=99;if(skuN===q)rank=1;else if(/^\d{4}$/.test(q)&&skuRaw.replace(/\D/g,"").endsWith(q))rank=2;else if(skuN.includes(q))rank=3;else if(nameN===q)rank=4;else if(words.length&&words.every(w=>combined.includes(w)))rank=5;else if(!isMultiWord&&words.some(w=>combined.includes(w)))rank=6;if(rank<99)out.push({...it,sources:[...it.sources],rank});}
const nextResults=out.sort((a,b)=>a.rank-b.rank||a.sku.localeCompare(b.sku));
if(nextResults.length!==lastResults.length||clean(prevQuery)!==clean(qRaw))SEARCH_STATE.page=1;
lastResults=nextResults;
renderResults(lastResults,qRaw);}
function changeSearchPage(delta){if(!delta)return;const totalPage=Math.max(1,Math.ceil(lastResults.length/SEARCH_STATE.pageSize));SEARCH_STATE.page=Math.max(1,Math.min(totalPage,SEARCH_STATE.page+delta));renderResults(lastResults,lastQuery);}
function renderResults(items,query){if(sortSearch.value==="sku")items=[...items].sort((a,b)=>a.sku.localeCompare(b.sku));if(sortSearch.value==="name")items=[...items].sort((a,b)=>a.nama.localeCompare(b.nama));if(!items.length) return renderState("results","Data tidak ditemukan.");const total=items.length;const totalPage=Math.max(1,Math.ceil(total/SEARCH_STATE.pageSize));if(SEARCH_STATE.page>totalPage)SEARCH_STATE.page=totalPage;const startIdx=(SEARCH_STATE.page-1)*SEARCH_STATE.pageSize;const pageItems=items.slice(startIdx,startIdx+SEARCH_STATE.pageSize);const start=total?startIdx+1:0,end=Math.min(startIdx+SEARCH_STATE.pageSize,total);const resultsNode=document.getElementById("results");if(!resultsNode)return;resultsNode.innerHTML=`<div class='subtitle'>${total} hasil.</div><div class='result-list'></div><div class='mv-pagination'><span>Menampilkan ${start}–${end} dari ${total} data</span><div class='row'><button class='btn-ghost' data-search-page='-1'>Prev</button><button class='btn-ghost' data-search-page='1'>Next</button></div></div>`;const listNode=resultsNode.querySelector(".result-list");pageItems.forEach(r=>{const card=document.createElement("div");card.className="result-card";const badgesHtml=r.sources.filter(s=>!['Barang Masuk','Barang Keluar'].includes(s)).map(s=>`<span class='badge ${badgeClass(s)}'>${esc(s)}</span>`).join(" ");card.innerHTML=`<div class='result-head'><div><strong data-highlight='nama'></strong><div>SKU: <span data-highlight='sku'></span></div></div><div>${badgesHtml}</div></div><div class='row'><button class='btn-ghost copy-mini-btn' data-copy-sku onclick="copySku(decodeURIComponent('${encAttr(r.sku)}'),this)"><span aria-hidden='true'>⧉</span><span>Copy SKU</span></button><button class='btn-primary' onclick="showDetail(decodeURIComponent('${encAttr(r.sku)}'));navigateTo('/sku/'+encodeURIComponent(decodeURIComponent('${encAttr(r.sku)}')))">Lihat Detail</button></div>`;const namaEl=card.querySelector("[data-highlight='nama']");const skuEl=card.querySelector("[data-highlight='sku']");highlightText(r.nama,query).forEach(node=>namaEl.append(node));highlightText(r.sku,query).forEach(node=>skuEl.append(node));listNode?.append(card);});}
function showDetail(identifier){const key=clean(identifier);const sel=[...CACHE_SKU.values()].find(r=>clean(r.sku)===key||clean(r.nama)===key);if(!sel) return renderState("detail","Detail tidak tersedia.");
const sku=sel.sku,nama=sel.nama;const bySheet={};SHEETS.forEach(sheet=>{bySheet[sheet]=(DATA[sheet]||[]).filter(r=>clean(getVal(r,["sku"]))===clean(sku));});
const inRows=bySheet["Barang Masuk"]||[],outRows=bySheet["Barang Keluar"]||[];
const tIn=inRows.reduce((n,r)=>n+parseNumber(getVal(r,["qty"])),0),tOut=outRows.reduce((n,r)=>n+parseNumber(getVal(r,["qty"])),0);
const kartuRows=bySheet["Kartu Stock"]||[];
const tAvailable=kartuRows.reduce((n,r)=>n+parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"])),0);
const locationSet=new Set();
for(const r of (bySheet["Kartu Stock"]||[])){const stokAkhir=parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"]));if(stokAkhir<=0)continue;for(const k of Object.keys(r||{})){const nk=clean(k);if(["lokasi","location","rak","bin","area"].some(x=>nk.includes(x))){const v=r[k];if(v)locationSet.add(String(v).trim());}}}
const summary=[["Baris Kartu Stock",bySheet["Kartu Stock"].length],["Baris RPL",bySheet["RPL"].length],["Baris BULKY",bySheet["BULKY"].length],["Total Qty Masuk",tIn],["Total Qty Keluar",tOut],["Total Qty Tersedia",tAvailable]];
const sourceList=Array.isArray(sel.sources)?sel.sources:[...sel.sources||[]];
let html=`<div class='detail-profile'><div class='detail-hero'><div class='detail-top'><div><div class='detail-name'>${esc(nama)}</div><div class='detail-sku'>SKU: <strong>${esc(sku)}</strong> <button class='btn-ghost copy-mini-btn' data-copy-sku onclick="copySku(decodeURIComponent('${encAttr(sku)}'),this)"><span aria-hidden='true'>⧉</span><span>Copy SKU</span></button></div></div><button class='btn-primary' onclick="goBackToPreviousPage()"><span aria-hidden='true'>←</span><span>Kembali ke hasil pencarian</span></button></div><div class='source-row'>${sourceList.map(s=>`<span class='badge ${badgeClass(s)}'>${esc(s)}</span>`).join(" ")}</div></div>`;
html+=`<div class='summary-grid'>${summary.map(([k,v])=>`<div class='summary-card'><div class='k'>${k}</div><div class='v'>${esc(v)}</div></div>`).join("")}</div>`;
html+=`<div class='detail-note'><div class='note-box'><div class='note-title'>Lokasi</div><div class='note-value'>${locationSet.size?[...locationSet].slice(0,12).map(esc).join(", "):"-"}</div></div></div>`;
for(const sheet of SHEETS){const rows=bySheet[sheet];html+=`<details class='source-card' ${rows.length?'open':''}><summary><span><span class='badge ${badgeClass(sheet)}'>${sheet}</span></span><span>${rows.length} baris</span></summary><div class='source-body'>${renderTable(rows)}</div></details>`;}
html+="</div>";detail.innerHTML=html;}
function renderTable(rows){if(!rows.length) return `<div class='empty-card'><strong>Data kosong</strong><div>Tidak ada baris untuk sumber ini.</div></div>`;const headers=Object.keys(rows[0]);let h=`<div class='table-wrap'><table><thead><tr>${headers.map(x=>`<th>${esc(String(x).toUpperCase())}</th>`).join("")}</tr></thead><tbody>`;rows.forEach(r=>h+=`<tr>${headers.map(k=>`<td>${esc(r[k])}</td>`).join("")}</tr>`);h+=`</tbody></table></div><div class='mv-pagination'><span>Menampilkan ${rows.length} dari ${rows.length} data</span></div>`;return h;}

function renderInsightCard(insight){
if(!insight||insight.empty)return `<div class='insight-card'><div class='state'>Belum ada data untuk dianalisis</div></div>`;
return `<div class='insight-card'>${insight.categories.map(cat=>`<div class='insight-group'><h4>${cat.title}</h4><ul>${cat.items.map(it=>`<li><span class='insight-dot'>•</span><span>${it}</span></li>`).join("")}</ul></div>`).join("")}</div>`;
}
function normalizeStatus(value){return String(value??"").trim().toLowerCase();}
function isBarangMasukCountRow(row){return normalizeStatus(getVal(row,["status","status movement","status_movement","movement status"]))==="barang masuk";}
function isBarangMasukTableRow(row){const status=normalizeStatus(getVal(row,["status","status movement","status_movement","movement status"]));return status==="barang masuk"||status==="movement";}
function debugBarangMasukRows(rows,label="Barang Masuk",predicate=isBarangMasukCountRow){
const normalizedRows=Array.isArray(rows)?rows:[];
const included=normalizedRows.filter(predicate);
const uniqueStatuses=[...new Set(normalizedRows.map(row=>normalizeStatus(getVal(row,["status","status movement","status_movement","movement status"]))).filter(Boolean))].slice(0,20);
console.table([{source:label,totalRawRows:normalizedRows.length,totalStatusBarangMasuk:included.length,totalExcludedRows:normalizedRows.length-included.length,uniqueStatusSamples:uniqueStatuses.join(", ")}]);
return included;
}
function updateDashboard(){const skuSet=new Set();const totals={};SHEETS.forEach(s=>{totals[s]=(DATA[s]||[]).length;if(s==="Barang Masuk")totals[s]=(DATA[s]||[]).filter(r=>clean(getVal(r,["sku"]))).length;(DATA[s]||[]).forEach(r=>{const sku=getVal(r,["sku"]);if(sku)skuSet.add(clean(sku));});});
const lokasiTerpakaiSet=new Set();(DATA["Kartu Stock"]||[]).forEach(r=>{const lokasiRaw=getVal(r,["lokasi","location","rak","bin","area"]);const stokAkhir=parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"]));if(!lokasiRaw||stokAkhir<=0)return;const parsed=parseLocationCode(lokasiRaw);if(parsed.valid&&!parsed.blocked)lokasiTerpakaiSet.add(parsed.raw);});
const TOTAL_LOKASI_AKTIF=getAllValidLocations().length,lokasiTerpakai=lokasiTerpakaiSet.size,lokasiTersisa=Math.max(TOTAL_LOKASI_AKTIF-lokasiTerpakai,0);
const barangMasukRows=debugBarangMasukRows(DATA["Barang Masuk"]||[],"Dashboard",isBarangMasukCountRow);
const inSummary=getDailyMovementSummary(barangMasukRows,"all");
const outSummary=getDailyMovementSummary(DATA["Barang Keluar"]||[],"pengeluaran");
const movementSummary=getDailyStatusSummary(DATA["Barang Masuk"]||[],"movement");
const cards=[
{name:"Total SKU",value:skuSet.size},
{name:"Baris Kartu Stock",value:totals["Kartu Stock"]},
{name:"Baris RPL",value:totals["RPL"]},
{name:"Baris BULKY",value:totals["BULKY"]},
{name:"Barang Masuk",value:inSummary.totalCount,delta:`+${inSummary.todayCount} hari ini`,deltaClass:"metric-delta metric-delta--in"},
{name:"Barang Keluar",value:outSummary.totalCount,delta:`+${outSummary.todayCount} hari ini`,deltaClass:"metric-delta metric-delta--out"},
{name:"Total Movement",value:movementSummary.totalCount,delta:`+${movementSummary.todayCount} hari ini`,deltaClass:"metric-delta metric-delta--neutral"},
{name:"Lokasi tersisa",value:lokasiTersisa}
];
dashboardCards.innerHTML=cards.map(c=>`<div class='metric'><div class='k'>${c.name}</div><div class='row' style='justify-content:space-between;align-items:center;gap:8px'><div class='v'>${c.value}</div>${c.delta?`<div class='${c.deltaClass||"metric-delta"}'>${c.delta}</div>`:""}</div></div>`).join("");
const inRows=getLatestRows("Barang Masuk",50,true),outRows=getLatestRows("Barang Keluar",50);
const dashInsight=buildAutoInsight(DATA,{accuracyRows:[]});
recentMove.innerHTML=`${renderInsightCard(dashInsight)}<div class='dashboard-sections'>
${renderDashboardTableSection("Barang Masuk","Data terbaru dari sheet Barang Masuk",inRows,"b-in")}
${renderDashboardTableSection("Barang Keluar","Data terbaru dari sheet Barang Keluar",outRows,"b-out")}
</div>`;}
function getLatestRows(sheetName,limit=50,requireSku=false){let rows=(DATA[sheetName]||[]).slice();if(requireSku)rows=rows.filter(r=>clean(getVal(r,["sku"])));return rows.reverse().slice(0,limit);}
function getDailyStatusSummary(rows,expectedStatus){
const todayKey=getTodayDateKey();
let totalCount=0,todayCount=0;
for(const row of rows){
const status=clean(getVal(row,["status","status movement","status_movement","movement status"]));
if(!status.includes(clean(expectedStatus)))continue;
const dateKey=parseDateKey(getVal(row,["tanggal","date","created at","waktu"]));
if(!dateKey)continue;
totalCount++;
if(dateKey===todayKey)todayCount++;
}
return{totalCount,todayCount};
}
function getDailyMovementSummary(rows,expectedType){
const todayKey=getTodayDateKey();
let totalQty=0,todayQty=0;
let totalCount=0,todayCount=0;
for(const row of rows){
if(expectedType!=="all"&&clean(getVal(row,["keterangan","description","tipe"]))!==clean(expectedType))continue;
const qty=Math.abs(parseNumber(getVal(row,["qty"])));
const dateKey=parseDateKey(getVal(row,["tanggal","date","created at","waktu"]));
if(!dateKey)continue;
totalCount++;
totalQty+=qty;
if(dateKey===todayKey){todayQty+=qty;todayCount++;}
}
return{totalQty,todayQty,totalCount,todayCount};
}
function getTodayDateKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function parseDateKey(value){
const raw=String(value||"").trim();if(!raw)return "";
const m=raw.replace(/\./g,"/").replace(/-/g,"/").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
if(m){let y=Number(m[3]);if(y<100)y+=2000;const d=new Date(y,Number(m[2])-1,Number(m[1]));if(Number.isNaN(d.getTime()))return "";return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
const d=new Date(raw);if(Number.isNaN(d.getTime()))return "";
return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function renderDashboardTableSection(title,subtitle,rows,badgeClassName){const badgeText=`${rows.length} terbaru`;return `<section class='dashboard-section'><div class='card'><div class='section-header'><div><h4>${esc(title)}</h4><small class='section-subtitle'>${esc(subtitle)}</small></div><span class='badge ${badgeClassName}'>${esc(badgeText)}</span></div>${renderDashboardSheetTable(rows,title)}</div></section>`;}
function renderDashboardSheetTable(rows,title){if(!rows.length)return `<div class='empty-card'><strong>Data kosong</strong><div>Belum ada data pada section ${esc(title)}.</div></div>`;const headers=[];rows.forEach(row=>Object.keys(row||{}).forEach(k=>{if(!headers.includes(k))headers.push(k);}));const th=headers.map(h=>`<th>${esc(String(h).toUpperCase())}</th>`).join("");const tr=rows.map(row=>`<tr>${headers.map(k=>`<td>${esc(row[k]??"")}</td>`).join("")}</tr>`).join("");return `<div class='table-scroll'><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;}
function normMv(row,type,sheet){
const sku=getVal(row,["sku"])||"-";
const nama=getVal(row,["nama barang","nama","item","description"])||"-";
const qty=parseNumber(getVal(row,["qty"]));
const tanggal=getVal(row,["tanggal","date","created at","waktu"])||"-";
return{sku,nama,qty,tanggal,type,sheet,row};
}
const STATS_STATE={page:1,pageSize:25,searchInputValue:"",debouncedSearchValue:"",sort:"absDesc",isFiltering:false,_normalizedRows:null,_debounceTimer:null,_idleTimer:null};
function renderStatsFilteringState(){const el=document.getElementById("statsFilterState");if(el)el.textContent=STATS_STATE.isFiltering?"Memfilter...":"";}
function scheduleStatsFilter(){
  STATS_STATE.isFiltering=true;renderStatsFilteringState();
  if(STATS_STATE._idleTimer){clearTimeout(STATS_STATE._idleTimer);STATS_STATE._idleTimer=null;}
  const run=()=>{STATS_STATE._idleTimer=setTimeout(()=>{STATS_STATE.debouncedSearchValue=STATS_STATE.searchInputValue;STATS_STATE.page=1;STATS_STATE.isFiltering=false;updateStatsTableOnly();renderStatsFilteringState();},0);};
  if(typeof window.requestIdleCallback==="function")window.requestIdleCallback(run,{timeout:400});else run();
}
function getFilteredStatsRows(){
  const rows=STATS_STATE._normalizedRows||[];
  const q=clean(STATS_STATE.debouncedSearchValue||"");
  const sorter={absDesc:(a,b)=>b.selisihAbs-a.selisihAbs,absAsc:(a,b)=>a.selisihAbs-b.selisihAbs,sku:(a,b)=>a.sku.localeCompare(b.sku)};
  return [...rows.filter(r=>!q||r._searchText.includes(q))].sort(sorter[STATS_STATE.sort]||sorter.absDesc);
}
function updateStatsTableOnly(){
  const tableRows=getFilteredStatsRows();
  const maxPage=Math.max(1,Math.ceil(tableRows.length/STATS_STATE.pageSize));if(STATS_STATE.page>maxPage)STATS_STATE.page=maxPage;
  const paged=tableRows.slice((STATS_STATE.page-1)*STATS_STATE.pageSize,STATS_STATE.page*STATS_STATE.pageSize);
  const tbody=document.getElementById("statsTbody");const paging=document.getElementById("statsPagingText");
  if(tbody)tbody.innerHTML=paged.map(r=>`<tr class='${r.selisih!==0?"row-mismatch":""}'><td title='${encAttr(r.lokasiText)}'>${esc(r.lokasiText)}</td><td>${esc(r.sku)}</td><td><div class='nama-barang'>${esc(r.nama)}</div></td><td class='${r.selisih!==0?"txt-danger":""}'>${r.selisih}</td><td class='action-cell'><button class='detail-mini-btn' type='button' onclick="navigateToSku(decodeURIComponent('${encAttr(r.sku)}'))">Lihat SKU</button></td></tr>`).join("")||`<tr><td colspan='5'><div class='state'>Tidak ada data.</div></td></tr>`;
  if(paging)paging.textContent=`Menampilkan ${(tableRows.length?((STATS_STATE.page-1)*STATS_STATE.pageSize+1):0)}–${Math.min(STATS_STATE.page*STATS_STATE.pageSize,tableRows.length)} dari ${tableRows.length} data`;
}
function updateStats(){
const rows=[...(DATA["RPL"]||[]),...(DATA["BULKY"]||[])].filter(r=>clean(getVal(r,["sku"])));
if(!rows.length){statsCards.innerHTML="";statsChart.innerHTML="<div class='state'>Sheet RPL/BULKY belum ada data.</div>";return;}
const norm=rows.map(r=>{const sel=parseNumber(getVal(r,["selisih","selisih kartu stok","selisih kartu stock","selisih kartu stok vs iseller","selisih kartu stok vs netsuite"]));const iseller=parseNumber(getVal(r,["stok iseller","iseller"]));const netsuite=parseNumber(getVal(r,["stok netsuite","netsuite"]));return{lokasi:getVal(r,["lokasi"])||"-",sku:getVal(r,["sku"])||"-",nama:getVal(r,["nama barang","nama"])||"-",stokBulky:parseNumber(getVal(r,["stok bulky"])),stokRetail:parseNumber(getVal(r,["stok retail"])),stokGlobal:parseNumber(getVal(r,["stok global","kartu stok","stok kartu","stok kartu stok"])),iseller,netsuite,selisih:sel,status:getVal(r,["status"])||"-",selisihAbs:Math.abs(sel),nsIseller:getVal(r,["ns dan iseller","iseller vs netsuite"])||"-"};});
const totalSku=norm.length,skuAkurat=norm.filter(r=>r.selisih===0).length,skuTidakAkurat=totalSku-skuAkurat,akurasi=totalSku?((skuAkurat/totalSku)*100):0,selisihTotal=norm.reduce((n,r)=>n+r.selisih,0);
statsCards.innerHTML=[["Total SKU",totalSku,""],["Akurat (%)",`${akurasi.toFixed(2)}%`,"ok"],["Tidak Akurat",skuTidakAkurat,"err"],["Selisih Total",selisihTotal,"warn"]].map(c=>`<div class='metric ${c[2]||""}'><div class='k'>${c[0]}</div><div class='v'>${esc(c[1])}</div></div>`).join("");
const bySku=new Map();
norm.forEach(r=>{const key=clean(r.sku);if(!key)return;if(!bySku.has(key))bySku.set(key,{sku:r.sku,nama:r.nama,lokasiSet:new Set(),selisih:0,selisihAbs:0});const it=bySku.get(key);if(it.nama==="-"&&r.nama!=="-")it.nama=r.nama;if(r.lokasi&&r.lokasi!=="-")it.lokasiSet.add(String(r.lokasi));it.selisih+=Number(r.selisih)||0;it.selisihAbs=Math.abs(it.selisih);});
const aggregated=[...bySku.values()].map(r=>({...r,lokasi:[...r.lokasiSet],lokasiText:[...r.lokasiSet].length?[...r.lokasiSet].join(", "):"-"}));
STATS_STATE._normalizedRows=aggregated.map(r=>({...r,_searchText:clean(`${r.sku} ${r.nama} ${r.lokasiText}`)}));
statsChart.innerHTML=`<div class='mv-toolbar stats-toolbar'>
<label class='stats-search-field'><span>Cari SKU / Nama / Lokasi</span><input id='statsSearch' placeholder='Ketik kata kunci...' value='${esc(STATS_STATE.searchInputValue)}'></label>
<select id='statsSort' aria-label='Urutkan data'><option value='absDesc'>Selisih terbesar</option><option value='absAsc'>Selisih terkecil</option><option value='sku'>SKU A-Z</option></select>
<select id='statsSize' aria-label='Jumlah data per halaman'><option value='25'>25 / halaman</option><option value='50'>50 / halaman</option><option value='100'>100 / halaman</option></select><small id='statsFilterState' class='stats-filtering-indicator'></small></div>
<div class='stats-table-shell'><div class='table-wrap table-wrap-full stats-table-wrap'><table><thead><tr><th>LOKASI</th><th>SKU</th><th>NAMA BARANG</th><th>SELISIH</th><th>AKSI</th></tr></thead><tbody id='statsTbody'></tbody></table></div></div>
<div class='mv-pagination stats-pagination'><span id='statsPagingText'></span><div class='row'><button class='btn-ghost' id='statsPrev'>Prev</button><button class='btn-ghost' id='statsNext'>Next</button></div></div>`;
document.getElementById("statsSearch")?.addEventListener("input",e=>{STATS_STATE.searchInputValue=e.target.value;clearTimeout(STATS_STATE._debounceTimer);STATS_STATE._debounceTimer=setTimeout(scheduleStatsFilter,350);renderStatsFilteringState();});
document.getElementById("statsSort")&&(document.getElementById("statsSort").value=STATS_STATE.sort);
document.getElementById("statsSize")&&(document.getElementById("statsSize").value=String(STATS_STATE.pageSize));
document.getElementById("statsSort")?.addEventListener("change",e=>{STATS_STATE.sort=e.target.value;updateStatsTableOnly();});
document.getElementById("statsSize")?.addEventListener("change",e=>{STATS_STATE.pageSize=Number(e.target.value)||25;STATS_STATE.page=1;updateStatsTableOnly();});
document.getElementById("statsPrev")?.addEventListener("click",()=>{STATS_STATE.page=Math.max(1,STATS_STATE.page-1);updateStatsTableOnly();});
document.getElementById("statsNext")?.addEventListener("click",()=>{const maxPage=Math.max(1,Math.ceil(getFilteredStatsRows().length/STATS_STATE.pageSize));STATS_STATE.page=Math.min(maxPage,STATS_STATE.page+1);updateStatsTableOnly();});
updateStatsTableOnly();renderStatsFilteringState();
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
function updateSettings(){loadedState.textContent=apiConnected?"Loaded":"Belum loaded";countPerSheet.textContent=SHEETS.map(s=>`${s}: ${(DATA[s]||[]).length}`).join(" | ");updateSettingsDashboard();}
function formatSyncDate(ts){if(!ts)return "-";return new Date(ts).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"});}
function getSystemStatusMeta(){
  if(isSyncing)return {label:"Loading",dot:"loading"};
  if(!apiConnected)return {label:"Error",dot:"error"};
  return {label:"Normal",dot:"ok"};
}
function updateSettingsDashboard(){
  if(!settingsDataSources)return;
  const sheetMap={"Barang Masuk":"Barang Masuk","Barang Keluar":"Barang Keluar","Kartu Stock":"Kartu Stock","RPL":"RPL","BULKY":"BULKY","Dashboard Akurasi":"Kartu Stock"};
  const icons={"Barang Masuk":"arrow-down-to-line","Barang Keluar":"arrow-up-from-line","Kartu Stock":"package-search","RPL":"clipboard-list","BULKY":"boxes","Dashboard Akurasi":"shield-check"};
  const totalRows=Object.values(DATA).reduce((n,rows)=>n+(Array.isArray(rows)?rows.length:0),0);
  const lastTs=getLastSyncTs();
  const status=getSystemStatusMeta();
  settingsLastRefresh.textContent=formatSyncDate(lastTs);
  settingsTotalRows.textContent=`${totalRows.toLocaleString("id-ID")} row`;
  settingsSystemStatus.textContent=status.label;
  settingsSystemDot.className=`status-dot ${status.dot}`;
  settingsCacheStatus.textContent=lastTs?"Aktif":"Tidak aktif";
  settingsCacheTime.textContent=formatSyncDate(lastTs);
  settingsDataSources.innerHTML=Object.entries(sheetMap).map(([label,key])=>{
    const count=(DATA[key]||[]).length;
    const tag=!apiConnected?"error":(count>0?"ok":"empty");
    const txt=!apiConnected?"error":(count>0?"tersedia":"kosong");
    const active=!apiConnected?"Tidak ada data":(count>0?"Aktif":"Tidak ada data");
    return `<div class='settings-source-item'><div class='settings-source-main'><i data-lucide='${icons[label]||"database"}'></i><div><strong>${label}</strong><small>${active}</small></div></div><div class='settings-source-meta'><span>${count.toLocaleString("id-ID")} row</span><em class='${tag}'>${txt}</em></div></div>`;
  }).join("");
  if(window.lucide)lucide.createIcons();
}
function renderFilters(){const searchFilters=FILTERS.filter(f=>!["Barang Masuk","Barang Keluar"].includes(f));filterRow.innerHTML=searchFilters.map(f=>`<button class='chip ${f===currentFilter?"active":""}' onclick="setFilter(decodeURIComponent('${encAttr(f)}'))">${esc(f)}</button>`).join("");if(!searchFilters.includes(currentFilter)){currentFilter="Semua";}}
function setFilter(f){currentFilter=f;renderFilters();SEARCH_STATE.filterValue=SEARCH_STATE.inputValue||searchInput?.value||lastQuery||"";runSearch();}
function setMainContentLoading(isLoading){
if(mainContentSkeleton){mainContentSkeleton.classList.toggle("hidden",!isLoading);}
if(mainContentPages){mainContentPages.classList.toggle("hidden",!!isLoading);}
}
function initDashboard(){setMainContentLoading(true);}
function setStatus(type,text){statusEl.textContent=type==="loading"?`⏳ ${text}`:(type==="error"?`❌ ${text}`:text)}
function updateSyncUI(){
const refreshBtn=document.querySelector("[data-refresh-btn]");
if(refreshBtn){refreshBtn.classList.toggle("is-syncing",isSyncing);refreshBtn.disabled=!!isSyncing;}
if(refreshToggleHeader){refreshToggleHeader.classList.toggle("is-syncing",isSyncing);refreshToggleHeader.disabled=!!isSyncing;}
}
function renderState(id,text){document.getElementById(id).innerHTML=`<div class='state'>${esc(text)}</div>`;} function renderError(id,text){document.getElementById(id).innerHTML=`<div class='state error'>${esc(text)}</div>`;}
function updateSyncTime(){const ts=Number(localStorage.getItem(CACHE_KEYS.lastSync)||Date.now());lastSync.textContent="Sync: "+new Date(ts).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});updateSettingsDashboard();}
function updateApiState(){const t=apiConnected?"Terhubung":"Tidak terhubung";settingsApiState.textContent=t;sidebarApi.textContent="";updateSettingsDashboard();}
async function clearSystemCache(){
  showConfirmModal({title:'Hapus Cache',message:'Hapus cache lokal sekarang?',confirmText:'Hapus',cancelText:'Batal',type:'danger',onConfirm:async()=>{await clearCache();updateSettingsDashboard();toast("Cache berhasil dibersihkan","success");}});
}
function showCopyButtonFeedback(btn){if(!btn)return;const label=btn.querySelector('span:last-child');if(!label)return;const prev=label.textContent;btn.classList.add('is-copied');label.textContent='Copied';clearTimeout(btn._copyTimer);btn._copyTimer=setTimeout(()=>{label.textContent=prev;btn.classList.remove('is-copied');},1200);}
function copySku(sku,btn){navigator.clipboard.writeText(sku||"").then(()=>{showCopyButtonFeedback(btn);toast(`SKU ${sku} disalin`);});}
function copyText(value,message,btn){navigator.clipboard.writeText(value||"").then(()=>{showCopyButtonFeedback(btn);toast(message);});}
function applyTheme(){const saved=localStorage.getItem("theme");const theme=saved||"dark";document.documentElement.setAttribute("data-theme",theme);document.body.classList.toggle("dark",theme==="dark");syncThemeButton();syncRefreshButton();}
function toggleDark(){const nextTheme=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",nextTheme);document.body.classList.toggle("dark",nextTheme==="dark");localStorage.setItem("theme",nextTheme);syncThemeButton();}
function syncThemeButton(){if(!darkBtnHeader)return;const dark=document.documentElement.getAttribute("data-theme")==="dark";darkBtnHeader.innerHTML=`<i data-lucide="${dark?"sun":"moon-star"}"></i>`;if(window.lucide)lucide.createIcons();}

async function triggerManualRefresh(){if(isSyncing)return;await loadAllData(true);}
function syncRefreshButton(){if(!refreshToggleHeader)return;refreshToggleHeader.innerHTML=`<i data-lucide="refresh-cw"></i>`;refreshToggleHeader.title="Refresh data manual";refreshToggleHeader.setAttribute("aria-label","Refresh data manual");if(window.lucide)lucide.createIcons();}
function hideInitialLoader(){const ld=document.getElementById("initialLoader");if(ld)ld.remove();}
function toggleCompact(){document.body.classList.toggle("compact");toast("Compact mode diubah");}
function toast(msg,type="info",showClose=true){const t=document.getElementById("toast");if(!t)return;const map={success:"✓",error:"⨯",warning:"!",info:"i"};const item=document.createElement("div");item.className=`toast-item ${map[type]?type:"info"}`;const closeBtn=showClose?'<button class="toast-close" aria-label="Tutup" type="button">×</button>':"";item.innerHTML=`<span class="toast-icon" aria-hidden="true">${map[type]||map.info}</span><span class="toast-message">${esc(msg||"")}</span>${closeBtn}`;t.appendChild(item);requestAnimationFrame(()=>item.classList.add("show"));const remove=()=>{item.classList.remove("show");setTimeout(()=>item.remove(),220);};item.querySelector(".toast-close")?.addEventListener("click",remove);setTimeout(remove,2500);}

function showConfirmModal({title='Konfirmasi',message='',confirmText='Ya',cancelText='Batal',type='default',onConfirm}={}){
  const root=document.getElementById('confirmModalRoot');
  if(!root){if(typeof onConfirm==='function')onConfirm();return;}
  const confirmClass=type==='danger'?'btn-primary confirm-modal-confirm danger':'btn-primary confirm-modal-confirm';
  root.innerHTML=`<div class='confirm-modal' role='dialog' aria-modal='true' aria-labelledby='confirmModalTitle'><div class='confirm-modal-card'><div class='confirm-modal-head'><div class='confirm-modal-badge' aria-hidden='true'>${type==='danger'?'!':'?'}</div><h4 id='confirmModalTitle' class='confirm-modal-title'>${esc(title)}</h4></div><p class='confirm-modal-message'>${esc(message)}</p><div class='confirm-modal-actions'><button type='button' class='btn-ghost' data-confirm-cancel>${esc(cancelText)}</button><button type='button' class='${confirmClass}' data-confirm-ok>${esc(confirmText)}</button></div></div></div>`;
  root.classList.add('show');
  root.setAttribute('aria-hidden','false');
  const close=()=>{root.classList.remove('show');root.setAttribute('aria-hidden','true');root.innerHTML='';document.removeEventListener('keydown',onKeydown);};
  const onKeydown=(ev)=>{if(ev.key==='Escape')close();};
  root.querySelector('[data-confirm-cancel]')?.addEventListener('click',close);
  root.querySelector('[data-confirm-ok]')?.addEventListener('click',()=>{close();if(typeof onConfirm==='function')onConfirm();});
  root.querySelector('.confirm-modal')?.addEventListener('click',ev=>{if(ev.target===ev.currentTarget)close();});
  document.addEventListener('keydown',onKeydown);
}
function getVal(row,keys){const cols=Object.keys(row||{});for(const key of keys){const f=cols.find(c=>clean(c).includes(clean(key)));if(f&&row[f]!=null)return String(row[f]);}return "";}
function escapeRegExp(value){return String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function highlightText(text,keyword){
const raw=String(text??"");
const q=String(keyword??"").trim();
if(!q) return [document.createTextNode(raw)];
const safeKeyword=escapeRegExp(q);
if(!safeKeyword) return [document.createTextNode(raw)];
const regex=new RegExp(`(${safeKeyword})`,"ig");
const exactRegex=new RegExp(`^${safeKeyword}$`,"i");
return raw.split(regex).filter(part=>part!=="").map((part,index)=>{if(exactRegex.test(part)){const mark=document.createElement("mark");mark.className="search-highlight";mark.textContent=part;return mark;}return document.createTextNode(part);});
}
function highlight(text,query){const raw=String(text||"");const q=String(query||"").trim();if(!q) return esc(raw);const words=clean(q).split(" ").filter(Boolean).slice(0,6);let out=esc(raw);words.forEach(w=>{const e=escapeRegExp(w);out=out.replace(new RegExp(`(${e})`,"ig"),"<mark>$1</mark>")});return out;}
function normalizeHeader(v){return clean(v).replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim();} function clean(v){return String(v||"").toLowerCase().trim().replace(/[_-]+/g," ").replace(/\s+/g," ");}
function parseNumber(v){const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0;} function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}
function encAttr(v){return encodeURIComponent(String(v??""));} function badgeClass(s){return s==="Kartu Stock"?"b-kartu":s==="RPL"?"b-rpl":s==="BULKY"?"b-bulky":s==="Barang Masuk"?"b-in":"b-out";}
function debounce(fn,wait){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait)}}


function normalizeMovementRows(sheet,type){const baseRows=(DATA[sheet]||[]);const scopedRows=(sheet==="Barang Masuk")?debugBarangMasukRows(baseRows,"Halaman Barang Masuk",isBarangMasukTableRow):baseRows;return scopedRows.map((r,sourceIndex)=>({r,sourceIndex})).filter(({r})=>clean(getVal(r,["sku"]))).map(({r,sourceIndex})=>{const sku=getVal(r,["sku"]);const nama=getVal(r,["nama barang","nama","item","description"])||"-";const qty=parseNumber(getVal(r,["qty"]));const tanggal=getVal(r,["tanggal","date","created at","waktu"])||"";const from=getVal(r,["from"])||"-";const to=getVal(r,["to"])||"-";const status=getVal(r,["status"])||"-";const pic=getVal(r,["pic","user","operator"])||"-";const lokasi=getVal(r,["lokasi","location","rak","bin","area"])||"-";const ket=getVal(r,["keterangan","notes","remark"])||"-";return {...r,_type:type,_sheetOrder:sourceIndex,_sku:sku,_nama:nama,_qty:qty,_tanggal:tanggal,_from:from,_to:to,_status:status,_pic:pic,_lokasi:lokasi,_keterangan:ket};});}
const DEBOUNCED_RENDER={in:debounce(()=>renderDataTablePage("in","Barang Masuk",true),250),out:debounce(()=>renderDataTablePage("out","Barang Keluar",true),250)};
function debouncedTableRender(mode){return (DEBOUNCED_RENDER[mode]||(()=>{}))();}
const TABLE_STATE={in:{page:1,pageSize:25,rows:[],filtered:[],openFilterCol:""},out:{page:1,pageSize:25,rows:[],filtered:[],openFilterCol:""}};
const FILTERABLE_COLUMNS=["tanggal","from","to","sku","nama","status","pic","lokasi"];
const FILTER_LABELS={tanggal:"TANGGAL",from:"FROM",to:"TO",sku:"SKU",nama:"NAMA BARANG",status:"STATUS",pic:"PIC",lokasi:"LOKASI"};
function sanitizeFilterValue(v){const value=String(v??"").trim();if(!value||value==="-"||clean(value)==="null")return"";return value;}
function getUniqueOptions(rows,key){return [...new Set(rows.map(r=>sanitizeFilterValue(r[key])).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function ensureColumnFilterState(mode){const st=TABLE_STATE[mode];if(!st.columnFilters)st.columnFilters={};FILTERABLE_COLUMNS.forEach(k=>{if(!Array.isArray(st.columnFilters[k]))st.columnFilters[k]=[];});return st.columnFilters;}
function applyTableFilters(rows,mode,omitCol=""){const q=clean((mode==="in"?inSearch:outSearch)?.value||"");const columnFilters=ensureColumnFilterState(mode);return rows.filter(r=>{if(FILTERABLE_COLUMNS.some(col=>{if(col===omitCol)return false;const selected=columnFilters[col]||[];if(!selected.length)return false;return !selected.includes(sanitizeFilterValue(r[`_${col}`]));}))return false;if(q&&!clean(`${r._sku} ${r._nama} ${r._from} ${r._to} ${r._status} ${r._pic} ${r._keterangan}`).includes(q))return false;return true;});}
function positionColumnFilterMenu(menu){
  if(!menu)return;
  const anchor=menu.closest(".th-filter-wrap")?.querySelector("[data-col-filter-toggle]");
  if(!anchor)return;
  menu.style.right="auto";menu.style.bottom="auto";
  const margin=8,gap=6;
  const a=anchor.getBoundingClientRect();
  const prevHidden=menu.hidden;
  if(prevHidden){menu.hidden=false;}
  const m=menu.getBoundingClientRect();
  const width=Math.min(m.width,window.innerWidth-(margin*2));
  const height=m.height;
  let left=a.left;
  if(left+width>window.innerWidth-margin){left=window.innerWidth-width-margin;}
  left=Math.max(margin,left);
  const spaceBelow=window.innerHeight-a.bottom-gap;
  const spaceAbove=a.top-gap;
  const openUp=spaceBelow<height&&spaceAbove>spaceBelow;
  let top=openUp?Math.max(margin,a.top-height-gap):Math.min(a.bottom+gap,window.innerHeight-height-margin);
  top=Math.max(margin,top);
  menu.style.left=`${left}px`;
  menu.style.top=`${top}px`;
  if(prevHidden){menu.hidden=true;}
}
function sortTableRows(rows,sort){const m={latest:(a,b)=>(b._sheetOrder??0)-(a._sheetOrder??0),oldest:(a,b)=>(a._sheetOrder??0)-(b._sheetOrder??0),sku:(a,b)=>(a._sku||"").localeCompare(b._sku||""),name:(a,b)=>(a._nama||"").localeCompare(b._nama||""),qtyDesc:(a,b)=>(b._qty||0)-(a._qty||0),qtyAsc:(a,b)=>(a._qty||0)-(b._qty||0)};return [...rows].sort(m[sort]||m.latest);}
function paginateRows(mode,action){const st=TABLE_STATE[mode];const max=Math.max(1,Math.ceil(st.filtered.length/st.pageSize));if(action==="prev")st.page=Math.max(1,st.page-1);if(action==="next")st.page=Math.min(max,st.page+1);renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true);}
function toggleColumnVisibility(mode){const root=document.getElementById(`mv-cols-${mode}`);const cols=[...root.querySelectorAll('input[type="checkbox"]')].filter(c=>c.checked).map(c=>c.value);renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true,cols);}
function closeColumnMenus(){document.querySelectorAll(".mv-columns.open").forEach(el=>el.classList.remove("open"));Object.keys(TABLE_STATE).forEach(k=>TABLE_STATE[k].columnMenuOpen=false);}
function positionColumnMenu(mode){
  const panel=document.getElementById(`mv-cols-${mode}`);if(!panel)return;
  const wrap=panel.closest(".mv-column-dropdown-wrap");if(!wrap)return;
  panel.classList.remove("align-right");
  const rect=panel.getBoundingClientRect();
  if(rect.right>window.innerWidth-8)panel.classList.add("align-right");
}
function toggleColumnMenu(mode){const target=document.getElementById(`mv-cols-${mode}`);if(!target)return;const willOpen=!target.classList.contains("open");closeColumnMenus();if(willOpen){target.classList.add("open");TABLE_STATE[mode].columnMenuOpen=true;positionColumnMenu(mode);}}
function toggleAllColumns(mode,checked){const root=document.getElementById(`mv-cols-${mode}`);if(!root)return;root.querySelectorAll('input[type="checkbox"]').forEach(c=>{c.checked=!!checked;});toggleColumnVisibility(mode);}
function exportFilteredCsv(mode){const st=TABLE_STATE[mode];const cols=st.columns||["tanggal","from","to","sku","nama","qty","status","pic","keterangan"];const lines=[cols.join(","),...st.filtered.map(r=>cols.map(c=>`"${String(r[c]??"").replaceAll('"','""')}"`).join(","))];const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8;"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=mode==="in"?"barang-masuk-filtered.csv":"barang-keluar-filtered.csv";a.click();URL.revokeObjectURL(a.href);} 
function renderDataTablePage(mode,sheetName,keepPage=false,selectedCols){const isIn=mode==="in", resultEl=isIn?inResults:outResults, summaryEl=isIn?inSummary:outSummary;if(!resultEl)return;const st=TABLE_STATE[mode];if(!keepPage||!st.rows.length)st.rows=normalizeMovementRows(sheetName,isIn?"IN":"OUT");const rows=st.rows;if(!rows.length){resultEl.innerHTML='<div class="state">Belum ada data.</div>';summaryEl.textContent='0 data';return;}const allCols=[...new Set(rows.flatMap(r=>Object.keys(r).filter(k=>!k.startsWith("_"))))];st.columns=selectedCols||st.columns||allCols;const filtered=applyTableFilters(rows,mode);const sort=document.getElementById(`mv-sort-${mode}`)?.value||"latest";st.filtered=sortTableRows(filtered,sort);st.pageSize=Number(document.getElementById(`mv-size-${mode}`)?.value||25);if(![25,50].includes(st.pageSize))st.pageSize=25;if(!keepPage)st.page=1;const size=st.pageSize;
const pageRows=st.filtered.slice((st.page-1)*size,st.page*size);const totalQty=st.filtered.reduce((n,r)=>n+(r._qty||0),0),totalSku=new Set(st.filtered.map(r=>r._sku)).size;
const totalRowCount=st.filtered.length;
summaryEl.innerHTML=`<div class='summary-grid'><div class='summary-card'><div class='k'>Total Row</div><div class='v'>${totalRowCount}</div></div><div class='summary-card'><div class='k'>Total Qty</div><div class='v'>${totalQty}</div></div><div class='summary-card'><div class='k'>Total SKU</div><div class='v'>${totalSku}</div></div></div>`;
const filterHtml=`<div class='mv-toolbar'><button class='btn-ghost' data-mv-action='reset' data-mv-mode='${mode}'>Reset Filter</button><button class='btn-ghost' data-mv-action='export' data-mv-mode='${mode}'>Export CSV</button><select id='mv-sort-${mode}' data-mv-filter data-mv-mode='${mode}'><option value='latest'>Terbaru</option><option value='oldest'>Terlama</option><option value='sku'>SKU A-Z</option><option value='name'>Nama A-Z</option><option value='qtyDesc'>Qty terbesar</option><option value='qtyAsc'>Qty terkecil</option></select><select id='mv-size-${mode}' data-mv-filter data-mv-mode='${mode}'><option value='25'>25</option><option value='50'>50</option></select></div>`;
const filters=ensureColumnFilterState(mode);
const headers=st.columns.map(c=>{if(!FILTERABLE_COLUMNS.includes(c))return `<th>${esc(c.toUpperCase())}</th>`;const selected=filters[c]||[];const active=selected.length>0;const optionRows=applyTableFilters(rows,mode,c);const options=getUniqueOptions(optionRows,`_${c}`);return `<th><div class='th-filter-wrap'><span>${esc(FILTER_LABELS[c]||c.toUpperCase())}</span><button type='button' class='th-filter-btn ${active?"active":""}' data-col-filter-toggle data-mode='${mode}' data-col='${c}' aria-label='Filter kolom ${esc(FILTER_LABELS[c]||c.toUpperCase())}'><span class='th-filter-icon' aria-hidden='true'><svg viewBox='0 0 24 24' focusable='false'><path d='M4 6h16l-6 7v4l-4 2v-6z'/></svg></span>${active?`<span class='th-filter-count'>${selected.length}</span>`:""}</button><div class='th-filter-dropdown' data-col-filter-menu data-mode='${mode}' data-col='${c}' hidden><input type='text' class='th-filter-search' data-col-filter-search placeholder='Cari ${esc(FILTER_LABELS[c]||c)}'><div class='th-filter-actions'><button type='button' data-col-filter-all>Pilih semua</button><button type='button' data-col-filter-clear>Clear</button></div><div class='th-filter-options'>${options.map(v=>`<label data-opt-item><input type='checkbox' value='${esc(v)}' ${selected.includes(v)?"checked":""}> <span>${esc(v)}</span></label>`).join("")||"<div class='state'>Tidak ada opsi.</div>"}</div></div></div></th>`;}).join("");const bodyRows=[];for(const r of pageRows){bodyRows.push(`<tr>${st.columns.map(c=>`<td>${esc(r[c]??"-")}</td>`).join("")}</tr>`);}const body=bodyRows.join("");const start=st.filtered.length?((st.page-1)*st.pageSize+1):0;const end=st.filtered.length?Math.min(st.page*st.pageSize,st.filtered.length):0;
resultEl.innerHTML=`${filterHtml}<div class='table-wrap table-wrap-full'><table><thead><tr>${headers}</tr></thead><tbody>${body||`<tr><td colspan='${st.columns.length}'><div class='state'>Tidak ada data.</div></td></tr>`}</tbody></table></div><div class='mv-pagination'><span>Menampilkan ${start}–${end} dari ${st.filtered.length} data</span><div class='row'><button class='btn-ghost' data-mv-action='prev' data-mv-mode='${mode}'>Prev</button><button class='btn-ghost' data-mv-action='next' data-mv-mode='${mode}'>Next</button><span class='badge ${isIn?"b-in":"b-out"}'>${isIn?"IN":"OUT"}</span></div></div>`;if(st.openFilterCol){const reopen=document.querySelector(`[data-col-filter-menu][data-mode="${mode}"][data-col="${st.openFilterCol}"]`);if(reopen){reopen.hidden=false;positionColumnFilterMenu(reopen);}}if(st.columnMenuOpen)positionColumnMenu(mode);}
function resetMovementFilter(mode){if(mode==="in"){if(inSearch)inSearch.value="";}else{if(outSearch)outSearch.value="";}TABLE_STATE[mode].columnFilters={};TABLE_STATE[mode].page=1;renderDataTablePage(mode,mode==="in"?"Barang Masuk":"Barang Keluar",true);} 
function getAllValidLocations(){const all=[];for(let zoneCode=65;zoneCode<=72;zoneCode++){const zone=String.fromCharCode(zoneCode);for(let slot=1;slot<=20;slot++){for(let floor=1;floor<=5;floor++){const code=`${zone}${String(slot).padStart(2,"0")}-${floor}`;const parsed=parseLocationCode(code);if(parsed.valid&&!parsed.blocked)all.push(parsed.raw);}}}return all;}
function renderEmptyLocations(){const used=new Set();(DATA["Kartu Stock"]||[]).forEach(r=>{const stokAkhir=parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"]));if(stokAkhir<=0)return;const locRaw=getVal(r,["lokasi","location","rak","bin","area"]);const parsed=parseLocationCode(locRaw);if(parsed.valid&&!parsed.blocked)used.add(parsed.raw);});const empty=getAllValidLocations().filter(code=>!used.has(code));if(!empty.length){emptyLocationResult.innerHTML='<div class="state">Tidak ada lokasi kosong.</div>';return;}const rows=empty.map((code,idx)=>`<tr><td>${idx+1}</td><td>${esc(code)}</td></tr>`).join("");emptyLocationResult.innerHTML=`<div class="detail-note"><div class="note-box"><div class="note-title">Daftar Lokasi Kosong</div><div class="note-value">${empty.length} lokasi kosong</div></div></div><div class="table-wrap"><table class="location-empty-table"><thead><tr><th>No</th><th>Lokasi Kosong</th></tr></thead><tbody>${rows}</tbody></table></div>`;}
function parseLocationCode(value){const raw=String(value||"").trim().toUpperCase();const m=raw.match(/^([A-H])(\d{2})-(\d)$/);if(!m)return{raw,valid:false,reason:"Format tidak valid. Gunakan pola seperti A01-1 sampai H20-5."};const zone=m[1],slot=Number(m[2]),floor=Number(m[3]);if(slot<1||slot>20)return{raw,valid:false,reason:"Nomor lokasi harus 01 sampai 20."};if(floor<1||floor>5)return{raw,valid:false,reason:"Lantai harus 1 sampai 5."};const blocked=slot===7&&floor>=1&&floor<=3;return{raw:`${zone}${String(slot).padStart(2,"0")}-${floor}`,valid:true,blocked,zone,slot,floor};}
function checkLocation(){const result=parseLocationCode(locInput.value);if(!result.valid){locationResult.innerHTML=`<div class="state error">${esc(result.reason)}</div>`;return;}if(result.blocked){locationResult.innerHTML=`<div class="state error">Lokasi <strong>${esc(result.raw)}</strong> tidak bisa digunakan (blokir A07-1 sampai H07-3).</div>`;return;}const rows=(DATA["Kartu Stock"]||[]).filter(r=>{const loc=getVal(r,["lokasi","location","rak","bin","area"]);return clean(loc)===clean(result.raw);});if(!rows.length){locationResult.innerHTML=`<div class="state">Lokasi <strong>${esc(result.raw)}</strong> belum ada data di Kartu Stock.</div>`;return;}const skuMap=new Map();rows.forEach(r=>{const sku=getVal(r,["sku"])||"-";const nama=getVal(r,["nama barang","nama","item","description"])||"-";const stokAwal=parseNumber(getVal(r,["stok awal","opening stock","beginning stock","saldo awal"]));const pengeluaran=parseNumber(getVal(r,["pengeluaran","qty keluar","keluar","out"]));const stokAkhir=parseNumber(getVal(r,["stok akhir","closing stock","ending stock","saldo akhir"]));const key=clean(sku||nama);if(!skuMap.has(key))skuMap.set(key,{sku,nama,stokAwal:0,pengeluaran:0,stokAkhir:0});const item=skuMap.get(key);item.stokAwal+=stokAwal;item.pengeluaran+=pengeluaran;item.stokAkhir+=stokAkhir;});const details=[...skuMap.values()].filter(d=>d.stokAkhir!==0).sort((a,b)=>b.stokAkhir-a.stokAkhir||a.sku.localeCompare(b.sku));if(!details.length){locationResult.innerHTML=`<div class="state">Lokasi <strong>${esc(result.raw)}</strong> hanya memiliki data dengan stok akhir 0.</div>`;return;}locationResult.innerHTML=`<div class="detail-note"><div class="note-box"><div class="note-title">Ringkasan Lokasi ${esc(result.raw)}</div><div class="note-value">${details.length} SKU unik • ${rows.length} baris Kartu Stock</div></div></div><div class="table-wrap"><table><thead><tr><th>SKU</th><th>Nama</th><th>Stok Awal</th><th>Pengeluaran</th><th>Stok Akhir</th><th>DETAIL</th></tr></thead><tbody>${details.map(d=>{const skuValid=String(d.sku||"" ).trim()&&d.sku!=="-";return `<tr><td><div class="copy-cell"><span class="copy-cell-text">${esc(d.sku)}</span><button class="copy-mini-btn" type="button" title="Copy" aria-label="Copy SKU" onclick="copyText(decodeURIComponent('${encAttr(d.sku)}'),'SKU disalin',this)"><span aria-hidden='true'>⧉</span><span>Copy</span></button></div></td><td><div class="copy-cell"><span class="copy-cell-text">${esc(d.nama)}</span><button class="copy-mini-btn" type="button" title="Copy" aria-label="Copy nama barang" onclick="copyText(decodeURIComponent('${encAttr(d.nama)}'),'Nama barang disalin',this)"><span aria-hidden='true'>⧉</span><span>Copy</span></button></div></td><td>${esc(d.stokAwal)}</td><td>${esc(d.pengeluaran)}</td><td>${esc(d.stokAkhir)}</td><td class="action-cell">${skuValid?`<button class="detail-mini-btn" type="button" onclick="navigateToSku(decodeURIComponent('${encAttr(d.sku)}'))">Lihat</button>`:""}</td></tr>`;}).join("")}</tbody></table></div>`;}

const LOCATION_STATE={rows:[],filtered:[],page:1,pageSize:25,selected:""};
function getLocationValue(row){return getVal(row,["lokasi","location","rak","bin","area","LOKASI"])||"";}
function buildLocationRows(){const skuMap=new Map();for(const row of (DATA["Kartu Stock"]||[])){const sku=String(getVal(row,["sku"])||"").trim();if(!sku)continue;const nama=getVal(row,["nama barang","nama","item","description"])||"-";const locRaw=String(getLocationValue(row)||"").trim();const parsed=parseLocationCode(locRaw);if(!parsed.valid||parsed.blocked)continue;const loc=parsed.raw;const qty=parseNumber(getVal(row,["stok akhir","qty","closing stock","ending stock","saldo akhir"]));if(qty<=0)continue;const key=`${clean(loc)}__${clean(sku)}`;if(!skuMap.has(key))skuMap.set(key,{lokasi:loc,sku,nama,qty:0});const it=skuMap.get(key);it.qty+=qty;}const grouped={};for(const it of skuMap.values()){if(it.qty<=0)continue;if(!grouped[it.lokasi])grouped[it.lokasi]={lokasi:it.lokasi,skus:[],totalQty:0};grouped[it.lokasi].skus.push(it);grouped[it.lokasi].totalQty+=it.qty;}return Object.values(grouped).filter(g=>g.totalQty>0&&g.skus.length>0).map(g=>{const jumlahSku=g.skus.length,skuKosong=0;const status=(jumlahSku>=25||g.totalQty>=400?'Padat':'Normal');return {...g,jumlahSku,skuKosong,status};});}
function renderLocationsPage(){LOCATION_STATE.rows=buildLocationRows();if(!locSearchInput?.dataset.bound){const redraw=debounce(()=>{LOCATION_STATE.page=1;drawLocations();},180);[locSearchInput,locSkuSearchInput].forEach(el=>el?.addEventListener('input',redraw));[locStatusFilter,locSort,locPageSize].forEach(el=>el?.addEventListener('change',()=>{LOCATION_STATE.page=1;drawLocations();}));locSearchInput.dataset.bound='1';}drawLocations();}
function drawLocations(){const rows=LOCATION_STATE.rows||[];const qLoc=clean(locSearchInput?.value||'');const qSku=clean(locSkuSearchInput?.value||'');const status=locStatusFilter?.value||'all';const sorter=locSort?.value||'skuDesc';const pageSize=Number(locPageSize?.value||25);LOCATION_STATE.pageSize=[25,50,100].includes(pageSize)?pageSize:25;let filtered=rows.filter(r=>(!qLoc||clean(r.lokasi).includes(qLoc))&&(!qSku||r.skus.some(s=>clean(`${s.sku} ${s.nama}`).includes(qSku)))&&(status==='all'||r.status===status));filtered=[...filtered].sort(sorter==='qtyDesc'?(a,b)=>b.totalQty-a.totalQty:sorter==='az'?(a,b)=>a.lokasi.localeCompare(b.lokasi):(a,b)=>b.jumlahSku-a.jumlahSku||b.totalQty-a.totalQty);LOCATION_STATE.filtered=filtered;const totalLokasi=rows.length,totalSku=new Set(rows.flatMap(r=>r.skus.map(s=>clean(s.sku)))).size;locationsSummary.innerHTML=[["Total Lokasi",totalLokasi],["Total SKU berlokasi",totalSku]].map(c=>`<div class='metric'><div class='k'>${c[0]}</div><div class='v'>${esc(c[1])}</div></div>`).join('');const max=Math.max(1,Math.ceil(filtered.length/LOCATION_STATE.pageSize));if(LOCATION_STATE.page>max)LOCATION_STATE.page=max;const pageRows=filtered.slice((LOCATION_STATE.page-1)*LOCATION_STATE.pageSize,LOCATION_STATE.page*LOCATION_STATE.pageSize);locationsTable.innerHTML=`<div class='card'><div class='section-header'><h4>List Lokasi</h4><span class='badge b-kartu'>${filtered.length}</span></div><div class='subtitle'>Urutan lokasi sesuai filter dan sorting aktif</div><div class='table-wrap table-wrap-full'><table><thead><tr><th>No</th><th>Lokasi</th><th>Jumlah SKU</th><th>Total Qty</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${pageRows.map((r,idx)=>`<tr><td>${(LOCATION_STATE.page-1)*LOCATION_STATE.pageSize+idx+1}</td><td>${esc(r.lokasi)}</td><td>${r.jumlahSku}</td><td>${r.totalQty}</td><td>${esc(r.status)}</td><td><button class='btn-ghost' onclick="selectLocationDetail('${encAttr(r.lokasi)}')">Lihat SKU</button></td></tr>`).join('')||"<tr><td colspan='6'><div class='state'>Tidak ada data.</div></td></tr>"}</tbody></table></div><div class='mv-pagination'><span>Menampilkan ${filtered.length?((LOCATION_STATE.page-1)*LOCATION_STATE.pageSize+1):0}–${Math.min(LOCATION_STATE.page*LOCATION_STATE.pageSize,filtered.length)} dari ${filtered.length} data</span><div class='row'><button class='btn-ghost' onclick='changeLocationPage(-1)'>Prev</button><button class='btn-ghost' onclick='changeLocationPage(1)'>Next</button></div></div></div>`;if(LOCATION_STATE.selected)selectLocationDetail(encAttr(LOCATION_STATE.selected),true);renderEmptyLocationSection();}

function renderEmptyLocationSection(){
  if(!locationsEmpty)return;
  const used=new Set((LOCATION_STATE.rows||[]).filter(r=>clean(r.lokasi)!=='tanpa lokasi'&&r.totalQty>0).map(r=>String(r.lokasi).trim()));
  const allValid=getAllValidLocations();
  const empties=allValid.filter(loc=>!used.has(loc));
  if(!empties.length){locationsEmpty.innerHTML="<div class='state'>Tidak ada lokasi kosong.</div>";return;}
  locationsEmpty.innerHTML=`<div class='card'><div class='section-header'><h4>Lokasi Kosong</h4><span class='badge b-kartu'>${empties.length}</span></div><div class='subtitle'>Lokasi valid yang belum terisi stok aktif</div><div class='table-wrap'><table><thead><tr><th>No</th><th>Lokasi</th></tr></thead><tbody>${empties.slice(0,300).map((loc,i)=>`<tr><td>${i+1}</td><td>${esc(loc)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function changeLocationPage(step){const max=Math.max(1,Math.ceil((LOCATION_STATE.filtered.length||0)/LOCATION_STATE.pageSize));LOCATION_STATE.page=Math.min(max,Math.max(1,LOCATION_STATE.page+step));drawLocations();}
function selectLocationDetail(locEncoded,keep=false){const lokasi=decodeURIComponent(locEncoded||'');LOCATION_STATE.selected=lokasi;const row=(LOCATION_STATE.filtered||LOCATION_STATE.rows).find(r=>r.lokasi===lokasi);if(!row){if(!keep)locationDetail.innerHTML='';return;}const skuRows=[...row.skus].sort((a,b)=>b.qty-a.qty);locationDetail.innerHTML=`<div class='card'><div class='section-header'><h4>Detail Lokasi: ${esc(lokasi)}</h4></div><div class='table-wrap table-wrap-full'><table><thead><tr><th>SKU</th><th>Nama Barang</th><th>Qty / Stok</th><th>Aksi</th></tr></thead><tbody>${skuRows.map(s=>`<tr><td><div class='copy-cell'><span class='copy-cell-text'>${esc(s.sku)}</span><button class='copy-mini-btn' type='button' title='Copy SKU' aria-label='Copy SKU' onclick="copyText(decodeURIComponent('${encAttr(s.sku)}'),'SKU disalin',this)"><span aria-hidden='true'>⧉</span><span>Copy</span></button></div></td><td><div class='copy-cell'><span class='copy-cell-text'>${esc(s.nama)}</span><button class='copy-mini-btn' type='button' title='Copy nama barang' aria-label='Copy nama barang' onclick="copyText(decodeURIComponent('${encAttr(s.nama)}'),'Nama barang disalin',this)"><span aria-hidden='true'>⧉</span><span>Copy</span></button></div></td><td>${s.qty}</td><td><button class='btn-primary' onclick="navigateTo('/sku/'+encodeURIComponent(decodeURIComponent('${encAttr(s.sku)}')))" ${String(s.sku).trim()?"":"disabled"}>Lihat Detail SKU</button></td></tr>`).join('')}</tbody></table></div></div>`;if(!keep){locationDetail.scrollIntoView({behavior:'smooth',block:'start'});}}
function exportLocationCsv(){const cols=["lokasi","jumlah_sku","total_qty","sku_qty_kosong","status"];const lines=[cols.join(',')].concat((LOCATION_STATE.filtered||[]).map(r=>[r.lokasi,r.jumlahSku,r.totalQty,r.skuKosong,r.status].map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(',')));const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='locations-analysis.csv';a.click();URL.revokeObjectURL(a.href);}
window.renderLocationsPage=renderLocationsPage;window.changeLocationPage=changeLocationPage;window.selectLocationDetail=selectLocationDetail;

function getRecentSearches(){try{const raw=localStorage.getItem(CACHE_KEYS.searchHistory);const list=JSON.parse(raw||"[]");return Array.isArray(list)?list.filter(Boolean).slice(0,5):[];}catch(_){return [];}}
function saveRecentSearch(query){const q=String(query||"").trim();if(!q)return;const recent=[q,...getRecentSearches().filter(x=>clean(x)!==clean(q))].slice(0,5);try{localStorage.setItem(CACHE_KEYS.searchHistory,JSON.stringify(recent));}catch(_){}renderRecentHistory();}
function clearSearchHistory(){localStorage.removeItem(CACHE_KEYS.searchHistory);renderRecentHistory();}

const STOK_MINUS_STATE={q:"",searchInputValue:"",filter:"all",sort:"minusDesc",page:1,pageSize:25,selected:"",rows:[],filteredRows:[],_searchDebounce:null,_idleFilter:null};
function buildStokMinusRows(){const inMap=new Map(),outMap=new Map();for(const r of (DATA["Barang Masuk"]||[])){const sku=String(getVal(r,["sku"])||"").trim();if(!sku)continue;const key=clean(sku);inMap.set(key,(inMap.get(key)||0)+Math.abs(parseNumber(getVal(r,["qty"]))));}for(const r of (DATA["Barang Keluar"]||[])){const sku=String(getVal(r,["sku"])||"").trim();if(!sku)continue;const key=clean(sku);outMap.set(key,(outMap.get(key)||0)+Math.abs(parseNumber(getVal(r,["qty"]))));}const kartu=(DATA["Kartu Stock"]||[]);const grouped=new Map();for(const row of kartu){const sku=String(getVal(row,["sku"])||"").trim();if(!sku)continue;const stokAkhir=parseNumber(getVal(row,["stok akhir","closing stock","ending stock","saldo akhir"]));if(stokAkhir>=0)continue;const key=clean(sku);const nama=String(getVal(row,["nama barang","nama","item","description"])||"-").trim()||"-";if(!grouped.has(key))grouped.set(key,{sku,nama,stokEstimate:0,kartuRows:[],rplRows:[],bulkyRows:[]});const it=grouped.get(key);if(it.nama==="-"&&nama!=="-")it.nama=nama;it.stokEstimate+=stokAkhir;it.kartuRows.push(row);}const rpl=DATA["RPL"]||[],bulky=DATA["BULKY"]||[];const out=[];for(const it of grouped.values()){const key=clean(it.sku);const totalMasuk=inMap.get(key)||0,totalKeluar=outMap.get(key)||0;const keluarTanpaMasuk=totalKeluar>0&&totalMasuk<=0;out.push({...it,totalMasuk,totalKeluar,selisih:it.stokEstimate,status:keluarTanpaMasuk?"Keluar Tanpa Masuk":"Stok Minus",inRows:(DATA["Barang Masuk"]||[]).filter(r=>clean(getVal(r,["sku"]))===key),outRows:(DATA["Barang Keluar"]||[]).filter(r=>clean(getVal(r,["sku"]))===key),rplRows:rpl.filter(r=>clean(getVal(r,["sku"]))===key),bulkyRows:bulky.filter(r=>clean(getVal(r,["sku"]))===key)});}return out;}
function getStokMinusFilteredRows(){let rows=(STOK_MINUS_STATE.rows||[]).filter(r=>{const q=clean(STOK_MINUS_STATE.q);if(q&&!clean(`${r.sku} ${r.nama}`).includes(q))return false;if(STOK_MINUS_STATE.filter==="minus")return r.status==="Stok Minus";if(STOK_MINUS_STATE.filter==="keluar")return r.status==="Keluar Tanpa Masuk";return true;});return [...rows].sort(STOK_MINUS_STATE.sort==="keluarDesc"?(a,b)=>b.totalKeluar-a.totalKeluar:STOK_MINUS_STATE.sort==="skuAz"?(a,b)=>a.sku.localeCompare(b.sku):(a,b)=>a.stokEstimate-b.stokEstimate);}
function renderStokMinusTableRowsOnly(){const rows=getStokMinusFilteredRows();STOK_MINUS_STATE.filteredRows=rows;const max=Math.max(1,Math.ceil(rows.length/STOK_MINUS_STATE.pageSize));if(STOK_MINUS_STATE.page>max)STOK_MINUS_STATE.page=max;const pageRows=rows.slice((STOK_MINUS_STATE.page-1)*STOK_MINUS_STATE.pageSize,STOK_MINUS_STATE.page*STOK_MINUS_STATE.pageSize);const tbody=document.querySelector('#page-stok-minus #stokMinusTable tbody');if(tbody)tbody.innerHTML=pageRows.map(r=>`<tr><td>${esc(r.sku)}</td><td class='cell-nama'>${esc(r.nama)}</td><td>${r.totalMasuk}</td><td>${r.totalKeluar}</td><td class='${r.stokEstimate<0?"txt-danger":""}'>${r.stokEstimate}</td><td><span class='badge stokminus-badge ${r.status==="Stok Minus"?"b-out":"b-warn"}'>${esc(r.status)}</span></td><td><button class='btn-ghost stokminus-track-btn' onclick="openStokMinusTrace('${encAttr(r.sku)}')">Lacak</button></td></tr>`).join("")||"<tr><td colspan='7'><div class='state'>Tidak ada data.</div></td></tr>";const info=document.querySelector('#page-stok-minus .stokminus-pagination span');if(info)info.textContent=`Menampilkan ${rows.length?((STOK_MINUS_STATE.page-1)*STOK_MINUS_STATE.pageSize+1):0}–${Math.min(STOK_MINUS_STATE.page*STOK_MINUS_STATE.pageSize,rows.length)} dari ${rows.length} data`;}
function scheduleStokMinusSearchFilter(){if(STOK_MINUS_STATE._idleFilter)clearTimeout(STOK_MINUS_STATE._idleFilter);const run=()=>{STOK_MINUS_STATE.q=STOK_MINUS_STATE.searchInputValue;STOK_MINUS_STATE.page=1;renderStokMinusTableRowsOnly();};if(typeof requestIdleCallback==="function"){requestIdleCallback(run,{timeout:200});return;}STOK_MINUS_STATE._idleFilter=setTimeout(run,0);}
function renderStokMinusPage(){const all=buildStokMinusRows();STOK_MINUS_STATE.rows=all;const minusQty=all.reduce((n,r)=>n+(r.stokEstimate<0?Math.abs(r.stokEstimate):0),0);const onlyOut=all.filter(r=>r.status==="Keluar Tanpa Masuk").length;const topMinus=[...all].sort((a,b)=>a.stokEstimate-b.stokEstimate)[0];stokMinusSummary.innerHTML=[["Total SKU Minus",all.length],["Total Qty Minus",minusQty],["Keluar Tanpa Masuk",onlyOut],["Minus Terbesar",topMinus?`${topMinus.sku} (${topMinus.stokEstimate})`:"-"]].map(c=>`<div class='metric'><div class='k'>${c[0]}</div><div class='v'>${esc(c[1])}</div></div>`).join("");stokMinusTable.innerHTML=`<div class='stokminus-card'><div class='mv-toolbar stokminus-toolbar'><input id='minusSearch' class='search-lg' placeholder='Search SKU / nama barang' value='${esc(STOK_MINUS_STATE.searchInputValue)}'><select id='minusFilter'><option value='all'>Semua</option><option value='minus'>Stok Minus</option><option value='keluar'>Keluar Tanpa Masuk</option></select><select id='minusSort'><option value='minusDesc'>Minus terbesar</option><option value='keluarDesc'>Keluar terbesar</option><option value='skuAz'>SKU A-Z</option></select><select id='minusSize'><option value='25'>25</option><option value='50'>50</option><option value='100'>100</option></select><button class='btn-ghost stokminus-export' onclick='exportStokMinusCsv()'>Export CSV</button></div><div class='table-wrap table-wrap-full stokminus-table-wrap'><table><thead><tr><th class='col-sku'>SKU</th><th class='col-nama'>Nama Barang</th><th>Total Masuk</th><th>Total Keluar</th><th>Selisih</th><th>Status</th><th>Action Lacak</th></tr></thead><tbody></tbody></table></div><div class='mv-pagination stokminus-pagination'><span></span><div class='row'><button class='btn-ghost' onclick='changeStokMinusPage(-1)'>Prev</button><button class='btn-ghost' onclick='changeStokMinusPage(1)'>Next</button></div></div></div>`;document.getElementById('minusFilter').value=STOK_MINUS_STATE.filter;document.getElementById('minusSort').value=STOK_MINUS_STATE.sort;document.getElementById('minusSize').value=String(STOK_MINUS_STATE.pageSize);document.getElementById('minusSearch')?.addEventListener('input',e=>{STOK_MINUS_STATE.searchInputValue=e.target.value;clearTimeout(STOK_MINUS_STATE._searchDebounce);STOK_MINUS_STATE._searchDebounce=setTimeout(scheduleStokMinusSearchFilter,400);});document.getElementById('minusFilter')?.addEventListener('change',e=>{STOK_MINUS_STATE.filter=e.target.value;STOK_MINUS_STATE.page=1;renderStokMinusTableRowsOnly();});document.getElementById('minusSort')?.addEventListener('change',e=>{STOK_MINUS_STATE.sort=e.target.value;renderStokMinusTableRowsOnly();});document.getElementById('minusSize')?.addEventListener('change',e=>{STOK_MINUS_STATE.pageSize=Number(e.target.value)||25;STOK_MINUS_STATE.page=1;renderStokMinusTableRowsOnly();});renderStokMinusTableRowsOnly();if(STOK_MINUS_STATE.selected)openStokMinusTrace(encAttr(STOK_MINUS_STATE.selected),true);}
function changeStokMinusPage(delta){const max=Math.max(1,Math.ceil((STOK_MINUS_STATE.filteredRows||[]).length/STOK_MINUS_STATE.pageSize));STOK_MINUS_STATE.page=Math.min(max,Math.max(1,STOK_MINUS_STATE.page+delta));renderStokMinusTableRowsOnly();}
function openStokMinusTrace(skuEncoded,keep=false){const sku=decodeURIComponent(skuEncoded||"");STOK_MINUS_STATE.selected=sku;const row=(STOK_MINUS_STATE.rows||[]).find(r=>clean(r.sku)===clean(sku));if(!row){if(!keep)stokMinusPanel.innerHTML="";return;}const cause=[];if(row.totalKeluar>row.totalMasuk)cause.push("Qty keluar lebih besar dari qty masuk");if(row.totalMasuk===0&&row.totalKeluar>0)cause.push("Ada transaksi keluar tanpa riwayat barang masuk");if(!row.kartuRows.length)cause.push("SKU tidak ditemukan di Kartu Stock");stokMinusPanel.innerHTML=`<div class='card stokminus-trace'><div class='section-header'><h4>Lacak SKU: ${esc(row.sku)}</h4></div><div class='summary-grid'><div class='summary-card'><div class='k'>Timeline Barang Masuk</div><div class='v'>${row.inRows.length} baris</div></div><div class='summary-card'><div class='k'>Timeline Barang Keluar</div><div class='v'>${row.outRows.length} baris</div></div><div class='summary-card'><div class='k'>Kartu Stock</div><div class='v'>${row.kartuRows.length} baris</div></div><div class='summary-card'><div class='k'>RPL / BULKY</div><div class='v'>${row.rplRows.length+row.bulkyRows.length} baris</div></div></div><div class='detail-note'><div class='note-box'><div class='note-title'>Kemungkinan penyebab</div><div class='note-value'>${cause.length?cause.map(esc).join(' • '):'Perlu audit manual per dokumen transaksi.'}</div></div></div>${renderTraceTable('Barang Masuk',row.inRows)}${renderTraceTable('Barang Keluar',row.outRows)}${renderTraceTable('Kartu Stock',row.kartuRows)}${renderTraceTable('RPL',row.rplRows)}${renderTraceTable('BULKY',row.bulkyRows)}</div>`;}
function renderTraceTable(title,rows){if(!rows.length)return `<details class='source-card'><summary>${esc(title)} <span>0 baris</span></summary><div class='source-body'><div class='state'>Tidak ada data.</div></div></details>`;const pick=rows.slice(0,50);const headers=Object.keys(pick[0]||{});return `<details class='source-card' open><summary>${esc(title)} <span>${rows.length} baris</span></summary><div class='source-body'><div class='table-wrap'><table><thead><tr>${headers.map(h=>`<th>${esc(String(h).toUpperCase())}</th>`).join('')}</tr></thead><tbody>${pick.map(r=>`<tr>${headers.map(h=>`<td>${esc(r[h]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></details>`;}
function exportStokMinusCsv(){const cols=["sku","nama","total_masuk","total_keluar","selisih","status"];const lines=[cols.join(',')].concat((STOK_MINUS_STATE.rows||[]).map(r=>[r.sku,r.nama,r.totalMasuk,r.totalKeluar,r.stokEstimate,r.status].map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(',')));const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='stok-minus.csv';a.click();URL.revokeObjectURL(a.href);}
function renderRecentHistory(){const wrap=document.getElementById("recentSearch");if(!wrap)return;const items=getRecentSearches();if(!items.length){wrap.innerHTML="";return;}wrap.innerHTML=`<div class='row recent-searches'>${items.map(x=>`<button class='chip' data-history='${encAttr(x)}'>${esc(x)}</button>`).join("")}</div>`;}
function handleSearchShortcuts(e){const key=(e.key||"").toLowerCase();if((e.ctrlKey||e.metaKey)&&key==="k"){e.preventDefault();openSearchModal();return;}if(key==="escape"&&searchModalOpen){e.preventDefault();closeSearchModal();}}
function openSearchModal(){prevRouteBeforeSearch=location.pathname||"/";searchModalOpen=true;if(location.pathname!=='/search')navigateTo('/search');setTimeout(()=>searchInput?.focus(),20);renderRecentHistory();}
function closeSearchModal(){searchModalOpen=false;if(location.pathname==='/search')navigateTo(prevRouteBeforeSearch==='/search'?'/':prevRouteBeforeSearch);}
function syncSearchModalUi(_open){}
window.loadAllData=loadAllData;window.syncData=syncData;window.loadCache=loadCache;window.saveCache=saveCache;window.isCacheFresh=isCacheFresh;window.clearCache=clearCache;window.clearSystemCache=clearSystemCache;window.exportLocationCsv=exportLocationCsv;window.toggleDark=toggleDark;window.toggleCompact=toggleCompact;window.setFilter=setFilter;window.copySku=copySku;window.copyText=copyText;window.showDetail=showDetail;window.navigateTo=navigateTo;window.navigateToSku=navigateToSku;window.goBackToPreviousPage=goBackToPreviousPage;window.showPage=showPage;window.resetMovementFilter=resetMovementFilter;window.renderDataTablePage=renderDataTablePage;window.applyTableFilters=applyTableFilters;window.sortTableRows=sortTableRows;window.paginateRows=paginateRows;window.exportFilteredCsv=exportFilteredCsv;window.getUniqueOptions=getUniqueOptions;window.toggleColumnVisibility=toggleColumnVisibility;window.toggleAllColumns=toggleAllColumns;window.changeStokMinusPage=changeStokMinusPage;window.openStokMinusTrace=openStokMinusTrace;window.exportStokMinusCsv=exportStokMinusCsv;

const ANOMALY_STATE={page:1,pageSize:25,rows:[]};
function normalizeSku(v){return clean(String(v||'').replace(/[^A-Za-z0-9-]/g,''));}
function getSkuName(row){return String(getVal(row,["nama barang","nama","item","description"])||"").trim();}
function isValidSku(sku){const value=String(sku||"").trim().toLowerCase();return value&&value!=="-"&&value!=="null"&&value!=="undefined";}
function getSkuTotals(rows){const map={};rows.forEach(r=>{const rawSku=getVal(r,["sku"]);if(!isValidSku(rawSku))return;const sku=normalizeSku(rawSku);if(!sku)return;map[sku]=(map[sku]||0)+parseNumber(getVal(r,["qty"]));});return map;}
function buildSkuDisplayMap(rows=[]){
  const displayMap={};
  rows.forEach(r=>{
    const rawSku=getVal(r,["sku"]);
    if(!isValidSku(rawSku))return;
    const key=normalizeSku(rawSku);
    const raw=String(rawSku||"").trim();
    if(!key||!raw)return;
    if(!displayMap[key])displayMap[key]=raw;
  });
  return displayMap;
}
function buildAnomalyReport(){
const rows=[];const kartuSet=new Set((DATA["Kartu Stock"]||[]).map(r=>normalizeSku(getVal(r,["sku"]))).filter(Boolean));
const masuk=DATA["Barang Masuk"]||[], keluar=DATA["Barang Keluar"]||[], rpl=DATA["RPL"]||[], bulky=DATA["BULKY"]||[];
const inTotals=getSkuTotals(masuk),outTotals=getSkuTotals(keluar);
const skuDisplayMap=buildSkuDisplayMap([...DATA["Kartu Stock"]||[],...masuk,...keluar,...rpl,...bulky]);
const getSkuDisplay=sku=>skuDisplayMap[sku]||sku;
const skuNames={};[...DATA["Kartu Stock"]||[],...masuk,...keluar,...rpl,...bulky].forEach(r=>{const rawSku=getVal(r,["sku"]);if(!isValidSku(rawSku))return;const sku=normalizeSku(rawSku);const nama=getSkuName(r);if(!sku)return;if(!skuNames[sku])skuNames[sku]=new Set();if(nama)skuNames[sku].add(nama);});
Object.keys(outTotals).forEach(sku=>{if(!inTotals[sku])rows.push({severity:'High',sku:getSkuDisplay(sku),nama:[...(skuNames[sku]||[])][0]||'-',issue:'SKU keluar tanpa data masuk',source:'Barang Keluar',recommendation:'Verifikasi transaksi barang masuk sebelum pengeluaran.'});if(outTotals[sku]>(inTotals[sku]||0))rows.push({severity:'High',sku:getSkuDisplay(sku),nama:[...(skuNames[sku]||[])][0]||'-',issue:'Qty keluar > qty masuk',source:'Barang Masuk/Barang Keluar',recommendation:'Audit mutasi dan koreksi qty.'});});
[rpl,bulky].forEach((list,idx)=>list.forEach(r=>{const rawSku=getVal(r,["sku"]);if(!isValidSku(rawSku))return;const sku=normalizeSku(rawSku);if(sku&&!kartuSet.has(sku))rows.push({severity:'Medium',sku:getSkuDisplay(sku),nama:getSkuName(r)||'-',issue:idx===0?'SKU RPL tidak ada di Kartu Stock':'SKU BULKY tidak ada di Kartu Stock',source:idx===0?'RPL':'BULKY',recommendation:'Sinkronkan master SKU ke Kartu Stock.'});}));
Object.entries(skuNames).forEach(([sku,names])=>{if(names.size>1)rows.push({severity:'Medium',sku:getSkuDisplay(sku),nama:[...names].join(' | '),issue:'SKU sama nama berbeda',source:'Multi Source',recommendation:'Standarisasi nama barang per SKU.'});});
[...DATA["Kartu Stock"]||[],...masuk,...keluar,...rpl,...bulky].forEach(r=>{const rawSku=getVal(r,["sku"]);if(!isValidSku(rawSku))return;const sku=normalizeSku(rawSku);if(!sku)return;const nama=getSkuName(r);const source=SHEETS.find(s=>(DATA[s]||[]).includes(r))||'Unknown';if(!nama)rows.push({severity:'Low',sku:String(rawSku).trim()||sku,nama:'-',issue:'Nama barang kosong',source,recommendation:'Lengkapi nama barang.'});});
return rows;}
function renderAnomalyPage(){
const all=buildAnomalyReport();ANOMALY_STATE.rows=all;const sev=anomalySeverity?.value||'all',typ=anomalyType?.value||'all',q=clean(anomalySearch?.value||'');
const types=[...new Set(all.map(r=>r.issue))];if(anomalyType&&anomalyType.options.length<=1){anomalyType.innerHTML='<option value="all">Semua Jenis Masalah</option>'+types.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');}
let rows=all.filter(r=>(sev==='all'||r.severity===sev)&&(typ==='all'||r.issue===typ));if(q)rows=rows.filter(r=>clean(`${r.sku} ${r.nama}`).includes(q));
const cnt={High:rows.filter(r=>r.severity==='High').length,Medium:rows.filter(r=>r.severity==='Medium').length,Low:rows.filter(r=>r.severity==='Low').length};anomalySummary.innerHTML=[["Total warning",rows.length],["High severity",cnt.High],["Medium severity",cnt.Medium],["Low severity",cnt.Low]].map(c=>`<div class='metric'><div class='k'>${c[0]}</div><div class='v'>${c[1]}</div></div>`).join('');
const size=Number(document.getElementById('anomalySize')?.value||ANOMALY_STATE.pageSize||25);ANOMALY_STATE.pageSize=[25,50,100].includes(size)?size:25;const max=Math.max(1,Math.ceil(rows.length/ANOMALY_STATE.pageSize));if(ANOMALY_STATE.page>max)ANOMALY_STATE.page=max;const pageRows=rows.slice((ANOMALY_STATE.page-1)*ANOMALY_STATE.pageSize,ANOMALY_STATE.page*ANOMALY_STATE.pageSize);
const sevClass=s=>s==='High'?'b-high':s==='Medium'?'b-medium':'b-low';
anomalyTable.innerHTML=`<div class='row anomaly-toolbar'><select id='anomalySize' onchange='renderAnomalyPage()'><option value='25'>25</option><option value='50'>50</option><option value='100'>100</option></select><button class='btn-ghost' onclick='changeAnomalyPage(-1)'>Prev</button><button class='btn-ghost' onclick='changeAnomalyPage(1)'>Next</button></div><div class='table-wrap table-wrap-full anomaly-table-wrap'><table><thead><tr><th>Severity</th><th>SKU</th><th>Nama Barang</th><th>Masalah</th><th>Source</th><th>Rekomendasi</th><th>Action</th></tr></thead><tbody>${pageRows.map(r=>`<tr><td><span class='badge ${sevClass(r.severity)}'>${r.severity}</span></td><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td>${esc(r.issue)}</td><td>${esc(r.source)}</td><td>${esc(r.recommendation)}</td><td><button class='btn-ghost' onclick="navigateTo('/sku/'+encodeURIComponent('${encAttr(r.sku)}'))">Lihat Detail SKU</button></td></tr>`).join('')||`<tr><td colspan='7'><div class='state'>Tidak ada warning.</div></td></tr>`}</tbody></table></div>`;document.getElementById('anomalySize').value=String(ANOMALY_STATE.pageSize);}
function changeAnomalyPage(step){const max=Math.max(1,Math.ceil((ANOMALY_STATE.rows?.length||0)/ANOMALY_STATE.pageSize));ANOMALY_STATE.page=Math.min(max,Math.max(1,ANOMALY_STATE.page+step));renderAnomalyPage();}
window.renderAnomalyPage=renderAnomalyPage;window.changeAnomalyPage=changeAnomalyPage;


const CYCLE_KEY="cycle_count_history_v3";
const CYCLE_HISTORY_RANGE="Cycle Count!A1:ZZ";
const CYCLE_STATE={sessionActive:false,searchInput:"",search:"",searchTimer:null,sessionItems:[],submitting:false};
let cycleHistoryPage=1;
let cycleHistoryPageSize=10;
const CYCLE_HEADER_ALIAS={tanggal:["tanggal","date"],lokasi:["lokasi","location"],sku:["sku"],nama:["nama barang","nama","item","description"],bulky:["bulky","stok bulky","qty bulky"],retail:["retail","stok retail","qty retail"],aktualBulky:["aktual bulky","qty aktual bulky"],aktualRetail:["aktual retail","qty aktual retail"],catatan:["catatan","note"],createdAt:["created at","created_at"]};
let CYCLE_HISTORY_REMOTE={rows:[],error:"",loaded:false};
const HISTORY_EDIT_STATE={cycle:{},movement:{}};
function findHeaderRow(rows){const values=Array.isArray(rows)?rows:[];for(let i=0;i<values.length;i++){const normalized=(values[i]||[]).map(c=>clean(String(c||"")));if(normalized.includes("sku")&&normalized.includes("nama barang")&&normalized.includes("lokasi"))return i;}throw new Error("Header Cycle Count tidak ditemukan. Pastikan kolom SKU, Nama Barang, dan Lokasi tersedia.");}
function mapHeaderIndex(headerRow){const normalized=(headerRow||[]).map(c=>clean(String(c||"")));const findByAlias=(aliases)=>{for(let i=0;i<normalized.length;i++){if(aliases.includes(normalized[i]))return i;}return -1;};const findDuplicates=(aliases)=>{const indexes=[];for(let i=0;i<normalized.length;i++){if(aliases.includes(normalized[i]))indexes.push(i);}return indexes;};const bulkyIndexes=findDuplicates(CYCLE_HEADER_ALIAS.bulky);const retailIndexes=findDuplicates(CYCLE_HEADER_ALIAS.retail);const mapping={tanggal:findByAlias(CYCLE_HEADER_ALIAS.tanggal),lokasi:findByAlias(CYCLE_HEADER_ALIAS.lokasi),sku:findByAlias(CYCLE_HEADER_ALIAS.sku),nama_barang:findByAlias(CYCLE_HEADER_ALIAS.nama),bulky:bulkyIndexes[0]??-1,retail:retailIndexes[0]??-1,aktual_bulky:bulkyIndexes[1]??-1,aktual_retail:retailIndexes[1]??-1,catatan:findByAlias(CYCLE_HEADER_ALIAS.catatan),created_at:findByAlias(CYCLE_HEADER_ALIAS.createdAt)};if(mapping.aktual_bulky<0)mapping.aktual_bulky=findByAlias(CYCLE_HEADER_ALIAS.aktualBulky);if(mapping.aktual_retail<0)mapping.aktual_retail=findByAlias(CYCLE_HEADER_ALIAS.aktualRetail);const required=["tanggal","lokasi","sku","nama_barang","bulky","retail","aktual_bulky","aktual_retail"];const missing=required.filter(k=>mapping[k]<0);if(missing.length)throw new Error(`Header Cycle Count tidak valid. Kolom tidak ditemukan: ${missing.join(", ")}`);return mapping;}
function parseRows(rows){const values=Array.isArray(rows)?rows:[];if(!values.length)return [];const headerRowIndex=findHeaderRow(values);const mapping=mapHeaderIndex(values[headerRowIndex]||[]);const parsed=[];for(let r=headerRowIndex+1;r<values.length;r++){const row=values[r]||[];if(!row.some(c=>String(c||"").trim()))continue;parsed.push({tanggal:String(row[mapping.tanggal]||""),lokasi:String(row[mapping.lokasi]||""),sku:String(row[mapping.sku]||""),nama_barang:String(row[mapping.nama_barang]||""),bulky:parseNumber(row[mapping.bulky]??0),retail:parseNumber(row[mapping.retail]??0),aktual_bulky:parseNumber(row[mapping.aktual_bulky]??0),aktual_retail:parseNumber(row[mapping.aktual_retail]??0),catatan:String(row[mapping.catatan]||""),created_at:String(row[mapping.created_at]||"")});}return parsed;}
function parseCycleHistoryRows(rawValues){try{const rows=parseRows(rawValues);return {rows:rows.map((r,i)=>({tanggal:r.tanggal,lokasi:r.lokasi,sku:r.sku,nama:r.nama_barang,bulky:r.bulky,retail:r.retail,aktualBulky:r.aktual_bulky,aktualRetail:r.aktual_retail,catatan:r.catatan,createdAt:r.created_at,rowNumber:i+4})),error:""};}catch(err){return {rows:[],error:err?.message||"Header Cycle Count tidak valid."};}}
async function fetchCycleHistoryRemote(){const url=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(CYCLE_HISTORY_RANGE)}?key=${API_KEY}`;const res=await fetch(url);const json=await res.json();if(!res.ok||json.error)throw new Error((json.error&&json.error.message)||res.statusText||"Gagal memuat sheet Cycle Count");return parseCycleHistoryRows(json.values||[]);}
async function ensureCycleHistoryLoaded(){if(CYCLE_HISTORY_REMOTE.loaded)return;try{const parsed=await fetchCycleHistoryRemote();CYCLE_HISTORY_REMOTE={rows:parsed.rows,error:parsed.error||"",loaded:true};}catch(err){CYCLE_HISTORY_REMOTE={rows:[],error:`Gagal fetch Cycle Count: ${err.message||"unknown error"}`,loaded:true};}}
function getQty(item){const qtySystem=Number(item?.stok_akhir??item?.stokAkhir??item?.qty??item?.availableQty??0);return Number.isFinite(qtySystem)?qtySystem:0;}
function getCycleSourceRows(){return (DATA["Kartu Stock"]||[]).map(r=>{const sku=String(getVal(r,["sku"])||"").trim();const nama=String(getVal(r,["nama barang","nama","item","description"])||"-").trim()||"-";const lokasi=String(getVal(r,["lokasi","location","rak","bin","area"])||"-").trim()||"-";const stok_akhir=getQty({stok_akhir:getVal(r,["stok akhir","stok_akhir","closing stock","ending stock","saldo akhir"]),stokAkhir:getVal(r,["stokAkhir"]),qty:getVal(r,["qty"]),availableQty:getVal(r,["availableQty"])});return {sku,nama,lokasi,stok_akhir};}).filter(r=>r.sku&&Number(r.stok_akhir)!==0);}
function getCycleCandidates(query){const q=clean(query);if(!q)return[];return getCycleSourceRows().filter(r=>clean(`${r.sku} ${r.nama} ${r.lokasi}`).includes(q)).slice(0,40);}
function cycleItemKey(item){return `${clean(item.sku)}__${clean(item.lokasi)}`;}
function cycleDiffBadge(item){const db=(Number(item.aktualBulky)-Number(item.bulky));const dr=(Number(item.aktualRetail)-Number(item.retail));return db===0&&dr===0?"<span class='badge b-ok'>Sesuai</span>":"<span class='badge b-warn'>Ada Selisih</span>";}
function formatTanggal(date){const d=new Date(date);const day=String(d.getDate()).padStart(2,"0");const month=String(d.getMonth()+1).padStart(2,"0");const year=d.getFullYear();return `${day}/${month}/${year}`;}
function canSubmitCycle(){return CYCLE_STATE.sessionItems.length>0&&CYCLE_STATE.sessionItems.every(it=>Number.isFinite(it.aktualBulky)&&Number.isFinite(it.aktualRetail));}
function buildCycleHistoryRows(){return [...(CYCLE_HISTORY_REMOTE.rows||[])];}
function renderCycleSearchResults(){const tbody=document.querySelector('#ccSearchResultsBody');if(!tbody)return;const candidates=CYCLE_STATE.sessionActive?getCycleCandidates(CYCLE_STATE.search):[];if(!candidates.length){tbody.innerHTML="<tr><td colspan='5'><div class='state cc-state'>Cari SKU untuk menambah item.</div></td></tr>";return;}const frag=document.createDocumentFragment();candidates.forEach(c=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(c.lokasi)}</td><td>${esc(c.sku)}</td><td>${esc(c.nama)}</td><td>${esc(c.stok_akhir)}</td><td><button class='btn-ghost' data-cc-action='add' data-sku='${encAttr(c.sku)}' data-lok='${encAttr(c.lokasi)}'>Tambah</button></td>`;frag.appendChild(tr);});tbody.replaceChildren(frag);}
function renderCycleSessionTable(){const tbody=document.querySelector('#ccSessionBody');if(!tbody)return;const submitBtn=document.getElementById('ccSubmitBtn');if(submitBtn){submitBtn.disabled=!canSubmitCycle()||CYCLE_STATE.submitting;submitBtn.textContent=CYCLE_STATE.submitting?"Menyimpan...":"Selesai Cycle Count";}if(!CYCLE_STATE.sessionItems.length){tbody.innerHTML="<tr><td colspan='12'><div class='state cc-state'>Belum ada item dalam session.</div></td></tr>";return;}const frag=document.createDocumentFragment();CYCLE_STATE.sessionItems.forEach((r,i)=>{const db=(Number(r.aktualBulky)-Number(r.bulky))||0;const dr=(Number(r.aktualRetail)-Number(r.retail))||0;const tr=document.createElement('tr');tr.dataset.idx=String(i);tr.innerHTML=`<td>${esc(r.lokasi)}</td><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td>${r.bulky}</td><td>${r.retail}</td><td><input type='number' data-cc='ab' data-idx='${i}' value='${r.aktualBulky??""}'></td><td><input type='number' data-cc='ar' data-idx='${i}' value='${r.aktualRetail??""}'></td><td><input data-cc='ct' data-idx='${i}' value='${esc(r.catatan||"")}'></td><td data-cc-cell='db'>${db}</td><td data-cc-cell='dr'>${dr}</td><td data-cc-cell='st'>${cycleDiffBadge(r)}</td><td><button class='btn-ghost' data-cc-action='remove' data-idx='${i}'>Hapus</button></td>`;frag.appendChild(tr);});tbody.replaceChildren(frag);}
function renderCycleHistory(){const tbody=document.querySelector('#ccHistoryBody');if(!tbody)return;const info=document.getElementById('ccHistoryInfo');const prev=document.getElementById('ccHistoryPrev');const next=document.getElementById('ccHistoryNext');const sizeSel=document.getElementById('ccHistoryPageSize');const historySorted=[...buildCycleHistoryRows()].reverse();const total=historySorted.length;const totalPages=Math.max(1,Math.ceil(total/cycleHistoryPageSize));if(cycleHistoryPage>totalPages)cycleHistoryPage=totalPages;const start=(cycleHistoryPage-1)*cycleHistoryPageSize;const end=start+cycleHistoryPageSize;const pageRows=historySorted.slice(start,end);if(sizeSel)sizeSel.value=String(cycleHistoryPageSize);if(info)info.textContent=`Menampilkan ${total?start+1:0}-${Math.min(end,total)} dari ${total} data`;if(prev)prev.disabled=cycleHistoryPage<=1;if(next)next.disabled=cycleHistoryPage>=totalPages;if(!total){tbody.innerHTML="<tr><td colspan='11'><div class='state'>Belum ada history cycle count.</div></td></tr>";return;}const frag=document.createDocumentFragment();pageRows.forEach(r=>{const edit=HISTORY_EDIT_STATE.cycle[r.rowNumber];const tr=document.createElement('tr');if(edit){tr.innerHTML=`<td><input data-cch-edit='tanggal' data-row='${r.rowNumber}' value='${esc(edit.tanggal||"")}'></td><td><input data-cch-edit='lokasi' data-row='${r.rowNumber}' value='${esc(edit.lokasi||"")}'></td><td><input data-cch-edit='sku' data-row='${r.rowNumber}' value='${esc(edit.sku||"")}'></td><td><input data-cch-edit='nama' data-row='${r.rowNumber}' value='${esc(edit.nama||"")}'></td><td><input type='number' data-cch-edit='bulky' data-row='${r.rowNumber}' value='${esc(edit.bulky)}'></td><td><input type='number' data-cch-edit='retail' data-row='${r.rowNumber}' value='${esc(edit.retail)}'></td><td><input type='number' data-cch-edit='aktualBulky' data-row='${r.rowNumber}' value='${esc(edit.aktualBulky)}'></td><td><input type='number' data-cch-edit='aktualRetail' data-row='${r.rowNumber}' value='${esc(edit.aktualRetail)}'></td><td><input data-cch-edit='catatan' data-row='${r.rowNumber}' value='${esc(edit.catatan||"")}'></td><td>${cycleDiffBadge(edit)}</td><td><button class='btn-ghost' data-cch-action='save' data-row='${r.rowNumber}'>Simpan</button> <button class='btn-ghost' data-cch-action='cancel' data-row='${r.rowNumber}'>Batal</button></td>`;}else{tr.innerHTML=`<td>${esc(r.tanggal||"-")}</td><td>${esc(r.lokasi)}</td><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td>${r.bulky}</td><td>${r.retail}</td><td>${r.aktualBulky}</td><td>${r.aktualRetail}</td><td>${esc(r.catatan||"-")}</td><td>${cycleDiffBadge(r)}</td><td><button class='btn-ghost' data-cch-action='edit' data-row='${r.rowNumber}'>Edit</button> <button class='btn-ghost' data-cch-action='delete' data-row='${r.rowNumber}'>Hapus</button></td>`;}frag.appendChild(tr);});tbody.replaceChildren(frag);}
function renderCycleCountPage(){if(!cycleCountApp)return;cycleCountApp.innerHTML=`<div class='card cc-card cc-section'><div class='section-header cc-main-header'><div class='cc-action-stack'>${CYCLE_STATE.sessionActive?"<button class='btn-ghost' onclick='ccCancelSession()'>Batal Cycle Count</button>":""}<button class='btn-primary' onclick='ccStartSession()' ${CYCLE_STATE.sessionActive?"disabled":""}>Mulai Cycle Count</button>${CYCLE_STATE.sessionActive?"<button id='ccSubmitBtn' class='btn-primary' onclick='ccSubmitSession()'>Selesai Cycle Count</button>":""}</div></div>${CYCLE_HISTORY_REMOTE.error?`<div class='state cc-state state-error'>${esc(CYCLE_HISTORY_REMOTE.error)}</div>`:""}${CYCLE_STATE.sessionActive?`<div class='cc-section'><div class='mv-toolbar'><input id='ccSearch' class='search-lg' placeholder='Cari SKU / nama barang / lokasi' value='${esc(CYCLE_STATE.searchInput)}'></div></div><div class='cc-section'><div class='table-wrap cc-table-wrap cc-search-wrap'><table><thead><tr><th>Lokasi</th><th>SKU</th><th>Nama Barang</th><th>Qty (Stok Akhir)</th><th>Aksi</th></tr></thead><tbody id='ccSearchResultsBody'></tbody></table></div></div><div class='cc-section'><h4>Cycle Count Berjalan</h4><div class='table-wrap cc-table-wrap cc-session-wrap'><table><thead><tr><th>Lokasi</th><th>SKU</th><th>Nama Barang</th><th>Stok Bulky</th><th>Stok Retail</th><th>Aktual Bulky</th><th>Aktual Retail</th><th>Catatan</th><th>Selisih Bulky</th><th>Selisih Retail</th><th>Status</th><th>Aksi</th></tr></thead><tbody id='ccSessionBody'></tbody></table></div></div>`:`<div class='cc-empty-state'><i data-lucide='clipboard-check'></i><h4>Belum ada cycle count berjalan</h4><p>Klik Mulai Cycle Count untuk memilih SKU dan input stok aktual.</p></div>`}</div><div class='card cc-card cc-section'><div class='section-header'><h4>History Cycle Count</h4></div><div class='table-wrap cc-table-wrap'><table><thead><tr><th>Tanggal</th><th>Lokasi</th><th>SKU</th><th>Nama Barang</th><th>Bulky</th><th>Retail</th><th>Aktual Bulky</th><th>Aktual Retail</th><th>Catatan</th><th>Status</th><th>Aksi</th></tr></thead><tbody id='ccHistoryBody'></tbody></table></div><div class='mv-pagination'><span id='ccHistoryInfo'>Menampilkan 0-0 dari 0 data</span><div class='row'><select id='ccHistoryPageSize'><option value='10'>10</option><option value='25'>25</option><option value='50'>50</option></select><button id='ccHistoryPrev' class='btn-ghost'>Prev</button><button id='ccHistoryNext' class='btn-ghost'>Next</button></div></div></div>`;if(window.lucide&&typeof window.lucide.createIcons==="function")window.lucide.createIcons();if(CYCLE_STATE.sessionActive){renderCycleSearchResults();renderCycleSessionTable();}renderCycleHistory();}
window.ccStartSession=()=>{CYCLE_STATE.sessionActive=true;CYCLE_STATE.search="";CYCLE_STATE.searchInput="";CYCLE_STATE.sessionItems=[];renderCycleCountPage();};
window.ccCancelSession=()=>{showConfirmModal({title:'Batal Cycle Count',message:'Batalkan cycle count yang sedang berjalan?',confirmText:'Ya, Batalkan',cancelText:'Kembali',type:'danger',onConfirm:()=>{CYCLE_STATE.sessionActive=false;CYCLE_STATE.search="";CYCLE_STATE.searchInput="";CYCLE_STATE.sessionItems=[];CYCLE_STATE.submitting=false;renderCycleCountPage();}});};
function addCycleItem(source){const qtySystem=getQty(source);const newItem={...source,bulky:qtySystem,retail:0,aktualBulky:null,aktualRetail:null,catatan:""};const key=cycleItemKey(newItem);if(CYCLE_STATE.sessionItems.some(it=>cycleItemKey(it)===key)){toast('SKU/lokasi sudah ada di session.','error');return;}CYCLE_STATE.sessionItems.push(newItem);renderCycleSessionTable();toast('Item ditambahkan','success');}
window.ccAddItem=(skuEnc,lokEnc)=>{const sku=decodeURIComponent(skuEnc),lokasi=decodeURIComponent(lokEnc);const source=getCycleSourceRows().find(r=>clean(r.sku)===clean(sku)&&clean(r.lokasi)===clean(lokasi));if(!source)return;addCycleItem(source);};
window.ccRemoveItem=(idx)=>{CYCLE_STATE.sessionItems.splice(idx,1);renderCycleSessionTable();};
window.ccSubmitSession=async()=>{if(!canSubmitCycle()){toast('Lengkapi aktual bulky dan aktual retail semua item.','error');return;}CYCLE_STATE.submitting=true;renderCycleSessionTable();try{const tanggal=formatTanggal(new Date());const payload={tanggal,items:CYCLE_STATE.sessionItems.map(it=>({lokasi:it.lokasi,sku:it.sku,nama_barang:it.nama,bulky:Number(it.bulky)||0,retail:Number(it.retail)||0,aktual_bulky:Number(it.aktualBulky),aktual_retail:Number(it.aktualRetail),catatan:it.catatan||""}))};const res=await fetch('/api/cycle-count',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok||!data?.success)throw new Error(data?.message||'Gagal menyimpan cycle count');toast('Cycle count berhasil disimpan','success');CYCLE_STATE.sessionActive=false;CYCLE_STATE.searchInput="";CYCLE_STATE.search="";CYCLE_STATE.sessionItems=[];await ensureCycleHistoryLoaded();CYCLE_HISTORY_REMOTE.loaded=false;await ensureCycleHistoryLoaded();if(typeof syncData==='function')syncData();}catch(err){toast(err?.message||'Gagal menyimpan cycle count','error');}finally{CYCLE_STATE.submitting=false;renderCycleCountPage();}};
document.addEventListener('input',e=>{if(e.target?.id==='ccSearch'){CYCLE_STATE.searchInput=e.target.value;cycleHistoryPage=1;clearTimeout(CYCLE_STATE.searchTimer);CYCLE_STATE.searchTimer=setTimeout(()=>{CYCLE_STATE.search=CYCLE_STATE.searchInput;renderCycleSearchResults();},280);return;}if(e.target?.id==='ccHistoryPageSize'){cycleHistoryPageSize=Number(e.target.value)||10;cycleHistoryPage=1;renderCycleHistory();return;}if(e.target?.dataset?.cc){const idx=Number(e.target.dataset.idx);const row=CYCLE_STATE.sessionItems[idx];if(!row)return;if(e.target.dataset.cc==='ab'){const n=Number(e.target.value);row.aktualBulky=Number.isFinite(n)?n:null;}if(e.target.dataset.cc==='ar'){const n=Number(e.target.value);row.aktualRetail=Number.isFinite(n)?n:null;}if(e.target.dataset.cc==='ct')row.catatan=e.target.value||"";const tr=e.target.closest('tr');if(tr){const db=(Number(row.aktualBulky)-Number(row.bulky))||0;const dr=(Number(row.aktualRetail)-Number(row.retail))||0;const dbCell=tr.querySelector("[data-cc-cell='db']"),drCell=tr.querySelector("[data-cc-cell='dr']"),stCell=tr.querySelector("[data-cc-cell='st']");if(dbCell)dbCell.textContent=String(db);if(drCell)drCell.textContent=String(dr);if(stCell)stCell.innerHTML=cycleDiffBadge(row);}const submitBtn=document.getElementById('ccSubmitBtn');if(submitBtn)submitBtn.disabled=!canSubmitCycle()||CYCLE_STATE.submitting;}});
document.addEventListener('click',e=>{const btn=e.target?.closest('[data-cc-action]');if(!btn)return;if(btn.dataset.ccAction==='add')ccAddItem(btn.dataset.sku||"",btn.dataset.lok||"");if(btn.dataset.ccAction==='remove')ccRemoveItem(Number(btn.dataset.idx));});
document.addEventListener("DOMContentLoaded",()=>{ensureCycleHistoryLoaded().finally(()=>renderCycleCountPage());});


const ARCHIVE_SPREADSHEET_IDS=[SPREADSHEET_ID];
const ARCHIVE_STATE={sheetList:[],selectedSheet:"",cache:{},loadingList:false,loadingData:false,listError:"",dataError:"",searchInput:"",search:"",searchTimer:null,sortColumn:"",sortDirection:"asc",columnFilter:"all",page:1,pageSize:25,lastLoadedAt:{}};

function bindArchiveEvents(){document.addEventListener("change",e=>{if(e.target?.id==="archiveSheetSelect")selectArchiveSheet(e.target.value);if(e.target?.id==="archiveSortColumn"){ARCHIVE_STATE.sortColumn=e.target.value;ARCHIVE_STATE.page=1;renderArchivePage();}if(e.target?.id==="archiveSortDir"){ARCHIVE_STATE.sortDirection=e.target.value;ARCHIVE_STATE.page=1;renderArchivePage();}if(e.target?.id==="archiveColumnFilter"){ARCHIVE_STATE.columnFilter=e.target.value;ARCHIVE_STATE.page=1;renderArchivePage();}});document.addEventListener("input",e=>{if(e.target?.id!=="archiveSearch")return;ARCHIVE_STATE.searchInput=e.target.value||"";clearTimeout(ARCHIVE_STATE.searchTimer);ARCHIVE_STATE.searchTimer=setTimeout(()=>{ARCHIVE_STATE.search=ARCHIVE_STATE.searchInput;ARCHIVE_STATE.page=1;renderArchivePage();},250);});document.addEventListener("click",e=>{if(e.target?.closest("#archiveRefreshBtn"))refreshArchive();const pg=e.target?.closest("[data-archive-page]");if(pg){ARCHIVE_STATE.page=Math.max(1,ARCHIVE_STATE.page+(Number(pg.dataset.archivePage)||0));renderArchivePage();}});}
function normalizeArchiveCell(value){return String(value??"").trim();}
function parseArchiveSheetFlexible(values){
if(!Array.isArray(values)||!values.length)return {rows:[],columns:[],headerError:false};
let headerIndex=-1,bestFilled=0;
for(let i=0;i<values.length;i++){
const filled=(values[i]||[]).reduce((n,cell)=>n+(normalizeArchiveCell(cell)?1:0),0);
if(filled>bestFilled){bestFilled=filled;headerIndex=i;}
}
if(headerIndex<0||bestFilled<=0)return {rows:[],columns:[],headerError:true};
const headerRow=values[headerIndex]||[];
const colCount=Math.max(...values.map(r=>(r||[]).length),headerRow.length);
const columns=Array.from({length:colCount},(_,i)=>normalizeArchiveCell(headerRow[i])||`Kolom ${i+1}`);
const rows=[];
for(let r=headerIndex+1;r<values.length;r++){
const row=values[r]||[];
const isEmpty=!row.length||row.every(c=>!normalizeArchiveCell(c));
if(isEmpty)continue;
const obj={};
for(let c=0;c<columns.length;c++)obj[columns[c]]=normalizeArchiveCell(row[c]||"");
rows.push(obj);
}
return {rows,columns,headerError:false};
}
async function fetchArchiveSheetList(){
const all=[];
for(const spreadsheetId of ARCHIVE_SPREADSHEET_IDS){
const url=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title&key=${API_KEY}`;
const res=await fetch(url);
const json=await res.json();
if(!res.ok||json.error)throw new Error((json.error&&json.error.message)||res.statusText||"Gagal memuat daftar sheet");
const names=(json.sheets||[]).map(s=>String(s?.properties?.title||"").trim()).filter(Boolean);
names.forEach(name=>all.push({key:`${spreadsheetId}::${name}`,name,spreadsheetId}));
}
return all;
}
async function fetchArchiveSheetData(sheetKey){
const selected=ARCHIVE_STATE.sheetList.find(s=>s.key===sheetKey);
if(!selected)throw new Error("Sheet arsip tidak valid");
const range=`${selected.name}!A1:ZZ`;
const url=`https://sheets.googleapis.com/v4/spreadsheets/${selected.spreadsheetId}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
const res=await fetch(url);
const json=await res.json();
if(!res.ok||json.error) throw new Error(`${selected.name}: ${(json.error&&json.error.message)||res.statusText}`);
return parseArchiveSheetFlexible(json.values||[]);
}
async function ensureArchiveList(){if(ARCHIVE_STATE.sheetList.length||ARCHIVE_STATE.loadingList)return;ARCHIVE_STATE.loadingList=true;ARCHIVE_STATE.listError="";renderArchivePage();try{ARCHIVE_STATE.sheetList=await fetchArchiveSheetList();}catch(err){ARCHIVE_STATE.listError=err.message||"Gagal memuat daftar sheet";}finally{ARCHIVE_STATE.loadingList=false;renderArchivePage();}}
async function selectArchiveSheet(sheetName){ARCHIVE_STATE.selectedSheet=sheetName||"";ARCHIVE_STATE.page=1;ARCHIVE_STATE.dataError="";if(!sheetName){renderArchivePage();return;}if(ARCHIVE_STATE.cache[sheetName]){renderArchivePage();return;}ARCHIVE_STATE.loadingData=true;renderArchivePage();try{ARCHIVE_STATE.cache[sheetName]=await fetchArchiveSheetData(sheetName);ARCHIVE_STATE.lastLoadedAt[sheetName]=new Date().toISOString();}catch(err){ARCHIVE_STATE.dataError=err.message||"Gagal memuat data sheet";}finally{ARCHIVE_STATE.loadingData=false;renderArchivePage();}}
async function refreshArchive(){const sheet=ARCHIVE_STATE.selectedSheet;if(!sheet){ARCHIVE_STATE.sheetList=[];await ensureArchiveList();return;}delete ARCHIVE_STATE.cache[sheet];ARCHIVE_STATE.loadingData=true;ARCHIVE_STATE.dataError="";renderArchivePage();try{ARCHIVE_STATE.cache[sheet]=await fetchArchiveSheetData(sheet);ARCHIVE_STATE.lastLoadedAt[sheet]=new Date().toISOString();}catch(err){ARCHIVE_STATE.dataError=err.message||"Gagal refresh data";}finally{ARCHIVE_STATE.loadingData=false;renderArchivePage();}}
function getArchiveRows(){const parsed=ARCHIVE_STATE.cache[ARCHIVE_STATE.selectedSheet]||{rows:[],columns:[],headerError:false};const cols=parsed.columns||[];const q=clean(ARCHIVE_STATE.search);let out=(parsed.rows||[]).filter(r=>!q||cols.some(c=>clean(String(r[c]??"")).includes(q)));if(ARCHIVE_STATE.columnFilter!=="all"&&q)out=out.filter(r=>clean(String(r[ARCHIVE_STATE.columnFilter]??"")).includes(q));const col=ARCHIVE_STATE.sortColumn||cols[0]||"";if(col)out=[...out].sort((a,b)=>{const av=a[col],bv=b[col];const an=Number(av),bn=Number(bv),numA=Number.isFinite(an),numB=Number.isFinite(bn);let cmp=0;if(numA&&numB)cmp=an-bn;else cmp=String(av??"").localeCompare(String(bv??""),"id");return ARCHIVE_STATE.sortDirection==="desc"?-cmp:cmp;});return {rows:out,columns:cols,headerError:!!parsed.headerError};}
function renderArchivePage(){if(!archiveApp)return;if(!ARCHIVE_STATE.sheetList.length&&!ARCHIVE_STATE.loadingList)ensureArchiveList();const selected=ARCHIVE_STATE.selectedSheet;const parsed=ARCHIVE_STATE.cache[selected]||{rows:[],columns:[],headerError:false};const sourceRows=parsed.rows||[];const {rows,columns,headerError}=selected?getArchiveRows():{rows:[],columns:[],headerError:false};const totalPage=Math.max(1,Math.ceil(rows.length/ARCHIVE_STATE.pageSize));if(ARCHIVE_STATE.page>totalPage)ARCHIVE_STATE.page=totalPage;const start=(ARCHIVE_STATE.page-1)*ARCHIVE_STATE.pageSize;const pageRows=rows.slice(start,start+ARCHIVE_STATE.pageSize);const activeSheetName=(ARCHIVE_STATE.sheetList.find(s=>s.key===selected)||{}).name||selected||"-";const lastLoaded=selected&&ARCHIVE_STATE.lastLoadedAt[selected]?new Date(ARCHIVE_STATE.lastLoadedAt[selected]).toLocaleString("id-ID"):"-";const sortOps=columns.map(c=>`<option value='${esc(c)}' ${ARCHIVE_STATE.sortColumn===c?"selected":""}>${esc(c)}</option>`).join("");archiveApp.innerHTML=`<div class='archive-layout'><div class='card archive-section'><div class='section-header'><h3 class='page-title'>Arsip</h3><div class='row'><select id='archiveSheetSelect'><option value=''>Pilih Sheet Arsip</option>${ARCHIVE_STATE.sheetList.map(s=>`<option value='${esc(s.key)}' ${s.key===selected?"selected":""}>${esc(s.name)}</option>`).join("")}</select><button id='archiveRefreshBtn' class='btn-ghost'>Refresh Arsip</button></div></div>${ARCHIVE_STATE.loadingList?"<div class='state'>Memuat daftar sheet arsip...</div>":ARCHIVE_STATE.listError?`<div class='state'>${esc(ARCHIVE_STATE.listError)}</div>`:""}</div><div class='card archive-section archive-filter-card'><div class='mv-filters open archive-filters'><input id='archiveSearch' class='search-lg' placeholder='Cari di semua kolom' value='${esc(ARCHIVE_STATE.searchInput)}'/><select id='archiveSortColumn'><option value=''>Urutkan Kolom</option>${sortOps}</select><select id='archiveSortDir'><option value='asc' ${ARCHIVE_STATE.sortDirection==='asc'?'selected':''}>ASC</option><option value='desc' ${ARCHIVE_STATE.sortDirection==='desc'?'selected':''}>DESC</option></select><select id='archiveColumnFilter'><option value='all'>Semua Kolom</option>${columns.map(c=>`<option value='${esc(c)}' ${ARCHIVE_STATE.columnFilter===c?'selected':''}>Filter: ${esc(c)}</option>`).join('')}</select></div></div>${!selected?"<div class='card archive-section'><div class='state'>Pilih sheet arsip untuk melihat data</div></div>":ARCHIVE_STATE.loadingData?"<div class='card archive-section'><div class='state'>Memuat data sheet...</div></div>":ARCHIVE_STATE.dataError?`<div class='card archive-section'><div class='state'>${esc(ARCHIVE_STATE.dataError)}</div></div>`:headerError?`<div class='card archive-section'><div class='state'>Header tidak terdeteksi</div></div>`:`<div class='card archive-section'><div class='grid dashboard archive-summary'><div class='metric'><div class='k'>Total Baris</div><div class='v'>${sourceRows.length}</div></div><div class='metric'><div class='k'>Total Kolom</div><div class='v'>${columns.length}</div></div><div class='metric'><div class='k'>Sheet Aktif</div><div class='v'>${esc(activeSheetName)}</div></div><div class='metric'><div class='k'>Terakhir Dimuat</div><div class='v'>${esc(lastLoaded)}</div></div></div></div><div class='card archive-section archive-table-card'>${!rows.length?"<div class='state'>Tidak ada data</div>":`<div class='table-wrap table-wrap-full archive-table-wrap'><table><thead><tr>${columns.map(c=>`<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${pageRows.map(r=>`<tr>${columns.map(c=>`<td>${esc(r[c]??"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class='mv-pagination'><span>Menampilkan ${rows.length?start+1:0}-${Math.min(start+ARCHIVE_STATE.pageSize,rows.length)} dari ${rows.length}</span><div class='row'><button class='btn-ghost' data-archive-page='-1' ${ARCHIVE_STATE.page<=1?'disabled':''}>Prev</button><button class='btn-ghost' data-archive-page='1' ${ARCHIVE_STATE.page>=totalPage?'disabled':''}>Next</button></div></div>`}</div>`}</div>`;}

const MOVEMENT_HISTORY_RANGE="Movement!A1:H";
const MOVEMENT_STATE={sessionActive:false,searchInput:"",search:"",searchTimer:null,sessionItems:[],submitting:false};
let movementHistoryPage=1;
let movementHistoryPageSize=10;
let MOVEMENT_HISTORY_REMOTE={rows:[],error:"",loaded:false};
function canSubmitMovement(){return MOVEMENT_STATE.sessionItems.length>0&&MOVEMENT_STATE.sessionItems.every(it=>String(it.to||"").trim()&&Number.isFinite(it.stokAktual));}
function getMovementSourceRows(){return getCycleSourceRows();}
function getMovementCandidates(query){const q=clean(query);if(!q)return[];return getMovementSourceRows().filter(r=>clean(`${r.sku} ${r.nama} ${r.lokasi}`).includes(q)).slice(0,80);}
function normalizeMovementHeader(v){return String(v||"").toLowerCase().trim().replace(/\s+/g," ").replace(/ /g,"_");}
function findMovementHeaderRow(values){for(let i=0;i<values.length;i++){const norm=(values[i]||[]).map(normalizeMovementHeader);if(norm.includes("tanggal")&&norm.includes("from")&&norm.includes("to")&&norm.includes("sku"))return i;}return -1;}
function mapMovementHeaderIndex(headerRow){const normalized=(headerRow||[]).map(normalizeMovementHeader);const aliases={nama:["nama","nama_barang"],awal:["awal","stok_lokasi_awal"],aktual:["aktual","stok_aktual"],keterangan:["keterangan"]};const idx={tanggal:normalized.indexOf("tanggal"),from:normalized.indexOf("from"),to:normalized.indexOf("to"),sku:normalized.indexOf("sku"),nama:-1,awal:-1,aktual:-1,keterangan:-1};for(const key of ["nama","awal","aktual","keterangan"]){for(const alias of aliases[key]){const at=normalized.indexOf(alias);if(at>=0){idx[key]=at;break;}}}return idx;}
function parseMovementRows(values,idx,startRow){const rows=[];for(let i=startRow;i<values.length;i++){const r=values[i]||[];if(!r.some(c=>String(c||"").trim()))continue;rows.push({tanggal:String(r[idx.tanggal]||""),from:String(r[idx.from]||""),to:String(r[idx.to]||""),sku:String(r[idx.sku]||""),nama:String(r[idx.nama]||""),stok_lokasi_awal:parseNumber(r[idx.awal]??0),stok_aktual:parseNumber(r[idx.aktual]??0),keterangan:idx.keterangan>=0?String(r[idx.keterangan]||""):"",rowNumber:i+1});}return rows;}
function parseMovementHistoryRows(rawValues){try{const rows=parseRows(rawValues);return {rows:rows.map((r,i)=>({tanggal:r.tanggal,from:r.lokasi,to:r.retail?String(r.retail):String((rawValues||[])[0]||""),sku:r.sku,nama:r.nama_barang,stok_lokasi_awal:r.bulky,stok_aktual:r.aktual_bulky,keterangan:r.catatan||"",rowNumber:i+4})),error:""};}catch(_){const values=Array.isArray(rawValues)?rawValues:[];if(!values.length)return {rows:[],error:""};const headerRow=findMovementHeaderRow(values);if(headerRow<0)return {rows:[],error:"Header Movement tidak valid: tanggal, from, to, sku"};const idx=mapMovementHeaderIndex(values[headerRow]||[]);const required=["tanggal","from","to","sku","nama","awal","aktual"];const miss=required.filter(k=>idx[k]<0);if(miss.length)return {rows:[],error:`Header Movement tidak valid: ${miss.join(", ")}`};return {rows:parseMovementRows(values,idx,headerRow+1),error:""};}}
async function fetchMovementHistoryRemote(){const url=`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(MOVEMENT_HISTORY_RANGE)}?key=${API_KEY}`;const res=await fetch(url);const json=await res.json();if(!res.ok||json.error)throw new Error((json.error&&json.error.message)||res.statusText||"Gagal memuat sheet Data Movement Barang");return parseMovementHistoryRows(json.values||[]);}
async function ensureMovementHistoryLoaded(){if(MOVEMENT_HISTORY_REMOTE.loaded)return;try{const parsed=await fetchMovementHistoryRemote();MOVEMENT_HISTORY_REMOTE={rows:parsed.rows,error:parsed.error||"",loaded:true};}catch(err){MOVEMENT_HISTORY_REMOTE={rows:[],error:`Gagal fetch Movement: ${err.message||"unknown error"}`,loaded:true};}}
function buildMovementHistoryRows(){return [...(MOVEMENT_HISTORY_REMOTE.rows||[])];}
function renderMovementSearchResults(){const tbody=document.querySelector('#mvSearchResultsBody');if(!tbody)return;const candidates=MOVEMENT_STATE.sessionActive?getMovementCandidates(MOVEMENT_STATE.search):[];if(!candidates.length){tbody.innerHTML="<tr><td colspan='5'><div class='state cc-state'>Cari SKU untuk menambah item movement.</div></td></tr>";return;}const frag=document.createDocumentFragment();candidates.forEach(c=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(c.lokasi)}</td><td>${esc(c.sku)}</td><td>${esc(c.nama)}</td><td>${esc(c.stok_akhir)}</td><td><button class='btn-ghost' data-mvm-action='add' data-sku='${encAttr(c.sku)}' data-lok='${encAttr(c.lokasi)}'>Tambah</button></td>`;frag.appendChild(tr);});tbody.replaceChildren(frag);}
function renderMovementSessionTable(){const tbody=document.querySelector('#mvSessionBody');if(!tbody)return;const submitBtn=document.getElementById('mvSubmitBtn');if(submitBtn){submitBtn.disabled=!canSubmitMovement()||MOVEMENT_STATE.submitting;submitBtn.textContent=MOVEMENT_STATE.submitting?"Menyimpan...":"Selesai Movement";}if(!MOVEMENT_STATE.sessionItems.length){tbody.innerHTML="<tr><td colspan='7'><div class='state cc-state'>Belum ada item dalam session.</div></td></tr>";return;}const frag=document.createDocumentFragment();MOVEMENT_STATE.sessionItems.forEach((r,i)=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(r.lokasi)}</td><td><input data-mvm='to' data-idx='${i}' value='${esc(r.to||"")}' placeholder='Lokasi tujuan'></td><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td>${esc(r.stokAwal)}</td><td><input type='number' data-mvm='akt' data-idx='${i}' value='${r.stokAktual??""}'></td><td><button class='btn-ghost' data-mvm-action='remove' data-idx='${i}'>Hapus</button></td>`;frag.appendChild(tr);});tbody.replaceChildren(frag);}
function renderMovementHistory(){const tbody=document.querySelector('#mvHistoryBody');if(!tbody)return;const info=document.getElementById('mvHistoryInfo');const prev=document.getElementById('mvHistoryPrev');const next=document.getElementById('mvHistoryNext');const sizeSel=document.getElementById('mvHistoryPageSize');const historySorted=[...buildMovementHistoryRows()].reverse();const total=historySorted.length;const totalPages=Math.max(1,Math.ceil(total/movementHistoryPageSize));if(movementHistoryPage>totalPages)movementHistoryPage=totalPages;const start=(movementHistoryPage-1)*movementHistoryPageSize;const end=start+movementHistoryPageSize;const pageRows=historySorted.slice(start,end);if(sizeSel)sizeSel.value=String(movementHistoryPageSize);if(info)info.textContent=`Menampilkan ${total?start+1:0}-${Math.min(end,total)} dari ${total} data`;if(prev)prev.disabled=movementHistoryPage<=1;if(next)next.disabled=movementHistoryPage>=totalPages;if(!total){tbody.innerHTML="<tr><td colspan='9'><div class='state'>Belum ada history movement.</div></td></tr>";return;}const frag=document.createDocumentFragment();pageRows.forEach(r=>{const edit=HISTORY_EDIT_STATE.movement[r.rowNumber];const tr=document.createElement('tr');if(edit){tr.innerHTML=`<td><input data-mvh-edit='tanggal' data-row='${r.rowNumber}' value='${esc(edit.tanggal||"")}'></td><td><input data-mvh-edit='from' data-row='${r.rowNumber}' value='${esc(edit.from||"")}'></td><td><input data-mvh-edit='to' data-row='${r.rowNumber}' value='${esc(edit.to||"")}'></td><td><input data-mvh-edit='sku' data-row='${r.rowNumber}' value='${esc(edit.sku||"")}'></td><td><input data-mvh-edit='nama' data-row='${r.rowNumber}' value='${esc(edit.nama||"")}'></td><td><input type='number' data-mvh-edit='stok_lokasi_awal' data-row='${r.rowNumber}' value='${esc(edit.stok_lokasi_awal)}'></td><td><input type='number' data-mvh-edit='stok_aktual' data-row='${r.rowNumber}' value='${esc(edit.stok_aktual)}'></td><td><input data-mvh-edit='keterangan' data-row='${r.rowNumber}' value='${esc(edit.keterangan||"")}'></td><td><button class='btn-ghost' data-mvh-action='save' data-row='${r.rowNumber}'>Simpan</button> <button class='btn-ghost' data-mvh-action='cancel' data-row='${r.rowNumber}'>Batal</button></td>`;}else{tr.innerHTML=`<td>${esc(r.tanggal||"-")}</td><td>${esc(r.from||"-")}</td><td>${esc(r.to||"-")}</td><td>${esc(r.sku||"-")}</td><td>${esc(r.nama||"-")}</td><td>${esc(r.stok_lokasi_awal)}</td><td>${esc(r.stok_aktual)}</td><td>${esc(r.keterangan||"-")}</td><td><button class='btn-ghost' data-mvh-action='edit' data-row='${r.rowNumber}'>Edit</button> <button class='btn-ghost' data-mvh-action='delete' data-row='${r.rowNumber}'>Hapus</button></td>`;}frag.appendChild(tr);});tbody.replaceChildren(frag);}
function renderMovementEmptyState(){return `<div class='cc-empty-state'><i data-lucide='arrow-right-left'></i><h4>Belum ada movement berjalan</h4><p>Klik Mulai Movement untuk memilih SKU dan input stok aktual.</p></div>`;}
function renderMovementSession(){return `<div class='cc-section'><div class='mv-toolbar'><input id='mvSearch' class='search-lg' placeholder='Cari SKU / nama barang / lokasi' value='${esc(MOVEMENT_STATE.searchInput)}'></div></div><div class='cc-section'><div class='table-wrap cc-table-wrap cc-search-wrap'><table><thead><tr><th>Lokasi</th><th>SKU</th><th>Nama Barang</th><th>Qty</th><th>Aksi</th></tr></thead><tbody id='mvSearchResultsBody'></tbody></table></div></div><div class='cc-section'><h4>Movement Berjalan</h4><div class='table-wrap cc-table-wrap cc-session-wrap'><table><thead><tr><th>From</th><th>To</th><th>SKU</th><th>Nama Barang</th><th>Stok Lokasi Awal</th><th>Stok Aktual</th><th>Aksi</th></tr></thead><tbody id='mvSessionBody'></tbody></table></div></div>`;}
function renderMovementPage(){if(!movementApp)return;movementApp.innerHTML=`<div class='card cc-card cc-section'><div class='section-header cc-main-header'><div class='cc-action-stack'>${MOVEMENT_STATE.sessionActive?"<button class='btn-ghost' onclick='mvCancelSession()'>Batal Movement</button>":""}<button class='btn-primary' onclick='mvStartSession()' ${MOVEMENT_STATE.sessionActive?"disabled":""}>Mulai Movement</button>${MOVEMENT_STATE.sessionActive?"<button id='mvSubmitBtn' class='btn-primary' onclick='mvSubmitSession()'>Selesai Movement</button>":""}</div></div>${MOVEMENT_HISTORY_REMOTE.error?`<div class='state cc-state state-error'>${esc(MOVEMENT_HISTORY_REMOTE.error)}</div>`:""}${MOVEMENT_STATE.sessionActive?renderMovementSession():renderMovementEmptyState()}</div><div class='card cc-card cc-section mv-history-section'><div class='section-header'><h4>History Movement</h4></div><div class='table-wrap cc-table-wrap'><table><thead><tr><th>Tanggal</th><th>From</th><th>To</th><th>SKU</th><th>Nama Barang</th><th>Stok Lokasi Awal</th><th>Stok Aktual</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody id='mvHistoryBody'></tbody></table></div><div class='mv-pagination'><span id='mvHistoryInfo'>Menampilkan 0-0 dari 0 data</span><div class='row'><select id='mvHistoryPageSize'><option value='10'>10</option><option value='25'>25</option><option value='50'>50</option></select><button id='mvHistoryPrev' class='btn-ghost'>Prev</button><button id='mvHistoryNext' class='btn-ghost'>Next</button></div></div></div>`;if(window.lucide)window.lucide.createIcons();if(MOVEMENT_STATE.sessionActive){renderMovementSearchResults();renderMovementSessionTable();}renderMovementHistory();}
window.mvStartSession=()=>{MOVEMENT_STATE.sessionActive=true;MOVEMENT_STATE.search="";MOVEMENT_STATE.searchInput="";MOVEMENT_STATE.sessionItems=[];renderMovementPage();};
window.mvCancelSession=()=>{showConfirmModal({title:'Batal Movement',message:'Batalkan movement yang sedang berjalan?',confirmText:'Ya, Batalkan',cancelText:'Kembali',type:'danger',onConfirm:()=>{MOVEMENT_STATE.sessionActive=false;MOVEMENT_STATE.search="";MOVEMENT_STATE.searchInput="";MOVEMENT_STATE.sessionItems=[];MOVEMENT_STATE.submitting=false;renderMovementPage();}});};
function addMovementItem(source){const item={lokasi:source.lokasi,sku:source.sku,nama:source.nama,stokAwal:source.stok_akhir,to:"",stokAktual:null};if(MOVEMENT_STATE.sessionItems.some(it=>clean(it.sku)===clean(item.sku)&&clean(it.lokasi)===clean(item.lokasi))){toast('SKU/lokasi sudah ada di session.','error');return;}MOVEMENT_STATE.sessionItems.push(item);renderMovementSessionTable();toast('Item ditambahkan','success');}
window.mvSubmitSession=async()=>{if(!canSubmitMovement()){toast('Lengkapi tujuan dan stok aktual semua item.','error');return;}const dup=new Set();for(const it of MOVEMENT_STATE.sessionItems){const key=`${clean(it.sku)}|${clean(it.lokasi)}|${clean(it.to)}`;if(dup.has(key)){toast('Duplikasi SKU + From + To terdeteksi.','error');return;}dup.add(key);}MOVEMENT_STATE.submitting=true;renderMovementSessionTable();try{const payload={tanggal:formatTanggal(new Date()),items:MOVEMENT_STATE.sessionItems.map(it=>({from:it.lokasi,to:String(it.to||"").trim(),sku:it.sku,nama_barang:it.nama,stok_lokasi_awal:Number(it.stokAwal)||0,stok_aktual:Number(it.stokAktual)}))};const res=await fetch('/api/movement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok||!data?.success)throw new Error(data?.message||'Gagal menyimpan movement');toast('Movement berhasil disimpan','success');MOVEMENT_STATE.sessionActive=false;MOVEMENT_STATE.searchInput="";MOVEMENT_STATE.search="";MOVEMENT_STATE.sessionItems=[];MOVEMENT_HISTORY_REMOTE.loaded=false;await ensureMovementHistoryLoaded();if(typeof syncData==='function')syncData();}catch(err){toast(err?.message||'Gagal menyimpan movement','error');}finally{MOVEMENT_STATE.submitting=false;renderMovementPage();}};
document.addEventListener('input',e=>{if(e.target?.id==='mvSearch'){MOVEMENT_STATE.searchInput=e.target.value;movementHistoryPage=1;clearTimeout(MOVEMENT_STATE.searchTimer);MOVEMENT_STATE.searchTimer=setTimeout(()=>{MOVEMENT_STATE.search=MOVEMENT_STATE.searchInput;renderMovementSearchResults();},280);return;}if(e.target?.id==='mvHistoryPageSize'){movementHistoryPageSize=Number(e.target.value)||10;movementHistoryPage=1;renderMovementHistory();return;}if(e.target?.dataset?.mvm){const idx=Number(e.target.dataset.idx);const row=MOVEMENT_STATE.sessionItems[idx];if(!row)return;if(e.target.dataset.mvm==='to')row.to=e.target.value||"";if(e.target.dataset.mvm==='akt'){const n=Number(e.target.value);row.stokAktual=Number.isFinite(n)?n:null;}const submitBtn=document.getElementById('mvSubmitBtn');if(submitBtn)submitBtn.disabled=!canSubmitMovement()||MOVEMENT_STATE.submitting;}});
document.addEventListener('click',e=>{if(e.target?.id==='ccHistoryPrev'){cycleHistoryPage=Math.max(1,cycleHistoryPage-1);renderCycleHistory();return;}if(e.target?.id==='ccHistoryNext'){cycleHistoryPage+=1;renderCycleHistory();return;}if(e.target?.id==='mvHistoryPrev'){movementHistoryPage=Math.max(1,movementHistoryPage-1);renderMovementHistory();return;}if(e.target?.id==='mvHistoryNext'){movementHistoryPage+=1;renderMovementHistory();return;}const btn=e.target.closest('[data-mvm-action]');if(!btn)return;const action=btn.dataset.mvmAction;if(action==='remove'){const idx=Number(btn.dataset.idx);MOVEMENT_STATE.sessionItems.splice(idx,1);renderMovementSessionTable();return;}if(action==='add'){const sku=decodeURIComponent(btn.dataset.sku||"");const lokasi=decodeURIComponent(btn.dataset.lok||"");const source=getMovementSourceRows().find(r=>clean(r.sku)===clean(sku)&&clean(r.lokasi)===clean(lokasi));if(source)addMovementItem(source);}});
document.addEventListener("DOMContentLoaded",()=>{ensureMovementHistoryLoaded().finally(()=>renderMovementPage());});

async function updateHistoryRow(sheetKey,sheetName,rowNumber,values){const res=await fetch('/api/update-row',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({sheetKey,sheetName,rowNumber,values})});const data=await res.json();if(!res.ok||!data?.success)throw new Error(data?.message||'Gagal update row');}
async function deleteHistoryRow(sheetKey,sheetName,rowNumber){const res=await fetch('/api/delete-row',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({sheetKey,sheetName,rowNumber})});const data=await res.json();if(!res.ok||!data?.success)throw new Error(data?.message||'Gagal hapus row');}
function bindSheetInputForm(){const form=document.getElementById("sheetInputForm");if(!form||form.dataset.bound==="1")return;const submitBtn=document.getElementById("sheetSubmitBtn");const labelEl=submitBtn?.querySelector(".sheet-submit-label");const spinnerEl=submitBtn?.querySelector(".btn-spinner");const setLoading=(loading)=>{if(!submitBtn)return;submitBtn.disabled=loading;submitBtn.classList.toggle("is-loading",loading);if(labelEl)labelEl.textContent=loading?"Menyimpan":"Simpan";if(spinnerEl)spinnerEl.hidden=!loading;};form.addEventListener("submit",async(e)=>{e.preventDefault();const tanggal=document.getElementById("sheetTanggal")?.value||"";const sku=(document.getElementById("sheetSku")?.value||"").trim();const nama_barang=(document.getElementById("sheetNamaBarang")?.value||"").trim();const qtyRaw=(document.getElementById("sheetQty")?.value||"").trim();const lokasi=(document.getElementById("sheetLokasi")?.value||"").trim();const keterangan=(document.getElementById("sheetKeterangan")?.value||"").trim();const qty=Number(qtyRaw);if(!sku||!nama_barang||!lokasi||Number.isNaN(qty)){toast("SKU, Nama Barang, Qty, dan Lokasi wajib diisi.","error");return;}setLoading(true);try{const res=await fetch('/api/sheet-input',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tanggal,sku,nama_barang,qty,lokasi,keterangan})});const json=await res.json();if(!res.ok||!json?.success)throw new Error(json?.error||'Gagal menyimpan data');toast(json?.message||"Data berhasil disimpan.","success");form.reset();}catch(err){toast(err?.message||"Terjadi kesalahan saat menyimpan.","error");}finally{setLoading(false);}});form.dataset.bound="1";}

document.addEventListener('input',e=>{if(e.target?.dataset?.mvhEdit){const row=Number(e.target.dataset.row);if(HISTORY_EDIT_STATE.movement[row])HISTORY_EDIT_STATE.movement[row][e.target.dataset.mvhEdit]=e.target.value;}if(e.target?.dataset?.cchEdit){const row=Number(e.target.dataset.row);if(HISTORY_EDIT_STATE.cycle[row])HISTORY_EDIT_STATE.cycle[row][e.target.dataset.cchEdit]=e.target.value;}});

document.addEventListener('click',async e=>{const b=e.target.closest('[data-mvh-action],[data-cch-action]');if(!b)return;try{if(b.dataset.mvhAction){const row=Number(b.dataset.row);const src=buildMovementHistoryRows().find(x=>x.rowNumber===row);if(b.dataset.mvhAction==='edit')HISTORY_EDIT_STATE.movement[row]={...src};if(b.dataset.mvhAction==='cancel')delete HISTORY_EDIT_STATE.movement[row];if(b.dataset.mvhAction==='save'){await updateHistoryRow('movement','Movement',row,HISTORY_EDIT_STATE.movement[row]);delete HISTORY_EDIT_STATE.movement[row];MOVEMENT_HISTORY_REMOTE.loaded=false;await ensureMovementHistoryLoaded();toast('Movement berhasil diupdate','success');}if(b.dataset.mvhAction==='delete'){showConfirmModal({title:'Hapus Row Movement',message:'Yakin ingin menghapus row movement ini?',confirmText:'Hapus',cancelText:'Batal',type:'danger',onConfirm:async()=>{try{await deleteHistoryRow('movement','Movement',row);MOVEMENT_HISTORY_REMOTE.loaded=false;await ensureMovementHistoryLoaded();toast('Movement berhasil dihapus','success');renderMovementHistory();}catch(err){toast(err?.message||'Aksi gagal','error');}}});return;}renderMovementHistory();}if(b.dataset.cchAction){const row=Number(b.dataset.row);const src=buildCycleHistoryRows().find(x=>x.rowNumber===row);if(b.dataset.cchAction==='edit')HISTORY_EDIT_STATE.cycle[row]={...src};if(b.dataset.cchAction==='cancel')delete HISTORY_EDIT_STATE.cycle[row];if(b.dataset.cchAction==='save'){await updateHistoryRow('cycle_count','Cycle Count',row,HISTORY_EDIT_STATE.cycle[row]);delete HISTORY_EDIT_STATE.cycle[row];CYCLE_HISTORY_REMOTE.loaded=false;await ensureCycleHistoryLoaded();toast('Cycle count berhasil diupdate','success');}if(b.dataset.cchAction==='delete'){showConfirmModal({title:'Hapus Row Cycle Count',message:'Yakin ingin menghapus row cycle count ini?',confirmText:'Hapus',cancelText:'Batal',type:'danger',onConfirm:async()=>{try{await deleteHistoryRow('cycle_count','Cycle Count',row);CYCLE_HISTORY_REMOTE.loaded=false;await ensureCycleHistoryLoaded();toast('Cycle count berhasil dihapus','success');renderCycleHistory();}catch(err){toast(err?.message||'Aksi gagal','error');}}});return;}renderCycleHistory();}}catch(err){toast(err?.message||'Aksi gagal','error');}});
