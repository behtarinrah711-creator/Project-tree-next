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
  const syncStateKey = `${storageKey}:sync-state`;

  function readSyncState(){
    if(!storage) return {};
    try{
      const raw = storage.getItem(syncStateKey);
      return raw ? (JSON.parse(raw) || {}) : {};
    }catch(e){
      return {};
    }
  }

  const restoredSyncState = readSyncState();
  // A browser refresh destroys every in-flight Promise. Persisted pending writes
  // therefore come back as dirty retry intent, never as a fake active write.
  const dirtyProjectIds = new Set([
    ...(Array.isArray(restoredSyncState.dirty) ? restoredSyncState.dirty : []),
    ...(Array.isArray(restoredSyncState.pending) ? restoredSyncState.pending : []),
  ].map(String).filter(Boolean));
  const pendingCloudWrites = new Set();
  const dirtyVersions = new Map();
  Object.entries(restoredSyncState.versions || {}).forEach(([id, version]) => {
    const n = Number(version);
    if(id && Number.isFinite(n) && n > 0) dirtyVersions.set(String(id), n);
  });
  dirtyProjectIds.forEach(id => {
    if(!dirtyVersions.has(id)) dirtyVersions.set(id, 1);
  });

  function persistSyncState(){
    if(!storage) return false;
    try{
      const versions = {};
      dirtyVersions.forEach((version, id) => {
        if(dirtyProjectIds.has(id)) versions[id] = version;
      });
      storage.setItem(syncStateKey, JSON.stringify({
        dirty:[...dirtyProjectIds],
        pending:[...pendingCloudWrites],
        versions,
      }));
      return true;
    }catch(e){
      return false;
    }
  }
  // Normalize a stale persisted pending state immediately after construction.
  if(storage && Array.isArray(restoredSyncState.pending) && restoredSyncState.pending.length){
    persistSyncState();
  }

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
  function getProjectDirtyVersion(projectId){
    return dirtyVersions.get(String(projectId || '')) || 0;
  }
  function markProjectDirty(projectId){
    const id = String(projectId || '');
    if(!id) return 0;
    const version = (dirtyVersions.get(id) || 0) + 1;
    dirtyVersions.set(id, version);
    dirtyProjectIds.add(id);
    persistSyncState();
    return version;
  }
  function isProjectDirty(projectId){ return dirtyProjectIds.has(String(projectId || '')); }
  function clearProjectDirty(projectId, expectedVersion){
    if(projectId === undefined){
      dirtyProjectIds.clear();
      dirtyVersions.clear();
      persistSyncState();
      return true;
    }
    const id = String(projectId || '');
    if(expectedVersion !== undefined && getProjectDirtyVersion(id) !== Number(expectedVersion)) return false;
    dirtyProjectIds.delete(id);
    dirtyVersions.delete(id);
    persistSyncState();
    return true;
  }

  function getPendingCloudWrites(){ return pendingCloudWrites; }
  function markCloudWritePending(projectId){
    const id = String(projectId || '');
    if(!id) return;
    pendingCloudWrites.add(id);
    persistSyncState();
  }
  function isCloudWritePending(projectId){ return pendingCloudWrites.has(String(projectId || '')); }
  function clearCloudWritePending(projectId){
    if(projectId === undefined) pendingCloudWrites.clear();
    else pendingCloudWrites.delete(String(projectId || ''));
    persistSyncState();
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
    getProjectDirtyVersion,
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
