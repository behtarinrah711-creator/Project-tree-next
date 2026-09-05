const SHOPPING_ICON = 'M221-120q-27 0-48-16.5T144-179L42-549q-5-19 6.5-35T80-600h190l176-262q5-8 14-13t19-5q10 0 19 5t14 13l176 262h192q20 0 31.5 16t6.5 35L816-179q-8 26-29 42.5T739-120H221Zm-1-80h520l88-320H132l88 320Zm316.5-103.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM367-600h225L479-768 367-600Zm113 240Z';

function materialIcon(path){
  return `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function directContent(root){
  return [...root.children].filter(node => !node.classList.contains('wbs-tabs') && !node.classList.contains('wbs-shopping-frame'));
}

function setShoppingActive(root, active){
  root.dataset.shoppingView = active ? 'active' : '';
  const tab = root.querySelector(':scope > .wbs-tabs > .wbs-shopping-tab');
  if(tab){
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  if(active){
    root.querySelectorAll(':scope > .wbs-tabs > .wbs-tab:not(.wbs-shopping-tab)').forEach(item => {
      item.classList.remove('active');
      item.setAttribute('aria-selected', 'false');
    });
    directContent(root).forEach(node => { node.hidden = true; });
  }else{
    directContent(root).forEach(node => { node.hidden = false; });
    root.querySelector(':scope > .wbs-shopping-frame')?.remove();
  }
}

function ensureFrame(root){
  let frame = root.querySelector(':scope > .wbs-shopping-frame');
  if(frame) return frame;
  frame = root.ownerDocument.createElement('section');
  frame.className = 'wbs-view-frame wbs-shopping-frame is-shopping-view';
  const header = root.ownerDocument.createElement('div');
  header.className = 'wbs-view-header';
  const title = root.ownerDocument.createElement('div');
  title.className = 'wbs-view-title';
  title.textContent = 'لیست خرید';
  const actions = root.ownerDocument.createElement('div');
  actions.className = 'wbs-view-actions';
  actions.setAttribute('aria-label', 'ابزارهای نما');
  const body = root.ownerDocument.createElement('div');
  body.className = 'wbs-view-body wbs-shopping-body';
  header.append(title, actions);
  frame.append(header, body);
  root.appendChild(frame);
  return frame;
}

function activate(root){
  setShoppingActive(root, true);
  ensureFrame(root);
}

function ensureTab(root){
  const tabs = root.querySelector(':scope > .wbs-tabs');
  if(!tabs) return null;
  let tab = tabs.querySelector(':scope > .wbs-shopping-tab');
  if(tab) return tab;
  tab = root.ownerDocument.createElement('button');
  tab.type = 'button';
  tab.className = 'wbs-tab wbs-shopping-tab';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');
  tab.setAttribute('aria-label', 'لیست خرید');
  tab.title = 'لیست خرید';
  tab.innerHTML = materialIcon(SHOPPING_ICON);
  tab.addEventListener('click', event => {
    event.preventDefault();
    activate(root);
  });
  tabs.appendChild(tab);
  return tab;
}

function bindNativeTabs(root){
  if(root.dataset.shoppingTabsBound === '1') return;
  root.dataset.shoppingTabsBound = '1';
  root.addEventListener('click', event => {
    const tab = event.target.closest('.wbs-tab');
    if(!tab || tab.classList.contains('wbs-shopping-tab')) return;
    if(root.dataset.shoppingView === 'active') setShoppingActive(root, false);
  }, true);
}

export function ensureShoppingView(root){
  ensureTab(root);
  bindNativeTabs(root);
  const active = root.dataset.shoppingView === 'active';
  if(active){
    setShoppingActive(root, true);
    ensureFrame(root);
  }
  return active;
}
