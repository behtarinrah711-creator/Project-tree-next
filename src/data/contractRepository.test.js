import { ContractRepository } from './contractRepository.js';
import { ProjectRepository } from './projectRepository.js';

function createMemoryStorage(initialEntries = {}){
  const entries = new Map(Object.entries(initialEntries));
  return {
    getItem(key){ return entries.has(key) ? entries.get(key) : null; },
    setItem(key,value){ entries.set(key,String(value)); },
    removeItem(key){ entries.delete(key); },
  };
}

export function assertContractRepositoryContract(){
  const repository=new ContractRepository(new ProjectRepository(createMemoryStorage({
    'ptnext-v1:app-data':JSON.stringify({projects:[{id:'p1',name:'Project',contracts:[]}]})
  })));
  for(const method of ['list','listPage','get','save','update','softDelete']){
    if(typeof repository[method] !== 'function'){
      throw new Error(`ContractRepository contract missing: ${method}`);
    }
  }
  return true;
}

export function assertContractRepositoryBehavior(){
  const initial={
    projects:[{id:'p1',name:'Project',contracts:[{id:'c1',title:'Old',trashed:false}]}],
    unrelatedTopLevelData:{preserved:true},
  };
  const storage=createMemoryStorage({'ptnext-v1:app-data':JSON.stringify(initial)});
  const repository=new ContractRepository(new ProjectRepository(storage));

  if(repository.list('p1').length !== 1 || repository.get('p1','c1')?.title !== 'Old'){
    throw new Error('ContractRepository list/get behavior failed');
  }

  const created={id:'c2',title:'Created',items:[],trashed:false};
  if(repository.save('p1',created) !== created){
    throw new Error('ContractRepository save behavior failed');
  }

  const updated=repository.update('p1','c2',contract => ({...contract,title:'Updated'}));
  if(updated?.title !== 'Updated' || repository.get('p1','c2')?.title !== 'Updated'){
    throw new Error('ContractRepository update behavior failed');
  }

  const deleted=repository.softDelete('p1','c2');
  if(!deleted?.trashed || !deleted.deletedAt || !repository.get('p1','c2')?.trashed){
    throw new Error('ContractRepository softDelete behavior failed');
  }

  const persisted=JSON.parse(storage.getItem('ptnext-v1:app-data'));
  if(!Array.isArray(persisted.projects?.[0]?.contracts) ||
     persisted.projects[0].contracts[0].id !== 'c1' ||
     persisted.unrelatedTopLevelData?.preserved !== true){
    throw new Error('ContractRepository changed the existing data shape');
  }

  return true;
}
