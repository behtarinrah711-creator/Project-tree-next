import {contractProgressSteps} from './contractProgress.js';
import {contractApproverIds} from './contractApproval.js';

export const ADDENDUM_TYPES=Object.freeze({
  extra:'کارهای اضافی',
  price:'تغییر مبلغ یا مقادیر',
  duration:'تمدید مدت',
  other:'سایر تغییرات',
});

export function canEditContractAddenda(access){
  const permissions=access?.permissions||{};
  const level=permissions.modules?.contracts ?? permissions.contracts;
  return !access || access.role==='owner' || ['edit','create','full'].includes(level)
    || (!permissions.modules && level==null && permissions.edit===true);
}

export function canDeleteContractAddenda(access){
  const permissions=access?.permissions||{};
  if(!access || (access.role==='owner' && permissions.adminAccess!==true))return true;
  const level=permissions.modules ? permissions.modules.contracts : permissions.contracts;
  return level==='full' || (!permissions.modules && level==null && permissions.edit===true && permissions.delete===true);
}

export function parentContractOf(project,addendum){
  return (project.contracts||[]).find(contract=>!contract.trashed && String(contract.id)===String(addendum.parentContractId));
}

export function addendumReviewers(project,parent){
  const submittedReviewers=contractApproverIds(parent);
  if(submittedReviewers.length || (Array.isArray(parent.approvalContactIds)
    && ['pending','approved'].includes(parent.approvalStatus)))return submittedReviewers;
  const findTask=nodes=>{
    for(const node of nodes||[]){
      if(node.trashed) continue;
      const task=node.workTasks?.find(task=>!task.trashed && String(task.id)===String(parent.workTaskId));
      if(task) return task;
      const nested=findTask(node.subtasks);
      if(nested) return nested;
    }
  };
  const assigned=parent.workTaskId ? findTask(project.tasks)?.contractApproverContactIds : null;
  return [...new Set((parent.contractApproverContactIds ?? assigned ?? []).filter(Boolean).map(String))];
}

export function canEditAddendumRecord(addendum){
  return !!addendum && !addendum.trashed && !addendum.signedAt && addendum.signatureStatus!=='signed'
    && !addendum.sentToAccountingAt && !['sent','accepted'].includes(addendum.accountingStatus)
    && (addendum.isDraft || (addendum.status==='final' && !addendum.approvalStatus
      && addendum.contractApproverContactIds?.some(Boolean)));
}

export function canDeleteAddendumRecord(addendum){
  return canEditAddendumRecord(addendum) && !addendum.accountingPackage
    && !['pending','approved'].includes(addendum.approvalStatus);
}

export function canCreateAddendumFromContract(contract,project){
  return !!contract?.contractNo && !contract.trashed && contractProgressSteps(contract,project).every(step=>step.done);
}

export function addendumAmount(rows){
  return (rows||[]).reduce((sum,row)=>sum+(row.pricingMode==='quantity' || row.unit ? Math.round(row.quantity*row.unitPrice) : (row.amount ?? 0)),0);
}
