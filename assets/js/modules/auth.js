const CURRENT_USER_KEY = 'user';

export function getCurrentUser(){
  try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || '{}'); }
  catch { return {}; }
}

export function setCurrentUser(payload, onChange){
  const normalized = payload && typeof payload === 'object' ? payload : {};
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(normalized));
  window.currentUser = normalized;
  onChange?.();
}

export function clearCurrentUser(onChange){
  localStorage.removeItem(CURRENT_USER_KEY);
  window.currentUser = null;
  onChange?.();
}

export function isDeveloperUser(){
  return getCurrentUser()?.isDeveloper === true;
}

export function setAppAuthState(state){
  const appRoot = document.getElementById('appRoot');
  if(!appRoot) return;
  appRoot.classList.remove('is-auth-checking', 'is-logged-out', 'is-logged-in');
  appRoot.classList.add(state);
}

export function renderAuthState({ authChecking, user, clearCurrentUserFn }){
  const loadingScreen=document.getElementById('authLoadingScreen');
  const appRoot=document.getElementById('appRoot');
  const loginView=document.getElementById('loginView');

  if(authChecking){
    setAppAuthState('is-auth-checking');
    if(loadingScreen){loadingScreen.hidden=false;loadingScreen.style.display='flex';loadingScreen.style.pointerEvents='auto';}
    if(appRoot){appRoot.hidden=true;appRoot.style.display='none';}
    if(loginView){loginView.hidden=true;loginView.style.display='none';}
    return;
  }

  if(!user){
    clearCurrentUserFn?.();
    setAppAuthState('is-logged-out');
    if(loadingScreen){loadingScreen.hidden=true;loadingScreen.style.display='none';loadingScreen.style.pointerEvents='none';}
    if(appRoot){appRoot.hidden=true;appRoot.style.display='none';}
    if(loginView){loginView.hidden=false;loginView.style.display='grid';}
    return;
  }

  if(loadingScreen){loadingScreen.hidden=true;loadingScreen.style.display='none';loadingScreen.style.pointerEvents='none';}
  setAppAuthState('is-logged-in');
  if(loginView){loginView.hidden=true;loginView.style.display='none';}
  if(appRoot){appRoot.hidden=false;appRoot.style.display='block';}
}
