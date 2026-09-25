import { projectContext } from '../../core/projectContext.js';
import { renderWbsHome } from '../wbs/homeView.js';
import { WBS_VIEW_SCOPES } from '../wbs/viewScopes.js';
import { firstAllowedPlanningView } from '../roleManagement/planningAccess.js';

function projectIdOf(projectId){
  return projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
}

export default {
  id:'planning',
  title:'برنامه',
  route:'planning',
  mount({projectId}={}){
    const id=projectIdOf(projectId);
    if(id && !firstAllowedPlanningView(id)){
      globalThis.window?.KarhaApp?.router?.navigate?.(id,'dashboard',{replace:true});
      return {projectId:id,moduleId:'dashboard',denied:true};
    }
    renderWbsHome(document.getElementById('content'), id, WBS_VIEW_SCOPES.planning);
    return {projectId:id,moduleId:'planning'};
  },
};
