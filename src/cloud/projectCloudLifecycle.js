const DELETE_SUBCOLLECTIONS=['tasks','purchases','estimates','taskReports'];

export function createProjectCloudLifecycle({collections,db,getSession,taskListeners,appDataStore,consoleRef=console}){
  const enabled=project=>!!(getSession().cloudMode&&getSession().currentUser&&project?.ownerUid);
  const remove=project=>enabled(project)?collections.project(project.id).delete():Promise.resolve();
  const rename=project=>enabled(project)?collections.project(project.id).update({name:project.name}):Promise.resolve();
  const removeSubcollection=async(projectId,name)=>{
    for(;;){
      const snap=await collections.project(projectId).collection(name).limit(450).get();
      if(snap.empty) return;
      const batch=db.batch();snap.docs.forEach(document=>batch.delete(document.ref));await batch.commit();
    }
  };
  const permanentlyDelete=async project=>{
    taskListeners.stop(project.id);
    if(!enabled(project)) return {remoteDeleted:false};
    appDataStore.markCloudWritePending(project.id);
    try{
      for(const name of DELETE_SUBCOLLECTIONS) await removeSubcollection(project.id,name);
      await collections.project(project.id).delete();
      return {remoteDeleted:true};
    }catch(error){consoleRef.warn('project permanent cloud delete failed',project.id,error);throw error;}
    finally{appDataStore.clearCloudWritePending(project.id);}
  };
  return Object.freeze({remove,rename,permanentlyDelete});
}
