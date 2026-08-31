import { ProjectItemRepository } from './projectItemRepository.js';
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

export function assertProjectItemRepositoryContract(){
  const repository=new ProjectItemRepository(new ProjectRepository(createMemoryStorage({
    'ptnext-v1:app-data':JSON.stringify({projects:[{id:'p1',tasks:[]}]})
  })));
  for(const method of ['list','listPage','get','save','update','softDelete','updateSubtask','addSubtask','softDeleteSubtask','restore','remove','reorder']){
    if(typeof repository[method] !== 'function'){
      throw new Error(`ProjectItemRepository contract missing: ${method}`);
    }
  }
  return true;
}

export function assertProjectItemRepositoryBehavior(){
  const original={
    id:'t1',text:'Existing',done:false,starred:true,cost:25,
    activities:['a1'],contactId:'c1',contractId:'co1',
    subtasks:[{id:'s1',text:'Child',activities:['a2'],parentId:'t1'}],
    custom:{preserved:true},
  };
  const initial={
    projects:[{
      id:'p1',name:'Legacy project',tasks:[original],contacts:[{id:'c1'}],
      activityTemplates:[{id:'a1'}],contracts:[{id:'co1'}],
      projectMetadata:{preserved:true},
    }],
    activeTab:'p1',unrelatedTopLevelData:{preserved:true},
  };
  const storage=createMemoryStorage({'ptnext-v1:app-data':JSON.stringify(initial)});
  const repository=new ProjectItemRepository(new ProjectRepository(storage));

  if(repository.list('p1').length !== 1 || repository.get('p1','t1')?.text !== 'Existing' ||
     repository.get('p1','missing') !== null){
    throw new Error('ProjectItemRepository list/get behavior failed');
  }

  const created={id:'t2',text:'Created',done:false,activities:['a1'],subtasks:[]};
  if(repository.save('p1',created) !== created || repository.get('p1','t2')?.text !== 'Created'){
    throw new Error('ProjectItemRepository save behavior failed');
  }

  const updated=repository.update('p1','t2',item => ({...item,text:'Updated'}));
  if(updated?.text !== 'Updated' || repository.get('p1','t2')?.text !== 'Updated'){
    throw new Error('ProjectItemRepository update behavior failed');
  }

  const child={id:'s2',text:'Nested',done:false,customField:'kept',subtasks:[]};
  if(repository.addSubtask('p1','t2','t2',child)!==child || repository.get('p1','t2')?.subtasks[0]?.customField!=='kept'){
    throw new Error('ProjectItemRepository addSubtask behavior failed');
  }
  const nested=repository.updateSubtask('p1','t2','s2',item=>({...item,done:true}));
  if(!nested?.done || !repository.get('p1','t2')?.subtasks[0]?.done){
    throw new Error('ProjectItemRepository updateSubtask behavior failed');
  }
  repository.softDeleteSubtask('p1','t2','s2');
  if(!repository.get('p1','t2')?.subtasks[0]?.trashed) throw new Error('ProjectItemRepository nested soft delete failed');
  repository.restore('p1','t2','s2');
  if(repository.get('p1','t2')?.subtasks[0]?.trashed || repository.get('p1','t2')?.subtasks[0]?.customField!=='kept'){
    throw new Error('ProjectItemRepository nested restore failed');
  }
  repository.reorder('p1','t1',['s1'],'t1');
  repository.reorder('p1','t1',['t2','t1']);
  if(repository.list('p1')[0]?.id!=='t2' || repository.get('p1','t1')?.subtasks[0]?.id!=='s1'){
    throw new Error('ProjectItemRepository reorder behavior failed');
  }

  const deleted=repository.softDelete('p1','t2');
  if(!deleted?.trashed || !deleted.deletedAt || deleted.deletedType !== 'task' ||
     !repository.get('p1','t2')?.trashed){
    throw new Error('ProjectItemRepository softDelete behavior failed');
  }
  if(!repository.remove('p1','t2','s2') || repository.get('p1','t2')?.subtasks.some(item=>item.id==='s2')){
    throw new Error('ProjectItemRepository nested permanent delete failed');
  }
  if(!repository.remove('p1','t2') || repository.get('p1','t2')){
    throw new Error('ProjectItemRepository permanent delete failed');
  }

  const persisted=JSON.parse(storage.getItem('ptnext-v1:app-data'));
  const project=persisted.projects[0];
  const preserved=project.tasks.find(item=>item.id==='t1');
  if(JSON.stringify(preserved) !== JSON.stringify(original) ||
     project.contacts[0].id !== 'c1' || project.activityTemplates[0].id !== 'a1' ||
     project.contracts[0].id !== 'co1' || project.projectMetadata?.preserved !== true ||
     persisted.activeTab !== 'p1' || persisted.unrelatedTopLevelData?.preserved !== true){
    throw new Error('ProjectItemRepository changed data shape, relations, or unrelated project data');
  }
  if(storage.keys().length !== 1 || storage.keys()[0] !== 'ptnext-v1:app-data' ||
     storage.writes.some(key => key !== 'ptnext-v1:app-data')){
    throw new Error('ProjectItemRepository changed storage keys');
  }
  return true;
}

export function assertProjectItemRepositoryLegacyKeyCompatibility(){
  const legacyProject={id:'legacy',name:'Old',tasks:[{id:'t1',text:'Old',subtasks:[]}]};
  const storage=createMemoryStorage({projects:JSON.stringify([legacyProject])});
  const repository=new ProjectItemRepository(new ProjectRepository(storage));
  if(repository.list('legacy').length !== 0 || storage.keys().includes('ptnext-v1:app-data')){
    throw new Error('ProjectItemRepository must not import production legacy-key data implicitly');
  }
  return true;
}

