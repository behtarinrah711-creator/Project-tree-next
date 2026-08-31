import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectTrashView } from './projectTrashView.js';

function node(tag='div'){
  return {tag,children:[],dataset:{},style:{},className:'',textContent:'',hidden:false,isConnected:true,
    append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);return x;},insertBefore(x){this.children.unshift(x);},
    set innerHTML(_v){this.children=[];},get innerHTML(){return '';}};
}
function setup(active='A'){
  const body=node(); const projects=[
    {id:'A',name:'Alpha',tasks:[{id:'ta',text:'A',trashed:true,subtasks:[{id:'sa',text:'SA',trashed:true,subtasks:[]}]}],contacts:[{id:'ca',trashed:true,activities:[]}],activityTemplates:[]},
    {id:'B',name:'Beta',tasks:[{id:'tb',text:'B',trashed:true,subtasks:[]}],contacts:[],activityTemplates:[]},
  ];
  const calls=[];
  const view=createProjectTrashView({document:{createElement:node,getElementById:id=>id==='projectTrashPageBody'?body:null},setTimeout(){},getActiveProjectId:()=>active,
    findProject:id=>projects.find(p=>p.id===id),walkItems(items,fn){(items||[]).forEach(x=>{fn(x,null);});},getContacts:p=>p.contacts,getActivityTemplates:p=>p.activityTemplates,
    findActivityTemplate:()=>null,taskView:{renderTrashItem(e,list){const row=node();row.dataset.id=e.id;list.appendChild(row);}},restoreRecord:e=>{calls.push(['restore',e.id]);return true;},
    permanentlyDeleteRecord:async e=>{calls.push(['delete',e.id]);return true;},persist(){},refreshWorkspace(){},refreshContacts(){},refreshActivities(){},showToast(){},openConfirm(_t,cb){return cb();},
    createWorkspaceSearch:()=>({wrap:node()}),workspaceTextMatch:()=>true});
  return {view,body,calls};
}

test('project trash collection and clear-all remain scoped to selected project',async()=>{
  const {view,body,calls}=setup('A');
  assert.deepEqual(view.collect('A').map(x=>x.id).sort(),['ca','sa','ta']);
  assert.deepEqual(view.collect('B').map(x=>x.id),['tb']);
  view.render(); const clear=body.children[0].children[0]; await clear.onclick(); await clear.onclick();
  assert.deepEqual(calls.filter(x=>x[0]==='delete').map(x=>x[1]).sort(),['ca','sa','ta']);
});

test('trash action buttons delegate restore and permanent delete to canonical callbacks',async()=>{
  const {view,calls}=setup(); const actions=node(); const entry=view.collect('A')[0];
  view.appendActions(actions,entry); actions.children[0].onclick(); await actions.children[1].onclick();
  assert.deepEqual(calls, [['restore',entry.id],['delete',entry.id]]);
});
