import { projectContext } from '../../core/projectContext.js';
import { renderWbsHome } from '../wbs/homeView.js';

function projectIdOf(projectId){
  return projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
}

export default {
  id:'planning',
  title:'برنامه',
  route:'planning',
  mount({projectId}={}){
    const id=projectIdOf(projectId);
    renderWbsHome(document.getElementById('content'), id, {
      views:['tree','timeline','costline'],
      defaultView:'tree',
    });
    return {projectId:id,moduleId:'planning'};
  },
};
