import assert from 'node:assert/strict';
import test from 'node:test';
import { ProjectRepository } from '../data/projectRepository.js';
import { ProjectItemRepository } from '../data/projectItemRepository.js';
import { TaskRuntimeModule } from '../modules/tasks/taskRuntimeModule.js';

function storageWithExistingData(){
  const data = {
    projects: [{ id:'p-existing', name:'Existing project', tasks:[{ id:'t-existing', text:'Existing task', subtasks:[] }] }],
  };
  return {
    getItem:key => key === 'ptnext-v1:app-data' ? JSON.stringify(data) : null,
    setItem(){},
    removeItem(){},
  };
}

test('ProjectRepository, ProjectWorkspace path, and TaskRuntime read existing data', async () => {
  const storage = storageWithExistingData();
  const repository = new ProjectRepository(storage);
  assert.equal(repository.getProjectsList()[0]?.id, 'p-existing');

  const previousWindow = globalThis.window;
  globalThis.window = { localStorage:storage, location:{ search:'', hash:'' } };
  try{
    const workspace = await import(`./projectWorkspace.js?test=${Date.now()}`);
    assert.equal(workspace.listProjects()[0]?.name, 'Existing project');
  } finally {
    if(previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  const itemRepository = new ProjectItemRepository(repository);
  const runtime = new TaskRuntimeModule(itemRepository);
  assert.equal(itemRepository.get('p-existing', 't-existing')?.text, 'Existing task');
  assert.equal(runtime.list('p-existing')[0]?.id, 't-existing');
});
