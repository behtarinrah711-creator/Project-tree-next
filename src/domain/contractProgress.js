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
  const steps=[
    {id:'created',label:contract.parentContractId?'ایجاد الحاقیه':'ایجاد قرارداد',done:!!contract.id},
    {id:'completed',label:contract.parentContractId?'تکمیل الحاقیه':'تکمیل قرارداد',done:complete},
  ];
  if(reviewers.filter(Boolean).length)steps.push({id:'approved',label:contract.parentContractId?'تأیید الحاقیه':'تأیید قرارداد',done:complete && contractApprovalState(contract)==='approved'});
  steps.push({id:'signed',label:contract.parentContractId?'امضای الحاقیه':'امضای قرارداد',done:complete && contract.approvalStatus==='approved' && (isContractSigned(contract) || canReuseReturnedSignature(contract))},{id:'finance',label:'ارسال به مالی',done:isContractInFinance(contract)});
  const rejected=!!contract.parentContractId && contract.accountingStatus==='rejected';
  steps.push({id:'finance-approved',label:rejected?'توسط مالی رد شد':'تأیید بخش مالی',rejected,done:isContractInFinance(contract) && contract.accountingStatus==='accepted'});
  return steps;
}

