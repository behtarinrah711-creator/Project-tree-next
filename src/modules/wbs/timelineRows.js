import { isStage } from '../../domain/wbs/normalize.js';
import { scheduleRangeOf } from '../../domain/wbs/scheduling.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';
import { isExpanded } from './wbsExpandState.js';
import { ganttOrderMode, isGanttLevelVisible } from './timelineViewOptions.js';

export const timelineByElement = new WeakMap();

function compareTimelineDates(a, b){
  const aStart = a.range?.start;
  const bStart = b.range?.start;
  const aScheduled = Number.isFinite(aStart);
  const bScheduled = Number.isFinite(bStart);
  if(aScheduled !== bScheduled) return aScheduled ? -1 : 1;
  if(!aScheduled) return 0;
  if(aStart !== bStart) return aStart - bStart;
  const aEnd = Number.isFinite(a.range?.end) ? a.range.end : aStart;
  const bEnd = Number.isFinite(b.range?.end) ? b.range.end : bStart;
  return aEnd - bEnd;
}

export function sortTimelineRows(rows, orderMode = 'date'){
  if(orderMode === 'wbs') return rows;

  return [...rows].sort(compareTimelineDates);
}

// Both the base DOM and its SVG details must consume the same ordered rows.
// Legacy work nodes remain grouping stages without rewriting stored data.
export function buildTimelineRows(items, projectId, {
  visible = isGanttLevelVisible,
  branchKeys,
  expanded = itemId => isExpanded(projectId, itemId),
  orderMode = ganttOrderMode(),
} = {}){
  let maxDepth = 0;
  const measure = (nodes, depth = 0) => (nodes || []).filter(node => node && !node.trashed).forEach(node => {
    maxDepth = Math.max(maxDepth, depth);
    measure(node.subtasks, depth + 1);
  });
  measure(items);
  const rows = [];
  const visit = (nodes, depth = 0, visibleDepth = 0, rootId = null) => (nodes || []).filter(node => node && !node.trashed).forEach(item => {
    const branchRootId = rootId || item.id;
    const kind = isStage(item) ? 'stage' : 'work';
    const tasks = activeWorkTasks(item);
    const hasDirectSubwork = kind === 'work' && tasks.some(task => task.isSubwork && !task.parentTaskId);
    const shown = !hasDirectSubwork && (!branchKeys || branchKeys.has('branch:'+item.id)) && visible({item, kind, depth});
    if(shown) rows.push({item, kind, grouping:true, depth:visibleDepth, sourceDepth:depth,
      range:scheduleRangeOf(item), shadeLevel:Math.max(1, maxDepth - depth + 1), rootId:branchRootId});
    const childDepth = visibleDepth + (shown ? 1 : 0);
    if(shown && !expanded(item.id)) return;
    visit(item.subtasks, depth + 1, childDepth, branchRootId);
    const addTask=(task,sourceDepth)=>{
      const children=tasks.filter(child=>String(child.parentTaskId || '')===String(task.id));
      if(children.length){
        for(const child of children)addTask(child,sourceDepth+1);
        return;
      }
      const taskItem={...task,kind:'workTask',text:task.title,parentWork:item};
      if((!branchKeys || branchKeys.has('task:'+item.id+':'+task.id))
        && visible({item:taskItem,kind:'workTask',depth:sourceDepth})){
        rows.push({item:taskItem,kind:'workTask',depth:childDepth,sourceDepth,
          range:scheduleRangeOf(taskItem),shadeLevel:0,rootId:branchRootId});
      }
    };
    for(const task of tasks.filter(task=>!task.parentTaskId))addTask(task,depth+1);
  });
  visit(items);
  return sortTimelineRows(rows, orderMode);
}
