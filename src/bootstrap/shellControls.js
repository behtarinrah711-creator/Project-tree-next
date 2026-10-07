const byId = (documentRef, id) => documentRef.getElementById(id);
import { SAOSA_SESSION_KEY, clearSaosaWorkspaceSession, isSaosaHost, readSaosaSession } from '../cloud/saosaWorkspaceSync.js';
function saosaSessionUser(session){ return session?{uid:`phone:${session.phone}`,phoneNumber:session.phone,displayName:'کاربر ساُسا'}:null; }
async function smsApi(windowRef,path,body){
  const response=await windowRef.fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(payload.error||'request_failed');error.code=payload.error||'request_failed';throw error;}
  return payload;
}
const requestSaosaOtp=(phone,windowRef)=>smsApi(windowRef,'/api/v1/auth/otp/request',{phone});
async function verifySaosaOtp(phone,code,windowRef){
  const result=await smsApi(windowRef,'/api/v1/auth/otp/verify',{phone,code});
  const session={phone,token:result.token,accountId:result.accountId,expiresAt:Date.now()+result.expiresIn*1000,pendingInvitationCount:Number(result.pendingInvitationCount)||0};
  windowRef.localStorage?.setItem(SAOSA_SESSION_KEY,JSON.stringify(session));
  return session;
}

const AUTH_READY_TIMEOUT_MS = 5000;
const AUTH_READY_POLL_MS = 50;
const SMS_RESEND_COOLDOWN_SECONDS = 60;

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

function smsErrorMessage(error){
  if(error?.code === 'invalid_phone') return 'شماره موبایل معتبر نیست';
  if(error?.code === 'too_many_requests') return 'تعداد درخواست‌ها زیاد است؛ ۱۵ دقیقه دیگر تلاش کنید';
  if(error?.code === 'invalid_or_expired_code') return 'کد نادرست یا منقضی شده است';
  if(error?.code === 'sms_provider_error') return 'ارسال پیامک انجام نشد؛ کمی بعد دوباره تلاش کنید';
  return 'ارتباط با سرویس ورود برقرار نشد';
}

function signInWithSms({windowRef,documentRef}){
  const screen=byId(documentRef,'smsAuthScreen');
  const form=byId(documentRef,'smsAuthForm');
  const back=byId(documentRef,'smsAuthBack');
  const heading=byId(documentRef,'smsAuthHeading');
  const input=byId(documentRef,'smsAuthInput');
  const error=byId(documentRef,'smsAuthError');
  const submit=byId(documentRef,'smsAuthSubmit');
  const resend=byId(documentRef,'smsAuthResend');
  if(!screen||!form||!input||!submit) return Promise.reject(new Error('sms_auth_screen_missing'));

  return new Promise(resolve=>{
    let step='phone';
    let phone='';
    let sending=false;
    let verifying=false;
    let closed=false;
    let resendTimer=null;
    const syncBusyState=()=>{
      submit.disabled=verifying||(step==='phone'&&sending);
      if(resend)resend.disabled=sending||verifying||resendTimer!==null;
    };
    const stopResendTimer=()=>{
      if(resendTimer!==null)(windowRef.clearInterval||clearInterval)(resendTimer);
      resendTimer=null;
    };
    const startResendTimer=()=>{
      if(!resend)return;
      stopResendTimer();
      let seconds=SMS_RESEND_COOLDOWN_SECONDS;
      const render=()=>{resend.disabled=true;resend.textContent=`ارسال مجدد کد (${seconds})`;};
      render();
      resendTimer=(windowRef.setInterval||setInterval)(()=>{
        seconds-=1;
        if(seconds<=0){stopResendTimer();syncBusyState();resend.textContent='ارسال مجدد کد';return;}
        render();
      },1000);
    };
    const setError=value=>{if(error)error.textContent=value||'';input.classList.toggle('invalid',!!value);input.setAttribute('aria-invalid',value?'true':'false');};
    const showPhone=()=>{
      step='phone';
      form.querySelector('.sms-auth-description')?.remove();
      stopResendTimer();
      if(resend)resend.textContent='ارسال مجدد کد';
      screen.dataset.step='phone';
      heading.textContent='ورود با شماره موبایل';
      input.type='tel';input.inputMode='numeric';input.autocomplete='tel';input.maxLength=11;
      input.placeholder='مثال: 09123456789';input.value=phone;input.classList.remove('sms-code');
      submit.textContent='دریافت کد ورود';if(resend)resend.hidden=true;setError('');input.focus();
    };
    const showCode=()=>{
      step='code';
      screen.dataset.step='code';
      heading.textContent='تأیید شماره موبایل';
      form.querySelector('.sms-auth-description')?.remove();
      const description=documentRef.createElement('p');description.className='sms-auth-description';description.textContent=`کد ۶ رقمی ارسال‌شده به ${phone} را وارد کنید.`;heading.insertAdjacentElement('afterend',description);
      input.type='text';input.inputMode='numeric';input.autocomplete='one-time-code';input.maxLength=6;
      input.placeholder='------';input.value='';input.classList.add('sms-code');
      submit.textContent='ورود';if(resend)resend.hidden=false;setError('');input.focus();
    };
    const close=value=>{
      closed=true;
      stopResendTimer();
      screen.hidden=true;documentRef.body?.classList?.remove('sms-auth-open');
      form.removeEventListener('submit',onSubmit);back?.removeEventListener('click',onBack);resend?.removeEventListener('click',onResend);input.removeEventListener('input',onInput);
      resolve(value);
    };
    const send=async({resendCode=false}={})=>{
      sending=true;syncBusyState();setError('');
      try{
        await requestSaosaOtp(phone,windowRef);
        if(closed)return;
        if(!resendCode)showCode();
        startResendTimer();
      }
      catch(requestError){setError(smsErrorMessage(requestError));}
      finally{sending=false;if(!closed)syncBusyState();}
    };
    const onSubmit=async event=>{
      event.preventDefault();if(verifying||(step==='phone'&&sending))return;
      const rawValue=String(input.value||'');
      if(step==='phone'){
        if(!/^09\d{9}$/.test(rawValue)){setError('شماره موبایل را به‌صورت ۱۱ رقمی و با 09 وارد کنید.');return;}
        phone=rawValue;await send();return;
      }
      const value=rawValue.replace(/\D/g,'');
      if(!/^\d{6}$/.test(value)){setError('کد ۶ رقمی را کامل وارد کنید');return;}
      verifying=true;syncBusyState();setError('');
      try{close(await verifySaosaOtp(phone,value,windowRef));}
      catch(verifyError){setError(smsErrorMessage(verifyError));verifying=false;syncBusyState();}
    };
    const onBack=()=>step==='code'?showPhone():close(null);
    const onResend=()=>{if(!sending&&!verifying&&resendTimer===null)send({resendCode:true});};
    const onInput=()=>setError('');input.addEventListener('input',onInput);
    form.addEventListener('submit',onSubmit);back?.addEventListener('click',onBack);resend?.addEventListener('click',onResend);
    screen.hidden=false;documentRef.body?.classList?.add('sms-auth-open');showPhone();
  });
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
  const notebookMenuTrigger = byId(documentRef, 'notebookMenuTrigger');
  const refreshTrigger = byId(documentRef, 'projectRefreshTrigger');
  const notificationsTrigger = byId(documentRef, 'notificationsTrigger');
  const settingsParent = settingsTrigger?.parentNode || null;
  const settingsNextSibling = settingsTrigger?.nextSibling || null;
  const settingsModules = new Set(['people','project-settings','role-management','activities']);

  const setSettingsMounted = mounted => {
    if(!settingsTrigger || !settingsParent) return;
    if(mounted){
      if(!settingsTrigger.parentNode) settingsParent.insertBefore?.(settingsTrigger, settingsNextSibling);
    }else if(settingsTrigger.parentNode){
      settingsTrigger.remove?.();
    }
  };
  const setRefreshMounted = mounted => {
    if(!refreshTrigger || !settingsParent) return;
    if(mounted){
      if(!refreshTrigger.parentNode) settingsParent.insertBefore?.(refreshTrigger, null);
    }else if(refreshTrigger.parentNode){
      refreshTrigger.remove?.();
    }
  };
  windowRef.KarhaProjectWorkspaceControls = Object.freeze({
    element:settingsTrigger,
    setMounted(mounted){ setSettingsMounted(mounted); setRefreshMounted(mounted); },
    isMounted:()=>!!settingsTrigger?.parentNode,
  });

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
    const project = windowRef.KarhaApp?.projectWorkspace?.getActiveProject?.();
    const projectScoped = /^#\/?projects?\//i.test(windowRef.location?.hash || '')
      && !!windowRef.KarhaRoute?.projectId;
    const showSettings=!notebook && projectScoped && !!project;
    setSettingsMounted(showSettings);
    setRefreshMounted(showSettings || notebook);
    if(settingsTrigger) settingsTrigger.hidden = !showSettings;
    if(notebookMenuTrigger) notebookMenuTrigger.hidden = !notebook;
    if(refreshTrigger) refreshTrigger.hidden = !(showSettings || notebook);
    settingsTrigger?.classList?.toggle?.('active',settingsModules.has(moduleId));
    settingsTrigger?.setAttribute?.('aria-pressed',settingsModules.has(moduleId)?'true':'false');
    if(windowRef.KarhaWorkspaceChrome){
      windowRef.KarhaWorkspaceChrome.updateWorkspaceContextBar?.();
      return;
    }
    title?.classList.toggle('notebook-context', notebook);
    if(notebook){
      documentRef.documentElement?.classList?.add?.('saosa-notebook-route');
      documentRef.body?.classList?.add?.('global-surface');
      title?.classList.add('global-menu-context');
      title?.classList.remove('has-active-project');
      if(main) main.textContent = 'دفترچه یادداشت';
      if(projectLabel) projectLabel.textContent = '';
      title?.setAttribute('aria-haspopup', 'true');
      title?.setAttribute('aria-label', 'باز کردن منو از دفترچه یادداشت');
      return;
    }
    documentRef.documentElement?.classList?.remove?.('saosa-notebook-route');
    title?.setAttribute('aria-haspopup', 'true');
    title?.setAttribute('aria-label', 'فهرست پروژه‌ها');
    if(moduleId !== 'dashboard' && moduleId !== 'tasks') return;

    const routeProject = projectScoped && String(windowRef.KarhaRoute?.projectId) === String(project?.id)
      ? project
      : null;
    if(routeProject?.name){
      if(main) main.textContent = routeProject.name;
      if(projectLabel) projectLabel.textContent = '';
      title?.classList.add('has-active-project');
    }else{
      if(main) main.textContent = '';
      if(projectLabel) projectLabel.textContent = '';
      title?.classList.remove('has-active-project');
    }
  };

  settingsTrigger?.addEventListener?.('click', () => {
    const project = windowRef.KarhaApp?.projectWorkspace?.getActiveProject?.();
    const moduleId=windowRef.KarhaRoute?.moduleId;
    if(settingsModules.has(moduleId)){ windowRef.KarhaBrowserHistory?.back?.(); return; }
    if(project?.id) windowRef.KarhaApp?.projectWorkspace?.selectProject?.(project.id,{moduleId:'people'});
  });
  refreshTrigger?.addEventListener?.('click', () => windowRef.location?.reload?.());
  notificationsTrigger?.addEventListener?.('click', () => {
    const route='#/notifications';
    const state=windowRef.KarhaBrowserHistory?.stateForRoute?.({projectId:null,moduleId:'notifications',surface:'global',hash:route});
    if(windowRef.KarhaBrowserHistory?.push) windowRef.KarhaBrowserHistory.push(state||{hash:route},route);
    else windowRef.location.hash=route;
    windowRef.KarhaApp?.router?.sync?.();
  });

  const syncNotificationBadge = async user => {
    const badge=byId(documentRef,'notificationBadge');
    if(!badge) return;
    const render=count=>{
      const value=Math.max(0,Number(count)||0);
      badge.hidden=value===0;
      badge.textContent=value>99?'۹۹+':value.toLocaleString('fa-IR');
      notificationsTrigger?.setAttribute?.('aria-label',value?`اعلان‌ها، ${value} خوانده‌نشده`:'اعلان‌ها');
    };
    if(!user || !isSaosaHost(windowRef)){render(0);return;}
    const session=readSaosaSession(windowRef);render(session?.pendingInvitationCount || 0);
    if(!session?.token || !windowRef.fetch) return;
    try{
      const response=await windowRef.fetch('/api/v1/invitations',{headers:{authorization:`Bearer ${session.token}`}});
      const payload=await response.json().catch(()=>({}));
      if(response.ok) render(Array.isArray(payload.items)?payload.items.length:0);
    }catch{}
  };

  const syncUser = user => {
    const saosaLoggedOut = isSaosaHost(windowRef) && !user;
    documentRef.body?.classList?.toggle?.('saosa-logged-out', saosaLoggedOut);
    documentRef.documentElement?.classList?.toggle?.('saosa-initial-logged-out', saosaLoggedOut);
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
    if(drawerAccountName) drawerAccountName.textContent = user?.displayName || (user ? 'کاربر' : 'مهمان');
    if(drawerAccountSub) drawerAccountSub.textContent = user?.phoneNumber || user?.email || 'وارد نشده‌اید';
    if(signin){
      signin.textContent = user ? 'خروج از حساب' : (isSaosaHost(windowRef) ? 'ورود با شماره موبایل' : 'ورود با گوگل');
      signin.dataset.authAction = user ? 'signout' : 'signin';
      if(user) drawer?.appendChild?.(signin);
      else accountAccess?.appendChild?.(signin);
    }
    if(drawerAuthHint && isSaosaHost(windowRef)) drawerAuthHint.textContent = 'کد ورود با پیامک ارسال می‌شود';
    drawerAuthHint?.classList?.toggle?.('hidden', !!user);
    avatar?.classList.toggle('is-guest', !user);
    avatar?.setAttribute('aria-label', user ? 'حساب کاربری' : 'ورود');
    if(notificationsTrigger) notificationsTrigger.hidden = !user;
    void syncNotificationBadge(user);
    if(isSaosaHost(windowRef)) windowRef.KarhaLegacy?.renderAll?.();
  };

  const syncAccountDrawerImmediately = () => {
    if(isSaosaHost(windowRef)){
      syncUser(saosaSessionUser(readSaosaSession(windowRef)));
      return;
    }
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
  windowRef.addEventListener?.('karha:saosa-session-synced', syncAccountDrawerImmediately);
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

  byId(documentRef, 'notebookMenuTrigger')?.addEventListener?.('click', openProjectMenu);
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
          clearSaosaWorkspaceSession(windowRef);
          if(windowRef.location) windowRef.location.hash = '';
          windowRef.location?.reload?.();
          return;
        }
        try{
          const session = await signInWithSms({windowRef,documentRef});
          if(session){
            if(session.pendingInvitationCount>0 && windowRef.location) windowRef.location.hash='#/notifications?section=invitations';
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
