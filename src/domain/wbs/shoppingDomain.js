import { activeWorkTasks } from './workTaskModel.js';
import { isWork, lineTotal } from './normalize.js';
import { executionStatus, timeState, tehranTodayJalali } from './todayDomain.js';

export const SHOPPING_MODES = Object.freeze(['overdue','today','future','pending','unscheduled']);

function purchaseAmount(entity){
  return entity?.workId ? Math.max(0, Number(entity.amount) || 0) : Math.max(0, lineTotal(entity));
}

export function collectShoppingItems(project, today = tehranTodayJalali()){
  const result = [];
  const walk = (nodes, ancestors = []) => (nodes || []).forEach(node => {
    if(!node || node.trashed) return;
    const title = node.text || node.title || '';
    if(isWork(node)){
      const tasks = activeWorkTasks(node);
      if(tasks.length){
        tasks.filter(task => task.type === 'خرید' && executionStatus(task) !== 'approved').forEach(task => result.push({
          id:String(task.id), kind:'task', entity:task, work:node, workId:String(node.id),
          path:[...ancestors, title].filter(Boolean), mode:timeState(task, today), amount:purchaseAmount(task),
        }));
      }else if(node.type === 'خرید' && executionStatus(node) !== 'approved'){
        result.push({ id:String(node.id), kind:'work', entity:node, work:node, workId:String(node.id), path:[...ancestors].filter(Boolean), mode:timeState(node, today), amount:purchaseAmount(node) });
      }
      return;
    }
    walk(node.subtasks, [...ancestors, title]);
  });
  walk(project?.tasks || []);
  return result.sort((a,b)=>String(a.entity.scheduleStart||'9999').localeCompare(String(b.entity.scheduleStart||'9999')));
}

export function shoppingItemsForMode(project, mode, today = tehranTodayJalali()){
  return collectShoppingItems(project, today).filter(item => item.mode === mode);
}

export function shoppingStatusLabel(entity){
  return ({ not_started:'خرید شروع نشده', in_progress:'در حال پیگیری خرید', pending_approval:'در انتظار تأیید خرید', approved:'خرید تأیید شده' })[executionStatus(entity)] || 'خرید شروع نشده';
}
