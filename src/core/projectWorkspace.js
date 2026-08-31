import { projectContext } from './projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { getSession } from './session.js';
import { isProjectVisibleForSession, projectsVisibleForSession } from './projectVisibility.js';
import { appRouter } from './router.js';

function normalizeProject(project){
  if(!project) return null;
  return {
    ...project,
    id: project.id ?? project.projectId ?? null,
    name: project.name ?? project.title ?? 'پروژه بدون نام',
  };
}

export function listProjects(){
  const session = getSession();
  return projectsVisibleForSession(projectRepository.getProjectsList(), session).map(normalizeProject);
}

export function getProject(projectId = projectContext.getProjectId()){
  if(!projectId) return null;
  const project = normalizeProject(projectRepository.getActiveProject(projectId));
  return isProjectVisibleForSession(project, getSession()) ? project : null;
}

export function getActiveProject(){
  return getProject(projectContext.getProjectId());
}

export function selectProject(projectId, { moduleId = 'dashboard', replace = false, closeDrawer = false } = {}){
  const project = getProject(projectId);
  if(!project) return false;
  // D6: selection and routing are one modular transaction. AppDataStore is the
  // sole activeTab write path; projectContext is synchronized by AppRouter.
  window.KarhaAppData?.setActiveTab?.(project.id);
  window.KarhaAppData?.persistLocal?.();
  projectContext.setProjectId(project.id);
  const router = window.KarhaApp?.router || appRouter;
  const navigated = router.navigate(project.id, moduleId, { replace });
  if(navigated && closeDrawer){
    window.document?.getElementById?.('drawerOverlay')?.classList?.add?.('hidden');
  }
  return navigated;
}
