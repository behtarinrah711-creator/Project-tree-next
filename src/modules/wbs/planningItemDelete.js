import {findInTree,isStage} from '../../domain/wbs/normalize.js';
import {projectRepository} from '../../data/projectRepository.js';

export function requestPlanningItemDelete(projectId,item,onChanged){
  const located = findInTree(projectRepository.find(projectId)?.tasks || [],item.id);
  if(!located) return;
  const stage = isStage(item);
  const perform = () => {
    const type = located.parent ? 'sub' : 'task';
    const sid = located.parent ? item.id : null;
    const label = stage ? 'مرحله حذف شد' : 'کار حذف شد';
    const softDelete = window.KarhaSoftDelete?.softDelete;
    if(typeof softDelete !== 'function') return;
    if(softDelete(type, projectId, located.rootId, sid, label, { undo:false })){
      onChanged?.();
    }
  };
  const message = stage
    ? 'این مرحله و تمام زیرمجموعه‌های آن حذف شوند؟'
    : 'این کار از برنامه پروژه حذف شود؟';
  if(typeof window.KarhaUI?.openConfirm === 'function'){
    window.KarhaUI.openConfirm(message, perform, 'حذف');
  }else if(window.confirm(message)){
    perform();
  }
}
