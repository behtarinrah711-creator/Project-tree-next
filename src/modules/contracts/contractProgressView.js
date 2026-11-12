import {progressCircle} from '../wbs/dailyExecutionReport.js';
import {contractProgressSteps} from '../../domain/contractProgress.js';
export {contractProgressSteps};

export function renderContractProgressCircle(documentRef,contract,project,onClick){
  const steps=contractProgressSteps(contract,project);
  const completed=steps.filter(step=>step.done).length;
  const count=new Intl.NumberFormat('fa-IR');
  const value=count.format(completed)+' از '+count.format(steps.length);
  const next=steps.find(step=>!step.done);
  const circle=progressCircle(documentRef,{progress:completed/steps.length*100},{
    onClick,summary:{value:next?value:'✓',label:'پیشرفت '+(contract.parentContractId?'الحاقیه':'قرارداد')+': '+value+' مرحله'+(next?'؛ مرحله بعد: '+next.label:'؛ تکمیل شده')},
  });
  if(!next)circle.className+=' contract-progress-circle--complete';
  return circle;
}

export function renderContractProgress(documentRef,contract,project){
  const steps=contractProgressSteps(contract,project);
  const list=documentRef.createElement('ol');list.className='contract-progress';list.dir='rtl';
  list.setAttribute('aria-label',contract.parentContractId?'مراحل الحاقیه':'مراحل قرارداد');
  const current=steps.findIndex(step=>!step.done);
  steps.forEach((step,index)=>{
    const item=documentRef.createElement('li');
    item.className='contract-progress-step'+(step.rejected?' is-rejected':'')+(step.done?' is-complete':'')+(step.done && steps[index+1]?.done?' has-complete-next':'');
    item.dataset.step=step.id;
    item.setAttribute('aria-label',step.label+'؛ '+(step.rejected?'رد شده':step.done?'انجام شده':'انجام نشده'));
    if(index===current)item.setAttribute('aria-current','step');
    const label=documentRef.createElement('span');label.className='contract-progress-label';label.textContent=step.label;
    const dot=documentRef.createElement('span');dot.className='contract-progress-dot';dot.setAttribute('aria-hidden','true');
    item.append(label,dot);list.appendChild(item);
  });
  list.onclick=event=>event.stopPropagation();
  return list;
}
