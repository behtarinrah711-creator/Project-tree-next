import {
  collectCompleted, collectStarred, collectTrashed, createNotebookItem, createNotebookRepository,
  findNotebookItem, sumCost,
} from '../../data/notebookRepository.js';

function el(html){
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[ch]));
}

export function installNotebookWorkspace({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  repository = createNotebookRepository(),
} = {}){
  const page = documentRef?.getElementById?.('notebookPage');
  const exportPage = documentRef?.getElementById?.('notebookExportPage');
  if(!page) return null;
  repository.load();

  function isNotebookRoute(){
    return /^#\/notebook/i.test(String(windowRef.location.hash || ''));
  }

  function applySurface(){
    const on = isNotebookRoute();
    documentRef.body?.classList.toggle('global-surface', on);
    documentRef.getElementById('bottomNav')?.classList.toggle('hidden', on);
    page.classList.toggle('hidden', !on || /\/export/i.test(windowRef.location.hash || ''));
    exportPage?.classList.toggle('hidden', !/\/notebook\/export/i.test(windowRef.location.hash || ''));
    if(on && !/\/export/i.test(windowRef.location.hash || '')) render();
    if(/\/notebook\/export/i.test(windowRef.location.hash || '')) renderExport();
  }

  function openNotebook(){
    windowRef.location.hash = '#/notebook';
  }
  function openExport(){
    windowRef.location.hash = '#/notebook/export';
  }

  function renderTree(items, depth = 0){
    return (items || []).filter(item => !item.trashed && !item.done).map(item => `
      <li class="nb-item" data-id="${escapeHtml(item.id)}" style="padding-right:${depth * 14}px">
        <button type="button" class="nb-open" data-id="${escapeHtml(item.id)}">${escapeHtml(item.text || 'بدون عنوان')}</button>
        ${item.starred ? '<span aria-hidden="true">⭐</span>' : ''}
        ${item.cost != null && item.cost !== '' ? `<span class="nb-cost">${escapeHtml(item.cost)}</span>` : ''}
      </li>
      ${renderTree(item.children || [], depth + 1)}
    `).join('');
  }

  function render(){
    const nb = repository.get();
    const active = nb.lists.find(list => list.id === nb.activeListId && !list.trashed) || nb.lists.find(list => !list.trashed);
    const body = page.querySelector('#notebookPageBody');
    if(!body || !active) return;
    const completed = collectCompleted(active.items);
    const starred = collectStarred(nb);
    body.innerHTML = `
      <div class="nb-tabs" role="tablist">
        <button type="button" class="nb-tab ${nb.activeListId === '__starred__' ? 'active' : ''}" data-starred="1">⭐</button>
        ${nb.lists.filter(list => !list.trashed).map(list => `
          <button type="button" class="nb-tab ${list.id === active.id && nb.activeListId !== '__starred__' ? 'active' : ''}" data-list="${escapeHtml(list.id)}">${escapeHtml(list.title)}</button>
        `).join('')}
        <button type="button" class="nb-tab" data-add-list="1">+</button>
      </div>
      <div class="nb-toolbar">
        <button type="button" id="nbAddRoot">افزودن</button>
        <a href="#/notebook/export" id="nbExportLink">خروجی</a>
        <button type="button" id="nbOpenTrash">حذف‌شده‌ها</button>
      </div>
      ${nb.activeListId === '__starred__' ? `
        <ul class="nb-tree">${starred.map(row => `
          <li class="nb-item"><button type="button" class="nb-open" data-id="${escapeHtml(row.item.id)}">${escapeHtml(row.item.text)}</button>
          <small>${escapeHtml(row.listTitle)}</small></li>`).join('')}</ul>
      ` : `
        <ul class="nb-tree">${renderTree(active.items)}</ul>
        <details class="nb-completed"><summary>انجام‌شده‌ها (${completed.length})</summary>
          <ul>${completed.map(item => `<li><button type="button" class="nb-open" data-id="${escapeHtml(item.id)}">${escapeHtml(item.text)}</button></li>`).join('')}</ul>
        </details>
        <div class="nb-total">جمع: ${sumCost(active.items)}</div>
      `}
    `;
    body.querySelector('#nbAddRoot')?.addEventListener('click', () => {
      const text = windowRef.prompt?.('عنوان آیتم') || 'آیتم جدید';
      repository.mutate(data => {
        const list = data.lists.find(entry => entry.id === data.activeListId);
        list?.items.push(createNotebookItem(text));
      });
      render();
    });
    body.querySelector('#nbOpenTrash')?.addEventListener('click', renderTrash);
    body.querySelector('#nbExportLink')?.addEventListener('click', event => {
      event.preventDefault();
      openExport();
    });
    body.querySelectorAll('[data-list]').forEach(btn => btn.addEventListener('click', () => {
      repository.mutate(data => { data.activeListId = btn.getAttribute('data-list'); });
      render();
    }));
    body.querySelector('[data-starred]')?.addEventListener('click', () => {
      repository.mutate(data => { data.activeListId = '__starred__'; });
      render();
    });
    body.querySelector('[data-add-list]')?.addEventListener('click', () => {
      const title = windowRef.prompt?.('نام فهرست') || 'فهرست جدید';
      repository.mutate(data => {
        const list = { id: `nbl-${Date.now().toString(36)}`, title, createdAt: Date.now(), updatedAt: Date.now(), items: [] };
        data.lists.push(list);
        data.activeListId = list.id;
      });
      render();
    });
    body.querySelectorAll('.nb-open').forEach(btn => btn.addEventListener('click', () => openSheet(btn.getAttribute('data-id'))));
  }

  function openSheet(itemId){
    const nb = repository.get();
    let found = null;
    for(const list of nb.lists){
      found = findNotebookItem(list.items, itemId);
      if(found) break;
    }
    if(!found) return;
    const title = windowRef.prompt?.('ویرایش عنوان', found.item.text);
    if(title == null) return;
    repository.mutate(data => {
      for(const list of data.lists){
        const hit = findNotebookItem(list.items, itemId);
        if(hit){
          hit.item.text = title;
          hit.item.updatedAt = Date.now();
        }
      }
    });
    render();
  }

  function renderTrash(){
    const body = page.querySelector('#notebookPageBody');
    const rows = collectTrashed(repository.get());
    body.innerHTML = `
      <button type="button" id="nbBackFromTrash">بازگشت</button>
      <h2>حذف‌شده‌های دفترچه</h2>
      <ul>${rows.map((row, index) => `
        <li>${escapeHtml(row.item?.text || row.list?.title || '')}
          <button type="button" data-restore="${index}">بازگردانی</button>
        </li>`).join('')}</ul>`;
    body.querySelector('#nbBackFromTrash')?.addEventListener('click', render);
  }

  function renderExport(){
    if(!exportPage) return;
    const dest = exportPage.querySelector('#notebookExportBody');
    if(!dest) return;
    const nb = repository.get();
    dest.innerHTML = `<pre class="nb-export">${escapeHtml(JSON.stringify(nb, null, 2))}</pre>
      <button type="button" id="nbPrintExport">PDF / چاپ</button>`;
    dest.querySelector('#nbPrintExport')?.addEventListener('click', () => windowRef.print?.());
  }

  windowRef.addEventListener('karha:open-notebook', () => {
    const route = '#/notebook';
    windowRef.KarhaBrowserHistory?.push?.(
      windowRef.KarhaBrowserHistory.stateForRoute?.({projectId:null,moduleId:'notebook',hash:route}) || {hash:route},
      route
    ) || (windowRef.location.hash = route);
    applySurface();
  });
  windowRef.addEventListener('karha:close-notebook', () => {
    windowRef.KarhaBrowserHistory?.back?.();
    applySurface();
  });
  windowRef.addEventListener('hashchange', applySurface);
  windowRef.addEventListener('karha:workspace-route-synced', applySurface);
  applySurface();

  return { openNotebook, openExport, applySurface, repository, render };
}
