let lastCenteredTab = null;
let deferredWorkspaceRenderFrame = 0;
let workspaceSubpage = null;

/* ---------- root menu pages history ----------
   صفحات منوی اصلی (ثبت مشخصات، مدیریت پروژه‌ها، حذف‌شده‌ها، آرشیوها)
   یک سطح مستقل روی هوم پروژه‌ها هستند. با Back گوشی/مرورگر همیشه به
   همان پروژه‌ای که قبل از ورود انتخاب شده بود برمی‌گردیم. */
let menuRootPage = null;
// صفحه‌های منوی کناری «صفحه مستقل» هستند و هرگز نباید با سطح هوم پروژه‌ها یکی تلقی شوند.
let menuRootMode = null;

function isGlobalWorkspaceRoute(){
  return window.KarhaRoute?.surface === 'global'
    || /^#\/(?:notebook(?:\/|$)|profile$|management$|notifications$)/i.test(String(window.location.hash || ''));
}

function pushMenuRootHistory(kind){
  menuRootPage = kind;
  menuRootMode = kind;
  const moduleId = kind === 'projects' ? 'management' : 'profile';
  const hash = `#/${moduleId}`;
  window.KarhaBrowserHistory?.push?.(
    window.KarhaBrowserHistory.stateForRoute({projectId:null,moduleId,hash}),
    hash
  );
}

function closeMenuRootPage(fromPopState=false){
  menuRootPage = null;
  menuRootMode = null;
  if(!fromPopState){ window.KarhaBrowserHistory?.back?.(); return; }
  goHomeProjects();
}

/* ---------- project tab rendering ---------- */
function renderTabs(){
  const bar = document.getElementById('tabbar');
  if(!bar) return;
  bar.innerHTML = '';
  bar.setAttribute('aria-hidden','true');
  updateWorkspaceContextBar();
  renderDrawerProjectList();
}

/* ---------- project tab search ---------- */
(function setupProjectSearch(){
  const inp = document.getElementById('projectSearch');
  if(inp) inp.setAttribute('aria-hidden','true');
})();


function svgGrip(){
  return '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.2"/><circle cx="7.5" cy="2.5" r="1.2"/><circle cx="2.5" cy="7" r="1.2"/><circle cx="7.5" cy="7" r="1.2"/><circle cx="2.5" cy="11.5" r="1.2"/><circle cx="7.5" cy="11.5" r="1.2"/></svg>';
}

/* ---------- content ---------- */


/* ---------- main surface ownership ----------
   کارهای پروژه فقط متعلق به سطح «پروژه‌ها» هستند.
   در صفحات حسابداری/گزارش/تنظیمات/همکاران و زیرصفحه‌های آن‌ها
   اصلاً در DOM رندر نمی‌شوند؛ بنابراین هیچ نشت محتوایی از صفحه کارها
   به صفحات دیگر امکان‌پذیر نیست. */
function enterWorkspaceSurface(){
  return window.KarhaWorkspaceChrome?.enterWorkspaceSurface?.();
}

function enterProjectsSurface(){
  menuRootMode = null;
  menuRootPage = null;
  return window.KarhaWorkspaceChrome?.enterProjectsSurface?.();
}

function isSaosaWorkspaceHost(){
  return ['saosa.ir','www.saosa.ir'].includes(String(window.location?.hostname || '').toLowerCase());
}

function renderWorkspaceLoginPrompt(content){
  setActiveTab(null);
  content.innerHTML = '<div class="workspace-no-project saosa-guest-card"><p>جهت استفاده از امکانات ساُسا ابتدا وارد شوید یا ثبت نام کنید</p><button type="button" class="saosa-guest-login" id="saosaGuestLogin">ورود یا ثبت نام</button></div>';
  document.getElementById('saosaGuestLogin')?.addEventListener('click', () => document.getElementById('drawerSigninBtn')?.click());
}

function renderEmptyProjectPrompt(content){
  content.innerHTML = '<div class="workspace-no-project saosa-empty-project-card"><button type="button" class="saosa-empty-project-create" id="saosaEmptyProjectCreate">+ ایجاد پروژه</button></div>';
  document.getElementById('saosaEmptyProjectCreate')?.addEventListener('click', () => document.getElementById('drawerAddProjectBtn')?.click());
}

function renderAll(){
  // Global pages own their surfaces. A late project refresh must not replace
  // the notebook/export DOM while its route is opening.
  if(isGlobalWorkspaceRoute()) return;
  const content = document.getElementById('content');
  // Replacing a captured drag element cancels the user's pointer gesture.
  if(content?.querySelector('.wbs-row-dragging,.wbs-work-task.is-dragging')){
    if(!deferredWorkspaceRenderFrame) deferredWorkspaceRenderFrame = requestAnimationFrame(() => {
      deferredWorkspaceRenderFrame = 0;
      renderAll();
    });
    return;
  }
  const activeModule = window.KarhaRoute?.moduleId;
  if(activeModule === 'planning' || activeModule === 'execution'){
    window.KarhaApp?.modules?.get(activeModule)?.mount?.({projectId:getActiveTab()});
    renderDrawerProjectList();
    return;
  }
  setBottomNavActive('Home');
  renderTabs();
  setBottomNavActive(document.querySelector('.bottom-nav-item.active')?.id?.replace(/^bottom/,'').replace(/Btn$/,'') || 'Home');
  renderModeToggle();
  content.innerHTML = '';
  const signinButton = document.getElementById('drawerSigninBtn');
  const isLoggedOut = isSaosaWorkspaceHost() && (
    document.body?.classList?.contains('saosa-logged-out')
    || signinButton?.dataset?.authAction === 'signin'
  );
  if(isLoggedOut){
    document.body?.classList?.remove('saosa-no-project');
    renderWorkspaceLoginPrompt(content);
    return;
  }
  if(getActiveTab() === 'starred'){
    // Global Starred removed: normalize to project home / empty workspace
    setActiveTab(null);
  }
  const p = findProject(getActiveTab());
  if(!p || p.archived || p.trashed){
    document.body?.classList?.add('saosa-no-project');
    if(isLoggedOut) renderWorkspaceLoginPrompt(content);
    else renderEmptyProjectPrompt(content);
    return;
  }
  document.body?.classList?.remove('saosa-no-project');
  if(window.KarhaApp?.router?.navigate){
    replaceWorkspaceRoute(p.id,'dashboard');
    return;
  }
  replaceWorkspaceRoute(p.id,'dashboard');
  renderProjectView(content, p);
}

function refreshStarredPartial(){
  // Global Starred removed — no-op (workspace star still uses renderAll)
}

function renderModeToggle(){
  const btn = document.getElementById('modeToggle');
  const label = document.getElementById('modeToggleLabel');
  if(getViewMode() === 'cost'){ btn.classList.add('active'); label.textContent = 'نمایش ساده'; }
  else { btn.classList.remove('active'); label.textContent = 'نمایش هزینه'; }
}
document.getElementById('modeToggle').onclick = ()=>{
  setViewMode(getViewMode() === 'cost' ? 'simple' : 'cost');
  persist(); renderAll();
};


function syncWorkspacePageTop(){ return window.KarhaWorkspaceChrome?.syncWorkspacePageTop?.(); }
function updateWorkspaceContextBar(){ return window.KarhaWorkspaceChrome?.updateWorkspaceContextBar?.(); }
function setBottomNavActive(key){ return window.KarhaWorkspaceChrome?.setBottomNavActive?.(key); }
function showOnlyWorkspacePage(pageId){ return window.KarhaWorkspaceChrome?.showOnlyWorkspacePage?.(pageId); }
function closeBottomPages(){
  workspaceSubpage=null;
  return window.KarhaWorkspaceChrome?.closeBottomPages?.();
}

function handleWorkspaceContextBack(){
  if(workspaceSubpage === 'contractTemplates'){ closeContractTemplatesPage(); return; }
  if(workspaceSubpage === 'contractTemplateForm'){ requestCloseContractTemplateForm(); return; }
  if(workspaceSubpage === 'contractForm'){ requestCloseContractForm(); return; }
  if(workspaceSubpage === 'contracts'){ closeContractsPage(); return; }
  if(workspaceSubpage === 'archive'){ goHomeProjects(); return; }
  goHomeProjects();
}

function handleWorkspaceContextAction(){
  if(workspaceSubpage === 'contracts'){ openContractForm(null); return; }
  if(workspaceSubpage === 'collab') showToast('اشتراک‌گذاری حذف شده است');
}

function ensureHomeSelection(){
  const active = findProject(getActiveTab());
  if(!getActiveTab() || getActiveTab() === 'starred' || !active || active.trashed || active.archived){
    setActiveTab(null);
  }
}

function leaveMenuRootForFooter(){
  // با کلیک مستقیم روی فوتر از صفحه منوی کناری خارج می‌شویم؛
  // رکورد history همان لحظه به یک وضعیت عادی تبدیل می‌شود تا Back دوباره به منوی قبلی برنگردد.
  if(menuRootMode){
    menuRootMode = null;
    menuRootPage = null;
  }
}

function goHomeProjects(){
  closeBottomPages();
  ensureHomeSelection();
  menuRootMode = null;
  menuRootPage = null;
  setBottomNavActive('Home');
  enterProjectsSurface();
}

function renderReportsWorkspace(){
  const module = window.KarhaApp?.modules?.get('reports');
  if(module?.render) module.render();
}

/* VERSION 232 — صورت‌وضعیت‌ها از منوی حسابداری حذف شدند.
   منطق و داده‌های داخلی فعلاً دست‌نخورده می‌مانند تا در صورت نیاز
   بعداً محل و مسیر جدیدشان را جداگانه طراحی کنیم. */
function renderAccountingWorkspace(){
  ensureHomeSelection();
  const body=document.getElementById('accountingPageBody');
  if(!body) return;
  body.innerHTML='';
}

// D6 compatibility view adapter. Route/module/surface selection is owned by
// AppRouter + projectRouteSurface; legacy only refreshes UI that has not yet
// been extracted from this file.
function applyRoutedSurface({moduleId='dashboard',surface=null}={}){
  menuRootMode = null;
  menuRootPage = null;
  workspaceSubpage = surface?.subpage || null;
  if(moduleId==='people') renderSettingsWorkspace();
  renderTabs();
  updateWorkspaceContextBar();
}

function restoreGlobalMenuRoute(moduleId){
  if(moduleId==='notifications'){
    menuRootMode=null; menuRootPage=null;
    closeBottomPages(); enterWorkspaceSurface(); setBottomNavActive('Home');
    showOnlyWorkspacePage('notificationsPage'); updateWorkspaceContextBar(); renderNotificationsPage();
    return true;
  }
  if(moduleId==='management'){
    menuRootMode='projects'; menuRootPage='projects'; projectManagementView.reset();
    closeBottomPages(); enterWorkspaceSurface(); setBottomNavActive('Home');
    showOnlyWorkspacePage('projectsPage'); updateWorkspaceContextBar(); renderManagementPage();
    return true;
  }
  if(moduleId==='profile'){
    menuRootMode='profile'; menuRootPage='profile';
    window.KarhaProfileView?.openProfilePage?.({restoreRoute:true});
    return true;
  }
  return false;
}

function notificationSession(){
  try{return JSON.parse(localStorage.getItem('saosa:v1:sms-session') || 'null');}catch{return null;}
}

async function notificationRequest(path,options={}){
  const session=notificationSession();
  if(!session?.token) throw new Error('unauthorized');
  const response=await fetch(path,{...options,headers:{authorization:`Bearer ${session.token}`,'content-type':'application/json',...(options.headers||{})}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(payload.error||'invitation_request_failed'),{code:payload.error,status:response.status});
  return payload;
}

function openNotificationSection(section){
  const route=`#/notifications?section=${encodeURIComponent(section)}`;
  const state=window.KarhaBrowserHistory?.stateForRoute?.({projectId:null,moduleId:'notifications',surface:'global',hash:route});
  if(window.KarhaBrowserHistory?.push) window.KarhaBrowserHistory.push(state||{hash:route},route);
  else location.hash=route;
  window.KarhaApp?.router?.sync?.();
}

async function renderInvitationList(body){
  body.innerHTML='<div class="mgmt-empty">در حال دریافت دعوت‌نامه‌ها…</div>';
  try{
    const result=await notificationRequest('/api/v1/invitations');
    const items=Array.isArray(result.items)?result.items:[];
    body.replaceChildren();
    if(!items.length){body.innerHTML='<div class="mgmt-empty">دعوت‌نامه‌ای ندارید.</div>';return;}
    const wrap=document.createElement('div');wrap.className='workspace-option-list notification-invitation-list';
    items.forEach(invitation=>{
      const row=document.createElement('div');row.className='workspace-option notification-invitation';
      const main=document.createElement('span');main.className='workspace-option-main';
      const title=document.createElement('span');title.className='workspace-option-title';title.textContent=invitation.projectName || 'پروژه';
      const meta=document.createElement('span');meta.className='workspace-option-meta';meta.textContent='دعوت به عضویت در پروژه';
      const accept=document.createElement('button');accept.type='button';accept.className='notification-accept';accept.textContent='تأیید دعوت';
      accept.onclick=async()=>{
        accept.disabled=true;
        try{
          const accepted=await notificationRequest(`/api/v1/invitations/${encodeURIComponent(invitation.id)}/accept`,{method:'POST',body:'{}'});
          const entered=await window.KarhaApp?.activateAcceptedProject?.({
            windowRef:window,store:window.KarhaAppData,projectId:accepted.projectId || invitation.projectId,
          });
          if(!entered) throw new Error('accepted_project_unavailable');
        }catch(error){accept.disabled=false;showToast(error.code==='invitation_not_found'?'این دعوت‌نامه دیگر معتبر نیست.':'تأیید دعوت‌نامه انجام نشد.');}
      };
      main.append(title,meta);row.append(main,accept);wrap.appendChild(row);
    });
    body.appendChild(wrap);
  }catch{body.innerHTML='<div class="mgmt-empty">دریافت دعوت‌نامه‌ها انجام نشد.</div>';}
}

function renderNotificationsPage(){
  const body=document.getElementById('notificationsPageBody');
  if(!body) return;
  body.replaceChildren();
  const params=new URLSearchParams(String(location.hash||'').split('?')[1]||'');
  if(params.get('section')==='invitations'){void renderInvitationList(body);return;}
  const wrap=document.createElement('div'); wrap.className='workspace-option-list';
  [{id:'invitations',label:'دعوت‌نامه‌ها'},{id:'messages',label:'پیام‌های من'},{id:'alerts',label:'اعلان‌ها'}].forEach(item=>{
    const row=document.createElement('button'); row.type='button'; row.className='workspace-option';
    row.innerHTML=`<span class="workspace-option-main"><span class="workspace-option-title">${item.label}</span></span><span class="workspace-option-arrow">›</span>`;
    if(item.id==='invitations') row.onclick=()=>openNotificationSection(item.id);
    wrap.appendChild(row);
  });
  body.appendChild(wrap);
}


function createWorkspaceSearch(placeholder,onInput){
  const wrap=document.createElement('div'); wrap.className='workspace-search';
  const input=document.createElement('input'); input.type='search'; input.placeholder=placeholder||'جستجو…'; input.autocomplete='off'; input.setAttribute('aria-label',placeholder||'جستجو');
  input.addEventListener('input',()=>onInput(String(input.value||'').trim().toLocaleLowerCase('fa')));
  wrap.appendChild(input); return {wrap,input};
}
function workspaceTextMatch(text,q){ return !q || String(text||'').toLocaleLowerCase('fa').includes(q); }

function renderSettingsWorkspace(){
  const body=document.getElementById('settingsPageBody');
  if(!body) return;
  ensureHomeSelection();
  const p=findProject(getActiveTab());
  body.innerHTML='';
  if(!p){ body.innerHTML='<div class="mgmt-empty">برای نمایش تنظیمات، یک پروژه را انتخاب کنید.</div>'; return; }
  const wrap=document.createElement('div'); wrap.className='workspace-option-list';
  const projectSettingsRow=document.createElement('button'); projectSettingsRow.type='button'; projectSettingsRow.className='workspace-option';
  projectSettingsRow.innerHTML='<span class="workspace-option-main"><span class="workspace-option-title">تنظیمات پروژه</span></span><span class="workspace-option-arrow">›</span>';
  projectSettingsRow.onclick=()=>window.KarhaApp?.router?.navigate(p.id, 'project-settings'); wrap.appendChild(projectSettingsRow);
  const access=window.KarhaSaosaWorkspaceAccess?.[p.id] || null;
  const session=window.KarhaApp?.getSession?.() || {};
  const ownerId=p.ownerUid || p.creatorUid || null;
  const isOwner=access?.role === 'owner' || (!access && (!ownerId || (session.uid && String(ownerId)===String(session.uid))));
  if(isOwner){
    const rolesRow=document.createElement('button'); rolesRow.type='button'; rolesRow.className='workspace-option';
    rolesRow.innerHTML='<span class="workspace-option-main"><span class="workspace-option-title">مدیریت نقش‌ها</span><span class="workspace-option-meta">اعضا، نقش‌ها و سطح دسترسی ماژول‌ها</span></span><span class="workspace-option-arrow">›</span>';
    rolesRow.onclick=()=>window.KarhaApp?.router?.navigate(p.id,'role-management'); wrap.appendChild(rolesRow);
  }
  const contactRow=document.createElement('button'); contactRow.type='button'; contactRow.className='workspace-option';
  contactRow.innerHTML='<span class="workspace-option-main"><span class="workspace-option-title">مخاطبین</span></span><span class="workspace-option-arrow">›</span>';
  contactRow.onclick=()=>openContactsPage(); wrap.appendChild(contactRow);

  const activityRow=document.createElement('button'); activityRow.type='button'; activityRow.className='workspace-option';
  activityRow.innerHTML='<span class="workspace-option-main"><span class="workspace-option-title">فعالیت‌ها</span></span><span class="workspace-option-arrow">›</span>';
  activityRow.onclick=()=>openProjectActivitiesPage(); wrap.appendChild(activityRow);

  const contractRow=document.createElement('button'); contractRow.type='button'; contractRow.className='workspace-option';
  contractRow.innerHTML='<span class="workspace-option-main"><span class="workspace-option-title">قراردادها</span></span><span class="workspace-option-arrow">›</span>';
  contractRow.onclick=()=>openContractTemplatesPage(); wrap.appendChild(contractRow);

  const trashRow=document.createElement('button');
  trashRow.type='button'; trashRow.className='workspace-option';
  trashRow.innerHTML='<span class=\"workspace-option-main\"><span class=\"workspace-option-title\">حذف شده ها</span></span><span class=\"workspace-option-arrow\">›</span>';
  trashRow.onclick=()=>openProjectTrashPage();
  wrap.appendChild(trashRow);

  body.appendChild(wrap);
}



/* ---------- قراردادها: قالب قرارداد + قرارداد واقعی + صورت وضعیت تستی ---------- */
