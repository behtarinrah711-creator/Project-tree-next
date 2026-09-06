import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import {
  advanceExpansionLevel,
  getExpansionProgress,
  getExpandedIds,
} from './wbsExpandState.js';

const EXPAND_ICON = 'M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z';

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
  if(root.querySelector(':scope > .wbs-toolbar')) return;
  const tabs = root.querySelector(':scope > .wbs-tabs');
  const project = activeProject();
  if(!tabs || !project) return;

  const toolbar = root.ownerDocument.createElement('div');
  toolbar.className = 'wbs-toolbar is-timeline-actions';
  toolbar.appendChild(createExpandButton(root.ownerDocument, project));
  tabs.insertAdjacentElement('afterend', toolbar);
}
