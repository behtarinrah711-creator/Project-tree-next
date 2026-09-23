const byId = (documentRef, id) => documentRef.getElementById(id);
const SAOSA_SESSION_KEY = 'saosa:v1:sms-session';
const isSaosaHost = windowRef => ['saosa.ir','www.saosa.ir'].includes(String(windowRef.location?.hostname || '').toLowerCase());
function readSaosaSession(windowRef){
  try{
    const value=JSON.parse(windowRef.localStorage?.getItem(SAOSA_SESSION_KEY)||'null');
    return value?.token && value?.phone && Number(value.expiresAt)>Date.now() ? value : null;
  }catch{return null;}
}
function clearSaosaSession(windowRef){ windowRef.localStorage?.removeItem(SAOSA_SESSION_KEY); }
function saosaSessionUser(session){ return session?{uid:`phone:${session.phone}`,phoneNumber:session.phone,displayName:'Ú©Ø§Ø±Ø¨Ø± Ø³Ø§Ø¦ÙØ³Ø§'}:null; }
async function smsApi(windowRef,path,body){
  const response=await windowRef.fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(payload.error||'request_failed');error.code=payload.error||'request_failed';throw error;}
  return payload;
}
const requestSaosaOtp=(phone,windowRef)=>smsApi(windowRef,'/api/v1/auth/otp/request',{phone});
async function verifySaosaOtp(phone,code,windowRef){
  const result=await smsApi(windowRef,'/api/v1/auth/otp/verify',{phone,code});
  const session={phone,token:result.token,expiresAt:Date.now()+result.expiresIn*1000};
  windowRef.localStorage?.setItem(SAOSA_SESSION_KEY,JSON.stringify(session));
  return session;
}

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
    const domain = windowRef.location?.hostname || 'Ø§ÛÙ Ø¯Ø§ÙÙÙ';
    return `ÙØ±ÙØ¯ Ú¯ÙÚ¯Ù Ø¨Ø±Ø§Û ${domain} Ø¯Ø± Firebase ÙØ¬Ø§Ø² ÙØ´Ø¯Ù Ø§Ø³Øª`;
  }
  if(code.includes('popup-blocked')) return 'ÙØ±ÙØ±Ú¯Ø± Ù¾ÙØ¬Ø±Ù ÙØ±ÙØ¯ Ú¯ÙÚ¯Ù Ø±Ø§ ÙØ³Ø¯ÙØ¯ Ú©Ø±Ø¯Ù Ø§Ø³Øª';
  if(code.includes('popup-closed-by-user')) return '';
  if(code.includes('network-request-failed')) return 'Ø§Ø±ØªØ¨Ø§Ø· Ø¨Ø§ Ø³Ø±ÙÛØ³ ÙØ±ÙØ¯ Ú¯ÙÚ¯Ù/Firebase Ø¨Ø±ÙØ±Ø§Ø± ÙØ´Ø¯';
  if(code.includes('operation-not-supported-in-this-environment')) return 'Ø§ÛÙ ÙØ±ÙØ±Ú¯Ø± Ø§Ø² Ø±ÙØ´ ÙØ±ÙØ¯ ÙØ¹ÙÛ Ù¾Ø´ØªÛØ¨Ø§ÙÛ ÙÙÛâÚ©ÙØ¯';
  return error?.message ? `ÙØ±ÙØ¯ Ø§ÙØ¬Ø§Ù ÙØ´Ø¯: ${error.message}` : 'ÙØ±ÙØ¯ Ø¨Ø§ Ú¯ÙÚ¯Ù Ø§ÙØ¬Ø§Ù ÙØ´Ø¯';
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

function smsErrorMessage(error){
  if(error?.code === 'invalid_phone') return 'Ø´ÙØ§Ø±Ù ÙÙØ¨Ø§ÛÙ ÙØ¹ØªØ¨Ø± ÙÛØ³Øª';
  if(error?.code === 'too_many_requests') return 'ØªØ¹Ø¯Ø§Ø¯ Ø¯Ø±Ø®ÙØ§Ø³ØªâÙØ§ Ø²ÛØ§Ø¯ Ø§Ø³ØªØ Û±Ûµ Ø¯ÙÛÙÙ Ø¯ÛÚ¯Ø± ØªÙØ§Ø´ Ú©ÙÛØ¯';
  if(error?.code === 'invalid_or_expired_code') return 'Ú©Ø¯ ÙØ§Ø¯Ø±Ø³Øª ÛØ§ ÙÙÙØ¶Û Ø´Ø¯Ù Ø§Ø³Øª';
  if(error?.code === 'sms_provider_error') return 'Ø§Ø±Ø³Ø§Ù Ù¾ÛØ§ÙÚ© Ø§ÙØ¬Ø§Ù ÙØ´Ø¯Ø Ú©ÙÛ Ø¨Ø¹Ø¯ Ø¯ÙØ¨Ø§Ø±Ù ØªÙØ§Ø´ Ú©ÙÛØ¯';
  return 'Ø§Ø±ØªØ¨Ø§Ø· Ø¨Ø§ Ø³Ø±ÙÛØ³ ÙØ±ÙØ¯ Ø¨Ø±ÙØ±Ø§Ø± ÙØ´Ø¯';
}

async function signInWithSms({windowRef}){
  const phone = windowRef.prompt?.('Ø´ÙØ§Ø±Ù ÙÙØ¨Ø§ÛÙ Ø±Ø§ ÙØ§Ø±Ø¯ Ú©ÙÛØ¯ (ÙØ«Ø§Ù: 09123456789)');
  if(!phone) return null;
  await requestSaosaOtp(phone, windowRef);
  const code = windowRef.prompt?.('Ú©Ø¯ Û¶ Ø±ÙÙÛ Ø§Ø±Ø³Ø§ÙâØ´Ø¯Ù Ø±Ø§ ÙØ§Ø±Ø¯ Ú©ÙÛØ¯');
  if(!code) return null;
  return verifySaosaOtp(phone, code, windowRef);
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
  const settingsTrigger = byId(documentRef, 'projectSettingsTrigger');

  if(title){
    title.classList.add('project-menu-trigger');
    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.setAttribute('aria-haspopup', 'true');
    title.setAttribute('aria-label', 'ÙÙØ±Ø³Øª Ù¾Ø±ÙÚÙâÙØ§');
  }

  const syncProjectHeader = () => {
    const moduleId = windowRef.KarhaRoute?.moduleId || 'dashboard';
    const notebook = moduleId === 'notebook' || moduleId === 'notebook-export' || /^#\/notebook/i.test(windowRef.location?.hash || '');
    const project = windowRef.KarhaApp?.projectWorkspace?.getActiveProject?.();
    const projectScoped = /^#\/?projects?\//i.test(windowRef.location?.hash || '')
      && !!windowRef.KarhaRoute?.projectId;
    if(settingsTrigger) settingsTrigger.hidden = notebook || !projectScoped || !project;
    if(windowRef.KarhaWorkspaceChrome){
      windowRef.KarhaWorkspaceChrome.updateWorkspaceContextBar?.();
      return;
    }
    title?.classList.toggle('notebook-context', notebook);
    if(notebook){
      if(main) main.textContent = 'Ø¯ÙØªØ±ÚÙ ÛØ§Ø¯Ø¯Ø§Ø´Øª';
      if(projectLabel) projectLabel.textContent = '';
      title?.classList.remove('has-active-project');
      title?.setAttribute('aria-haspopup', 'true');
      title?.setAttribute('aria-label', 'Ø¨Ø§Ø² Ú©Ø±Ø¯Ù ÙÙÙ Ø§Ø² Ø¯ÙØªØ±ÚÙ ÛØ§Ø¯Ø¯Ø§Ø´Øª');
      return;
    }
    title?.setAttribute('aria-haspopup', 'true');
    title?.setAttribute('aria-label', 'ÙÙØ±Ø³Øª Ù¾Ø±ÙÚÙâÙØ§');
    if(moduleId !== 'dashboard' && moduleId !== 'tasks') return;

    if(project?.name){
      if(main) main.textContent = project.name;
      if(projectLabel) projectLabel.textContent = '';
      title?.classList.add('has-active-project');
    }else{
      if(main) main.textContent = 'Ù¾Ø±ÙÚÙâÙØ§';
      if(projectLabel) projectLabel.textContent = '';
      title?.classList.remove('has-active-project');
    }
  };

  settingsTrigger?.addEventListener?.('click', () => {
    const project = windowRef.KarhaApp?.projectWorkspace?.getActiveProject?.();
    if(project?.id) windowRef.KarhaApp?.projectWorkspace?.selectProject?.(project.id,{moduleId:'people'});
  });

  const syncUser = user => {
    const avatarImg = byId(documentRef, 'avatarImg');
    const avatarDefault = byId(documentRef, 'avatarDefaultIcon');
    const drawerAvatarImg = byId(documentRef, 'drawerAvatarImg');
    const drawerAvatarDefault = byId(documentRef, 'drawerAvatarDefaultIcon');
    const drawerAccountName = byId(documentRef, 'drawerAccountName');
    const drawerAccountSub = byId(documentRef, 'drawerAccountSub');
    const drawerAuthHint = byId(documentRef, 'drawerAuthHint');
    const drawer = documentRef?.querySelector?.('#drawerOverlay > .drawer');
    const accountAccess = documentRef?.querySelector?.('.drawer-account-access');
    const photo = user?.photoURL || '';
    [avatarImg, drawerAvatarImg].forEach(img => {
      if(!img) return;
      if(photo){ img.src = photo; img.classList.remove('hidden'); }
      else { img.removeAttribute('src'); img.classList.add('hidden'); }
    });
    [avatarDefault, drawerAvatarDefault].forEach(icon => icon?.classList?.toggle?.('hidden', !!photo));
    if(drawerAccountName) drawerAccountName.textContent = user?.displayName || (user ? 'Ú©Ø§Ø±Ø¨Ø±' : 'ÙÙÙØ§Ù');
    if(drawerAccountSub) drawerAccountSub.textContent = user?.phoneNumber || user?.email || 'ÙØ§Ø±Ø¯ ÙØ´Ø¯ÙâØ§ÛØ¯';
    if(signin){
      signin.textContent = user ? 'Ø®Ø±ÙØ¬ Ø§Ø² Ø­Ø³Ø§Ø¨' : (isSaosaHost(windowRef) ? 'ÙØ±ÙØ¯ Ø¨Ø§ Ø´ÙØ§Ø±Ù ÙÙØ¨Ø§ÛÙ' : 'ÙØ±ÙØ¯ Ø¨Ø§ Ú¯ÙÚ¯Ù');
      signin.dataset.authAction = user ? 'signout' : 'signin';
      if(user) drawer?.appendChild?.(signin);
      else accountAccess?.appendChild?.(signin);
    }
    if(drawerAuthHint && isSaosaHost(windowRef)) drawerAuthHint.textContent = 'Ú©Ø¯ ÙØ±ÙØ¯ Ø¨Ø§ Ù¾ÛØ§ÙÚ© Ø§Ø±Ø³Ø§Ù ÙÛâØ´ÙØ¯';
    drawerAuthHint?.classList?.toggle?.('hidden', !!user);
    avatar?.classList.toggle('is-guest', !user);
    avatar?.setAttribute('aria-label', user ? 'Ø­Ø³Ø§Ø¨ Ú©Ø§Ø±Ø¨Ø±Û' : 'ÙØ±ÙØ¯');
  };

  const syncAccountDrawerImmediately = () => {
    const auth = windowRef.firebase?.auth?.();
    if(auth?.currentUser) syncUser(auth.currentUser);
  };

  const attachAuthState = auth => {
    syncUser(auth?.currentUser || null);
    auth?.onAuthStateChanged?.(syncUser);
  };

  if(isSaosaHost(windowRef)){
    syncUser(saosaSessionUser(readSaosaSession(windowRef)));
  }else try{
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
  if(!drawer || !signin) return false;
  if(drawer.dataset.shellControlsBound === 'true') return true;
  drawer.dataset.shellControlsBound = 'true';

  const openProjectMenu = () => {
    drawer.classList.remove('hidden');
    windowRef.dispatchEvent(new windowRef.CustomEvent('karha:drawer-open'));
  };
  const closeProjectMenu = () => drawer.classList.add('hidden');

  installUnifiedHeader({windowRef, documentRef, drawer, avatar, signin});

  title?.addEventListener('click', openProjectMenu);
  title?.addEventListener('keydown', event => {
    if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); openProjectMenu(); }
  });
  drawer.addEventListener('click', event => {
    if(event.target === drawer) closeProjectMenu();
  });
  byId(documentRef, 'globalNotebookBtn')?.addEventListener?.('click', () => {
    closeProjectMenu();
    windowRef.KarhaWorkspaceChrome?.closeBottomPages?.();
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
      if(isSaosaHost(windowRef)){
        const current = readSaosaSession(windowRef);
        if(current){
          clearSaosaSession(windowRef);
          windowRef.location?.reload?.();
          return;
        }
        try{
          const session = await signInWithSms({windowRef});
          if(session){
            windowRef.location?.reload?.();
            closeProjectMenu();
          }
        }catch(error){
          reportAuthError({code:error.code, message:smsErrorMessage(error)}, {windowRef, documentRef});
        }
        return;
      }
      const ready = await waitForFirebaseAuth(windowRef);
      if(!ready){
        reportAuthError(
          {code:'auth/sdk-not-ready', message:'Firebase Auth Ø¢ÙØ§Ø¯Ù ÙØ´Ø¯'},
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
