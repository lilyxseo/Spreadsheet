export function showPage(page){ document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden')); document.getElementById(`page-${page}`).classList.remove('hidden'); document.querySelectorAll('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.page===page)); if(window.innerWidth<900)document.body.classList.remove('sidebar-open'); }

export function routeFromPath(path,ctx={}){ const page=ctx.getRoutePage?ctx.getRoutePage(path):'dashboard'; if(!ctx.state?.isDataReady){ if(ctx.showRouteLoading)ctx.showRouteLoading(page); return; } showPage(page); if(page==='detail' && ctx.currentSku && ctx.showDetail)ctx.showDetail(ctx.currentSku); if(ctx.rerenderCurrentPage)ctx.rerenderCurrentPage(); }

export const navigateTo = (path,routeHandler) => { history.pushState({},'',path); routeHandler(path); };
