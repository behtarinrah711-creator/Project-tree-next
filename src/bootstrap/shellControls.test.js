import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
    remove(){ this.parentNode?.removeChild?.(this); },
  };
}

function harness({user=null,popupErrors=[],redirectErrors=[],route=null,hash='',hostname='behtarinrah711-creator.github.io',saosaSession=null}={}){
  const elements = Object.fromEntries(['drawerOverlay','topbarTitle','drawerSigninBtn','toast','globalNotebookBtn','projectSettingsTrigger'].map(id=>[id,element(id)]));
  const events=[];
  const windowListeners=new Map();
  let storedSaosaSession=saosaSession;
  const body=element('body');
  const topbar=element('topbar');
  topbar.childNodes=[elements.projectSettingsTrigger];
  topbar.insertBefore=function(child,before){const index=before?this.childNodes.indexOf(before):-1;this.childNodes.splice(index>=0?index:this.childNodes.length,0,child);child.parentNode=this;};
  topbar.removeChild=function(child){const index=this.childNodes.indexOf(child);if(index>=0)this.childNodes.splice(index,1);child.parentNode=null;};
  elements.projectSettingsTrigger.parentNode=topbar;
  const documentElement=element('html');
  documentElement.classList.add('saosa-initial-logged-out');
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
    dispatchEvent:event=>{
      events.push(event);
      for(const listener of (windowListeners.get(event.type) || [])) listener(event);
    },
    addEventListener(type,listener){
      const listeners=windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type,listeners);
    },
    setTimeout:fn=>{ fn(); return 1; },
    location:{hostname,hash},
    localStorage:{
      getItem(key){ return key === 'saosa:v1:sms-session' && storedSaosaSession ? JSON.stringify(storedSaosaSession) : null; },
      removeItem(key){ if(key === 'saosa:v1:sms-session') storedSaosaSession=null; },
    },
    KarhaLegacy:{renderAll(){ events.push({type:'render-all'}); }},
    KarhaRoute:route,
    KarhaWorkspaceChrome:{closeBottomPages(){ events.push({type:'close-bottom-pages'}); }},
  };
  return {elements,auth,events,windowRef,documentRef:{body,documentElement,getElementById:id=>elements[id]}};
}

test('Saosa guest home follows the same logged-out state used by the drawer', () => {
  const h=harness({hostname:'saosa.ir'});
  bindShellControls(h);
  assert.equal(h.documentRef.body.classList.contains('saosa-logged-out'),true);
  assert.equal(h.documentRef.documentElement.classList.contains('saosa-initial-logged-out'),true);
  assert.equal(h.elements.drawerSigninBtn.dataset.authAction,'signin');
  assert.equal(h.elements.drawerSigninBtn.textContent,'ورود با شماره موبایل');
  assert.equal(h.events.some(event=>event.type === 'render-all'),true);
});

test('Saosa session resolution updates the shell before the workspace renders', () => {
  const session={phone:'09170000000',token:'token',expiresAt:Date.now()+60_000};
  const h=harness({hostname:'saosa.ir',saosaSession:session});
  bindShellControls(h);
  assert.equal(h.documentRef.body.classList.contains('saosa-logged-out'),false);
  assert.equal(h.documentRef.documentElement.classList.contains('saosa-initial-logged-out'),false);
  h.windowRef.localStorage.removeItem('saosa:v1:sms-session');
  h.windowRef.dispatchEvent(new h.windowRef.CustomEvent('karha:saosa-session-synced'));
  assert.equal(h.documentRef.body.classList.contains('saosa-logged-out'),true);
  assert.equal(h.documentRef.documentElement.classList.contains('saosa-initial-logged-out'),true);
  assert.equal(h.elements.drawerSigninBtn.dataset.authAction,'signin');
});

test('Saosa logout clears the notebook address before returning to the entry page', async () => {
  const session={phone:'09170000000',token:'token',expiresAt:Date.now()+60_000};
  const h=harness({hostname:'saosa.ir',saosaSession:session,hash:'#/notebook'});
  let reloads=0;
  h.windowRef.location.reload=()=>{ reloads++; };
  bindShellControls(h);
  assert.equal(h.elements.drawerSigninBtn.dataset.authAction,'signout');
  await h.elements.drawerSigninBtn.click();
  assert.equal(h.windowRef.localStorage.getItem('saosa:v1:sms-session'),null);
  assert.equal(h.windowRef.location.hash,'');
  assert.equal(reloads,1);
});

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
  assert.equal(project.windowRef.KarhaProjectWorkspaceControls.isMounted(),true);

  const notebook=harness({route:{projectId:null,moduleId:'notebook'},hash:'#/notebook'});
  notebook.windowRef.KarhaApp={projectWorkspace};
  bindShellControls(notebook);
  assert.equal(notebook.windowRef.KarhaProjectWorkspaceControls.isMounted(),false);

  const global=harness({route:{projectId:null,moduleId:'dashboard'},hash:''});
  global.windowRef.KarhaApp={projectWorkspace};
  bindShellControls(global);
  assert.equal(global.windowRef.KarhaProjectWorkspaceControls.isMounted(),false);
});

test('project settings trigger opens settings and a second click returns to the previous route',async()=>{
  const selected=[];
  const projectWorkspace={
    getActiveProject:()=>({id:'p-1',name:'Project'}),
    selectProject:(id,options)=>selected.push([id,options]),
  };
  const project=harness({route:{projectId:'p-1',moduleId:'planning'},hash:'#/projects/p-1/planning'});
  project.windowRef.KarhaApp={projectWorkspace};
  bindShellControls(project);
  await project.elements.projectSettingsTrigger.click();
  assert.deepEqual(selected,[['p-1',{moduleId:'people'}]]);
  assert.equal(project.elements.projectSettingsTrigger.classList.contains('active'),false);

  let backCalls=0;
  const settings=harness({route:{projectId:'p-1',moduleId:'people'},hash:'#/projects/p-1/people'});
  settings.windowRef.KarhaApp={projectWorkspace};
  settings.windowRef.KarhaBrowserHistory={back(){backCalls++;}};
  bindShellControls(settings);
  assert.equal(settings.elements.projectSettingsTrigger.classList.contains('active'),true);
  await settings.elements.projectSettingsTrigger.click();
  assert.equal(backCalls,1);
  assert.equal(selected.length,1);
});

test('Saosa guest brand is resolved before first paint without a temporary generic title', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../styles/index.css', import.meta.url), 'utf8'),
  ]);
  assert.ok(html.indexOf("saosa-initial-logged-out") < html.indexOf('src/styles/index.css'));
  assert.match(html, /class="saosa-public-brand"[\s\S]*?<strong>ساُسا<\/strong>[\s\S]*?<span>مدیریت ساخت و ساز<\/span>/);
  assert.match(css, /\.saosa-public-brand strong\{font-size:14px;font-weight:500;\}/);
  assert.match(css, /\.saosa-public-brand span\{font-size:14px;font-weight:400;\}/);
  assert.match(css, /font-size:14px;\s*line-height:1\.4;/);
  assert.match(css, /\.topbar::before\{content:none;\}/);
  assert.match(css, /html\.saosa-initial-logged-out body,body\.saosa-logged-out\) #notebookPage/);
  assert.match(css, /html\.saosa-initial-logged-out body,body\.saosa-logged-out\) #notebookExportPage\{display:none !important;\}/);
  assert.match(css, /body\.saosa-logged-out \.content\{[\s\S]*?overflow:hidden;[\s\S]*?display:flex;/);
  assert.match(css, /body\.saosa-logged-out \.saosa-guest-card\{[\s\S]*?min-height:0;[\s\S]*?flex:1 1 auto;[\s\S]*?overflow:hidden;/);
  assert.match(css, /body\.saosa-logged-out \.saosa-guest-login\{[\s\S]*?background:var\(--primary-navy\);/);
  assert.doesNotMatch(css, /\.saosa-guest-card\{[\s\S]*?min-height:560px;/);
});

test('Saosa authenticated empty-project state keeps only the global drawer entry points', async () => {
  const [controls, foundation, presentation, css, html] = await Promise.all([
    readFile(new URL('./shellControls.js', import.meta.url), 'utf8'),
    readFile(new URL('../core/applicationFoundation.js', import.meta.url), 'utf8'),
    readFile(new URL('../ui/workspacePresentationRuntime.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
  ]);
  assert.match(controls, /displayName:'کاربر ساُسا'/);
  assert.match(foundation, /empty\.textContent='برای شروع یک پروژه ایجاد کنید'/);
  assert.match(presentation, /saosa-no-project/);
  assert.match(presentation, />\+ ایجاد پروژه<\/button>/);
  assert.match(css, /body\.saosa-no-project #bottomNav,[\s\S]*?#projectSettingsTrigger\{display:none!important;\}/);
  assert.match(css, /body\.saosa-no-project:not\(\.global-surface\) \.topbar-title\.project-menu-trigger::before/);
  assert.match(css, /#drawerOverlay #drawerSigninBtn\[data-auth-action="signout"\]\{color:var\(--danger\);border:0;\}/);
  assert.match(css, /#drawerOverlay #drawerProjectsBtn\{[\s\S]*?font-size:14px;/);
  assert.match(html, /id="drawerAddProjectBtn"[^>]*>\+ پروژه جدید<\/button>/);
});
