import { findInTree, isStage } from './normalize.js';

export const STAGE_MODES = Object.freeze(['base', 'none', 'single', 'multiple']);

export function stageModeOf(project){
  const mode = project?.settings?.stageMode;
  if(STAGE_MODES.includes(mode)) return mode;
  // Preserve explicitly enabled multi-stage projects from the previous setting.
  return project?.settings?.allowNestedStages === true ? 'multiple' : 'none';
}

export function allowsNestedStages(project){ return stageModeOf(project) === 'multiple'; }

export function stageAddKinds(project, stageId){
  const mode = stageModeOf(project);
  if(mode === 'base') return [];
  const found = findInTree(project?.tasks || [], stageId);
  if(!found || !isStage(found.item)) return [];
  let depth = 0;
  let parent = found.parent;
  while(parent){
    depth += 1;
    parent = findInTree(project.tasks, parent.id)?.parent;
  }
  if(mode === 'multiple') return depth < 3 ? ['stage'] : ['stage', 'work'];
  const kinds = mode === 'single' && depth === 0 ? ['stage'] : ['work'];
  const existing = new Set((found.item.subtasks || []).filter(item => !item.trashed).map(item => isStage(item) ? 'stage' : 'work'));
  return kinds.filter(kind => !existing.size || (existing.size === 1 && existing.has(kind)));
}
