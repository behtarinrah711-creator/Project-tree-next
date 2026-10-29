import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectRouteSurface } from '../../core/projectRouteSurface.js';

test('report rows open independent destinations using the financial row design', async () => {
  class Node {
    constructor(){ this.children = []; this.listeners = {}; }
    set innerHTML(value){ this.html = value; this.children = []; }
    get innerHTML(){ return this.html; }
    appendChild(child){ this.children.push(child); }
    addEventListener(type, listener){ this.listeners[type] = listener; }
  }
  const body = new Node();
  const navigations = [];
  globalThis.window = {
    location: { hash:'', search:'' },
    KarhaAppData: { getProjects: () => [{ id:'p1', tasks:[] }] },
    KarhaApp: { projectWorkspace: { selectProject: (id, options) => {
      navigations.push([id, options.moduleId]);
      return true;
    } } },
  };
  globalThis.document = {
    getElementById: id => id === 'reportsPageBody' ? body : null,
    createElement: () => new Node(),
  };
  try {
    const { reportsModule, reportSectionModules } = await import('./reportsModule.js');
    reportsModule.mount({ projectId:'p1' });
    const list = body.children[0];
    assert.equal(list.className, 'workspace-option-list');
    assert.equal(list.children.length, 3);
    for(const row of list.children){
      assert.equal(row.className, 'workspace-option');
      assert.match(row.innerHTML, /workspace-option-title/);
      assert.match(row.innerHTML, /workspace-option-meta/);
      assert.match(row.innerHTML, /m15 6-6 6 6 6/);
      row.listeners.click();
    }
    assert.deepEqual(navigations, [['p1','contracts'], ['p1','done-works'], ['p1','work-delays']]);
    assert.deepEqual(reportSectionModules.map(module => module.id), ['done-works', 'work-delays']);
    for(const module of reportSectionModules){
      assert.deepEqual(getProjectRouteSurface(module.id), {
        pageId:'reportsPage', footer:'Reports', subpage:module.id,
      });
    }
    reportsModule.mount({ projectId:'missing' });
    assert.equal(body.children.length, 0);
    assert.match(body.innerHTML, /یک پروژه را انتخاب کنید/);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
