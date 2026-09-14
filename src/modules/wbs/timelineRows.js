import { isStage } from '../../domain/wbs/normalize.js';
import { scheduleRangeOf } from '../../domain/wbs/scheduling.js';
import { activeWorkTasks } from '../../domain/wbs/workTaskModel.js';
import { isExpanded } from './wbsExpandState.js';
import { isGanttLevelVisible } from './timelineViewOptions.js';

// Both the base DOM and its SVG details must consume the same ordered rows.
// Legacy work nodes remain grouping stages without rewriting stored data.
export function buildTimelineRows(items, projectId, {
  visible = isGanttLevelVisible,
  expanded = itemId => isExpanded(projectId, itemId),
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
  return rows;
}
