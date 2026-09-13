import { findInTree, isStage } from './normalize.js';

export const STAGE_MODES = Object.freeze(['none', 'single', 'multiple']);

export function stageModeOf(project){
  const mode = project?.settings?.stageMode;
  if(STAGE_MODES.includes(mode)) return mode;
  // Preserve explicitly enabled multi-stage projects from the previous setting.
  return project?.settings?.allowNestedStages === true ? 'multiple' : 'none';
}

export function allowsNestedStages(project){ return stageModeOf(project) === 'multiple'; }

export function stageAddKinds(project, stageId){
  const found = findInTree(project?.tasks || [], stageId);
  if(!found || !isStage(found.item)) return [];
  const existing = new Set((found.item.subtasks || []).filter(item => !item.trashed)
    .map(item => isStage(item) ? 'stage' : 'work'));
  const mode = stageModeOf(project);
  // Keep the existing multi-stage behavior for legacy roots already owning works.
  const kinds = !found.parent ? (mode === 'none' || (mode === 'multiple' && existing.has('work')) ? ['work'] : ['stage'])
    : mode === 'multiple' ? ['stage', 'work'] : ['work'];
  return kinds.filter(kind => !existing.size || (existing.size === 1 && existing.has(kind)));
}
