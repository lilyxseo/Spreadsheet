import { clean, normalizeHeader } from './utils.js';

export function detectHeaderIndex(values){
  const req = ["sku","nama","nama barang","item","description","qty","tanggal","from","to","lokasi"];
  let bi = -1, bs = 0;

  for(let i=0;i<Math.min(values.length,25);i++){
    const t = (values[i] || []).map(clean).join("|");
    let s = 0;
    req.forEach(k => t.includes(clean(k)) && s++);
    if(s > bs){
      bs = s;
      bi = i;
    }
  }

  return bs >= 1 ? bi : -1;
}

export function parseSheet(values, sheetName = "unknown"){
  if(!Array.isArray(values) || !values.length){
    console.warn(`[parseSheet] ${sheetName}: empty values`, values);
    return [];
  }

  if(values.every(row => row && typeof row === "object" && !Array.isArray(row))){
    return values;
  }

  let h = detectHeaderIndex(values);
  if(h < 0){
    // fallback: first non-empty row as header
    h = values.findIndex(row => Array.isArray(row) && row.some(c => String(c || "").trim()));
  }

  if(h < 0){
    console.error(`[parseSheet] ${sheetName}: header tidak ketemu`, values);
    return [];
  }

  const headers = (values[h] || []).map((v,i)=>normalizeHeader(v)||`col_${i+1}`);
  const rows = [];
  for(let r=h+1;r<values.length;r++){
    const row = values[r] || [];
    if(!row.length || row.every(c=>!String(c||"").trim())) continue;
    const obj = {};
    headers.forEach((k,i)=>obj[k]=row[i]||"");
    rows.push(obj);
  }

  if(rows.length === 0){
    console.warn(`[parseSheet] ${sheetName}: parsed 0 rows`, { headerIndex: h, headers, values });
  }
  return rows;
}
