import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectFromCloudDoc,
  mergeRecoveredProjects,
  chooseRecoveredProjectId,
  startCloudProjectRecovery,
} from './cloudProjectRecovery.js';

function doc(id,data){
  return { id, data(){ return data; } };
}

const flush = async (count=6) => {
  for(let i=0;i<count;i++) await new Promise(resolve=>setImmediate(resolve));
};

test('pre-migration ownerEmail project is recovered for the authenticated owner without rewriting its id',()=>{
  const user={uid:'uid-1',email:'owner@example.com'};
  const existing={id:'project-A',name:'Old name',tasks:[{id:'task-old',text:'old'}]};
  const project=projectFromCloudDoc(doc('project-A',{
    name:'Project A',
    ownerEmail:'OWNER@example.com',
    tasks:[{id:'task-new',text:'new'}],
  }),user,existing);

  assert.equal(project.id,'project-A');
  assert.equal(project.ownerUid,'uid-1');
  assert.equal(project.ownerEmail,'owner@example.com');
  assert.deepEqual(project.tasks.map(task=>task.id),['task-new','task-old']);
});

test('recovered cloud projects mutate the live legacy array in place and preserve unrelated projects',()=>{
  const live=[
    {id:'project-A',name:'A'},
    {id:'local-only',name:'Local'},
  ];
  const sameReference=live;
  const result=mergeRecoveredProjects(live,[
    {id:'project-A',name:'A from cloud'},
    {id:'project-B',name:'B'},
  ]);

  assert.equal(result,sameReference);
  assert.equal(live.length,3);
  assert.equal(live.find(project=>project.id==='project-A').name,'A from cloud');
  assert.ok(live.some(project=>project.id==='local-only'));
  assert.ok(live.some(project=>project.id==='project-B'));
});

test('active project is preserved when valid and recovery otherwise chooses a real visible project',()=>{
  const projects=[
    {id:'A'},
    {id:'B'},
    {id:'C',archived:true},
  ];
  assert.equal(chooseRecoveredProjectId(projects,{activeProjectId:'B',contextProjectId:'A'}),'B');
  assert.equal(chooseRecoveredProjectId(projects,{activeProjectId:'missing',contextProjectId:'A'}),'A');
  assert.equal(chooseRecoveredProjectId(projects,{activeProjectId:'missing',contextProjectId:'missing'}),'A');
});

test('task hydration retries after a transient fresh-login read failure',async()=>{
  const live=[];
  const sourceCallbacks={};
  let authCallback=null;
  let taskGetCalls=0;
  let activeId=null;
  let renderCalls=0;

  const auth={
    onAuthStateChanged(callback){ authCallback=callback; return ()=>{}; },
  };
  const projectDoc=doc('project-A',{name:'A',ownerUid:'uid-1',ownerEmail:'owner@example.com'});
  const db={
    collection(name){
      assert.equal(name,'projects');
      return {
        where(field){
          return {onSnapshot(callback){ sourceCallbacks[field]=callback; return ()=>{}; }};
        },
        doc(projectId){
          assert.equal(projectId,'project-A');
          return {collection(collectionName){
            assert.equal(collectionName,'tasks');
            return {async get(){
              taskGetCalls++;
              if(taskGetCalls===1) throw new Error('temporary offline');
              return {docs:[doc('task-1',{text:'Recovered task',done:false,subtasks:[]})]};
            }};
          }};
        },
      };
    },
  };
  class CustomEvent { constructor(type,options={}){this.type=type;this.detail=options.detail;} }
  const windowRef={
    firebase:{auth:()=>auth,firestore:()=>db},
    CustomEvent,
    dispatchEvent(){},
    location:{hash:''},
    document:{getElementById(){return null;}},
    KarhaRoute:{moduleId:'dashboard'},
    KarhaLegacy:{
      getProjectsList:()=>live,
      getActiveProjectId:()=>activeId,
      selectProject:id=>{activeId=String(id);},
      persist(){},
      getProject:id=>live.find(project=>String(project.id)===String(id)) || null,
      renderAll(){renderCalls++;},
    },
  };
  const context={getProjectId:()=>activeId,setProjectId:id=>{activeId=String(id);}};
  const router={navigate(){}};

  startCloudProjectRecovery({windowRef,projectContext:context,router});
  authCallback({uid:'uid-1',email:'owner@example.com'});

  sourceCallbacks.ownerUid({docs:[projectDoc]});
  await flush();
  assert.equal(taskGetCalls,1);
  assert.equal(live[0].tasks.length,0);

  // A later ownership source snapshot must retry the failed task collection.
  sourceCallbacks.ownerEmail({docs:[projectDoc]});
  await flush();
  assert.equal(taskGetCalls,2);
  assert.equal(live[0].tasks[0].id,'task-1');
  assert.ok(renderCalls>=1);
});
