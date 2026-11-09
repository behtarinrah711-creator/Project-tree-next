import {projectRepository} from '../../data/projectRepository.js';
import {approvedContractContactIds, canReviewContract, contractApproverIds} from '../../domain/contractApproval.js';
import {parentContractOf} from '../../domain/contractAddenda.js';
import {contractApi} from '../../domain/contractApi.js';
import {isSaosaHost} from '../../cloud/saosaWorkspaceSync.js';
import {collectTodayItems, contractorForItem} from '../../domain/wbs/todayDomain.js';
import {collectShoppingItems} from '../../domain/wbs/shoppingDomain.js';
import {applyExecutionApproval,executionApprovalItem} from '../../domain/wbs/executionApproval.js';
import {fileToken} from '../files/fileApi.js';
import {todayApi} from '../../domain/wbs/todayApi.js';
import {canWriteProjectModule, projectPermissionState} from '../roleManagement/permissionState.js';
import {currentExecutionActor, isExecutionApprover} from '../wbs/executionActor.js';
import {contractProjectPath} from '../contracts/contractsModule.js';
import {openContractPreview} from '../contracts/contractPreviewView.js';
import {saveContractHandoff} from '../contracts/contractHandoffApi.js';
import {openConfirm} from '../../ui/confirm.js';

export const approvalGroups=[
  {id:'addenda',title:'قراردادها و الحاقیه‌ها',scope:'contracts'},
  {id:'shopping',title:'خریدها',scope:'execution:shopping',collect:collectShoppingItems},
  {id:'execution',title:'اجرا',scope:'execution:today',collect:collectTodayItems},
];

const number=value=>Number(value).toLocaleString('fa-IR');
const contactName=contact=>[contact?.firstName,contact?.lastName].filter(Boolean).join(' ') || contact?.name || '';
const emptyQueue=()=>({assigned:false,groups:[],count:0});

async function approveExecution(projectId,scope,item,actor){
  const {kind,id,workId}=item;
  if(!isSaosaHost()){
    if(!todayApi.approve(projectId,{kind,id,workId},actor).ok)throw new Error('ثبت تأیید انجام نشد.');
    return;
  }
  const response=await fetch('/api/v1/projects/'+encodeURIComponent(projectId)+'/execution-approvals/'+encodeURIComponent(id)+'/handoff',{
    method:'POST',headers:{authorization:'Bearer '+fileToken(),'content-type':'application/json'},
    body:JSON.stringify({action:'approve_execution',scope,kind,workId,updatedAt:item.entity.updatedAt||0}),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok || !result.entity)throw new Error(result.message || 'ثبت تأیید انجام نشد.');
  projectRepository.updateProject(projectId,project=>{
    const pending=executionApprovalItem(project,item);
    return pending?applyExecutionApproval(project,pending,result.entity):project;
  });
  const live=window.KarhaLegacy?.getProject?.(projectId);
  const stored=projectRepository.find(projectId);
  if(live && stored)live.tasks=stored.tasks;
}

export function pendingApprovals(project,windowRef=globalThis.window){
  if(!project || project.trashed || project.archived)return emptyQueue();
  const actor=currentExecutionActor(project,windowRef);
  if(!actor.contactId)return emptyQueue();
  let assigned=false;
  const groups=approvalGroups.map(group=>{
    const writable=canWriteProjectModule(project.id,group.scope,windowRef);
    if(!projectPermissionState(project.id,[group.scope],windowRef).visible)return {...group,items:[]};
    if(group.collect){
      const mine=group.collect(project,undefined,{includeApproved:true}).filter(item=>isExecutionApprover(item.entity,actor));
      assigned ||= mine.length>0;
      return {...group,writable,items:mine.filter(item=>item.entity.completionState==='pending_approval')};
    }
    const collection=[...(project.contracts||[]),...(project.contractAddenda||[])];
    const mine=collection.filter(record=>record && !record.trashed && (
      contractApproverIds(record).includes(actor.contactId)
      || (record.contractApproverContactIds||[]).some(id=>String(id)===actor.contactId)));
    assigned ||= mine.length>0;
    return {...group,writable,items:mine.filter(record=>canReviewContract(record,actor))};
  });
  return {assigned,actor,groups,count:groups.reduce((sum,group)=>sum+group.items.length,0)};
}

function element(documentRef,tag,className,text){
  const node=documentRef.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
}

function button(documentRef,text,action,className){
  const node=element(documentRef,'button',className,text);
  node.type='button';
  node.onclick=action;
  return node;
}

export function approvalNavigationRow(documentRef,title,count,onClick,description){
  const row=button(documentRef,'',onClick,'workspace-option');
  const main=element(documentRef,'span','workspace-option-main');
  main.append(element(documentRef,'span','workspace-option-title',title));
  if(description)main.append(element(documentRef,'span','workspace-option-meta',description));
  const end=element(documentRef,'span','approval-option-end');
  const badge=element(documentRef,'span',count===0?'approval-option-count is-zero':'approval-option-count',number(count));
  badge.setAttribute('aria-label',number(count)+' مورد در انتظار تأیید');
  const arrow=element(documentRef,'span','workspace-option-arrow');
  arrow.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  end.append(badge,arrow);row.append(main,end);
  return row;
}

function contractDetails(project,record,isAddendum){
  const source=isAddendum?parentContractOf(project,record):record;
  const contact=(project.contacts||[]).find(item=>!item.trashed && String(item.id)===String(source?.contractorId || source?.contactId || ''));
  const contractor=contactName(contact) || source?.contractorName;
  return {
    parent:isAddendum?source:null,
    title:[record.title || (isAddendum?'الحاقیه':'قرارداد پیمانکاری'),contractor].filter(Boolean).join(' · '),
    meta:[record.contractNo,source && contractProjectPath(project,source)].filter(Boolean).join(' · '),
  };
}

function renderApprovalItem(documentRef,project,group,item,onChanged){
  const execution=!!group.collect;
  const addendum=!execution && Boolean(item.parentContractId);
  const details=execution?null:contractDetails(project,item,addendum);
  const contractor=execution?contactName(contractorForItem(project,item).contact):'';
  const card=element(documentRef,'article','approval-queue-card');
  card.append(
    element(documentRef,'strong','',execution?item.entity.title || item.entity.text:details.title),
    element(documentRef,'span','workspace-option-meta',execution?[item.path.join(' ← '),contractor].filter(Boolean).join(' · '):details.meta),
  );
  if(execution){
    const reports=(item.entity.executionReports||[]).filter(report=>report && !report.trashed);
    if(reports.length){
      const reportList=element(documentRef,'details');
      reportList.append(element(documentRef,'summary','','گزارش‌های ثبت‌شده'));
      for(const report of reports)reportList.append(element(documentRef,'p','',report.description));
      card.append(reportList);
    }
  }else{
    const reviewers=contractApproverIds(item).length;
    card.append(element(documentRef,'span','workspace-option-meta',number(approvedContractContactIds(item).length)+' از '+number(reviewers)+' تأیید'));
  }

  const actions=element(documentRef,'div','approval-queue-actions');
  if(!execution){
    const preview=button(documentRef,'مشاهده سند',()=>openContractPreview(project,item,{
      trigger:preview,addendum:addendum?{parent:details.parent}:null,
    }),'wbs-tree-mode-tab');
    actions.append(preview);
  }
  if(group.writable){
    const approve=button(documentRef,'تأیید',()=>openConfirm('این مورد تأیید شود؟',async()=>{
      approve.disabled=true;
      try{
        const latest=projectRepository.find(project.id);
        const queue=pendingApprovals(latest);
        const currentGroup=queue.groups.find(candidate=>candidate.id===group.id);
        const current=currentGroup?.items.find(candidate=>String(candidate.id)===String(item.id)
          && (execution
            ? String(candidate.workId)===String(item.workId) && candidate.kind===item.kind
            : Boolean(candidate.parentContractId)===addendum));
        if(!current || !currentGroup.writable)throw new Error('این مورد دیگر در انتظار تأیید شما نیست.');
        if(execution){
          await approveExecution(project.id,group.scope,current,queue.actor);
        }else if(addendum || isSaosaHost()){
          await saveContractHandoff(project.id,current,addendum?'approve_addendum':'approve_contract');
        }else{
          const result=contractApi.review(project.id,current.id,'approve',queue.actor);
          if(!result.ok)throw new Error(result.message || 'ثبت تأیید انجام نشد.');
        }
        onChanged();
      }catch(error){
        window.KarhaUI?.showToast?.(error.message);
        approve.disabled=false;
      }
    },'تأیید'),'wbs-tree-mode-tab');
    actions.append(approve);
  }
  card.append(actions);
  return card;
}

export function renderPendingApprovals(body,projectId,section,openSection){
  const documentRef=body.ownerDocument;
  const project=projectRepository.find(projectId);
  const queue=pendingApprovals(project);
  body.replaceChildren();
  const category=section==='approvals-contracts'?'approvals-addenda':section;
  const group=queue.groups.find(candidate=>'approvals-'+candidate.id===category);
  const header=element(documentRef,'header','inner-section-bar approval-queue-header');
  const back=button(documentRef,'',()=>window.KarhaBrowserHistory?.back?.(),'inner-section-back');
  back.setAttribute('aria-label','بازگشت');
  back.innerHTML='<svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  header.append(back,element(documentRef,'h2','',group?.title || 'در انتظار تأیید من'),element(documentRef,'span','inner-section-spacer'));
  body.append(header);
  if(!queue.assigned){
    body.append(element(documentRef,'p','mgmt-empty','موردی برای تأیید به شما ارجاع نشده است.'));
    return;
  }
  if(section==='approvals'){
    const list=element(documentRef,'div','workspace-option-list');
    for(const group of queue.groups){
      list.append(approvalNavigationRow(documentRef,group.title,group.items.length,()=>openSection('approvals-'+group.id),group.description));
    }
    body.append(list);
    return;
  }
  if(!group?.items.length){
    body.append(element(documentRef,'p','mgmt-empty','موردی در این دسته منتظر تأیید شما نیست.'));
    return;
  }
  const list=element(documentRef,'section','approval-queue-list');
  const refresh=()=>{if(list.isConnected)renderPendingApprovals(body,projectId,section,openSection);};
  for(const item of group.items)list.append(renderApprovalItem(documentRef,project,group,item,refresh));
  body.append(list);
}
