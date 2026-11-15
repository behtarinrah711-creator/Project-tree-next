import { contractProjectPath, contractRowData, normalizeContractSearch, renderContractCard } from '../contracts/contractsModule.js';
import { openStaticChoicePicker } from '../contracts/contractPickers.js';
import { formatJalaliDisplay, openJalaliPicker } from '../../ui/jalali.js';
import { tehranTodayJalali } from '../../domain/wbs/todayDomain.js';

const views=new WeakMap();
const pageSize=20;
const dateLabel=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',dateStyle:'medium',timeStyle:'short'});
const parentId=item=>String(item.parentContractId || (item.statementType?item.contractId:item.id));
const matchesId=(a,b)=>String(a??'')===String(b??'');

function programChoices(project){
  const choices=[];
  const walk=(nodes,path=[],parents=[])=>{
    for(const node of nodes||[]){
      if(node.trashed)continue;
      const label=node.title||node.text||node.name||'کار';
      const names=[...path,label],ids=[...parents,String(node.id)];
      choices.push({value:String(node.id),label:names.join(' ← '),ids});
      walk(node.subtasks,names,ids);
      walk(node.workTasks,names,ids);
    }
  };
  walk(project.tasks);
  return choices;
}

export function approvalByActor(record,actor){
  return (record.approvalHistory||[]).findLast(event=>event.action==='approve' && Number(event.at)>0
    && ((actor.id && actor.id!=='guest' && matchesId(actor.id,event.actor?.id))
      || (actor.contactId && matchesId(actor.contactId,event.actor?.contactId))));
}

export function renderContractApprovalLists(body,project,group,actor,options){
  const documentRef=body.ownerDocument;
  const make=(tag,className,text)=>{
    const node=documentRef.createElement(tag);
    if(className)node.className=className;
    if(text)node.textContent=text;
    return node;
  };
  const button=(label,action,className)=>{
    const node=make('button',className,label);
    node.type='button';node.onclick=action;
    return node;
  };
  const view=views.get(body)?.projectId===project.id?views.get(body):
    {projectId:project.id,tab:'pending',query:'',filters:{},limit:pageSize};
  views.set(body,view);
  const controls=make('div','contract-approval-controls');
  const tabs=make('div','contract-approval-filter-grid');
  const search=make('input','wbs-input');
  search.type='search';search.placeholder='جستجوی شماره قرارداد، پیمانکار یا کار…';
  search.setAttribute('aria-label','جستجوی تأیید قراردادها');search.value=view.query;
  const filters=make('details','contract-approval-filters');
  filters.append(make('summary','','فیلترها'));
  const filterGrid=make('div','contract-approval-filter-grid');
  filters.append(filterGrid);
  const list=make('section','approval-queue-list approval-queue-contracts');
  const program=programChoices(project);
  const choices=rows=>(rows||[]).filter(row=>!row.trashed).map(row=>({
    value:String(row.id),label:row.name||row.title||[row.firstName,row.lastName].filter(Boolean).join(' '),
  }));
  const pickers=[
    ['program','مراحل و کارها',program],
    ['contractor','پیمانکار',choices(project.contacts)],
    ['template','قالب قرارداد',choices(project.contractTemplates)],
    ['activity','فعالیت',choices(project.activityTemplates)],
  ];
  const parents=new Map((project.contracts||[]).filter(row=>!row.trashed).map(row=>[String(row.id),row]));
  const documents=[...parents.values(),...(project.contractAddenda||[]),...(project.contractStatusReports||[]).filter(row=>row.statementType)];
  const repaint=()=>{view.limit=pageSize;paint();};
  for(const [value,label] of [['pending','در انتظار تأیید من'],['approved','تأییدشده توسط من']]){
    const tab=button(label,()=>{view.tab=value;repaint();},'contract-status-filter');
    tab.dataset.tab=value;tabs.append(tab);
  }
  search.oninput=()=>{view.query=search.value;repaint();};
  const filterButtons=new Map();
  for(const [key,label,items] of pickers){
    const node=button(label,()=>openStaticChoicePicker('انتخاب '+label,label,
      [{value:'all',label:'همه'},...items],view.filters[key]||'all',
      value=>{view.filters[key]=value==='all'?'':value;repaint();}), 'contract-status-filter');
    filterButtons.set(key,{node,label,items});
    filterGrid.append(node);
  }
  for(const [key,label] of [['from','از تاریخ'],['to','تا تاریخ']]){
    const node=button(label,()=>openJalaliPicker(view.filters[key]||'',value=>{
      view.filters[key]=value;repaint();
    }), 'contract-status-filter');
    filterButtons.set(key,{node,label});
    filterGrid.append(node);
  }
  filterGrid.append(button('پاک کردن فیلترها',()=>{view.filters={};repaint();},'contract-status-filter'));
  controls.append(tabs,search,filters);body.append(controls,list);
  paint();

  function paint(){
    for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.tab===view.tab));
    for(const [key,{node,label,items}] of filterButtons){
      const value=view.filters[key];
      node.textContent=value?label+' · '+(items?.find(item=>item.value===value)?.label||formatJalaliDisplay(value)||value):label;
    }
    const approved=view.tab==='approved';
    const rows=approved?documents.filter(row=>!row.trashed):group.items;
    const grouped=new Map();
    const query=normalizeContractSearch(view.query);
    const {from,to,program:programId,contractor,template,activity}=view.filters;
    for(const record of rows){
      const contract=parents.get(parentId(record));
      if(!contract)continue;
      const approval=approved?approvalByActor(record,actor):null;
      if(approved && !approval)continue;
      const at=Number(approved?approval.at:record.submittedAt||record.completedAt||record.createdAt);
      const day=at>0?tehranTodayJalali(new Date(at)):'';
      if((from && (!day||day<from)) || (to && (!day||day>to)))continue;
      if(contractor && !matchesId(contractor,contract.contractorId||contract.contactId))continue;
      if(template && !matchesId(template,contract.templateId))continue;
      if(activity && !matchesId(activity,contract.activityId))continue;
      const path=contractProjectPath(project,contract);
      if(programId && !program.some(item=>matchesId(item.value,contract.workTaskId||contract.projectItemId) && item.ids.includes(programId)))continue;
      const {title,meta}=contractRowData(project.id,contract);
      if(!normalizeContractSearch([title,meta,path,record.contractNo,record.title].join(' ')).includes(query))continue;
      if(!grouped.has(contract.id))grouped.set(contract.id,{contract,documents:new Map(),at:0,decisions:[]});
      const entry=grouped.get(contract.id);
      const action=approved?{}:options(record);
      if(record===contract)entry.action=action;
      else entry.documents.set(record.id,action);
      entry.at=Math.max(entry.at,at||0);
      if(approval)entry.decisions.push({record,at});
    }
    const entries=[...grouped.values()].sort((a,b)=>b.at-a.at);
    list.replaceChildren();
    for(const entry of entries.slice(0,view.limit)){
      const card=renderContractCard(project,entry.contract,{showDetails:true,approval:entry.action||{},approvalDocuments:entry.documents});
      for(const {record,at} of entry.decisions){
        const name=record===entry.contract?'':record.contractNo||record.title||'سند';
        const prior=Number(record.submittedAt)>at || !record.approvedContactIds?.some(id=>matchesId(id,actor.contactId));
        card.append(make('p','contract-approval-decision',
          [prior?'تأیید شما برای نسخهٔ قبلی':'تأیید شما',name,dateLabel.format(new Date(at))].filter(Boolean).join(' · ')));
      }
      list.append(card);
    }
    if(!entries.length)list.append(make('p','mgmt-empty','قراردادی در این فهرست یافت نشد.'));
    if(entries.length>view.limit)list.append(button('نمایش بیشتر',()=>{view.limit+=pageSize;paint();},'contract-status-filter'));
  }
}
