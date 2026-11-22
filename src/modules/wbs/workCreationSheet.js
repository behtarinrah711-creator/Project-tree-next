import { revealBranch,isExpanded,toggleExpanded } from './wbsExpandState.js';
import { projectRepository } from '../../data/projectRepository.js';
import { workTaskApi } from '../../domain/wbs/workTaskApi.js';
import { fieldRow, openWbsSheet, textInput } from './wbsSheet.js';

export function openWorkCreationSheet({ projectId, stage, onChanged, subwork=false, parentTask=null } = {}){
  const overlay = openWbsSheet({
    title:subwork?'اضافه کردن زیرکار به:':'اضافه کردن کار به:', presentation:'work-create',
    historyKey:`wbs-work-create:${projectId}:${stage.id}`,
    body(root){
      root.appendChild(fieldRow(subwork?'عنوان زیرکار':'عنوان کار', textInput('', {name:'title',placeholder:subwork?'مثال: مرحله یک برق‌کشی':'مثال: خرید سیم و کابل'})));
    },
    onSave(root){
      const title=root.querySelector('[name="title"]').value.trim();
      const result=workTaskApi.create(projectId, stage.id, {
        title, ...(subwork?{isSubwork:true,parentTaskId:parentTask?.id||''}:{}), type:'', priority:'normal', weight:1, amount:0,
        scheduleStart:'',scheduleEnd:'',assigneeContactId:'',contractorContactId:'',
      });
      if(!result.ok) return false;
      revealBranch(projectId, projectRepository.find(projectId)?.tasks || [], stage.id);
      if(parentTask && !isExpanded(projectId,parentTask.id))toggleExpanded(projectId,parentTask.id);
      onChanged?.();
      return true;
    },
  });
  const subtitle=document.createElement('strong');
  subtitle.className='wbs-create-parent';
  subtitle.textContent=parentTask?.title || stage.text || '';
  overlay.querySelector('.sheet-caption').appendChild(subtitle);
  return overlay;
}
