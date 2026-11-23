import {progressCircle} from '../wbs/dailyExecutionReport.js';
import {contractProgressSteps} from '../../domain/contractProgress.js';
import {contractApprovalState} from '../../domain/contractApproval.js';
export {contractProgressSteps};

const progressRecords=new WeakMap();
const recordKind=record=>record.statementType?'statement':record.parentContractId?'addendum':'contract';

export function refreshOpenContractProgress(documentRef,project,record){
  const sheet=documentRef?.getElementById?.('wbsSheetOverlay');
  for(const list of sheet?.querySelectorAll('.contract-progress') || []){
    const match=progressRecords.get(list);
    if(match?.projectId===project?.id && String(match?.recordId)===String(record.id) && match.kind===recordKind(record)){
      list.replaceWith(renderContractProgress(documentRef,record,project));
    }
  }
}

export function renderContractProgressCircle(documentRef,contract,project,onClick){
  const steps=contractProgressSteps(contract,project);
  const completed=steps.filter(step=>step.done).length;
  const count=new Intl.NumberFormat('fa-IR');
  const value=count.format(completed)+' از '+count.format(steps.length);
  const next=steps.find(step=>!step.done);
  const latestDecision=(contract.approvalHistory||[]).findLast(event=>['reject','withdraw_submission','cancel_completion','revoke','submit','approve'].includes(event.action));
  const rejected=completed===1 && (contract.accountingStatus==='rejected' ||
    (['unapproved','returned'].includes(contract.approvalStatus) && latestDecision?.action==='reject'));
  const circle=progressCircle(documentRef,{progress:completed/steps.length*100},{
    onClick,summary:{value:next?value:'✓',label:'پیشرفت '+(contract.statementType?'صورت‌وضعیت':contract.parentContractId?'الحاقیه':'قرارداد')+': '+value+' مرحله'+(rejected?'؛ رد شده':'')+(next?'؛ مرحله بعد: '+next.label:'؛ تکمیل شده')},
  });
  if(rejected)circle.className+=' contract-progress-circle--rejected';
  if(!next)circle.className+=' contract-progress-circle--complete';
  return circle;
}

export function renderContractProgress(documentRef,contract,project,onOpen,openCompleted=false){
  const steps=contractProgressSteps(contract,project);
  const list=documentRef.createElement('ol');list.className='contract-progress'+(contract.statementType==='advance'?' contract-progress--horizontal':'');list.dir='rtl';
  list.setAttribute('aria-label',contract.statementType?'مراحل صورت‌وضعیت':contract.parentContractId?'مراحل الحاقیه':'مراحل قرارداد');
  const current=steps.findIndex(step=>!step.done);
  steps.forEach((step,index)=>{
    const item=documentRef.createElement('li');
    item.className='contract-progress-step'+(step.rejected?' is-rejected':'')+(step.done?' is-complete':'')+(step.done && steps[index+1]?.done?' has-complete-next':'');
    const partial=contract.statementType==='advance' && step.id==='paid' && !step.done && Number(contract.paidAmount)>0;
    const status=partial?'پرداخت جزئی':step.rejected?'رد شده':step.done?'انجام شده':'انجام نشده';
    item.dataset.step=step.id;
    item.setAttribute('aria-label',step.label+'؛ '+status);
    if(index===current)item.setAttribute('aria-current','step');
    const label=documentRef.createElement('span');label.className='contract-progress-label';label.textContent=step.label;
    const dot=documentRef.createElement('span');dot.className='contract-progress-dot';dot.setAttribute('aria-hidden','true');
    if(partial){
      dot.classList.add('contract-progress-dot--partial');
      dot.textContent='✓';
    }
    if(onOpen){
      const button=documentRef.createElement('button');button.type='button';button.className='contract-stage-button';
      button.setAttribute('aria-label',step.label+'؛ '+status+(index===current?'؛ انجام اقدام':''));
      button.append(label,dot);
      const advance=contract.statementType==='advance';
      button.disabled=index!==current && !((advance || openCompleted) && step.done) && !(advance && step.rejected);
      if(!button.disabled)button.onclick=event=>{event.stopPropagation();onOpen(event,step);};
      item.append(button);
    }else item.append(label,dot);
    list.appendChild(item);
  });
  if(project)progressRecords.set(list,{projectId:project.id,recordId:contract.id,kind:recordKind(contract)});
  list.onclick=event=>event.stopPropagation();
  return list;
}


// Cards and inbox documents share the same named workflow and status entry point.
export function renderContractWorkflowPanel(documentRef,record,project,{onOpen,expanded=true,heading,openCompleted=false}={}){
  const panel=documentRef.createElement('section');panel.className='contract-workflow-panel';
  const body=documentRef.createElement('div');body.className='contract-workflow-body';
  const state=contractApprovalState(record);
  const reason=record.accountingStatus==='rejected'?record.financeRejection?.reason:['incomplete','unapproved','returned'].includes(state)?record.approvalRejectionReason:null;
  if(reason)panel.className+=' is-rejected';
  const paint=()=>{
    body.hidden=!expanded;
    heading?.children[0]?.setAttribute('aria-expanded',String(expanded));
    if(expanded && record.statementType==='advance'){
      const active=list.querySelector('[aria-current="step"]')||list.lastElementChild;
      if(active && list.scrollWidth>list.clientWidth){
        list.scrollLeft+=active.getBoundingClientRect().left-list.getBoundingClientRect().left-(list.clientWidth-active.offsetWidth)/2;
      }
    }
  };
  if(heading){
    heading.onclick=()=>{expanded=!expanded;paint();};
    const main=heading.children[0];
    main.setAttribute('aria-label','نمایش یا بستن مراحل سند');
    main.onkeydown=event=>{if(event.target && event.target!==main)return;if(event.key==='Enter' || event.key===' '){event.preventDefault();expanded=!expanded;paint();}};
  }
  const list=renderContractProgress(documentRef,record,project,onOpen,openCompleted);
  body.append(list);
  if(reason){const message=documentRef.createElement('p');message.className='contract-rejection-reason';message.textContent=record.statementType==='advance'
    ? (record.accountingStatus==='rejected'?'رد شده توسط مالی':'برگشت از تأیید')+' · '+reason
    : 'دلیل برگشت: '+reason;body.append(message);}
  panel.append(body);paint();
  if(expanded && record.statementType==='advance')requestAnimationFrame(paint);
  return panel;
}
