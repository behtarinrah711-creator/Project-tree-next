import {refreshOpenContractProgress} from '../contracts/contractProgressView.js';
import {projectRepository} from '../../data/projectRepository.js';
import {canEditContractReview,canRevokeContractApproval,canReviewContract, contractApproverIds} from '../../domain/contractApproval.js';
import {contractApi} from '../../domain/contractApi.js';
import {isSaosaHost} from '../../cloud/saosaWorkspaceSync.js';
import {collectStandaloneWorks,collectTodayItems, tehranTodayJalali} from '../../domain/wbs/todayDomain.js';
import {collectShoppingItems} from '../../domain/wbs/shoppingDomain.js';
import {applyExecutionApproval,executionApprovalItem,rejectExecutionEntity} from '../../domain/wbs/executionApproval.js';
import {fileToken} from '../files/fileApi.js';
import {todayApi} from '../../domain/wbs/todayApi.js';
import {canWriteProjectModule, projectPermissionState} from '../roleManagement/permissionState.js';
import {currentExecutionActor, isExecutionApprover} from '../wbs/executionActor.js';
import {approvalByActor,renderContractApprovalLists} from './contractApprovalLists.js';
import {renderTodayCard} from '../wbs/todayView.js';
import {renderShoppingCard} from '../wbs/shoppingView.js';
import {saveContractHandoff} from '../contracts/contractHandoffApi.js';
import {openContractReasonSheet} from '../contracts/contractReasonSheet.js';
import {openConfirm} from '../../ui/confirm.js';
import {openWbsSheet,closeWbsSheet} from '../wbs/wbsSheet.js';
import {openNumpadGeneric} from '../../ui/numpad.js';
import {formatJalaliDisplay} from '../../ui/jalali.js';

export const approvalGroups=[
  {id:'addenda',title:'قراردادها',scope:'contracts'},
  {id:'shopping',title:'خریدها',scope:'execution:shopping',collect:collectShoppingItems},
  {id:'execution',title:'اجرا',scope:'execution:today',collect:(project,day,options)=>[...collectTodayItems(project,day,options),...collectStandaloneWorks(project,day).filter(item=>!item.entity.completed || item.entity.expenseApprovalStatus==='pending')]},
];

const number=value=>Number(value).toLocaleString('fa-IR');
const emptyQueue=()=>({assigned:false,groups:[],count:0});

async function submitExecutionDecision(projectId,scope,item,actor,reason,revision=null){
  const {kind,id,workId}=item;
  if(!isSaosaHost()){
    if(reason){
      projectRepository.updateProject(projectId,project=>
        applyExecutionApproval(project,item,rejectExecutionEntity(item.entity,kind,reason,actor,Date.now(),revision||{})));
      return;
    }
    if(!todayApi.approve(projectId,{kind,id,workId},actor).ok)throw new Error('ثبت تأیید انجام نشد.');
    return;
  }
  const response=await fetch('/api/v1/projects/'+encodeURIComponent(projectId)+'/execution-approvals/'+encodeURIComponent(id)+'/handoff',{
    method:'POST',headers:{authorization:'Bearer '+fileToken(),'content-type':'application/json'},
    body:JSON.stringify({action:reason?'reject_execution':'approve_execution',scope,kind,workId,reason,...(revision||{}),updatedAt:item.entity.updatedAt||0}),
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
      const mine=group.collect(project,undefined,{includeApproved:true}).filter(item=>(item.entity.oddJobType?String(item.entity.expenseApproverContactId)===actor.contactId:isExecutionApprover(item.entity,actor)));
      assigned ||= mine.length>0;
      return {...group,writable,items:mine.filter(item=>(item.entity.oddJobType?item.entity.expenseApprovalStatus==='pending':item.entity.completionState==='pending_approval'))};
    }
    const collection=[...(project.contracts||[]),...(project.contractAddenda||[]),...(project.contractStatusReports||[]).filter(record=>record.statementType)];
    const mine=collection.filter(record=>record && !record.trashed && (
      contractApproverIds(record).includes(actor.contactId)
      || (record.contractApproverContactIds||[]).some(id=>String(id)===actor.contactId)));
    assigned ||= mine.length>0 || collection.some(record=>record && !record.trashed && approvalByActor(record,actor));
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

function approvalOptions(documentRef,project,group,item,onChanged){
  const execution=!!group.collect;
  const shopping=group.id==='shopping';
  const action=item.statementType?'approve_statement':item.parentContractId?'approve_addendum':'approve_contract';
  const approval={};
  if(group.writable){
    const currentExecution=()=>{
      const queue=pendingApprovals(projectRepository.find(project.id));
      const currentGroup=queue.groups.find(candidate=>candidate.id===group.id);
      const current=currentGroup?.items.find(candidate=>String(candidate.id)===String(item.id)
        && String(candidate.workId)===String(item.workId) && candidate.kind===item.kind);
      if(!current || !currentGroup.writable)throw new Error('این مورد دیگر در انتظار تأیید شما نیست.');
      return {current,actor:queue.actor};
    };
    if(group.id==='execution'){
      const reject=button(documentRef,'رد کردن',()=>{
        let progress=null;
        let endDate=item.entity.scheduleEnd||'';
        let reason='';
        let submitting=false;
        openWbsSheet({
          title:'رد تأیید و بازگشت به اجرا',historyKey:'reject-execution:'+item.id,
          saveLabel:'ثبت',autoFocus:false,
          body(root){
            const percent=documentRef.createElement('div');percent.className='execution-reject-field';
            const percentLabel=documentRef.createElement('span');percentLabel.textContent='پیشرفت واقعی';
            const percentButton=button(documentRef,'انتخاب درصد',()=>{
              openNumpadGeneric(progress===null?'':String(progress),raw=>{progress=Number(raw);percentButton.textContent=progress+'٪';},
                {group:false,suffix:'٪',maxLen:2,validate:raw=>!/^\d{1,2}$/.test(raw)||Number(raw)>99?'درصد باید بین صفر تا ۹۹ باشد':''});
            });
            percent.append(percentLabel,percentButton);
            const deadline=documentRef.createElement('div');deadline.className='execution-reject-field';
            const deadlineLabel=documentRef.createElement('span');deadlineLabel.textContent='مهلت جدید تکمیل';
            const dateButton=button(documentRef,endDate?formatJalaliDisplay(endDate):'انتخاب تاریخ',()=>{
              window.KarhaUI?.openJalaliPicker?.(endDate,value=>{endDate=value;dateButton.textContent=formatJalaliDisplay(value);});
            });
            deadline.append(deadlineLabel,dateButton);
            const reasonRow=documentRef.createElement('label');reasonRow.className='execution-reject-reason';
            const reasonLabel=documentRef.createElement('span');reasonLabel.textContent='دلیل رد (اجباری)';
            const textarea=documentRef.createElement('textarea');textarea.placeholder='دلیل رد تأیید را بنویسید…';
            textarea.addEventListener('input',()=>{reason=textarea.value;});
            reasonRow.append(reasonLabel,textarea);root.append(percent,deadline,reasonRow);
          },
          onSave(){
            if(submitting)return false;
            if(progress===null || !Number.isInteger(progress) || progress<0 || progress>99){
              window.KarhaUI?.showToast?.('درصد پیشرفت واقعی را وارد کنید');return false;
            }
            if(!/^\d{4}\/\d{2}\/\d{2}$/.test(endDate)||endDate<tehranTodayJalali()){
              window.KarhaUI?.showToast?.('مهلت جدید تکمیل را از تقویم انتخاب کنید');return false;
            }
            if(reason.trim().length<5){window.KarhaUI?.showToast?.('دلیل رد باید حداقل ۵ حرف باشد');return false;}
            submitting=true;
            (async()=>{
              try{
                const {current,actor}=currentExecution();
                await submitExecutionDecision(project.id,group.scope,current,actor,reason.trim(),{progress,endDate});
                closeWbsSheet();onChanged();
              }catch(error){window.KarhaUI?.showToast?.(error.message);}
              finally{submitting=false;}
            })();
            return false;
          },
        });
      },'contract-review-action execution-review-action is-reject');
      approval.rejectAction=reject;
    }
    const approve=button(documentRef,shopping?'تأیید خرید':'تأیید',()=>openConfirm('این مورد تأیید شود؟',async()=>{
      approve.disabled=true;
      try{
        const latest=projectRepository.find(project.id);
        const queue=pendingApprovals(latest);
        const currentGroup=queue.groups.find(candidate=>candidate.id===group.id);
        const current=currentGroup?.items.find(candidate=>String(candidate.id)===String(item.id)
          && (execution
            ? String(candidate.workId)===String(item.workId) && candidate.kind===item.kind
            : Boolean(candidate.parentContractId)===Boolean(item.parentContractId) && candidate.statementType===item.statementType));
        if(!current || !currentGroup.writable)throw new Error('این مورد دیگر در انتظار تأیید شما نیست.');
        if(execution){
          await submitExecutionDecision(project.id,group.scope,current,queue.actor);
        }else if(action!=='approve_contract' || isSaosaHost()){
          await saveContractHandoff(project.id,current,action);
        }else{
          const result=contractApi.review(project.id,current.id,'approve',queue.actor);
          if(!result.ok)throw new Error(result.message || 'ثبت تأیید انجام نشد.');
          refreshOpenContractProgress(documentRef,latest,result.contract);
        }
        onChanged();
      }catch(error){
        window.KarhaUI?.showToast?.(error.message);
        approve.disabled=false;
      }
    },'تأیید'),execution && shopping ? '' : 'contract-review-action');
    if(execution){approve.classList.add('execution-review-action','is-approve');}
    if(execution || canReviewContract(item,currentExecutionActor(project)))approval.action=approve;
    else if(action==='approve_contract' && canRevokeContractApproval(item,currentExecutionActor(project))){
      approve.disabled=true;
      approval.action=approve;
    }
    if(action==='approve_contract' && !execution && isSaosaHost() && canEditContractReview(item,currentExecutionActor(project))){
      approval.edit=onReturn=>window.KarhaRealContractForm?.open(item.id,project.id,{
        save:changes=>saveContractHandoff(project.id,item,'edit_contract_review',{changes}),
        onReturn:record=>{
          window.KarhaApp?.router?.sync?.();
          onChanged();
          onReturn(record||item);
        },
      });
      approval.refresh=record=>approvalOptions(documentRef,project,group,record,onChanged);
    }
    if(!execution && (canReviewContract(item,currentExecutionActor(project)) || (action==='approve_contract' && canRevokeContractApproval(item,currentExecutionActor(project)))))approval.reject=async reason=>{
      const latest=projectRepository.find(project.id);
      const queue=pendingApprovals(latest);
      const currentGroup=queue.groups.find(candidate=>candidate.id===group.id);
      let current=currentGroup?.items.find(candidate=>String(candidate.id)===String(item.id)
        && Boolean(candidate.parentContractId)===Boolean(item.parentContractId) && candidate.statementType===item.statementType);
      if(!current && action==='approve_contract'){
        const approved=latest?.contracts?.find(row=>String(row.id)===String(item.id));
        if(approved && canRevokeContractApproval(approved,queue.actor))current=approved;
      }
      if(!current || !currentGroup.writable)throw new Error('این مورد دیگر در انتظار تأیید شما نیست.');
      let updated;
      if(action!=='approve_contract' || isSaosaHost()){
        updated=await saveContractHandoff(project.id,current,action.replace('approve_','reject_'),{reason});
      }else{
        const result=contractApi.review(project.id,current.id,'reject',queue.actor,{reason});
        if(!result.ok)throw new Error(result.message || 'ثبت رد انجام نشد.');
        updated=result.contract;
      }
      onChanged();
      return updated;
    };
  }
  return approval;
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
  if(group && !group.collect && projectPermissionState(projectId,[group.scope]).visible){
    renderContractApprovalLists(body,project,group,queue.actor,item=>approvalOptions(
      documentRef,project,group,item,()=>{
        if(header.isConnected)renderPendingApprovals(body,projectId,section,openSection);
      }));
    return;
  }
  if(!group?.items.length){
    body.append(element(documentRef,'p','mgmt-empty','موردی در این دسته منتظر تأیید شما نیست.'));
    return;
  }
  const cardScope=group.id==='shopping'?'wbs-shopping-frame':'wbs-today-frame';
  const list=element(documentRef,'section','approval-queue-list '+cardScope);
  const refresh=()=>{if(list.isConnected)renderPendingApprovals(body,projectId,section,openSection);};
  const renderCard=group.id==='shopping'?renderShoppingCard:renderTodayCard;
  for(const item of group.items)list.append(renderCard(documentRef,project,item,tehranTodayJalali(),refresh,
    approvalOptions(documentRef,project,group,item,refresh)));
  body.append(list);
}
