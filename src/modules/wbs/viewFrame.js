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

function normalizeTimelineFrame(root){
  const gantt = root.querySelector('.wbs-gantt');
  if(!gantt) return;
  gantt.classList.add('wbs-view-frame', 'is-timeline-frame');

  const corner = gantt.querySelector('.wbs-gantt-corner');
  if(corner) corner.classList.add('wbs-view-header-surface');
  const scaleHeader = gantt.querySelector('.wbs-gantt-header');
  if(scaleHeader) scaleHeader.classList.add('wbs-view-header-surface');

  const title = corner?.querySelector('.wbs-gantt-project-title');
  if(title){
    title.classList.add('wbs-view-title');
    title.textContent = viewTitle('timeline');
  }

  const toggle = corner?.querySelector('.wbs-timescale-toggle');
  if(toggle && !toggle.closest('.wbs-view-actions')){
    const actions = root.ownerDocument.createElement('div');
    actions.className = 'wbs-view-actions';
    toggle.replaceWith(actions);
    actions.appendChild(toggle);
  }
}

function normalizeCostlineFrame(root){
  const frame = root.querySelector('.wbs-costline');
  if(!frame) return;
  frame.classList.add('wbs-view-frame', 'is-costline-frame');
  frame.querySelector('.wbs-costline-toolbar')?.classList.add('wbs-view-header');
  frame.querySelector('.wbs-costline-project')?.classList.add('wbs-view-title');
  frame.querySelector('.wbs-costline-controls')?.classList.add('wbs-view-actions');
  frame.querySelector('.wbs-costline-chart')?.classList.add('wbs-view-body');
}

function syncRoot(root){
  const viewId = activeViewId(root);
  ensureStandardFrame(root, viewId);
  if(viewId === 'timeline') normalizeTimelineFrame(root);
  if(viewId === 'costline') normalizeCostlineFrame(root);
}

let observer = null;
let queued = false;

function syncAll(documentRef){
  documentRef.querySelectorAll('.wbs-home-root').forEach(syncRoot);
}

export function installViewFrameEnhancement(documentRef = document){
  if(observer || !documentRef?.documentElement) return;
  const schedule = () => {
    if(queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      syncAll(documentRef);
    });
  };
  observer = new MutationObserver(schedule);
  observer.observe(documentRef.documentElement, { childList:true, subtree:true });
  schedule();
}

installViewFrameEnhancement();
