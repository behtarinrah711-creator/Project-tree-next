import { wbsApi } from '../../domain/wbs/wbsApi.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';
import { lineTotal, progressWeightOf } from '../../domain/wbs/normalize.js';
import { toEnglishDigits } from '../../ui/digits.js';
import { openNumpadGeneric } from '../../ui/numpad.js';
import { fieldRow, openWbsSheet } from './wbsSheet.js';

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

export function openStageEditSheet({projectId,stage,onChanged,onDelete}={}){
  let titleEditor;
  const overlay=openWbsSheet({
    title:'مرحله:',presentation:'stage-create',autoFocus:false,
    body(root){
      if(!activeWorkTasks(stage).length) numericRow(root,'manualCost','هزینه',lineTotal(stage),true);
      numericRow(root,'progressWeight','وزن مرحله',progressWeightOf(stage));
      const description=document.createElement('textarea');
      description.name='description';
      description.className='wbs-inline-description';
      description.value=stage.description || '';
      description.rows=2;
      root.appendChild(fieldRow('توضیح اختیاری',description));
      root.classList.add('wbs-stage-edit-body');
      if(onDelete){
        const remove=document.createElement('button');
        remove.type='button';
        remove.className='wbs-info-row is-danger';
        remove.textContent='حذف مرحله';
        remove.addEventListener('click',onDelete);
        root.appendChild(remove);
      }
    },
    onSave(root){
      const title=(titleEditor.textContent || '').trim();
      const weight=Number(root.querySelector('[name="progressWeight"]').dataset.value);
      const cost=root.querySelector('[name="manualCost"]');
      const amount=cost?Number(cost.dataset.value):null;
      if(!title || !Number.isFinite(weight) || weight<=0 || (cost && (!Number.isFinite(amount)||amount<0))) return false;
      const latest=wbsApi.get(projectId,stage.id);
      const costPatch=cost && !activeWorkTasks(latest).length?{manualCost:amount}:{};
      if(!wbsApi.updateItem(projectId,stage.id,{
        text:title,progressWeight:weight,description:root.querySelector('[name="description"]').value.trim(),...costPatch,
      })) return false;
      onChanged?.();
      return true;
    },
  });
  titleEditor=document.createElement('span');
  titleEditor.className='wbs-stage-edit-title';
  titleEditor.contentEditable='true';
  titleEditor.setAttribute('role','textbox');
  titleEditor.setAttribute('aria-label','عنوان مرحله');
  titleEditor.textContent=stage.text || '';
  titleEditor.addEventListener('keydown',event=>{if(event.key==='Enter') event.preventDefault();});
  overlay.querySelector('.sheet-caption').append(' ',titleEditor);
  return overlay;
}
