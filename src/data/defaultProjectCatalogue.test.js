import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureDefaultProjectCatalogue } from './defaultProjectCatalogue.js';
import { makeProject } from './projectFactories.js';
import { ProjectRepository } from './projectRepository.js';

test('catalogue requires a project and seeds independent defaults in each project',()=>{
  assert.equal(ensureDefaultProjectCatalogue(null),null);
  const repo=new ProjectRepository({getItem:()=>null});
  assert.deepEqual(repo.all(),[]);
  assert.equal(repo.find('missing'),null);
  const a=makeProject('a'), b=makeProject('b');
  assert.equal(a.contractTemplates[0].activityId,undefined);
  assert.equal(a.contractTemplates[1].title,'قرارداد پیمانکاری');
  assert.equal(a.activityTemplates.some(a=>a.name==='پیمانکاری'),false);
  a.contractTemplates[0].items[0].children[0].text='edited';
  assert.notEqual(a.contractTemplates[0].items[0].children[0].text,b.contractTemplates[0].items[0].children[0].text);
});

test('existing project defaults preserve edits, trash and existing activity links',()=>{
  const p={id:'old',activityTemplates:[{id:'custom',name:'اجرای فونداسیون'}]};
  ensureDefaultProjectCatalogue(p);
  assert.equal(p.activityTemplates.length,1);
  assert.equal(p.contractTemplates[0].activityId,undefined);
  assert.equal(p.contractTemplates.length,2);
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
  assert.doesNotMatch(text,/ریال|تومان|درصد|متر مکعب|حسن انجام|عیار/);
});

 test('foundation preserves the site twelve-article structure and project-specific terms stay empty',()=>{
  const template=makeProject('p').contractTemplates[0];
  assert.deepEqual(template.items.map(x=>x.text),[
    'موضوع قرارداد:','اسناد و مدارک قرارداد:','مدت قرارداد:','شرایط پرداخت:',
    'تعهدات پیمانکار:','تعهدات کارفرما:','فسخ:','شرایط غیرمترقبه:',
    'کسورات قانونی:','حل اختلافات:','جریمه:','دوره تضمین:'
  ]);
  for(const i of [2,3,7,8,9,10,11]) assert.deepEqual(template.items[i].children,[]);
  const duties=template.items[4].children.map(x=>x.text).join(' ');
  for(const word of ['قالب','میلگرد','بتن','گروت','واتراستاپ','ایمنی','تحویل']) assert.ok(duties.includes(word));
});


test('contracting template is generic and excludes project-specific articles and personal data',()=>{
  const p=makeProject('p');
  const t=p.contractTemplates.find(t=>t.title==='قرارداد پیمانکاری');
  assert.equal(t.items.length,10);
  assert.equal(t.items.find(x=>x.text==='تعهدات پیمانکار:').children.length,7);
  assert.equal(t.items.find(x=>x.text==='تعهدات کارفرما:').children.length,5);
  assert.ok(!t.items.some(x=>['موضوع قرارداد:','شرایط پرداخت:'].includes(x.text)));
  assert.doesNotMatch(JSON.stringify(t),/قریشی|آدرس|۱۲٬۵۰۰٬۰۰۰|ریال|تصفیه/);
  t.title='ویرایش شده';t.trashed=true;
  ensureDefaultProjectCatalogue(p);
  assert.equal(p.contractTemplates.filter(x=>x.id===t.id).length,1);
  assert.equal(p.contractTemplates.find(x=>x.id===t.id).title,'ویرایش شده');
  assert.equal(p.contractTemplates.find(x=>x.id===t.id).trashed,true);
});


test('existing contracting template is cleaned once while other templates and real contracts stay intact',()=>{
  const personal={id:'builtin-contracting-contract',title:'قرارداد پیمانکاری',contractorName:'جواد قریشی',contractorAddress:'آدرس شخصی',items:[
    {text:'موضوع قرارداد:',children:[{text:'فونداسیون تصفیه‌خانه'}]},
    {text:'شرایط پرداخت:',children:[{text:'نرخ قبلی'}]},
    {text:'تعهدات پیمانکار:',children:[{text:'بند عمومی'},{text:'پیمانکار آقای قریشی، آدرس شخصی'}]},
  ]};
  const other={id:'custom',title:'قالب دیگر',items:[{text:'موضوع قرارداد:'}]};
  const contract={id:'real',contractorName:'قریشی',items:[{text:'موضوع قرارداد:'}]};
  const project={contractTemplates:[personal,other],contracts:[contract]};
  ensureDefaultProjectCatalogue(project);
  assert.equal(personal.items.length,1);
  assert.deepEqual(personal.items[0].children.map(x=>x.text),['بند عمومی']);
  assert.equal(personal.contractorName,undefined);
  assert.equal(personal.contractorAddress,undefined);
  assert.equal(other.items.length,1);
  assert.equal(contract.contractorName,'قریشی');
  personal.items.push({text:'موضوع قرارداد:',children:[]});
  const once=JSON.stringify(project);
  ensureDefaultProjectCatalogue(project);
  assert.equal(JSON.stringify(project),once);
});
