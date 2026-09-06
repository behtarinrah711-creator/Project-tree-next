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

function syncTreeModeActions(root, frame){
  const actions = frame.querySelector(':scope > .wbs-view-header > .wbs-view-actions');
  const modeTabs = root.querySelector(':scope > .wbs-tree-mode-tabs');
  if(actions && modeTabs) actions.appendChild(modeTabs);
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

  syncTreeModeActions(root, frame);

  const body = frame.querySelector(':scope > .wbs-view-body');
  const general = root.querySelector(':scope > .wbs-general');
  if(body && general) body.appendChild(general);
}

function syncRoot(root){
  const viewId = activeViewId(root);
  ensureViewToolbar(root, viewId);
  if(STANDARD_VIEWS.has(viewId)) ensureStandardFrame(root, viewId);
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
