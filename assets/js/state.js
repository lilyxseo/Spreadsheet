export const state = {
  DATA: {},
  isDataReady: false,
  isLoading: false,
};

export let CACHE_SKU = new Map();
export let currentFilter = "Semua";
export let lastResults = [];
export let lastQuery = "";
export let apiConnected = false;
export let currentSku = "";

export const setCacheSku = (v)=>CACHE_SKU=v;
export const setCurrentFilter = (v)=>currentFilter=v;
export const setLastResults = (v)=>lastResults=v;
export const setLastQuery = (v)=>lastQuery=v;
export const setApiConnected = (v)=>apiConnected=v;
export const setCurrentSku = (v)=>currentSku=v;
export const setDataReady = (data={})=>{ state.DATA=data; state.isDataReady=true; state.isLoading=false; };
