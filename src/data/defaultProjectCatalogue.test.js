import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDefaultProjectCatalogue } from './defaultProjectCatalogue.js';
import { makeProject } from './projectFactories.js';
import { ProjectRepository } from './projectRepository.js';

test('catalogue requires a project and seeds linked independent defaults in each project',()=>{
  assert.equal(ensureDefaultProjectCatalogue(null),null);
  const repo=new ProjectRepository({getItem:()=>null});
  assert.deepEqual(repo.all(),[]);
  assert.equal(repo.find('missing'),null);
  const a=makeProject('a'), b=makeProject('b');
  assert.equal(a.contractTemplates[0].activityId,a.activityTemplates[0].id);
  a.contractTemplates[0].items[0].children[0].text='edited';
  assert.notEqual(a.contractTemplates[0].items[0].children[0].text,b.contractTemplates[0].items[0].children[0].text);
});

test('existing project defaults preserve edits, trash and existing activity links',()=>{
  const p={id:'old',activityTemplates:[{id:'custom',name:'اجرای فونداسیون'}]};
  ensureDefaultProjectCatalogue(p);
  assert.equal(p.activityTemplates.length,1);
  assert.equal(p.contractTemplates[0].activityId,'custom');
  p.contractTemplates[0].items[0].text='edited';
  p.contractTemplates[0].trashed=true;
  const once=JSON.stringify(p);
  ensureDefaultProjectCatalogue(p);
  assert.equal(JSON.stringify(p),once);
  p.activityTemplates[0].trashed=true;
  ensureDefaultProjectCatalogue(p);
  assert.equal(p.activityTemplates.length,1);
});

test('template contains only general provisions and employer supplied materials',()=>{
  const p=makeProject('p');
  const t=p.contractTemplates[0];
  assert.deepEqual(t.paymentItems,[]);
  const text=JSON.stringify(t.items);
  assert.match(text,/تأمین تمامی مصالح مصرفی بر عهده کارفرماست/);
  assert.doesNotMatch(text,/ریال|تومان|درصد|متر مکعب|مدت قرارداد|شرایط پرداخت|حسن انجام|عیار/);
});
