import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { saveContractTemplate } from './contractTemplatePersistence.js';
import { openSearchPicker } from '../../ui/searchPickerAdapter.js';
import { appendContractChild } from './contractTemplateItems.js';

let state=null;
let formProjectId=null;
let dirty=false;
let inlineAddState=null;
let dragHandlesVisible=true;
let editingId=null;
let previewResizeObserver=null;

function activeProject(projectId=null){
  const id=projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.();
  return id ? projectRepository.getActiveProject(id) : null;
}

function legacy(name,...args){
  if(typeof window?.[name]==='function') return window[name](...args);
  if(typeof window?.KarhaLegacy?.[name]==='function') return window.KarhaLegacy[name](...args);
  return undefined;
}

function helper(name,...args){ return legacy(name,...args); }

function ctfActivityName(){ const p=helper("getCurrentProject",); const a=helper("findActivityTemplate",state?.activityId,p); return a?.name||''; }

function ctfAddRow(parentId){
  const row=document.createElement('div'); row.className='ctf-add-input-row';
  const input=document.createElement('textarea'); input.id=parentId?'ctf-child-input-'+parentId:'ctf-root-input'; input.className='ctf-inline-input'; input.placeholder=parentId?'بند را وارد کنید…':'ماده را وارد کنید…';
  input.rows=1; input.wrap='soft'; input.inputMode='text'; input.enterKeyHint='enter'; input.setAttribute('enterkeyhint','enter'); input.autocomplete='off'; input.autocapitalize='off'; input.spellcheck=false;
  const grow=()=>{input.style.height='auto';input.style.height=Math.max(42,input.scrollHeight)+'px';};
  input.addEventListener('input',grow);
  const commit=()=> parentId?ctfCommitChild(parentId,input.value,false):ctfCommitRoot(input.value,true);
  let committed=false;
  const handleCommit=(e)=>{ if(e){e.preventDefault();e.stopPropagation();} if(committed)return; if(!String(input.value||'').trim())return; committed=true; commit(); setTimeout(()=>{committed=false;},100); };
  input.onkeydown=e=>{if(e.key==='Escape'){inlineAddState=null;renderContractTemplateFormClean();}};
  const confirm=document.createElement('button'); confirm.type='button'; confirm.className='ctf-inline-confirm'; confirm.textContent='ثبت'; confirm.onclick=handleCommit;
  const cancel=document.createElement('button'); cancel.type='button'; cancel.className='ctf-inline-cancel'; cancel.textContent='لغو'; cancel.onclick=()=>{inlineAddState=null;renderContractTemplateFormClean();};
  row.append(input,confirm,cancel); setTimeout(grow,0); return row;
}

function ctfCommitChild(parentId,text,keep=true){
  const v=String(text||'').trim(); if(!v)return false;
  const st=state; if(!st || !appendContractChild(
    st.items,
    parentId,
    v,
    value=>helper("makeContractItem",value),
    items=>helper("renumberContractItems",items)
  ))return false;
  dirty=true;
  inlineAddState=keep?{parentId}:null; renderContractTemplateFormClean(); if(keep) ctfFocus('#ctf-child-input-'+CSS.escape(String(parentId))); return true;
}

function ctfCommitRoot(text,keep=true){
  const v=String(text||'').trim(); if(!v) return false;
  const st=state; if(!st)return false;
  st.items.push(helper("makeContractItem",v)); helper("renumberContractItems",st.items); dirty=true;
  inlineAddState=keep?{parentId:null}:null; renderContractTemplateFormClean(); if(keep) ctfFocus('#ctf-root-input'); return true;
}

function ctfFocus(selector){ setTimeout(()=>{const el=document.querySelector(selector); if(el){el.focus(); const v=el.value.length; try{el.setSelectionRange(v,v)}catch(e){}}},0); }

export function mountContractPrintPage(body,page,viewportClass=''){
  const viewport=document.createElement('div');
  viewport.className='ctf-preview-viewport'+(viewportClass?' '+viewportClass:'');
  viewport.appendChild(page);
  body.appendChild(viewport);
  const resize=()=>{
    const available=Math.max(0,viewport.clientWidth);
    const scale=Math.min(1,available/794);
    page.style.left=Math.max(0,(available-(794*scale))/2)+'px';
    page.style.transform='scale('+scale+')';
    viewport.style.height=Math.ceil(1123*scale)+'px';
  };
  if(previewResizeObserver) previewResizeObserver.disconnect();
  if(typeof ResizeObserver==='function'){
    previewResizeObserver=new ResizeObserver(resize);
    previewResizeObserver.observe(viewport);
  }
  requestAnimationFrame(resize);
  return viewport;
}

function mountCtfPrintPreview(body){
  const page=document.createElement('div');
  page.className='ctf-preview';
  page.innerHTML=ctfPreview();
  mountContractPrintPage(body,page);
}

function ctfPreview(){
  const st=state; const title=ctfActivityName()?('قرارداد '+ctfActivityName()):'قرارداد + فعالیت';
  let html='<div class="ctf-preview-head"><div class="ctf-preview-title">'+helper("escapeHtml",title)+'</div><div class="ctf-preview-meta"><div>تاریخ: <span>........................</span></div><div>شماره قرارداد: <span>........................</span></div></div></div><div class="ctf-preview-clauses">';
  (st.items||[]).forEach((it,i)=>{html+='<div class="ctf-preview-band"><div><b>ماده '+helper("toPersianDigits",String(i+1))+'- </b>'+helper("escapeHtml",it.text||'')+'</div>';(it.children||[]).forEach((ch,j)=>{html+='<div class="ctf-preview-material"><b>'+helper("toPersianDigits",String(i+1)+'-'+String(j+1))+': </b>'+helper("escapeHtml",ch.text||'')+'</div>';});html+='</div>';});
  html+='</div>'; return html;
}

function ctfStartDrag(arr,id,wrap,kind,parentId=null){
  let drag={arr,id,wrap,parentId,kind,moved:false,target:null,pos:null};
  wrap.classList.add('ctf-dragging');
  const move=e=>{
    drag.moved=true;
    const siblings=Array.from(wrap.parentElement?.children||[]).filter(x=>x.dataset?.ctfId&&x!==wrap);
    let target=null,pos=null;
    for(const el of siblings){const r=el.getBoundingClientRect(); if(e.clientY<r.top+r.height/2){target=el;pos='before';break;}}
    if(!target&&siblings.length){target=siblings[siblings.length-1];pos='after';}
    siblings.forEach(x=>x.classList.remove('ctf-drag-top','ctf-drag-bottom'));
    if(target)target.classList.add(pos==='before'?'ctf-drag-top':'ctf-drag-bottom');
    drag.target=target;drag.pos=pos;
  };
  const end=()=>{
    document.removeEventListener('pointermove',move); wrap.classList.remove('ctf-dragging');
    Array.from(wrap.parentElement?.children||[]).forEach(x=>x.classList.remove('ctf-drag-top','ctf-drag-bottom'));
    if(drag.moved&&drag.target){
      const from=arr.findIndex(x=>String(x.id)===String(id)); const targetId=drag.target.dataset.ctfId;
      if(from>=0){const [item]=arr.splice(from,1);let to=arr.findIndex(x=>String(x.id)===String(targetId));if(to>=0){if(drag.pos==='after')to++;arr.splice(to,0,item);helper("renumberContractItems",state.items);dirty=true;renderContractTemplateFormClean();}}
    }
  };
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',end,{once:true});
}

function renderCtfGroup(item,index){
  const group=document.createElement('div'); group.className='ctf-group '+(index%2===0?'ctf-even':'ctf-odd'); group.dataset.ctfId=item.id;
  const band=document.createElement('div'); band.className='ctf-row ctf-band-row';
  const grip=document.createElement('button');grip.type='button';grip.className='ctf-grip';grip.innerHTML=helper("svgGrip",);grip.title='جابه‌جایی ماده';
  // وقتی جابجایی خاموش است، جای ماسماسک را حفظ می‌کنیم اما خودش دیده/قابل لمس نیست؛
  // حذف کامل آن باعث می‌شد ستون‌های Grid جابه‌جا شوند و متن ماده بریده یا ناپدید شود.
  if(dragHandlesVisible){
    grip.onpointerdown=e=>{e.preventDefault();e.stopPropagation();ctfStartDrag(state.items,item.id,group,'band');};
  }else{
    grip.classList.add('is-inert-handle');
    grip.setAttribute('aria-hidden','true');
  }
  const num=document.createElement('span');num.className='ctf-num';num.textContent=helper("toPersianDigits",item.number||'');
  const text=document.createElement('input');text.className='ctf-text';text.value=item.text||'';text.placeholder='عنوان ماده را وارد کنید…';text.oninput=()=>{item.text=text.value;dirty=true;};
  const del=document.createElement('button');del.type='button';del.className='ctf-delete';del.textContent='حذف';del.onclick=()=>{state.items.splice(index,1);helper("renumberContractItems",state.items);dirty=true;inlineAddState=null;renderContractTemplateFormClean();};
  const actions=document.createElement('div');actions.className='ctf-row-actions';actions.append(grip,del);
  band.append(num,text,actions); group.appendChild(band);
  const children=item.children||[];
  // بندها همیشه بلافاصله زیر ماده مادر می‌آیند و ردیف افزودن بند همیشه بعد از آخرین بند قرار می‌گیرد.
  children.forEach((child,j)=>{
    const row=document.createElement('div');row.className='ctf-row ctf-material-row';row.dataset.ctfId=child.id;
    const grip2=document.createElement('button');grip2.type='button';grip2.className='ctf-grip';grip2.innerHTML=helper("svgGrip",);grip2.title='جابه‌جایی بند';
    // همانند ماده، در حالت خاموش فقط خود ماسماسک مخفی می‌شود و فضای آن باقی می‌ماند.
    if(dragHandlesVisible){
      grip2.onpointerdown=e=>{e.preventDefault();e.stopPropagation();ctfStartDrag(children,child.id,row,'material',item.id);};
    }else{
      grip2.classList.add('is-inert-handle');
      grip2.setAttribute('aria-hidden','true');
    }
    const num2=document.createElement('span');num2.className='ctf-num';num2.textContent=helper("toPersianDigits",child.number||'');
    const tx=document.createElement('textarea');tx.className='ctf-text';tx.value=child.text||'';tx.placeholder='متن بند را وارد کنید…';tx.rows=1;tx.wrap='soft';tx.oninput=()=>{child.text=tx.value;dirty=true;tx.style.height='auto';tx.style.height=Math.max(44,tx.scrollHeight)+'px';};setTimeout(()=>{tx.style.height='auto';tx.style.height=Math.max(44,tx.scrollHeight)+'px';},0);
    const rm=document.createElement('button');rm.type='button';rm.className='ctf-delete';rm.textContent='حذف';rm.onclick=()=>{children.splice(j,1);helper("renumberContractItems",state.items);dirty=true;renderContractTemplateFormClean();};
    const rowActions=document.createElement('div');rowActions.className='ctf-row-actions ctf-material-actions';rowActions.append(grip2,rm);
    row.append(num2,tx,rowActions);group.appendChild(row);
  });
  const adding=inlineAddState?.parentId===item.id;
  // این ردیف دقیقاً جای علامت + است؛ با زدن + همان ردیف به فیلد ورود ماده تبدیل می‌شود.
  if(adding){
    group.appendChild(ctfAddRow(item.id));
  }else{
    const add=document.createElement('button');add.type='button';add.className='ctf-add-material';add.innerHTML='<span>افزودن بند</span><span class="ctf-add-plus">+</span>';add.title='افزودن بند';add.onclick=()=>{inlineAddState={parentId:item.id};renderContractTemplateFormClean();ctfFocus('#ctf-child-input-'+CSS.escape(String(item.id)));};
    group.appendChild(add);
  }
  return group;
}

function renderContractTemplateFormClean(){
  const body=document.getElementById('contractTemplateFormBody'); if(!body||!state)return; body.innerHTML=''; const st=state;
  const activity=document.createElement('div');activity.className='ctf-field ctf-activity-field';
  const lab=document.createElement('label');lab.textContent='فعالیت';activity.appendChild(lab);
  const selectedName=ctfActivityName()||'';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='ctf-activity-search';
  trigger.textContent=selectedName||'انتخاب فعالیت';
  trigger.onclick=()=>contractTemplateFormModule.openActivityPicker();
  activity.appendChild(trigger);
  if(selectedName){const selected=document.createElement('div');selected.className='ctf-selected-activity';selected.textContent='قرارداد '+selectedName;activity.appendChild(selected);}
  body.appendChild(activity);
  const materialHeader=document.createElement('div');materialHeader.className='ctf-material-header';
  const heading=document.createElement('div');heading.className='ctf-section-title';heading.textContent='مواد قرارداد';materialHeader.appendChild(heading);
  const controls=document.createElement('div');controls.className='ctf-material-controls';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='ctf-drag-toggle '+(dragHandlesVisible?'on':'off');toggle.setAttribute('aria-pressed',dragHandlesVisible?'true':'false');
  toggle.innerHTML='<span class="ctf-switch-dot" aria-hidden="true"></span><span>جابجایی</span>';
  toggle.title='جابجایی';
  toggle.onclick=()=>{dragHandlesVisible=!dragHandlesVisible;renderContractTemplateFormClean();};
  controls.appendChild(toggle);materialHeader.appendChild(controls);body.appendChild(materialHeader);
  const list=document.createElement('div');list.className='ctf-groups';helper("renumberContractItems",st.items);(st.items||[]).forEach((it,i)=>list.appendChild(renderCtfGroup(it,i)));
  const rootAddActive=inlineAddState?.parentId===null;
  if(rootAddActive) list.appendChild(ctfAddRow(null));
  const addBand=document.createElement('button');addBand.type='button';addBand.className='ctf-add-band';addBand.textContent='+ افزودن ماده';addBand.onclick=()=>{inlineAddState={parentId:null};renderContractTemplateFormClean();ctfFocus('#ctf-root-input');};
  list.appendChild(addBand); body.appendChild(list);
  st.paymentItems=[];
  const previewTitle=document.createElement('div');previewTitle.className='ctf-section-title';previewTitle.textContent='پیش‌نمایش';body.appendChild(previewTitle);mountCtfPrintPreview(body);
  const actions=document.getElementById('contractTemplateFormActions');actions.innerHTML='';const save=document.createElement('button');save.className='if-save';save.textContent='ذخیره';save.onclick=()=>contractTemplateFormModule.save(null,false);const draft=document.createElement('button');draft.className='if-draft';draft.textContent='پیش‌نویس';draft.onclick=()=>contractTemplateFormModule.saveDraft(null,false);const cancel=document.createElement('button');cancel.className='if-cancel';cancel.textContent='انصراف';cancel.onclick=()=>contractTemplateFormModule.close(false);actions.append(save,draft,cancel);
}


function persistTemplate(projectId=null, silent=false, status='final'){
  if(!state) return false;
  const p=activeProject(projectId);
  if(!p) return false;
  if(!state.activityId){
    helper("showToast",'ابتدا فعالیت را انتخاب کنید');
    return false;
  }
  const activities=Array.isArray(p.activityTemplates)?p.activityTemplates:[];
  const activity=activities.find(a=>String(a.id)===String(state.activityId));
  const activityName=activity?.name || '';
  const duplicate=(p.contractTemplates||[]).find(template=>!template.trashed
    && String(template.activityId||'')===String(state.activityId)
    && String(template.id)!==String(state.id));
  if(duplicate){
    helper("showToast",'برای این فعالیت قبلاً قالب قرارداد ساخته شده است');
    return false;
  }
  const saved=saveContractTemplate(p.id,state,activityName,{status});
  if(!saved){
    helper("showToast",status==='draft'?'ذخیره پیش‌نویس انجام نشد':'ذخیره قالب قرارداد انجام نشد');
    return false;
  }
  state=saved;
  dirty=false;
  try{ localStorage.removeItem(helper("getContractTemplateDraftKey")); }catch(e){}
  helper("markDirty",p.id);
  helper("closeContractTemplateForm");
  if(!silent) helper("showToast",status==='draft'?'پیش‌نویس ذخیره شد':'قالب قرارداد ذخیره شد');
  return true;
}

export const contractTemplateFormModule={
  id:'contract-template-form',

  open(id=null, projectId=null){
    const p=activeProject(projectId);
    if(!p) return false;
    formProjectId=p.id;
    editingId=id||null;
    const existing=id ? helper("findContractTemplate",id,p) : null;
    state=helper("makeContractTemplateDraftClean",existing);
    if(!state) return false;
    dirty=false; dragHandlesVisible=true; inlineAddState=null;
    const title=document.getElementById('contractTemplateFormTitle');
    if(title) title.textContent=id?'ویرایش قالب قرارداد':'قالب قرارداد جدید';
    this.render(projectId);
    return true;
  },

  openActivityPicker(){
    const p=activeProject(formProjectId);
    const draft=state;
    if(!p || !draft) return false;
    const select=activity=>{
      if(state!==draft || !activity?.id) return;
      draft.activityId=activity.id;
      draft.title='قرارداد '+(activity.name||activity.title||'');
      dirty=true;
      renderContractTemplateFormClean();
    };
    return openSearchPicker({
      title:'انتخاب فعالیت',listTitle:'فعالیت‌ها',selectedTitle:'فعالیت‌های منتخب',
      resourceType:'activity',contextKey:'contract-template:activity',
      items:(p.activityTemplates||[]).filter(a=>!a.trashed)
        .map(a=>({id:a.id,name:a.name||a.title||'فعالیت'})),
      showStar:true,showAdd:true,onSelect:select,
      onAdd:()=>{
        if(typeof window.KarhaSearchTemplate?.close==='function') window.KarhaSearchTemplate.close(false);
        else helper('closeSearchTemplate',false);
        window.KarhaApp?.modules?.get('activities')?.openActivityForm?.({
          pickerMode:true,onCreated:select,
        });
      },
    });
  },

  render(projectId=null){
    const body=document.getElementById('contractTemplateFormBody');
    if(!body || !state) return false;
    renderContractTemplateFormClean();
    return true;
  },

  save(projectId=null, silent=false){
    return persistTemplate(projectId,silent,'final');
  },

  saveDraft(projectId=null, silent=false){
    return persistTemplate(projectId,silent,'draft');
  },

  getState(){ return state; },
  isDirty(){ return dirty; },

  close(fromPopState=false){
    if(!dirty){
      helper("closeContractTemplateForm",fromPopState);
      return true;
    }
    helper("showIncompleteFormExitChoice",{
      onYes:()=>contractTemplateFormModule.save(null,true),
      onNo:()=>helper("closeContractTemplateForm",fromPopState)
    });
    return true;
  },

  setDirty(value=true){ dirty=!!value; },
  setDragHandlesVisible(value){ dragHandlesVisible=!!value; },
  resetInlineAdd(){ inlineAddState=null; }
};

export default contractTemplateFormModule;

if(typeof window!=='undefined'){
  window.KarhaContractTemplateForm = contractTemplateFormModule;
}
