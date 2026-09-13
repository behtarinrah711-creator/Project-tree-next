import { findInTree, isStage } from './normalize.js';

export function allowsNestedStages(project){
  return project?.settings?.allowNestedStages === true;
}

export function stageAddKinds(project, stageId){
  const found = findInTree(project?.tasks || [], stageId);
  if(!found || !isStage(found.item)) return [];
  const existing = new Set((found.item.subtasks || []).filter(item => !item.trashed)
    .map(item => isStage(item) ? 'stage' : 'work'));
  // Legacy root containers that already own works keep their existing shape.
  const kinds = !found.parent ? (existing.has('work') ? ['work'] : ['stage'])
    : allowsNestedStages(project) ? ['stage', 'work'] : ['work'];
  return kinds.filter(kind => !existing.size || (existing.size === 1 && existing.has(kind)));
}
