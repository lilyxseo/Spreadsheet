import { esc } from './utils.js';
export const badgeClass = s => s==="Kartu Stock"?"b-kartu":s==="RPL"?"b-rpl":s==="BULKY"?"b-bulky":s==="Barang Masuk"?"b-in":"b-out";
export const renderState = (id,text)=>document.getElementById(id).innerHTML=`<div class='state'>${esc(text)}</div>`;
export const renderError = (id,text)=>document.getElementById(id).innerHTML=`<div class='state error'>${esc(text)}</div>`;
export function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1500); }
export const hideInitialLoader = ()=>document.getElementById('initialLoader')?.remove();
