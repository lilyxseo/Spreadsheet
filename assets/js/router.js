export function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.getElementById(`page-${page}`).classList.remove('hidden');
  document.querySelectorAll('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(window.innerWidth<900)document.body.classList.remove('sidebar-open');
}

export function routeFromPath(path,showDetail,setCurrentSku,state){
  if (!state?.DATA) {
    console.error('[router] state.DATA tidak tersedia');
  }
  if(path==='/')return showPage('dashboard');
  if(path==='/search')return showPage('search');
  if(path==='/statistics')return showPage('dashboard');
  if(path==='/movement')return showPage('movement');
  if(path==='/settings')return showPage('settings');
  if(path.startsWith('/sku/')){
    const sku=decodeURIComponent(path.split('/sku/')[1]||'');
    if(sku){setCurrentSku(sku);showDetail(sku);} 
    return showPage('detail');
  }
  showPage('dashboard');
}

export const navigateTo = path => { history.pushState({},'',path); window.__route(path); };
