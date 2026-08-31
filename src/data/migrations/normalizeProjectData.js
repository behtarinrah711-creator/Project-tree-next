/** Preserve the v8 project shape while hydrating fields omitted by older data. */
export function normalizeProjectScopedData(project){
  if(!project) return project;
  if(!Array.isArray(project.tasks)) project.tasks=[];
  if(!Array.isArray(project.contacts)) project.contacts=[];
  if(!Array.isArray(project.activityTemplates)) project.activityTemplates=[];
  if(!Array.isArray(project.contractTemplates)) project.contractTemplates=[];
  if(!Array.isArray(project.contracts)) project.contracts=[];
  if(!Array.isArray(project.contractStatusReports)) project.contractStatusReports=[];
  project.contractTemplates.forEach(item=>{ if(item && item.trashed===undefined) item.trashed=false; });
  project.contracts.forEach(item=>{
    if(!item) return;
    if(item.trashed===undefined) item.trashed=false;
    if(!Array.isArray(item.progressTimeline)) item.progressTimeline=[];
    if(item.progressPercent==null) item.progressPercent=0;
  });
  project.contacts.forEach(item=>{ if(item && item.trashed===undefined) item.trashed=false; });
  project.activityTemplates.forEach(item=>{ if(item && item.trashed===undefined) item.trashed=false; });
  return project;
}

export function normalizeProjectData(project, schemaVersion){
  if(!project) return project;
  project.type='project';
  project.schemaVersion=schemaVersion;
  if(project.archived===undefined) project.archived=false;
  if(project.trashed===undefined) project.trashed=false;
  normalizeProjectScopedData(project);
  project.tasks.forEach(task=>{
    if(task && task.completedAt===undefined) task.completedAt=task.done ? 0 : null;
  });
  return project;
}
