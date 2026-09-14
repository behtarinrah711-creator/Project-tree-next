import { workTaskApi } from '../../domain/wbs/workTaskApi.js';
import { fieldRow, openWbsSheet, textInput } from './wbsSheet.js';

export function openWorkCreationSheet({ projectId, stage, onChanged } = {}){
  const overlay = openWbsSheet({
    title:'اضافه کردن کار به:', presentation:'work-create',
    body(root){
      root.appendChild(fieldRow('عنوان کار', textInput('', {name:'title',placeholder:'مثال: خرید سیم و کابل'})));
    },
    onSave(root){
      const title=root.querySelector('[name="title"]').value.trim();
      const result=workTaskApi.create(projectId, stage.id, {
        title, type:'', priority:'normal', weight:1, amount:0,
        scheduleStart:'',scheduleEnd:'',assigneeContactId:'',contractorContactId:'',
      });
      if(!result.ok) return false;
      onChanged?.();
      return true;
    },
  });
  const subtitle=document.createElement('strong');
  subtitle.className='wbs-work-create-parent';
  subtitle.textContent=stage.text || '';
  overlay.querySelector('.sheet-caption').appendChild(subtitle);
  return overlay;
}
