import test from 'node:test';
import assert from 'node:assert/strict';
import { bindShellControls } from './shellControls.js';

function element(id){
  const listeners = {};
  const classes = new Set(id in {drawerOverlay:1, globalMenuOverlay:1} ? ['hidden'] : []);
  return {
    id, dataset: {}, textContent:'',
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

function harness({user=null,popupErrors=[],redirectErrors=[]}={}){
  const elements = Object.fromEntries(['drawerOverlay','globalMenuOverlay','topbarTitle','avatarBtn','drawerSigninBtn','toast','globalNotebookBtn'].map(id=>[id,element(id)]));
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
    location:{hostname:'behtarinrah711-creator.github.io'},
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

test('project title opens project menu only and avatar opens a separate global menu', async () => {
  const h=harness();
  bindShellControls(h);
  await h.elements.topbarTitle.click();
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),false);
  assert.equal(h.elements.globalMenuOverlay.classList.contains('hidden'),true);
  await h.elements.avatarBtn.click();
  assert.equal(h.elements.drawerOverlay.classList.contains('hidden'),true);
  assert.equal(h.elements.globalMenuOverlay.classList.contains('hidden'),false);
});
