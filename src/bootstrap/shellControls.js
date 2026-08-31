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

/**
 * Bind the global shell independently of project/task startup.
 * Authentication itself deliberately uses one Firebase app and one Auth instance.
 */
export function bindShellControls({ windowRef = window, documentRef = document } = {}){
  const drawer = byId(documentRef, 'drawerOverlay');
  const globalMenu = byId(documentRef, 'globalMenuOverlay');
  const hamburger = byId(documentRef, 'hamburgerBtn');
  const avatar = byId(documentRef, 'avatarBtn');
  const signin = byId(documentRef, 'drawerSigninBtn');
  if(!drawer || !hamburger || !avatar || !signin) return false;
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
  const open = openProjectMenu;
  const close = () => { closeProjectMenu(); closeGlobalMenu(); };

  hamburger.addEventListener('click', openProjectMenu);
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
