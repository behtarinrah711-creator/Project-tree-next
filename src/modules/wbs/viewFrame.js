import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { fieldRow, openWbsSheet, textInput } from './wbsSheet.js';

export const WBS_VIEW_TITLES = Object.freeze({
  simple: 'نمای کلی',
  register: 'ثبت و ویرایش',
  estimate: 'هزینه‌ها',
  progress: 'درصد پیشرفت',
  timeline: 'نمودار گانت',
  costline: 'برآورد هزینه',
});

const VIEW_ORDER = ['simple', 'register', 'estimate', 'progress', 'timeline', 'costline'];
const STANDARD_VIEWS = new Set(['simple', 'register', 'estimate', 'progress']);
const ADD_WORK_PACKAGE_ICON = 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Zm280-80h80v-120h120v-80H520v-120h-80v120H320v80h120v120Z';

export function viewTitle(viewId){
  return WBS_VIEW_TITLES[viewId] || '';
}

function activeViewId(root){
  const tabs = [...root.querySelectorAll(':scope > .wbs-tabs > .wbs-tab')];
  const index = tabs.findIndex(tab => tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true');
  return VIEW_ORDER[index] || 'simple';
}

function createHeader(documentRef, viewId){
  const header = documentRef.createElement('div');
  header.className = 'wbs-view-header';

  const title = documentRef.createElement('div');
  title.className = 'wbs-view-title';
  title.textContent = viewTitle(viewId);

  const actions = documentRef.createElement('div');
  actions.className = 'wbs-view-actions';
  actions.setAttribute('aria-label', 'ابزارهای نما');

  header.append(title, actions);
  return header;
}

function ensureStandardFrame(root, viewId){
  if(!STANDARD_VIEWS.has(viewId)) return;
  const tree = root.querySelector(':scope > .wbs-tree');
  if(!tree) return;

  let frame = root.querySelector(':scope > .wbs-view-frame.is-standard-view');
  if(!frame){
    frame = root.ownerDocument.createElement('section');
    frame.className = 'wbs-view-frame is-standard-view';
    frame.dataset.view = viewId;

    const header = createHeader(root.ownerDocument, viewId);
    const body = root.ownerDocument.createElement('div');
    body.className = 'wbs-view-body';

    root.insertBefore(frame, tree);
    frame.append(header, body);
    body.appendChild(tree);
  }

  frame.dataset.view = viewId;
  const title = frame.querySelector(':scope > .wbs-view-header > .wbs-view-title');
  if(title) title.textContent = viewTitle(viewId);

  const body = frame.querySelector(':scope > .wbs-view-body');
  const general = root.querySelector(':scope > .wbs-general');
  if(body && general) body.appendChild(general);
}

function materialIcon(path){
  return `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function activeProject(){
  const id = projectContext.getProjectId?.() || projectContext.getActiveProjectId?.() || null;
  return id ? projectRepository.getActiveProject(id) : null;
}

function openCreateRootSheet(project){
  if(!project) return;
  openWbsSheet({
    title:'افزودن بسته کار',
    saveLabel:'ذخیره',
    body(sheetRoot){
      sheetRoot.appendChild(fieldRow('نام مرحله', textInput('', { name:'title', placeholder:'نام مرحله' })));
      sheetRoot.appendChild(fieldRow('وزن پیشرفت', textInput('1', { name:'progressWeight', type:'number', min:'0.01', step:'0.01', required:true })));
      const note = sheetRoot.ownerDocument.createElement('div');
      note.className = 'wbs-note';
      note.textContent = 'وزن نسبی است؛ لازم نیست مجموع وزن‌ها ۱۰۰ شود.';
      sheetRoot.appendChild(note);
    },
    onSave(sheetRoot){
      const title = sheetRoot.querySelector('[name="title"]')?.value.trim();
      const progressWeight = Number(sheetRoot.querySelector('[name="progressWeight"]')?.value);
      if(!title || !Number.isFinite(progressWeight) || progressWeight <= 0) return false;
      wbsApi.createStage(project.id, title, null, { progressWeight });
      return true;
    },
  });
}

function ensureCostlineToolbar(root){
  if(root.querySelector(':scope > .wbs-toolbar')) return;
  const tabs = root.querySelector(':scope > .wbs-tabs');
  if(!tabs) return;
  const project = activeProject();
  if(!project) return;

  const toolbar = root.ownerDocument.createElement('div');
  toolbar.className = 'wbs-toolbar is-single-action';
  const addRoot = root.ownerDocument.createElement('button');
  addRoot.type = 'button';
  addRoot.className = 'wbs-root-add';
  addRoot.setAttribute('aria-label', 'افزودن بسته کار');
  addRoot.innerHTML = `${materialIcon(ADD_WORK_PACKAGE_ICON)}<span>بسته کار</span>`;
  addRoot.addEventListener('click', () => openCreateRootSheet(project));
  toolbar.appendChild(addRoot);
  tabs.insertAdjacentElement('afterend', toolbar);
}

function syncTimelineToolbarSlot(root){
  const toolbar = root.querySelector(':scope > .wbs-toolbar');
  const slot = root.querySelector(':scope > .wbs-toolbar-slot');
  if(toolbar){
    slot?.remove();
    return;
  }
  if(slot) return;
  const tabs = root.querySelector(':scope > .wbs-tabs');
  if(!tabs) return;
  const nextSlot = root.ownerDocument.createElement('div');
  nextSlot.className = 'wbs-toolbar-slot';
  nextSlot.setAttribute('aria-hidden', 'true');
  tabs.insertAdjacentElement('afterend', nextSlot);
}

function syncRoot(root){
  const viewId = activeViewId(root);
  if(STANDARD_VIEWS.has(viewId)) ensureStandardFrame(root, viewId);
  if(viewId === 'costline') ensureCostlineToolbar(root);
  if(viewId === 'timeline') syncTimelineToolbarSlot(root);
}

let observer = null;
let queued = false;

function syncAll(documentRef){
  documentRef.querySelectorAll('.wbs-home-root').forEach(syncRoot);
}

export function installViewFrameEnhancement(documentRef){
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  const MutationObserverRef = doc?.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
  if(observer || !doc?.documentElement || !MutationObserverRef) return;
  const enqueue = typeof queueMicrotask === 'function' ? queueMicrotask : callback => Promise.resolve().then(callback);
  const schedule = () => {
    if(queued) return;
    queued = true;
    enqueue(() => {
      queued = false;
      syncAll(doc);
    });
  };
  observer = new MutationObserverRef(schedule);
  observer.observe(doc.documentElement, { childList:true, subtree:true });
  schedule();
}

installViewFrameEnhancement();
