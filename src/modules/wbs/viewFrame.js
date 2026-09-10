import { ensureViewToolbar } from './viewToolbar.js';

export const WBS_VIEW_TITLES = Object.freeze({
  tree: 'درخت پروژه',
  timeline: 'نمودار گانت',
  costline: 'برآورد هزینه',
  shopping: 'لیست خرید',
});

const STANDARD_VIEWS = new Set(['tree']);

export function viewTitle(viewId){
  return WBS_VIEW_TITLES[viewId] || '';
}

function activeViewId(root){
  const active = root.querySelector(':scope > .wbs-tabs > .wbs-tab.active, :scope > .wbs-tabs > .wbs-tab[aria-selected="true"]');
  return active?.dataset.view || 'tree';
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

function ensureActionSeparator(actions){
  let separator = actions.querySelector(':scope > .wbs-view-action-separator');
  if(separator) return separator;
  separator = actions.ownerDocument.createElement('span');
  separator.className = 'wbs-view-action-separator';
  separator.setAttribute('aria-hidden', 'true');
  actions.appendChild(separator);
  return separator;
}

function syncTreeHeaderActions(root, frame){
  const actions = frame.querySelector(':scope > .wbs-view-header > .wbs-view-actions');
  if(!actions) return;

  const modeTabs = root.querySelector(':scope > .wbs-tree-mode-tabs');
  if(modeTabs) actions.appendChild(modeTabs);

  const toolbar = root.querySelector(':scope > .wbs-toolbar');
  const expand = toolbar?.querySelector('.wbs-tree-toggle');
  const addRoot = toolbar?.querySelector('.wbs-root-add');
  if(!expand && !addRoot) return;

  ensureActionSeparator(actions);
  if(expand) actions.appendChild(expand);
  if(addRoot) actions.appendChild(addRoot);
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

  syncTreeHeaderActions(root, frame);

  const body = frame.querySelector(':scope > .wbs-view-body');
  const general = root.querySelector(':scope > .wbs-general');
  if(body && general) body.appendChild(general);
}

function syncTimelineHeaderActions(root){
  const toolbar = root.querySelector(':scope > .wbs-toolbar');
  if(!toolbar) return;
  toolbar.querySelectorAll('.wbs-root-add').forEach(button => button.remove());
  if(!toolbar.children.length) toolbar.remove();
}

function removeCostlineRootActions(root){
  root.querySelectorAll(':scope > .wbs-toolbar .wbs-root-add').forEach(button => button.remove());
  const toolbar = root.querySelector(':scope > .wbs-toolbar');
  if(toolbar && !toolbar.children.length) toolbar.remove();
}

function syncRoot(root){
  const viewId = activeViewId(root);
  ensureViewToolbar(root, viewId);
  if(STANDARD_VIEWS.has(viewId)) ensureStandardFrame(root, viewId);
  if(viewId === 'timeline') syncTimelineHeaderActions(root);
  if(viewId === 'costline') removeCostlineRootActions(root);
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
