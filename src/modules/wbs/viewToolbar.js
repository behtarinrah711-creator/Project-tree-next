import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import {
  advanceExpansionLevel,
  getExpansionProgress,
  getExpandedIds,
} from './wbsExpandState.js';
import { areTimelineDependenciesVisible, setTimelineDependenciesVisible } from './timelineDependencies.js';

const EXPAND_ICON = 'M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z';
const DEPENDENCY_ICON = 'M320-200v-80h120v-160H320v-80h120v-160H320v-80h200v240h120v-80h200v240H640v-80H520v160h120v-80h200v240H640v-80H520v-160H400v80H320Z';

function materialIcon(path){
  return `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
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
  button.innerHTML = `<svg class="wbs-expand-shade" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="1" height="1" fill="currentColor" opacity="${expansionProgress.ratio}"/></svg>${materialIcon(EXPAND_ICON)}`;
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
  const timescale = gantt?.querySelector('.wbs-timescale-toggle');
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

  actions.append(timescale, expand, dependency);
}