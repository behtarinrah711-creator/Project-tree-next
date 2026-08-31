import { ActivityRepository } from './activityRepository.js';
import { ProjectRepository } from './projectRepository.js';

function createMemoryStorage(initialEntries = {}){
  const entries=new Map(Object.entries(initialEntries));
  const writes=[];
  return {
    getItem(key){ return entries.has(key) ? entries.get(key) : null; },
    setItem(key,value){ entries.set(key,String(value)); writes.push(key); },
    removeItem(key){ entries.delete(key); },
    keys(){ return [...entries.keys()]; },
    writes,
  };
}

export function assertActivityRepositoryContract(){
  const repository=new ActivityRepository(new ProjectRepository(createMemoryStorage()));
  for(const method of ['list','listPage','get','save','update','softDelete']){
    if(typeof repository[method] !== 'function'){
      throw new Error(`ActivityRepository contract missing: ${method}`);
    }
  }
  return true;
}

export function assertActivityRepositoryBehavior(){
  const initial={
    projects:[{
      id:'p1',
      name:'Project',
      contacts:[{id:'c1',name:'Contact'}],
      contractTemplates:[{id:'ct1',activityId:'a1'}],
      tasks:[{id:'item1',activities:['a1']}],
      activityTemplates:[{
        id:'a1',
        name:'Old',
        contactId:'c1',
        contractTemplateId:'ct1',
        projectItemId:'item1',
        customField:{preserved:true},
        trashed:false,
      }],
    }],
    unrelatedTopLevelData:{preserved:true},
  };
  const storage=createMemoryStorage({'ptnext-v1:app-data':JSON.stringify(initial)});
  const repository=new ActivityRepository(new ProjectRepository(storage));

  if(repository.list('p1').length !== 1 || repository.get('p1','a1')?.name !== 'Old'){
    throw new Error('ActivityRepository list/get behavior failed');
  }
  if(repository.list('missing').length !== 0 || repository.get('p1','missing') !== null){
    throw new Error('ActivityRepository missing-record behavior failed');
  }

  const created={id:'a2',name:'Created',contactId:'c1',trashed:false};
  if(repository.save('p1',created) !== created || repository.get('p1','a2')?.name !== 'Created'){
    throw new Error('ActivityRepository save behavior failed');
  }

  const updated=repository.update('p1','a2',activity => ({...activity,name:'Updated'}));
  if(updated?.name !== 'Updated' || repository.get('p1','a2')?.name !== 'Updated'){
    throw new Error('ActivityRepository update behavior failed');
  }

  const deleted=repository.softDelete('p1','a2');
  if(!deleted?.trashed || !repository.get('p1','a2')?.trashed){
    throw new Error('ActivityRepository softDelete behavior failed');
  }

  const persisted=JSON.parse(storage.getItem('ptnext-v1:app-data'));
  const project=persisted.projects[0];
  const originalActivity=project.activityTemplates[0];
  if(originalActivity.customField?.preserved !== true ||
     originalActivity.contactId !== 'c1' ||
     originalActivity.contractTemplateId !== 'ct1' ||
     originalActivity.projectItemId !== 'item1' ||
     project.contacts[0].id !== 'c1' ||
     project.contractTemplates[0].activityId !== 'a1' ||
     project.tasks[0].activities[0] !== 'a1' ||
     persisted.unrelatedTopLevelData?.preserved !== true){
    throw new Error('ActivityRepository changed the existing project data shape or relations');
  }
  if(Object.hasOwn(project.activityTemplates[1], 'deletedAt')){
    throw new Error('ActivityRepository added a field during soft delete');
  }
  if(storage.keys().length !== 1 || storage.keys()[0] !== 'ptnext-v1:app-data' ||
     storage.writes.some(key => key !== 'ptnext-v1:app-data')){
    throw new Error('ActivityRepository changed storage keys');
  }

  return true;
}

export function assertActivityRepositoryLegacyKeyCompatibility(){
  const storage=createMemoryStorage({projects:JSON.stringify([{id:'legacy',activityTemplates:[{id:'a1',name:'Legacy'}]}])});
  const repository=new ActivityRepository(new ProjectRepository(storage));
  if(repository.list('legacy').length !== 0 || storage.keys().includes('ptnext-v1:app-data')){
    throw new Error('ActivityRepository must not import production legacy-key data implicitly');
  }
  return true;
}

