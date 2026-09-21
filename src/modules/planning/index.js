import { projectContext } from '../../core/projectContext.js';
import { renderWbsHome } from '../wbs/homeView.js';
import { WBS_VIEW_SCOPES } from '../wbs/viewScopes.js';

function projectIdOf(projectId){
  return projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
}

export default {
  id:'planning',
  title:'برنامه',
  route:'planning',
  mount({projectId}={}){
    const id=projectIdOf(projectId);
    renderWbsHome(document.getElementById('content'), id, WBS_VIEW_SCOPES.planning);
    return {projectId:id,moduleId:'planning'};
  },
};
