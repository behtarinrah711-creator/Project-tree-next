import { isStage } from '../../domain/wbs/normalize.js';
import { scheduleRangeOf } from '../../domain/wbs/scheduling.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';
import { isExpanded } from './wbsExpandState.js';
import { ganttOrderMode, isGanttLevelVisible } from './timelineViewOptions.js';

function compareTimelineDates(a, b){
  const aStart = a.range?.start;
  const bStart = b.range?.start;
  const aScheduled = Number.isFinite(aStart);
  const bScheduled = Number.isFinite(bStart);
  if(aScheduled !== bScheduled) return aScheduled ? -1 : 1;
  if(!aScheduled) return 0;
  if(aStart !== bStart) return aStart - bStart;
  if(Boolean(a.grouping) !== Boolean(b.grouping)) return a.grouping ? -1 : 1;
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
    const shown = visible({item, kind, depth});
    if(shown) rows.push({item, kind, grouping:true, depth:visibleDepth, sourceDepth:depth,
      range:scheduleRangeOf(item), shadeLevel:Math.max(1, maxDepth - depth + 1), rootId:branchRootId});
    const childDepth = visibleDepth + (shown ? 1 : 0);
    if(shown && !expanded(item.id)) return;
    visit(item.subtasks, depth + 1, childDepth, branchRootId);
    const tasks=activeWorkTasks(item);
    const addTask=(task,sourceDepth,rowDepth)=>{
      const children=tasks.filter(child=>child.parentTaskId===task.id);
      const taskItem={...task,kind:'workTask',text:task.title,parentWork:item,...(children.length?{subworkChildren:children}:{})};
      const taskShown=visible({item:taskItem,kind:'workTask',depth:sourceDepth});
      if(taskShown)rows.push({item:taskItem,kind:'workTask',...(children.length?{grouping:true}:{}),
        depth:rowDepth,sourceDepth,range:scheduleRangeOf(taskItem),shadeLevel:0,rootId:branchRootId});
      if(!taskShown || expanded(task.id)){
        for(const child of children)addTask(child,sourceDepth+1,rowDepth+Number(taskShown));
      }
    };
    for(const task of tasks.filter(task=>!task.parentTaskId))addTask(task,depth+1,childDepth);
  });
  visit(items);
  return sortTimelineRows(rows, orderMode);
}
