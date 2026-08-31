import { projectContext } from './projectContext.js';
import { moduleRegistry } from './moduleRegistry.js';
import { getSession } from './session.js';
import { isProjectVisibleForSession } from './projectVisibility.js';
import { isCondemnedRoute } from '../modules/condemned/index.js';

export function parseRoute(){
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const decode = value => { try{ return decodeURIComponent(value); }catch{ return value; } };
  if(parts[0] === 'notebook'){
    const leaf = parts[1] === 'export' ? 'notebook-export' : 'notebook';
    return { projectId: null, moduleId: leaf, surface: 'global' };
  }
  const projectIndex = parts.findIndex(part => part === 'project' || part === 'projects');
  const projectId = projectIndex >= 0 ? decode(parts[projectIndex + 1]) : projectContext.getProjectId();
  const moduleId = projectIndex >= 0 ? decode(parts[projectIndex + 2] || 'dashboard') : decode(parts[0] || 'dashboard');
  return { projectId: projectId || null, moduleId };
}

export class AppRouter{
  constructor(){
    this.currentMounted = null;
    this.started = false;
    this.syncQueued = false;
    this.lastSyncedHash = null;
  }

  start(){
    if(this.started) return;
    this.started = true;
    const sync = () => {
      if(this.syncQueued) return;
      this.syncQueued = true;
      queueMicrotask(() => {
        this.syncQueued = false;
        this.sync();
      });
    };
    window.addEventListener('hashchange', sync);
    window.KarhaBrowserHistory?.register('route',sync);
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', sync, { once: true });
    } else {
      queueMicrotask(sync);
    }
  }

  navigate(projectId, moduleId = 'dashboard', { replace = false } = {}){
    if(!projectId) return false;
    const requestedModule = moduleId || 'dashboard';
    const currentRoute = parseRoute();
    const hasExplicitProjectRoute = /^#\/?projects?\//i.test(String(window.location.hash || ''));
    // Background/startup rendering may ask to replace the active project with
    // its default dashboard even while an explicit same-project route is the
    // authoritative browser location. A replace operation must not demote an
    // existing deep-link such as /reports, /accounting, /people, or /contracts
    // to /dashboard. Intentional user navigation to Projects uses push, while
    // condemned-route correction owns its explicit replace path in sync().
    if(
      replace &&
      hasExplicitProjectRoute &&
      String(currentRoute.projectId || '') === String(projectId) &&
      currentRoute.moduleId !== requestedModule &&
      requestedModule === 'dashboard'
    ){
      return true;
    }
    const route = `#/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(requestedModule)}`;
    if(window.location.hash !== route){
      const state=window.KarhaBrowserHistory?.stateForRoute({projectId,moduleId:requestedModule,hash:route});
      window.KarhaBrowserHistory?.[replace?'replace':'push'](state,route);
    }
    // The History API does not emit hashchange or popstate. Routing owns the
    // complete programmatic-navigation lifecycle, so synchronize it here once
    // startup has installed the route listeners. Pre-start route setup is
    // consumed by start()'s initial synchronization after Legacy is loaded.
    if(this.started) this.sync();
    return true;
  }

  sync(){
    const route = parseRoute();
    this.lastSyncedHash = window.location.hash;
    const session = getSession();
    const rawProject = route.projectId
      ? (window.KarhaApp?.projectRepository?.find?.(route.projectId) || null)
      : null;
    const allowed = !rawProject || isProjectVisibleForSession(rawProject, session);
    const projectId = allowed ? route.projectId : null;
    projectContext.setProjectId(projectId);
    if(projectId && window.KarhaAppData && window.KarhaAppData.getActiveTab?.() !== projectId){
      window.KarhaAppData.setActiveTab(projectId);
      window.KarhaAppData.persistLocal?.();
    }
    // Phase 5: condemned deep links → dashboard of the same project (not global home).
    let moduleId = route.moduleId;
    if(isCondemnedRoute(moduleId)){
      moduleId = 'dashboard';
      if(projectId){
        const safe = `#/projects/${encodeURIComponent(projectId)}/dashboard`;
        if(window.location.hash !== safe){
          window.KarhaBrowserHistory?.replace(
            window.KarhaBrowserHistory.stateForRoute({projectId,moduleId:'dashboard',hash:safe}),safe
          );
        }
      }
    }
    const module = moduleRegistry.get(moduleId) || ((route.surface === 'global' || route.moduleId === 'notebook' || route.moduleId === 'notebook-export') ? null : moduleRegistry.get('dashboard'));
    window.KarhaRoute = { ...route, projectId, moduleId, module };
    document.body?.classList?.toggle?.('global-surface', (route.surface === 'global' || route.moduleId === 'notebook' || route.moduleId === 'notebook-export'));
    if((route.surface === 'global' || route.moduleId === 'notebook' || route.moduleId === 'notebook-export')){
      this.currentMounted = module?.mount?.({ projectId: null, route: { ...route, projectId: null, moduleId }, registry: moduleRegistry }) || { moduleId, projectId: null };
    } else if(module && projectId){
      this.currentMounted = module.mount({ projectId, route: { ...route, projectId, moduleId }, registry: moduleRegistry });
    } else {
      this.currentMounted = null;
    }
    window.dispatchEvent(new CustomEvent('karha:workspace-route-synced', {
      detail: { projectId, moduleId, surface: route.surface || 'project' }
    }));
  }
}

export const appRouter = new AppRouter();
