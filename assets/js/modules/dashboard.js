export function setupSidebar({ onClose }){
  openSidebar.onclick=()=>document.body.classList.add('sidebar-open');
  closeSidebar.onclick=()=>closeSidebarFn();
  sidebarOverlay.onclick=()=>closeSidebarFn();
  initSidebarCollapse();
  window.addEventListener('resize',handleDesktopSidebarMode);

  function closeSidebarFn(){
    document.body.classList.remove('sidebar-open');
    onClose?.();
  }

  function initSidebarCollapse(){
    const saved=localStorage.getItem('sidebar_collapsed')==='true';
    const desktop=window.innerWidth>=900;
    document.body.classList.toggle('sidebar-collapsed',desktop&&saved);
    if(!sidebarToggle)return;
    sidebarToggle.onclick=()=>{
      if(window.innerWidth<900)return;
      const collapsed=document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('sidebar_collapsed',String(collapsed));
    };
  }

  function handleDesktopSidebarMode(){
    if(window.innerWidth<900){document.body.classList.remove('sidebar-collapsed');return;}
    const saved=localStorage.getItem('sidebar_collapsed')==='true';
    document.body.classList.toggle('sidebar-collapsed',saved);
  }
}

export function closeSidebarMobile(){
  if(window.innerWidth<900)document.body.classList.remove('sidebar-open');
}
