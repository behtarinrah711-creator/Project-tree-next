import { projectContext } from './projectContext.js';
import { projectRepository } from '../data/projectRepository.js';

export function getActiveProjectId(){
  return projectContext.getProjectId() || null;
}

export function getActiveProject(){
  const projectId = getActiveProjectId();
  return projectId ? projectRepository.getActiveProject(projectId) : null;
}

export function getActiveProjectCollection(collection){
  const projectId = getActiveProjectId();
  return projectId ? projectRepository.scoped(projectId, collection) : [];
}

export function requireActiveProject(){
  const project = getActiveProject();
  if(!project) throw new Error('No active project is selected');
  return project;
}
