import { isWork, lineTotal } from './normalize.js';

export function workItemEstimate(item){
  return lineTotal(item);
}

function walkVisible(items, visit){
  (items || []).forEach(item => {
    if(!item || item.trashed) return;
    visit(item);
    walkVisible(item.subtasks, visit);
  });
}

export function rollupEstimate(items){
  let total = 0;
  walkVisible(items, item => {
    if(isWork(item)) total += lineTotal(item);
  });
  return total;
}

export function generalCostTotal(items){
  return (items || []).reduce((sum, item) => {
    if(!item || item.trashed) return sum;
    const qty = Number(item.quantity) || 0;
    const unitCost = Number(item.unitCost) || 0;
    return sum + qty * unitCost;
  }, 0);
}

export function projectEstimateTotal(tasks, generalConditions){
  return rollupEstimate(tasks) + generalCostTotal(generalConditions);
}

export function rollupProgress(items){
  const works = [];
  walkVisible(items, item => {
    if(!isWork(item)) return;
    works.push(Number(item.progress) || (item.done ? 100 : 0));
  });
  if(!works.length) return 0;
  return Math.round(works.reduce((a, b) => a + b, 0) / works.length);
}
