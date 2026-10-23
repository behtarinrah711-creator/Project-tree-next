import { localStorageAdapter } from './storageAdapter.js';
import { STORAGE_KEYS } from '../config/deploymentConfig.js';

const PRIMARY_KEY = STORAGE_KEYS.appData;
const LEGACY_KEYS = [PRIMARY_KEY];

function safeJsonParse(raw, fallback){
  if(!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function normalizeProjects(value){
  if(Array.isArray(value)) return value;
  if(value && Array.isArray(value.projects)) return value.projects;
  return [];
}

function readKey(storage, key){
  return safeJsonParse(storage.getItem(key), null);
}

export class ProjectRepository{
  constructor(storage = localStorageAdapter, appDataStore = null){
    this.storage = storage;
    this.appDataStore = appDataStore;
  }

  runtimeStore(){
    if(this.appDataStore?.getProjects) return this.appDataStore;
    const store = globalThis.window?.KarhaAppData || globalThis.KarhaAppData;
    return store?.getProjects ? store : null;
  }

  /**
   * Read only this isolated deployment's project collection.
   * The production site's legacy keys are intentionally never read.
   */
  all(){
    const store = this.runtimeStore();
    if(store) return store.getProjects();
    for(const key of LEGACY_KEYS){
      const projects = normalizeProjects(readKey(this.storage, key));
      if(projects.length) return projects;
    }
    return [];
  }

  getProjectsList(){
    return this.all();
  }

  find(projectId){
    if(!projectId) return null;
    return this.all().find(project =>
      String(project.id) === String(projectId) ||
      String(project.projectId) === String(projectId)
    ) || null;
  }

  getActiveProject(projectId){
    return this.find(projectId);
  }

  scoped(projectId, collection){
    const project = this.find(projectId);
    if(!project) return [];
    return Array.isArray(project[collection]) ? project[collection] : [];
  }

  /**
   * Persist only the projects collection while preserving every other
   * top-level field already stored under the primary legacy key.
   */
  saveProjectsList(projects){
    if(!Array.isArray(projects)) throw new TypeError('projects must be an array');

    const store = this.runtimeStore();
    if(store){
      // D3 design A: repository callers share AppDataStore's sole runtime list;
      // localStorage is only the serialized persistence boundary.
      const canonical = store.setProjects ? store.setProjects(projects) : projects;
      if(!store.setProjects){
        const snapshot = store.getSnapshot?.();
        if(snapshot) snapshot.projects = projects;
      }
      store.persistLocal?.();
      return canonical;
    }

    const raw = readKey(this.storage, PRIMARY_KEY);

    if(raw && typeof raw === 'object' && !Array.isArray(raw)){
      raw.projects = projects;
      this.storage.setItem(PRIMARY_KEY, JSON.stringify(raw));
      return projects;
    }

    // This isolated deployment never falls back to production/legacy keys.
    for(const key of LEGACY_KEYS){
      const value = readKey(this.storage, key);
      if(Array.isArray(value)){
        this.storage.setItem(key, JSON.stringify(projects));
        return projects;
      }
      if(value && typeof value === 'object' && Array.isArray(value.projects)){
        value.projects = projects;
        this.storage.setItem(key, JSON.stringify(value));
        return projects;
      }
    }

    // New installations use the existing primary key format.
    this.storage.setItem(PRIMARY_KEY, JSON.stringify({ projects }));
    return projects;
  }

  updateProject(projectId, updater){
    const projects = this.getProjectsList();
    const index = projects.findIndex(project =>
      String(project.id) === String(projectId) ||
      String(project.projectId) === String(projectId)
    );
    if(index === -1) return null;

    const current = projects[index];
    const next = typeof updater === 'function' ? updater(current) : updater;
    if(!next) return null;

    projects[index] = next;
    this.saveProjectsList(projects);
    return next;
  }
}

export const projectRepository = new ProjectRepository();
