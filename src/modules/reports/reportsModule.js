import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';

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

    // At the current stage of the application, Reports contains exactly
    // one report/work item: contractor contracts. Do not invent additional
    // report categories until they are actually introduced into the product.
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
