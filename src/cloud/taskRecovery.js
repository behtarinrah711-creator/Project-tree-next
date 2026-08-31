import { STORAGE_KEYS } from '../config/deploymentConfig.js';
const DEFAULT_KEY=STORAGE_KEYS.taskRecovery;

export function createTaskRecoveryCache({storage,normalizeTask,key=DEFAULT_KEY,now=Date.now}={}){
  const read=()=>{try{return JSON.parse(storage?.getItem(key)||'{}');}catch{return {};}};
  const write=cache=>{try{storage?.setItem(key,JSON.stringify(cache));}catch{}}
  const remember=project=>{
    if(!project?.id || !Array.isArray(project.tasks) || !project.tasks.length) return;
    const cache=read();
    cache[project.id]={name:project.name||'',tasks:project.tasks.map(normalizeTask),savedAt:now()};
    Object.keys(cache).sort((a,b)=>(cache[b].savedAt||0)-(cache[a].savedAt||0)).slice(100).forEach(id=>delete cache[id]);
    write(cache);
  };
  const recover=project=>{
    const record=project?.id ? read()[project.id] : null;
    return Array.isArray(record?.tasks)?record.tasks.map(normalizeTask):[];
  };
  return Object.freeze({read,write,remember,recover});
}

export async function recoverProjectTasks({project,projectData,user,collections,normalizeTask,consoleRef=console}){
  const recovered=[],seen=new Set();
  const add=task=>{const value=task&&normalizeTask(task),id=String(value?.id||'');if(id&&!seen.has(id)){seen.add(id);recovered.push(value);}};
  if(Array.isArray(projectData?.tasks)) projectData.tasks.forEach(add);
  try{
    if(project.name&&user?.uid){
      const snap=await collections.projects().where('ownerUid','==',user.uid).where('name','==',project.name).get();
      for(const document of snap.docs){
        const data=document.data()||{};
        if(Array.isArray(data.tasks)) data.tasks.forEach(add);
        try{(await collections.tasks(document.id).get()).docs.forEach(task=>add({id:task.id,...task.data()}));}
        catch(error){consoleRef.warn('legacy task subcollection recovery skipped',document.id,error);}
      }
    }
  }catch(error){consoleRef.warn('same-name legacy task recovery skipped',project.id,error);}
  try{(await collections.taskGroup().where('projectId','==',project.id).get()).docs.forEach(task=>add({id:task.id,...task.data()}));}
  catch(error){consoleRef.warn('collectionGroup task recovery skipped',project.id,error);}
  return recovered;
}

export function mergeRecoveredTasks(...groups){
  const normalize=groups.pop(),byId=new Map();
  groups.flat().forEach(task=>{const value=task&&normalize(task),id=String(value?.id||'');if(id&&!byId.has(id))byId.set(id,value);});
  return [...byId.values()];
}
