import { openStageMilestoneSheet, stageMilestoneDiamond } from './stageMilestoneSheet.js';
import { stageMilestones } from '../../domain/wbs/stageMilestones.js';
import { captureGanttScroll, restoreGanttScroll } from './timelineStickyHeader.js';
import {createExportButton} from './viewHeader.js';
import {openProjectTreeExport} from './projectTreeExportView.js';
import {requestPlanningItemDelete} from './planningItemDelete.js';
import { canWriteProjectModule, projectPermissionState } from '../roleManagement/permissionState.js';
import { openExecutionBranchFilter, selectableWbsTree } from './executionBranchFilter.js';
import { buildTimelineRows, timelineByElement } from './timelineRows.js';
import { openWorkCreationSheet } from './workCreationSheet.js';
import { openStageEditSheet as openStageEditor } from './stageEditSheet.js';
import { stageCreationPlaceholder } from '../../domain/wbs/stagePresentation.js';
import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { stageAddKinds, stageModeOf } from '../../domain/wbs/branchingPolicy.js';
import { generalCostApi } from '../../domain/wbs/generalCostApi.js';
import {
  UNITS,
  activityIdsOf,
  canHoldWorkTasks,
  isStage,
  isWork,
  lineTotal,
  progressOf,
  progressWeightOf,
  scheduleEndOf,
  scheduleStartOf,
  wbsCodeMap,
} from '../../domain/wbs/normalize.js';
import { formatJalaliDisplay, gregorianToJalali, jalaliToGregorian } from '../../ui/jalali.js';
import { rollupEstimate, rollupProgress } from '../../domain/wbs/estimate.js';
import {
  bindLiveTotal,
  closeWbsSheet,
  fieldRow,
  openWbsSheet,
  selectInput,
  textInput,
} from './wbsSheet.js';
import { bindRowDrag } from './wbsDrag.js';
import { renderCostline } from './costlineView.js';
import { SHOPPING_ICON, renderShoppingView } from './shoppingView.js';
import { TODAY_ICON, renderTodayView } from './todayView.js';
import { DELAY_ICON, renderDelayView } from './delayView.js';
import { DEFAULT_TREE_MODE, createTreeModeTabs } from './treeModes.js';
import { toEnglishDigits } from '../../ui/digits.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';
import { stopIntervalForItem } from '../../domain/wbs/fundingReceipts.js';
import { activeWbsScope, WBS_VIEW_SCOPES } from './viewScopes.js';
import { openCreateWorkTaskSheet, renderWorkTasks, treeWorkTypeChip } from './workTaskView.js';
import { PROJECT_FINISH_MILESTONE_ID, interruptionScheduleLookup, plannedPauseSegments, projectScheduleAnalysis, projectWithPlannedSchedule, scheduleDate, scheduleRangeOf } from '../../domain/wbs/scheduling.js';
import { canDeletePlanning, canViewPlanning, canWritePlanning, planningAccessLevel } from '../roleManagement/planningAccess.js';
import {
  advanceExpansionLevel,
  getExpansionProgress,
  getExpandedIds,
  isExpanded,
  seedCollapsed,
  toggleExpanded,
  revealBranch,
} from './wbsExpandState.js';

const COSTLINE_ICON = 'M640-160v-280h160v280H640Zm-240 0v-640h160v640H400Zm-240 0v-440h160v440H160Z';
const BRANCH_ARROW_ICON = 'm480-360 160-160H320l160 160Zm0 280q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z';
const TREE_ICON = 'M160-360v-80h640v80H160Zm0 160v-80h640v80H160Zm0-320v-80h640v80H160Zm0-160v-80h640v80H160Z';

const VIEWS = [
  { id:'today', label:'کارها', icon:TODAY_ICON },
  { id:'tree', label:'درخت پروژه', icon:TREE_ICON },
  { id:'timeline', label:'نمودار گانت', icon:'M240-280h240v-80H240v80Zm120-160h240v-80H360v80Zm120-160h240v-80H480v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z' },
  { id:'costline', label:'برآورد هزینه', icon: COSTLINE_ICON },
  { id:'shopping', label:'خریدها', icon: SHOPPING_ICON },
  { id:'oddjobs', label:'خرده‌کارها', icon:'M440-160v-120H320v-80h120v-120h80v120h120v80H520v120h-80ZM200-120v-720h560v720H200Zm80-80h400v-560H280v560Z' },
  { id:'delay', label:'دیرکردها', icon: DELAY_ICON },
];

const EXPAND_ICON = 'M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z';
const ADD_WORK_PACKAGE_ICON = 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Zm280-80h80v-120h120v-80H520v-120h-80v120H320v80h120v120Z';

function materialIcon(path){
  return `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

let currentView = 'tree';
const selectedViews = new Map();
const timelineBranchByProject = new Map();
const executionSearches = new Map();
function normalizeExecutionSearch(value){return String(value||'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').trim().toLowerCase();}
function applyExecutionSearch(root,query){
  const words=normalizeExecutionSearch(query).split(/\s+/).filter(Boolean);
  root.querySelectorAll('.today-task-card,.shopping-item-card').forEach(card=>{
    card.hidden=words.length>0 && !words.every(word=>normalizeExecutionSearch(card.textContent).includes(word));
  });
}

let currentTreeMode = DEFAULT_TREE_MODE;
let explicitProjectId = null;
let tabRenderFrame = 0;
let activePlanningLevel = 'full';

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
function scheduleTabRender(target, projectId, options){
  if(tabRenderFrame) cancelAnimationFrame(tabRenderFrame);
  tabRenderFrame = requestAnimationFrame(() => {
    tabRenderFrame = 0;
    renderWbsHome(target, projectId, options);
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

function numberFromInput(input){
  return Number(toEnglishDigits(input?.value ?? ''));
}

function jalaliDayNumber(value){
  if(!value) return null;
  const [jy, jm, jd] = String(value).split('/').map(Number);
  if(!jy || !jm || !jd) return null;
  const g = jalaliToGregorian(jy, jm, jd);
  return Math.floor(Date.UTC(g.gy, g.gm - 1, g.gd) / 86400000);
}

function dateField(name, label, value, onChange){
  const button = document.createElement('button');
  button.type = 'button';
  button.name = name;
  button.className = 'wbs-input wbs-date-input';
  button.dataset.value = value || '';
  const paint = () => { button.textContent = button.dataset.value ? formatJalaliDisplay(button.dataset.value) : 'انتخاب تاریخ'; };
  button.addEventListener('click', () => window.KarhaUI?.openJalaliPicker?.(button.dataset.value, next => {
    button.dataset.value = next;
    paint();
    onChange?.();
  }));
  paint();
  return fieldRow(label, button);
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
  if(!canDeletePlanning(activePlanningLevel)) return;
  requestPlanningItemDelete(projectIdOf(),item,()=>{closeWbsSheet();render();});
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;',
  }[ch]));
}

function contactDisplayName(contact){
  return [contact?.type, contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim() || contact?.name || 'مخاطب';
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

function openCreateGroupingSheet(parentId, createItem){
  const parent = parentId ? wbsApi.get(projectIdOf(), parentId) : null;
  const overlay = openWbsSheet({
    presentation: 'stage-create',
    title: parent ? 'ایجاد مرحله جدید برای:' : 'ایجاد مرحله جدید',
    saveLabel: 'ذخیره',
    body(root){
      root.appendChild(fieldRow('نام مرحله', textInput('', {
        name:'title', placeholder:stageCreationPlaceholder(projectOf(), parentId),
      })));
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      const created = title && createItem(projectIdOf(), title, parentId);
      if(!created) return false;
      revealBranch(projectIdOf(), projectOf().tasks, created.id);
      render();
      return true;
    },
  });
  if(parent){
    const subtitle = document.createElement('strong');
    subtitle.className = 'wbs-create-parent';
    subtitle.textContent = parent.text || '';
    overlay.querySelector('.sheet-caption').appendChild(subtitle);
  }
}

function openCreateStageSheet(parentId = null){
  openCreateGroupingSheet(parentId, (...args) => wbsApi.createStage(...args));
}

function openCreateWorkSheet(parentId = null){
  openCreateGroupingSheet(parentId, (...args) => wbsApi.createWorkItem(...args));
}

export function openProjectFinishSheet(){
  const project = projectOf();
  if(!project || !canWriteProjectModule(project.id,'reports:delay')) return;
  openWbsSheet({
    title:'موعد پایان پروژه',
    saveLabel:'ذخیره',
    body(root){
      root.appendChild(dateField('plannedFinish', 'موعد پایان اختیاری', project.plannedFinish || ''));
      const note = document.createElement('div'); note.className = 'wbs-note';
      note.textContent = 'اگر خالی باشد، پایان پروژه از دیرترین پایان برنامه‌ریزی‌شده فعالیت‌ها محاسبه می‌شود. بیس‌لاین از دکمه ثبت بیس‌لاین در نمودار گانت ذخیره می‌شود.';
      root.appendChild(note);
    },
    onSave(root){
      if(!canWriteProjectModule(project.id,'reports:delay'))return false;
      projectRepository.updateProject(project.id, current => ({ ...current, plannedFinish:root.querySelector('[name="plannedFinish"]').dataset.value || '' }));
      render(); return true;
    },
  });
}

function openAddMenu(stageId){
  const kinds = treeAddKinds(wbsApi.get(projectIdOf(), stageId));
  if(kinds.length === 1){
    if(kinds[0] === 'stage') openCreateStageSheet(stageId);
    else if(stageModeOf(projectOf()) === 'multiple') openWorkRegistration(stageId);
    else openCreateWorkSheet(stageId);
    return;
  }
  if(!kinds.length) return;
  const mayAddStage = kinds.includes('stage');
  const mayAddWork = kinds.includes('work');
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
        workBtn.addEventListener('click', () => {
          closeWbsSheet();
          openWorkRegistration(stageId);
        });
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

function scheduleRange(item){
  return scheduleRangeOf(item);
}

function jalaliLabelFromDay(day){
  const date = new Date(day * 86400000);
  const j = gregorianToJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return `${new Intl.NumberFormat('fa-IR', { useGrouping:false }).format(j.jm)}/${new Intl.NumberFormat('fa-IR', { useGrouping:false }).format(j.jd)}`;
}

function renderTimelineBranchFilter(project,items,rerender){
  const filterTree = selectableWbsTree({...project,tasks:items});
  const nodes = new Map();
  const visit = node => {
    nodes.set(node.id,node);
    node.children.forEach(visit);
  };
  visit(filterTree);
  const selected = nodes.get(timelineBranchByProject.get(project.id));
  const keys = new Set();
  const collect = node => {
    keys.add(node.id);
    node.children.forEach(collect);
  };
  if(selected)collect(selected);

  const toolbar = document.createElement('div');
  toolbar.className = 'wbs-gantt-branch-filter today-task-secondary';
  toolbar.setAttribute('role','group');
  toolbar.setAttribute('aria-label','فیلتر نمودار گانت');
  const choose = id => {
    if(id){
      timelineBranchByProject.set(project.id,id);
      const expanded = getExpandedIds(project.id);
      const expand = node => {
        if(!node.children.length)return;
        expanded.add(node.id.slice(node.id.lastIndexOf(':')+1));
        node.children.forEach(expand);
      };
      expand(nodes.get(id));
    }else{
      timelineBranchByProject.delete(project.id);
    }
    rerender();
  };
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'wbs-tree-mode-tab today-task-filter'+(selected?' active':'');
  trigger.textContent = 'همه مراحل';
  trigger.onclick = () => openExecutionBranchFilter(project,filterTree,choose,selected);
  toolbar.append(trigger);
  if(selected){
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'today-active-filter-tag';
    chip.setAttribute('aria-label','حذف فیلتر '+selected.title);
    const label = document.createElement('span');
    label.textContent = selected.title;
    const clear = document.createElement('span');
    clear.textContent = '×';
    clear.setAttribute('aria-hidden','true');
    chip.append(label,clear);
    chip.onclick = () => choose('');
    toolbar.append(chip);
  }
  return {toolbar,branchKeys:selected?keys:undefined};
}

function timelineContent(project,items,{branchKeys,expanded,visible,showWorkParents}={}){
  const rows = buildTimelineRows(items,project.id,{branchKeys,expanded,visible,showWorkParents});
  const lookup=interruptionScheduleLookup(project.tasks);
  for(const entry of rows)entry.segments=plannedPauseSegments(entry.item,entry.range,lookup);
  const analysis = projectScheduleAnalysis(project);
  const stageIds=new Set(items.map(item=>String(item.id)));
  for(const point of analysis.stageMilestones){
    if(!stageIds.has(String(point.stageId)) || branchKeys &&
      ![...branchKeys].some(key=>key==='branch:'+point.stageId ||
        point.predecessorIds.some(id=>key==='branch:'+id || key.startsWith('task:') && key.endsWith(':'+id))))continue;
    const date=scheduleDate(point.day);
    rows.push({
      item:{...point,kind:'milestone',text:point.title},
      kind:'milestone',depth:1,sourceDepth:1,shadeLevel:0,
      range:{start:point.day,end:point.day,startDate:date,endDate:date},
    });
  }
  if(!branchKeys && Number.isFinite(analysis.projectFinish)) rows.push({
    item:{ id:PROJECT_FINISH_MILESTONE_ID, kind:'milestone', text:'پایان پروژه', systemMilestone:true },
    kind:'milestone', depth:0, sourceDepth:0, shadeLevel:0,
    range:{ start:analysis.projectFinish, end:analysis.projectFinish },
  });
  return {project,entries:rows,analysis};
}

function renderTimeline(project,items,branchKeys){
  const content=timelineContent(project,items,{branchKeys});
  const rows=content.entries;
  const scheduled = rows.filter(x => x.range);
  const min = scheduled.length ? Math.min(...scheduled.map(x => x.range.start)) : 0;
  const max = scheduled.length ? Math.max(...scheduled.map(x => x.segments?.at(-1)?.end ?? x.range.end)) : min + 27;
  const days = Math.max(28, max - min + 1);
  const dayWidth = 24;
  const width = days * dayWidth;
  const shell = document.createElement('section');
  shell.className = 'wbs-gantt';
  timelineByElement.set(shell,content);
  const names = document.createElement('div');
  names.className = 'wbs-gantt-names';
  names.innerHTML = '<div class="wbs-gantt-corner">کارها</div>';
  const viewport = document.createElement('div');
  viewport.className = 'wbs-gantt-scroll';
  const timeline = document.createElement('div');
  timeline.className = 'wbs-gantt-timeline';
  timeline.style.width = `${width}px`;
  const header = document.createElement('div');
  header.className = 'wbs-gantt-header';
  for(let day = 0; day < days; day += 7){
    const week = document.createElement('span');
    week.style.width = `${Math.min(7, days - day) * dayWidth}px`;
    week.textContent = `هفته ${new Intl.NumberFormat('fa-IR').format(Math.floor(day / 7) + 1)} · ${jalaliLabelFromDay(min + day)}`;
    header.appendChild(week);
  }
  renderTimelineRows(rows, names, timeline, min, dayWidth);
  timeline.prepend(header);
  viewport.appendChild(timeline);
  shell.append(names, viewport);
  viewport.scrollLeft = viewport.scrollWidth;
  return shell;
}

function timelineColor(item){
  if(item.kind !== 'workTask') return '#77706a';
  return ({ اجرا:'#03045E', خرید:'#033E8A', 'نیروی کار':'#0078B7', پیمانکار:'#0096C8', کرایه:'#00B4D7', خدمات:'#48CAE4', پیگیری:'#6D8EA0', سایر:'#5C6B73' })[item.type] || '#91A4AF';
}

function tNameRow(entry){
  const row = document.createElement('div');
  const task = entry.item.kind === 'workTask';
  const milestone = entry.item.kind === 'milestone';
  row.className = 'wbs-gantt-name depth-' + Math.min(entry.depth, 6) + (isStage(entry.item) ? ' is-stage' : (task ? ' is-task' : (milestone ? ' is-milestone' : ' is-work')));
  const kids = task ? entry.item.subworkChildren || [] : [...(entry.item.subtasks || []).filter(x => x && !x.trashed), ...activeWorkTasks(entry.item)];
  row.innerHTML = `${kids.length ? '<button type="button" class="wbs-gantt-chev">'+(isExpanded(projectIdOf(), entry.item.id)?'▾':'◂')+'</button>' : '<span class="wbs-gantt-chev"></span>'}<span>${escapeHtml(entry.item.text)}</span>`;
  row.querySelector('button')?.addEventListener('click', () => { toggleExpanded(projectIdOf(), String(entry.item.id)); render(); });
  return row;
}

function tBarRow(entry, min, dayWidth){
  const row = document.createElement('div');
  row.className = 'wbs-gantt-line';
  if(entry.range){
    for(const segment of entry.segments?.length?entry.segments:[entry.range]){
      const bar = document.createElement('button');
      bar.type = 'button';
      const task = entry.item.kind === 'workTask';
      bar.className = 'wbs-gantt-bar' + (isStage(entry.item) ? ' is-stage' : '') + (task ? ' is-task' : '') + (entry.item.kind === 'milestone' ? ' is-milestone' : '');
      bar.style.left = `${(segment.start - min) * dayWidth}px`;
      bar.style.width = `${Math.max(dayWidth, (segment.end - segment.start + 1) * dayWidth)}px`;
      bar.style.backgroundColor = timelineColor(entry.item);
      const stop = stopIntervalForItem(projectOf(), entry.item);
      if(stop && entry.range){
        const left = Math.max(0, stop.start - segment.start);
        const span = Math.max(1, segment.end - segment.start + 1);
        const from = Math.min(100, (left / span) * 100);
        const to = Math.min(100, ((Math.min(stop.end, segment.end) - segment.start + 1) / span) * 100);
        bar.style.backgroundImage = `linear-gradient(90deg, ${timelineColor(entry.item)} ${from}%, rgba(255,255,255,.72) ${from}%, rgba(255,255,255,.72) ${to}%, ${timelineColor(entry.item)} ${to}%)`;
        bar.title = `توقف مالی ${stop.duration} روز`;
      } else bar.title = `${entry.range.startDate || ''} تا ${entry.range.endDate || ''}`;
      if(entry.item.kind==='milestone' && !entry.item.systemMilestone){
        const point=entry.item;
        bar.title=point.title+' · موعد '+point.dueDate+(point.forecast===null?'':' · پیش‌بینی '+scheduleDate(point.forecast));
        bar.setAttribute('aria-label',bar.title);
        bar.addEventListener('click',()=>openStageMilestoneSheet({projectId:projectIdOf(),stageId:point.stageId,
          milestoneId:point.id,onChanged:render,readOnly:!canWritePlanning(activePlanningLevel)}));
      }
      if(entry.item.kind !== 'milestone') bar.addEventListener('click', () => task
        ? openCreateWorkTaskSheet({ projectId:projectIdOf(), work:entry.item.parentWork, task:entry.item, onChanged:render, readOnly:!canWritePlanning(activePlanningLevel) || entry.item.completionState === 'approved' || entry.item.completed, canDelete:canDeletePlanning(activePlanningLevel) })
        : openItemDetails(entry.item));
      row.appendChild(bar);
    }
  }else if(isWork(entry.item) || entry.item.kind === 'workTask'){
    const empty = document.createElement('button');
    empty.type = 'button'; empty.className = 'wbs-gantt-unscheduled'; empty.textContent = 'بدون تاریخ';
    empty.addEventListener('click', () => entry.item.kind === 'workTask'
      ? openCreateWorkTaskSheet({ projectId:projectIdOf(), work:entry.item.parentWork, task:entry.item, onChanged:render, readOnly:!canWritePlanning(activePlanningLevel) || entry.item.completionState === 'approved' || entry.item.completed, canDelete:canDeletePlanning(activePlanningLevel) })
      : openItemDetails(entry.item));
    row.appendChild(empty);
  }
  return row;
}

function renderTimelineRows(rows, names, timeline, min, dayWidth){
  rows.forEach(entry => { names.appendChild(tNameRow(entry)); timeline.appendChild(tBarRow(entry, min, dayWidth)); });
}

function treeAddKinds(item){
  const mode = stageModeOf(projectOf());
  const kinds = stageAddKinds(projectOf(), item.id, { strict:true });
  const legacyFixedStage = mode !== 'base' && mode !== 'multiple' && !item.createdAt && item.registrationLevel == null;
  if(legacyFixedStage && kinds.length === 1 && kinds[0] === 'work') return ['stage'];
  if(mode === 'multiple' || !kinds.includes('stage')) return kinds;
  const childStages = (item.subtasks || []).filter(child => !child.trashed && isStage(child));
  const alreadyTooDeep = childStages.some(child => (child.subtasks || []).some(grandchild => !grandchild.trashed && isStage(grandchild)));
  return alreadyTooDeep ? [] : kinds;
}

function isWorkRegistrationLevel(item){
  if(isWork(item)) return true;
  if(stageModeOf(projectOf()) === 'multiple') return false;
  const children = (item.subtasks || []).filter(child => !child.trashed);
  const kinds = treeAddKinds(item);
  return !children.length && (item.registrationLevel === 'work' || (kinds.length === 1 && kinds[0] === 'work'));
}

function openItemDetails(item){
  const writable=canWritePlanning(activePlanningLevel);
  const approved=item.completionState === 'approved' || item.completed;
  openStageEditor({projectId:projectIdOf(),stage:wbsApi.get(projectIdOf(),item.id)||item,onChanged:render,readOnly:!writable || approved,onDelete:!approved && canDeletePlanning(activePlanningLevel)?()=>requestDelete(item):null});
}

function openWorkRegistration(itemId){
  const item=wbsApi.get(projectIdOf(),itemId);
  if(!item) return;
  openWorkCreationSheet({projectId:projectIdOf(),stage:item,onChanged:render});
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

function renderRow(item, codes, view, depth, treeLayout){
  const stage = isStage(item);
  const displayedProgress = stage ? rollupProgress([item]) : progressOf(item);
  const checked = displayedProgress === 100;
  const kids = (item.subtasks || []).filter(x => !x.trashed && !isPendingUiDelete(x.id));
  const workTasks = canHoldWorkTasks(item) ? activeWorkTasks(item) : [];
  const hasExpandableContent = kids.length > 0 || workTasks.length > 0;
  const open = isExpanded(projectIdOf(), item.id);
  const code = stage ? (codes.get(String(item.id)) || '') : '';
  const permissionReadOnly = !canWritePlanning(activePlanningLevel);
  const readOnlyView = view === 'estimate' || view === 'progress' || permissionReadOnly;
  const registrationLevel = isWorkRegistrationLevel(item);
  const mayAddSubwork = isWork(item) && !item.completed && item.completionState!=='approved'
    && item.type!=='خرید' && (Boolean(item.type) || !registrationLevel);
  const mayAdd = mayAddSubwork || registrationLevel || treeAddKinds(item).length > 0;
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
    ${treeLayout ? '<span class="wbs-tree-link" aria-hidden="true"></span>' : ''}
    ${readOnlyView ? '' : '<span class="wbs-grip" aria-hidden="true">⋮⋮</span>'}
    ${hasExpandableContent ? `<button type="button" class="wbs-chev" aria-label="${open?'بستن':'باز کردن'}" aria-expanded="${open}"><svg class="wbs-chev-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="24" height="24" fill="#1f1f1f" aria-hidden="true" focusable="false"><path d="${BRANCH_ARROW_ICON}"/></svg></button>` : '<span class="wbs-chev-spacer"></span>'}
    <button type="button" class="wbs-title">
      ${code ? `<b>${escapeHtml(code)}</b>` : ''}
      <span class="wbs-title-text">${escapeHtml(item.text || '')}</span>
      ${treeLayout && !stage ? treeWorkTypeChip(item.type) : ''}
    </button>
    <span class="wbs-meta${view === 'estimate' ? ' is-estimate' : ''}${view === 'progress' ? ' is-progress' : ''}">${escapeHtml(meta.join(' · '))}</span>
    ${!readOnlyView && mayAdd ? `<button type="button" class="wbs-add" aria-label="${mayAddSubwork ? 'افزودن زیرکار' : stage ? 'افزودن' : 'ساخت کار'}">+</button>` : ''}
  `;
  if(depth===0 && stage && view!=='estimate'){
    const points=stageMilestones(item);
    if(points.length){
      const diamonds=document.createElement('span');
      diamonds.className='wbs-stage-milestone-diamonds';
      for(const point of points){
        diamonds.append(stageMilestoneDiamond(item,point,(owner,milestone)=>openStageMilestoneSheet({
          projectId:projectIdOf(),stageId:owner.id,milestoneId:milestone.id,onChanged:render,readOnly:readOnlyView,
        })));
      }
      row.querySelector('.wbs-title').after(diamonds);
    }
  }
  row.querySelector('.wbs-chev')?.addEventListener('click', ev => {
    ev.stopPropagation();
    toggleExpanded(projectIdOf(), String(item.id));
    render();
  });
  row.querySelector('.wbs-title')?.addEventListener('click', ev => {
    ev.stopPropagation();
    openItemDetails(item);
  });
  row.querySelector('.wbs-add')?.addEventListener('click', ev => {
    ev.stopPropagation();
    if(mayAddSubwork)openWorkCreationSheet({projectId:projectIdOf(),stage:item,onChanged:render,subwork:true});
    else if(registrationLevel) openWorkRegistration(item.id);
    else openAddMenu(item.id);
  });
  const wrap = document.createElement('div');
  wrap.className = depth === 0 ? 'wbs-card' : 'wbs-branch';
  wrap.className += ' wbs-depth-' + Math.min(6, depth);
  wrap.appendChild(row);
  if(treeLayout){
    wrap.className += ' wbs-tree-level-' + Math.min(8,depth);
    if(depth){
      const continuation = document.createElement('span');
      continuation.className = 'wbs-tree-continuation';
      continuation.setAttribute('aria-hidden','true');
      wrap.appendChild(continuation);
    }
    if(depth)row.classList.add('has-tree-parent');
  }
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
  if(open) kids.forEach(child => wrap.appendChild(renderRow(child, codes, view, depth + 1, treeLayout)));
  if(open && canHoldWorkTasks(item) && workTasks.length){
    const taskGroup = renderWorkTasks({ documentRef:document, projectId:projectIdOf(), work:item, view, treeDepth:treeLayout ? depth + 1 : null, onChanged:render, readOnly:permissionReadOnly, canDelete:canDeletePlanning(activePlanningLevel) });
    if(taskGroup) wrap.appendChild(taskGroup);
  }
  return wrap;
}

export function renderWbsHome(target = document.getElementById('content'), projectId = null, options = {}){
  if(!target) return;
  const scope = options.scope || activeWbsScope() || 'planning';
  const scopedOptions = WBS_VIEW_SCOPES[scope] || WBS_VIEW_SCOPES.planning;
  if(scope && WBS_VIEW_SCOPES[scope] && options.scope && scope !== activeWbsScope()) return;
  if(target.querySelector('.wbs-row-dragging,.wbs-work-task.is-dragging')){
    scheduleTabRender(target, projectId, scopedOptions);
    return;
  }
  explicitProjectId = projectId || explicitProjectId;
  const project = projectOf();
  const previousGantt=target.querySelector('.wbs-gantt');
  const previousTimeline=timelineByElement.get(previousGantt);
  const ganttScroll=previousTimeline && previousTimeline.project.id===project?.id
    ? captureGanttScroll(previousGantt,target) : null;
  target.innerHTML = '';
  if(!project || project.archived || project.trashed){
    target.innerHTML = '<div class="workspace-no-project">برای ورود به Workspace، از منوی سه‌خطی بالای صفحه یک پروژه را انتخاب کنید.</div>';
    return;
  }
  ensureTreeState(project);
  const allowedIds = scopedOptions.views.filter(id => VIEWS.some(view => view.id === id))
    .filter(id=>id!=='oddjobs' || projectPermissionState(project.id,['execution:today']).visible)
    .filter(id=>scope!=='planning'||canViewPlanning(planningAccessLevel(project.id,id)));
  const allowedViews = VIEWS.filter(view => allowedIds.includes(view.id));
  if(!allowedViews.length){
    target.innerHTML='<div class="workspace-no-project">برای بخش برنامه دسترسی فعالی ندارید.</div>';
    return;
  }
  currentView = selectedViews.get(scope) || scopedOptions.defaultView;
  if(!allowedIds.includes(currentView)) currentView = allowedIds[0];
  activePlanningLevel=scope==='planning'?planningAccessLevel(project.id,currentView):'full';
  const rerender = () => renderWbsHome(target, project.id, scopedOptions);

  const root = document.createElement('div');
  root.className = 'wbs-home-root'
    + (currentView === 'today' ? ' is-today-view' : '')
    + (currentView === 'tree' ? ' is-tree-view' : '')
    + (currentView === 'timeline' ? ' is-timeline-view' : '')
    + (currentView === 'costline' ? ' is-costline-view' : '')
    + (currentView === 'shopping' ? ' is-shopping-view' : '')
    + (currentView === 'delay' ? ' is-delay-view' : '');
  root.dataset.view = currentView;
  root.dataset.scope = scope;
  root.dataset.treeMode = currentTreeMode;
  target.appendChild(root);

  const tabs = document.createElement('div');
  tabs.className = 'wbs-tabs';
  tabs.style.setProperty('--wbs-tab-count', String(allowedViews.length));
  tabs.setAttribute('role', 'tablist');
  allowedViews.forEach(view => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wbs-tab' + (currentView === view.id ? ' active' : '');
    btn.dataset.view = view.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', currentView === view.id ? 'true' : 'false');
    btn.setAttribute('aria-label', view.label);
    btn.title = view.label;
    btn.innerHTML = `${materialIcon(view.icon)}<span class="wbs-tab-label">${view.label}</span>`;
    btn.addEventListener('click', () => {
      if(currentView === view.id) return;
      currentView = view.id;
      selectedViews.set(scope, view.id);
      if(view.id === 'tree') currentTreeMode = DEFAULT_TREE_MODE;
      scheduleTabRender(target, project.id, scopedOptions);
    });
    tabs.appendChild(btn);
  });
  if(allowedViews.length>1) root.appendChild(tabs);
  if(scope==='execution' && ['today','oddjobs','shopping'].includes(currentView)){
    const key=String(project.id)+':'+currentView;
    const search=document.createElement('div');search.className='execution-quick-search';
    const input=document.createElement('input');input.type='search';input.className='execution-quick-search-input';
    input.placeholder='جست‌وجو در '+(currentView==='today'?'کارها':currentView==='shopping'?'خریدها':'خرده‌کارها')+'…';
    input.setAttribute('aria-label','جست‌وجو');
    input.value=executionSearches.get(key)||'';
    const icon=document.createElement('button');icon.type='button';icon.className='execution-quick-search-icon';
    icon.setAttribute('aria-label','پاک کردن جست‌وجو');
    icon.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>';
    const apply=()=>{executionSearches.set(key,input.value);applyExecutionSearch(root,input.value);};
    input.addEventListener('input',apply);
    icon.onclick=()=>{if(input.value){input.value='';apply();}input.blur();};
    search.append(input,icon);root.append(search);
    queueMicrotask(apply);
  }

  if(currentView === 'today' || currentView === 'oddjobs'){
    root.appendChild(renderTodayView(project, document, rerender,{standalone:currentView==='oddjobs'}));
    return;
  }

  if(currentView === 'shopping'){
    root.appendChild(renderShoppingView(project, document, rerender));
    return;
  }

  if(currentView === 'delay'){
    root.appendChild(renderDelayView(project, document, openProjectFinishSheet));
    return;
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'wbs-toolbar';
  const addRoot = document.createElement('button');
  addRoot.type = 'button';
  addRoot.className = 'wbs-root-add';
  const baseMode = stageModeOf(project) === 'base';
  addRoot.setAttribute('aria-label', baseMode ? 'افزودن کار' : 'افزودن بسته کار');
  addRoot.innerHTML = `${materialIcon(ADD_WORK_PACKAGE_ICON)}<span>${baseMode ? 'کار' : 'بسته کار'}</span>`;
  addRoot.addEventListener('click', () => baseMode ? openCreateWorkSheet(null) : openCreateStageSheet(null));

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
    renderWbsHome(target, project.id, scopedOptions);
  });
  if(scope!=='planning'||canWritePlanning(activePlanningLevel)) toolbar.appendChild(addRoot);
  toolbar.appendChild(treeToggle);
  if(currentView==='tree'){
    const exportButton=createExportButton(document);
    exportButton.className += ' wbs-tree-export-tool';
    exportButton.onclick=()=>openProjectTreeExport(project,{
      trigger:exportButton,expandedIds:getExpandedIds(project.id),
      timeline:(expanded,visible,showWorkParents)=>{
        const scheduled=projectWithPlannedSchedule(project);
        const items=scheduled.tasks.filter(item=>item && !item.trashed && !isPendingUiDelete(item.id));
        return timelineContent(scheduled,items,{expanded,visible,showWorkParents});
      },
      expandIcon:materialIcon(EXPAND_ICON),branchIcon:materialIcon(BRANCH_ARROW_ICON),
    });
    toolbar.appendChild(exportButton);
  }
  if(currentView !== 'timeline' && currentView !== 'costline') root.appendChild(toolbar);

  if(currentView === 'tree'){
    root.appendChild(createTreeModeTabs(document, currentTreeMode, mode => {
      currentTreeMode = mode;
      scheduleTabRender(target, project.id, scopedOptions);
    }));
  }

  const tree = document.createElement('div');
  tree.className = currentView === 'tree' ? 'wbs-tree wbs-branch-layout' : 'wbs-tree';
  const items = (project.tasks || []).filter(x => !x.trashed && !isPendingUiDelete(x.id));
  const effectiveView = currentView === 'tree' ? currentTreeMode : currentView;
  const codes = wbsCodeMap(items);
  if(currentView === 'costline') tree.appendChild(renderCostline(project, {
    canWrite:canWritePlanning(activePlanningLevel),
    canDelete:canDeletePlanning(activePlanningLevel),
  }));
  else if(!items.length) tree.innerHTML = `<div class="empty-state">${baseMode ? 'کاری ثبت نشده است.' : 'مرحله یا کاری ثبت نشده است.'}</div>`;
  else if(currentView === 'timeline'){
    const {toolbar,branchKeys} = renderTimelineBranchFilter(project,items,rerender);
    const scheduled = projectWithPlannedSchedule(project);
    const visibleItems = scheduled.tasks.filter(item => item && !item.trashed && !isPendingUiDelete(item.id));
    const gantt=renderTimeline(scheduled,visibleItems,branchKeys);
    timelineByElement.get(gantt).openExport=trigger=>openProjectTreeExport(project,{
      trigger,sourceView:'timeline',expandedIds:getExpandedIds(project.id),
      expandIcon:materialIcon(EXPAND_ICON),branchIcon:materialIcon(BRANCH_ARROW_ICON),
      timeline:(expanded,visible,showWorkParents)=>timelineContent(scheduled,visibleItems,{branchKeys,expanded,visible,showWorkParents}),
    });
    restoreGanttScroll(gantt,ganttScroll);
    tree.append(toolbar,gantt);
  }
  else items.forEach(item => tree.appendChild(renderRow(item, codes, effectiveView, 0, currentView === 'tree')));
  root.appendChild(tree);

  if(currentView === 'tree' && currentTreeMode === 'estimate'){
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
  const scope = activeWbsScope();
  if(!WBS_VIEW_SCOPES[scope]) return;
  const content = document.getElementById('content');
  renderWbsHome(content, projectContext.getProjectId?.() || explicitProjectId, WBS_VIEW_SCOPES[scope]);
}

globalThis.window?.addEventListener?.('karha:projects-recovered', () => {
  if(activeWbsScope()==='planning' && document.querySelector('#content .is-timeline-view'))render();
});

export default { renderWbsHome };
