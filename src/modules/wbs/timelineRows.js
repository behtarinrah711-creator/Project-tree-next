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
  const aEnd = Number.isFinite(a.range?.end) ? a.range.end : aStart;
  const bEnd = Number.isFinite(b.range?.end) ? b.range.end : bStart;
  return aEnd - bEnd;
}

export function sortTimelineRows(rows, orderMode = 'date'){
  if(orderMode === 'wbs') return rows;

  // Date ordering applies to root branches, not individual flattened rows.
  // Keeping each branch intact guarantees that a stage is always rendered
  // before its descendant stages and tasks.
  const branches = [];
  const branchByRoot = new Map();
  rows.forEach((row, index) => {
    const rootId = String(row.rootId ?? row.item?.id ?? index);
    let branch = branchByRoot.get(rootId);
    if(!branch){
      branch = { rows:[], index, range:row.range };
      branchByRoot.set(rootId, branch);
      branches.push(branch);
    }
    branch.rows.push(row);
    if(!branch.range && row.range) branch.range = row.range;
  });

  return branches
    .sort((a, b) => compareTimelineDates(a, b) || a.index - b.index)
    .flatMap(branch => branch.rows);
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
    activeWorkTasks(item).forEach(task => {
      const taskItem = {...task, kind:'workTask', text:task.title, parentWork:item};
      if(visible({item:taskItem, kind:'workTask', depth:depth + 1})){
        rows.push({item:taskItem, kind:'workTask', depth:childDepth, sourceDepth:depth + 1,
          range:scheduleRangeOf(taskItem), shadeLevel:0, rootId:branchRootId});
      }
    });
  });
  visit(items);
  return sortTimelineRows(rows, orderMode);
}
