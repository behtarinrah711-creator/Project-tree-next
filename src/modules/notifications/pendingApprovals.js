import {projectRepository} from '../../data/projectRepository.js';
import {approvedContractContactIds, canReviewContract, contractApproverIds} from '../../domain/contractApproval.js';
import {contractApi} from '../../domain/contractApi.js';
import {isSaosaHost} from '../../cloud/saosaWorkspaceSync.js';
import {collectTodayItems, tehranTodayJalali} from '../../domain/wbs/todayDomain.js';
import {collectShoppingItems} from '../../domain/wbs/shoppingDomain.js';
import {applyExecutionApproval,executionApprovalItem} from '../../domain/wbs/executionApproval.js';
import {fileToken} from '../files/fileApi.js';
import {todayApi,REJECTION_MIN_LENGTH} from '../../domain/wbs/todayApi.js';
import {canWriteProjectModule, projectPermissionState} from '../roleManagement/permissionState.js';
import {currentExecutionActor, isExecutionApprover} from '../wbs/executionActor.js';
import {normalizeContractSearch,renderContractCard} from '../contracts/contractsModule.js';
import {renderAddendumCard} from '../contracts/contractAddendaView.js';
import {renderTodayCard} from '../wbs/todayView.js';
import {renderShoppingCard} from '../wbs/shoppingView.js';
import {saveContractHandoff} from '../contracts/contractHandoffApi.js';
import {closeWbsSheet,fieldRow,openWbsSheet} from '../wbs/wbsSheet.js';
import {openConfirm} from '../../ui/confirm.js';

export const approvalGroups=[
  {id:'addenda',title:'قراردادها و الحاقیه‌ها',scope:'contracts'},
  {id:'shopping',title:'خریدها',scope:'execution:shopping',collect:collectShoppingItems},
  {id:'execution',title:'اجرا',scope:'execution:today',collect:collectTodayItems},
];

const number=value=>Number(value).toLocaleString('fa-IR');
const emptyQueue=()=>({assigned:false,groups:[],count:0});

async function reviewExecution(projectId,scope,item,actor,reason){
  const {kind,id,workId}=item;
  if(!isSaosaHost()){
    const ref={kind,id,workId};
    const result=reason?todayApi.reject(projectId,ref,reason,actor):todayApi.approve(projectId,ref,actor);
    if(!result.ok)throw new Error('ثبت تصمیم انجام نشد.');
    return;
  }
  const response=await fetch('/api/v1/projects/'+encodeURIComponent(projectId)+'/execution-approvals/'+encodeURIComponent(id)+'/handoff',{
    method:'POST',headers:{authorization:'Bearer '+fileToken(),'content-type':'application/json'},
    body:JSON.stringify({action:reason?'reject_execution':'approve_execution',reason,scope,kind,workId,updatedAt:item.entity.updatedAt||0}),
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
      return {...group,writable,
        items:mine.filter(item=>item.entity.completionState==='pending_approval'),
        approved:mine.filter(({entity})=>entity.completionState==='approved' &&
          (entity.approvedBy?.contactId || entity.executionHistory?.findLast(entry=>entry.type==='approved')?.actor?.contactId)===actor.contactId),
        rejected:mine.filter(({entity})=>{
          if(['pending_approval','approved'].includes(entity.completionState))return false;
          const decision=entity.executionHistory?.findLast(entry=>['approval_rejected','sent_for_approval'].includes(entry.type));
          return decision?.type==='approval_rejected' && decision.actor?.contactId===actor.contactId;
        }),
      };
    }
    const collection=[...(project.contracts||[]),...(project.contractAddenda||[])];
    const mine=collection.filter(record=>record && !record.trashed && (
      contractApproverIds(record).includes(actor.contactId)
      || (record.contractApproverContactIds||[]).some(id=>String(id)===actor.contactId)));
    assigned ||= mine.length>0;
    return {...group,writable,items:mine.filter(record=>canReviewContract(record,actor)),
      approved:mine.filter(record=>['pending','approved'].includes(record.approvalStatus) && approvedContractContactIds(record).includes(actor.contactId)),
      rejected:mine.filter(record=>['unapproved','returned'].includes(record.approvalStatus) &&
        record.approvalHistory?.findLast(entry=>['reject','revoke','submit'].includes(entry.action))?.action==='reject' &&
        record.reviewedBy?.contactId===actor.contactId),
    };
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

function renderApprovalItem(documentRef,project,group,item,onChanged){
  const execution=!!group.collect;
  const shopping=group.id==='shopping';
  const addendum=!execution && Boolean(item.parentContractId);
  const approval={};
  if(group.writable && group.items.includes(item)){
    const review=async(reason)=>{
      const queue=pendingApprovals(projectRepository.find(project.id));
      const currentGroup=queue.groups.find(candidate=>candidate.id===group.id);
      const current=currentGroup?.items.find(candidate=>String(candidate.id)===String(item.id)
        && (execution ? String(candidate.workId)===String(item.workId) && candidate.kind===item.kind
          : Boolean(candidate.parentContractId)===addendum));
      if(!current || !currentGroup.writable)throw new Error('این مورد دیگر در انتظار تأیید شما نیست.');
      const decision=reason?'reject':'approve';
      if(execution)await reviewExecution(project.id,group.scope,current,queue.actor,reason);
      else if(addendum || isSaosaHost()){
        await saveContractHandoff(project.id,current,decision+(addendum?'_addendum':'_contract'),{reason});
      }else{
        const result=contractApi.review(project.id,current.id,decision,queue.actor,{reason});
        if(!result.ok)throw new Error(result.message || 'ثبت تصمیم انجام نشد.');
      }
      onChanged();
    };
    const actions=element(documentRef,'div',execution?'today-task-actions':'contract-addendum-toolbar');
    const approve=button(documentRef,shopping?'تأیید خرید':'تأیید',()=>openConfirm('این مورد تأیید شود؟',async()=>{
      approve.disabled=true;
      try{await review();}
      catch(error){window.KarhaUI?.showToast?.(error.message);}
      finally{approve.disabled=false;}
    },'تأیید'),execution?'wbs-costline-manual':'contract-review-action');
    const reject=button(documentRef,'رد',()=>{
      let saving=false;
      const reasonInput=element(documentRef,'textarea','wbs-input today-textarea');
      reasonInput.setAttribute('aria-label','علت رد');
      openWbsSheet({
        title:'رد درخواست تأیید',saveLabel:'ثبت رد',
        body(root){root.append(fieldRow('علت رد',reasonInput));},
        onSave(){
          if(saving)return false;
          const reason=reasonInput.value.trim();
          if(reason.length<REJECTION_MIN_LENGTH){
            window.KarhaUI?.showToast?.('علت رد حداقل '+number(REJECTION_MIN_LENGTH)+' حرف باشد');
            return false;
          }
          saving=true;
          review(reason).then(()=>closeWbsSheet()).catch(error=>{
            window.KarhaUI?.showToast?.(error.message);
          }).finally(()=>{saving=false;});
          return false;
        },
      });
    },execution?'wbs-costline-manual is-danger':'contract-review-action danger');
    actions.append(approve,reject);
    approval.action=actions;
  }
  const renderExecutionCard=shopping?renderShoppingCard:renderTodayCard;
  const card=execution?renderExecutionCard(documentRef,project,item,tehranTodayJalali(),onChanged,approval)
    : addendum?renderAddendumCard(project,item,onChanged,false,approval)
    : renderContractCard(project,item,{approval});
  if(group.rejected?.includes(item)){
    const reason=execution?item.entity.executionComments?.findLast(comment=>comment.type==='approval_rejected')?.text:item.approvalRejectionReason;
    card.append(element(documentRef,'p','contract-rejection-reason',reason?'ردشده — '+reason:'ردشده'));
  }else if(group.approved?.includes(item)){
    card.append(element(documentRef,'p','contract-status-badge is-approved','تأییدشده توسط شما'));
  }
  return card;
}

export function renderPendingApprovals(body,projectId,section,openSection,filters={status:'items',query:''}){
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
  if(!group)return;
  const toolbar=element(documentRef,'div','workspace-search');
  const search=element(documentRef,'input');
  search.type='search';
  search.placeholder='جست‌وجو';
  search.setAttribute('aria-label','جست‌وجو در '+group.title);
  search.value=filters.query;
  const status=element(documentRef,'select','wbs-input');
  status.setAttribute('aria-label','فیلتر وضعیت تأیید');
  for(const [key,label] of Object.entries({items:'در انتظار تأیید',approved:'تأییدشده',rejected:'ردشده'})){
    const option=element(documentRef,'option','',label);
    option.value=key;
    status.append(option);
  }
  status.value=filters.status;
  toolbar.append(search,status);
  const cardScope=group.id==='shopping'?'wbs-shopping-frame':group.id==='execution'?'wbs-today-frame':'approval-queue-contracts';
  const list=element(documentRef,'section','approval-queue-list '+cardScope);
  const refresh=()=>{if(list.isConnected)renderPendingApprovals(body,projectId,section,openSection,filters);};
  const paint=()=>{
    const query=normalizeContractSearch(filters.query);
    const cards=(group[filters.status]||[]).map(item=>renderApprovalItem(documentRef,project,group,item,refresh))
      .filter(card=>!query || normalizeContractSearch((card.dataset.searchText||'')+' '+card.textContent).includes(query));
    list.replaceChildren(...(cards.length?cards:[element(documentRef,'p','mgmt-empty','موردی پیدا نشد.')]));
  };
  search.addEventListener('input',()=>{filters.query=search.value;paint();});
  status.addEventListener('change',()=>{filters.status=status.value;paint();});
  body.append(toolbar,list);
  paint();
}
