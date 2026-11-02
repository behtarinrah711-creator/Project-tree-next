import { contractApprovalState, contractApproverIds } from '../../domain/contractApproval.js';

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
    {id:'created',label:'ایجاد قرارداد',done:!!contract.id},
    {id:'completed',label:'تکمیل قرارداد',done:complete},
  ];
  if(reviewers.filter(Boolean).length)steps.push({id:'approved',label:'تأیید قرارداد',done:complete && contractApprovalState(contract)==='approved'});
  // Signing and finance handoff do not yet have persisted transitions in this app.
  // Keep them pending rather than infer completion from approval or generic attachments.
  steps.push({id:'signed',label:'امضای قرارداد',done:false},{id:'finance',label:'ارسال به مالی',done:false});
  return steps;
}

export function renderContractProgress(documentRef,contract,project){
  const steps=contractProgressSteps(contract,project);
  const list=documentRef.createElement('ol');list.className='contract-progress';list.dir='rtl';
  list.setAttribute('aria-label','مراحل قرارداد');
  const current=steps.findIndex(step=>!step.done);
  steps.forEach((step,index)=>{
    const item=documentRef.createElement('li');
    item.className='contract-progress-step'+(step.done?' is-complete':'')+(step.done && steps[index+1]?.done?' has-complete-next':'');
    item.dataset.step=step.id;
    item.setAttribute('aria-label',step.label+'؛ '+(step.done?'انجام شده':'انجام نشده'));
    if(index===current)item.setAttribute('aria-current','step');
    const label=documentRef.createElement('span');label.className='contract-progress-label';label.textContent=step.label;
    const dot=documentRef.createElement('span');dot.className='contract-progress-dot';dot.setAttribute('aria-hidden','true');
    item.append(label,dot);list.appendChild(item);
  });
  list.onclick=event=>event.stopPropagation();
  return list;
}
