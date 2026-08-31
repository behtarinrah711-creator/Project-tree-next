import test from 'node:test';
import assert from 'node:assert/strict';
import { installProjectRouteSurfaceSync } from './projectRouteSurface.js';
import { installWorkspaceChrome } from '../ui/workspaceChrome.js';

function classList(initial=[]){
  const values=new Set(initial);
  return {
    add(value){values.add(value);},
    remove(value){values.delete(value);},
    toggle(value,force){if(force)values.add(value);else values.delete(value);},
    contains(value){return values.has(value);},
  };
}

function createHarness(){
  const listeners=new Map();
  const ids=new Map();
  const make=(id,classes=[])=>{
    const el={id,classList:classList(classes),attrs:{},setAttribute(name,value){this.attrs[name]=value;}};
    ids.set(id,el); return el;
  };
  make('reportsPage',[]);
  make('settingsPage',[]);
  make('contractsPage',['hidden']);
  make('bottomProjectsBtn',[]);
  const other=make('bottomReportsBtn',['active']);
  const topbar=make('topbar',['workspace-context','root-workspace-context']);
  const tabbar=make('tabbar',[]);
  const documentRef={
    getElementById:id=>ids.get(id)||null,
    querySelectorAll(selector){return selector==='.bottom-nav-item'?[ids.get('bottomProjectsBtn'),other]:[];},
  };
  const windowRef={
    document:documentRef,
    addEventListener(type,listener){listeners.set(type,listener);},
  };
  installWorkspaceChrome({windowRef,documentRef});
  return {windowRef,documentRef,listeners,ids,topbar,tabbar};
}

test('dashboard route exposes project surface after navigating from an internal page',()=>{
  const h=createHarness();
  assert.equal(installProjectRouteSurfaceSync(h),true);
  h.listeners.get('karha:workspace-route-synced')({detail:{projectId:'B',moduleId:'dashboard'}});

  assert.equal(h.ids.get('reportsPage').classList.contains('hidden'),true);
  assert.equal(h.ids.get('settingsPage').classList.contains('hidden'),true);
  assert.equal(h.ids.get('bottomProjectsBtn').classList.contains('active'),true);
  assert.equal(h.ids.get('bottomReportsBtn').classList.contains('active'),false);
  assert.equal(h.topbar.classList.contains('workspace-context'),false);
  assert.equal(h.tabbar.attrs['aria-hidden'],'false');
});

test('contracts route exposes its canonical internal shell',()=>{
  const h=createHarness();
  installProjectRouteSurfaceSync(h);
  h.listeners.get('karha:workspace-route-synced')({detail:{projectId:'B',moduleId:'contracts'}});
  assert.equal(h.ids.get('reportsPage').classList.contains('hidden'),true);
  assert.equal(h.ids.get('contractsPage').classList.contains('hidden'),false);
  assert.equal(h.ids.get('bottomReportsBtn').classList.contains('active'),true);
});
