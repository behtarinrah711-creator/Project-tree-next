export const PROJECT_ROUTE_SURFACES = Object.freeze({
  dashboard: Object.freeze({ pageId:null, footer:'Projects', subpage:null }),
  tasks: Object.freeze({ pageId:null, footer:'Projects', subpage:null }),
  reports: Object.freeze({ pageId:'reportsPage', footer:'Reports', subpage:null }),
  contracts: Object.freeze({ pageId:'contractsPage', footer:'Reports', subpage:'contracts' }),
  accounting: Object.freeze({ pageId:'accountingPage', footer:'Accounting', subpage:null }),
  people: Object.freeze({ pageId:'settingsPage', footer:'Settings', subpage:null }),
  activities: Object.freeze({ pageId:'projectActivitiesPage', footer:'Settings', subpage:'activities' }),
});

export function getProjectRouteSurface(moduleId){
  return PROJECT_ROUTE_SURFACES[moduleId] || PROJECT_ROUTE_SURFACES.dashboard;
}

export function applyProjectRouteSurface(moduleId, {
  windowRef = globalThis.window,
  documentRef = windowRef?.document || globalThis.document,
} = {}){
  if(!documentRef) return false;
  const surface = getProjectRouteSurface(moduleId);
  windowRef?.KarhaWorkspaceChrome?.applyRoute?.(moduleId, surface);
  return surface;
}

export function showProjectsDashboardSurface({
  windowRef = globalThis.window,
  documentRef = windowRef?.document || globalThis.document,
} = {}){
  if(!documentRef) return false;
  windowRef?.KarhaWorkspaceChrome?.applyRoute?.('dashboard', getProjectRouteSurface('dashboard'));
  return true;
}

export function installProjectRouteSurfaceSync({
  windowRef = globalThis.window,
  documentRef = windowRef?.document || globalThis.document,
} = {}){
  if(!windowRef?.addEventListener || !documentRef) return false;
  if(windowRef.__karhaProjectRouteSurfaceSyncInstalled) return false;
  windowRef.__karhaProjectRouteSurfaceSyncInstalled = true;
  windowRef.addEventListener('karha:workspace-route-synced', event => {
    const moduleId = event?.detail?.moduleId;
    const surface = getProjectRouteSurface(moduleId);
    windowRef.KarhaWorkspaceChrome?.applyRoute?.(moduleId, surface);
    windowRef.KarhaLegacy?.applyRoutedSurface?.({ ...event?.detail, surface });
  });
  return true;
}
