import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import {
  advanceExpansionLevel,
  getExpansionProgress,
  getExpandedIds,
} from './wbsExpandState.js';
import { areTimelineDependenciesVisible, setTimelineDependenciesVisible } from './timelineDependencies.js';

const EXPAND_ICON = 'M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z';
const DEPENDENCY_ICON = 'M296-270q-42 35-87.5 32T129-269q-34-28-46.5-73.5T99-436l75-124q-25-22-39.5-53T120-680q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47q-9 0-18-1t-17-3l-77 130q-11 18-7 35.5t17 28.5q13 11 31 12.5t35-12.5l420-361q42-35 88-31.5t80 31.5q34 28 46 73.5T861-524l-75 124q25 22 39.5 53t14.5 67q0 66-47 113t-113 47q-66 0-113-47t-47-113q0-66 47-113t113-47q9 0 17.5 1t16.5 3l78-130q11-18 7-35.5T782-630q-13-11-31-12.5T716-630L296-270Zm40.5-353.5Q360-647 360-680t-23.5-56.5Q313-760 280-760t-56.5 23.5Q200-713 200-680t23.5 56.5Q247-600 280-600t56.5-23.5Zm400 400Q760-247 760-280t-23.5-56.5Q713-360 680-360t-56.5 23.5Q600-313 600-280t23.5 56.5Q647-200 680-200t56.5-23.5ZM280-680Zm400 400Z';

function materialIcon(path, viewBox = '0 -960 960 960'){
  return `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function activeProject(){
  const id = projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
  return id ? projectRepository.getActiveProject(id) : null;
}

function refreshWbs(){
  import('./homeView.js').then(module => module.render?.());
}

function createDependencyButton(documentRef, gantt){
  const button = documentRef.createElement('button');
  const sync = () => {
    const active = areTimelineDependenciesVisible();
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('title', active ? 'پنهان کردن ارتباط‌های Finish to Start' : 'نمایش ارتباط‌های Finish to Start');
    gantt.classList.toggle('show-dependencies', active);
  };
  button.type = 'button';
  button.className = 'wbs-dependency-toggle';
  button.setAttribute('aria-label', 'نمایش ارتباط‌های Finish to Start');
  button.innerHTML = materialIcon(DEPENDENCY_ICON);
  button.addEventListener('click', () => {
    setTimelineDependenciesVisible(!areTimelineDependenciesVisible());
    sync();
  });
  sync();
  return button;
}

function createExpandButton(documentRef, project){
  const button = documentRef.createElement('button');
  const isTreeOpen = getExpandedIds(project.id).size > 0;
  const expansionProgress = getExpansionProgress(project.id, project.tasks || []);
  button.type = 'button';
  button.className = 'wbs-tree-toggle' + (isTreeOpen ? ' is-active' : '') + (expansionProgress.ratio >= .5 ? ' is-past-midpoint' : '');
  button.setAttribute('aria-label', 'تغییر سطح نمایش نمودار');
  button.setAttribute('aria-pressed', isTreeOpen ? 'true' : 'false');
  button.dataset.expandedLevels = String(expansionProgress.expandedLevels);
  button.dataset.totalLevels = String(expansionProgress.totalLevels);
  button.innerHTML = `<svg class="wbs-expand-shade" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="1" height="1" fill="currentColor" opacity="${expansionProgress.ratio}"/></svg>${materialIcon(EXPAND_ICON, '160 -800 640 640')}`;
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

  let dependency = root.querySelector('.wbs-dependency-toggle');
  if(!dependency) dependency = createDependencyButton(root.ownerDocument, gantt);

  [timescale, expand, dependency].forEach(control => {
    if(control.parentElement !== actions) actions.appendChild(control);
  });
}