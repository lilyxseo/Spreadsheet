const AUDIT_DB_NAME='inventory_audit_db';
const AUDIT_DB_VERSION=1;
const AUDIT_STORE='audit_logs';
const AUDIT_MAX_LOGS=10000;
let auditQueue=[];
let flushTimer=null;

function nowIso(){return new Date().toISOString();}
function readable(iso){try{return new Date(iso).toLocaleString('id-ID');}catch{return iso;}}
function sanitize(v){if(v===undefined)return null;return v;}
function buildKey(entry){return [entry.timestamp,entry.user,entry.page,entry.action,entry.entity,entry.field,JSON.stringify(entry.oldValue),JSON.stringify(entry.newValue),entry.referenceId].join('|');}

function normalize(payload={}){
 const timestamp=payload.timestamp||nowIso();
 const user=String(payload.user||payload.userName||window.currentUser?.name||window.currentUser?.email||'unknown');
 const page=String(payload.page||window.__activePage||'Unknown');
 const action=String(payload.action||'UPDATE').toUpperCase();
 const entity=String(payload.entity||payload.sku||payload.rowId||payload.transactionId||'');
 const field=String(payload.field||'');
 const oldValue=sanitize(payload.oldValue);
 const newValue=sanitize(payload.newValue);
 if(!page||!action||(!field&&oldValue===null&&newValue===null))return null;
 return {id:crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,timestamp,readableTime:readable(timestamp),user,page,action,entity,sku:payload.sku||'',field,oldValue,newValue,location:payload.location||'',qty:payload.qty??null,referenceId:payload.referenceId||'',metadata:payload.metadata||{},dedupeKey:buildKey({timestamp,user,page,action,entity,field,oldValue,newValue,referenceId:payload.referenceId||''})};
}

async function openDb(){return await new Promise((resolve,reject)=>{const req=indexedDB.open(AUDIT_DB_NAME,AUDIT_DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(AUDIT_STORE)){const st=db.createObjectStore(AUDIT_STORE,{keyPath:'id'});st.createIndex('timestamp','timestamp',{unique:false});st.createIndex('dedupeKey','dedupeKey',{unique:false});}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}

async function pruneIfNeeded(db){const all=await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIT_STORE,'readonly');const rq=tx.objectStore(AUDIT_STORE).getAll();rq.onsuccess=()=>resolve(rq.result||[]);rq.onerror=()=>reject(rq.error);});if(all.length<=AUDIT_MAX_LOGS)return;all.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp)));const remove=all.slice(0,all.length-AUDIT_MAX_LOGS);await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIT_STORE,'readwrite');const st=tx.objectStore(AUDIT_STORE);remove.forEach(r=>st.delete(r.id));tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});}

async function flush(){if(!auditQueue.length)return;const batch=auditQueue.splice(0,auditQueue.length);const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIT_STORE,'readwrite');const st=tx.objectStore(AUDIT_STORE);batch.forEach(item=>st.put(item));tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});await pruneIfNeeded(db);}

export function logAuditTrail(data={}){const entry=normalize(data);if(!entry)return;const existsInQueue=auditQueue.some(item=>item.dedupeKey===entry.dedupeKey);if(existsInQueue)return;auditQueue.push(entry);if(flushTimer)return;flushTimer=setTimeout(async()=>{flushTimer=null;try{await flush();}catch(err){console.warn('audit flush failed',err);}},150);
}

export async function getAuditTrailLogs(){const db=await openDb();const logs=await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIT_STORE,'readonly');const rq=tx.objectStore(AUDIT_STORE).getAll();rq.onsuccess=()=>resolve(rq.result||[]);rq.onerror=()=>reject(rq.error);});return logs.sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));}
