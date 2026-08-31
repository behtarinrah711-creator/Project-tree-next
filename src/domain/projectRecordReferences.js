import { walkItems } from './taskTree.js';

export function findProjectRecordReferences(projects,type,id){
  const targetId=String(id??'');
  const refs=[];
  const add=(project,label)=>refs.push({projectId:project?.id||'',projectName:project?.name||'',label});
  const live=(project,key)=>(project[key]||[]).filter(item=>item&&!item.trashed);
  (projects||[]).forEach(project=>{
    if(!project||project.trashed) return;
    const contracts=live(project,'contracts');
    const templates=live(project,'contractTemplates');
    const reports=live(project,'contractStatusReports');
    const contacts=live(project,'contacts');
    const tasks=live(project,'tasks');
    if(type==='contact'){
      contracts.forEach(item=>{
        if(['contractorId','employerId','contactId','employerContactId'].some(key=>String(item[key]||'')===targetId)) add(project,'قرارداد');
      });
      reports.forEach(item=>{ if(String(item.contactId||'')===targetId) add(project,'صورت وضعیت / گزارش قرارداد'); });
    }
    if(type==='activity'){
      contacts.forEach(item=>{ if(item.activities?.some(value=>String(value)===targetId)) add(project,'مخاطب'); });
      tasks.forEach(task=>{
        if(task.activities?.some(value=>String(value)===targetId)) add(project,'آیتم پروژه');
        walkItems(task.subtasks,item=>{
          if(!item.trashed&&item.activities?.some(value=>String(value)===targetId)) add(project,'زیرآیتم پروژه');
        });
      });
      templates.forEach(item=>{ if(String(item.activityId||'')===targetId) add(project,'قالب قرارداد'); });
      contracts.forEach(item=>{
        if(String(item.activityId||'')===targetId||item.activityIds?.some(value=>String(value)===targetId)) add(project,'قرارداد');
      });
      reports.forEach(item=>{ if(String(item.activityId||'')===targetId) add(project,'صورت وضعیت / گزارش قرارداد'); });
    }
    if(['task','subtask','sub'].includes(type)){
      const ids=new Set([targetId]);
      if(type==='task') tasks.forEach(task=>{
        if(String(task.id)!==targetId) return;
        walkItems(task.subtasks,item=>{ if(item?.id!=null) ids.add(String(item.id)); });
      });
      contracts.forEach(item=>{ if(ids.has(String(item.projectItemId||''))) add(project,'قرارداد'); });
    }
  });
  return refs;
}

export function canDeleteProjectRecord(projects,type,id){
  const refs=findProjectRecordReferences(projects,type,id);
  if(!refs.length) return {ok:true,refs:[]};
  const seen=new Set();
  return {ok:false,refs:refs.filter(ref=>{
    const key=String(ref.projectId)+'|'+ref.label;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  })};
}
