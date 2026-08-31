import { normalizeProjectData, normalizeProjectScopedData } from './normalizeProjectData.js';
import { migrateLegacyGlobalWorkspaceData } from './legacyWorkspaceMigration.js';

export function runDataMigrations(snapshot,{schemaVersion,activeProjectId,markDirty,rememberProjectTasks=()=>{}}){
  if(!snapshot.starredOrder) snapshot.starredOrder=[];
  if(!Array.isArray(snapshot.projects)) snapshot.projects=[];
  snapshot.projects.forEach(project=>{
    normalizeProjectData(project,schemaVersion);
    rememberProjectTasks(project);
  });
  migrateLegacyGlobalWorkspaceData(snapshot,{activeProjectId,markDirty});
  return snapshot;
}

export { normalizeProjectData, normalizeProjectScopedData, migrateLegacyGlobalWorkspaceData };
