const WORKSPACE_PAGE_IDS = Object.freeze([
  'projectsPage','profilePage','calendarPage','createPage','reportsPage','accountingPage','settingsPage',
  'projectActivitiesPage','contactsPage','projectTrashPage','contractsPage','contractFormPage',
  'contractTemplateFormPage','contractTemplatesPage','activityFormPage',
]);

const FOOTER_MODULES = Object.freeze({
  bottomProjectsBtn: ['dashboard', null],
  bottomReportsBtn: ['reports', 'reports-root'],
  bottomAccountingBtn: ['accounting', 'accounting'],
  bottomSettingsBtn: ['people', 'settings-root'],
});

const SECTION_TITLES = Object.freeze({
  Reports: 'گزارش',
  Accounting: 'حسابداری',
  Settings: 'تنظیمات',
});

const MENU_TITLES = Object.freeze({
  profile: 'ثبت مشخصات',
  projects: 'مدیریت پروژه‌ها',
});

const INNER_SECTION_SUBPAGES = new Set([
  'statusList','statusForm','collab','projectTrash','contractTemplates','contractTemplateForm',
  'statusTest','contracts','contractForm',
]);

export function installWorkspaceChrome({
  windowRef = globalThis.window,
  documentRef = windowRef?.document || globalThis.document,
  getPresentationState = () => ({}),
  navigateFooter = () => {},
  goHomeProjects = () => {},
  renderDrawerProjectList = () => {},
  clearWorkspaceSubpage = () => {},
  clearMenuRoot = () => {},
  renderProjectsSurface = () => {},
  handleContextBack = () => {},
  handleContextAction = () => {},
} = {}){
  if(!windowRef || !documentRef) return null;
  if(windowRef.KarhaWorkspaceChrome) return windowRef.KarhaWorkspaceChrome;

  const get = id => documentRef.getElementById?.(id);

  function hideAllWorkspacePages(){
    WORKSPACE_PAGE_IDS.forEach(id => get(id)?.classList?.add?.('hidden'));
  }

  function showOnlyWorkspacePage(pageId){
    get('content')?.replaceChildren?.();
    hideAllWorkspacePages();
    if(pageId) get(pageId)?.classList?.remove?.('hidden');
  }

  function closeBottomPages(){
    clearWorkspaceSubpage();
    hideAllWorkspacePages();
  }

  function activeFooter(){
    const active = documentRef.querySelector?.('.bottom-nav-item.active');
    return active?.id?.replace(/^bottom/,'').replace(/Btn$/,'') || 'Projects';
  }

  function syncWorkspacePageTop(){
    const topbar = get('topbar');
    const context = get('workspaceProjectContext');
    if(!topbar) return;
    const topbarHeight = Math.ceil(topbar.getBoundingClientRect().height);
    const contextVisible = !!context && !context.hidden && context.classList.contains('subpage-context');
    const contextHeight = contextVisible ? Math.ceil(context.getBoundingClientRect().height) : 0;
    documentRef.documentElement?.style?.setProperty?.('--workspace-page-top', `${topbarHeight + contextHeight}px`);
  }

  function updateWorkspaceContextBar(){
    const state = getPresentationState() || {};
    const context = get('workspaceProjectContext');
    const contextName = get('workspaceProjectName');
    const backBtn = get('workspaceContextBack');
    const actionBtn = get('workspaceContextAction');
    const topbar = get('topbar');
    const topbarMain = get('topbarTitle')?.querySelector?.('.app-title-main');
    const topbarProject = get('topbarProjectName');
    if(!context || !contextName) return;

    const key = activeFooter();
    const profileVisible = !get('profilePage')?.classList?.contains?.('hidden');
    const managementVisible = !get('projectsPage')?.classList?.contains?.('hidden');
    const rootTitle = MENU_TITLES[state.menuRootMode] || (profileVisible ? MENU_TITLES.profile : managementVisible ? MENU_TITLES.projects : '');
    if(rootTitle){
      topbar?.classList?.add?.('workspace-context');
      topbar?.classList?.add?.('root-workspace-context');
      if(topbarMain) topbarMain.textContent = rootTitle;
      if(topbarProject) topbarProject.textContent = '';
      contextName.textContent = '';
      context.hidden = true;
      context.classList.remove('subpage-context');
      context.setAttribute('aria-hidden','true');
      if(backBtn) backBtn.hidden = true;
      if(actionBtn) actionBtn.hidden = true;
      syncWorkspacePageTop();
      return;
    }

    const isWorkspace = key !== 'Projects';
    const subpage = state.workspaceSubpage || null;
    const sectionTitle = SECTION_TITLES[key] || (key === 'Projects' && subpage === 'archive' ? 'آرشیو شده ها' : '');
    if(topbarMain) topbarMain.textContent = isWorkspace ? sectionTitle : 'کارها';
    if(topbarProject) topbarProject.textContent = isWorkspace && state.project?.name ? `(پروژه ${state.project.name})` : '';

    if(!isWorkspace){
      contextName.textContent = '';
      context.hidden = true;
      context.classList.remove('subpage-context');
      context.setAttribute('aria-hidden','true');
      topbar?.classList?.remove?.('root-workspace-context');
      if(backBtn) backBtn.hidden = true;
      if(actionBtn) actionBtn.hidden = true;
      syncWorkspacePageTop();
      return;
    }

    let subTitle = '';
    if(!INNER_SECTION_SUBPAGES.has(subpage)){
      if(key === 'Accounting' && (subpage === 'statusList' || subpage === 'statusForm')) subTitle = 'صورت وضعیت';
      else if(key === 'Settings' && subpage === 'collab') subTitle = 'همکاران پروژه';
    }
    const showSubpageBar = !!subTitle;
    topbar?.classList?.toggle?.('root-workspace-context', !showSubpageBar);
    context.hidden = !showSubpageBar;
    context.classList.toggle('subpage-context', showSubpageBar);
    context.setAttribute('aria-hidden', showSubpageBar ? 'false' : 'true');
    contextName.textContent = subTitle;
    if(backBtn){
      backBtn.hidden = false;
      backBtn.onclick = handleContextBack;
    }
    if(actionBtn){
      const hasAction = !INNER_SECTION_SUBPAGES.has(subpage) && subpage === 'contracts';
      actionBtn.hidden = !hasAction;
      actionBtn.title = 'ایجاد قرارداد';
      actionBtn.setAttribute('aria-label', actionBtn.title);
      actionBtn.onclick = handleContextAction;
    }
    syncWorkspacePageTop();
  }

  function setBottomNavActive(requestedKey){
    const state = getPresentationState() || {};
    const key = state.menuRootMode ? 'Projects' : requestedKey;
    documentRef.querySelectorAll?.('.bottom-nav-item')?.forEach?.(item => item.classList?.remove?.('active'));
    get(`bottom${key}Btn`)?.classList?.add?.('active');
    const isWorkspace = key !== 'Projects';
    get('topbar')?.classList?.toggle?.('workspace-context', isWorkspace);
    get('tabbar')?.setAttribute?.('aria-hidden', isWorkspace ? 'true' : 'false');
    get('bottomNav')?.classList?.remove?.('starred-disabled');
    updateWorkspaceContextBar();
  }

  function applyRoute(moduleId, surface){
    if(surface?.pageId) showOnlyWorkspacePage(surface.pageId);
    else hideAllWorkspacePages();
    setBottomNavActive(surface?.footer || 'Projects');
    renderDrawerProjectList();
    updateWorkspaceContextBar();
    return surface;
  }

  function openDrawer(){
    get('drawerOverlay')?.classList?.remove?.('hidden');
    renderDrawerProjectList();
    updateWorkspaceContextBar();
  }

  function closeDrawer(){ get('drawerOverlay')?.classList?.add?.('hidden'); }
  function enterWorkspaceSurface(){ get('content')?.replaceChildren?.(); }
  function enterProjectsSurface(){ clearMenuRoot(); closeBottomPages(); renderProjectsSurface(); }

  Object.entries(FOOTER_MODULES).forEach(([id, [moduleId]]) => {
    const button = get(id);
    if(!button) return;
    button.onclick = () => {
      navigateFooter(moduleId);
    };
  });
  ['closeReportsPage','closeAccountingPage','closeSettingsPage'].forEach(id => {
    const button = get(id);
    if(button) button.onclick = () => windowRef.KarhaBrowserHistory?.back();
  });
  windowRef.addEventListener?.('karha:drawer-open', openDrawer);
  windowRef.addEventListener?.('resize', syncWorkspacePageTop);
  windowRef.addEventListener?.('orientationchange', () => windowRef.setTimeout(syncWorkspacePageTop, 50));

  const api = Object.freeze({
    WORKSPACE_PAGE_IDS, activeFooter, applyRoute, closeBottomPages, closeDrawer, enterProjectsSurface,
    enterWorkspaceSurface, hideAllWorkspacePages, openDrawer, setBottomNavActive, showOnlyWorkspacePage,
    syncWorkspacePageTop, updateWorkspaceContextBar,
  });
  windowRef.KarhaWorkspaceChrome = api;
  windowRef.KarhaWorkspaceSurface = api;
  return api;
}

export default { installWorkspaceChrome };
