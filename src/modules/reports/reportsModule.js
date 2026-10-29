import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { renderDelayView } from '../wbs/delayView.js';
import { renderDoneWorks } from './doneWorksView.js';
import { openProjectFinishSheet } from '../wbs/homeView.js';

export const REPORT_SECTIONS = Object.freeze([
  { id:'contracts', title:'قرارداد پیمانکاران', meta:'ایجاد و مدیریت قراردادهای واقعی پیمانکاران' },
  { id:'done-works', title:'کارهای انجام‌شده', meta:'مشاهده گزارش کارهای تکمیل‌شده پروژه' },
  { id:'work-delays', title:'دیرکردها', meta:'مشاهده کارهای عقب‌افتاده پروژه' },
]);

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
    this.render(projectId, 'reports');
    return { projectId: getProjectId(projectId), moduleId: 'reports' };
  },

  render(projectId = null, viewId = window.KarhaRoute?.moduleId || 'reports'){
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

    if(viewId === 'work-delays'){
      body.appendChild(renderDelayView(project, document, openProjectFinishSheet));
      return;
    }
    if(viewId === 'done-works'){
      body.appendChild(renderDoneWorks(project, document, () => this.render(activeProjectId, viewId)));
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'workspace-option-list';

    REPORT_SECTIONS.forEach(section => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'workspace-option';
      row.innerHTML = `
        <span class="workspace-option-main">
          <span class="workspace-option-title">${section.title}</span>
          <span class="workspace-option-meta">${section.meta}</span>
        </span>
        <span class="workspace-option-arrow"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></span>
      `;

      row.addEventListener('click', () => {
        if(!window.KarhaApp?.projectWorkspace?.selectProject?.(activeProjectId,{moduleId:section.id}))
          goToProjectModule(activeProjectId, section.id);
      });

      wrap.appendChild(row);
    });
    body.appendChild(wrap);
  },
};

export const reportSectionModules = REPORT_SECTIONS.filter(section => section.id !== 'contracts').map(section => ({
  id: section.id,
  title: section.title,
  route: section.id,
  mount({ projectId } = {}){
    reportsModule.render(projectId, section.id);
    return { projectId: getProjectId(projectId), moduleId: section.id };
  },
}));

export default reportsModule;
