export function uid(random=Math.random){ return 'i'+random().toString(36).slice(2,10); }
export function makeTask(text,id=uid()){ return {id,text,done:false,starred:false,cost:null,activities:[],subtasks:[],completedAt:null}; }
export function makeSub(text,id=uid()){ return {id,text,done:false,starred:false,cost:null,activities:[],subtasks:[],completedAt:null}; }
export function makeProject(name,schemaVersion=8,id=uid()){
  return {id,name,type:'project',tasks:[],contacts:[],activityTemplates:[],contractTemplates:[],contracts:[],contractStatusReports:[],completedOpen:false,archived:false,trashed:false,schemaVersion};
}
