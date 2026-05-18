export const state = {
  DATA: {},
  CACHE_SKU: new Map(),
  currentFilter: "Semua",
  lastResults: [],
  lastQuery: "",
  apiConnected: false,
  currentSku: "",
  isDataReady: false,
};

export const setData = (data) => {
  state.DATA = data && typeof data === "object" ? data : {};
  console.log("STATE SUMMARY", {
    barangMasuk: Array.isArray(state.DATA?.barangMasuk) ? state.DATA.barangMasuk.length : 0,
    barangKeluar: Array.isArray(state.DATA?.barangKeluar) ? state.DATA.barangKeluar.length : 0,
  });
};

export const setDataReady = (ready) => {
  state.isDataReady = !!ready;
  console.log("IS READY", state.isDataReady);
};

export const setCacheSku = (v) => (state.CACHE_SKU = v);
export const setCurrentFilter = (v) => (state.currentFilter = v);
export const setLastResults = (v) => (state.lastResults = v);
export const setLastQuery = (v) => (state.lastQuery = v);
export const setApiConnected = (v) => (state.apiConnected = v);
export const setCurrentSku = (v) => (state.currentSku = v);
