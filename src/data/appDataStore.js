import { STORAGE_KEYS } from '../config/deploymentConfig.js';

/**
 * Phase D1 — in-memory app snapshot sole owner.
 * This isolated build uses a dedicated storage namespace.
 * Auth/Sync orchestration is not owned here. D4 runtime dirty/pending guards are.
 */

export const APP_DATA_STORAGE_KEY = STORAGE_KEYS.appData;

/** @returns {{ schemaVersion: number, projects: array, viewMode: string, activeTab: string|null, starredOrder: array }} */
export function createEmptySnapshot(schemaVersion = 8){
  return {
    schemaVersion,
    projects: [],
    viewMode: 'simple',
    activeTab: null,
    starredOrder: [],
  };
}

function normalizeIncoming(raw, schemaVersion){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)){
    return createEmptySnapshot(schemaVersion);
  }
  const snap = raw;
  if(!Array.isArray(snap.projects)) snap.projects = [];
  if(!Array.isArray(snap.starredOrder)) snap.starredOrder = [];
  if(snap.viewMode == null || snap.viewMode === '') snap.viewMode = 'simple';
  if(snap.activeTab === undefined) snap.activeTab = null;
  if(snap.schemaVersion == null) snap.schemaVersion = schemaVersion;
  return snap;
}

/**
 * Single in-memory snapshot. Callers share this object reference.
 */
export function createAppDataStore({
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  storageKey = APP_DATA_STORAGE_KEY,
  schemaVersion = 8,
} = {}){
  let snapshot = createEmptySnapshot(schemaVersion);
  // Runtime-only synchronization guards. They deliberately remain outside the
  // persisted snapshot so load/hydrate keeps the existing storage contract.
  const dirtyProjectIds = new Set();
  const pendingCloudWrites = new Set();

  function getSnapshot(){
    return snapshot;
  }

  /** Replace canonical snapshot (same object identity for callers that re-get). */
  function replaceSnapshot(next){
    snapshot = normalizeIncoming(next, schemaVersion);
    return snapshot;
  }

  function resetToDefault(){
    snapshot = createEmptySnapshot(schemaVersion);
    return snapshot;
  }

  function loadFromStorage(){
    if(!storage){
      snapshot = createEmptySnapshot(schemaVersion);
      return snapshot;
    }
    try{
      const raw = storage.getItem(storageKey);
      if(raw){
        const parsed = JSON.parse(raw);
        snapshot = normalizeIncoming(parsed, schemaVersion);
        return snapshot;
      }
    }catch(e){}
    snapshot = createEmptySnapshot(schemaVersion);
    return snapshot;
  }

  function hasStoredSnapshot(){
    if(!storage) return false;
    try { return storage.getItem(storageKey) != null; } catch(e) { return false; }
  }

  function persistLocal(){
    if(!storage) return false;
    try{
      storage.setItem(storageKey, JSON.stringify(snapshot));
      return true;
    }catch(e){
      return false;
    }
  }

  function getProjects(){ return snapshot.projects; }
  /** D3: replace the canonical runtime project collection. */
  function setProjects(projects){
    if(!Array.isArray(projects)) throw new TypeError('projects must be an array');
    snapshot.projects = projects;
    return snapshot.projects;
  }
  function getActiveTab(){ return snapshot.activeTab; }
  function getViewMode(){ return snapshot.viewMode; }
  function getStarredOrder(){ return snapshot.starredOrder; }

  function getDirtyProjectIds(){ return dirtyProjectIds; }
  function markProjectDirty(projectId){
    if(projectId) dirtyProjectIds.add(projectId);
  }
  function isProjectDirty(projectId){ return dirtyProjectIds.has(projectId); }
  function clearProjectDirty(projectId){
    if(projectId === undefined) dirtyProjectIds.clear();
    else dirtyProjectIds.delete(projectId);
  }

  function getPendingCloudWrites(){ return pendingCloudWrites; }
  function markCloudWritePending(projectId){
    if(projectId) pendingCloudWrites.add(projectId);
  }
  function isCloudWritePending(projectId){ return pendingCloudWrites.has(projectId); }
  function clearCloudWritePending(projectId){
    if(projectId === undefined) pendingCloudWrites.clear();
    else pendingCloudWrites.delete(projectId);
  }

  /** D2: sole write path for activeTab */
  function setActiveTab(value){
    snapshot.activeTab = (value === undefined) ? null : value;
    return snapshot.activeTab;
  }

  /** D2: sole write path for viewMode */
  function setViewMode(value){
    const next = (value == null || value === '') ? 'simple' : value;
    snapshot.viewMode = next;
    return snapshot.viewMode;
  }

  return {
    STORAGE_KEY: storageKey,
    getSnapshot,
    replaceSnapshot,
    resetToDefault,
    loadFromStorage,
    hasStoredSnapshot,
    persistLocal,
    getProjects,
    setProjects,
    getActiveTab,
    setActiveTab,
    getViewMode,
    setViewMode,
    getStarredOrder,
    getDirtyProjectIds,
    markProjectDirty,
    isProjectDirty,
    clearProjectDirty,
    getPendingCloudWrites,
    markCloudWritePending,
    isCloudWritePending,
    clearCloudWritePending,
  };
}

export function installAppDataStore({
  windowRef = globalThis,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  schemaVersion = 8,
} = {}){
  if(windowRef.KarhaAppData?.getSnapshot) return windowRef.KarhaAppData;
  const store = createAppDataStore({ storage, schemaVersion });
  windowRef.KarhaAppData = store;
  return store;
}

export default { createAppDataStore, installAppDataStore, createEmptySnapshot, APP_DATA_STORAGE_KEY };
