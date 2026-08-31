import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installWorkspaceChrome } from './workspaceChrome.js';
import { getProjectRouteSurface, installProjectRouteSurfaceSync } from '../core/projectRouteSurface.js';

function element(id, initial=[]){
  const classes=new Set(initial);
  return {
    id, hidden:false, textContent:'', attrs:{}, onclick:null, childNodes:[],
    classList:{
      add:value=>classes.add(value), remove:value=>classes.delete(value), contains:value=>classes.has(value),
      toggle(value,force){if(force)classes.add(value);else classes.delete(value);},
    },
    setAttribute(name,value){this.attrs[name]=value;},
    getBoundingClientRect(){return {height:id==='topbar'?50:20};},
    replaceChildren(...children){this.childNodes=children;this.cleared=true;},
    querySelector(selector){return selector==='.app-title-main'?this.main:null;},
  };
}

function harness(){
  const ids=new Map();
  const make=(id,classes=[])=>{const value=element(id,classes);ids.set(id,value);return value;};
  const footers=['Projects','Reports','Accounting','Settings'].map(key=>make(`bottom${key}Btn`,['bottom-nav-item']));
  const pages=['projectsPage','profilePage','reportsPage','accountingPage','settingsPage','contractsPage','content'];
  pages.forEach(id=>make(id,['hidden']));
  const topbar=make('topbar');
  const title=make('topbarTitle'); title.main=element('main');
  ['topbarProjectName','tabbar','bottomNav','workspaceProjectContext','workspaceProjectName','workspaceContextBack',
    'workspaceContextAction','drawerOverlay','closeReportsPage','closeAccountingPage','closeSettingsPage'].forEach(id=>make(id));
  ids.get('drawerOverlay').classList.add('hidden');
  const events=new Map();
  const documentRef={
    documentElement:{style:{setProperty(name,value){this[name]=value;}}},
    getElementById:id=>ids.get(id)||null,
    querySelector(selector){return selector==='.bottom-nav-item.active'?footers.find(x=>x.classList.contains('active'))||null:null;},
    querySelectorAll(selector){return selector==='.bottom-nav-item'?footers:[];},
  };
  const windowRef={document:documentRef,setTimeout:fn=>fn(),addEventListener(type,fn){events.set(type,fn);}};
  const calls=[];
  let state={workspaceSubpage:null,menuRootMode:null,project:{id:'A',name:'Alpha'}};
  const chrome=installWorkspaceChrome({
    windowRef,documentRef,getPresentationState:()=>state,
    navigateFooter:moduleId=>calls.push(['navigate',moduleId]),
    pushWorkspaceHistory:value=>calls.push(['history',value]),
    goHomeProjects:()=>calls.push(['home']),
    renderDrawerProjectList:()=>calls.push(['drawer']),
    clearWorkspaceSubpage:()=>{state={...state,workspaceSubpage:null};},
  });
  return {ids,footers,events,calls,chrome,windowRef,documentRef,get state(){return state;},set state(value){state=value;}};
}

test('route presentation preserves mounted dashboard content while switching page shells',()=>{
  const h=harness();
  assert.equal(installProjectRouteSurfaceSync({windowRef:h.windowRef,documentRef:h.documentRef}),true);
  const syncRoute=moduleId=>h.events.get('karha:workspace-route-synced')({detail:{projectId:'A',moduleId}});
  const content=h.ids.get('content');
  const mountedDashboard={textContent:'sentinel task for project A'};
  content.replaceChildren(mountedDashboard);
  content.cleared=false;

  syncRoute('dashboard');
  assert.deepEqual(content.childNodes,[mountedDashboard]);
  assert.equal(content.cleared,false);
  assert.equal(h.ids.get('bottomProjectsBtn').classList.contains('active'),true);

  syncRoute('reports');
  assert.equal(h.ids.get('reportsPage').classList.contains('hidden'),false);
  syncRoute('people');
  assert.equal(h.ids.get('reportsPage').classList.contains('hidden'),true);
  assert.equal(h.ids.get('settingsPage').classList.contains('hidden'),false);

  const remountedDashboard={textContent:'sentinel task for project A after returning'};
  content.replaceChildren(remountedDashboard);
  content.cleared=false;
  syncRoute('dashboard');
  assert.deepEqual(content.childNodes,[remountedDashboard]);
  assert.equal(content.cleared,false);
  assert.equal(h.ids.get('settingsPage').classList.contains('hidden'),true);
  assert.equal(h.ids.get('bottomProjectsBtn').classList.contains('active'),true);
});

test('footer binding delegates navigation and routed surfaces own active state and visibility',()=>{
  const h=harness();
  h.ids.get('bottomReportsBtn').onclick();
  assert.deepEqual(h.calls,[['navigate','reports']]);
  h.chrome.applyRoute('reports',getProjectRouteSurface('reports'));
  assert.equal(h.ids.get('bottomReportsBtn').classList.contains('active'),true);
  assert.equal(h.ids.get('reportsPage').classList.contains('hidden'),false);
  assert.equal(h.ids.get('accountingPage').classList.contains('hidden'),true);
  h.chrome.applyRoute('accounting',getProjectRouteSurface('accounting'));
  assert.equal(h.ids.get('bottomAccountingBtn').classList.contains('active'),true);
  h.chrome.applyRoute('people',getProjectRouteSurface('people'));
  assert.equal(h.ids.get('settingsPage').classList.contains('hidden'),false);
  h.chrome.applyRoute('dashboard',getProjectRouteSurface('dashboard'));
  assert.equal(h.ids.get('bottomProjectsBtn').classList.contains('active'),true);
  assert.equal(h.ids.get('settingsPage').classList.contains('hidden'),true);
});

test('drawer event opens chrome and refreshes drawer/context presentation',()=>{
  const h=harness();
  h.chrome.setBottomNavActive('Reports');
  h.events.get('karha:drawer-open')();
  assert.equal(h.ids.get('drawerOverlay').classList.contains('hidden'),false);
  assert.ok(h.calls.some(call=>call[0]==='drawer'));
  assert.equal(h.ids.get('topbarProjectName').textContent,'(پروژه Alpha)');
  h.chrome.closeDrawer();
  assert.equal(h.ids.get('drawerOverlay').classList.contains('hidden'),true);
});

test('project switches and repeated route application never leave stale footer or context',()=>{
  const h=harness();
  h.chrome.applyRoute('reports',getProjectRouteSurface('reports'));
  assert.equal(h.ids.get('topbarProjectName').textContent,'(پروژه Alpha)');
  h.state={...h.state,project:{id:'B',name:'Beta'}};
  h.chrome.applyRoute('people',getProjectRouteSurface('people'));
  assert.equal(h.ids.get('topbarProjectName').textContent,'(پروژه Beta)');
  assert.equal(h.ids.get('bottomReportsBtn').classList.contains('active'),false);
  assert.equal(h.ids.get('bottomSettingsBtn').classList.contains('active'),true);
  h.chrome.applyRoute('reports',getProjectRouteSurface('reports'));
  assert.equal(h.ids.get('topbarProjectName').textContent,'(پروژه Beta)');
  assert.equal(h.ids.get('bottomReportsBtn').classList.contains('active'),true);
});

test('route-sync events refresh drawer and context presentation for Back/Forward routes',()=>{
  const h=harness();
  // The Router adapter is intentionally installed against the same window-like
  // event target used by Workspace Chrome.
  const listeners=new Map();
  const windowRef={
    document:h.ids,
    KarhaWorkspaceChrome:h.chrome,
    addEventListener(type,listener){listeners.set(type,listener);},
  };
  assert.equal(installProjectRouteSurfaceSync({windowRef,documentRef:{}}),true);
  const before=h.calls.filter(call=>call[0]==='drawer').length;
  listeners.get('karha:workspace-route-synced')({detail:{projectId:'B',moduleId:'reports'}});
  assert.equal(h.ids.get('bottomReportsBtn').classList.contains('active'),true);
  assert.equal(h.calls.filter(call=>call[0]==='drawer').length,before+1);
});

test('legacy retains only thin chrome delegates and keeps contract back policy callback',async()=>{
  const source=await readFile(new URL('./workspacePresentationRuntime.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/function updateWorkspaceContextBar\(\)\{\s*const context/);
  assert.doesNotMatch(source,/getElementById\('bottomProjectsBtn'\)\.onclick/);
  assert.doesNotMatch(source,/addEventListener\('karha:drawer-open'/);
  assert.match(source,/function updateWorkspaceContextBar\(\)\{ return window\.KarhaWorkspaceChrome/);
  assert.match(source,/if\(workspaceSubpage === 'contractForm'\)\{ requestCloseContractForm\(\); return; \}/);
});
