import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBuckets, jalaliDayNumber } from '../../domain/wbs/costline.js';
import { costlineDocument } from './costlineExportView.js';

test('two-month export periods use paired Solar Hijri months across year boundaries',()=>{
  const buckets=buildBuckets({rangeId:'month2',works:[{start:'1404/12/12',end:'1405/01/04'}]});
  assert.deepEqual(buckets.map(bucket=>bucket.start),['1404/11/01','1405/01/01']);
  assert.equal(buckets[0].endDay+1,buckets[1].startDay);
});

test('the report clips work and funding to the date range and includes selected appendices',()=>{
  const start=jalaliDayNumber('1405/01/03');
  const project={
    name:'<آزمایش>',
    tasks:[
      {id:'w1',kind:'work',text:'اجرای تست',quantity:1,unitCost:1000,scheduleStart:'1405/01/01',scheduleEnd:'1405/01/04'},
      {id:'w2',kind:'work',text:'بدون تاریخ',quantity:1,unitCost:90},
    ],
    fundingReceipts:[{id:'r1',amount:400,depositDate:'1405/01/01'}],
    fundingAllocations:[{taskId:'w1',day:start,amount:200}],
  };
  const options={rangeId:'month2',originWeekday:4,start,end:start+1,details:true,receipts:true};
  const report=costlineDocument(project,options);
  assert.match(costlineDocument(project,{...options,start:start-2,end:start-2}),/<td>۲۵۰<\/td><td>۲۰۰<\/td><td>۵۰<\/td>/);
  assert.doesNotMatch(report,/<svg/);
  assert.match(report,/<h2>بودجه‌بندی دوره‌ای · کسری به تفکیک مسیر<\/h2>/);
  const workListOnly=costlineDocument(project,{...options,overview:false,packages:false,receipts:false});
  assert.match(workListOnly,/لیست کارها/);
  assert.doesNotMatch(workListOnly,/<svg|جمع بازهٔ انتخاب‌شده|تخصیص تجمعی|تفکیک بسته های کاری|دریافتی‌های کل پروژه/);
  assert.match(costlineDocument(project,{...options,overview:false}),/تفکیک بسته های کاری/);
  assert.match(report,/&lt;آزمایش&gt;/);
  assert.match(report,/<td>۵۰۰<\/td><td>۰<\/td><td>۵۰۰<\/td>/);
  assert.doesNotMatch(report,/تفکیک بسته های کاری/);
  assert.match(report,/جمع بازهٔ انتخاب‌شده/);
  const daily={...options,rangeId:'day'};
  assert.match(costlineDocument(project,daily),/<h2>۳ فروردین ۱۴۰۵ \| تفکیک بسته های کاری<\/h2>/);
  assert.doesNotMatch(costlineDocument(project,{...daily,packages:false}),/تفکیک بسته های کاری/);
  assert.match(report,/لیست کارها/);
  assert.match(report,/دریافتی‌های کل پروژه/);
  assert.match(report,/برآوردهای بدون تاریخ شروع/);
  assert.doesNotMatch(costlineDocument(project,{...options,details:false,receipts:false}),/لیست کارها|دریافتی‌های کل پروژه/);
});

test('the budget table includes all periods without a chart limit',()=>{
  const start=jalaliDayNumber('1405/01/01');
  const project={name:'آزمایش',tasks:[
    {id:'work',kind:'work',text:'کار',quantity:1,unitCost:1300,scheduleStart:'1405/01/01',scheduleEnd:'1405/01/13'},
  ]};
  const report=costlineDocument(project,{rangeId:'day',originWeekday:4,start,end:start+12,packages:false});
  assert.equal([...report.matchAll(/class="cost-summary"/g)].length,1);
  assert.match(report,/<td>۱۳ فروردین ۱۴۰۵<\/td>/);
  assert.doesNotMatch(report,/<svg/);
});

test('export intersects a WBS branch with individual funding route shares',()=>{
  const day='1405/01/03';
  const split={id:'work',kind:'work',text:'نصب اسپلیت',quantity:1,unitCost:1000,
    scheduleStart:day,scheduleEnd:day,costFundingRoute:'petty',
    costPaymentPlan:[{date:day,amount:300,route:'owner',method:'check'}]};
  const project={name:'آزمایش',tasks:[
    {id:'suite',kind:'stage',text:'سوئیت نگهبانی',subtasks:[split]},
    {...split,id:'other',text:'کار شاخهٔ دیگر'},
  ],fundingReceipts:[{id:'r1',amount:200,depositDate:day}],
    fundingAllocations:[{taskId:'work',day:jalaliDayNumber(day),amount:200}]};
  const options={rangeId:'month',start:jalaliDayNumber(day),end:jalaliDayNumber(day),
    details:true,receipts:true,branchId:'branch:suite'};
  const owner=costlineDocument(project,{...options,route:'owner'});
  const petty=costlineDocument(project,{...options,route:'petty'});
  assert.match(owner,/سوئیت نگهبانی · کارفرما/);
  assert.match(owner,/<td>۳۰۰<\/td><td>۶۰<\/td><td>۲۴۰<\/td>/);
  assert.match(petty,/<td>۷۰۰<\/td><td>۱۴۰<\/td><td>۵۶۰<\/td>/);
  for(const report of [owner,petty]){
    assert.match(report,/نصب اسپلیت/);
    assert.doesNotMatch(report,/کار شاخهٔ دیگر|دریافتی‌های کل پروژه/);
  }
  const combined=costlineDocument(project,options);
  assert.match(combined,/<td>کارفرما ۳۰۰ · تنخواه ۷۰۰<\/td>/);
  assert.match(combined,/<td>۱٬۰۰۰<\/td><td>۲۰۰<\/td><td>۸۰۰<\/td><td>۲۴۰<\/td><td>۵۶۰<\/td>/);
  assert.match(combined,/کسری به تفکیک مسیر \(تومان\)<\/th><td colspan="4">کارفرما ۲۴۰ · تنخواه ۵۶۰/);
  assert.match(owner,/کارفرما ۲۴۰ · تنخواه ۰/);
  assert.match(costlineDocument(project,{...options,branchId:''}),/کار شاخهٔ دیگر/);
});
