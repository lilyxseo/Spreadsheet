export function exposeDomIds(ids){
  ids.forEach((id)=>{ window[id]=document.getElementById(id); });
}
