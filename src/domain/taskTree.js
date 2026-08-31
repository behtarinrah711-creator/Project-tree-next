export function findNestedItem(items,id){
  for(const item of (items||[])){
    if(item&&item.id===id) return item;
    const found=findNestedItem(item&&item.subtasks,id);
    if(found) return found;
  }
  return null;
}
export function itemChildren(item){
  if(!item) return [];
  if(!Array.isArray(item.subtasks)) item.subtasks=[];
  return item.subtasks;
}
export function walkItems(items,fn,parent=null,depth=0){
  (items||[]).forEach(item=>{
    if(!item) return;
    fn(item,parent,depth);
    walkItems(item.subtasks,fn,item,depth+1);
  });
}
export function findParentItem(items,childId){
  let result=null;
  walkItems(items,(item,parent)=>{ if(item.id===childId) result=parent; });
  return result;
}
export function taskCostSum(task){
  let total=Number(task.cost)||0;
  walkItems(task.subtasks,item=>{ if(!item.trashed) total+=Number(item.cost)||0; });
  return total;
}
export function projectCostSum(project,{isPendingDeleted=()=>false}={}){
  let sum=0;
  (project.tasks||[]).forEach(task=>{
    if(task.trashed||task.done||isPendingDeleted('task',project.id,task.id)) return;
    sum+=Number(task.cost)||0;
    walkItems(task.subtasks,item=>{
      if(item.trashed||item.done||isPendingDeleted('sub',project.id,task.id,item.id)) return;
      sum+=Number(item.cost)||0;
    });
  });
  return sum;
}
