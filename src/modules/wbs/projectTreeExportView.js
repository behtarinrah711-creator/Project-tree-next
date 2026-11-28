import {installNotebookExportView,notebookPaperFrameStyles} from '../notebook/notebookExportView.js';
import {rollupEstimate,rollupProgress} from '../../domain/wbs/estimate.js';
import {isStage,lineTotal,progressOf,taskCostOf} from '../../domain/wbs/normalize.js';
import {activeWorkTasks,isTaskComplete,taskProgressOf} from '../../domain/wbs/workTaskModel.js';
import {canViewPlanning,planningAccessLevel} from '../roleManagement/planningAccess.js';
import {bindRowDrag} from './wbsDrag.js';
import {ganttExportDocument,ganttPrintStyles,validateGanttExport} from './ganttExportDocument.js';
import {actualProgress,jalaliDayNumber,scheduleDate} from '../../domain/wbs/scheduling.js';
import {formatJalaliDisplay} from '../../ui/jalali.js';
import {downloadGanttPdf} from './ganttPdfDownload.js';
import {ganttConfig,ganttLevelOptions,ganttLevelState,isGanttLevelVisible} from './timelineViewOptions.js';

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

const plotSizes={A3:[420,297],A2:[594,420],A1:[841,594]};
const plotStyles=Object.entries(plotSizes).map(([size,[width,height]])=>
  `@page tree-plot-${size}{size:${width}mm ${height}mm;margin:12mm}
  .tree-plot-${size}{page:tree-plot-${size};min-width:${width-24}mm;min-height:${height-24}mm}`).join('');
const diagramStyles=`${plotStyles}
.project-tree-horizontal{text-align:center}
.project-tree-horizontal ul{display:flex;align-items:flex-start;justify-content:center;list-style:none;margin:0;padding:0}
.project-tree-horizontal li{position:relative;display:flex;flex-direction:column;align-items:center;padding:0 5px;min-width:0}
.project-tree-horizontal li>ul{position:relative;padding-top:16px}
.project-tree-horizontal li>ul::before{content:'';position:absolute;top:0;left:50%;height:8px;border-left:1px solid #465763}
.project-tree-horizontal li>ul>li::before{content:'';position:absolute;top:-8px;left:0;right:0;border-top:1px solid #465763}
.project-tree-horizontal li>ul>li:first-child::before{left:50%}
.project-tree-horizontal li>ul>li:last-child::before{right:50%}
.project-tree-horizontal li>ul>li:only-child::before{border:0}
.project-tree-horizontal li>ul>li::after{content:'';position:absolute;left:50%;top:-8px;height:8px;border-left:1px solid #465763}
.project-tree-horizontal .tree-diagram-node{box-sizing:border-box;width:104px;padding:6px;border:1px solid #7892a4;border-radius:4px;background:var(--tree-branch-color,#e8f0f6);font-size:12px;overflow-wrap:anywhere}
.project-tree-horizontal .tree-diagram-root{background:#e2efd5;font-weight:700}
.project-tree-horizontal .tree-plot-root>ul>li:nth-child(3n+1){--tree-branch-color:#f9e8d5}
.project-tree-horizontal .tree-plot-root>ul>li:nth-child(3n+2){--tree-branch-color:#dfebff}
.project-tree-horizontal .tree-plot-root>ul>li:nth-child(3n){--tree-branch-color:#ebdef4}
.project-tree-horizontal small{display:block;margin-top:3px}
@media print{.project-tree-horizontal{min-width:0;min-height:0}}

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

function selectedTimeline(state){
  const expanded=new Set(),selected=new Set();
  const visit=nodes=>nodes.forEach(node=>{
    if(state.open.has(node.key))expanded.add(String(node.id));
    if(node.selected)selected.add(String(node.id));
    visit(node.children);
  });
  visit(state.nodes);
  const showSubwork=state.ganttLevels.get('subwork')!==false;
  const timeline=state.timeline(id=>expanded.has(String(id)),entry=>
    entry.kind==='workTask' && entry.item.isSubwork ? showSubwork : isGanttLevelVisible(entry,state.ganttLevels),!showSubwork);
  const visibleStages=new Set(timeline.entries.filter(entry=>entry.kind==='stage' || entry.kind==='work')
    .filter(entry=>selected.has(String(entry.item.id))).map(entry=>String(entry.item.id)));
  const entries=timeline.entries.filter(({item,kind})=>kind==='milestone'
    ? visibleStages.has(String(item.stageId))
    : selected.has(String(item.id)) && (!state.gantt.hideCompleted || kind==='stage' || actualProgress(item)<100));
  const finish=timeline.entries.find(({item})=>item.systemMilestone);
  if(finish && visibleStages.size && entries.some(entry=>entry.range) && timeline.entries.every(({item})=>item.systemMilestone || selected.has(String(item.stageId ?? item.id)))){
    entries.push(finish);
  }
  return {...timeline,entries};
}

export function treeDocument(state){
  const {title,nodes,open,showProgress,showCost,layout,projectName,plotSize='A3'}=state;
  if(layout==='gantt')return ganttExportDocument(selectedTimeline(state),state.gantt);
  if(layout==='diagram' || layout==='horizontal'){
    const branches=items=>items.map(node=>{
      const children=open.has(node.key)?branches(node.children):'';
      if(!node.selected)return children;
      const label=node.done?`<s>${escape(node.title)}</s>`:escape(node.title);
      const metrics=[showProgress?number.format(node.progress)+'٪':'',showCost?number.format(node.cost)+' تومان':''].filter(Boolean);
      return `<li><div class="tree-diagram-node">${label}${metrics.length?`<small>${metrics.join(' · ')}</small>`:''}</div>${children?`<ul>${children}</ul>`:''}</li>`;
    }).join('');
    if(layout==='horizontal'){
      const size=Object.hasOwn(plotSizes,plotSize)?plotSize:'A3';
      return `<section class="nb-export-document project-tree-horizontal tree-plot-${size}" dir="rtl"><ul><li class="tree-plot-root"><div class="tree-diagram-node tree-diagram-root">${escape(projectName)}</div><ul>${branches(nodes)}</ul></li></ul></section>`;
    }
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
  const layout=make('label','wbs-tree-export-layout');
  const layoutSelect=make('select');
  layoutSelect.setAttribute('aria-label','نوع خروجی');
  const layouts=state.treeLayouts?[['list','زیر هم'],['diagram','درختی عمودی'],['horizontal','درختی افقی']]:[];
  if(state.timeline)layouts.push(['gantt','نمودار واقعی گانت']);
  for(const [value,label] of layouts){
    const option=make('option','',label);
    option.value=value;layoutSelect.append(option);
  }
  layoutSelect.value=state.layout;
  const paper=make('label','','اندازهٔ پلات ');
  const paperSelect=make('select');
  paperSelect.setAttribute('aria-label','اندازهٔ پلات');
  for(const size of Object.keys(plotSizes)){
    const option=make('option','',size);option.value=size;paperSelect.append(option);
  }
  paperSelect.value=state.plotSize;
  paperSelect.onchange=()=>{state.plotSize=paperSelect.value;};
  paper.append(paperSelect);
  const timelineOptions=make('div','export-options');
  const select=(label,items,value,change)=>{
    const wrap=make('label','',label+' ');
    const input=make('select');
    for(const [key,name] of items){
      const option=make('option','',name);
      option.value=key;input.append(option);
    }
    input.value=value;
    input.onchange=()=>change(input.value);
    wrap.append(input);
    return wrap;
  };
  function showLayout(){
    paper.hidden=state.layout!=='horizontal';
    const isGantt=state.layout==='gantt';
    timelineOptions.classList.toggle('hidden',!isGantt);
    options.classList.toggle('hidden',isGantt);
    doc.querySelector('#projectTreeExportToolbar .export-jpg-btn').classList.toggle('hidden',isGantt);
  }
  if(state.timeline){
    const settings=state.gantt;
    const titleField=make('label','','عنوان خروجی ');
    const titleInput=make('input');
    titleInput.type='text';titleInput.value=settings.title;titleInput.maxLength=160;
    titleInput.oninput=()=>{settings.title=titleInput.value;};
    titleField.append(titleInput);
    const dateButton=(label,key)=>{
      const control=button('','',()=>window.KarhaUI?.openJalaliPicker?.(formatDay(key),value=>{
        const day=jalaliDayNumber(value);
        if(!Number.isFinite(day))return;
        settings[key]=day;
        paintDates();
      }));
      const formatDay=name=>Number.isFinite(settings[name])?scheduleDate(settings[name]):'';
      const paintDate=()=>{control.textContent=label+' '+(formatJalaliDisplay(formatDay(key)) || 'انتخاب کنید');};
      return {control,paintDate};
    };
    const start=dateButton('از تاریخ','start'),end=dateButton('تا تاریخ','end');
    function paintDates(){start.paintDate();end.paintDate();}
    paintDates();
    timelineOptions.append(titleField,
      select('اندازهٔ کاغذ',[['A3','A3'],['A4','A4']],settings.paper,value=>{settings.paper=value;}),
      select('جهت کاغذ',[['landscape','افقی'],['portrait','عمودی']],settings.orientation,value=>{settings.orientation=value;}),
      select('مقیاس زمانی',[['week','هفتگی'],['week2','دوهفته‌ای'],['month','ماهانه']],settings.scale,value=>{settings.scale=value;}),
      start.control,end.control);
    for(const [key,label] of [['showTitle','نمایش عنوان'],['showDates','نمایش تاریخ شروع و پایان'],['showProgress','درصد پیشرفت واقعی'],['colorPrint','چاپ رنگی'],['hideCompleted','پنهان کردن کارهای انجام‌شده'],['showDependencies','خطوط پیش‌نیاز'],['showFloat','شناوری']]){
      timelineOptions.append(check(label,settings[key],value=>{settings[key]=value;}));
    }
    const levelPicker=make('fieldset');
    levelPicker.append(make('legend','','سطح‌های نمودار'));
    for(const {key,label} of state.ganttLevelOptions){
      levelPicker.append(check(label,state.ganttLevels.get(key)!==false,value=>{state.ganttLevels.set(key,value);}));
    }
    timelineOptions.append(levelPicker);
  }
  layoutSelect.onchange=()=>{
    state.layout=layoutSelect.value;
    showLayout();
  };
  showLayout();
  layout.append(layoutSelect);
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
  actions.append(selectAll,dragToggle,toggle,layout);
  doc.getElementById('projectTreeExportToolbar').prepend(options);
  body.append(actions,paper,timelineOptions,tree);

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

export function openProjectTreeExport(project,{trigger,expandedIds,expandIcon,branchIcon,timeline,sourceView='tree'}){
  if(!canViewPlanning(planningAccessLevel(project.id,sourceView)))return false;
  const treeLayouts=canViewPlanning(planningAccessLevel(project.id,'tree'));
  if(!canViewPlanning(planningAccessLevel(project.id,'timeline')))timeline=undefined;
  if(sourceView==='timeline' && !timeline)return false;
  if(!view){
    const source=document.getElementById('notebookExportPage');
    if(!source)return false;
    const page=source.cloneNode(true);
    page.id='projectTreeExportPage';
    page.innerHTML=page.innerHTML.replaceAll('notebookExport','projectTreeExport');
    page.querySelector('.export-options').classList.add('wbs-tree-export-legacy-options');
    const back=document.createElement('button');
    back.type='button';back.className='wbs-tree-export-back';back.textContent='بازگشت';
    back.onclick=()=>view.close();
    page.querySelector('.page-head').prepend(back);
    document.body.append(page);
    view=installNotebookExportView({
      idPrefix:'projectTreeExport',historyKey:'project-tree-export',documentBuilder:treeDocument,renderSelection,
      downloadPdf:state=>state.layout==='gantt'?options=>downloadGanttPdf({...options,styles:ganttPrintStyles,settings:state.gantt}):null,
      validatePrint:state=>{
        const gantt=state.layout==='gantt';
        if(!canViewPlanning(planningAccessLevel(state.projectId,gantt?'timeline':'tree')))return 'دسترسی به این خروجی ندارید';
        if(!visibleTreeExportRows(state.nodes,state.open).length)return 'حداقل یک ردیف قابل نمایش را انتخاب کنید';
        return gantt?validateGanttExport(selectedTimeline(state).entries,state.gantt):'';
      },
      extraStyles:`${diagramStyles}${ganttPrintStyles}@page{size:A4;margin:14mm}@media print{body{padding:0}}tr{break-inside:avoid}${notebookPaperFrameStyles('-9mm')}`,
    });
  }
  const nodes=treeExportNodes(project.tasks);
  const open=new Set();
  const expand=items=>items.forEach(node=>{if(expandedIds.has(String(node.id)))open.add(node.key);expand(node.children);});
  expand(nodes);
  const ganttOptions=ganttConfig();
  const levelOptions=timeline?ganttLevelOptions(project.tasks):[];
  const ganttLevels=ganttLevelState();
  const ranges=timeline?.(()=>true,()=>true).entries.filter(entry=>entry.range) || [];
  const start=ranges.reduce((min,entry)=>Math.min(min,entry.range.start),Infinity);
  const end=ranges.reduce((max,entry)=>Math.max(max,entry.segments?.at(-1)?.end ?? entry.range.end),-Infinity);
  const gantt={title:'نمودار گانت | '+project.name,start,end,paper:'A3',orientation:'landscape',scale:'week',
    showTitle:true,showDates:true,showProgress:true,showDependencies:ganttOptions.dependencies,showFloat:ganttOptions.float};
  const opened=view.open({projectId:project.id,title:'خروجی درخت پروژه | '+project.name,nodes,open,timeline,gantt,treeLayouts,ganttLevels,ganttLevelOptions:levelOptions,
    projectName:project.name,layout:sourceView==='timeline'?'gantt':'list',plotSize:'A3',showProgress:false,showCost:false,drag:true,expandIcon,branchIcon},{trigger});
  document.getElementById('projectTreeExportNote').closest('.export-note-wrap').hidden=true;
  return opened;
}
