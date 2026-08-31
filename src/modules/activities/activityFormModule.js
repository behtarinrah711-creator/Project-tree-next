import { projectContext } from '../../core/projectContext.js';
import { activityApi } from '../../domain/activityApi.js';

const runtime=new Proxy({}, {get(_target,key){return window.KarhaApp?.getActivityFormRuntime?.()?.[key];}});

const state={dirty:false,projectId:null,activityId:null};

function getProjectId(){
  return projectContext.getProjectId?.()
    || projectContext.getActiveProjectId?.()
    || runtime.getCurrentProjectId?.()
    || null;
}

function beginForm(activityId=null){
  const projectId=getProjectId();
  if(!projectId) return null;
  state.dirty=false;
  state.projectId=projectId;
  state.activityId=activityId;
  runtime.enterActivityForm?.();
  runtime.pushWorkspaceHistory?.('activityForm');
  return projectId;
}

function renderForm(activity=null){
  const body=document.getElementById('activityFormBody');
  const actions=document.getElementById('activityFormActions');
  if(!body||!actions) return false;

  body.innerHTML='';
  const field=document.createElement('div');
  field.className='internal-form-field';
  const label=document.createElement('label');
  label.textContent='نام فعالیت';
  const input=document.createElement('input');
  input.className='internal-form-input';
  input.value=activity?.name||'';
  if(!activity) input.placeholder='مثلاً آرماتوربندی';
  input.oninput=()=>{state.dirty=true;};
  field.append(label,input);
  body.appendChild(field);

  actions.innerHTML='';
  const save=document.createElement('button');
  save.className='if-save';
  save.textContent='ذخیره';
  save.onclick=()=>saveActivity(input,activity);
  const cancel=document.createElement('button');
  cancel.className='if-cancel';
  cancel.textContent='انصراف';
  cancel.onclick=()=>closeActivityForm();
  actions.append(save,cancel);
  return true;
}

function saveActivity(input,activity){
  const name=input.value.trim();
  if(!name){
    if(!activity) input.focus();
    return false;
  }
  const result=activityApi.save(state.projectId,{
    ...(activity||{}),
    id:activity?.id,
    name,
  });
  if(!result.ok){
    runtime.showToast?.(result.message || 'ذخیره فعالیت انجام نشد');
    return false;
  }
  state.dirty=false;
  closeActivityForm(true);
  runtime.renderActivities?.(state.projectId);
  return true;
}

export function openActivityForm(){
  if(!beginForm()) return false;
  return renderForm();
}

export function openActivityEditForm(activity){
  if(!activity?.id) return false;
  const projectId=beginForm(activity.id);
  if(!projectId) return false;
  const stored=activityApi.lookup(projectId,activity.id) || activity;
  return renderForm(stored);
}

export function closeActivityForm(fromPopState=false){
  window.KarhaChildHistory?.consume('activityForm',{fromPopState});
  runtime.leaveActivityForm?.();
  state.dirty=false;
  state.projectId=null;
  state.activityId=null;
  return true;
}

export function requestCloseActivityForm(fromPopState=false){
  // The existing Activity form has no draft/dirty confirmation behavior.
  return closeActivityForm(fromPopState);
}

export function getActivityFormState(){return {...state};}
