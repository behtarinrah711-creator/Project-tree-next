import assert from 'node:assert/strict';
import test from 'node:test';

const projects={
  A:{tasks:['task-A']}, B:{tasks:['task-B']}, C:{tasks:['task-C']},
};

async function createRouterHarness({initialHash,initialProjects,activeTab}){
  const listeners=new Map();
  const stack=[{url:initialHash,state:null}];
  let cursor=0;
  globalThis.CustomEvent=class { constructor(type,init={}){this.type=type;this.detail=init.detail;} };
  globalThis.document={readyState:'complete'};
  globalThis.window={
    location:{hash:initialHash,href:initialHash,search:''},
    addEventListener(type,listener){
      const values=listeners.get(type)||[]; values.push(listener); listeners.set(type,values);
    },
    dispatchEvent(event){ (listeners.get(event.type)||[]).forEach(listener=>listener(event)); },
  };
  const setLocation=value=>{ window.location.hash=value;window.location.href=value; };
  window.history={
    get state(){return stack[cursor].state;},
    pushState(state,_title,url){ stack.splice(cursor+1); stack.push({url,state}); cursor++; setLocation(url); },
    replaceState(state,_title,url){ stack[cursor]={url,state}; setLocation(url); },
    back(){ cursor--; setLocation(stack[cursor].url); window.dispatchEvent({type:'popstate',state:stack[cursor].state}); },
    forward(){ cursor++; setLocation(stack[cursor].url); window.dispatchEvent({type:'popstate',state:stack[cursor].state}); },
    go(delta){cursor+=delta;setLocation(stack[cursor].url);window.dispatchEvent({type:'popstate',state:stack[cursor].state});},
  };
  const {installBrowserHistory}=await import(`./browserHistory.js?harness=${Date.now()}-${Math.random()}`);
  installBrowserHistory({windowRef:window});

  const { AppRouter }=await import(`./router.js?harness=${Date.now()}-${Math.random()}`);
  const { moduleRegistry }=await import('./moduleRegistry.js');
  const { projectContext }=await import('./projectContext.js');
  projectContext.setProjectId(null,{silent:true});
  const data={projects:initialProjects,activeTab};
  const dashboardMounts=[];
  const taskReads=[];
  const invalidDashboardMounts=[];
  const contractProjects=[];
  moduleRegistry.register({
    id:'dashboard',
    mount({projectId}){
      dashboardMounts.push(projectId);
      if(!projects[projectId]) invalidDashboardMounts.push(projectId);
      else taskReads.push(...projects[projectId].tasks);
      return {projectId,moduleId:'dashboard'};
    },
  });
  moduleRegistry.register({
    id:'contracts',
    mount({projectId}){ contractProjects.push(projectId); return {projectId,moduleId:'contracts'}; },
  });
  moduleRegistry.register({
    id:'reports',
    mount({projectId}){ return {projectId,moduleId:'reports'}; },
  });
  window.addEventListener('karha:workspace-route-synced',event=>{ data.activeTab=event.detail.projectId; });
  const router=new AppRouter();
  router.start();
  await new Promise(resolve=>setTimeout(resolve,0));
  return {router,projectContext,data,dashboardMounts,taskReads,invalidDashboardMounts,contractProjects};
}

function currentState(harness){
  return {
    activeTab:harness.data.activeTab,
    hash:window.location.hash,
    context:harness.projectContext.getProjectId(),
    route:window.KarhaRoute.projectId,
    mounted:harness.router.currentMounted?.projectId ?? null,
    dashboard:harness.dashboardMounts.at(-1) ?? null,
    task:harness.taskReads.at(-1) ?? null,
  };
}

test('project routes decode the selected project and module identifiers', async () => {
  globalThis.window={location:{hash:'#/projects/%D9%BE%D8%B1%D9%88%DA%98%D9%87%20%DB%B1/dashboard',search:''}};
  const { parseRoute }=await import(`./router.js?decode=${Date.now()}`);
  assert.deepEqual(parseRoute(),{projectId:'پروژه ۱',moduleId:'dashboard'});
});

test('programmatic A to B to C navigation keeps router, tasks, history, and contracts synchronized', async () => {
  const projectList=Object.keys(projects).map(id=>({id,...projects[id]}));
  const harness=await createRouterHarness({
    initialHash:'#/projects/A/dashboard',initialProjects:projectList,activeTab:'A',
  });
  assert.deepEqual(currentState(harness),{
    activeTab:'A',hash:'#/projects/A/dashboard',context:'A',route:'A',mounted:'A',dashboard:'A',task:'task-A',
  });

  harness.router.navigate('B','dashboard');
  assert.deepEqual(currentState(harness),{
    activeTab:'B',hash:'#/projects/B/dashboard',context:'B',route:'B',mounted:'B',dashboard:'B',task:'task-B',
  });
  harness.router.navigate('C','dashboard');
  assert.deepEqual(currentState(harness),{
    activeTab:'C',hash:'#/projects/C/dashboard',context:'C',route:'C',mounted:'C',dashboard:'C',task:'task-C',
  });

  window.history.back();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual([harness.data.activeTab,harness.projectContext.getProjectId(),window.KarhaRoute.projectId,harness.router.currentMounted.projectId],['B','B','B','B']);
  window.history.forward();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual([harness.data.activeTab,harness.projectContext.getProjectId(),window.KarhaRoute.projectId,harness.router.currentMounted.projectId,harness.taskReads.at(-1)],['C','C','C','C','task-C']);

  harness.router.navigate('B','contracts');
  assert.equal(harness.contractProjects.at(-1),'B');
  assert.deepEqual(harness.invalidDashboardMounts,[]);
});

test('same-route child history does not remount the routed module', async () => {
  const projectList=Object.keys(projects).map(id=>({id,...projects[id]}));
  const harness=await createRouterHarness({
    initialHash:'#/projects/B/contracts',initialProjects:projectList,activeTab:'B',
  });
  const mountsBefore=harness.contractProjects.length;
  assert.equal(mountsBefore,1);

  // Pickers, numpads and form layers push history entries without changing the
  // hash route. Back through those entries belongs to the child UI layer, not
  // to the app router.
  window.history.pushState({karhaSearchTemplate:true},'',window.location.hash);
  window.history.back();
  await new Promise(resolve=>setTimeout(resolve,0));

  assert.equal(harness.contractProjects.length,mountsBefore);
  assert.equal(harness.router.currentMounted?.moduleId,'contracts');
  assert.equal(window.location.hash,'#/projects/B/contracts');
});

test('empty startup mounts restored cloud project B and preserves later navigation', async () => {
  const harness=await createRouterHarness({initialHash:'',initialProjects:[],activeTab:null});
  assert.deepEqual(harness.data.projects,[]);
  assert.equal(harness.data.activeTab,null);
  assert.equal(harness.projectContext.getProjectId(),null);
  assert.equal(harness.router.currentMounted,null);

  harness.data.projects=Object.keys(projects).map(id=>({id,...projects[id]}));
  harness.data.activeTab='B';
  harness.projectContext.synchronizeProjects(harness.data.projects,harness.data.activeTab);
  harness.router.navigate(harness.data.activeTab,'dashboard',{replace:true});
  assert.deepEqual(harness.data.projects.map(project=>project.id),['A','B','C']);
  assert.deepEqual(currentState(harness),{
    activeTab:'B',hash:'#/projects/B/dashboard',context:'B',route:'B',mounted:'B',dashboard:'B',task:'task-B',
  });

  harness.router.navigate('C','dashboard');
  assert.deepEqual(currentState(harness),{
    activeTab:'C',hash:'#/projects/C/dashboard',context:'C',route:'C',mounted:'C',dashboard:'C',task:'task-C',
  });
  window.history.back();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual([harness.data.activeTab,harness.projectContext.getProjectId(),window.KarhaRoute.projectId,harness.router.currentMounted.projectId,harness.taskReads.at(-1)],['B','B','B','B','task-B']);
  window.history.forward();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual([harness.data.activeTab,harness.projectContext.getProjectId(),window.KarhaRoute.projectId,harness.router.currentMounted.projectId,harness.taskReads.at(-1)],['C','C','C','C','task-C']);

  harness.router.navigate('B','contracts');
  assert.equal(harness.contractProjects.at(-1),'B');
  assert.deepEqual(harness.invalidDashboardMounts,[]);
});

test('late background dashboard replace cannot overwrite an explicit same-project route', async () => {
  const projectList=Object.keys(projects).map(id=>({id,...projects[id]}));
  const harness=await createRouterHarness({
    initialHash:'#/projects/A/reports',initialProjects:projectList,activeTab:'A',
  });

  assert.equal(window.location.hash,'#/projects/A/reports');
  assert.equal(harness.router.currentMounted?.moduleId,'reports');
  assert.equal(window.history.state?.route?.moduleId,'reports');

  const result=harness.router.navigate('A','dashboard',{replace:true});
  assert.equal(result,true);
  assert.equal(window.location.hash,'#/projects/A/reports');
  assert.equal(harness.router.currentMounted?.moduleId,'reports');
  assert.equal(window.history.state?.route?.moduleId,'reports');
});
