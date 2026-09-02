import { isWork, lineTotal, progressOf, progressWeightOf } from './normalize.js';

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
  const progressFor = item => {
    if(isWork(item)) return progressOf(item);
    const children = (item?.subtasks || []).filter(child => child && !child.trashed);
    if(!children.length) return 0;
    const totalWeight = children.reduce((sum, child) => sum + progressWeightOf(child), 0);
    const weighted = children.reduce((sum, child) => (
      sum + progressFor(child) * progressWeightOf(child)
    ), 0);
    return totalWeight ? weighted / totalWeight : 0;
  };
  const visible = (items || []).filter(item => item && !item.trashed);
  if(!visible.length) return 0;
  const totalWeight = visible.reduce((sum, item) => sum + progressWeightOf(item), 0);
  const weighted = visible.reduce((sum, item) => (
    sum + progressFor(item) * progressWeightOf(item)
  ), 0);
  return totalWeight ? Math.round(weighted / totalWeight) : 0;
}
