/**
 * Contract page shell visibility — list + templates + form shell.
 * Does NOT own requestCloseContractForm / Back / Stay / popstate.
 */

function call(windowRef, name, ...args){
  if(typeof windowRef[name] === 'function') return windowRef[name](...args);
  if(typeof windowRef.KarhaLegacy?.[name] === 'function') return windowRef.KarhaLegacy[name](...args);
}

export function installContractShellView({ windowRef = globalThis, documentRef = null } = {}){
  if(windowRef.KarhaContractShell) return windowRef.KarhaContractShell;
  documentRef = documentRef || windowRef.document || null;

  function openContractTemplatesPage(){
    call(windowRef, 'closeBottomPages');
    call(windowRef, 'enterWorkspaceSurface');
    try{ windowRef.workspaceSubpage = 'contractTemplates'; }catch(e){}
    call(windowRef, 'setBottomNavActive', 'Settings');
    call(windowRef, 'renderTabs');
    call(windowRef, 'showOnlyWorkspacePage', 'contractTemplatesPage');
    call(windowRef, 'updateWorkspaceContextBar');
    call(windowRef, 'pushWorkspaceHistory', 'contractTemplates');
    call(windowRef, 'renderContractTemplatesPage');
  }

  function closeContractTemplatesPage(){
    try{ windowRef.workspaceSubpage = null; }catch(e){}
    call(windowRef, 'setBottomNavActive', 'Settings');
    call(windowRef, 'renderTabs');
    call(windowRef, 'showOnlyWorkspacePage', 'settingsPage');
    call(windowRef, 'updateWorkspaceContextBar');
    call(windowRef, 'renderSettingsWorkspace');
  }

  function openContractsPage(projectId, opts = {}){
    const { updateRoute = true, pushHistory = true } = opts;
    const pid = projectId || call(windowRef, 'getCurrentProjectScopeId');
    const p = call(windowRef, 'findProject', pid) || call(windowRef, 'getCurrentProject');
    if(!p) return false;
    call(windowRef, 'closeDrawer');
    call(windowRef, 'enterWorkspaceSurface');
    try{ windowRef.workspaceSubpage = 'contracts'; }catch(e){}
    if(updateRoute) call(windowRef, 'replaceWorkspaceRoute', p.id, 'reports');
    call(windowRef, 'setBottomNavActive', 'Reports');
    call(windowRef, 'renderTabs');
    call(windowRef, 'showOnlyWorkspacePage', 'contractsPage');
    call(windowRef, 'updateWorkspaceContextBar');
    if(pushHistory) call(windowRef, 'pushWorkspaceHistory', 'contracts');
    call(windowRef, 'renderContractsPage');
    return true;
  }

  function closeContractsPage(){
    const p = call(windowRef, 'getCurrentProject');
    try{ windowRef.workspaceSubpage = null; }catch(e){}
    if(p) call(windowRef, 'replaceWorkspaceRoute', p.id, 'reports');
    call(windowRef, 'setBottomNavActive', 'Reports');
    call(windowRef, 'renderTabs');
    call(windowRef, 'showOnlyWorkspacePage', 'reportsPage');
    call(windowRef, 'updateWorkspaceContextBar');
    call(windowRef, 'renderReportsWorkspace');
  }

  function openRealContractFormShell(projectId){
    // Prefer explicit projectId from realContractFormModule.open. Requiring
    // getCurrentProject() identity match caused silent false when the project
    // existed in data/findProject but activeTab/scope lagged after seed + UI nav.
    const p = (projectId && call(windowRef, 'findProject', projectId))
      || call(windowRef, 'getCurrentProject');
    if(!p) return false;
    call(windowRef, 'closeDrawer');
    try{ windowRef.workspaceSubpage = 'contractForm'; }catch(e){}
    call(windowRef, 'setInternalFormMode', true);
    call(windowRef, 'showOnlyWorkspacePage', 'contractFormPage');
    call(windowRef, 'setBottomNavActive', 'Reports');
    call(windowRef, 'renderTabs');
    call(windowRef, 'updateWorkspaceContextBar');
    return true;
  }

  function closeRealContractFormShell(){
    call(windowRef, 'setInternalFormMode', false);
    documentRef?.getElementById?.('contractFormPage')?.classList.add('hidden');
    try{ windowRef.workspaceSubpage = 'contracts'; }catch(e){}
    call(windowRef, 'showOnlyWorkspacePage', 'contractsPage');
    call(windowRef, 'setBottomNavActive', 'Reports');
    call(windowRef, 'renderTabs');
    call(windowRef, 'updateWorkspaceContextBar');
    call(windowRef, 'renderContractsPage');
  }

  const api = Object.freeze({
    openContractTemplatesPage,
    closeContractTemplatesPage,
    openContractsPage,
    closeContractsPage,
    openRealContractFormShell,
    closeRealContractFormShell,
  });
  windowRef.KarhaContractShell = api;
  return api;
}

export default { installContractShellView };
