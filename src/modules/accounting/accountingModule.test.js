import test from 'node:test';
import assert from 'node:assert/strict';
import accounting, { ACCOUNTING_SECTIONS, accountingSectionModules } from './index.js';

test('financial workspace exposes the six requested sections as routes', () => {
  assert.equal(accounting.id, 'accounting');
  assert.deepEqual(
    ACCOUNTING_SECTIONS.map(section => section.title),
    [
      'صورت وضعیت‌ها',
      'در انتظار پرداخت',
      'گردش حساب',
      'گردش حساب اشخاص',
      'تنخواه',
      'پیش‌بینی پرداخت‌ها',
    ],
  );
  assert.deepEqual(
    accountingSectionModules.map(section => section.id),
    ACCOUNTING_SECTIONS.map(section => section.id),
  );
});

test('financial rows navigate to independent empty section routes', () => {
  class FakeNode {
    constructor(tag){ this.tag = tag; this.children = []; this.listeners = {}; }
    replaceChildren(...children){ this.children = children; }
    appendChild(child){ this.children.push(child); }
    addEventListener(type, listener){ this.listeners[type] = listener; }
  }

  const body = new FakeNode('body');
  globalThis.document = {
    getElementById: id => id === 'accountingPageBody' ? body : null,
    createElement: tag => new FakeNode(tag),
  };
  const navigations = [];
  globalThis.window = {
    KarhaApp: { router: { navigate: (...args) => navigations.push(args) } },
  };

  accounting.mount({ projectId:'project-1' });
  const rows = body.children[0].children;
  assert.equal(rows.length, 6);
  rows[1].listeners.click();
  assert.deepEqual(navigations, [['project-1', 'pending-payments']]);

  accountingSectionModules[1].mount({ projectId:'project-1' });
  assert.equal(body.children.length, 0);

  delete globalThis.document;
  delete globalThis.window;
});
