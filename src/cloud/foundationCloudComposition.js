/** Compose the classic bridge callbacks around the extracted cloud runtime. */
export function createFoundationCloudRuntime({windowRef,documentRef,schemaVersion,callbacks}){
  const firebaseRuntime=windowRef.KarhaFirebaseRuntime;
  let runtime;
  runtime=windowRef.KarhaApp.createCloudRuntime({
    windowRef,documentRef,firebase:firebaseRuntime.firebase,auth:firebaseRuntime.auth,db:firebaseRuntime.db,
    app:windowRef.KarhaApp,store:windowRef.KarhaAppData,schemaVersion,findProject:callbacks.findProject,
    getProjects:callbacks.getProjects,normalizeEmail:callbacks.normalizeEmail,
    persistLocalFromCloud:callbacks.persistLocalFromCloud,
    onTaskUiRefresh:callbacks.onTaskUiRefresh,
    onHydrated:callbacks.onHydrated,
    onCloudError:callbacks.onCloudError,
    onGuest:callbacks.onGuest,
    flushStatus:callbacks.flushStatus,
    onWriteFailure:callbacks.onWriteFailure,
    syncContext(session,{db,cache,writeTasks}){
      return callbacks.syncContext(runtime,session,{db,cache,writeTasks});
    },
  });
  return runtime;
}
