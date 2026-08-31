import { projectContext } from '../../core/projectContext.js';
import { projectRepository } from '../../data/projectRepository.js';
import { contractRepository } from '../../data/contractRepository.js';

function activeProjectId(projectId=null){
  return projectId || projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.() || null;
}
export function getProject(projectId=null){
  const id=activeProjectId(projectId);
  return id ? projectRepository.getActiveProject(id) : null;
}
export function getProjectContracts(projectId=null){
  const id=activeProjectId(projectId);
  return id ? contractRepository.list(id) : [];
}
export function findProjectContract(id, project=null){
  const p=project || getProject();
  return p?.id ? contractRepository.get(p.id,id) : null;
}
export function makeRealContractDraft(existing=null, today=''){
  if(existing){
    const c=JSON.parse(JSON.stringify(existing));
    c.employerId=c.employerId||c.employerContactId||'';
    c.contractorId=c.contractorId||c.contactId||'';
    c.contactId=c.contractorId||c.contactId||'';
    c.projectItemId=c.projectItemId||'';
    c.projectItemRootTaskId=c.projectItemRootTaskId||'';
    c.projectItemPath=c.projectItemPath||'';
    c.contractDate=c.contractDate||c.createdDate||today;
    c.startDate=c.startDate||'';
    c.endDate=c.endDate||'';
    c.retentionPercent=c.retentionPercent??'';
    c.retentionBasis=c.retentionBasis||'تحویل موقت';
    c.retentionDuration=c.retentionDuration||'';
    c.contractPlace=c.contractPlace||'';
    c.paymentStages=Array.isArray(c.paymentStages)?c.paymentStages:[];
    c.attachments=Array.isArray(c.attachments)?c.attachments:[];
    c.title=c.title||'';
    c.items=Array.isArray(c.items)?c.items:[];
    c.paymentItems=Array.isArray(c.paymentItems)?c.paymentItems:[];
    return c;
  }
  return {
    id:'rc_'+Date.now(), employerId:'', contractorId:'', contactId:'', activityId:'',
    activityIds:[], templateId:'', projectItemId:'', projectItemRootTaskId:'',
    projectItemPath:'', title:'', contractNo:'', contractDate:today,
    startDate:'', endDate:'', amount:'', retentionPercent:'',
    retentionBasis:'تحویل موقت', retentionDuration:'', contractPlace:'',
    paymentStages:[], paymentItems:[], items:[], attachments:[],
    employerName:'', employerNationalId:'', employerAddress:'', employerPhone:'',
    contractorName:'', contractorNationalId:'', contractorAddress:'', contractorPhone:'',
    progressTimeline:[],progressPercent:0,createdAt:Date.now(),updatedAt:Date.now(),
    trashed:false
  };
}
export function cloneTemplateIntoContract(template){
  return (template?.items||[]).map(x=>({
    id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    text:x.text||'', number:x.number||'',
    children:(x.children||[]).map(c=>({
      id:'rc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      text:c.text||'', number:c.number||'', children:[]
    }))
  }));
}
export function renumberRealContractItems(items){
  (items||[]).forEach((x,i)=>{
    x.number=String(i+1);
    (x.children||[]).forEach((c,j)=>c.number=(i+1)+'-'+(j+1));
  });
  return items||[];
}
export function moveRealContractItem(arr,from,to){
  if(from===to)return arr;
  const [x]=arr.splice(from,1);
  arr.splice(to,0,x);
  return arr;
}


export function syncContractPartyData(state, project){
  if(!state || !project) return state;
  const contacts=Array.isArray(project.contacts)?project.contacts:[];
  const find=id=>contacts.find(c=>String(c.id)===String(id) && !c.trashed);
  const name=c=>[c?.firstName,c?.lastName].filter(Boolean).join(' ') || c?.name || '';
  const e=find(state.employerId), c=find(state.contractorId);
  if(e){
    state.employerName=name(e);
    state.employerNationalId=e.nationalId||'';
    state.employerAddress=e.address||'';
    state.employerPhone=(e.phones&&e.phones[0])||e.phone||'';
  }
  if(c){
    state.contractorName=name(c);
    state.contractorNationalId=c.nationalId||'';
    state.contractorAddress=c.address||'';
    state.contractorPhone=(c.phones&&c.phones[0])||c.phone||'';
  }
  return state;
}


export function resolveProjectItemActivityTemplate(project, projectItemId){
  if(!project || !projectItemId) return {projectItem:null,activity:null,template:null,activityIds:[]};
  const roots=Array.isArray(project.tasks)?project.tasks:[];
  let found=null;
  const walk=(items)=>{
    for(const x of items||[]){
      if(String(x.id)===String(projectItemId)){found=x;return true;}
      if(walk(x.subtasks))return true;
    }
    return false;
  };
  walk(roots);
  const activityIds=Array.isArray(found?.activities)?found.activities.filter(Boolean).map(String):[];
  const activity=activityIds.length===1
    ? (project.activityTemplates||[]).find(a=>String(a.id)===activityIds[0] && !a.trashed) || null
    : null;
  const template=activity
    ? (project.contractTemplates||[]).find(t=>String(t.activityId)===String(activity.id) && !t.trashed) || null
    : null;
  return {projectItem:found,activity,template,activityIds};
}
