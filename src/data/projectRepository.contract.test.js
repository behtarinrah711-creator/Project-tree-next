import { ProjectRepository } from './projectRepository.js';
import { localStorageAdapter } from './storageAdapter.js';
import { createAppDataStore } from './appDataStore.js';

// Static and behavior tests for the project repository API.
const requiredMethods = [
  'all',
  'getProjectsList',
  'find',
  'getActiveProject',
  'scoped',
  'saveProjectsList',
  'updateProject',
];

export function assertProjectRepositoryContract(repository){
  for(const method of requiredMethods){
    if(typeof repository?.[method] !== 'function'){
      throw new Error(`ProjectRepository contract missing: ${method}`);
    }
  }
  return true;
}

function createMemoryStorage(initialEntries = {}){
  const entries = new Map(Object.entries(initialEntries));

  return {
    getItem(key){
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value){
      entries.set(key, String(value));
    },
    removeItem(key){
      entries.delete(key);
    },
  };
}

export function assertProjectRepositoryStorageBoundary(){
  const primaryData = {
    projects: [{ id: '1', name: 'Initial', tasks: [{ id: 'task-1' }] }],
    unrelatedTopLevelData: { preserved: true },
  };
  const storage = createMemoryStorage({
    'ptnext-v1:app-data': JSON.stringify(primaryData),
  });
  const repository = new ProjectRepository(storage);

  assertProjectRepositoryContract(repository);
  if(repository.getProjectsList()[0].name !== 'Initial'){
    throw new Error('Repository did not read through the injected storage adapter');
  }

  const updatedProjects = [{ id: '1', name: 'Updated', tasks: [] }];
  repository.saveProjectsList(updatedProjects);
  const savedPrimaryData = JSON.parse(storage.getItem('ptnext-v1:app-data'));
  if(savedPrimaryData.unrelatedTopLevelData?.preserved !== true){
    throw new Error('saveProjectsList did not preserve top-level data');
  }

  const updated = repository.updateProject('1', project => ({ ...project, name: 'Final' }));
  if(updated?.name !== 'Final' || repository.find('1')?.name !== 'Final'){
    throw new Error('updateProject behavior changed');
  }

  return true;
}

export function assertProjectRepositoryUsesLocalStorageAdapter(){
  const storage = createMemoryStorage({
    'ptnext-v1:app-data': JSON.stringify({ projects: [{ id: 'browser-1' }] }),
  });
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };

  try{
    const repository = new ProjectRepository();
    if(repository.getProjectsList()[0]?.id !== 'browser-1'){
      throw new Error('Repository did not use the LocalStorage adapter');
    }
  } finally {
    if(previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  return true;
}

export function assertProjectRepositoryReadsLegacyKeys(){
  const legacyProject = { id: 'legacy-1', name: 'Production legacy' };
  const storage = createMemoryStorage({
    projects: JSON.stringify([legacyProject]),
    'gtasks-clone-v2': JSON.stringify({ projects:[legacyProject] }),
  });
  const repository = new ProjectRepository(storage);

  if(repository.getProjectsList().length !== 0){
    throw new Error('Isolated repository must not read production legacy storage keys');
  }

  return true;
}

export function assertProjectRepositoryUsesCanonicalRuntimeProjects(){
  const storage = createMemoryStorage({
    'ptnext-v1:app-data': JSON.stringify({ projects: [{ id:'stale', name:'Stored' }] }),
  });
  const store = createAppDataStore({ storage });
  store.replaceSnapshot({ projects:[{ id:'live', name:'Canonical' }], activeTab:'live' });
  const repository = new ProjectRepository(storage, store);

  if(repository.find('live') !== store.getProjects()[0] || repository.find('stale')){
    throw new Error('Repository runtime reads did not use AppDataStore projects');
  }

  repository.updateProject('live', project => ({ ...project, name:'Updated' }));
  if(store.getProjects()[0]?.name !== 'Updated'){
    throw new Error('Repository update did not update the canonical projects snapshot');
  }
  const persisted = JSON.parse(storage.getItem('ptnext-v1:app-data'));
  if(persisted.projects[0]?.name !== 'Updated' || persisted.activeTab !== 'live'){
    throw new Error('Canonical project update did not use AppDataStore persistence');
  }
  return true;
}
