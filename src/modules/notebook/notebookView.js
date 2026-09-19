import { collectCompleted, collectStarred, collectTrashed, createNotebookItem, createNotebookRepository, findNotebookItem, sumCost } from '../../data/notebookRepository.js';
import { notebookIcons } from './notebookIcons.js';
import { installNotebookExportView } from './notebookExportView.js';
import { openConfirm } from '../../ui/confirm.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const star='<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1 6.1-5.5-2.9L6.5 20l1-6.1L3 9.5l6.2-.9Z"/></svg>';
const chev='<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
const grip='<svg viewBox="0 0 12 20"><circle cx="3" cy="4" r="1.2"/><circle cx="9" cy="4" r="1.2"/><circle cx="3" cy="10" r="1.2"/><circle cx="9" cy="10" r="1.2"/><circle cx="3" cy="16" r="1.2"/><circle cx="9" cy="16" r="1.2"/></svg>';
const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const formatCost=value=>new Intl.NumberFormat('fa-IR').format(Number(value)||0);

export function installNotebookWorkspace({documentRef=globalThis.document,windowRef=globalThis.window,repository=createNotebookRepository()}={}){
  const page=documentRef?.getElementById?.('notebookPage');
  if(!page)return null;
  repository.load();
  const exportView=installNotebookExportView({documentRef,windowRef});
  let editor=null, sheetItemId=null;
  const onRoute=()=>/^#\/notebook/i.test(String(windowRef.location.hash||''));
  const available=nb=>(nb.lists||[]).filter(list=>!list.trashed&&!list.archived);
  const active=nb=>available(nb).find(list=>list.id===nb.activeListId)||available(nb)[0]||null;
  function locate(nb,id){for(const list of nb.lists||[]){const hit=findNotebookItem(list.items,id);if(hit)return{...hit,list};}return null;}
  function change(id,fn){repository.mutate(nb=>{const hit=locate(nb,id);if(hit){fn(hit.item,hit);hit.item.updatedAt=Date.now();hit.list.updatedAt=Date.now();}});}
  function ensureActive(nb){
    let next=active(nb);
    if(!next){next={id:uid('nbl'),title:'کارهای شخصی',items:[],createdAt:Date.now(),updatedAt:Date.now(),archived:false,trashed:false,showCost:true};nb.lists.push(next);}
    nb.activeListId=next.id;return next;
  }
  function confirmAction(message,action){
    openConfirm(message,action,'حذف',{documentRef});
  }
  function rows(items,{depth=0,source=null,showCost=true}={}){
    return(items||[]).filter(item=>!item.trashed&&!item.done).map(item=>{
      const kids=(item.children||[]).filter(child=>!child.trashed&&!child.done);
      return `<div class="nb-node" data-id="${esc(item.id)}"><div class="nb-row" data-depth="${depth}" style="--nb-depth:${depth}">
        <button type="button" data-act="expand" aria-label="باز و بسته کردن" class="nb-expand ${kids.length?'':'empty'} ${item.expanded===false?'collapsed':''}">${chev}</button>
        <button type="button" data-act="done" aria-label="انجام شد" class="nb-check"></button><button type="button" data-act="edit" class="nb-title">${esc(item.text||'بدون عنوان')}${source?`<small>${esc(source)}</small>`:''}</button>
        ${showCost&&item.cost!=null&&item.cost!==''?`<span class="nb-cost">${formatCost(item.cost)} تومان</span>`:''}
        <button type="button" data-act="star" aria-label="ستاره" class="nb-star ${item.starred?'active':''}">${star}</button><button type="button" data-act="child" aria-label="افزودن زیردسته" class="nb-child">＋</button><span class="nb-grip">${grip}</span>
      </div>${source||item.expanded===false?'':`<div class="nb-children">${rows(item.children,{depth:depth+1,showCost})}</div>`}${editor?.mode==='item'&&editor.parentId===item.id?editorHtml():''}</div>`;
    }).join('');
  }
  function editorHtml(){
    if(!editor)return'';
    const title=editor.mode==='list'?'افزودن دفتر':editor.mode==='rename'?'ویرایش نام دفتر':'افزودن مورد';
    return `<form class="nb-editor ${editor.parentId?'is-child':''}" style="--nb-entry-depth:${editor.depth||0}" data-editor-form><strong>${title}</strong><input id="nbInput" value="${esc(editor.value||'')}" enterkeyhint="done" autocomplete="off" placeholder="عنوان را بنویسید…"><div><button type="button" data-editor="cancel">لغو</button><button type="submit" class="primary" data-editor="save">ثبت</button></div></form>`;
  }
  function actionButton(action,label,icon,danger=false){return `<button type="button" class="nb-action-icon ${danger?'danger':''}" data-project-action="${action}" title="${label}" aria-label="${label}">${icon}</button>`;}
  function actionsHtml(list,starredMode){
    if(starredMode)return'<div class="nb-actions"><strong>ستاره‌دارها</strong></div>';
    return `<div class="nb-actions"><strong>${esc(list.title)}</strong><div class="nb-project-actions" aria-label="عملیات دفتر">
      ${actionButton('rename','ویرایش نام',notebookIcons.edit)}${actionButton('archive','آرشیو',notebookIcons.archive)}${actionButton('export','خروجی',notebookIcons.export)}${actionButton('delete','حذف',notebookIcons.trash,true)}
      ${actionButton('trash','حذف‌شده‌ها',notebookIcons.deleted)}
      <label class="nb-cost-toggle"><input type="checkbox" data-cost-toggle ${list.showCost!==false?'checked':''}><span aria-hidden="true"></span><b>نمایش هزینه</b></label>
    </div></div>`;
  }
  function sheetHtml(){
    if(!sheetItemId)return'';const hit=locate(repository.get(),sheetItemId);if(!hit)return'';
    return `<div class="nb-sheet-backdrop" data-sheet-close><section class="nb-item-sheet" role="dialog" aria-modal="true" aria-labelledby="nbSheetTitle" data-sheet-panel>
      <header><button type="button" data-sheet-close aria-label="بستن">×</button><h2 id="nbSheetTitle">ویرایش دسته</h2><button type="button" data-sheet-save>ذخیره</button></header>
      <label>عنوان دسته<input id="nbSheetName" value="${esc(hit.item.text)}" autocomplete="off"></label>
      <label>هزینه<input id="nbSheetCost" value="${esc(hit.item.cost??'')}" inputmode="numeric" placeholder="مبلغ به تومان (اختیاری)"></label>
      <button type="button" class="nb-sheet-child" data-sheet-child>${notebookIcons.child}<span>افزودن زیردسته</span></button>
      <button type="button" class="nb-sheet-delete" data-sheet-delete>حذف دسته</button>
    </section></div>`;
  }
  function centerActiveTab({smooth=true}={}){
    const tab=page.querySelector('.nb-tab[data-list].active'),strip=page.querySelector('.nb-tabs');
    if(!tab||!strip)return;
    tab.scrollIntoView?.({behavior:smooth?'smooth':'auto',block:'nearest',inline:'center'});
  }
  function render(){
    const nb=repository.get(),list=active(nb),body=page.querySelector('#notebookPageBody');if(!body)return;
    if(!list){repository.mutate(ensureActive);return render();}
    const starredMode=nb.activeListId==='__starred__',starred=collectStarred(nb),completed=starredMode?[]:collectCompleted(list.items);
    const content=starredMode?starred.map(entry=>rows([entry.item],{source:`${entry.listTitle}${entry.parentText?' ← '+entry.parentText:''}`,showCost:true})).join(''):rows(list.items,{showCost:list.showCost!==false});
    body.innerHTML=`<div class="nb-workspace"><nav class="nb-tabs" aria-label="دفترها"><button type="button" data-starred class="nb-tab nb-star-tab ${starredMode?'active':''}">${star}</button>
      ${available(nb).map(item=>`<button type="button" data-list="${esc(item.id)}" class="nb-tab ${!starredMode&&item.id===list.id?'active':''}"><span>${esc(item.title)}</span><small>${(item.items||[]).filter(entry=>!entry.done&&!entry.trashed).length.toLocaleString('fa-IR')}</small></button>`).join('')}
      <button type="button" data-add-list class="nb-tab nb-add-tab" aria-label="افزودن دفتر">＋</button></nav>
      ${actionsHtml(list,starredMode)}<main class="nb-list">${content||`<div class="nb-empty">${starredMode?'هنوز چیزی ستاره‌دار نشده است.':'هنوز موردی در این دفتر نیست.'}</div>`}${editor?.mode==='item'&&!editor.parentId?editorHtml():''}</main>
      ${starredMode?'':`<button type="button" data-add-root class="nb-add-root">＋ افزودن مورد</button><details class="nb-completed"><summary>انجام‌شده‌ها (${completed.length.toLocaleString('fa-IR')})</summary>${completed.map(item=>`<div class="nb-done-row">${esc(item.text)}<button type="button" data-restore="${esc(item.id)}">بازگردانی</button></div>`).join('')}</details>${list.showCost!==false?`<div class="nb-total">جمع: ${formatCost(sumCost(list.items))} تومان</div>`:''}`}
      ${editor?.mode!=='item'?editorHtml():''}${sheetHtml()}</div>`;
    bind(body);queueMicrotask(()=>{if(editor)body.querySelector('#nbInput')?.focus();if(sheetItemId)body.querySelector('#nbSheetName')?.focus();centerActiveTab({smooth:false});});
  }
  function saveInline(body,{continueEntry=false}={}){
    const value=body.querySelector('#nbInput')?.value.trim();if(!value)return;
    const current={...editor};
    if(current.mode==='list')repository.mutate(nb=>{const list={id:uid('nbl'),title:value,items:[],createdAt:Date.now(),updatedAt:Date.now(),archived:false,trashed:false,showCost:true};nb.lists.push(list);nb.activeListId=list.id;});
    else if(current.mode==='rename')repository.mutate(nb=>{const list=nb.lists.find(item=>item.id===current.listId);if(list){list.title=value;list.updatedAt=Date.now();}});
    else repository.mutate(nb=>{const item=createNotebookItem(value);current.parentId?locate(nb,current.parentId)?.item.children.push(item):active(nb)?.items.push(item);});
    editor=continueEntry&&current.mode==='item'?{mode:'item',parentId:current.parentId||null,depth:current.depth||0}:null;render();
  }
  function saveSheet(body){
    const name=body.querySelector('#nbSheetName')?.value.trim();if(!name)return;
    const raw=body.querySelector('#nbSheetCost')?.value.replace(/[^0-9]/g,'')||'';
    change(sheetItemId,item=>{item.text=name;item.cost=raw===''?null:Number(raw);});sheetItemId=null;render();
  }
  function archiveList(listId){repository.mutate(nb=>{const list=nb.lists.find(item=>item.id===listId);if(list){list.archived=true;list.updatedAt=Date.now();}ensureActive(nb);});editor=null;sheetItemId=null;render();}
  function deleteList(listId){repository.mutate(nb=>{const list=nb.lists.find(item=>item.id===listId);if(list){list.trashed=true;list.deletedAt=Date.now();list.updatedAt=Date.now();}ensureActive(nb);});editor=null;sheetItemId=null;render();}
  function bind(body){
    body.querySelectorAll('[data-list]').forEach(button=>button.onclick=()=>{repository.mutate(nb=>{nb.activeListId=button.dataset.list;});editor=null;sheetItemId=null;render();});
    body.querySelector('[data-starred]')?.addEventListener('click',()=>{repository.mutate(nb=>{nb.activeListId='__starred__';});editor=null;sheetItemId=null;render();});
    body.querySelector('[data-add-list]')?.addEventListener('click',()=>{editor={mode:'list'};render();});
    body.querySelector('[data-add-root]')?.addEventListener('click',()=>{editor={mode:'item',parentId:null,depth:0};render();});
    body.querySelectorAll('[data-restore]').forEach(button=>button.onclick=()=>{change(button.dataset.restore,item=>{item.done=false;item.completedAt=null;});render();});
    body.querySelectorAll('.nb-row').forEach(row=>row.onclick=event=>{const action=event.target.closest('[data-act]')?.dataset.act;if(!action)return;const id=row.closest('.nb-node').dataset.id;
      if(action==='star')change(id,item=>{item.starred=!item.starred;});else if(action==='done')change(id,item=>{item.done=true;item.completedAt=Date.now();});else if(action==='expand')change(id,item=>{item.expanded=item.expanded===false;});
      else if(action==='child'){change(id,item=>{item.expanded=true;});editor={mode:'item',parentId:id,depth:Number(row.dataset.depth||0)+1};}else if(action==='edit')sheetItemId=id;render();});
    body.querySelector('[data-editor-form]')?.addEventListener('submit',event=>{event.preventDefault();saveInline(body,{continueEntry:editor?.mode==='item'});});
    body.querySelector('[data-editor="cancel"]')?.addEventListener('click',()=>{editor=null;render();});
    body.querySelector('#nbInput')?.addEventListener('keydown',event=>{if(event.key==='Escape'){editor=null;render();}});
    body.querySelector('[data-cost-toggle]')?.addEventListener('change',event=>{repository.mutate(nb=>{const list=active(nb);if(list)list.showCost=event.target.checked;});render();});
    body.querySelectorAll('[data-project-action]').forEach(button=>button.onclick=()=>{const list=active(repository.get());if(!list)return;const action=button.dataset.projectAction;
      if(action==='rename'){editor={mode:'rename',listId:list.id,value:list.title};render();}
      else if(action==='archive')archiveList(list.id);
      else if(action==='export')exportView.open(list,{trigger:button});
      else if(action==='delete')confirmAction('آیا این دفتر حذف شود؟',()=>deleteList(list.id));
      else if(action==='trash')trash();
    });
    body.querySelectorAll('[data-sheet-close]').forEach(element=>element.onclick=event=>{if(event.target.closest('[data-sheet-panel]')&&!event.target.matches('[data-sheet-close]'))return;sheetItemId=null;render();});
    body.querySelector('[data-sheet-save]')?.addEventListener('click',()=>saveSheet(body));
    body.querySelector('[data-sheet-child]')?.addEventListener('click',()=>{const parentId=sheetItemId,depth=(locate(repository.get(),parentId)?.parents.length||0)+1;change(parentId,item=>{item.expanded=true;});sheetItemId=null;editor={mode:'item',parentId,depth};render();});
    body.querySelector('[data-sheet-delete]')?.addEventListener('click',()=>confirmAction('آیا این دسته حذف شود؟',()=>{change(sheetItemId,item=>{item.trashed=true;item.deletedAt=Date.now();});sheetItemId=null;render();}));
  }
  function trash(){
    const body=page.querySelector('#notebookPageBody'),nb=repository.get(),archived=nb.lists.filter(list=>list.archived&&!list.trashed),deleted=collectTrashed(nb);
    const section=(title,items,kind)=>`<section class="nb-trash-section"><h2>${title}</h2>${items.length?items.map((row,index)=>`<div><span>${esc(kind==='archive'?row.title:(row.item?.text||row.list?.title))}</span><button type="button" data-${kind}-restore="${index}">بازگردانی</button></div>`).join(''):'<p>موردی وجود ندارد.</p>'}</section>`;
    body.innerHTML=`<div class="nb-trash"><button type="button" data-back>بازگشت</button><h1>آرشیو و حذف‌شده‌ها</h1>${section('آرشیوشده‌ها',archived,'archive')}${section('حذف‌شده‌ها',deleted,'trash')}</div>`;
    body.querySelector('[data-back]').onclick=render;
    body.querySelectorAll('[data-archive-restore]').forEach(button=>button.onclick=()=>{repository.mutate(data=>{const list=data.lists.find(item=>item.id===archived[+button.dataset.archiveRestore].id);if(list)list.archived=false;});trash();});
    body.querySelectorAll('[data-trash-restore]').forEach(button=>button.onclick=()=>{const row=deleted[+button.dataset.trashRestore];repository.mutate(data=>{const target=row.kind==='list'?data.lists.find(list=>list.id===row.list.id):locate(data,row.item.id)?.item;if(target){target.trashed=false;target.deletedAt=null;}});trash();});
  }
  function applySurface(){
    const notebookRoute=onRoute(),exportRoute=/\/notebook\/export/i.test(windowRef.location.hash||''),on=notebookRoute&&!exportRoute;
    documentRef.body?.classList.toggle('global-surface',notebookRoute);page.classList.toggle('hidden',!on);
    if(on)render();else if(exportRoute){const list=active(repository.get());if(list)exportView.open(list);}
    windowRef.KarhaWorkspaceChrome?.updateWorkspaceContextBar?.();
  }
  const openNotebook=()=>windowRef.location.hash='#/notebook';
  windowRef.addEventListener('karha:open-notebook',()=>{const route='#/notebook';windowRef.KarhaBrowserHistory?.push?.(windowRef.KarhaBrowserHistory.stateForRoute?.({projectId:null,moduleId:'notebook',hash:route})||{hash:route},route)||(windowRef.location.hash=route);applySurface();});
  windowRef.addEventListener('karha:close-notebook',()=>{windowRef.KarhaBrowserHistory?.back?.();applySurface();});windowRef.addEventListener('hashchange',applySurface);windowRef.addEventListener('karha:workspace-route-synced',applySurface);applySurface();
  return{openNotebook,applySurface,repository,render,centerActiveTab,exportView};
}
