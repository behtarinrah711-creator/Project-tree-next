import { projectRepository } from '../../data/projectRepository.js';
import { projectContext } from '../../core/projectContext.js';

function activeProjectId(explicitProjectId){
  return explicitProjectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
}

function getProjects(){
  return projectRepository.getProjectsList();
}

function saveProjects(projects){
  return projectRepository.saveProjectsList(projects);
}

function findProject(projectId){
  const id=String(projectId ?? '');
  return getProjects().find(p => String(p.id ?? p.projectId ?? '') === id) || null;
}

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

export const statusesModule = {
  id:'statuses',
  name:'وضعیت‌ها',

  render(container, projectId = activeProjectId()){
    if(!container) return;
    const project=findProject(projectId);
    if(!project){
      container.innerHTML='<div class="card p-4 text-center text-muted">پروژه‌ای انتخاب نشده است یا یافت نشد.</div>';
      return;
    }
    container.innerHTML=this.renderShell(project);
    this.bind(container, project.id ?? project.projectId);
  },

  renderShell(project){
    const statuses=Array.isArray(project.statuses) ? project.statuses : [];
    return `
      <div class="statuses-module" data-project-id="${escapeHtml(project.id ?? project.projectId ?? '')}">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div><h5 class="mb-1">مدیریت وضعیت‌های پروژه</h5>
          <small class="text-muted">پروژه: ${escapeHtml(project.title || project.name || 'بدون نام')}</small></div>
          <button type="button" class="btn btn-primary btn-sm" data-status-action="add">افزودن وضعیت جدید</button>
        </div>
        <div class="statuses-list">${this.renderList(statuses)}</div>
        <div class="status-modal-host"></div>
      </div>`;
  },

  renderList(statuses){
    if(!statuses.length) return '<div class="text-center text-muted py-5 border rounded bg-light">هیچ وضعیتی برای این پروژه ثبت نشده است.</div>';
    return `<div class="list-group shadow-sm">${statuses.map(s=>`
      <div class="list-group-item d-flex justify-content-between align-items-center p-3">
        <span>${escapeHtml(s.title || s.name || '')}</span>
        <span class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-primary" data-status-action="edit" data-id="${escapeHtml(s.id)}">ویرایش</button>
          <button type="button" class="btn btn-outline-danger" data-status-action="delete" data-id="${escapeHtml(s.id)}">حذف</button>
        </span>
      </div>`).join('')}</div>`;
  },

  bind(container, projectId){
    container.onclick=(event)=>{
      const button=event.target.closest('[data-status-action]');
      if(!button) return;
      const action=button.dataset.statusAction;
      const id=button.dataset.id;
      if(action==='add') this.openModal(container,projectId,null);
      if(action==='edit') this.openModal(container,projectId,id);
      if(action==='delete') this.remove(projectId,id,container);
    };
  },

  openModal(container, projectId, statusId){
    const project=findProject(projectId);
    if(!project) return;
    const current=(project.statuses||[]).find(s=>String(s.id)===String(statusId));
    const title=current?.title || current?.name || '';
    const type=current?.type || 'info';
    const host=container.querySelector('.status-modal-host');
    host.innerHTML=`<div class="card p-3 mt-3">
      <h6>${statusId?'ویرایش وضعیت':'افزودن وضعیت'}</h6>
      <input class="form-control mb-2" data-status-field="title" value="${escapeHtml(title)}" placeholder="عنوان وضعیت">
      <select class="form-select mb-2" data-status-field="type">
        ${['info','warning','success','danger','secondary'].map(v=>`<option value="${v}" ${v===type?'selected':''}>${v}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-primary btn-sm" data-status-action="save" data-id="${escapeHtml(statusId||'')}">ذخیره</button>
      <button type="button" class="btn btn-secondary btn-sm" data-status-action="cancel">انصراف</button>
    </div>`;
    const save=host.querySelector('[data-status-action="save"]');
    save.onclick=()=>{
      const title=host.querySelector('[data-status-field="title"]').value.trim();
      const typeValue=host.querySelector('[data-status-field="type"]').value;
      if(!title){ alert('لطفاً عنوان وضعیت را وارد کنید.'); return; }
      this.save(projectId,{id:save.dataset.id,title,type:typeValue});
      this.render(container,projectId);
    };
    host.querySelector('[data-status-action="cancel"]').onclick=()=>{host.innerHTML='';};
  },

  save(projectId,data){
    const projects=getProjects();
    const project=projects.find(p=>String(p.id??p.projectId)===String(projectId));
    if(!project) return false;
    if(!Array.isArray(project.statuses)) project.statuses=[];
    if(data.id){
      const index=project.statuses.findIndex(s=>String(s.id)===String(data.id));
      if(index<0) return false;
      project.statuses[index]={...project.statuses[index],title:data.title,type:data.type};
    }else{
      project.statuses.push({id:'st_'+Date.now(),title:data.title,type:data.type});
    }
    saveProjects(projects);
    return true;
  },

  remove(projectId,statusId,container){
    if(!confirm('آیا از حذف این وضعیت اطمینان دارید؟')) return;
    const projects=getProjects();
    const project=projects.find(p=>String(p.id??p.projectId)===String(projectId));
    if(!project) return;
    project.statuses=(project.statuses||[]).filter(s=>String(s.id)!==String(statusId));
    saveProjects(projects);
    this.render(container,projectId);
  }
};
