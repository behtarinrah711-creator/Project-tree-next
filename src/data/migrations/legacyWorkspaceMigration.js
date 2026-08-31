import { normalizeProjectScopedData } from './normalizeProjectData.js';

/** Move pre-project contacts/activities to their historical project scope. */
export function migrateLegacyGlobalWorkspaceData(snapshot,{activeProjectId=null,markDirty=()=>{}}={}){
  const contacts=Array.isArray(snapshot?.contacts)?snapshot.contacts:[];
  const activities=Array.isArray(snapshot?.activityTemplates)?snapshot.activityTemplates:[];
  if(!contacts.length && !activities.length) return false;
  const projects=Array.isArray(snapshot.projects)?snapshot.projects:[];
  const target=projects.find(p=>p.id===activeProjectId&&!p.trashed&&!p.archived)
    || projects.find(p=>!p.trashed&&!p.archived);
  if(!target) return false;
  normalizeProjectScopedData(target);
  const byId=new Map(projects.map(project=>[String(project.id),project]));
  const addUnique=(items,item)=>{
    if(item?.id&&!items.some(existing=>String(existing.id)===String(item.id))) items.push(item);
  };
  const migrate=(items,key)=>items.forEach(item=>{
    if(!item?.id) return;
    const scoped=(item.trashed&&item.deletedProjectId&&byId.get(String(item.deletedProjectId)))||target;
    normalizeProjectScopedData(scoped);
    addUnique(scoped[key],item);
    delete item.deletedProjectId;
    markDirty(scoped.id);
  });
  migrate(contacts,'contacts');
  migrate(activities,'activityTemplates');
  delete snapshot.contacts;
  delete snapshot.activityTemplates;
  return true;
}
