export const PROJECTS_COLLECTION='projects';
export const TASKS_SUBCOLLECTION='tasks';
export const PURCHASES_SUBCOLLECTION='purchases';
export const ESTIMATES_SUBCOLLECTION='estimates';
export const TASK_REPORTS_SUBCOLLECTION='taskReports';

export function createFirestoreCollections(db){
  const projects=()=>db.collection(PROJECTS_COLLECTION);
  const project=id=>projects().doc(id);
  const child=(id,name)=>project(id).collection(name);
  return Object.freeze({
    projects,project,
    tasks:id=>child(id,TASKS_SUBCOLLECTION),
    purchases:id=>child(id,PURCHASES_SUBCOLLECTION),
    estimates:id=>child(id,ESTIMATES_SUBCOLLECTION),
    taskReports:id=>child(id,TASK_REPORTS_SUBCOLLECTION),
    taskGroup:()=>db.collectionGroup(TASKS_SUBCOLLECTION),
  });
}
