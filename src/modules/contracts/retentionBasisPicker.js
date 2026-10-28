import { projectRepository } from '../../data/projectRepository.js';
import { openStaticChoicePicker } from './contractPickers.js';

const defaults=[
  {value:'پایان قرارداد',label:'تاریخ پایان قرارداد'},
  {value:'تحویل موقت',label:'تحویل موقت'},
  {value:'تحویل قطعی',label:'تحویل قطعی'},
  {value:'تسویه نهایی',label:'تسویه نهایی'}
];
const normalize=value=>String(value??'').trim().replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c]+/g,' ');
export function retentionBasisOptions(project){
  return [...defaults,...(project?.retentionBasisOptions||[]).map(value=>({value,label:value}))];
}
export function addRetentionBasis(projectId,title){
  const value=String(title??'').trim();
  if(!value)return {error:'عنوان مبنا را وارد کنید.'};
  const project=projectRepository.getActiveProject(projectId);
  if(!project)return {error:'پروژه در دسترس نیست.'};
  if(retentionBasisOptions(project).some(option=>[option.value,option.label].some(text=>normalize(text)===normalize(value))))return {error:'این عنوان قبلاً در فهرست وجود دارد.'};
  const saved=projectRepository.updateProject(projectId,p=>({...p,retentionBasisOptions:[...(p.retentionBasisOptions||[]),value]}));
  return saved?{value}:{error:'ذخیره انجام نشد.'};
}

export function openRetentionBasisSheet(projectId,onSaved,{documentRef=document,windowRef=window}={}){
  if(documentRef.querySelector('.retention-basis-backdrop'))return false;
  const trigger=documentRef.activeElement;
  const overlay=documentRef.createElement('div');
  overlay.className='retention-basis-backdrop hidden';
  overlay.innerHTML='<form class="retention-basis-sheet" role="dialog" aria-modal="true" aria-labelledby="retentionBasisTitle" novalidate><h2 id="retentionBasisTitle">افزودن مبنای شروع نگهداری</h2><label for="retentionBasisInput">عنوان مبنا</label><input id="retentionBasisInput" name="title" placeholder="مثلاً تأیید صورت‌وضعیت نهایی" autocomplete="off" required aria-describedby="retentionBasisError"><p id="retentionBasisError" role="alert"></p><div class="retention-basis-actions"><button type="submit">ذخیره</button><button type="button" data-cancel>انصراف</button></div></form>';
  const form=overlay.querySelector('form'),input=overlay.querySelector('input'),error=overlay.querySelector('[role="alert"]');
  const history=windowRef.KarhaChildHistory,key='retention-basis-add';
  const viewport=windowRef.visualViewport;
  const position=()=>{overlay.style.top=(viewport?.offsetTop||0)+'px';overlay.style.height=(viewport?.height||windowRef.innerHeight)+'px';};
  let closed=false;
  const cleanup=()=>{
    if(closed)return;closed=true;
    viewport?.removeEventListener('resize',position);viewport?.removeEventListener('scroll',position);
    overlay.remove();trigger?.focus?.();
  };
  const dismiss=action=>{
    if(history?.isTransientOpen?.(key))history.dismissTransient(key,{after:()=>{cleanup();action?.();}});
    else{cleanup();action?.();}
  };
  const reveal=()=>{overlay.classList.remove('hidden');position();input.focus();};
  form.onsubmit=event=>{
    event.preventDefault();
    const result=addRetentionBasis(projectId,input.value);
    if(result.error){error.textContent=result.error;input.setAttribute('aria-invalid','true');input.focus();return;}
    dismiss(()=>onSaved?.(result.value));
  };
  input.oninput=()=>{error.textContent='';input.removeAttribute('aria-invalid');};
  overlay.querySelector('[data-cancel]').onclick=()=>dismiss();
  overlay.onclick=event=>{if(event.target===overlay)dismiss();};
  overlay.onkeydown=event=>{
    if(event.key==='Escape'){event.preventDefault();dismiss();}
    if(event.key==='Tab'){
      const controls=[input,...form.querySelectorAll('button')];
      if(event.shiftKey&&documentRef.activeElement===controls[0]){event.preventDefault();controls.at(-1).focus();}
      else if(!event.shiftKey&&documentRef.activeElement===controls.at(-1)){event.preventDefault();input.focus();}
    }
  };
  documentRef.body.appendChild(overlay);
  viewport?.addEventListener('resize',position);viewport?.addEventListener('scroll',position);
  if(history?.presentTransient?.(key,{onReady:reveal,onDismiss:cleanup})!==true)reveal();
  return true;
}
export function openRetentionBasisPicker(projectId,currentValue,onPick){
  return openStaticChoicePicker('مبنای شروع نگهداری','گزینه‌ها',retentionBasisOptions(projectRepository.getActiveProject(projectId)),currentValue,onPick,
    ()=>openRetentionBasisSheet(projectId,()=>openRetentionBasisPicker(projectId,currentValue,onPick)));
}
