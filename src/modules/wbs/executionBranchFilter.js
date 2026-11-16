import {collectTodayItems,executionWorkKey} from '../../domain/wbs/todayDomain.js';
import {closeWbsSheet,openWbsSheet} from './wbsSheet.js';

export function executionFilterTree(project,day){
  const byWork=new Map();
  for(const item of collectTodayItems(project,day,{includeApproved:true})){
    if(!byWork.has(String(item.workId)))byWork.set(String(item.workId),[]);
    byWork.get(String(item.workId)).push(item);
  }
  function branches(items){
    return (items||[]).filter(item=>item && !item.trashed).flatMap(node=>{
      const own=byWork.get(String(node.id))||[];
      const children=branches(node.subtasks);
      for(const task of own.filter(item=>item.kind==='task')){
        const key=executionWorkKey(task);
        children.push({id:key,title:task.entity.title,children:[],keys:[key]});
      }
      const keys=[...own.filter(item=>item.kind==='work').map(executionWorkKey),...children.flatMap(child=>child.keys)];
      return keys.length?[{id:'branch:'+node.id,title:node.text||node.title,children,keys}]:[];
    });
  }
  return {id:'',title:'مراحل و کارها',children:branches(project.tasks)};
}

export function searchExecutionBranches(node,query){
  const normalize=value=>String(value??'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').trim().toLowerCase();
  const words=normalize(query).split(/\s+/).filter(Boolean);
  const matches=[];
  const visit=(branch,parents)=>branch.children.forEach(child=>{
    const path=[...parents,child.title];
    if(words.every(word=>normalize(path.join(' ')).includes(word)))matches.push({node:child,path});
    visit(child,path);
  });
  visit(node,[]);
  return matches;
}

export function openExecutionBranchFilter(project,tree,onSelect){
  const stack=[tree];
  let caption,back,search,list;
  const select=node=>{closeWbsSheet();onSelect(node.id);};
  function paint(direction=''){
    const current=stack.at(-1);
    caption.textContent=current.title;
    back.textContent=stack.length>1?'→':'×';
    back.setAttribute('aria-label',stack.length>1?'بازگشت':'بستن');
    list.replaceChildren();
    const buttons=document.createElement('div');
    buttons.className='execution-branch-filter-options'+(direction?' is-'+direction:'');
    const add=(label,detail,action,{hasNext=false,all=false}={})=>{
      const button=document.createElement('button');
      button.type='button';button.className='execution-branch-filter-choice'+(all?' is-all':'');
      const text=document.createElement('span');text.textContent=label;
      if(detail){
        const path=document.createElement('small');path.textContent=detail;
        text.append(path);
      }
      button.append(text);
      if(hasNext){
        const arrow=document.createElement('span');arrow.className='workspace-option-arrow';
        arrow.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';arrow.setAttribute('aria-hidden','true');button.append(arrow);
      }
      button.onclick=action;
      buttons.append(button);
    };
    const query=search.value.trim();
    const rows=query?searchExecutionBranches(current,query):current.children.map(node=>({node,path:[]}));
    if(!query)add(current.id?'همهٔ '+current.title:'همهٔ مراحل و کارها','',()=>select(current),{all:true});
    for(const {node,path} of rows){
      const nested=node.children.length>0;
      add(node.title,path.slice(0,-1).join(' · '),()=>{
        if(!nested){select(node);return;}
        stack.push(node);search.value='';list.scrollTop=0;paint('forward');
      },{hasNext:nested});
    }
    if(query && !rows.length){
      const empty=document.createElement('p');empty.className='empty-state';empty.textContent='موردی پیدا نشد.';
      buttons.append(empty);
    }
    list.append(buttons);
  }
  const sheet=openWbsSheet({
    title:tree.title,showSave:false,autoFocus:false,historyKey:'execution-branch-filter:'+project.id,
    requestClose(){
      if(stack.length===1){closeWbsSheet();return;}
      stack.pop();search.value='';list.scrollTop=0;paint('backward');
    },
    body(root){
      root.classList.add('execution-branch-filter');
      search=document.createElement('input');search.type='search';
      search.className='execution-branch-search';
      search.placeholder='جست‌وجو در مراحل و کارها…';
      search.setAttribute('aria-label','جست‌وجو در مراحل و کارها');
      search.oninput=()=>{list.scrollTop=0;paint();};
      list=document.createElement('div');list.className='execution-branch-filter-list';
      root.append(search,list);
    },
  });
  sheet.classList.add('execution-branch-filter-overlay');
  caption=sheet.querySelector('.sheet-caption');
  back=sheet.querySelector('.close-btn');
  paint();
}
