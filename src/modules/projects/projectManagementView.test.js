import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectManagementView } from './projectManagementView.js';
function node(){return {children:[],dataset:{},className:'',textContent:'',title:'',style:{},append(...x){this.children.push(...x);},appendChild(x){this.children.push(x);return x;},set innerHTML(_v){this.children=[];},get innerHTML(){return '';},setAttribute(){}};}
const flatten=n=>[n,...n.children.flatMap(flatten)];
test('management renders canonical projects and delegates archive/restore/delete actions',()=>{
  const body=node(); const projects=[{id:'A',name:'Active',tasks:[]},{id:'R',name:'Archived',archived:true,tasks:[]},{id:'D',name:'Deleted',trashed:true,tasks:[]}]; const calls=[];
  const view=createProjectManagementView({document:{createElement:node,addEventListener(){},removeEventListener(){},getElementById:id=>id==='projectsPageBody'?body:null},getData:()=>({projects}),projectsVisibleForAuth:x=>x,isPendingDeleted:()=>false,svgGrip:()=>'',svgTrash:()=>'',
    openMiniPrompt(){},renameProject(){return {ok:true};},cloudRenameProject(){},findProject:id=>projects.find(p=>p.id===id),archiveProject:(id,v)=>calls.push(['archive',id,v]),setActiveTab(){},getActiveTab:()=>null,
    cloudSyncProjectStatus(){},refreshWorkspace(){},showToast(){},openExportPage(){},openConfirm(_t,cb){cb();},softDelete:(...x)=>calls.push(['softDelete',...x]),undoPendingDelete(){},persist(){},permanentlyDeleteProject:async p=>{calls.push(['permanent',p.id]);return true;}});
  view.render(); assert.match(flatten(body).map(x=>x.textContent).join('|'),/Active.*Archived.*Deleted/);
  flatten(body).find(x=>x.title==='آرشیو').onclick();
  assert.deepEqual(calls[0],['archive','A',true]);
  view.setTab('deleted'); view.render(); const restore=flatten(body).find(x=>x.textContent==='بازگردانی'); restore.onclick(); assert.equal(projects[2].trashed,false);
});
