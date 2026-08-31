import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { bootstrapApplication } from './app.js';
import { startShell } from './shellEntry.js';

function shellHarness(){
  const listeners = {};
  const hidden = new Set(['hidden']);
  const element = id => ({
    id,
    dataset: {},
    classList: { add:value=>hidden.add(value), remove:value=>hidden.delete(value), contains:value=>hidden.has(value) },
    addEventListener(type, callback){ (listeners[`${id}:${type}`] ||= []).push(callback); },
    click(){ (listeners[`${id}:click`] || []).forEach(callback => callback({ target:this })); },
  });
  const elements = Object.fromEntries(['drawerOverlay','hamburgerBtn','avatarBtn','drawerSigninBtn'].map(id => [id, element(id)]));
  class CustomEvent { constructor(type, options={}){ this.type=type; this.detail=options.detail; } }
  const events = [];
  const windowRef = { CustomEvent, dispatchEvent:event=>events.push(event) };
  return { elements, events, windowRef, documentRef:{ getElementById:id=>elements[id] } };
}

test('an application import failure is observable while Menu remains usable', async () => {
  const shell = shellHarness();
  const errors = [];
  startShell(shell);

  const failure = new Error('intentional startup failure');
  const result = await bootstrapApplication({
    loadStartup: () => Promise.reject(failure),
    windowRef: shell.windowRef,
    consoleRef: { error:(...args)=>errors.push(args) },
  });

  shell.elements.hamburgerBtn.click();
  assert.equal(result, null);
  assert.equal(shell.elements.drawerOverlay.classList.contains('hidden'), false);
  assert.equal(errors.length, 1);
  assert.equal(shell.events.some(event => event.type === 'karha:startup-error' && event.detail.error === failure), true);
});

test('successful startup publishes KarhaApp before Legacy and starts Router afterward', async () => {
  const order = [];
  class CustomEvent { constructor(type){ this.type=type; } }
  const windowRef = {
    CustomEvent,
    dispatchEvent(event){ order.push(event.type); },
  };
  const registry = {
    register(moduleDefinition){ order.push(`register:${moduleDefinition.id}`); },
  };
  let legacyLoads = 0;
  const previousWindow = globalThis.window;
  globalThis.window = { location:{ search:'', hash:'' }, localStorage:{ getItem:()=>null } };
  let application;
  try{
    const { startApplication } = await import(`./applicationStartup.js?test=${Date.now()}`);
    application = await startApplication({
      windowRef,
      registry,
      modules: [{ id:'dashboard' }],
      loadRuntime: async () => {
        legacyLoads++;
        assert.ok(windowRef.KarhaApp, 'KarhaApp must exist before Legacy loads');
        order.push('legacy');
      },
      router: { start(){ order.push('router'); } },
    });
  } finally {
    if(previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  assert.equal(application, windowRef.KarhaApp);
  assert.equal(legacyLoads, 1);
  assert.ok(order.indexOf('legacy') < order.indexOf('router'));
  assert.deepEqual(order.slice(-3), ['legacy', 'router', 'karha:ready']);
});

test('shell entry import graph contains only shellControls', async () => {
  const source = await readFile(new URL('./shellEntry.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./shellControls.js']);
  assert.doesNotMatch(source, /Router|Repository|projectModules|TaskRuntime|legacy/i);
});
