import { projectRepository } from '../../data/projectRepository.js';
import { normalizeItem } from './normalize.js';
import { nowIso } from './timestamps.js';
import { projectEstimateTotal } from './estimate.js';

export const WBS_EXPORT_SCHEMA = 'wbs-export-v1';

function strip(item){
  const node = normalizeItem(item);
  return {
    id: node.id,
    kind: node.kind,
    text: node.text,
    status: node.status,
    progress: node.progress,
    progressWeight: node.progressWeight,
    type: node.type,
    priority: node.priority,
    quantity: node.quantity,
    unit: node.unit,
    unitCost: node.unitCost,
    activityIds: node.activityIds,
    description: node.description,
    createdAt: node.createdAt || null,
    updatedAt: node.updatedAt || null,
    children: (node.subtasks || []).filter(x => !x.trashed).map(strip),
  };
}

export function exportProjectWbs(projectId, clock){
  const project = projectRepository.find(projectId);
  if(!project) return null;
  const tasks = Array.isArray(project.tasks) ? project.tasks.filter(x => !x.trashed) : [];
  const general = (project.generalConditions || []).filter(x => !x.trashed);
  return {
    schema: WBS_EXPORT_SCHEMA,
    version: 1,
    projectId: project.id,
    projectName: project.name || '',
    exportedAt: nowIso(clock),
    items: tasks.map(strip),
    generalConditions: general.map(item => ({
      id: item.id,
      title: item.title,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || '',
      unitCost: Number(item.unitCost) || 0,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
    })),
    totals: {
      wbs: projectEstimateTotal(tasks, []),
      general: projectEstimateTotal([], general),
      project: projectEstimateTotal(tasks, general),
    },
  };
}

export function validateWbsExport(payload){
  if(!payload || payload.schema !== WBS_EXPORT_SCHEMA) return { ok:false, code:'schema' };
  if(!Array.isArray(payload.items)) return { ok:false, code:'items' };
  return { ok:true };
}
