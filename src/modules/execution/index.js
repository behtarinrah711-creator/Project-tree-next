import { projectContext } from '../../core/projectContext.js';
import { renderWbsHome } from '../wbs/homeView.js';
import { WBS_VIEW_SCOPES } from '../wbs/viewScopes.js';

function projectIdOf(projectId){
  return projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
}

export default {
  id:'execution',
  title:'اجرا',
  route:'execution',
  mount({projectId}={}){
    const id=projectIdOf(projectId);
    renderWbsHome(document.getElementById('content'), id, WBS_VIEW_SCOPES.execution);
    return {projectId:id,moduleId:'execution'};
  },
};
