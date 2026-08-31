#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

export function diagnoseTaskVisibility(snapshot, projectId){
  if(!projectId) throw new Error('projectId is required; project names are not accepted');
  const projects=Array.isArray(snapshot) ? snapshot : snapshot?.projects;
  if(!Array.isArray(projects)) throw new Error('snapshot must be an array or contain a projects array');
  const project=projects.find(item=>String(item?.id ?? item?.projectId)===String(projectId));
  if(!project) return {projectId:String(projectId),found:false};

  const tasks=Array.isArray(project.tasks) ? project.tasks : [];
  const contracts=(Array.isArray(project.contracts) ? project.contracts : []).filter(item=>item && !item.trashed);
  const contacts=Array.isArray(project.contacts) ? project.contacts : [];
  const records=[];
  const byId=new Map();
  const visit=(items,rootTaskId=null,parentId=null)=>{
    (Array.isArray(items) ? items : []).forEach(item=>{
      if(!item || item.id == null) return;
      const record={
        id:String(item.id),
        kind:rootTaskId ? 'subtask' : 'task',
        rootTaskId:rootTaskId || String(item.id),
        parentId,
        trashed:item.trashed===true,
        done:item.done===true,
        pendingDelete:item.pendingDelete===true,
        deletedAt:item.deletedAt ?? null,
        deletedType:item.deletedType ?? null,
        deletedParentId:item.deletedParentId ?? null,
      };
      records.push(record);
      byId.set(record.id,record);
      visit(item.subtasks,record.rootTaskId,record.id);
    });
  };
  visit(tasks);

  const itemReferences=[];
  const contactReferences=[];
  contracts.forEach(contract=>{
    const contractId=String(contract.id ?? '');
    if(contract.projectItemId != null && String(contract.projectItemId)!==''){
      const targetId=String(contract.projectItemId);
      itemReferences.push({contractId,targetId,target:byId.get(targetId) || null});
    }
    ['contractorId','employerId','contactId','employerContactId'].forEach(field=>{
      if(contract[field] == null || String(contract[field])==='') return;
      const targetId=String(contract[field]);
      contactReferences.push({contractId,field,targetId,exists:contacts.some(contact=>String(contact?.id)===targetId)});
    });
  });
  const referencedTrashed=itemReferences
    .filter(reference=>reference.target?.trashed)
    .map(reference=>({contractId:reference.contractId,...reference.target}));
  return {
    projectId:String(project.id ?? project.projectId),
    found:true,
    counts:{
      tasks:tasks.length,
      records:records.length,
      trashed:records.filter(item=>item.trashed).length,
      done:records.filter(item=>item.done).length,
      visible:records.filter(item=>!item.trashed && !item.pendingDelete).length,
    },
    itemReferences,
    contactReferences,
    referencedTrashed,
  };
}

async function main(){
  const [file,projectId]=process.argv.slice(2);
  if(!file || !projectId){
    throw new Error('usage: node scripts/diagnose-task-visibility.mjs <snapshot.json> <projectId>');
  }
  const snapshot=JSON.parse(await readFile(file,'utf8'));
  process.stdout.write(`${JSON.stringify(diagnoseTaskVisibility(snapshot,projectId),null,2)}\n`);
}

if(import.meta.url===`file://${process.argv[1]}`){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
