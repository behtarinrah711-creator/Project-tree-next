export const ADDENDUM_TYPES=Object.freeze({
  extra:'کارهای اضافی',
  price:'تغییر مبلغ یا مقادیر',
  duration:'تمدید مدت',
  other:'سایر تغییرات',
});

export function canEditContractAddenda(access){
  const permissions=access?.permissions||{};
  return !access || access.role==='owner' || ['edit','create','full'].includes(permissions.modules?.contracts ?? permissions.contracts)
    || (!permissions.modules && permissions.edit===true);
}

export function parentContractOf(project,addendum){
  return (project.contracts||[]).find(contract=>!contract.trashed && String(contract.id)===String(addendum.parentContractId));
}

export function addendumReviewers(project,parent){
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
  return [...new Set((assigned ?? parent.contractApproverContactIds ?? parent.approvalContactIds ?? [parent.approvalContactId]).filter(Boolean).map(String))];
}

export function canCreateAddendumFromContract(contract){
  return !!contract?.contractNo && !contract.trashed && contract.status==='final' && !contract.isDraft;
}

export function addendumAmount(rows){
  return (rows||[]).reduce((sum,row)=>sum+(row.pricingMode==='quantity' || row.unit ? Math.round(row.quantity*row.unitPrice) : (row.amount ?? 0)),0);
}
