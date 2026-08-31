import { contractApi } from '../../domain/contractApi.js';
import { projectContext } from '../../core/projectContext.js';

function activeId(projectId = null){
  return projectId || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
}

/** Thin adapter: template writes go through contractApi only. */
export function saveContractTemplate(projectId, template, activityName = ''){
  const id = activeId(projectId);
  if(!id || !template) return false;
  const result = contractApi.saveTemplate(id, template, activityName);
  return result.ok ? result.template : false;
}

export function deleteContractTemplate(projectId, templateId){
  const id = activeId(projectId);
  if(!id || !templateId) return false;
  return contractApi.trashTemplate(id, templateId).ok;
}
