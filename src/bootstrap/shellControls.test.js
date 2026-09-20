import test from 'node:test';
import assert from 'node:assert/strict';
import { bindShellControls } from './shellControls.js';

function element(id){
  const listeners = {};
  const classes = new Set(id === 'drawerOverlay' ? ['hidden'] : []);
  return {
    id, dataset: {}, textContent:'', hidden:false,
    setAttribute(){},
    classList: {
      add:value=>classes.add(value),
      remove:value=>classes.delete(value),
      contains:value=>classes.has(value),
      toggle(value,force){
        if(force === true){ classes.add(value); return true; }
        if(force === false){ classes.delete(value); return false; }
        if(classes.has(value)){ classes.delete(value); return false; }
        classes.add(value); return true;
      },
    },
    addEventListener(type, handler){ (listeners[type] ||= []).push(handler); },
    async click(target=this){
      for(const handler of (listeners.click || [])) await handler({target});
    },
    listenerCount(type){ return (listeners[type] || []).length; },
  };
}

function harness({user=null,popupErrors=[],redirectErrors=[],route=null,hash=''}={}){
  const elements = Object.fromEntries(['drawerOverlay','topbarTitle','drawerSigninBtn','toast','globalNotebookBtn','projectSettingsTrigger'].map(id=>[id,element(id)]));
  const events=[];
  class CustomEvent { constructor(type,options={}){ this.type=type; this.detail=options.detail; } }
  const popupQueue=[...popupErrors];
  const redirectQueue=[...redirectErrors];
  const auth = {
    currentUser:user, popupCalls:0, redirectCalls:0, signoutCalls:0,
    async signOut(){ this.signoutCalls++; },
    async signInWithPopup(){
      this.popupCalls++;
      const error=popupQueue.shift();
      if(error) throw error;
      return {user:{uid:'primary-user'}};
    },
    async signInWithRedirect(){
      this.redirectCalls++;
      const error=redirectQueue.shift();
      if(error) throw error;
    },
  };
  const authFactory=()=>auth;
  authFactory.GoogleAuthProvider=class {};
  const firebaseRef={auth:authFactory};
  const windowRef={
    firebase:firebaseRef,
    CustomEvent,
    dispatchEvent:event=>events.push(event),
    setTimeout:fn=>{ fn(); return 1; },
    location:{hostname:'behtarinrah711-creator.github.io',hash},
    KarhaRoute:route,
    KarhaWorkspaceChrome:{closeBottomPages(){ events.push({type:'close-bottom-pages'}); }},
  };
  return {elements,auth,events,windowRef,documentRef:{getElementById:id=>elements[id]}};
}

test('empty-storage shell opens the drawer before project startup', async () => {
  const h=harness();
  assert.equal(bindShellControls(h),true);
  await h.elements.topbarTitle.click();
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),false);
  assert.deepEqual(h.events.map(event=>event.type),['karha:drawer-open']);
});

test('logged-out login starts the default Firebase popup and binding is idempotent', async () => {
  const h=harness();
  bindShellControls(h);
  bindShellControls(h);
  assert.equal(h.elements.drawerSigninBtn.listenerCount('click'),1);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
  assert.equal(h.auth.redirectCalls,0);
});

test('logged-in account action signs out and closes the drawer', async () => {
  const h=harness({user:{uid:'user-1'}});
  bindShellControls(h);
  await h.elements.topbarTitle.click();
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.signoutCalls,1);
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),true);
});

test('popup network failure falls back once to redirect on the same auth instance', async () => {
  const h=harness({popupErrors:[{code:'auth/network-request-failed',message:'network'}]});
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
  assert.equal(h.auth.redirectCalls,1);
  assert.equal(h.events.some(event=>event.type==='karha:auth-error'),false);
});

test('unauthorized domain is surfaced without attempting another auth transport', async () => {
  const h=harness({popupErrors:[{code:'auth/unauthorized-domain',message:'unauthorized'}]});
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
  assert.equal(h.auth.redirectCalls,0);
  assert.match(h.elements.toast.textContent,/github\.io/);
  assert.equal(h.events.at(-1).type,'karha:auth-error');
});

test('redirect failure is surfaced after a popup failure', async () => {
  const h=harness({
    popupErrors:[{code:'auth/popup-blocked',message:'blocked'}],
    redirectErrors:[{code:'auth/network-request-failed',message:'redirect-network'}],
  });
  bindShellControls(h);
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.auth.popupCalls,1);
  assert.equal(h.auth.redirectCalls,1);
  assert.match(h.elements.toast.textContent,/Firebase/);
  assert.equal(h.events.at(-1).type,'karha:auth-error');
});

test('project title opens the one unified right drawer without a redundant avatar trigger', async () => {
  const h=harness();
  bindShellControls(h);
  await h.elements.topbarTitle.click();
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),false);
  assert.equal(h.documentRef.getElementById('avatarBtn'),undefined);
});

test('opening notebook closes a previously visible workspace page first',async()=>{
  const h=harness();
  bindShellControls(h);
  await h.elements.globalNotebookBtn.click();
  assert.deepEqual(h.events.map(event=>event.type),['close-bottom-pages','karha:open-notebook']);
});

test('project settings trigger is visible only on an explicit project route',()=>{
  const projectWorkspace={getActiveProject:()=>({id:'p-1',name:'Project'})};
  const project=harness({route:{projectId:'p-1',moduleId:'planning'},hash:'#/projects/p-1/planning'});
  project.windowRef.KarhaApp={projectWorkspace};
  bindShellControls(project);
  assert.equal(project.elements.projectSettingsTrigger.hidden,false);

  const notebook=harness({route:{projectId:null,moduleId:'notebook'},hash:'#/notebook'});
  notebook.windowRef.KarhaApp={projectWorkspace};
  bindShellControls(notebook);
  assert.equal(notebook.elements.projectSettingsTrigger.hidden,true);

  const global=harness({route:{projectId:null,moduleId:'dashboard'},hash:''});
  global.windowRef.KarhaApp={projectWorkspace};
  bindShellControls(global);
  assert.equal(global.elements.projectSettingsTrigger.hidden,true);
});
