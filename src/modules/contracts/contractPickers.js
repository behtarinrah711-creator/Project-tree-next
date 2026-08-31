import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { activityIdsOf, isStage } from '../../domain/wbs/normalize.js';
import { cloneTemplateIntoContract, syncContractPartyData } from './realContractDomain.js';

function getProject(projectId=null){
  const id=projectId || projectContext.getProjectId?.() || projectContext.getActiveProjectId?.();
  return id ? projectRepository.getActiveProject(id) : null;
}
function contacts(p){ return Array.isArray(p?.contacts)?p.contacts.filter(c=>!c.trashed):[]; }
function activities(p){ return Array.isArray(p?.activityTemplates)?p.activityTemplates.filter(a=>!a.trashed):[]; }
function templates(p){ return Array.isArray(p?.contractTemplates)?p.contractTemplates.filter(t=>!t.trashed):[]; }
function findContact(p,id){return contacts(p).find(c=>String(c.id)===String(id))||null;}
function findActivity(p,id){return activities(p).find(a=>String(a.id)===String(id))||null;}
function findProjectItems(p){
  const out=[];
  const roots=Array.isArray(p?.tasks)?p.tasks:[];
  const walk=(items,path=[],rootId='')=>{
    (items||[]).forEach(x=>{
      const id=x.id; const next=[...path,x.title||x.name||x.text||''].filter(Boolean);
      out.push({id,path:next.join(' / '),rootId:rootId||id,raw:x});
      walk(x.subtasks||x.children,next,rootId||id);
    });
  };
  walk(roots);
  return out;
}
function openSearch(opts){
  if(typeof window?.KarhaSearchTemplate?.open==='function') return window.KarhaSearchTemplate.open(opts);
  if(typeof window?.openSearchTemplate==='function') return window.openSearchTemplate(opts);
  return false;
}

export function selectContractor(projectId,state,item){
  const p=getProject(projectId); if(!p||!state||!item)return false;
  const contact=findContact(p,item.id);
  const aid=String(state.activityId||'');
  if(aid && !(contact?.activities||[]).some(x=>String(x)===aid)) return false;
  state.contractorId=item.id; state.contactId=item.id;
  syncContractPartyData(state,p);
  return true;
}
export function selectEmployer(projectId,state,item){
  const p=getProject(projectId); if(!p||!state||!item)return false;
  state.employerId=item.id;
  syncContractPartyData(state,p);
  return true;
}
function applyTemplateToState(state, template){
  state.templateId=template.id;
  state.items=cloneTemplateIntoContract(template);
  state.paymentItems=JSON.parse(JSON.stringify(template.paymentItems||[]));
}

function clearTemplateState(state){
  state.templateId='';
  state.items=[];
  state.paymentItems=[];
}

function templatesForActivity(p, activityId){
  return templates(p).filter(t=>String(t.activityId)===String(activityId));
}

function relatedActivityIds(projectId, state){
  if(state?.projectItemId){
    const item=wbsApi.get(projectId, state.projectItemId);
    if(item) return activityIdsOf(item);
  }
  return Array.isArray(state?.activityIds) ? state.activityIds.map(String).filter(Boolean) : [];
}

export function selectActivity(projectId,state,item){
  const p=getProject(projectId); if(!p||!state||!item)return false;
  state.activityId=item.id;
  if(state.projectItemId) wbsApi.attachActivity(projectId, state.projectItemId, item.id);
  const ids=relatedActivityIds(projectId, state);
  if(!ids.includes(String(item.id))) ids.push(String(item.id));
  state.activityIds=ids;
  const ts=templatesForActivity(p, item.id);
  if(ts.length===1) applyTemplateToState(state, ts[0]);
  else clearTemplateState(state);
  return true;
}

export function selectContractTemplate(projectId,state,templateId){
  const p=getProject(projectId); if(!p||!state||!templateId) return false;
  const template=templates(p).find(t=>String(t.id)===String(templateId));
  if(!template) return false;
  if(state.activityId && String(template.activityId)!==String(state.activityId)) return false;
  applyTemplateToState(state, template);
  return true;
}

export function openContractTemplatePicker(projectId,state,onChange){
  const p=getProject(projectId); if(!p||!state) return false;
  const ts=templatesForActivity(p, state.activityId);
  if(!ts.length){
    clearTemplateState(state);
    onChange?.(state);
    return false;
  }
  if(ts.length===1){
    applyTemplateToState(state, ts[0]);
    onChange?.(state);
    return true;
  }
  return openStaticChoicePicker(
    'انتخاب قالب قرارداد',
    'قالب‌ها',
    ts.map(t=>({value:t.id,label:t.title||t.name||'قالب قرارداد'})),
    state.templateId,
    id=>{
      if(selectContractTemplate(projectId,state,id)) onChange?.(state);
    }
  );
}
export function selectProjectItem(projectId,state,item){
  const p=getProject(projectId);
  if(!p||!state||!item)return false;
  const raw=item?._raw?._raw || item?._raw || item;
  state.projectItemId=raw.id;
  state.projectItemRootTaskId=raw.rootId||'';
  state.projectItemPath=item.name||raw.path||'';
  const ids=activityIdsOf(raw);
  state.activityId=ids.length===1 ? ids[0] : '';
  state.activityIds=ids;
  state.workItemId=raw.id;
  state.templateId='';
  state.items=[];
  state.paymentItems=[];
  if(ids.length===1){
    const act=findActivity(p,ids[0]);
    if(act) selectActivity(projectId,state,{id:act.id});
  }
  return true;
}

export function openContractorPicker(projectId,state,onChange,onAdd){
  const p=getProject(projectId); if(!p)return false;
  const aid=String(state?.activityId||'');
  const list=contacts(p).filter(c=>!aid || (c.activities||[]).some(x=>String(x)===aid));
  return openSearch({
    title:'انتخاب پیمانکار',listTitle:'پیمانکاران',selectedTitle:'پیمانکاران منتخب',
    contextKey:'contractor:'+aid,
    items:list.map(c=>({id:c.id,name:c.name||[c.firstName,c.lastName].filter(Boolean).join(' ')})),
    showStar:true,showAdd:true,onSelect:item=>{
      if(selectContractor(projectId,state,item)){onChange?.(state);}
    },onAdd:onAdd
  });
}
export function openEmployerPicker(projectId,state,onChange,onAdd){
  const p=getProject(projectId); if(!p)return false;
  return openSearch({
    title:'انتخاب کارفرما',listTitle:'کارفرمایان',selectedTitle:'کارفرمایان منتخب',
    contextKey:'employer',items:contacts(p).map(c=>({id:c.id,name:c.name||[c.firstName,c.lastName].filter(Boolean).join(' ')})),
    showStar:true,showAdd:true,
    onSelect:item=>{selectEmployer(projectId,state,item);onChange?.(state);},
    onAdd:onAdd
  });
}
export function contractActivityChoices(projectId,state){
  const p=getProject(projectId); if(!p) return [];
  const ids=Array.isArray(state?.activityIds)?state.activityIds.map(String):[];
  const pool=activities(p);
  return ids.length ? pool.filter(a=>ids.some(id=>String(a.id)===id)) : pool;
}

export function openActivityPicker(projectId,state,onChange,onAdd){
  const p=getProject(projectId); if(!p)return false;
  const acts=contractActivityChoices(projectId,state);
  return openSearch({
    title:'انتخاب فعالیت',listTitle:'فعالیت‌ها',selectedTitle:'فعالیت‌های منتخب',
    contextKey:'activity:projectItem:'+String(state?.projectItemId||''),
    items:acts.map(a=>({id:a.id,name:a.name||a.title||'فعالیت'})),
    showStar:true,showAdd:true,
    onSelect:item=>{
      if(!selectActivity(projectId,state,item)) return;
      onChange?.(state);
      const ts=templatesForActivity(p, state.activityId);
      if(ts.length>1){
        const openTemplates=()=>openContractTemplatePicker(projectId,state,onChange);
        if(window.KarhaChildHistory?.afterNextPop) window.KarhaChildHistory.afterNextPop(openTemplates);
        else openTemplates();
      }
    },
    onAdd:onAdd
  });
}
export function openProjectItemPicker(projectId,state,onChange,onAddActivity){
  const p=getProject(projectId); if(!p)return false;
  const all=findProjectItems(p).filter(x=>!isStage(x.raw));
  return openSearch({
    title:'انتخاب آیتم پروژه',listTitle:'آیتم‌های پروژه',selectedTitle:'آیتم‌های منتخب',
    contextKey:'projectItem',
    items:all.map(x=>({id:x.id,name:x.path,_raw:{...x.raw,rootId:x.rootId,path:x.path}})),
    showStar:true,showAdd:false,
    onSelect:item=>{
      if(!selectProjectItem(projectId,state,item))return;
      onChange?.(state);
      const ids=Array.isArray(state.activityIds)?state.activityIds:[];
      if(ids.length===1 && state.templateId) return;
      if(ids.length===1){
        const ts=templatesForActivity(p, ids[0]);
        if(ts.length>1){
          const openTemplates=()=>openContractTemplatePicker(projectId,state,onChange);
          if(window.KarhaChildHistory?.afterNextPop) window.KarhaChildHistory.afterNextPop(openTemplates);
          else openTemplates();
          return;
        }
        if(ts.length===1) return;
      }
      const openActivity=()=>openActivityPicker(projectId,state,onChange,onAddActivity);
      if(window.KarhaChildHistory?.afterNextPop) window.KarhaChildHistory.afterNextPop(openActivity);
      else openActivity();
    }
  });
}
export function openStaticChoicePicker(title,listTitle,options,currentValue,onPick){
  return openSearch({
    title,listTitle,selectedTitle:listTitle+' منتخب',
    contextKey:'static:'+title,
    items:(options||[]).filter(o=>String(o.value||'')!=='')
      .map(o=>({id:String(o.value),name:String(o.label||o.value)})),
    showStar:false,showAdd:false,
    onSelect:item=>onPick?.(item.id)
  });
}
