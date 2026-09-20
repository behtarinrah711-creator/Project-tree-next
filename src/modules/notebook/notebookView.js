import { canCompleteNotebookItem, collectCompletedFamilies, collectStarredFamilies, collectTrashed, createNotebookItem, createNotebookRepository, findNotebookItem, notebookItemCost, notebookItemCostLocked, restoreNotebookFamily, sumCost, toggleNotebookStar, walkNotebookItems } from '../../data/notebookRepository.js';
import { notebookIcons } from './notebookIcons.js';
import { installNotebookExportView } from './notebookExportView.js';
import { openConfirm } from '../../ui/confirm.js';
import { openNumpadGeneric } from '../../ui/numpad.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const star='<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1 6.1-5.5-2.9L6.5 20l1-6.1L3 9.5l6.2-.9Z"/></svg>';
const chev='<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
const grip='<svg viewBox="0 0 12 20"><circle cx="3" cy="4" r="1.2"/><circle cx="9" cy="4" r="1.2"/><circle cx="3" cy="10" r="1.2"/><circle cx="9" cy="10" r="1.2"/><circle cx="3" cy="16" r="1.2"/><circle cx="9" cy="16" r="1.2"/></svg>';
const dollar='<svg viewBox="0 0 24 24"><path d="M12 2v20M17 6.5c-1-1.2-2.5-1.8-4.5-1.8-2.7 0-4.5 1.3-4.5 3.3 0 5 9 2.5 9 7.5 0 2.2-2 3.8-5 3.8-2.2 0-4-.7-5.2-2"/></svg>';
const more='<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
const closeMenu='<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19"/></svg>';
const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const formatCost=value=>new Intl.NumberFormat('fa-IR').format(Number(value)||0);

export function installNotebookWorkspace({documentRef=globalThis.document,windowRef=globalThis.window,repository=createNotebookRepository()}={}){
  const page=documentRef?.getElementById?.('notebookPage');
  if(!page)return null;
  repository.load();
  const exportView=installNotebookExportView({documentRef,windowRef});
  let editor=null, sheetItemId=null, menuOpen=false, trashOpen=false, listPrompt=null;
  const onRoute=()=>/^#\/notebook/i.test(String(windowRef.location.hash||''));
  const available=nb=>(nb.lists||[]).filter(list=>!list.trashed);
  const active=nb=>available(nb).find(list=>list.id===nb.activeListId)||available(nb)[0]||null;
  function locate(nb,id){for(const list of nb.lists||[]){const hit=findNotebookItem(list.items,id);if(hit)return{...hit,list};}return null;}
  function change(id,fn){repository.mutate(nb=>{const hit=locate(nb,id);if(hit){fn(hit.item,hit);hit.item.updatedAt=Date.now();hit.list.updatedAt=Date.now();}});}
  function ensureActive(nb){
    let next=active(nb);
    if(!next){next={id:uid('nbl'),title:'کارهای شخصی',items:[],createdAt:Date.now(),updatedAt:Date.now(),archived:false,trashed:false,showCost:false};nb.lists.push(next);}
    nb.activeListId=next.id;return next;
  }
  function confirmAction(message,action){
    openConfirm(message,action,'حذف',{documentRef});
  }
  function openListPrompt({title,placeholder,initial='',onSave}){
    listPrompt={title,placeholder,initial,onSave};render();
  }
  function listPromptHtml(){
    if(!listPrompt)return'';
    return `<div class="nb-prompt-backdrop" data-prompt-close><form class="nb-prompt" data-prompt-form><h2>${esc(listPrompt.title)}</h2><input id="nbPromptInput" value="${esc(listPrompt.initial)}" placeholder="${esc(listPrompt.placeholder)}" autocomplete="off"><div><button type="button" data-prompt-close>انصراف</button><button type="submit">تأیید</button></div></form></div>`;
  }
  function rows(items,{depth=0,source=null,showCost=false,includeDone=false}={}){
    return(items||[]).filter(item=>!item.trashed&&!item.done).map(item=>{
      const kids=(item.children||[]).filter(child=>!child.trashed&&!child.done);
      const amount=notebookItemCost(item);
      return `<div class="nb-node" data-id="${esc(item.id)}"><div class="nb-row" data-depth="${depth}" style="--nb-depth:${depth}">
        <button type="button" data-act="done" aria-label="انجام شد" class="nb-check"></button><button type="button" data-act="expand" aria-label="باز و بسته کردن" class="nb-expand ${kids.length?'':'empty'} ${item.expanded===false?'collapsed':''}">${chev}</button>
        <button type="button" data-act="edit" class="nb-title">${esc(item.text||'بدون عنوان')}${source?`<small>${esc(source)}</small>`:''}</button>
        ${showCost?`<span class="nb-cost">${formatCost(amount)} <small>تومان</small></span>`:`${source?'':`<button type="button" data-act="child" aria-label="افزودن زیردسته" class="nb-child">＋</button>`}<button type="button" data-act="star" aria-label="ستاره" class="nb-star ${item.starred?'active':''}">${star}</button>`}<span class="nb-grip">${grip}</span>
      </div>${item.expanded===false?'':`<div class="nb-children">${rows(item.children,{depth:depth+1,source,showCost,includeDone})}</div>`}${editor?.mode==='item'&&editor.parentId===item.id?editorHtml():''}</div>`;
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
    const total=sumCost(list.items);
    return `<div class="nb-actions">${menuOpen?'<button type="button" class="nb-menu-dismiss" data-menu-dismiss aria-label="بستن منو"></button>':''}<div class="nb-project-menu-wrap"><button type="button" class="nb-more" data-menu-toggle aria-label="${menuOpen?'بستن منو':'عملیات بیشتر'}" aria-expanded="${menuOpen}">${menuOpen?closeMenu:more}</button>${menuOpen?`<div class="nb-project-menu">
      ${actionButton('rename','ویرایش نام',notebookIcons.edit)}${actionButton('export','خروجی',notebookIcons.export)}${actionButton('trash','حذف‌شده‌ها',notebookIcons.deleted)}${actionButton('delete','حذف',notebookIcons.trash,true)}
    </div>`:''}</div><strong>${esc(list.title)}</strong><label class="nb-cost-mode ${list.showCost?'active':''}" title="نمایش هزینه"><input type="checkbox" data-cost-toggle ${list.showCost?'checked':''}><span>${dollar}</span>${list.showCost?`<b>${formatCost(total)} <small>تومان</small></b>`:''}</label></div>`;
  }
  function sheetHtml(){
    if(!sheetItemId)return'';const hit=locate(repository.get(),sheetItemId);if(!hit)return'';
    const cost=notebookItemCost(hit.item),locked=notebookItemCostLocked(hit.item);
    return `<div class="nb-sheet-backdrop" data-sheet-close><section class="nb-item-sheet" role="dialog" aria-modal="true" aria-labelledby="nbSheetTitle" data-sheet-panel>
      <header><button type="button" data-sheet-close aria-label="بستن">×</button><h2 id="nbSheetTitle">ویرایش: <span id="nbSheetName" contenteditable="true" role="textbox" aria-label="عنوان">${esc(hit.item.text)}</span></h2><button type="button" data-sheet-save>ذخیره</button></header>
      <label>هزینه<button type="button" id="nbSheetCost" data-value="${esc(hit.item.cost??'')}" ${locked?'disabled':''}>${formatCost(cost)} <small>تومان</small></button>${locked?'<em>هزینه از مجموع زیردسته‌ها محاسبه شده است.</em>':''}</label>
      <button type="button" class="nb-sheet-child" data-sheet-child>${notebookIcons.child}<span>افزودن زیردسته</span></button>
      <button type="button" class="nb-sheet-delete" data-sheet-delete>حذف</button>
    </section></div>`;
  }
  function centerActiveTab({smooth=true}={}){
    const tab=page.querySelector('.nb-tab[data-list].active'),strip=page.querySelector('.nb-tabs');
    if(!tab||!strip)return;
    const left=tab.offsetLeft-(strip.clientWidth-tab.offsetWidth)/2;
    strip.scrollTo?.({left,behavior:smooth?'smooth':'auto'});
  }
  function render(){
    const nb=repository.get(),list=active(nb),body=page.querySelector('#notebookPageBody');if(!body)return;
    if(!list){repository.mutate(ensureActive);return render();}
    const starredMode=nb.activeListId==='__starred__';
    const activeFamilies=starredMode?collectStarredFamilies(nb,{done:false}):[];
    const completed=starredMode?collectStarredFamilies(nb,{done:true}):collectCompletedFamilies(list.items).map(item=>({item,listTitle:null}));
    const content=starredMode?activeFamilies.map(entry=>rows([entry.item],{source:entry.listTitle,showCost:false})).join(''):rows(list.items,{showCost:!!list.showCost});
    const empty=!content;
    const addRootButton='<button type="button" data-add-root class="nb-add-root">＋ افزودن مورد جدید</button>';
    const doneTree=(item,depth=0)=>`<div class="nb-done-node" style="--nb-depth:${depth}"><span>${esc(item.text)}</span>${(item.children||[]).filter(child=>child.done&&!child.trashed).map(child=>doneTree(child,depth+1)).join('')}</div>`;
    const completedRows=completed.map(entry=>`<div class="nb-done-row"><div>${doneTree(entry.item)}${entry.listTitle?`<small>${esc(entry.listTitle)}</small>`:''}</div><button type="button" data-restore="${esc(entry.item.id)}">بازگردانی</button></div>`).join('');
    body.innerHTML=`<div class="nb-workspace"><nav class="nb-tabs" aria-label="دفترها"><button type="button" data-starred class="nb-tab nb-star-tab ${starredMode?'active':''}">${star}</button>
      ${available(nb).map(item=>`<button type="button" data-list="${esc(item.id)}" class="nb-tab ${!starredMode&&item.id===list.id?'active':''}"><span>${esc(item.title)}</span><small>${(item.items||[]).filter(entry=>!entry.done&&!entry.trashed).length.toLocaleString('fa-IR')}</small></button>`).join('')}
      <button type="button" data-add-list class="nb-tab nb-add-tab" aria-label="افزودن دفتر">＋</button></nav>
      ${actionsHtml(list,starredMode)}<main class="nb-list">${empty&&!starredMode?addRootButton:''}${content||`<div class="nb-empty">${starredMode?'هنوز چیزی ستاره‌دار نشده است.':'هنوز موردی در این دفتر نیست.'}</div>`}${editor?.mode==='item'&&!editor.parentId?editorHtml():''}</main>
      ${!starredMode&&!empty?addRootButton:''}<details class="nb-completed"><summary><span>انجام‌شده‌ها (${completed.length.toLocaleString('fa-IR')})</span>${completed.length?'<button type="button" data-clear-completed>حذف همه</button>':''}</summary>${completedRows}</details>
      ${editor?.mode!=='item'?editorHtml():''}${sheetHtml()}${listPromptHtml()}</div>`;
    bind(body);queueMicrotask(()=>{if(editor)body.querySelector('#nbInput')?.focus();if(listPrompt)body.querySelector('#nbPromptInput')?.focus();centerActiveTab({smooth:false});});
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
    const name=body.querySelector('#nbSheetName')?.textContent.trim();if(!name)return;
    const raw=body.querySelector('#nbSheetCost')?.dataset.value?.replace(/[^0-9]/g,'')||'';
    change(sheetItemId,item=>{item.text=name;item.cost=raw===''?null:Number(raw);});sheetItemId=null;render();
  }
  function deleteList(listId){repository.mutate(nb=>{const list=nb.lists.find(item=>item.id===listId);if(list){list.trashed=true;list.deletedAt=Date.now();list.updatedAt=Date.now();}ensureActive(nb);});editor=null;sheetItemId=null;render();}
  function bind(body){
    body.querySelectorAll('[data-list]').forEach(button=>button.onclick=()=>{repository.mutate(nb=>{nb.activeListId=button.dataset.list;});editor=null;sheetItemId=null;render();});
    body.querySelector('[data-starred]')?.addEventListener('click',()=>{repository.mutate(nb=>{nb.activeListId='__starred__';});editor=null;sheetItemId=null;render();});
    body.querySelector('[data-add-list]')?.addEventListener('click',()=>openListPrompt({title:'اضافه کردن مورد جدید',placeholder:'',onSave:value=>{repository.mutate(nb=>{const list={id:uid('nbl'),title:value,items:[],createdAt:Date.now(),updatedAt:Date.now(),archived:false,trashed:false,showCost:false};nb.lists.push(list);nb.activeListId=list.id;});render();}}));
    body.querySelector('[data-add-root]')?.addEventListener('click',()=>{editor={mode:'item',parentId:null,depth:0};render();});
    body.querySelectorAll('[data-restore]').forEach(button=>button.onclick=()=>{change(button.dataset.restore,item=>restoreNotebookFamily(item));render();});
    body.querySelectorAll('.nb-row').forEach(row=>row.onclick=event=>{const action=event.target.closest('[data-act]')?.dataset.act;if(!action)return;const id=row.closest('.nb-node').dataset.id;
      if(action==='star')change(id,(item,hit)=>toggleNotebookStar(item,hit.parents));else if(action==='done'){const hit=locate(repository.get(),id);if(hit&&canCompleteNotebookItem(hit.item))change(id,item=>{item.done=true;item.completedAt=Date.now();});}else if(action==='expand')change(id,item=>{item.expanded=item.expanded===false;});
      else if(action==='child'){change(id,item=>{item.expanded=true;});editor={mode:'item',parentId:id,depth:Number(row.dataset.depth||0)+1};}else if(action==='edit')sheetItemId=id;render();});
    body.querySelector('[data-editor-form]')?.addEventListener('submit',event=>{event.preventDefault();saveInline(body,{continueEntry:editor?.mode==='item'});});
    body.querySelector('[data-editor="cancel"]')?.addEventListener('click',()=>{editor=null;render();});
    body.querySelector('#nbInput')?.addEventListener('keydown',event=>{if(event.key==='Escape'){editor=null;render();}});
    body.querySelector('[data-cost-toggle]')?.addEventListener('change',event=>{repository.mutate(nb=>{const list=active(nb);if(list)list.showCost=event.target.checked;});render();});
    body.querySelector('[data-menu-toggle]')?.addEventListener('click',()=>{menuOpen=!menuOpen;render();});
    body.querySelector('[data-menu-dismiss]')?.addEventListener('click',()=>{menuOpen=false;render();});
    body.querySelectorAll('[data-project-action]').forEach(button=>button.onclick=()=>{const list=active(repository.get());if(!list)return;const action=button.dataset.projectAction;
      menuOpen=false;
      if(action==='rename')openListPrompt({title:'ویرایش عنوان',placeholder:'',initial:list.title,onSave:value=>{repository.mutate(nb=>{const target=nb.lists.find(item=>item.id===list.id);if(target){target.title=value;target.updatedAt=Date.now();}});render();}});
      else if(action==='export')exportView.open(list,{trigger:button});
      else if(action==='delete')confirmAction('آیا این دفتر حذف شود؟',()=>deleteList(list.id));
      else if(action==='trash')openTrash();
    });
    body.querySelectorAll('[data-sheet-close]').forEach(element=>element.onclick=event=>{if(event.target.closest('[data-sheet-panel]')&&!event.target.matches('[data-sheet-close]'))return;sheetItemId=null;render();});
    body.querySelector('[data-sheet-save]')?.addEventListener('click',()=>saveSheet(body));
    body.querySelector('#nbSheetName')?.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
    body.querySelector('#nbSheetCost:not(:disabled)')?.addEventListener('click',event=>{const control=event.currentTarget;openNumpadGeneric(control.dataset.value,raw=>{control.dataset.value=raw;control.innerHTML=`${formatCost(raw)} <small>تومان</small>`;},{group:true,suffix:' تومان',maxLen:16},{documentRef,windowRef});});
    body.querySelector('[data-sheet-child]')?.addEventListener('click',()=>{const parentId=sheetItemId,depth=(locate(repository.get(),parentId)?.parents.length||0)+1;change(parentId,item=>{item.expanded=true;});sheetItemId=null;editor={mode:'item',parentId,depth};render();});
    body.querySelector('[data-sheet-delete]')?.addEventListener('click',()=>confirmAction('آیا این دسته حذف شود؟',()=>{change(sheetItemId,item=>{item.trashed=true;item.deletedAt=Date.now();});sheetItemId=null;render();}));
    body.querySelector('[data-clear-completed]')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();confirmAction('همه موارد انجام‌شده حذف شوند؟',()=>{repository.mutate(nb=>{const families=starredMode?collectStarredFamilies(nb,{done:true}).map(entry=>locate(nb,entry.item.id)?.item).filter(Boolean):collectCompletedFamilies(active(nb)?.items||[]);for(const item of families)walkNotebookItems([item],node=>{node.trashed=true;node.deletedAt=Date.now();});});render();});});
    body.querySelector('[data-prompt-form]')?.addEventListener('submit',event=>{event.preventDefault();const value=body.querySelector('#nbPromptInput')?.value.trim();if(!value)return body.querySelector('#nbPromptInput')?.focus();const save=listPrompt?.onSave;listPrompt=null;save?.(value);});
    body.querySelectorAll('[data-prompt-close]').forEach(element=>element.addEventListener('click',event=>{if(event.target.closest('[data-prompt-form]')&&!event.target.matches('[data-prompt-close]'))return;listPrompt=null;render();}));
  }
  function deletedTree(item,depth=0){
    return `<div class="nb-trash-node" style="--nb-depth:${depth}"><span>${esc(item.text)}</span>${(item.children||[]).map(child=>deletedTree(child,depth+1)).join('')}</div>`;
  }
  function openTrash(){trashOpen=true;windowRef.KarhaChildHistory?.open?.('notebook-trash');trash();}
  function trash(){
    const body=page.querySelector('#notebookPageBody'),nb=repository.get(),deleted=collectTrashed(nb);
    const content=deleted.length?deleted.map((row,index)=>`<div class="nb-trash-row"><div>${row.kind==='list'?`<strong>${esc(row.list.title)}</strong>${(row.list.items||[]).map(item=>deletedTree(item,1)).join('')}`:`${deletedTree(row.item)}<small>${esc(row.listTitle)}</small>`}</div><div class="nb-trash-actions"><button type="button" data-trash-restore="${index}">بازگردانی</button><button type="button" class="danger" data-trash-delete="${index}">حذف</button></div></div>`).join(''):'<p>موردی وجود ندارد.</p>';
    body.innerHTML=`<div class="nb-trash"><header class="nb-subpage-title"><h1>حذف‌شده‌ها</h1></header><section class="nb-trash-section">${content}</section></div>`;
    body.querySelectorAll('[data-trash-restore]').forEach(button=>button.onclick=()=>{const row=deleted[+button.dataset.trashRestore];repository.mutate(data=>{const target=row.kind==='list'?data.lists.find(list=>list.id===row.list.id):locate(data,row.item.id)?.item;if(target){target.trashed=false;target.deletedAt=null;}});trash();});
    body.querySelectorAll('[data-trash-delete]').forEach(button=>button.onclick=()=>{const row=deleted[+button.dataset.trashDelete];confirmAction('این مورد برای همیشه حذف شود؟',()=>{repository.mutate(data=>{if(row.kind==='list'){const index=data.lists.findIndex(list=>list.id===row.list.id);if(index>=0)data.lists.splice(index,1);ensureActive(data);}else{const hit=locate(data,row.item.id);if(hit){const index=hit.siblings.findIndex(item=>item.id===row.item.id);if(index>=0)hit.siblings.splice(index,1);}}});trash();});});
  }
  function applySurface(){
    const notebookRoute=onRoute(),exportRoute=/\/notebook\/export/i.test(windowRef.location.hash||''),on=notebookRoute&&!exportRoute;
    documentRef.body?.classList.toggle('global-surface',notebookRoute);page.classList.toggle('hidden',!on);
    if(on)render();else if(exportRoute){const list=active(repository.get());if(list)exportView.open(list);}
    windowRef.KarhaWorkspaceChrome?.updateWorkspaceContextBar?.();
  }
  const openNotebook=()=>windowRef.location.hash='#/notebook';
  windowRef.KarhaChildHistory?.register?.('notebook-trash',{onPop:()=>{trashOpen=false;render();}});
  windowRef.addEventListener('karha:open-notebook',()=>{windowRef.KarhaWorkspaceChrome?.closeBottomPages?.();const route='#/notebook';windowRef.KarhaBrowserHistory?.push?.(windowRef.KarhaBrowserHistory.stateForRoute?.({projectId:null,moduleId:'notebook',hash:route})||{hash:route},route)||(windowRef.location.hash=route);applySurface();});
  repository.subscribe?.(()=>{if(onRoute())render();});
  windowRef.addEventListener('karha:close-notebook',()=>{windowRef.KarhaBrowserHistory?.back?.();applySurface();});windowRef.addEventListener('hashchange',applySurface);windowRef.addEventListener('karha:workspace-route-synced',applySurface);applySurface();
  return{openNotebook,applySurface,repository,render,centerActiveTab,exportView};
}
