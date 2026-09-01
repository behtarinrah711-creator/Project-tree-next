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

function installUnifiedHeader({windowRef, documentRef, drawer, globalMenu, avatar, signin}){
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

  const accountDrawer = globalMenu?.querySelector?.('.drawer');
  let accountHead = byId(documentRef, 'globalAccountHead');
  if(accountDrawer && !accountHead){
    accountHead = documentRef.createElement('div');
    accountHead.id = 'globalAccountHead';
    accountHead.className = 'drawer-account global-account-head';
    accountHead.innerHTML = `
      <div class="avatar-circle big">
        <img id="globalAccountImg" class="avatar-image hidden" alt="">
        <svg id="globalAccountDefaultIcon" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.5 0 4.5-2 4.5-4.5S14.5 3 12 3 7.5 5 7.5 7.5 9.5 12 12 12zM4 20.5c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="drawer-account-info">
        <div class="drawer-account-name" id="globalAccountName">مهمان</div>
        <div class="drawer-account-sub" id="globalAccountEmail">وارد نشده‌اید</div>
      </div>`;
    accountDrawer.prepend(accountHead);
  }

  const syncUser = user => {
    const avatarImg = byId(documentRef, 'avatarImg');
    const avatarDefault = byId(documentRef, 'avatarDefaultIcon');
    const globalImg = byId(documentRef, 'globalAccountImg');
    const globalDefault = byId(documentRef, 'globalAccountDefaultIcon');
    const name = byId(documentRef, 'globalAccountName');
    const email = byId(documentRef, 'globalAccountEmail');
    const photo = user?.photoURL || '';
    [avatarImg, globalImg].forEach(img => {
      if(!img) return;
      if(photo){ img.src = photo; img.classList.remove('hidden'); }
      else { img.removeAttribute('src'); img.classList.add('hidden'); }
    });
    [avatarDefault, globalDefault].forEach(icon => icon?.classList?.toggle?.('hidden', !!photo));
    if(name) name.textContent = user?.displayName || (user ? 'کاربر' : 'مهمان');
    if(email) email.textContent = user?.email || 'وارد نشده‌اید';
    if(signin) signin.textContent = user ? 'خروج از حساب' : 'ورود با گوگل';
    avatar?.classList.toggle('is-guest', !user);
    avatar?.setAttribute('aria-label', user ? 'حساب کاربری' : 'ورود');
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
  windowRef.addEventListener?.('popstate', () => windowRef.setTimeout(syncProjectHeader, 0));
  windowRef.addEventListener?.('karha:drawer-open', syncProjectHeader);
  windowRef.addEventListener?.('karha:projects-recovered', syncProjectHeader);
  windowRef.addEventListener?.('karha:workspace-route-synced', () => windowRef.setTimeout(syncProjectHeader, 0));
  syncProjectHeader();

  return { syncProjectHeader };
}

/** Bind project/account drawers and authentication controls. */
export function bindShellControls({ windowRef = window, documentRef = document } = {}){
  const drawer = byId(documentRef, 'drawerOverlay');
  const globalMenu = byId(documentRef, 'globalMenuOverlay');
  const avatar = byId(documentRef, 'avatarBtn');
  const signin = byId(documentRef, 'drawerSigninBtn');
  const title = byId(documentRef, 'topbarTitle');
  if(!drawer || !avatar || !signin) return false;
  if(drawer.dataset.shellControlsBound === 'true') return true;
  drawer.dataset.shellControlsBound = 'true';

  const openProjectMenu = () => {
    globalMenu?.classList?.add?.('hidden');
    drawer.classList.remove('hidden');
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:drawer-open'));
  };
  const closeProjectMenu = () => drawer.classList.add('hidden');
  const openGlobalMenu = () => {
    drawer.classList.add('hidden');
    globalMenu?.classList?.remove?.('hidden');
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:global-menu-open'));
  };
  const closeGlobalMenu = () => globalMenu?.classList?.add?.('hidden');
  const close = () => { closeProjectMenu(); closeGlobalMenu(); };

  installUnifiedHeader({windowRef, documentRef, drawer, globalMenu, avatar, signin});

  title?.addEventListener('click', openProjectMenu);
  title?.addEventListener('keydown', event => {
    if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); openProjectMenu(); }
  });
  avatar.addEventListener('click', openGlobalMenu);
  drawer.addEventListener('click', event => {
    if(event.target === drawer) closeProjectMenu();
  });
  globalMenu?.addEventListener?.('click', event => {
    if(event.target === globalMenu) closeGlobalMenu();
  });
  byId(documentRef, 'globalNotebookBtn')?.addEventListener?.('click', () => {
    close();
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:open-notebook'));
  });
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
        close();
        return;
      }

      await signInWithGoogle({firebaseRef, auth, windowRef, documentRef});
    } finally {
      delete signin.dataset.authBusy;
    }
  });

  return true;
}
