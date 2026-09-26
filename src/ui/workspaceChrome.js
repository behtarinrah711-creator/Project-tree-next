import { firstAllowedPlanningView } from '../modules/roleManagement/planningAccess.js';

const WORKSPACE_PAGE_IDS = Object.freeze([
  'projectsPage','profilePage','calendarPage','createPage','reportsPage','accountingPage','settingsPage',
  'projectSettingsPage','projectActivitiesPage','contactsPage','projectTrashPage','contractsPage','contractFormPage',
  'roleManagementPage',
  'contractTemplateFormPage','contractTemplatesPage','activityFormPage',
]);

const FOOTER_MODULES = Object.freeze({
  bottomHomeBtn: ['dashboard', null],
  bottomPlanningBtn: ['planning', null],
  bottomExecutionBtn: ['execution', null],
  bottomReportsBtn: ['reports', 'reports-root'],
  bottomFinancialBtn: ['accounting', 'accounting'],
});

const SECTION_TITLES = Object.freeze({
  Reports: 'گزارش',
  Financial: 'مالی',
  Settings: 'تنظیمات',
});

const MENU_TITLES = Object.freeze({
  profile: 'ثبت مشخصات',
  projects: 'مدیریت پروژه‌ها',
});

const GLOBAL_ROUTE_TITLES = Object.freeze({
  notebook: 'دفترچه یادداشت',
  'notebook-export': 'خروجی دفترچه',
  profile: 'ثبت مشخصات',
  'project-management': 'مدیریت پروژه‌ها',
});

const INNER_SECTION_SUBPAGES = new Set([
  'statusList','statusForm','collab','projectTrash','contractTemplates','contractTemplateForm',
  'statusTest','contracts','contractForm','projectSettings','roleManagement',
]);
const SETTINGS_MODULES = new Set(['people','project-settings','role-management','activities']);

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
  const footer = get('bottomNav');
  const footerParent = footer?.parentNode || null;
  const footerNextSibling = footer?.nextSibling || null;

  function setProjectFooterMounted(mounted){
    if(!footer || !footerParent) return;
    if(mounted){
      if(!footer.parentNode) footerParent.insertBefore?.(footer, footerNextSibling);
      return;
    }
    if(footer.parentNode) footer.remove?.();
  }

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
    return active?.id?.replace(/^bottom/,'').replace(/Btn$/,'') || 'Home';
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

  function updateWorkspaceContextBar(routeModuleOverride){
    const state = getPresentationState() || {};
    const context = get('workspaceProjectContext');
    const contextName = get('workspaceProjectName');
    const backBtn = get('workspaceContextBack');
    const actionBtn = get('workspaceContextAction');
    const topbar = get('topbar');
    const topbarMain = get('topbarTitle')?.querySelector?.('.app-title-main');
    const topbarProject = get('topbarProjectName');
    const settingsTrigger = get('projectSettingsTrigger');
    if(!context || !contextName) return;

    const key = activeFooter();
    const profileVisible = !get('profilePage')?.classList?.contains?.('hidden');
    const managementVisible = !get('projectsPage')?.classList?.contains?.('hidden');
    const routeModuleId = routeModuleOverride || windowRef.KarhaRoute?.moduleId;
    const routeProjectId = windowRef.KarhaRoute?.projectId;
    const planningButton=get('bottomPlanningBtn');
    if(planningButton) planningButton.hidden=!!state.project&&!firstAllowedPlanningView(state.project.id,undefined,windowRef);
    settingsTrigger?.classList?.toggle?.('active',SETTINGS_MODULES.has(routeModuleId));
    settingsTrigger?.setAttribute?.('aria-pressed',SETTINGS_MODULES.has(routeModuleId)?'true':'false');
    const globalRouteTitle = GLOBAL_ROUTE_TITLES[routeModuleId] || (/^#\/notebook(?:\/export)?/i.test(windowRef.location?.hash || '')
      ? (/\/export/i.test(windowRef.location?.hash || '') ? GLOBAL_ROUTE_TITLES['notebook-export'] : GLOBAL_ROUTE_TITLES.notebook)
      : '');
    // A freshly selected drawer destination must win over a stale global route.
    const menuTitle = MENU_TITLES[state.menuRootMode] || (profileVisible ? MENU_TITLES.profile : managementVisible ? MENU_TITLES.projects : '');
    const rootTitle = menuTitle || globalRouteTitle;
    documentRef.body?.classList?.toggle?.('global-surface', !!rootTitle);
    setProjectFooterMounted(!rootTitle);
    if(rootTitle){
      if(settingsTrigger) settingsTrigger.hidden = true;
      topbar?.classList?.remove?.('workspace-context');
      topbar?.classList?.remove?.('root-workspace-context');
      get('topbarTitle')?.classList?.add?.('global-menu-context');
      get('topbarTitle')?.classList?.remove?.('notebook-context');
      get('topbarTitle')?.classList?.remove?.('has-active-project');
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

    if(settingsTrigger) settingsTrigger.hidden = !state.project;

    const isWorkspace = !['Home','Planning','Execution'].includes(key);
    topbar?.classList?.remove?.('workspace-context');
    topbar?.classList?.remove?.('root-workspace-context');
    get('topbarTitle')?.classList?.remove?.('global-menu-context');
    get('topbarTitle')?.classList?.remove?.('notebook-context');
    const subpage = state.workspaceSubpage || null;
    const sectionTitle = SECTION_TITLES[key] || (key === 'Home' && subpage === 'archive' ? 'آرشیو شده ها' : '');
    const routeProject = routeProjectId && String(routeProjectId) === String(state.project?.id)
      ? state.project
      : null;
    if(topbarMain) topbarMain.textContent = routeProject?.name || '';
    if(topbarProject) topbarProject.textContent = '';
    get('topbarTitle')?.classList?.toggle?.('has-active-project', !!routeProject?.name);

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

    let subTitle = INNER_SECTION_SUBPAGES.has(subpage) ? '' : sectionTitle;
    if(!INNER_SECTION_SUBPAGES.has(subpage)){
      if(key === 'Financial' && (subpage === 'statusList' || subpage === 'statusForm')) subTitle = 'صورت وضعیت';
      else if(key === 'Settings' && subpage === 'collab') subTitle = 'همکاران پروژه';
    }
    const showSubpageBar = !!subpage && !!subTitle;
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
    const key = state.menuRootMode ? 'Home' : requestedKey;
    // Re-mount first so project footer controls participate in this update.
    // Global destinations are detached again by updateWorkspaceContextBar().
    setProjectFooterMounted(true);
    documentRef.querySelectorAll?.('.bottom-nav-item')?.forEach?.(item => item.classList?.remove?.('active'));
    get(`bottom${key}Btn`)?.classList?.add?.('active');
    const isWorkspace = !['Home','Planning','Execution'].includes(key);
    get('topbar')?.classList?.remove?.('workspace-context');
    get('tabbar')?.setAttribute?.('aria-hidden', isWorkspace ? 'true' : 'false');
    get('bottomNav')?.classList?.remove?.('starred-disabled');
    updateWorkspaceContextBar();
  }

  function applyRoute(moduleId, surface){
    if(surface?.pageId) showOnlyWorkspacePage(surface.pageId);
    else hideAllWorkspacePages();
    setBottomNavActive(surface?.footer || 'Home');
    renderDrawerProjectList();
    updateWorkspaceContextBar(moduleId);
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
    setProjectFooterMounted, syncWorkspacePageTop, updateWorkspaceContextBar,
  });
  windowRef.KarhaWorkspaceChrome = api;
  windowRef.KarhaWorkspaceSurface = api;
  return api;
}

export default { installWorkspaceChrome };
