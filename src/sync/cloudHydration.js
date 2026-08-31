import { mergeOwnedCloudSnapshots } from './mergeCloudSnapshots.js';
import { applyCloudProjectList } from './applyCloudSnapshot.js';

/**
 * Canonical D5 metadata hydrate/apply pipeline.
 * The Store supplies both the D3 project list and D4 synchronization guards.
 */
export function applyOwnedCloudProjects({
  appDataStore,
  ownedDocs = [],
  currentUser = null,
  docToProject,
} = {}){
  const snapshot = appDataStore.getSnapshot();
  const result = mergeOwnedCloudSnapshots({
    ownedDocs,
    appDataStore,
    currentUser,
    docToProject,
    preservedActive: snapshot.activeTab,
    preservedMode: snapshot.viewMode,
    preservedStarredOrder: snapshot.starredOrder,
  });
  applyCloudProjectList(result.projects);
  if(result.activeTab != null) appDataStore.setActiveTab(result.activeTab);
  if(result.viewMode) appDataStore.setViewMode(result.viewMode);
  snapshot.starredOrder = result.starredOrder;
  return appDataStore.getProjects();
}

/** One listener callback owns metadata apply followed by task hydration. */
export function createOwnedSnapshotHandler({
  appDataStore,
  getCurrentUser,
  docToProject,
  hydrateProjects,
  persistLocal,
} = {}){
  return async function handleOwnedSnapshot(ownedDocs = []){
    const projects = applyOwnedCloudProjects({
      appDataStore,
      ownedDocs,
      currentUser: getCurrentUser?.() || null,
      docToProject,
    });
    persistLocal?.();
    await hydrateProjects?.(ownedDocs);
    return projects;
  };
}
