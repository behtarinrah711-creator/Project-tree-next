import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import {
  advanceExpansionLevel,
  getExpansionProgress,
  getExpandedIds,
} from './wbsExpandState.js';
import { setTimelineDependenciesVisible } from './timelineDependencies.js';
import {
  ganttConfig,
  ganttLevelOptions,
  ganttLevelState,
  setGanttConfig,
  setGanttLevelVisible,
} from './timelineViewOptions.js';
import { expandIconMarkup, materialIconMarkup } from '../../ui/materialIcons.js';

const CONFIG_ICON = 'M120-840h320v320H120v-320Zm400 0h320v320H520v-320ZM120-440h320v320H120v-320Zm520 0h80v120h120v80H720v120h-80v-120H520v-80h120v-120Zm-40-320v160h160v-160H600Zm-400 0v160h160v-160H200Zm0 400v160h160v-160H200Z';
const LEVEL_ICON = 'M80-200v-80h240v-240h240v-240h320v80H640v240H400v240H80Z';

const CONFIG_ITEMS = [
  ['dates','تاریخ'],
  ['title','عنوان'],
  ['actualProgress','درصد پیشرفت'],
  ['plannedProgress','پیشرفت برنامه‌ریزی‌شده'],
  ['dependencies','خطوط پیش‌نیاز'],
  ['float','شناوری'],
  ['criticalPath','مسیر بحرانی'],
];

function activeProject(){
  const id = projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
  return id ? projectRepository.getActiveProject(id) : null;
}

function refreshWbs(){
  import('./homeView.js').then(module => module.render?.());
}

function closeMenus(root, except = null){
  root.querySelectorAll('.wbs-gantt-header-menu.is-open').forEach(menu => {
    if(menu !== except) menu.classList.remove('is-open');
  });
  root.querySelectorAll('.wbs-gantt-header-tool[aria-expanded="true"]').forEach(button => {
    if(!except || button.getAttribute('aria-controls') !== except.id) button.setAttribute('aria-expanded','false');
  });
}

function checkboxRow(documentRef, labelText, checked, onChange, { disabled = false } = {}){
  const label = documentRef.createElement('label');
  label.className = 'wbs-gantt-menu-row' + (disabled ? ' is-disabled' : '');
  const input = documentRef.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  input.disabled = disabled;
  const text = documentRef.createElement('span');
  text.textContent = labelText;
  input.addEventListener('change', () => onChange(input.checked));
  label.append(input, text);
  return label;
}

function createMenuTool(documentRef, { className, ariaLabel, iconPath, menuId, buildMenu, root }){
  const wrap = documentRef.createElement('div');
  wrap.className = 'wbs-gantt-header-tool-wrap';

  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = `wbs-gantt-header-tool ${className}`;
  button.setAttribute('aria-label', ariaLabel);
  button.setAttribute('title', ariaLabel);
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-controls', menuId);
  button.innerHTML = materialIconMarkup(iconPath);

  const menu = documentRef.createElement('div');
  menu.id = menuId;
  menu.className = 'wbs-gantt-header-menu';
  menu.setAttribute('role','menu');
  buildMenu(menu);

  button.addEventListener('click', event => {
    event.stopPropagation();
    const next = !menu.classList.contains('is-open');
    closeMenus(root, next ? menu : null);
    menu.classList.toggle('is-open', next);
    button.setAttribute('aria-expanded', next ? 'true' : 'false');
  });

  wrap.append(button, menu);
  return wrap;
}

function createConfigTool(documentRef, root){
  return createMenuTool(documentRef, {
    className:'wbs-gantt-config-toggle',
    ariaLabel:'کانفیگور نمودار گانت',
    iconPath:CONFIG_ICON,
    menuId:'wbsGanttConfigMenu',
    root,
    buildMenu(menu){
      const title = documentRef.createElement('div');
      title.className = 'wbs-gantt-menu-title';
      title.textContent = 'نمایش در نمودار';
      menu.appendChild(title);
      const state = ganttConfig();
      CONFIG_ITEMS.forEach(([key, label]) => {
        const unavailable = key === 'float' || key === 'criticalPath';
        menu.appendChild(checkboxRow(documentRef, label, state[key], checked => {
          setGanttConfig(key, checked);
          if(key === 'dependencies') setTimelineDependenciesVisible(checked);
          refreshWbs();
        }, { disabled:unavailable }));
      });
      const note = documentRef.createElement('small');
      note.className = 'wbs-gantt-menu-note';
      note.textContent = 'شناوری و مسیر بحرانی پس از اتصال موتور CPM فعال می‌شوند.';
      menu.appendChild(note);
    },
  });
}

function createLevelTool(documentRef, root, project){
  return createMenuTool(documentRef, {
    className:'wbs-gantt-level-toggle',
    ariaLabel:'لول‌های WBS',
    iconPath:LEVEL_ICON,
    menuId:'wbsGanttLevelMenu',
    root,
    buildMenu(menu){
      const title = documentRef.createElement('div');
      title.className = 'wbs-gantt-menu-title';
      title.textContent = 'لول‌های WBS';
      menu.appendChild(title);
      const state = ganttLevelState();
      ganttLevelOptions(project.tasks || []).forEach(option => {
        menu.appendChild(checkboxRow(documentRef, option.label, state.get(option.key) !== false, checked => {
          setGanttLevelVisible(option.key, checked);
          refreshWbs();
        }));
      });
    },
  });
}

function createExpandButton(documentRef, project){
  const button = documentRef.createElement('button');
  const isTreeOpen = getExpandedIds(project.id).size > 0;
  const expansionProgress = getExpansionProgress(project.id, project.tasks || []);
  button.type = 'button';
  button.className = 'wbs-tree-toggle' + (isTreeOpen ? ' is-active' : '') + (expansionProgress.ratio >= .5 ? ' is-past-midpoint' : '');
  button.setAttribute('aria-label', 'تغییر سطح بازشدگی نمودار');
  button.setAttribute('aria-pressed', isTreeOpen ? 'true' : 'false');
  button.dataset.expandedLevels = String(expansionProgress.expandedLevels);
  button.dataset.totalLevels = String(expansionProgress.totalLevels);
  button.innerHTML = `<svg class="wbs-expand-shade" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="1" height="1" fill="currentColor" opacity="${expansionProgress.ratio}"/></svg>${expandIconMarkup()}`;
  button.addEventListener('click', () => {
    advanceExpansionLevel(project.id, project.tasks || []);
    refreshWbs();
  });
  return button;
}

export function ensureViewToolbar(root, viewId){
  if(viewId !== 'timeline') return;
  const project = activeProject();
  const gantt = root.querySelector('.wbs-gantt');
  const corner = gantt?.querySelector('.wbs-gantt-corner');
  const timescale = root.querySelector('.wbs-timescale-toggle');
  if(!project || !gantt || !corner || !timescale) return;

  setTimelineDependenciesVisible(ganttConfig().dependencies);

  let header = root.querySelector('.wbs-timeline-view-header');
  if(!header){
    header = root.ownerDocument.createElement('div');
    header.className = 'wbs-view-header wbs-timeline-view-header';

    const title = root.ownerDocument.createElement('div');
    title.className = 'wbs-view-title';
    title.textContent = 'نمودار گانت';

    const actions = root.ownerDocument.createElement('div');
    actions.className = 'wbs-view-actions';
    actions.setAttribute('aria-label', 'ابزارهای نمودار گانت');

    header.append(title, actions);
    gantt.parentElement?.insertBefore(header, gantt);
  }

  const actions = header.querySelector('.wbs-view-actions');
  if(!actions) return;

  let expand = root.querySelector('.wbs-tree-toggle');
  if(!expand) expand = createExpandButton(root.ownerDocument, project);

  let levelWrap = root.querySelector('.wbs-gantt-level-toggle')?.closest('.wbs-gantt-header-tool-wrap');
  if(!levelWrap) levelWrap = createLevelTool(root.ownerDocument, root, project);

  let configWrap = root.querySelector('.wbs-gantt-config-toggle')?.closest('.wbs-gantt-header-tool-wrap');
  if(!configWrap) configWrap = createConfigTool(root.ownerDocument, root);

  // Keep toolbar setup idempotent. Timeline enhancement is driven by a
  // MutationObserver; replacing/re-appending the same controls on every pass
  // would create a self-sustaining mutation loop and keep the Gantt unstable.
  [timescale, expand, levelWrap, configWrap].forEach(control => {
    if(control.parentElement !== actions) actions.appendChild(control);
  });

  if(!root.dataset.ganttMenuDismissInstalled){
    root.dataset.ganttMenuDismissInstalled = '1';
    root.ownerDocument.addEventListener('click', event => {
      if(!event.target.closest('.wbs-gantt-header-tool-wrap')) closeMenus(root);
    });
  }
}
