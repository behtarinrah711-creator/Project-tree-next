import { collectCompleted, collectStarred, collectTrashed, createNotebookItem, createNotebookRepository, findNotebookItem, sumCost } from '../../data/notebookRepository.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const star='<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1 6.1-5.5-2.9L6.5 20l1-6.1L3 9.5l6.2-.9Z"/></svg>';
const chev='<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
const grip='<svg viewBox="0 0 12 20"><circle cx="3" cy="4" r="1.2"/><circle cx="9" cy="4" r="1.2"/><circle cx="3" cy="10" r="1.2"/><circle cx="9" cy="10" r="1.2"/><circle cx="3" cy="16" r="1.2"/><circle cx="9" cy="16" r="1.2"/></svg>';
const uid=p=>`${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

export function installNotebookWorkspace({documentRef=globalThis.document,windowRef=globalThis.window,repository=createNotebookRepository()}={}){
  const page=documentRef?.getElementById?.('notebookPage'), exportPage=documentRef?.getElementById?.('notebookExportPage');
  if(!page)return null;
  repository.load(); let editor=null;
  const onRoute=()=>/^#\/notebook/i.test(String(windowRef.location.hash||''));
  const active=nb=>nb.lists.find(x=>x.id===nb.activeListId&&!x.trashed)||nb.lists.find(x=>!x.trashed);
  function locate(nb,id){for(const list of nb.lists){const hit=findNotebookItem(list.items,id);if(hit)return{...hit,list};}return null;}
  function change(id,fn){repository.mutate(nb=>{const hit=locate(nb,id);if(hit){fn(hit.item,hit);hit.item.updatedAt=Date.now();hit.list.updatedAt=Date.now();}});}
  function rows(items,depth=0,source=null){
    return(items||[]).filter(x=>!x.trashed&&!x.done).map(item=>{
      const kids=(item.children||[]).filter(x=>!x.trashed&&!x.done);
      return `<div class="nb-node" data-id="${esc(item.id)}"><div class="nb-row" style="--nb-depth:${depth}">
        <span class="nb-grip">${grip}</span><button data-act="expand" class="nb-expand ${kids.length?'':'empty'} ${item.expanded===false?'collapsed':''}">${chev}</button>
        <button data-act="done" class="nb-check"></button><button data-act="edit" class="nb-title">${esc(item.text||'بدون عنوان')}${source?`<small>${esc(source)}</small>`:''}</button>
        ${item.cost!=null&&item.cost!==''?`<span class="nb-cost">${new Intl.NumberFormat('fa-IR').format(Number(item.cost)||0)} تومان</span>`:''}
        <button data-act="star" class="nb-star ${item.starred?'active':''}">${star}</button><button data-act="child" class="nb-child">＋</button>
      </div>${editor?.mode==='item'&&editor.parentId===item.id?editorHtml():''}${source||item.expanded===false?'':`<div class="nb-children">${rows(item.children,depth+1,null)}</div>`}</div>`;
    }).join('');
  }
  function editorHtml(){if(!editor)return'';return`<div class="nb-editor"><strong>${editor.mode==='list'?'افزودن دفتر':editor.mode==='edit'?'ویرایش مورد':editor.mode==='rename'?'ویرایش نام دفتر':'افزودن مورد'}</strong><input id="nbInput" value="${esc(editor.value||'')}" placeholder="عنوان را بنویسید…">${editor.mode==='edit'? `<input id="nbCostInput" inputmode="numeric" value="${esc(editor.cost??'')}" placeholder="مبلغ به تومان (اختیاری)">`:''}<div>${editor.mode==='edit'||editor.mode==='rename'?'<button class="danger" data-editor="delete">حذف</button>':''}<button data-editor="cancel">لغو</button><button class="primary" data-editor="save">ثبت</button></div></div>`;}
  function render(){
    const nb=repository.get(), list=active(nb), body=page.querySelector('#notebookPageBody');if(!body||!list)return;
    const starredMode=nb.activeListId==='__starred__', starred=collectStarred(nb), completed=starredMode?[]:collectCompleted(list.items);
    const content=starredMode?starred.map(x=>rows([x.item],0,`${x.listTitle}${x.parentText?' ← '+x.parentText:''}`)).join(''):rows(list.items);
    body.innerHTML=`<div class="nb-workspace"><nav class="nb-tabs"><button data-starred class="nb-tab nb-star-tab ${starredMode?'active':''}">${star}</button>
      ${nb.lists.filter(x=>!x.trashed).map(x=>`<button data-list="${esc(x.id)}" class="nb-tab ${!starredMode&&x.id===list.id?'active':''}"><span>${esc(x.title)}</span><small>${(x.items||[]).filter(i=>!i.done&&!i.trashed).length.toLocaleString('fa-IR')}</small></button>`).join('')}
      <button data-add-list class="nb-tab nb-add-tab">＋</button></nav>
      <div class="nb-actions"><strong>${starredMode?'ستاره‌دارها':esc(list.title)}</strong><span></span>${starredMode?'':'<button data-rename>ویرایش نام</button>'}<button data-trash>حذف‌شده‌ها</button><a href="#/notebook/export">خروجی</a></div>
      <main class="nb-list">${content||`<div class="nb-empty">${starredMode?'هنوز چیزی ستاره‌دار نشده است.':'هنوز موردی در این دفتر نیست.'}</div>`}${editor?.mode==='item'&&!editor.parentId?editorHtml():''}</main>
      ${starredMode?'':`<button data-add-root class="nb-add-root">＋ افزودن مورد</button><details class="nb-completed"><summary>انجام‌شده‌ها (${completed.length.toLocaleString('fa-IR')})</summary>${completed.map(x=>`<div class="nb-done-row">${esc(x.text)}<button data-restore="${esc(x.id)}">بازگردانی</button></div>`).join('')}</details><div class="nb-total">جمع: ${new Intl.NumberFormat('fa-IR').format(sumCost(list.items))} تومان</div>`}
      ${editor?.mode!=='item'?editorHtml():''}</div>`;
    bind(body);if(editor)queueMicrotask(()=>body.querySelector('#nbInput')?.focus());
  }
  function save(body){
    const value=body.querySelector('#nbInput')?.value.trim();if(!value)return;
    if(editor.mode==='list')repository.mutate(nb=>{const list={id:uid('nbl'),title:value,items:[],createdAt:Date.now(),updatedAt:Date.now()};nb.lists.push(list);nb.activeListId=list.id;});
    else if(editor.mode==='rename')repository.mutate(nb=>{const list=nb.lists.find(x=>x.id===editor.listId);if(list)list.title=value;});
    else if(editor.mode==='edit')change(editor.itemId,item=>{item.text=value;const raw=body.querySelector('#nbCostInput')?.value.replace(/[^0-9]/g,'')||'';item.cost=raw===''?null:Number(raw);});
    else repository.mutate(nb=>{const item=createNotebookItem(value);editor.parentId?locate(nb,editor.parentId)?.item.children.push(item):active(nb)?.items.push(item);});
    editor=null;render();
  }
  function bind(body){
    body.querySelectorAll('[data-list]').forEach(b=>b.onclick=()=>{repository.mutate(nb=>{nb.activeListId=b.dataset.list;});editor=null;render();});
    body.querySelector('[data-starred]')?.addEventListener('click',()=>{repository.mutate(nb=>{nb.activeListId='__starred__';});render();});
    body.querySelector('[data-add-list]')?.addEventListener('click',()=>{editor={mode:'list'};render();});
    body.querySelector('[data-add-root]')?.addEventListener('click',()=>{editor={mode:'item'};render();});
    body.querySelector('[data-rename]')?.addEventListener('click',()=>{const l=active(repository.get());editor={mode:'rename',listId:l.id,value:l.title};render();});
    body.querySelector('[data-trash]')?.addEventListener('click',trash);
    body.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{change(b.dataset.restore,x=>{x.done=false;x.completedAt=null;});render();});
    body.querySelectorAll('.nb-row').forEach(row=>row.onclick=e=>{const act=e.target.closest('[data-act]')?.dataset.act;if(!act)return;const id=row.closest('.nb-node').dataset.id,hit=locate(repository.get(),id);
      if(act==='star')change(id,x=>{x.starred=!x.starred;});if(act==='done')change(id,x=>{x.done=true;x.completedAt=Date.now();});if(act==='expand')change(id,x=>{x.expanded=x.expanded===false;});
      if(act==='child')editor={mode:'item',parentId:id};if(act==='edit')editor={mode:'edit',itemId:id,value:hit?.item.text,cost:hit?.item.cost};render();});
    body.querySelector('[data-editor="cancel"]')?.addEventListener('click',()=>{editor=null;render();});body.querySelector('[data-editor="save"]')?.addEventListener('click',()=>save(body));
    body.querySelector('[data-editor="delete"]')?.addEventListener('click',()=>{if(editor.mode==='edit')change(editor.itemId,item=>{item.trashed=true;item.deletedAt=Date.now();});else repository.mutate(nb=>{const list=nb.lists.find(x=>x.id===editor.listId);if(list){list.trashed=true;list.deletedAt=Date.now();}let next=nb.lists.find(x=>!x.trashed);if(!next){next={id:uid('nbl'),title:'کارهای شخصی',items:[],createdAt:Date.now(),updatedAt:Date.now()};nb.lists.push(next);}nb.activeListId=next.id;});editor=null;render();});
    body.querySelector('#nbInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')save(body);if(e.key==='Escape'){editor=null;render();}});
  }
  function trash(){const body=page.querySelector('#notebookPageBody'),all=collectTrashed(repository.get());body.innerHTML=`<div class="nb-trash"><button data-back>بازگشت</button><h2>حذف‌شده‌های دفترچه</h2>${all.length?all.map((x,i)=>`<div>${esc(x.item?.text||x.list?.title)}<button data-trash-restore="${i}">بازگردانی</button></div>`).join(''):'<p>موردی وجود ندارد.</p>'}</div>`;body.querySelector('[data-back]').onclick=render;body.querySelectorAll('[data-trash-restore]').forEach(b=>b.onclick=()=>{const row=all[+b.dataset.trashRestore];repository.mutate(nb=>{const x=row.kind==='list'?nb.lists.find(l=>l.id===row.list.id):locate(nb,row.item.id)?.item;if(x){x.trashed=false;x.deletedAt=null;}});trash();});}
  function renderExport(){const dest=exportPage?.querySelector('#notebookExportBody');if(!dest)return;dest.innerHTML=`<pre class="nb-export">${esc(JSON.stringify(repository.get(),null,2))}</pre><button id="nbPrintExport">PDF / چاپ</button>`;dest.querySelector('#nbPrintExport').onclick=()=>windowRef.print?.();}
  function applySurface(){const on=onRoute();documentRef.body?.classList.toggle('global-surface',on);documentRef.getElementById('bottomNav')?.classList.toggle('hidden',on);const title=documentRef.getElementById('topbarTitle'),main=title?.querySelector('.app-title-main');if(on){if(main)main.textContent='دفترچه یادداشت';title?.classList.add('notebook-context');title?.classList.remove('has-active-project');title?.setAttribute('aria-haspopup','true');title?.setAttribute('aria-label','باز کردن منو از دفترچه یادداشت');}page.classList.toggle('hidden',!on||/\/export/i.test(windowRef.location.hash||''));exportPage?.classList.toggle('hidden',!/\/notebook\/export/i.test(windowRef.location.hash||''));if(on&&!/\/export/i.test(windowRef.location.hash||''))render();if(/\/notebook\/export/i.test(windowRef.location.hash||''))renderExport();}
  const openNotebook=()=>windowRef.location.hash='#/notebook',openExport=()=>windowRef.location.hash='#/notebook/export';
  windowRef.addEventListener('karha:open-notebook',()=>{const route='#/notebook';windowRef.KarhaBrowserHistory?.push?.(windowRef.KarhaBrowserHistory.stateForRoute?.({projectId:null,moduleId:'notebook',hash:route})||{hash:route},route)||(windowRef.location.hash=route);applySurface();});
  windowRef.addEventListener('karha:close-notebook',()=>{windowRef.KarhaBrowserHistory?.back?.();applySurface();});windowRef.addEventListener('hashchange',applySurface);windowRef.addEventListener('karha:workspace-route-synced',applySurface);applySurface();
  return{openNotebook,openExport,applySurface,repository,render};
}
