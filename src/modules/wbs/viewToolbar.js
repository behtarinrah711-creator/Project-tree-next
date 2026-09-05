import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import {
  advanceExpansionLevel,
  getExpansionProgress,
  getExpandedIds,
} from './wbsExpandState.js';
import { fieldRow, openWbsSheet, textInput } from './wbsSheet.js';

const EXPAND_ICON = 'M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z';
const ADD_WORK_PACKAGE_ICON = 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Zm280-80h80v-120h120v-80H520v-120h-80v120H320v80h120v120Z';

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

function openCreateRootSheet(project){
  openWbsSheet({
    title:'افزودن بسته کار',
    saveLabel:'ذخیره',
    body(root){
      root.appendChild(fieldRow('نام مرحله', textInput('', { name:'title', placeholder:'نام مرحله' })));
      root.appendChild(fieldRow('وزن پیشرفت', textInput('1', { name:'progressWeight', type:'number', min:'0.01', step:'0.01', required:true })));
      const note = root.ownerDocument.createElement('div');
      note.className = 'wbs-note';
      note.textContent = 'وزن نسبی است؛ لازم نیست مجموع وزن‌ها ۱۰۰ شود.';
      root.appendChild(note);
    },
    onSave(root){
      const title = root.querySelector('[name="title"]')?.value.trim();
      const progressWeight = Number(root.querySelector('[name="progressWeight"]')?.value);
      if(!title || !Number.isFinite(progressWeight) || progressWeight <= 0) return false;
      wbsApi.createStage(project.id, title, null, { progressWeight });
      refreshWbs();
      return true;
    },
  });
}

function createAddRootButton(documentRef, project){
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'wbs-root-add';
  button.setAttribute('aria-label', 'افزودن بسته کار');
  button.innerHTML = `${materialIcon(ADD_WORK_PACKAGE_ICON)}<span>بسته کار</span>`;
  button.addEventListener('click', () => openCreateRootSheet(project));
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
  if(viewId !== 'timeline' && viewId !== 'costline') return;
  if(root.querySelector(':scope > .wbs-toolbar')) return;
  const tabs = root.querySelector(':scope > .wbs-tabs');
  const project = activeProject();
  if(!tabs || !project) return;

  const toolbar = root.ownerDocument.createElement('div');
  toolbar.className = 'wbs-toolbar' + (viewId === 'costline' ? ' is-single-action' : '');
  toolbar.appendChild(createAddRootButton(root.ownerDocument, project));
  if(viewId === 'timeline') toolbar.appendChild(createExpandButton(root.ownerDocument, project));
  tabs.insertAdjacentElement('afterend', toolbar);
}
