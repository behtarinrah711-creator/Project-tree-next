import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { renderDelayView, DELAY_ICON } from '../wbs/delayView.js';
import { openProjectFinishSheet } from '../wbs/homeView.js';

const REPORT_ICON = 'M160-120v-80h640v80H160Zm40-160q-33 0-56.5-23.5T120-360v-400q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v400q0 33-23.5 56.5T760-280H200Zm0-80h560v-400H200v400Zm80-80h80v-160h-80v160Zm160 0h80v-280h-80v280Zm160 0h80v-80h-80v80Z';
let activeReportView = 'reports';

function icon(path){ return `<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${path}"/></svg>`; }

function getProjectId(explicitProjectId = null){
  return explicitProjectId
    || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.()
    || null;
}

function getActiveProject(explicitProjectId = null){
  const projectId = getProjectId(explicitProjectId);
  return projectId ? projectRepository.getActiveProject(projectId) : null;
}

function goToProjectModule(projectId, moduleId){
  if(!projectId) return;
  window.location.hash =
    `#/projects/${encodeURIComponent(String(projectId))}/${encodeURIComponent(moduleId)}`;
}

export const reportsModule = {
  id: 'reports',
  title: 'گزارش‌ها',
  route: 'reports',

  mount({ projectId } = {}){
    this.render(projectId);
    return { projectId: getProjectId(projectId), moduleId: 'reports' };
  },

  render(projectId = null){
    const body = document.getElementById('reportsPageBody');
    if(!body) return;

    body.innerHTML = '';

    const activeProjectId = getProjectId(projectId);
    const project = getActiveProject(activeProjectId);

    // Reports is project-scoped. No project means no report data.
    if(!project){
      body.innerHTML =
        '<div class="mgmt-empty">برای نمایش گزارش، یک پروژه را انتخاب کنید.</div>';
      return;
    }

    const tabs=document.createElement('div');
    tabs.className='wbs-tabs reports-workspace-tabs';
    tabs.setAttribute('role','tablist');
    [
      {id:'reports',label:'گزارش‌ها',icon:REPORT_ICON},
      {id:'delay',label:'تأخیرات',icon:DELAY_ICON},
    ].forEach(view=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='wbs-tab'+(activeReportView===view.id?' active':'');
      button.setAttribute('role','tab');
      button.setAttribute('aria-selected',activeReportView===view.id?'true':'false');
      button.setAttribute('aria-label',view.label);
      button.title=view.label;
      button.innerHTML=icon(view.icon);
      button.addEventListener('click',()=>{ activeReportView=view.id; this.render(activeProjectId); });
      tabs.appendChild(button);
    });
    body.appendChild(tabs);

    if(activeReportView === 'delay'){
      body.appendChild(renderDelayView(project, document, openProjectFinishSheet));
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'workspace-option-list';

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'workspace-option';
    row.innerHTML = `
      <span class="workspace-option-main">
        <span class="workspace-option-title">قرارداد پیمانکاران</span>
        <span class="workspace-option-meta">ایجاد و مدیریت قراردادهای واقعی پیمانکاران</span>
      </span>
      <span class="workspace-option-arrow">›</span>
    `;

    row.addEventListener('click', () => {
      if(!window.KarhaApp?.projectWorkspace?.selectProject?.(activeProjectId,{moduleId:'contracts'}))
        goToProjectModule(activeProjectId, 'contracts');
    });

    wrap.appendChild(row);
    body.appendChild(wrap);
  },
};

export default reportsModule;
