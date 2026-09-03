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
  progressOf,
  progressWeightOf,
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
import { bindRowDrag } from './wbsDrag.js';
import {
  advanceExpansionLevel,
  getExpansionProgress,
  getExpandedIds,
  isExpanded,
  seedCollapsed,
  toggleExpanded,
} from './wbsExpandState.js';

const VIEWS = [
  { id:'simple', label:'ساده', icon:'M160-360v-80h640v80H160Zm0 160v-80h640v80H160Zm0-320v-80h640v80H160Zm0-160v-80h640v80H160Z' },
  { id:'register', label:'ثبت', icon:'M560-80v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T903-300L683-80H560Zm300-263-37-37 37 37ZM620-140h38l121-122-18-19-19-18-122 121v38ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v120h-80v-80H520v-200H240v640h240v80H240Zm280-400Zm241 199-19-18 37 37-18-19Z' },
  { id:'estimate', label:'برآورد', icon:'M441-120v-86q-53-12-91.5-46T293-348l74-30q15 48 44.5 73t77.5 25q41 0 69.5-18.5T587-356q0-35-22-55.5T463-458q-86-27-118-64.5T313-614q0-65 42-101t86-41v-84h80v84q50 8 82.5 36.5T651-650l-74 32q-12-32-34-48t-60-16q-44 0-67 19.5T393-614q0 33 30 52t104 40q69 20 104.5 63.5T667-358q0 71-42 108t-104 46v84h-80Z' },
  { id:'progress', label:'پیشرفت', icon:'M300-520q-58 0-99-41t-41-99q0-58 41-99t99-41q58 0 99 41t41 99q0 58-41 99t-99 41Zm0-80q25 0 42.5-17.5T360-660q0-25-17.5-42.5T300-720q-25 0-42.5 17.5T240-660q0 25 17.5 42.5T300-600Zm360 440q-58 0-99-41t-41-99q0-58 41-99t99-41q58 0 99 41t41 99q0 58-41 99t-99 41Zm42.5-97.5Q720-275 720-300t-17.5-42.5Q685-360 660-360t-42.5 17.5Q600-325 600-300t17.5 42.5Q635-240 660-240t42.5-17.5ZM216-160l-56-56 584-584 56 56-584 584Z' },
];

const EXPAND_ICON = 'M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z';

function materialIcon(path){
  return `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

const SIMPLE_TYPE_CLASSES = new Map([
  ['اجرا', 'type-1'],
  ['خرید', 'type-2'],
  ['نیروی کار', 'type-3'],
  ['پیمانکار', 'type-4'],
  ['کرایه', 'type-5'],
  ['خدمات', 'type-6'],
]);

let currentView = 'simple';
let explicitProjectId = null;
let tabRenderFrame = 0;

function projectIdOf(){
  return explicitProjectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
}
function projectOf(){
  const id = projectIdOf();
  return id ? projectRepository.getActiveProject(id) : null;
}
function isPendingUiDelete(itemId){
  const pending = window.KarhaSoftDelete?.getPendingDelete?.();
  if(!pending || String(pending.pid) !== String(projectIdOf())) return false;
  if(pending.type === 'task') return String(pending.tid) === String(itemId);
  if(pending.type === 'sub') return String(pending.sid) === String(itemId);
  return false;
}
function ensureTreeState(project){
  const key = String(project?.id || '');
  if(!key) return;
  seedCollapsed(project.id);
}
function scheduleTabRender(target, projectId){
  if(tabRenderFrame) cancelAnimationFrame(tabRenderFrame);
  tabRenderFrame = requestAnimationFrame(() => {
    tabRenderFrame = 0;
    renderWbsHome(target, projectId);
  });
}

function locateUiItem(itemId){
  const project = projectOf();
  let found = null;
  const walk = (nodes, parent = null, rootId = null, path = []) => {
    for(const node of nodes || []){
      const root = rootId || node.id;
      const nextPath = [...path, node];
      if(String(node.id) === String(itemId)){
        found = { item:node, parent, rootId:root, path:nextPath };
        return true;
      }
      if(walk(node.subtasks, node, root, nextPath)) return true;
    }
    return false;
  };
  walk(project?.tasks || []);
  return found;
}

function formatMoney(value){
  const n = Number(value) || 0;
  return new Intl.NumberFormat('fa-IR').format(n) + ' تومان';
}

function formatProgress(value){
  const n = Number(value) || 0;
  return `٪${new Intl.NumberFormat('fa-IR', { useGrouping:false, maximumFractionDigits:2 }).format(n)}`;
}

function breadcrumbFor(itemId){
  const located = locateUiItem(itemId);
  if(!located) return '';
  const names = located.path.slice(0, -1).map(node => node.text).filter(Boolean);
  return names.join(' ← ');
}

function descendantSummary(stage){
  let stages = 0;
  let works = 0;
  const walk = nodes => (nodes || []).forEach(node => {
    if(!node || node.trashed) return;
    if(isStage(node)) stages += 1;
    else works += 1;
    walk(node.subtasks);
  });
  walk(stage.subtasks);
  return { stages, works };
}

function requestDelete(item){
  const located = locateUiItem(item.id);
  if(!located) return;
  const stage = isStage(item);
  const perform = () => {
    const type = located.parent ? 'sub' : 'task';
    const sid = located.parent ? item.id : null;
    const label = stage ? 'مرحله حذف شد' : 'کار حذف شد';
    const softDelete = window.KarhaSoftDelete?.softDelete;
    if(typeof softDelete !== 'function') return;
    if(softDelete(type, projectIdOf(), located.rootId, sid, label, { undo:false })){
      closeWbsSheet();
      render();
    }
  };
  const message = stage
    ? 'این مرحله و تمام زیرمجموعه‌های آن حذف شوند؟'
    : 'این کار حذف شود؟';
  if(typeof window.KarhaUI?.openConfirm === 'function'){
    window.KarhaUI.openConfirm(message, perform, 'حذف');
  }else if(window.confirm(message)){
    perform();
  }
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;',
  }[ch]));
}

function summaryHeader(root, kind, current, subtitle = ''){
  const wrap = document.createElement('div');
  wrap.className = 'wbs-detail-summary';
  const kindEl = document.createElement('div');
  kindEl.className = 'wbs-detail-kind';
  kindEl.textContent = kind;
  const title = document.createElement('div');
  title.className = 'wbs-detail-title';
  title.textContent = current.text || '';
  wrap.append(kindEl, title);
  if(subtitle){
    const trail = document.createElement('div');
    trail.className = 'wbs-detail-breadcrumb';
    trail.textContent = subtitle;
    wrap.appendChild(trail);
  }
  root.appendChild(wrap);
}

function infoRow(label, value, { action = false, danger = false, onClick = null } = {}){
  const row = document.createElement(onClick ? 'button' : 'div');
  if(onClick) row.type = 'button';
  row.className = 'wbs-info-row' + (action ? ' is-action' : '') + (danger ? ' is-danger' : '');
  const labelEl = document.createElement('span');
  labelEl.className = 'wbs-info-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'wbs-info-value';
  valueEl.textContent = value ?? '';
  row.append(labelEl, valueEl);
  if(onClick) row.addEventListener('click', onClick);
  return row;
}

function openCreateStageSheet(parentId = null){
  openWbsSheet({
    title: parentId ? 'افزودن زیرمرحله' : 'افزودن مرحله',
    saveLabel: 'ذخیره',
    body(root){
      root.appendChild(fieldRow('نام مرحله', textInput('', { name:'title', placeholder:'نام مرحله' })));
      root.appendChild(fieldRow('وزن پیشرفت', textInput('1', { name:'progressWeight', type:'number', min:'0.01', step:'0.01', required:true })));
      const note = document.createElement('div');
      note.className = 'wbs-note';
      note.textContent = 'وزن نسبی است؛ لازم نیست مجموع وزن‌ها ۱۰۰ شود.';
      root.appendChild(note);
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      const progressWeight = Number(root.querySelector('[name="progressWeight"]').value);
      if(!title || !Number.isFinite(progressWeight) || progressWeight <= 0) return false;
      wbsApi.createStage(projectIdOf(), title, parentId, { progressWeight });
      render();
      return true;
    },
  });
}

function openCreateWorkSheet(parentId = null){
  openWbsSheet({
    title: 'افزودن کار',
    saveLabel: 'ذخیره',
    body(root){
      root.appendChild(fieldRow('عنوان کار', textInput('', { name:'title', placeholder:'عنوان کار' })));
      root.appendChild(fieldRow('وزن پیشرفت', textInput('1', { name:'progressWeight', type:'number', min:'0.01', step:'0.01', required:true })));
      const note = document.createElement('div');
      note.className = 'wbs-note';
      note.textContent = 'وزن نسبی است؛ لازم نیست مجموع وزن‌ها ۱۰۰ شود.';
      root.appendChild(note);
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      const progressWeight = Number(root.querySelector('[name="progressWeight"]').value);
      if(!title || !Number.isFinite(progressWeight) || progressWeight <= 0) return false;
      wbsApi.createWorkItem(projectIdOf(), title, parentId, { progressWeight });
      render();
      return true;
    },
  });
}

function openAddMenu(stageId){
  const stage = wbsApi.get(projectIdOf(), stageId);
  const childKinds = new Set((stage?.subtasks || []).filter(item => !item.trashed).map(item => isStage(item) ? 'stage' : 'work'));
  const mayAddStage = childKinds.size === 0 || (childKinds.size === 1 && childKinds.has('stage'));
  const mayAddWork = childKinds.size === 0 || (childKinds.size === 1 && childKinds.has('work'));
  openWbsSheet({
    title: 'افزودن',
    saveLabel: 'بستن',
    body(root){
      if(mayAddStage){
        const stageBtn = document.createElement('button');
        stageBtn.type = 'button';
        stageBtn.className = 'wbs-choice';
        stageBtn.textContent = 'افزودن زیرمرحله';
        stageBtn.addEventListener('click', () => { closeWbsSheet(); openCreateStageSheet(stageId); });
        root.appendChild(stageBtn);
      }
      if(mayAddWork){
        const workBtn = document.createElement('button');
        workBtn.type = 'button';
        workBtn.className = 'wbs-choice';
        workBtn.textContent = 'افزودن کار';
        workBtn.addEventListener('click', () => { closeWbsSheet(); openCreateWorkSheet(stageId); });
        root.appendChild(workBtn);
      }
      if(!mayAddStage && !mayAddWork){
        const note = document.createElement('div');
        note.className = 'wbs-note';
        note.textContent = 'این مرحله داده‌های ترکیبی قدیمی دارد؛ ابتدا ساختار آن را اصلاح کنید.';
        root.appendChild(note);
      }
    },
    onSave(){ return true; },
  });
}

function openStageEditSheet(item){
  const current = wbsApi.get(projectIdOf(), item.id) || item;
  openWbsSheet({
    title: 'ویرایش مرحله',
    saveLabel: 'ذخیره',
    body(root){
      root.appendChild(fieldRow('نام مرحله', textInput(current.text || '', { name:'title' })));
      root.appendChild(fieldRow('وزن پیشرفت', textInput(String(progressWeightOf(current)), { name:'progressWeight', type:'number', min:'0.01', step:'0.01', required:true })));
      root.appendChild(fieldRow('توضیحات', textInput(current.description || '', { name:'description' })));
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      const progressWeight = Number(root.querySelector('[name="progressWeight"]').value);
      if(!title || !Number.isFinite(progressWeight) || progressWeight <= 0) return false;
      wbsApi.updateItem(projectIdOf(), current.id, {
        text:title,
        progressWeight,
        description:root.querySelector('[name="description"]').value,
      });
      render();
      return true;
    },
  });
}

function openStageDetailSheet(item){
  const current = wbsApi.get(projectIdOf(), item.id) || item;
  const summary = descendantSummary(current);
  openWbsSheet({
    title: 'جزئیات مرحله',
    saveLabel: 'بستن',
    body(root){
      summaryHeader(root, 'مرحله', current, breadcrumbFor(current.id));
      const metrics = document.createElement('div');
      metrics.className = 'wbs-stage-metrics';
      metrics.innerHTML = `
        <div><b>${summary.stages}</b><span>زیرمرحله</span></div>
        <div><b>${summary.works}</b><span>کار</span></div>
        <div><b>${escapeHtml(formatMoney(rollupEstimate([current])))}</b><span>برآورد</span></div>
      `;
      root.appendChild(metrics);

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'wbs-primary-action';
      add.textContent = '+ افزودن';
      add.addEventListener('click', () => { closeWbsSheet(); openAddMenu(current.id); });
      root.appendChild(add);

      const section = document.createElement('div');
      section.className = 'wbs-info-section';
      section.appendChild(infoRow('توضیحات', current.description || 'بدون توضیح'));
      section.appendChild(infoRow('ویرایش مرحله', '›', { action:true, onClick:()=>{ closeWbsSheet(); openStageEditSheet(current); } }));
      section.appendChild(infoRow('جابجایی مرحله', 'از دستگیره فهرست', { action:true, onClick:()=>closeWbsSheet() }));
      section.appendChild(infoRow('حذف مرحله', 'حذف', { action:true, danger:true, onClick:()=>requestDelete(current) }));
      root.appendChild(section);
    },
    onSave(){ return true; },
  });
}

function openWorkEditSheet(item){
  const current = wbsApi.get(projectIdOf(), item.id) || item;
  openWbsSheet({
    title: 'ویرایش کار',
    saveLabel: 'ذخیره',
    body(root){
      root.appendChild(fieldRow('عنوان', textInput(current.text || '', { name:'title' })));
      root.appendChild(fieldRow('پیشرفت ٪', textInput(String(progressOf(current)), { name:'progress', type:'number', min:'0', max:'100', step:'1' })));
      root.appendChild(fieldRow('وزن پیشرفت', textInput(String(progressWeightOf(current)), { name:'progressWeight', type:'number', min:'0.01', step:'0.01', required:true })));
      const progressNote = document.createElement('div');
      progressNote.className = 'wbs-note';
      progressNote.textContent = 'وضعیت از درصد ساخته می‌شود؛ وزن نسبی است و لازم نیست مجموع وزن‌ها ۱۰۰ شود.';
      root.appendChild(progressNote);
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
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      const progressWeight = Number(root.querySelector('[name="progressWeight"]').value);
      if(!title || !Number.isFinite(progressWeight) || progressWeight <= 0) return false;
      wbsApi.updateItem(projectIdOf(), current.id, {
        text: title,
        progress: Number(root.querySelector('[name="progress"]').value) || 0,
        progressWeight,
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

function openWorkDetailSheet(item){
  const current = wbsApi.get(projectIdOf(), item.id) || item;
  const activities = activityIdsOf(current);
  openWbsSheet({
    title: 'جزئیات کار',
    saveLabel: 'بستن',
    body(root){
      summaryHeader(root, 'کار', current, breadcrumbFor(current.id));

      const total = document.createElement('div');
      total.className = 'wbs-work-total';
      total.innerHTML = `<span>هزینه کل</span><b>${escapeHtml(formatMoney(lineTotal(current)))}</b>`;
      root.appendChild(total);

      const section = document.createElement('div');
      section.className = 'wbs-info-section';
      section.appendChild(infoRow('مقدار', new Intl.NumberFormat('fa-IR').format(Number(current.quantity) || 0)));
      section.appendChild(infoRow('واحد', current.unit || '—'));
      section.appendChild(infoRow('فی', formatMoney(current.unitCost || 0)));
      section.appendChild(infoRow('فعالیت‌ها', `${activities.length}  ›`, { action:true, onClick:()=>{ closeWbsSheet(); openWorkEditSheet(current); } }));
      section.appendChild(infoRow('توضیحات', current.description || 'بدون توضیح'));
      root.appendChild(section);

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'wbs-primary-action is-secondary';
      edit.textContent = 'ویرایش اطلاعات کار';
      edit.addEventListener('click', () => { closeWbsSheet(); openWorkEditSheet(current); });
      root.appendChild(edit);

      const actions = document.createElement('div');
      actions.className = 'wbs-info-section';
      actions.appendChild(infoRow('جابجایی کار', 'از دستگیره فهرست', { action:true, onClick:()=>closeWbsSheet() }));
      actions.appendChild(infoRow('حذف کار', 'حذف', { action:true, danger:true, onClick:()=>requestDelete(current) }));
      root.appendChild(actions);
    },
    onSave(){ return true; },
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

function renderSimpleRow(item, depth){
  const stage = isStage(item);
  const displayedProgress = stage ? rollupProgress([item]) : progressOf(item);
  const checked = displayedProgress === 100;
  const kids = (item.subtasks || []).filter(x => !x.trashed && !isPendingUiDelete(x.id));
  const open = !stage || isExpanded(projectIdOf(), item.id);
  const rawType = isWork(item) && WORK_TYPES.includes(item.type) ? item.type : '';
  const chipLabel = rawType || '؟';
  const chipClass = rawType ? (SIMPLE_TYPE_CLASSES.get(rawType) || 'type-7') : 'type-7';
  const row = document.createElement('div');
  row.className = 'wbs-simple-row depth-' + Math.min(6, depth) + (checked ? ' is-done' : '') + (stage ? ' is-stage' : ' is-work');
  row.innerHTML = `
    <button type="button" class="wbs-check" aria-label="${stage ? 'پیشرفت محاسبه‌شده مرحله' : 'وضعیت'}" ${stage ? 'disabled' : ''}>${checked ? '✓' : ''}</button>
    <button type="button" class="wbs-simple-title">
      ${stage ? '' : `<span class="wbs-type-chip ${chipClass}">${escapeHtml(chipLabel)}</span>`}
      <span class="wbs-simple-title-text">${escapeHtml(item.text || '')}</span>
    </button>
  `;
  row.querySelector('.wbs-check')?.addEventListener('click', ev => {
    ev.stopPropagation();
    if(isWork(item)) wbsApi.updateItem(projectIdOf(), item.id, { progress: checked ? 0 : 100 });
    render();
  });
  row.querySelector('.wbs-simple-title')?.addEventListener('click', ev => {
    ev.stopPropagation();
    if(isWork(item)) openWorkDetailSheet(item);
    else openStageDetailSheet(item);
  });
  const wrap = document.createElement('div');
  wrap.className = depth === 0 ? 'wbs-card wbs-simple-card' : 'wbs-branch wbs-simple-branch';
  wrap.appendChild(row);
  if(open) kids.forEach(child => wrap.appendChild(renderSimpleRow(child, depth + 1)));
  return wrap;
}

function renderRow(item, codes, view, depth){
  const stage = isStage(item);
  const displayedProgress = stage ? rollupProgress([item]) : progressOf(item);
  const checked = displayedProgress === 100;
  const kids = (item.subtasks || []).filter(x => !x.trashed && !isPendingUiDelete(x.id));
  const open = isExpanded(projectIdOf(), item.id);
  const code = stage ? (codes.get(String(item.id)) || '') : '';
  const rawType = isWork(item) && WORK_TYPES.includes(item.type) ? item.type : '';
  const chipLabel = rawType || '؟';
  const chipClass = rawType ? (SIMPLE_TYPE_CLASSES.get(rawType) || 'type-7') : 'type-7';
  const readOnlyView = view === 'estimate' || view === 'progress';
  const meta = [];
  if(view === 'estimate' && isWork(item)){
    meta.push(new Intl.NumberFormat('fa-IR').format(lineTotal(item)));
  }
  if(view === 'estimate' && stage) meta.push(new Intl.NumberFormat('fa-IR').format(rollupEstimate([item])));
  if(view === 'progress'){
    meta.push(formatProgress(displayedProgress));
  }
  if(view === 'register' && isWork(item) && activityIdsOf(item).length){
    meta.push(`${activityIdsOf(item).length} فعالیت`);
  }
  const row = document.createElement('div');
  row.className = 'wbs-row depth-' + Math.min(6, depth) + (checked ? ' is-done' : '') + (stage ? ' is-stage' : ' is-work');
  row.innerHTML = `
    ${readOnlyView ? '' : '<span class="wbs-grip" aria-hidden="true">⋮⋮</span>'}
    <button type="button" class="wbs-check" aria-label="${stage ? 'پیشرفت محاسبه‌شده مرحله' : 'وضعیت'}" ${stage ? 'disabled' : ''}>${checked ? '✓' : ''}</button>
    ${kids.length ? `<button type="button" class="wbs-chev" aria-label="${open?'بستن':'باز کردن'}">${open?'▾':'▸'}</button>` : '<span class="wbs-chev-spacer"></span>'}
    <button type="button" class="wbs-title">
      ${stage ? '' : `<span class="wbs-type-chip ${chipClass}">${escapeHtml(chipLabel)}</span>`}
      ${code ? `<b>${escapeHtml(code)}</b>` : ''}
      <span class="wbs-title-text">${escapeHtml(item.text || '')}</span>
    </button>
    <span class="wbs-meta${view === 'estimate' ? ' is-estimate' : ''}${view === 'progress' ? ' is-progress' : ''}">${escapeHtml(meta.join(' · '))}</span>
    ${stage && !readOnlyView ? `<button type="button" class="wbs-add" aria-label="افزودن">+</button>` : ''}
  `;
  row.querySelector('.wbs-check')?.addEventListener('click', ev => {
    ev.stopPropagation();
    if(isWork(item)) wbsApi.updateItem(projectIdOf(), item.id, { progress: checked ? 0 : 100 });
    render();
  });
  row.querySelector('.wbs-chev')?.addEventListener('click', ev => {
    ev.stopPropagation();
    toggleExpanded(projectIdOf(), String(item.id));
    render();
  });
  row.querySelector('.wbs-title')?.addEventListener('click', ev => {
    ev.stopPropagation();
    if(isWork(item)) openWorkDetailSheet(item);
    else openStageDetailSheet(item);
  });
  row.querySelector('.wbs-add')?.addEventListener('click', ev => {
    ev.stopPropagation();
    openAddMenu(item.id);
  });
  const wrap = document.createElement('div');
  wrap.className = depth === 0 ? 'wbs-card' : 'wbs-branch';
  wrap.appendChild(row);
  if(!readOnlyView){
    bindRowDrag(row, {
      id:item.id,
      onReorder(orderedIds){
        const located = locateUiItem(item.id);
        if(!located) return;
        if(wbsApi.reorder(projectIdOf(), located.rootId, orderedIds, located.parent?.id || null)) render();
      },
    });
  }
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
  ensureTreeState(project);

  const root = document.createElement('div');
  root.className = 'wbs-home-root' + (currentView === 'simple' ? ' is-simple-view' : '');
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
    btn.setAttribute('aria-label', view.label);
    btn.title = view.label;
    btn.innerHTML = materialIcon(view.icon);
    btn.addEventListener('click', () => {
      if(currentView === view.id) return;
      currentView = view.id;
      scheduleTabRender(target, project.id);
    });
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

  const treeToggle = document.createElement('button');
  const isTreeOpen = getExpandedIds(project.id).size > 0;
  const expansionProgress = getExpansionProgress(project.id, project.tasks || []);
  treeToggle.type = 'button';
  treeToggle.className = 'wbs-tree-toggle' + (isTreeOpen ? ' is-active' : '') + (expansionProgress.ratio >= .5 ? ' is-past-midpoint' : '');
  treeToggle.setAttribute('aria-label', 'تغییر سطح نمایش نمودار');
  treeToggle.setAttribute('aria-pressed', isTreeOpen ? 'true' : 'false');
  treeToggle.dataset.expandedLevels = String(expansionProgress.expandedLevels);
  treeToggle.dataset.totalLevels = String(expansionProgress.totalLevels);
  treeToggle.innerHTML = `<svg class="wbs-expand-shade" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="1" height="1" fill="currentColor" opacity="${expansionProgress.ratio}"/></svg>${materialIcon(EXPAND_ICON)}`;
  treeToggle.addEventListener('click', () => {
    advanceExpansionLevel(project.id, project.tasks || []);
    renderWbsHome(target, project.id);
  });
  toolbar.append(addRoot, treeToggle);
  root.appendChild(toolbar);

  const tree = document.createElement('div');
  tree.className = 'wbs-tree';
  const items = (project.tasks || []).filter(x => !x.trashed && !isPendingUiDelete(x.id));
  const simple = currentView === 'simple';
  const codes = simple ? new Map() : wbsCodeMap(items);
  if(!items.length) tree.innerHTML = '<div class="empty-state">مرحله یا کاری ثبت نشده است.</div>';
  else items.forEach(item => tree.appendChild(simple ? renderSimpleRow(item, 0) : renderRow(item, codes, currentView, 0)));
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
      const amount = (Number(item.quantity) || 0) * (Number(item.unitCost) || 0);
      row.innerHTML = `<span>${escapeHtml(item.title || '')}</span><span class="wbs-general-amount">${escapeHtml(new Intl.NumberFormat('fa-IR').format(amount))}</span>`;
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
    total.textContent = `جمع برآورد پروژه: ${new Intl.NumberFormat('fa-IR').format(wbsApi.estimate(project.id).projectTotal)}`;
    box.appendChild(total);
    root.appendChild(box);
  }
}

export function render(){
  const content = document.getElementById('content');
  renderWbsHome(content, explicitProjectId);
}

export default { renderWbsHome };
