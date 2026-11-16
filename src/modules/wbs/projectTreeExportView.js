import {installNotebookExportView,notebookPaperFrameStyles} from '../notebook/notebookExportView.js';
import {rollupEstimate,rollupProgress} from '../../domain/wbs/estimate.js';
import {isStage,lineTotal,progressOf,taskCostOf} from '../../domain/wbs/normalize.js';
import {activeWorkTasks,isTaskComplete,taskProgressOf} from '../../domain/wbs/workTaskModel.js';
import {canViewPlanning,planningAccessLevel} from '../roleManagement/planningAccess.js';
import {bindRowDrag} from './wbsDrag.js';

const number=new Intl.NumberFormat('fa-IR');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let view;

export function treeExportNodes(items,path=''){
  return (items||[]).filter(item=>item && !item.trashed).map(item=>{
    const key=path+'/'+encodeURIComponent(item.id);
    const children=treeExportNodes(item.subtasks,key);
    for(const task of activeWorkTasks(item)){
      children.push({key:key+'/task:'+encodeURIComponent(task.id),id:task.id,title:task.title,done:isTaskComplete(task),
        progress:taskProgressOf(task),cost:taskCostOf(task),children:[],selected:true});
    }
    const stage=isStage(item);
    return {key,id:item.id,title:item.text||item.title,done:!!(item.done||item.completed),
      progress:stage?rollupProgress([item]):progressOf(item),cost:stage?rollupEstimate([item]):lineTotal(item),
      children,selected:true};
  });
}

export function setTreeExportSelection(node,selected){
  node.selected=selected;
  node.children.forEach(child=>setTreeExportSelection(child,selected));
}

export function visibleTreeExportRows(nodes,open,depth=0){
  return nodes.flatMap(node=>{
    const descendants=open.has(node.key)?visibleTreeExportRows(node.children,open,depth+1):[];
    return [...(node.selected?[{node,depth}]:[]),...descendants];
  });
}

const selectionState=node=>{
  if(!node.children.length)return node.selected?'all':'none';
  const states=node.children.map(selectionState);
  if(states.every(state=>state==='all'))return 'all';
  return states.every(state=>state==='none')?'none':'partial';
};
function syncParents(nodes){
  for(const node of nodes){
    if(!node.children.length)continue;
    syncParents(node.children);
    node.selected=node.children.some(child=>child.selected);
  }
}

const diagramStyles=`
@page project-tree-diagram{size:A4 landscape;margin:12mm}
.project-tree-diagram{page:project-tree-diagram}
.project-tree-diagram ul{list-style:none;margin:0;padding:0;min-width:0}
.project-tree-diagram li{display:flex;align-items:center;min-width:0;break-inside:avoid}
.project-tree-diagram li>ul{flex:1;padding-inline-start:12px}
.project-tree-diagram li>ul>li{position:relative;padding:4px 12px 4px 0}
.project-tree-diagram li>ul>li::before{content:'';position:absolute;inset-inline-start:0;top:50%;width:12px;border-top:1px solid #667785}
.project-tree-diagram li>ul>li::after{content:'';position:absolute;inset-inline-start:0;top:0;bottom:0;border-inline-start:1px solid #667785}
.project-tree-diagram li>ul>li:first-child::after{top:50%}
.project-tree-diagram li>ul>li:last-child::after{bottom:50%}
.project-tree-diagram li>ul{position:relative}
.project-tree-diagram li>ul::before{content:'';position:absolute;inset-inline-start:0;top:50%;width:12px;border-top:1px solid #667785}
.project-tree-diagram .tree-diagram-node{box-sizing:border-box;flex:0 1 120px;min-width:44px;padding:6px;border:1px solid #778b9a;border-radius:5px;background:#eef3f7;text-align:center;overflow-wrap:anywhere;font-size:12px}
.project-tree-diagram .tree-diagram-root{background:#dce8f4;font-weight:700}
.project-tree-diagram small{display:block;margin-top:3px}
.project-tree-diagram > ul > li{break-inside:auto}
`;

export function treeDocument({title,nodes,open,showProgress,showCost,layout,projectName}){
  if(layout==='diagram'){
    const branches=items=>items.map(node=>{
      const children=open.has(node.key)?branches(node.children):'';
      if(!node.selected)return children;
      const label=node.done?`<s>${escape(node.title)}</s>`:escape(node.title);
      const metrics=[showProgress?number.format(node.progress)+'٪':'',showCost?number.format(node.cost)+' تومان':''].filter(Boolean);
      return `<li><div class="tree-diagram-node">${label}${metrics.length?`<small>${metrics.join(' · ')}</small>`:''}</div>${children?`<ul>${children}</ul>`:''}</li>`;
    }).join('');
    return `<section class="nb-export-document project-tree-diagram" dir="rtl"><header><h1>${escape(title)}</h1></header><ul><li><div class="tree-diagram-node tree-diagram-root">${escape(projectName)}</div><ul>${branches(nodes)}</ul></li></ul></section>`;
  }
  const rows=visibleTreeExportRows(nodes,open);
  const date=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran'}).format(new Date());
  return `<section class="nb-export-document" dir="rtl"><header><h1>${escape(title)}</h1><time>${date}</time></header>
    <table><thead><tr><th>مرحله و کار</th>${showProgress?'<th>پیشرفت</th>':''}${showCost?'<th>قیمت (تومان)</th>':''}</tr></thead>
    <tbody>${rows.map(({node,depth})=>{
      const arrow=node.children.length?(open.has(node.key)?'▾ ':'◂ '):'';
      const title=node.done?`<s>${escape(node.title)}</s>`:escape(node.title);
      return `<tr><td style="padding-inline-start:${depth*14+6}px">${arrow}${title}</td>${showProgress?`<td>${number.format(node.progress)}٪</td>`:''}${showCost?`<td>${number.format(node.cost)}</td>`:''}</tr>`;
    }).join('')}</tbody></table></section>`;
}

function renderSelection(body,state){
  const doc=body.ownerDocument;
  const make=(tag,classes,text)=>{
    const node=doc.createElement(tag);
    if(classes)node.className=classes;
    if(text)node.textContent=text;
    return node;
  };
  const check=(text,checked,change)=>{
    const label=make('label');
    const input=make('input');input.type='checkbox';input.checked=checked;
    input.onchange=()=>change(input.checked);
    label.append(input,text);
    return label;
  };
  const button=(label,classes,action)=>{
    const control=make('button',classes,label);
    control.type='button';control.onclick=action;
    return control;
  };
  const options=make('div','export-options wbs-tree-export-options');
  const actions=make('div','wbs-tree-export-actions');
  const layout=make('label','','نوع خروجی ');
  const layoutSelect=make('select');
  layoutSelect.setAttribute('aria-label','نوع خروجی');
  for(const [value,label] of [['list','زیر هم'],['diagram','خروجی درختی']]){
    const option=make('option','',label);
    option.value=value;layoutSelect.append(option);
  }
  layoutSelect.value=state.layout;
  layoutSelect.onchange=()=>{state.layout=layoutSelect.value;};
  layout.append(layoutSelect);
  options.append(layout);
  const tree=make('div','wbs-tree wbs-export-tree');
  const selectAll=check('انتخاب همه',false,checked=>{
    state.nodes.forEach(node=>setTreeExportSelection(node,checked));
    paint();
  });
  const toggle=button('','wbs-tree-toggle',()=>{
    const levels=[];
    const visit=(nodes,depth)=>nodes.forEach(node=>{
      if(!node.children.length)return;
      (levels[depth] ||= []).push(node.key);
      visit(node.children,depth+1);
    });
    visit(state.nodes,0);
    const level=levels.findIndex(keys=>keys.some(key=>!state.open.has(key)));
    state.open.clear();
    if(level>=0)levels.slice(0,level+1).flat().forEach(key=>state.open.add(key));
    paint();
  });
  toggle.innerHTML=state.expandIcon;
  toggle.setAttribute('aria-label','تغییر سطح نمایش نمودار');
  const dragToggle=button('جابجایی','wbs-tree-export-drag',()=>{state.drag=!state.drag;paint();});
  options.append(check('میزان پیشرفت',state.showProgress,value=>{state.showProgress=value;paint();}),
    check('قیمت',state.showCost,value=>{state.showCost=value;paint();}));
  actions.append(selectAll,dragToggle,toggle);
  body.append(options,actions,tree);

  function paint(){
    const all=state.nodes.map(selectionState);
    const input=selectAll.querySelector('input');
    input.checked=all.length>0 && all.every(status=>status==='all');
    input.indeterminate=!input.checked && all.some(status=>status!=='none');
    toggle.setAttribute('aria-pressed',String(state.open.size>0));
    dragToggle.setAttribute('aria-pressed',String(state.drag));
    tree.replaceChildren();
    const append=(nodes,container,depth)=>{
      for(const node of nodes){
        const wrapper=make('div','wbs-export-branch');
        const row=make('div','wbs-row wbs-export-row export-depth-'+Math.min(depth,6)+(node.done?' is-done':''));
        const open=state.open.has(node.key);
        const arrow=node.children.length?button('','wbs-chev',()=>{
          open?state.open.delete(node.key):state.open.add(node.key);
          paint();
        }):make('span','wbs-chev-spacer');
        if(node.children.length){
          arrow.innerHTML=state.branchIcon;
          arrow.querySelector('svg').classList.add('wbs-chev-icon');
          arrow.setAttribute('aria-expanded',String(open));
          arrow.setAttribute('aria-label',open?'بستن شاخه':'باز کردن شاخه');
        }
        const title=make('span','wbs-title-text',node.title);
        const details=[state.showProgress?number.format(node.progress)+'٪':'',state.showCost?number.format(node.cost)+' تومان':''].filter(Boolean);
        const checkbox=make('input');checkbox.type='checkbox';
        const status=selectionState(node);
        checkbox.checked=status==='all';checkbox.indeterminate=status==='partial';
        checkbox.setAttribute('aria-label','انتخاب '+node.title);
        checkbox.onchange=()=>{
          setTreeExportSelection(node,checkbox.checked);
          syncParents(state.nodes);
          paint();
        };
        row.append(arrow,title,make('span','wbs-export-values',details.join(' · ')));
        if(state.drag)row.append(make('span','wbs-grip','⋮⋮'));
        row.append(checkbox);
        wrapper.append(row);container.append(wrapper);
        if(state.drag)bindRowDrag(row,{id:node.key,documentRef:doc,onReorder:ids=>{
          const byKey=new Map(nodes.map(item=>[item.key,item]));
          nodes.splice(0,nodes.length,...ids.map(id=>byKey.get(id)));
          paint();
        }});
        if(open && node.children.length){
          const children=make('div');wrapper.append(children);
          append(node.children,children,depth+1);
        }
      }
    };
    append(state.nodes,tree,0);
  }
  paint();
}

export function openProjectTreeExport(project,{trigger,expandedIds,expandIcon,branchIcon}){
  if(!canViewPlanning(planningAccessLevel(project.id,'tree')))return false;
  if(!view){
    const source=document.getElementById('notebookExportPage');
    if(!source)return false;
    const page=source.cloneNode(true);
    page.id='projectTreeExportPage';
    page.innerHTML=page.innerHTML.replaceAll('notebookExport','projectTreeExport');
    page.querySelector('.export-options').classList.add('wbs-tree-export-legacy-options');
    const back=document.createElement('button');
    back.type='button';back.className='inner-section-back';back.textContent='بازگشت';
    back.onclick=()=>view.close();
    page.querySelector('.page-head').prepend(back);
    document.body.append(page);
    view=installNotebookExportView({
      idPrefix:'projectTreeExport',historyKey:'project-tree-export',documentBuilder:treeDocument,renderSelection,
      validatePrint:state=>!canViewPlanning(planningAccessLevel(state.projectId,'tree'))?'دسترسی به درخت پروژه ندارید'
        :visibleTreeExportRows(state.nodes,state.open).length?'':'حداقل یک ردیف قابل نمایش را انتخاب کنید',
      extraStyles:`${diagramStyles}@page{size:A4;margin:14mm}@media print{body{padding:0}}tr{break-inside:avoid}${notebookPaperFrameStyles('-9mm')}`,
    });
  }
  const nodes=treeExportNodes(project.tasks);
  const open=new Set();
  const expand=items=>items.forEach(node=>{if(expandedIds.has(String(node.id)))open.add(node.key);expand(node.children);});
  expand(nodes);
  const opened=view.open({projectId:project.id,title:'خروجی درخت پروژه | '+project.name,nodes,open,
    projectName:project.name,layout:'list',showProgress:false,showCost:false,drag:true,expandIcon,branchIcon},{trigger});
  document.getElementById('projectTreeExportNote').closest('.export-note-wrap').hidden=true;
  return opened;
}
