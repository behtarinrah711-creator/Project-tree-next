import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { generalCostApi } from '../../domain/wbs/generalCostApi.js';
import {
  WORK_TYPES,
  UNITS,
  activityIdsOf,
  isStage,
  isWork,
  lineTotal,
  wbsCodeMap,
} from '../../domain/wbs/normalize.js';
import { rollupEstimate, rollupProgress } from '../../domain/wbs/estimate.js';
import { activityRepository } from '../../data/activityRepository.js';
import {
  bindLiveTotal,
  closeWbsSheet,
  fieldRow,
  openActivitySearchPicker,
  openWbsSheet,
  renderAttachedActivities,
  selectInput,
  textInput,
} from './wbsSheet.js';
import { applyDrop, bindRowDrag } from './wbsDrag.js';
import {
  collapseAll,
  expandAll,
  isExpanded,
  seedRootLevel,
  toggleExpanded,
} from './wbsExpandState.js';

const VIEWS = [
  { id:'register', label:'ثبت' },
  { id:'estimate', label:'برآورد' },
  { id:'progress', label:'پیشرفت' },
];

let currentView = 'register';
let explicitProjectId = null;

function projectIdOf(){
  return explicitProjectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
}
function projectOf(){
  const id = projectIdOf();
  return id ? projectRepository.getActiveProject(id) : null;
}

function parentIdOf(itemId){
  const walk = (nodes, parentId = null) => {
    for(const node of nodes || []){
      if(String(node.id) === String(itemId)) return parentId;
      const hit = walk(node.subtasks, node.id);
      if(hit !== undefined) return hit;
    }
  };
  return walk(wbsApi.list(projectIdOf()), null) ?? null;
}

function handleTreeDrop({ draggedId, targetId, targetKind }){
  const projectId = projectIdOf();
  const ok = applyDrop({
    draggedId,
    targetId,
    targetKind,
    onReparentInto(id, parentId){
      return wbsApi.reparent(projectId, id, parentId);
    },
    onReorderSiblings(id, beforeId){
      return wbsApi.reparent(projectId, id, parentIdOf(beforeId), beforeId);
    },
  });
  if(ok) render();
}

function renderHomeHeader(project){
  const header = document.createElement('header');
  header.className = 'wbs-home-header';
  header.setAttribute('role', 'banner');
  const projectBtn = document.createElement('button');
  projectBtn.type = 'button';
  projectBtn.className = 'wbs-project-switch';
  projectBtn.setAttribute('aria-haspopup', 'true');
  projectBtn.setAttribute('aria-label', 'فهرست پروژه‌ها');
  projectBtn.innerHTML = `<span class="wbs-project-name">${escapeHtml(project.name || 'پروژه')}</span><span aria-hidden="true">▾</span>`;
  projectBtn.addEventListener('click', () => document.getElementById('hamburgerBtn')?.click());
  const title = document.createElement('p');
  title.className = 'wbs-app-title';
  title.textContent = 'مدیریت ساخت';
  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'wbs-avatar-btn';
  avatar.setAttribute('aria-label', 'منوی عمومی');
  avatar.textContent = '👤';
  avatar.addEventListener('click', () => document.getElementById('avatarBtn')?.click());
  header.append(projectBtn, title, avatar);
  return header;
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[ch]));
}

function openCreateStageSheet(parentId = null){
  openWbsSheet({
    title: parentId ? 'افزودن زیرمرحله' : 'افزودن مرحله',
    saveLabel: 'ذخیره',
    body(root){
      root.appendChild(fieldRow('نام مرحله', textInput('', { name:'title', placeholder:'نام مرحله' })));
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      if(!title) return false;
      wbsApi.createStage(projectIdOf(), title, parentId);
      render();
      return true;
    },
  });
}

function openCreateWorkSheet(parentId = null){
  openWbsSheet({
    title: parentId ? 'افزودن کار' : 'افزودن کار',
    saveLabel: 'ذخیره',
    body(root){
      root.appendChild(fieldRow('عنوان کار', textInput('', { name:'title', placeholder:'عنوان کار' })));
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      if(!title) return false;
      wbsApi.createWorkItem(projectIdOf(), title, parentId);
      render();
      return true;
    },
  });
}

function openAddMenu(stageId){
  openWbsSheet({
    title: 'افزودن',
    saveLabel: 'بستن',
    body(root){
      const stageBtn = document.createElement('button');
      stageBtn.type = 'button';
      stageBtn.className = 'wbs-choice';
      stageBtn.textContent = 'افزودن زیرمرحله';
      stageBtn.addEventListener('click', () => { closeWbsSheet(); openCreateStageSheet(stageId); });
      const workBtn = document.createElement('button');
      workBtn.type = 'button';
      workBtn.className = 'wbs-choice';
      workBtn.textContent = 'افزودن کار';
      workBtn.addEventListener('click', () => { closeWbsSheet(); openCreateWorkSheet(stageId); });
      root.append(stageBtn, workBtn);
    },
    onSave(){ return true; },
  });
}

function openWorkDetailSheet(item){
  const current = wbsApi.get(projectIdOf(), item.id) || item;
  openWbsSheet({
    title: 'جزئیات کار',
    saveLabel: 'ذخیره',
    body(root){
      root.appendChild(fieldRow('عنوان', textInput(current.text || '', { name:'title' })));
      root.appendChild(fieldRow('وضعیت', selectInput([
        { value:'not_started', label:'شروع نشده' },
        { value:'in_progress', label:'در حال انجام' },
        { value:'completed', label:'انجام‌شده' },
      ], current.status || (current.done ? 'completed' : 'not_started'))));
      root.lastChild.querySelector('select').name = 'status';
      root.appendChild(fieldRow('پیشرفت ٪', textInput(String(current.progress || 0), { name:'progress', type:'number' })));
      root.appendChild(fieldRow('اولویت', selectInput([
        { value:'', label:'—' },
        { value:'low', label:'کم' },
        { value:'normal', label:'عادی' },
        { value:'high', label:'زیاد' },
      ], current.priority || '')));
      root.lastChild.querySelector('select').name = 'priority';
      root.appendChild(fieldRow('نوع', selectInput(
        [{ value:'', label:'—' }, ...WORK_TYPES.map(t => ({ value:t, label:t }))],
        current.type || ''
      )));
      root.lastChild.querySelector('select').name = 'type';
      const acts = document.createElement('div');
      const paintActivities = () => {
        const latest = wbsApi.get(projectIdOf(), current.id) || current;
        const catalog = (activityRepository.list(projectIdOf()) || []).filter(item => !item.trashed);
        renderAttachedActivities(acts, {
          attached: activityIdsOf(latest),
          catalog,
          onDetach(id){
            wbsApi.detachActivity(projectIdOf(), current.id, id);
            paintActivities();
          },
          onAdd(){
            const attached = new Set(activityIdsOf(wbsApi.get(projectIdOf(), current.id) || current));
            const catalog = (activityRepository.list(projectIdOf()) || []).filter(item => !item.trashed && !attached.has(String(item.id)));
            openActivitySearchPicker(catalog, activityId => {
              wbsApi.attachActivity(projectIdOf(), current.id, activityId);
              paintActivities();
            });
          },
        });
      };
      paintActivities();
      root.appendChild(acts);
      const qty = textInput(String(current.quantity || 0), { name:'quantity', type:'number' });
      const cost = textInput(String(current.unitCost || 0), { name:'unitCost', type:'number' });
      root.appendChild(fieldRow('مقدار', qty));
      root.appendChild(fieldRow('واحد', selectInput(
        [{ value:'', label:'—' }, ...UNITS.map(u => ({ value:u, label:u }))],
        current.unit || ''
      )));
      root.lastChild.querySelector('select').name = 'unit';
      root.appendChild(fieldRow('فی', cost));
      const total = document.createElement('div');
      total.className = 'wbs-note wbs-live-total';
      root.appendChild(total);
      bindLiveTotal(qty, cost, total);
      root.appendChild(fieldRow('توضیح', textInput(current.description || '', { name:'description' })));
      const addChild = document.createElement('button');
      addChild.type = 'button';
      addChild.className = 'wbs-choice';
      addChild.textContent = 'افزودن زیرکار';
      addChild.addEventListener('click', () => { closeWbsSheet(); openCreateWorkSheet(current.id); });
      root.appendChild(addChild);
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      if(!title) return false;
      wbsApi.updateItem(projectIdOf(), current.id, {
        text: title,
        status: root.querySelector('[name="status"]').value,
        progress: Number(root.querySelector('[name="progress"]').value) || 0,
        priority: root.querySelector('[name="priority"]').value,
        type: root.querySelector('[name="type"]').value,
        quantity: Number(root.querySelector('[name="quantity"]').value) || 0,
        unit: root.querySelector('[name="unit"]').value,
        unitCost: Number(root.querySelector('[name="unitCost"]').value) || 0,
        description: root.querySelector('[name="description"]').value,
      });
      render();
      return true;
    },
  });
}

function openGeneralCreateSheet(){
  openWbsSheet({
    title: 'هزینه عمومی',
    body(root){
      root.appendChild(fieldRow('عنوان', textInput('', { name:'title', placeholder:'عنوان' })));
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      if(!title) return false;
      generalCostApi.create(projectIdOf(), title);
      render();
      return true;
    },
  });
}

function openGeneralDetailSheet(item){
  openWbsSheet({
    title: 'جزئیات هزینه عمومی',
    body(root){
      root.appendChild(fieldRow('عنوان', textInput(item.title || '', { name:'title' })));
      const qty = textInput(String(item.quantity || 0), { name:'quantity', type:'number' });
      const cost = textInput(String(item.unitCost || 0), { name:'unitCost', type:'number' });
      root.appendChild(fieldRow('مقدار', qty));
      root.appendChild(fieldRow('واحد', selectInput(
        [{ value:'', label:'—' }, ...UNITS.map(u => ({ value:u, label:u }))],
        item.unit || ''
      )));
      root.lastChild.querySelector('select').name = 'unit';
      root.appendChild(fieldRow('فی', cost));
      const total = document.createElement('div');
      total.className = 'wbs-note wbs-live-total';
      root.appendChild(total);
      bindLiveTotal(qty, cost, total);
    },
    onSave(root){
      generalCostApi.update(projectIdOf(), item.id, {
        title: root.querySelector('[name="title"]').value.trim() || item.title,
        quantity: Number(root.querySelector('[name="quantity"]').value) || 0,
        unit: root.querySelector('[name="unit"]').value,
        unitCost: Number(root.querySelector('[name="unitCost"]').value) || 0,
      });
      render();
      return true;
    },
  });
}

function renderRow(item, codes, view, depth){
  const stage = isStage(item);
  const kids = (item.subtasks || []).filter(x => !x.trashed);
  const open = isExpanded(projectIdOf(), item.id);
  const code = stage ? (codes.get(String(item.id)) || '') : '';
  const meta = [];
  if(view === 'estimate' && isWork(item)){
    meta.push(`${item.quantity || 0} ${item.unit || ''} × ${item.unitCost || 0} = ${lineTotal(item)}`);
  }
  if(view === 'estimate' && stage) meta.push(String(rollupEstimate([item])));
  if(view === 'progress'){
    meta.push(stage ? `${rollupProgress([item])}%` : `${item.progress || (item.done ? 100 : 0)}%`);
  }
  if(view === 'register' && isWork(item) && activityIdsOf(item).length){
    meta.push(`${activityIdsOf(item).length} فعالیت`);
  }
  const row = document.createElement('div');
  row.className = 'wbs-row depth-' + Math.min(6, depth) + (item.done ? ' is-done' : '') + (stage ? ' is-stage' : ' is-work');
  row.innerHTML = `
    <span class="wbs-grip" aria-hidden="true">⋮⋮</span>
    <button type="button" class="wbs-check" aria-label="وضعیت">${item.done ? '✓' : ''}</button>
    ${kids.length ? `<button type="button" class="wbs-chev" aria-label="${open?'بستن':'باز کردن'}">${open?'▾':'▸'}</button>` : '<span class="wbs-chev-spacer"></span>'}
    <button type="button" class="wbs-title">${code ? `<b>${escapeHtml(code)}</b> ` : ''}${escapeHtml(item.text || '')}</button>
    <span class="wbs-meta">${escapeHtml(meta.join(' · '))}</span>
    ${stage ? `<button type="button" class="wbs-add" aria-label="افزودن">+</button>` : ''}
  `;
  row.querySelector('.wbs-check')?.addEventListener('click', ev => {
    ev.stopPropagation();
    if(isWork(item)) wbsApi.updateItem(projectIdOf(), item.id, { done: !item.done, status: item.done ? 'not_started' : 'completed' });
    render();
  });
  row.querySelector('.wbs-chev')?.addEventListener('click', ev => {
    ev.stopPropagation();
    const key = String(item.id);
    toggleExpanded(projectIdOf(), key);
    render();
  });
  row.querySelector('.wbs-title')?.addEventListener('click', ev => {
    ev.stopPropagation();
    if(isWork(item)) openWorkDetailSheet(item);
    else openAddMenu(item.id);
  });
  row.querySelector('.wbs-add')?.addEventListener('click', ev => {
    ev.stopPropagation();
    openAddMenu(item.id);
  });
  bindRowDrag(row, {
    id: item.id,
    kind: stage ? 'stage' : 'work',
    onDrop: handleTreeDrop,
  });
  const wrap = document.createElement('div');
  wrap.className = depth === 0 ? 'wbs-card' : 'wbs-branch';
  wrap.appendChild(row);
  if(open) kids.forEach(child => wrap.appendChild(renderRow(child, codes, view, depth + 1)));
  return wrap;
}

export function renderWbsHome(target = document.getElementById('content'), projectId = null){
  if(!target) return;
  explicitProjectId = projectId || explicitProjectId;
  const project = projectOf();
  target.innerHTML = '';
  if(!project || project.archived || project.trashed){
    target.innerHTML = '<div class="workspace-no-project">برای ورود به Workspace، از منوی سه‌خطی بالای صفحه یک پروژه را انتخاب کنید.</div>';
    return;
  }

  const root = document.createElement('div');
  root.className = 'wbs-home-root';
  root.appendChild(renderHomeHeader(project));
  target.appendChild(root);

  const tabs = document.createElement('div');
  tabs.className = 'wbs-tabs';
  tabs.setAttribute('role', 'tablist');
  VIEWS.forEach(view => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wbs-tab' + (currentView === view.id ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', currentView === view.id ? 'true' : 'false');
    btn.textContent = view.label;
    btn.addEventListener('click', () => { currentView = view.id; renderWbsHome(target, project.id); });
    tabs.appendChild(btn);
  });
  root.appendChild(tabs);

  const toolbar = document.createElement('div');
  toolbar.className = 'wbs-toolbar';
  const addRoot = document.createElement('button');
  addRoot.type = 'button';
  addRoot.className = 'wbs-root-add';
  addRoot.textContent = '+ مرحله';
  addRoot.addEventListener('click', () => openCreateStageSheet(null));
  const addWork = document.createElement('button');
  addWork.type = 'button';
  addWork.className = 'wbs-root-add';
  addWork.textContent = '+ کار';
  addWork.addEventListener('click', () => openCreateWorkSheet(null));
  const expandAll = document.createElement('button');
  expandAll.type = 'button';
  expandAll.className = 'wbs-root-add';
  expandAll.textContent = 'همه باز';
  expandAll.addEventListener('click', () => {
    expandAll(project.id, project.tasks);
    renderWbsHome(target, project.id);
  });
  const collapseAll = document.createElement('button');
  collapseAll.type = 'button';
  collapseAll.className = 'wbs-root-add';
  collapseAll.textContent = 'همه بسته';
  collapseAll.addEventListener('click', () => {
    collapseAll(project.id);
    renderWbsHome(target, project.id);
  });
  toolbar.append(addRoot, addWork, expandAll, collapseAll);
  root.appendChild(toolbar);

  const tree = document.createElement('div');
  tree.className = 'wbs-tree';
  const items = (project.tasks || []).filter(x => !x.trashed);
  seedRootLevel(project.id, items);
  const codes = wbsCodeMap(items);
  if(!items.length) tree.innerHTML = '<div class="empty-state">مرحله یا کاری ثبت نشده است.</div>';
  else items.forEach(item => tree.appendChild(renderRow(item, codes, currentView, 0)));
  root.appendChild(tree);

  if(currentView === 'estimate'){
    const box = document.createElement('section');
    box.className = 'wbs-general';
    const heading = document.createElement('h3');
    heading.textContent = 'هزینه‌های عمومی';
    box.appendChild(heading);
    generalCostApi.list(project.id).forEach(item => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'wbs-general-row';
      row.textContent = `${item.title} — ${(Number(item.quantity)||0)} × ${(Number(item.unitCost)||0)}`;
      row.addEventListener('click', () => openGeneralDetailSheet(item));
      box.appendChild(row);
    });
    const addG = document.createElement('button');
    addG.type = 'button';
    addG.textContent = '+ افزودن هزینه عمومی';
    addG.addEventListener('click', openGeneralCreateSheet);
    box.appendChild(addG);
    const total = document.createElement('div');
    total.className = 'wbs-total';
    total.textContent = `جمع برآورد پروژه: ${wbsApi.estimate(project.id).projectTotal}`;
    box.appendChild(total);
    root.appendChild(box);
  }
}

export function render(){
  const content = document.getElementById('content');
  renderWbsHome(content, explicitProjectId);
}

export default { renderWbsHome };
