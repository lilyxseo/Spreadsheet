export const clean = v => String(v||"").toLowerCase().trim().replace(/[_-]+/g," ").replace(/\s+/g," ");
export const normalizeHeader = v => clean(v).replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim();
export const parseNumber = v => { const n=parseFloat(String(v||"").replace(/[^0-9.-]/g,"")); return Number.isFinite(n)?n:0; };
export const esc = v => String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
export const encAttr = v => encodeURIComponent(String(v??""));
export const debounce = (fn,wait)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),wait); }; };
export const getVal = (row,keys)=>{ const cols=Object.keys(row||{}); for(const key of keys){ const f=cols.find(c=>clean(c).includes(clean(key))); if(f&&row[f]!=null) return String(row[f]); } return ""; };
export const highlight = (text,query)=>{ const raw=String(text||""); const q=String(query||"").trim(); if(!q) return esc(raw); const words=clean(q).split(" ").filter(Boolean).slice(0,6); let out=esc(raw); words.forEach(w=>{ const e=w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); out=out.replace(new RegExp(`(${e})`,"ig"),"<mark>$1</mark>"); }); return out; };
export const formatTime = ()=>new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
