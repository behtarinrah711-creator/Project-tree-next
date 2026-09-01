import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindLiveTotal,
  closeWbsSheet,
  liveLineTotal,
  openActivitySearchPicker,
  openWbsSheet,
  renderAttachedActivities,
} from './wbsSheet.js';

function el(tag = 'div'){
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    className: '',
    id: '',
    innerHTML: '',
    value: '',
    textContent: '',
    attributes: {},
    listeners: {},
    append(...nodes){ this.children.push(...nodes); },
    appendChild(node){ this.children.push(node); return node; },
    addEventListener(type, fn){ this.listeners[type] = fn; this['on'+type] = fn; },
    setAttribute(name, value){ this.attributes[name] = value; },
    replaceChildren(...nodes){ this.children = nodes; },
    querySelector(sel){
      if(sel === 'input,textarea,select') return { focus(){} };
      if(sel === '.sheet-caption') return this.caption || (this.caption = el('span'));
      if(sel === '.sheet-body') return this.body || (this.body = el('div'));
      if(sel === '.close-btn') return this.close || (this.close = el('button'));
      if(sel === '.wbs-sheet-save') return this.save || (this.save = el('button'));
      if(sel === '[name="title"]') return this.titleInput || null;
      return null;
    },
    remove(){ document.body.children = document.body.children.filter(x => x !== this); },
  };
  return node;
}

test('WBS sheet mounts overlay instead of window.prompt', () => {
  const body = el('body');
  globalThis.document = {
    body,
    getElementById(id){ return body.children.find(x => x.id === id) || null; },
    createElement: el,
  };
  openWbsSheet({ title:'افزودن مرحله', body(root){ root.appendChild(el('input')); } });
  assert.equal(body.children[0].id, 'wbsSheetOverlay');
  closeWbsSheet();
});

test('empty title validation keeps the sheet open', () => {
  const body = el('body');
  globalThis.document = {
    body,
    getElementById(id){ return body.children.find(x => x.id === id) || null; },
    createElement: el,
  };
  let saved = false;
  const overlay = openWbsSheet({
    title:'افزودن کار',
    body(root){
      const input = el('input');
      input.value = '';
      root.titleInput = input;
      root.appendChild(input);
    },
    onSave(root){
      const title = root.querySelector('[name="title"]').value.trim();
      if(!title) return false;
      saved = true;
      return true;
    },
  });
  overlay.querySelector('.wbs-sheet-save').listeners.click();
  assert.equal(saved, false);
  assert.equal(body.children.length, 1);
});

test('valid save closes the sheet', () => {
  const body = el('body');
  globalThis.document = {
    body,
    getElementById(id){ return body.children.find(x => x.id === id) || null; },
    createElement: el,
  };
  const overlay = openWbsSheet({
    title:'افزودن کار',
    body(root){
      const input = el('input');
      input.value = 'بتن';
      root.titleInput = input;
    },
    onSave(root){
      return !!root.querySelector('[name="title"]').value.trim();
    },
  });
  overlay.querySelector('.wbs-sheet-save').listeners.click();
  assert.equal(body.children.length, 0);
});

test('live total updates when quantity or unit cost changes', () => {
  assert.equal(liveLineTotal(12, 2), 24);
  const qty = el('input'); qty.value = '2';
  const cost = el('input'); cost.value = '10';
  const total = el('div');
  bindLiveTotal(qty, cost, total);
  assert.equal(total.textContent, 'جمع: 20');
  qty.value = '3';
  qty.listeners.input();
  assert.equal(total.textContent, 'جمع: 30');
  cost.value = '5';
  cost.listeners.input();
  assert.equal(total.textContent, 'جمع: 15');
});

test('activity editor shows names and can detach', () => {
  const host = el('div');
  const detached = [];
  renderAttachedActivities(host, {
    attached: ['act-1'],
    catalog: [{ id:'act-1', name:'قالب‌بندی' }],
    onDetach: id => detached.push(id),
    onAdd(){},
  });
  const row = host.children.find(child => child.className === 'wbs-activity-row');
  assert.equal(row.children[0].textContent, 'قالب‌بندی');
  row.children[1].listeners.click();
  assert.deepEqual(detached, ['act-1']);
});

test('activity picker reuses existing search template', () => {
  let opened = null;
  globalThis.window = {
    KarhaSearchTemplate: {
      open(opts){ opened = opts; return true; },
    },
  };
  openActivitySearchPicker([{ id:'act-9', name:'آرماتور' }], () => {});
  assert.equal(opened.title, 'انتخاب فعالیت');
  assert.deepEqual(opened.items, [{ id:'act-9', name:'آرماتور' }]);
});

test('work edit sheet defines a single description field', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./homeView.js', import.meta.url), 'utf8');
  const start = src.indexOf('function openWorkEditSheet');
  const end = src.indexOf('function openWorkDetailSheet');
  const block = src.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.equal([...block.matchAll(/name:'description'/g)].length, 1);
  assert.equal([...block.matchAll(/fieldRow\('توضیح'/g)].length, 1);
});
