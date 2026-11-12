import {canReuseReturnedSignature,isContractSigned,isContractInFinance} from './contractHandoff.js';
import { contractApprovalState, contractApproverIds } from './contractApproval.js';

function linkedTask(project,contract){
  for(const work of project?.tasks || []){
    if(String(work.id)===String(contract.projectItemId)){
      const task=(work.workTasks||[]).find(task=>!task.trashed && String(task.id)===String(contract.workTaskId));
      if(task)return task;
    }
    const nested=linkedTask({tasks:work.subtasks},contract);
    if(nested)return nested;
  }
  return null;
}

export function contractProgressSteps(contract,project){
  const task=contract.workTaskId?linkedTask(project,contract):null;
  const reviewers=task ? task.contractApproverContactIds || [] :
    Array.isArray(contract.contractApproverContactIds)?contract.contractApproverContactIds:contractApproverIds(contract);
  const complete=contract.status==='final' && !contract.isDraft;
  const label=contract.statementType?'صورت‌وضعیت':contract.parentContractId?'الحاقیه':'قرارداد';
  const steps=[
    {id:'created',label:'ایجاد '+label,done:!!contract.id},
    {id:'completed',label:'تکمیل '+label,done:complete},
  ];
  if(reviewers.filter(Boolean).length)steps.push({id:'approved',label:'تأیید '+label,done:complete && contractApprovalState(contract)==='approved'});
  steps.push({id:'signed',label:'امضای '+label,done:complete && contract.approvalStatus==='approved' && (isContractSigned(contract) || canReuseReturnedSignature(contract))},{id:'finance',label:'ارسال به مالی',done:isContractInFinance(contract)});
  const rejected=!!(contract.parentContractId || contract.statementType) && contract.accountingStatus==='rejected';
  steps.push({id:'finance-approved',label:rejected?'توسط مالی رد شد':'تأیید بخش مالی',rejected,done:isContractInFinance(contract) && contract.accountingStatus==='accepted'});
  return steps;
}

