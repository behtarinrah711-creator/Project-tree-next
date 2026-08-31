import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { renderWbsHome } from '../wbs/homeView.js';

function getProjectId(explicitProjectId=null){
  return explicitProjectId || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
}
function getProject(projectId=null){
  const id=getProjectId(projectId);
  if(!id) return null;
  return projectRepository.getActiveProject(id);
}

export const dashboardModule={
  id:'dashboard',
  title:'داشبورد پروژه',
  route:'projects',

  mount({projectId}={}){
    this.render(projectId);
    return {projectId:getProjectId(projectId),moduleId:'dashboard'};
  },

  render(projectId=null){
    const content=document.getElementById('content');
    if(!content)return;
    const p=getProject(projectId);
    if(!p || p.archived || p.trashed){
      content.innerHTML='<div class="workspace-no-project">برای ورود به Workspace، از منوی سه‌خطی بالای صفحه یک پروژه را انتخاب کنید. تب «پروژه‌ها» فقط محتوای کاری پروژه فعال را نمایش می‌دهد.</div>';
      return;
    }
    renderWbsHome(content, p.id);
  },
};

export default dashboardModule;
