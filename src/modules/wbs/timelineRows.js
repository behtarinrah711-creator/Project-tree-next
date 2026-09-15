import { isStage } from '../../domain/wbs/normalize.js';
import { scheduleRangeOf } from '../../domain/wbs/scheduling.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';
import { isExpanded } from './wbsExpandState.js';
import { ganttOrderMode, isGanttLevelVisible } from './timelineViewOptions.js';

export function sortTimelineRows(rows, orderMode = 'date'){
  if(orderMode === 'wbs') return rows;
  return rows
    .map((row, index) => ({row, index}))
    .sort((a, b) => {
      const aStart = a.row.range?.start;
      const bStart = b.row.range?.start;
      const aScheduled = Number.isFinite(aStart);
      const bScheduled = Number.isFinite(bStart);
      if(aScheduled !== bScheduled) return aScheduled ? -1 : 1;
      if(!aScheduled) return a.index - b.index;
      if(aStart !== bStart) return aStart - bStart;
      const aEnd = Number.isFinite(a.row.range?.end) ? a.row.range.end : aStart;
      const bEnd = Number.isFinite(b.row.range?.end) ? b.row.range.end : bStart;
      return (aEnd - bEnd) || (a.index - b.index);
    })
    .map(entry => entry.row);
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
  const visit = (nodes, depth = 0, visibleDepth = 0) => (nodes || []).filter(node => node && !node.trashed).forEach(item => {
    const kind = isStage(item) ? 'stage' : 'work';
    const shown = visible({item, kind, depth});
    if(shown) rows.push({item, kind, grouping:true, depth:visibleDepth, sourceDepth:depth,
      range:scheduleRangeOf(item), shadeLevel:Math.max(1, maxDepth - depth + 1)});
    if(shown && !expanded(item.id)) return;
    const childDepth = visibleDepth + (shown ? 1 : 0);
    visit(item.subtasks, depth + 1, childDepth);
    activeWorkTasks(item).forEach(task => {
      const taskItem = {...task, kind:'workTask', text:task.title, parentWork:item};
      if(visible({item:taskItem, kind:'workTask', depth:depth + 1})){
        rows.push({item:taskItem, kind:'workTask', depth:childDepth, sourceDepth:depth + 1,
          range:scheduleRangeOf(taskItem), shadeLevel:0});
      }
    });
  });
  visit(items);
  return sortTimelineRows(rows, orderMode);
}
