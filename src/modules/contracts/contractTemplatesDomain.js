import { STORAGE_KEYS } from '../../config/deploymentConfig.js';
import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';

export function getCurrentProject(projectId=null){
  const id=projectId || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
  return id ? projectRepository.getActiveProject(id) : null;
}

export function getContractTemplates(project=null){
  const p=project || getCurrentProject();
  if(!p) return [];
  if(!Array.isArray(p.contractTemplates)) p.contractTemplates=[];
  return p.contractTemplates;
}

export function findContractTemplate(id, project=getCurrentProject()){
  return getContractTemplates(project).find(x=>String(x.id)===String(id) && !x.trashed) || null;
}

export function makeContractItem(text='', children=[]){
  return {id:uid(), text:String(text||''), children:Array.isArray(children)?children:[]};
}

export function getDefaultContractTemplateItems(){
  // قالب اولیه فقط بندهای اصلی را دارد؛ ماده‌ها باید توسط کاربر اضافه شوند.
  return [
    makeContractItem('موضوع قرارداد:'),
    makeContractItem('اسناد و مدارک قرارداد:'),
    makeContractItem('مدت قرارداد:'),
    makeContractItem('شرایط پرداخت:'),
    makeContractItem('تعهدات پیمانکار:'),
    makeContractItem('تعهدات کارفرما:'),
    makeContractItem('فسخ:'),
    makeContractItem('شرایط غیرمترقبه:'),
    makeContractItem('کسورات قانونی:'),
    makeContractItem('حل اختلافات:'),
    makeContractItem('جریمه:'),
    makeContractItem('دوره تضمین:')
  ];
}

export function normalizeContractTemplate(t){
  if(!t) return null;
  if(!Array.isArray(t.items)) t.items=[];
  const normalizeItems=(arr,depth=0)=> (arr||[]).map(x=>{
    const item={id:x.id||uid(),text:String(x.text||x.description||''),children:depth<1&&Array.isArray(x.children)?x.children.map(c=>({id:c.id||uid(),text:String(c.text||c.description||''),children:[]})):[]};
    return item;
  });
  t.items=normalizeItems(t.items,0);
  return t;
}

export function renumberContractItems(items){
  (items||[]).forEach((item,i)=>{
    item.number=String(i+1);
    (item.children||[]).forEach((child,j)=>child.number=(i+1)+'-'+(j+1));
  });
  return items;
}

export function makeContractTemplateDraftClean(existing=null){
  if(existing){
    const copy=JSON.parse(JSON.stringify(existing));
    normalizeContractTemplate(copy);
    copy.paymentItems=Array.isArray(copy.paymentItems)?copy.paymentItems:[];
    renumberContractItems(copy.items);
    return copy;
  }
  return {id:uid(),activityId:'',title:'',items:getDefaultContractTemplateItems(),paymentItems:[],createdAt:Date.now(),updatedAt:Date.now(),trashed:false};
}

export function getContractTemplateDraftKey(){
  const p=getCurrentProject();
  return STORAGE_KEYS.contractTemplateDraftPrefix + (p?.id||'none');
}
