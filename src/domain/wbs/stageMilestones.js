import {findInTree,isStage} from './normalize.js';

export function stageMilestones(stage){
  return Array.isArray(stage?.milestones) ? stage.milestones.filter(milestone=>milestone?.id) : [];
}

export function milestoneStageForWork(project,workId){
  const roots=(project?.tasks||[]).filter(item=>item && !item.trashed && isStage(item));
  return roots.find(stage=>findInTree([stage],workId)) || null;
}

export function updateWorkMilestoneLinks(stage,workId,selectedIds){
  const selected=new Set(selectedIds.map(String));
  const key=String(workId);
  let changed=false;
  const milestones=stageMilestones(stage).map(milestone=>{
    const ids=(milestone.predecessorIds||[]).map(String);
    if(ids.includes(key)===selected.has(String(milestone.id)))return milestone;
    changed=true;
    return {...milestone,predecessorIds:selected.has(String(milestone.id))
      ? [...ids,key] : ids.filter(id=>id!==key)};
  });
  return changed?milestones:null;
}
