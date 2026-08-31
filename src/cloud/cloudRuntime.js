import {createFirestoreCollections} from '../firebase/firestoreCollections.js';
import {createTaskRecoveryCache,recoverProjectTasks,mergeRecoveredTasks} from './taskRecovery.js';
import {createProjectCloudLifecycle} from './projectCloudLifecycle.js';
import {createFirebaseSession} from '../auth/firebaseSession.js';

export function normalizeTaskRecord(task){
  const child=value=>({...value,completedAt:value.completedAt===undefined?(value.done?0:null):value.completedAt,
    activities:Array.isArray(value.activities)?[...new Set(value.activities.filter(Boolean))]:[],
    subtasks:Array.isArray(value.subtasks)?value.subtasks.map(child):[]});
  return child(task);
}

export function createCloudRuntime(ctx){
  const {windowRef,documentRef,firebase,auth,db,app,store}=ctx;
  const collections=createFirestoreCollections(db),taskUnsubs=new Map();
  const cache=createTaskRecoveryCache({storage:windowRef.localStorage,normalizeTask:normalizeTaskRecord});
  let session,migratedGuestData=false;
  const getSession=()=>session?.getSession()||{currentUser:null,cloudMode:false};
  const taskListeners={
    stop(id){const unsub=taskUnsubs.get(String(id));try{unsub?.();}catch{}taskUnsubs.delete(String(id));},
    stopAll(){[...taskUnsubs.keys()].forEach(id=>this.stop(id));},
    start(project){
      if(!getSession().cloudMode||!project?.ownerUid||taskUnsubs.has(String(project.id)))return;
      const unsub=app.attachCloudTaskListener({cloudMode:true,db,findProject:ctx.findProject,normalizeTaskRecord,
        getRecoveredLocalTasks:cache.recover,rememberProjectTasks:cache.remember,appDataStore:store,
        DATA_SCHEMA_VERSION:ctx.schemaVersion,taskCollection:collections.tasks,
        persistLocalFromCloud:ctx.persistLocalFromCloud,onTaskUiRefresh:ctx.onTaskUiRefresh},project);
      if(unsub)taskUnsubs.set(String(project.id),unsub);
    },
  };
  const lifecycle=createProjectCloudLifecycle({collections,db,getSession,taskListeners,appDataStore:store});
  const writeTasks=(id,tasks)=>app.writeTaskRecordsNormalized({cloudMode:getSession().cloudMode,currentUser:getSession().currentUser,
    db,taskCollection:collections.tasks,normalizeTaskRecord,DATA_SCHEMA_VERSION:ctx.schemaVersion},id,tasks);

  const hydrateProject=async(project,projectData)=>{
    if(!getSession().cloudMode||!project?.ownerUid)return false;
    const id=project.id;taskListeners.start(project);
    try{
      const normalized=(await collections.tasks(id).get()).docs.map(d=>normalizeTaskRecord({id:d.id,...d.data()}));
      const legacy=Array.isArray(projectData?.tasks)?projectData.tasks.map(normalizeTaskRecord):[];
      const recovered=await recoverProjectTasks({project,projectData,user:getSession().currentUser,collections,normalizeTask:normalizeTaskRecord});
      const current=ctx.findProject(id)||project,cached=Array.isArray(current.tasks)?current.tasks:[],local=cache.recover(current);
      const merged=mergeRecoveredTasks(normalized,legacy,recovered,local,cached,normalizeTaskRecord);
      const remoteIds=new Set(normalized.map(task=>String(task.id)));
      const needsRepair=merged.some(task=>!remoteIds.has(String(task.id)));
      if(merged.length){
        current.tasks=merged;cache.remember(current);current.schemaVersion=ctx.schemaVersion;ctx.persistLocalFromCloud();
        if(needsRepair||Number(projectData?.schemaVersion||1)<ctx.schemaVersion){
          store.markCloudWritePending(id);
          try{
            await writeTasks(id,merged);
            const verified=new Set((await collections.tasks(id).get()).docs.map(d=>String(d.id)));
            if(merged.some(task=>!verified.has(String(task.id))))throw new Error('task repair verification failed');
            if(Number(projectData?.schemaVersion||1)<ctx.schemaVersion)await collections.project(id).update({schemaVersion:ctx.schemaVersion});
          }finally{store.clearCloudWritePending(id);}
        }
      }else if(Number(projectData?.schemaVersion||1)<ctx.schemaVersion){
        store.markCloudWritePending(id);
        try{await collections.project(id).update({tasks:firebase.firestore.FieldValue.delete(),schemaVersion:ctx.schemaVersion});}
        finally{store.clearCloudWritePending(id);}
        current.tasks=[];current.schemaVersion=ctx.schemaVersion;
      }
      taskListeners.start(current);return true;
    }catch(error){console.warn('task hydration/repair failed; keeping cached tasks:',id,error);const current=ctx.findProject(id)||project;if(!Array.isArray(current.tasks))current.tasks=[];return false;}
  };
  const hydrateAll=async docs=>Promise.allSettled((docs||[]).map(async document=>{const project=ctx.findProject(document.id);if(project&&await hydrateProject(project,document.data()))ctx.onHydrated?.(document.id);}));
  const startListeners=()=>{
    app.stopOwnedCloudListeners();
    const user=getSession().currentUser;
    const handler=app.createOwnedSnapshotHandler({appDataStore:store,getCurrentUser:()=>getSession().currentUser,
      docToProject:ctx.docToProject,hydrateProjects:hydrateAll,persistLocal:()=>store.persistLocal()});
    app.startOwnedCloudListeners({db,uid:user.uid,onOwnedSnapshot:handler,onError:error=>ctx.onCloudError?.(error)});
  };
  const stopListeners=()=>{app.stopOwnedCloudListeners();taskListeners.stopAll();};
  const migrateGuest=async()=>{
    if(migratedGuestData)return;migratedGuestData=true;const user=getSession().currentUser;
    for(const project of ctx.getProjects().filter(p=>!p.ownerUid&&!p.trashed)){
      project.type='project';project.ownerUid=user.uid;project.ownerEmail=ctx.normalizeEmail(user.email);project.sharedWith=[];
      store.markCloudWritePending(project.id);
      try{await collections.project(project.id).set({name:project.name,type:'project',completedOpen:!!project.completedOpen,
        ownerUid:user.uid,ownerEmail:ctx.normalizeEmail(user.email),sharedWith:[],contacts:project.contacts||[],
        activityTemplates:project.activityTemplates||[],trashed:!!project.trashed,archived:!!project.archived,schemaVersion:ctx.schemaVersion},{merge:true});
        await writeTasks(project.id,project.tasks);store.clearCloudWritePending(project.id);
      }catch(error){console.warn('guest project migration failed; local copy retained:',project.id,error);}
    }ctx.persistLocalFromCloud();
  };
  session=createFirebaseSession({auth,documentRef,windowRef,onAuthenticated:async()=>{await migrateGuest();startListeners();},
    onGuest:()=>{stopListeners();ctx.onGuest();},onOnline:ctx.flushStatus});
  const createProject=async project=>{
    const user=getSession().currentUser;if(!user)return;
    project.ownerUid=user.uid;project.ownerEmail=ctx.normalizeEmail(user.email);project.sharedWith=[];
    store.markCloudWritePending(project.id);
    try{await collections.project(project.id).set({name:project.name,type:'project',completedOpen:false,ownerUid:user.uid,
      ownerEmail:project.ownerEmail,sharedWith:[],contacts:project.contacts||[],activityTemplates:project.activityTemplates||[],
      contractTemplates:project.contractTemplates||[],contracts:project.contracts||[],contractStatusReports:project.contractStatusReports||[],schemaVersion:ctx.schemaVersion});
      await writeTasks(project.id,project.tasks);store.clearCloudWritePending(project.id);
    }catch(error){store.clearCloudWritePending(project.id);console.warn('project creation sync failed',project.id,error);ctx.onWriteFailure(project);}
  };
  return Object.freeze({getSession,cache,collections,taskListeners,lifecycle,createProject,normalizeTaskRecord,writeTasks,hydrateProject,
    cloudSyncProject:project=>app.cloudSyncProjectFull(ctx.syncContext(getSession(),{db,cache,writeTasks}),project),
    cloudSyncTask:project=>writeTasks(project.id,project.tasks),startListeners,stopListeners,migrateGuest,destroy:session.destroy});
}
