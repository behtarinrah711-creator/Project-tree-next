/**
 * Phase 4.2/4.3 — single path: merged cloud/local project → ProjectRepository.
 * Callers (legacy cloud listeners) must use this instead of ad-hoc setItem.
 * Does not own Auth or Firebase listeners.
 */

import { projectRepository } from '../data/projectRepository.js';

/**
 * Persist one merged project into the repository source of truth.
 * @param {object} project
 * @returns {object|null} stored project
 */
export function applyCloudSnapshot(project){
  if(!project || project.id == null) return null;
  const id = project.id;
  const existing = projectRepository.find(id);
  if(existing){
    return projectRepository.updateProject(id, () => ({ ...existing, ...project, id }));
  }
  const list = projectRepository.getProjectsList();
  list.push({ ...project, id });
  projectRepository.saveProjectsList(list);
  return projectRepository.find(id);
}

/**
 * Replace/merge multiple projects from a cloud merge pass.
 * Keeps projects not present in incoming only if keepMissing is true.
 */
export function applyCloudProjectList(projects, { keepMissing = true } = {}){
  const incoming = Array.isArray(projects) ? projects.filter(p => p && p.id != null) : [];
  if(!keepMissing){
    projectRepository.saveProjectsList(incoming);
    return incoming;
  }
  const byId = new Map(projectRepository.getProjectsList().map(p => [String(p.id ?? p.projectId), p]));
  incoming.forEach(p => {
    const key = String(p.id);
    byId.set(key, { ...(byId.get(key) || {}), ...p, id: p.id });
  });
  const next = Array.from(byId.values());
  projectRepository.saveProjectsList(next);
  return next;
}
