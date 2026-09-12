const byId = (documentRef, id) => documentRef.getElementById(id);

const AUTH_READY_TIMEOUT_MS = 5000;
const AUTH_READY_POLL_MS = 50;

function sleep(windowRef, ms){
  return new Promise(resolve => (windowRef.setTimeout || setTimeout)(resolve, ms));
}

async function waitForFirebaseAuth(windowRef, timeoutMs = AUTH_READY_TIMEOUT_MS){
  const started = Date.now();
  while(Date.now() - started < timeoutMs){
    const firebaseRef = windowRef.firebase;
    if(firebaseRef?.auth){
      try{
        const auth = firebaseRef.auth();
        if(auth) return { firebaseRef, auth };
      }catch{}
    }
    await sleep(windowRef, AUTH_READY_POLL_MS);
  }
  return null;
}

function authErrorMessage(error, windowRef){
  const code = String(error?.code || '');
  if(code.includes('unauthorized-domain')){
    const domain = windowRef.location?.hostname || 'این دامنه';
    return `ورود گوگل برای ${domain} در Firebase مجاز نشده است`;
  }
  if(code.includes('popup-blocked')) return 'مرورگر پنجره ورود گوگل را مسدود کرده است';
  if(code.includes('popup-closed-by-user')) return '';
  if(code.includes('network-request-failed')) return 'ارتباط با سرویس ورود گوگل/Firebase برقرار نشد';
  if(code.includes('operation-not-supported-in-this-environment')) return 'این مرورگر از روش ورود فعلی پشتیبانی نمی‌کند';
  return error?.message ? `ورود انجام نشد: ${error.message}` : 'ورود با گوگل انجام نشد';
}

function reportAuthError(error, {windowRef, documentRef}){
  const message = authErrorMessage(error, windowRef);
  if(!message) return;
  const toast = byId(documentRef, 'toast');
  if(toast){
    toast.textContent = message;
    toast.classList.add('show');
    (windowRef.setTimeout || setTimeout)(()=>toast.classList.remove('show'), 7000);
  } else if(typeof windowRef.alert === 'function'){
    windowRef.alert(message);
  }
  try{
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:auth-error', {
      detail: { code: error?.code || '', message }
    }));
  }catch{}
}

async function signInWithGoogle({firebaseRef, auth, windowRef, documentRef}){
  const provider = new firebaseRef.auth.GoogleAuthProvider();
  provider.setCustomParameters?.({ prompt: 'select_account' });

  try{
    await auth.signInWithPopup(provider);
    return true;
  }catch(error){
    const code = String(error?.code || '');
    if(code.includes('popup-closed-by-user')) return false;

    if(
      code.includes('popup-blocked') ||
      code.includes('operation-not-supported-in-this-environment') ||
      code.includes('network-request-failed')
    ){
      try{
        await auth.signInWithRedirect(provider);
        return true;
      }catch(redirectError){
        reportAuthError(redirectError, {windowRef, documentRef});
        return false;
      }
    }

    reportAuthError(error, {windowRef, documentRef});
    return false;
  }
}

function installUnifiedHeader({windowRef, documentRef, drawer, avatar, signin}){
  const title = byId(documentRef, 'topbarTitle');
  const main = title?.querySelector?.('.app-title-main');
  const projectLabel = byId(documentRef, 'topbarProjectName');

  if(title){
    title.classList.add('project-menu-trigger');
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.setAttribute('aria-haspopup', 'true');
    title.setAttribute('aria-label', 'فهرست پروژه‌ها');
  }

  const syncProjectHeader = () => {
    const moduleId = windowRef.KarhaRoute?.moduleId || 'dashboard';
    const notebook = moduleId === 'notebook' || moduleId === 'notebook-export' || /^#\/notebook/i.test(windowRef.location?.hash || '');
    title?.classList.toggle('notebook-context', notebook);
    if(notebook){
      if(main) main.textContent = 'دفترچه';
      if(projectLabel) projectLabel.textContent = '';
      title?.classList.remove('has-active-project');
      title?.setAttribute('aria-haspopup', 'false');
      title?.setAttribute('aria-label', 'دفترچه');
      return;
    }
    title?.setAttribute('aria-haspopup', 'true');
    title?.setAttribute('aria-label', 'فهرست پروژه‌ها');
    if(moduleId !== 'dashboard' && moduleId !== 'tasks') return;

    const project = windowRef.KarhaApp?.projectWorkspace?.getActiveProject?.();
    if(project?.name){
      if(main) main.textContent = project.name;
      if(projectLabel) projectLabel.textContent = '';
      title?.classList.add('has-active-project');
    }else{
      if(main) main.textContent = 'پروژه‌ها';
      if(projectLabel) projectLabel.textContent = '';
      title?.classList.remove('has-active-project');
    }
  };

  const syncUser = user => {
    const avatarImg = byId(documentRef, 'avatarImg');
    const avatarDefault = byId(documentRef, 'avatarDefaultIcon');
    const drawerAvatarImg = byId(documentRef, 'drawerAvatarImg');
    const drawerAvatarDefault = byId(documentRef, 'drawerAvatarDefaultIcon');
    const drawerAccountName = byId(documentRef, 'drawerAccountName');
    const drawerAccountSub = byId(documentRef, 'drawerAccountSub');
    const photo = user?.photoURL || '';
    [avatarImg, drawerAvatarImg].forEach(img => {
      if(!img) return;
      if(photo){ img.src = photo; img.classList.remove('hidden'); }
      else { img.removeAttribute('src'); img.classList.add('hidden'); }
    });
    [avatarDefault, drawerAvatarDefault].forEach(icon => icon?.classList?.toggle?.('hidden', !!photo));
    if(drawerAccountName) drawerAccountName.textContent = user?.displayName || (user ? 'کاربر' : 'مهمان');
    if(drawerAccountSub) drawerAccountSub.textContent = user?.email || 'وارد نشده‌اید';
    if(signin){
      signin.textContent = user ? 'خروج از حساب' : 'ورود با گوگل';
      signin.dataset.authAction = user ? 'signout' : 'signin';
    }
    avatar?.classList.toggle('is-guest', !user);
    avatar?.setAttribute('aria-label', user ? 'حساب کاربری' : 'ورود');
  };

  const syncAccountDrawerImmediately = () => {
    const auth = windowRef.firebase?.auth?.();
    if(auth?.currentUser) syncUser(auth.currentUser);
  };

  const attachAuthState = auth => {
    syncUser(auth?.currentUser || null);
    auth?.onAuthStateChanged?.(syncUser);
  };

  try{
    const auth = windowRef.firebase?.auth?.();
    if(auth) attachAuthState(auth);
    else {
      syncUser(null);
      void waitForFirebaseAuth(windowRef).then(ready => {
        if(ready?.auth) attachAuthState(ready.auth);
      });
    }
  }catch{
    syncUser(null);
    void waitForFirebaseAuth(windowRef).then(ready => {
      if(ready?.auth) attachAuthState(ready.auth);
    });
  }

  windowRef.addEventListener?.('karha:ready', syncProjectHeader);
  windowRef.addEventListener?.('karha:project-context-changed', syncProjectHeader);
  windowRef.addEventListener?.('popstate', () => windowRef.setTimeout(syncProjectHeader, 0));
  windowRef.addEventListener?.('karha:drawer-open', syncProjectHeader);
  windowRef.addEventListener?.('karha:drawer-open', syncAccountDrawerImmediately);
  windowRef.addEventListener?.('karha:projects-recovered', syncProjectHeader);
  windowRef.addEventListener?.('karha:workspace-route-synced', () => windowRef.setTimeout(syncProjectHeader, 0));
  syncProjectHeader();

  return { syncProjectHeader, syncAccountDrawerImmediately };
}

/** Bind project/account drawers and authentication controls. */
export function bindShellControls({ windowRef = window, documentRef = document } = {}){
  const drawer = byId(documentRef, 'drawerOverlay');
  const avatar = byId(documentRef, 'avatarBtn');
  const signin = byId(documentRef, 'drawerSigninBtn');
  const title = byId(documentRef, 'topbarTitle');
  if(!drawer || !avatar || !signin) return false;
  if(drawer.dataset.shellControlsBound === 'true') return true;
  drawer.dataset.shellControlsBound = 'true';

  const openProjectMenu = ({allowNotebook = false} = {}) => {
    if(!allowNotebook && /^#\/notebook/i.test(windowRef.location?.hash || '')) return;
    drawer.classList.remove('hidden');
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:drawer-open'));
  };
  const closeProjectMenu = () => drawer.classList.add('hidden');

  installUnifiedHeader({windowRef, documentRef, drawer, avatar, signin});

  title?.addEventListener('click', openProjectMenu);
  title?.addEventListener('keydown', event => {
    if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); openProjectMenu(); }
  });
  avatar.addEventListener('click', () => openProjectMenu({allowNotebook:true}));
  drawer.addEventListener('click', event => {
    if(event.target === drawer) closeProjectMenu();
  });
  byId(documentRef, 'globalNotebookBtn')?.addEventListener?.('click', () => {
    closeProjectMenu();
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:open-notebook'));
  });
  byId(documentRef, 'drawerProfileBtn')?.addEventListener?.('click', closeProjectMenu);
  byId(documentRef, 'closeNotebookPage')?.addEventListener?.('click', () => {
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:close-notebook'));
  });
  byId(documentRef, 'closeNotebookExportPage')?.addEventListener?.('click', () => {
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:open-notebook'));
  });

  signin.addEventListener('click', async () => {
    if(signin.dataset.authBusy === 'true') return;
    signin.dataset.authBusy = 'true';
    try{
      const ready = await waitForFirebaseAuth(windowRef);
      if(!ready){
        reportAuthError(
          {code:'auth/sdk-not-ready', message:'Firebase Auth آماده نشد'},
          {windowRef, documentRef}
        );
        return;
      }

      const { firebaseRef, auth } = ready;
      if(auth.currentUser){
        await auth.signOut();
        closeProjectMenu();
        return;
      }

      await signInWithGoogle({firebaseRef, auth, windowRef, documentRef});
    } finally {
      delete signin.dataset.authBusy;
    }
  });

  return true;
}
