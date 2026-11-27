import { uid } from '../../data/projectFactories.js';
import { projectRepository } from '../../data/projectRepository.js';
import { stageMilestones, milestoneStageForWork, updateWorkMilestoneLinks } from '../../domain/wbs/stageMilestones.js';
import { flattenDependencyCandidates, jalaliDayNumber, projectScheduleAnalysis, projectWithPlannedSchedule, scheduleDate } from '../../domain/wbs/scheduling.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { formatJalaliWithWeekday } from '../../ui/jalali.js';
import { fieldRow, openWbsSheet, textInput } from './wbsSheet.js';

export function stageMilestoneDiamond(stage,point,onOpen){
  const button=document.createElement('button');
  button.type='button';
  button.className='wbs-stage-milestone-diamond';
  button.textContent='◆';
  button.title=point.title;
  button.setAttribute('aria-label',point.title);
  button.onclick=event=>{event.stopPropagation();onOpen(stage,point);};
  return button;
}

export function openStageMilestoneSheet({projectId,stageId,milestoneId,onChanged,readOnly=false,keepParent=false}){
  const project=projectRepository.find(projectId);
  const stage=project?.tasks?.find(item=>item && !item.trashed && item.id===stageId && item.kind==='stage');
  if(!stage)return;
  const point=stageMilestones(stage).find(item=>item.id===milestoneId);
  if(milestoneId && !point)return;
  const candidates=flattenDependencyCandidates([stage]).filter(row=>row.kind!=='stage');
  const selected=new Set((point?.predecessorIds||[]).map(String));
  const forecast=point && projectScheduleAnalysis(projectWithPlannedSchedule(project)).stageMilestones.find(item=>item.id===point.id)?.forecast;
  let title,date,error;
  let dueDate=point?.dueDate||'';

  return openWbsSheet({
    title:point?'نقطهٔ عطف':'افزودن نقطهٔ عطف',
    historyKey:'stage-milestone:'+stageId+':'+(milestoneId||'new'),
    autoFocus:false,readOnly,keepParent,
    body(root){
      root.classList.add('wbs-stage-edit-body');
      title=textInput(point?.title||'');
      date=document.createElement('button');
      date.type='button';
      date.className='wbs-input wbs-date-input';
      const paintDate=()=>{date.textContent=dueDate?formatJalaliWithWeekday(dueDate):'انتخاب کنید';};
      date.onclick=()=>window.KarhaUI?.openJalaliPicker?.(dueDate,value=>{dueDate=value;paintDate();});
      paintDate();
      root.append(fieldRow('عنوان',title),fieldRow('موعد',date));
      if(Number.isFinite(forecast)){
        const forecastText=document.createElement('span');
        const late=forecast-jalaliDayNumber(dueDate);
        forecastText.textContent=formatJalaliWithWeekday(scheduleDate(forecast))
          +(late>0?' · '+new Intl.NumberFormat('fa-IR').format(late)+' روز بعد از موعد':'');
        root.append(fieldRow('تاریخ پیش‌بینی تحویل',forecastText));
      }

      const details=document.createElement('details');
      const caption=document.createElement('summary');
      const paintCaption=()=>{caption.textContent='پیش‌نیازها ('+new Intl.NumberFormat('fa-IR').format(selected.size)+')';};
      paintCaption();
      details.open=Boolean(selected.size);
      details.append(caption);
      const search=document.createElement('input');
      search.type='search';
      search.className='execution-branch-search';
      search.placeholder='جست‌وجو در کارها و زیرکارها';
      search.setAttribute('aria-label',search.placeholder);
      const choices=document.createElement('div');
      const paint=()=>{
        const query=search.value.trim().replaceAll('ي','ی').replaceAll('ك','ک');
        choices.replaceChildren();
        for(const row of candidates){
          const label=[...row.parentPath,row.title].filter(Boolean).join(' ← ');
          if(!label.replaceAll('ي','ی').replaceAll('ك','ک').includes(query))continue;
          if(readOnly && !selected.has(row.id))continue;
          const choice=document.createElement('input');
          choice.type='checkbox';
          choice.checked=selected.has(row.id);
          choice.onchange=()=>{
            if(choice.checked)selected.add(row.id);else selected.delete(row.id);
            paintCaption();
          };
          choices.append(fieldRow(label,choice));
        }
      };
      search.oninput=paint;
      if(!readOnly)details.append(search);
      details.append(choices);
      paint();
      error=document.createElement('p');
      error.className='wbs-sheet-hint';
      error.setAttribute('role','alert');
      root.append(details,error);
    },
    onSave(){
      if(readOnly)return false;
      if(!title.value.trim() || jalaliDayNumber(dueDate)===null){
        error.textContent='عنوان و موعد نقطهٔ عطف را وارد کنید.';
        return false;
      }
      const fresh=projectRepository.find(projectId)?.tasks?.find(item=>item && !item.trashed && item.id===stageId && item.kind==='stage');
      const points=stageMilestones(fresh);
      if(!fresh || milestoneId && !points.some(item=>item.id===milestoneId)){
        error.textContent='مرحله یا نقطهٔ عطف تغییر کرده است. فرم را دوباره باز کنید.';
        return false;
      }
      const validIds=new Set(flattenDependencyCandidates([fresh]).filter(row=>row.kind!=='stage').map(row=>row.id));
      const saved={id:milestoneId||'milestone-'+uid(),title:title.value.trim(),dueDate,
        predecessorIds:[...selected].filter(id=>validIds.has(id))};
      const milestones=milestoneId?points.map(item=>item.id===milestoneId?saved:item):[...points,saved];
      if(!wbsApi.updateItem(projectId,stageId,{milestones})){
        error.textContent='نقطهٔ عطف ذخیره نشد.';
        return false;
      }
      onChanged?.();
      return true;
    },
  });
}

export function workMilestoneField(project,workId,activityId,createOption){
  const stage=milestoneStageForWork(project,workId);
  const points=stageMilestones(stage);
  if(!points.length){
    const empty=document.createElement('select');
    empty.disabled=true;
    empty.className='wbs-input';
    const option=document.createElement('option');
    option.textContent='انتخاب کنید';
    empty.append(option);
    return {row:fieldRow('نقطهٔ عطف',empty),save(){}};
  }
  const initial=points.filter(point=>point.predecessorIds?.includes(String(activityId))).map(point=>String(point.id));
  const selected=new Set(initial);
  const controls=document.createElement('div');
  const paint=()=>{
    controls.replaceChildren();
    const available=points.filter(point=>!selected.has(String(point.id)));
    for(const value of [...selected,...(available.length?['']:[])]){
      const options=[...points.filter(point=>String(point.id)===value),...available]
        .map(point=>({id:String(point.id),name:point.title}));
      const change=next=>{
        selected.delete(value);
        if(next)selected.add(next);
        paint();
      };
      if(createOption){
        controls.append(createOption({name:'taskMilestone',value,options,onChange:change,clearLabel:'نقطهٔ عطف'}));
      }else{
        const select=document.createElement('select');
        select.className='wbs-input';
        for(const item of [{id:'',name:'انتخاب کنید'},...options]){
          const option=document.createElement('option');
          option.value=item.id;option.textContent=item.name;
          select.append(option);
        }
        select.value=value;
        select.onchange=()=>change(select.value);
        controls.append(select);
      }
    }
  };
  paint();
  return {
    row:fieldRow('نقطهٔ عطف',controls),
    save(projectId,id){
      const fresh=milestoneStageForWork(projectRepository.find(projectId),workId);
      if(!fresh)return;
      const latest=new Set(stageMilestones(fresh).filter(point=>point.predecessorIds?.includes(String(id))).map(point=>String(point.id)));
      for(const value of initial)if(!selected.has(value))latest.delete(value);
      for(const value of selected)if(!initial.includes(value))latest.add(value);
      const milestones=updateWorkMilestoneLinks(fresh,id,[...latest]);
      if(milestones)wbsApi.updateItem(projectId,fresh.id,{milestones});
    },
  };
}
