import assert from 'node:assert/strict';
import test from 'node:test';
import { ProjectRepository } from '../data/projectRepository.js';
import { ProjectItemRepository } from '../data/projectItemRepository.js';

function memoryStorage(){
  const values = new Map();
  return {
    getItem:key => values.get(key) ?? null,
    setItem:(key, value) => values.set(key, String(value)),
    removeItem:key => values.delete(key),
  };
}

test('cleared storage receives cloud projects and synchronizes the active project lifecycle', async () => {
  const storage = memoryStorage();
  const repository = new ProjectRepository(storage);
  const cloudProjects = [
    { id:'cloud-1', name:'Cloud one', tasks:[{ id:'old-task', text:'Existing task', subtasks:[] }] },
    { id:'cloud-2', name:'Cloud two', tasks:[] },
  ];

  assert.equal(repository.getProjectsList().length, 0);
  repository.saveProjectsList(cloudProjects);
  assert.deepEqual(repository.getProjectsList().map(project => project.id), ['cloud-1', 'cloud-2']);

  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  class CustomEvent { constructor(type, options={}){ this.type=type; this.detail=options.detail; } }
  globalThis.CustomEvent = CustomEvent;
  globalThis.window = {
    localStorage:storage,
    location:{ search:'', hash:'' },
    dispatchEvent(){},
  };
  try{
    const [{ ProjectContextStore }, workspace] = await Promise.all([
      import(`./projectContext.js?cloud-lifecycle=${Date.now()}`),
      import(`./projectWorkspace.js?cloud-lifecycle=${Date.now()}`),
    ]);
    const context = new ProjectContextStore();
    assert.equal(context.synchronizeProjects(repository.getProjectsList()), 'cloud-1');
    assert.equal(context.getProjectId(), 'cloud-1');
    assert.deepEqual(workspace.listProjects().map(project => project.id), ['cloud-1', 'cloud-2']);

    const items = new ProjectItemRepository(repository);
    assert.equal(items.list(context.getProjectId()).length, 1);
    assert.equal(items.list(context.getProjectId())[0].id, 'old-task');

    context.synchronizeProjects(repository.getProjectsList(), 'cloud-2');
    assert.equal(context.getProjectId(), 'cloud-2');
  } finally {
    if(previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if(previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }
});
