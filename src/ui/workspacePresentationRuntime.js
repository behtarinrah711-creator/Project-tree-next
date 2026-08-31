let lastCenteredTab = null;
let workspaceSubpage = null;

/* ---------- root menu pages history ----------
   صفحات منوی اصلی (ثبت مشخصات، مدیریت پروژه‌ها، حذف‌شده‌ها، آرشیوها)
   یک سطح مستقل روی هوم پروژه‌ها هستند. با Back گوشی/مرورگر همیشه به
   همان پروژه‌ای که قبل از ورود انتخاب شده بود برمی‌گردیم. */
let menuRootPage = null;
// صفحه‌های منوی کناری «صفحه مستقل» هستند و هرگز نباید با سطح هوم پروژه‌ها یکی تلقی شوند.
let menuRootMode = null;

function pushMenuRootHistory(kind){
  menuRootPage = kind;
  menuRootMode = kind;
  window.KarhaChildHistory?.open('menu-root',{kind});
}

function closeMenuRootPage(fromPopState=false){
  menuRootPage = null;
  menuRootMode = null;
  window.KarhaChildHistory?.consume('menu-root',{fromPopState});
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

function renderAll(){
  setBottomNavActive('Projects');
  renderTabs();
  setBottomNavActive(document.querySelector('.bottom-nav-item.active')?.id?.replace(/^bottom/,'').replace(/Btn$/,'') || 'Projects');
  renderModeToggle();
  const content = document.getElementById('content');
  content.innerHTML = '';
  if(getActiveTab() === 'starred'){
    // Global Starred removed: normalize to project home / empty workspace
    setActiveTab(null);
  }
  const p = findProject(getActiveTab());
  if(!p || p.archived || p.trashed){
    content.innerHTML = '<div class="workspace-no-project">برای ورود به Workspace، از منوی سه‌خطی بالای صفحه یک پروژه را انتخاب کنید. تب «پروژه‌ها» فقط محتوای کاری پروژه فعال را نمایش می‌دهد.</div>';
    return;
  }
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
  if(menuRootMode || window.KarhaChildHistory?.isOpen('menu-root')){
    menuRootMode = null;
    menuRootPage = null;
    window.KarhaChildHistory?.replace('menu-root',{footer:true});
  }
}

function goHomeProjects(){
  closeBottomPages();
  ensureHomeSelection();
  menuRootMode = null;
  menuRootPage = null;
  setBottomNavActive('Projects');
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
