import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRetainedProjects, installProjectRecoveryRetention } from './projectRecoveryRetention.js';

test('mergeRetainedProjects restores only missing projects into the current live array',()=>{
  const live=[{id:'B',name:'B live'}];
  const retained=[{id:'A',name:'A'},{id:'B',name:'B retained'},{id:'C',name:'C'}];
  const result=mergeRetainedProjects(live,retained);
  assert.deepEqual(result,{changed:true,restored:2});
  assert.deepEqual(live.map(project=>project.id),['B','A','C']);
  assert.equal(live[0].name,'B live');
});

test('recovered projects survive a later legacy array replacement and routed workspace is remounted',()=>{
  const listeners=new Map();
  const addEventListener=(type,listener)=>{
    const list=listeners.get(type)||[];
    list.push(listener);listeners.set(type,list);
  };
  const dispatchEvent=event=>{
    for(const listener of listeners.get(event.type)||[]) listener(event);
    return true;
  };
  class CustomEvent{
    constructor(type,{detail}={}){this.type=type;this.detail=detail;}
  }

  let live=[{id:'A'},{id:'B'},{id:'C'}];
  let persistCalls=0;
  let syncCalls=0;
  const windowRef={
    CustomEvent,
    addEventListener,
    dispatchEvent,
    KarhaLegacy:{
      getProjectsList(){return live;},
      persist(){persistCalls++;},
    },
    KarhaApp:{router:{sync(){syncCalls++;}}},
  };

  assert.equal(installProjectRecoveryRetention({windowRef}),true);
  dispatchEvent(new CustomEvent('karha:projects-recovered',{detail:{count:3,projectId:'B'}}));

  // Simulate the late legacy migration listener replacing data.projects with
  // an incomplete/empty array after recovery had already succeeded.
  live=[];
  dispatchEvent(new CustomEvent('karha:workspace-route-synced',{detail:{projectId:'B',moduleId:'dashboard'}}));

  assert.deepEqual(live.map(project=>project.id),['A','B','C']);
  assert.equal(syncCalls,1);
  assert.equal(persistCalls,1);
});

test('opening the drawer re-applies retained projects and triggers one guarded refresh',()=>{
  const listeners=new Map();
  const addEventListener=(type,listener)=>{
    const list=listeners.get(type)||[];
    list.push(listener);listeners.set(type,list);
  };
  const dispatchEvent=event=>{
    for(const listener of listeners.get(event.type)||[]) listener(event);
    return true;
  };
  class CustomEvent{
    constructor(type,{detail}={}){this.type=type;this.detail=detail;}
  }
  let live=[{id:'A'},{id:'B'}];
  let drawerEvents=0;
  const windowRef={
    CustomEvent,
    addEventListener,
    dispatchEvent(event){
      if(event.type==='karha:drawer-open') drawerEvents++;
      return dispatchEvent(event);
    },
    KarhaLegacy:{getProjectsList(){return live;},persist(){}},
    KarhaApp:{router:{sync(){}}},
  };

  installProjectRecoveryRetention({windowRef});
  dispatchEvent(new CustomEvent('karha:projects-recovered',{detail:{count:2,projectId:'A'}}));
  live=[];
  windowRef.dispatchEvent(new CustomEvent('karha:drawer-open'));

  assert.deepEqual(live.map(project=>project.id),['A','B']);
  assert.equal(drawerEvents,2);
});
