import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';

function activeProjectId(explicit=null){
  return explicit || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
}

function projectFor(id){
  return id ? projectRepository.getActiveProject(id) : null;
}

export function getContractPersistenceContext(projectId=null){
  const id=activeProjectId(projectId);
  const project=projectFor(id);
  return { projectId:id, project };
}

/*
 * Contract forms are still rendered by the existing UI in this migration step.
 * This module owns the project-scoped persistence boundary so the next form
 * migration can depend on a stable repository contract instead of legacy storage.
 */
export function saveProjectContracts(projects){
  return projectRepository.saveProjectsList(projects);
}

export function updateProjectCollection(projectId, key, updater){
  const projects=projectRepository.getProjectsList();
  const p=projects.find(x=>String(x.id ?? x.projectId)===String(projectId));
  if(!p) return false;
  const current=Array.isArray(p[key]) ? p[key] : [];
  p[key]=updater(current, p);
  projectRepository.saveProjectsList(projects);
  return true;
}
