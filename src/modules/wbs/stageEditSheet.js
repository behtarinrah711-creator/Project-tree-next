import { openStageMilestoneSheet, workMilestoneField } from './stageMilestoneSheet.js';
import { stageMilestones } from '../../domain/wbs/stageMilestones.js';
import { renderWorkFormHistory } from './workFormHistory.js';
import { workFormHistoryEntry } from '../../domain/wbs/workFormHistory.js';
import { currentExecutionActor } from './executionActor.js';
import {confirmSaosaWorkspaceSave,isSaosaHost,saosaWorkspaceSaveDiagnostic} from '../../cloud/saosaWorkspaceSync.js';
import {projectRepository} from '../../data/projectRepository.js';
import {workPath} from '../../domain/wbs/costline.js';
import {findInTree} from '../../domain/wbs/normalize.js';
import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';
import { isWork, lineTotal, progressWeightOf } from '../../domain/wbs/normalize.js';
import { toEnglishDigits } from '../../ui/digits.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import { closeWbsSheet, fieldRow, openWbsSheet, workPathRow } from './wbsSheet.js';

function numericRow(root, name, label, value, money=false){
  const control=document.createElement('button');
  control.type='button';
  control.className='wbs-inline-number';
  control.name=name;
  control.dataset.value=String(value);
  const paint=()=>{
    control.replaceChildren();
    const amount=document.createElement('span');
    amount.textContent=new Intl.NumberFormat('fa-IR').format(Number(control.dataset.value)||0);
    control.appendChild(amount);
    if(money){
      const unit=document.createElement('small');
      unit.textContent='تومان';
      control.appendChild(unit);
    }
  };
  control.addEventListener('click',()=>openNumpadGeneric(control.dataset.value, raw=>{
    control.dataset.value=toEnglishDigits(String(raw)).replace(/[^\d.]/g,'');
    paint();
  },{group:money,suffix:money?' تومان':'',maxLen:16}));
  paint();
  root.appendChild(fieldRow(label,control));
  return control;
}

function showsManualCost(item){
  const tasks=activeWorkTasks(item);
  return !tasks.length || (isWork(item) && tasks.some(task=>task.isSubwork));
}

export function openStageEditSheet({projectId,stage,onChanged,onDelete,readOnly=false}={}){
  let titleEditor;
  let saving=false;
  let milestoneField;
  const overlay=openWbsSheet({
    title:'مرحله:',presentation:'stage-create',autoFocus:false,readOnly,
    body(root){
      if(isWork(stage)){
        const tasks = projectRepository.find(projectId)?.tasks;
        const location = findInTree(tasks || [], stage.id);
        if(location){
          const path = location.parent ? workPath(tasks, location.parent.id) : 'ریشهٔ پروژه';
          if(path)root.append(workPathRow(path));
        }
      }
      if(showsManualCost(stage)) numericRow(root,'manualCost',isWork(stage)?'مبلغ':'هزینه',stage.manualCost ?? (activeWorkTasks(stage).length?0:lineTotal(stage)),true);
      numericRow(root,'progressWeight','وزن مرحله',progressWeightOf(stage));
      const description=document.createElement('textarea');
      description.name='description';
      description.className='wbs-inline-description';
      description.value=stage.description || '';
      description.rows=2;
      root.appendChild(fieldRow('توضیح اختیاری',description));
      root.classList.add('wbs-stage-edit-body');
      const project=projectRepository.find(projectId);
      if(stage.kind==='stage' && project?.tasks?.some(item=>item.id===stage.id)){
        const section=document.createElement('section');
        const heading=document.createElement('h3');
        heading.className='wbs-task-form-section';heading.textContent='نقاط عطف';
        const list=document.createElement('div');
        const open=milestoneId=>openStageMilestoneSheet({projectId,stageId:stage.id,milestoneId,readOnly,keepParent:true,
          onChanged:()=>{paint();onChanged?.();}});
        const paint=()=>{
          list.replaceChildren();
          for(const point of stageMilestones(wbsApi.get(projectId,stage.id))){
            const button=document.createElement('button');
            button.type='button';button.className='wbs-info-row';
            button.textContent='◆ '+point.title+' · '+point.dueDate;
            button.onclick=()=>open(point.id);
            list.append(button);
          }
        };
        const add=document.createElement('button');
        add.type='button';add.className='wbs-choice';add.textContent='+ افزودن نقطهٔ عطف';
        add.onclick=()=>open();
        paint();
        section.append(heading,list);
        if(!readOnly)section.append(add);
        root.append(section);
      }else if(isWork(stage)){
        milestoneField=workMilestoneField(project,stage.id,stage.id);
        if(milestoneField)root.append(milestoneField.row);
      }
      if(onDelete && !readOnly){
        const remove=document.createElement('button');
        remove.type='button';
        remove.className='wbs-info-row is-danger';
        remove.textContent='حذف مرحله';
        remove.addEventListener('click',onDelete);
        root.appendChild(remove);
      }
      if(isWork(stage))root.append(renderWorkFormHistory(document,stage));
    },
    onSave(root){
      if(saving)return false;
      const title=(titleEditor.textContent || '').trim();
      const weight=Number(root.querySelector('[name="progressWeight"]').dataset.value);
      const cost=root.querySelector('[name="manualCost"]');
      const amount=cost?Number(cost.dataset.value):null;
      if(!title || !Number.isFinite(weight) || weight<=0 || (cost && (!Number.isFinite(amount)||amount<0))) return false;
      const latest=wbsApi.get(projectId,stage.id);
      const costPatch=cost && showsManualCost(latest)?{manualCost:amount}:{};
      const patch={text:title,progressWeight:weight,description:root.querySelector('[name="description"]').value.trim(),...costPatch};
      const at=Date.now();
      if(latest && isWork(latest)){
        const project=projectRepository.find(projectId);
        const event=workFormHistoryEntry(project,latest,patch,currentExecutionActor(project),at);
        if(event)patch.formHistory=[...(latest.formHistory||[]),event];
      }
      const saved=wbsApi.updateItem(projectId,stage.id,patch,()=>at);
      if(!saved)return false;
      milestoneField?.save(projectId,stage.id);
      if(isSaosaHost()){
        saving=true;
        const button=overlay.querySelector('.wbs-sheet-save');
        button.disabled=true;
        button.textContent='در حال ذخیره…';
        void confirmSaosaWorkspaceSave().then(snapshot=>{
          if(!snapshot)throw new Error(saosaWorkspaceSaveDiagnostic() || 'save_response_unavailable');
          const project=snapshot?.projects?.find(row=>String(row.id)===String(projectId));
          const confirmed=findInTree(project?.tasks||[],stage.id)?.item;
          if(!confirmed || confirmed.updatedAt!==saved.updatedAt)throw new Error('HTTP 200 · work_edit_not_confirmed');
          if(overlay.isConnected)closeWbsSheet();
          onChanged?.();
        }).catch(error=>{
          window.KarhaUI?.showToast?.('ذخیره در سرور تأیید نشد ('+error.message+'). دوباره تلاش کنید.');
        }).finally(()=>{
          saving=false;
          button.disabled=false;
          button.textContent='ذخیره';
        });
        return false;
      }
      onChanged?.();
      return true;
    },
  });
  titleEditor=document.createElement('span');
  titleEditor.className='wbs-stage-edit-title';
  titleEditor.contentEditable=readOnly?'false':'true';
  titleEditor.setAttribute('role','textbox');
  titleEditor.setAttribute('aria-label','عنوان مرحله');
  titleEditor.textContent=stage.text || '';
  titleEditor.addEventListener('keydown',event=>{if(event.key==='Enter') event.preventDefault();});
  overlay.querySelector('.sheet-caption').append(' ',titleEditor);
  return overlay;
}
