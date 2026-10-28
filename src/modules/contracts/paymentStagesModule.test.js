import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePaymentStages,syncPaymentStages,renderPaymentStages} from './paymentStagesModule.js';
import {contractDocumentMarkup} from './contractDocument.js';
test('first deduction spills forward without negative payments',()=>{
 const s={amount:100000000,retentionPercent:15,paymentStageCount:10,retentionMethod:'first'};
 const rows=syncPaymentStages(s);
 assert.deepEqual(rows.map(x=>x.paymentAmount),[0,5000000,...Array(8).fill(10000000)]);
 assert.deepEqual(rows.slice(0,3).map(x=>x.progress),[10,20,30]);
 assert.equal(s.retentionAmount,'15000000');
 assert.equal(s.amountAfterRetention,'85000000');
});
test('both methods conserve rounded amounts across all counts and retention extremes',()=>{
 for(const count of Array.from({length:10},(_,i)=>i+1))for(const retention of [0,10,15,99,100])for(const method of ['first','all']){
 const rows=calculatePaymentStages({amount:100000003,retentionPercent:retention,paymentStageCount:count,retentionMethod:method});
 assert.equal(rows.length,count);
 assert.equal(rows.at(-1).progress,100);
 assert.equal(rows.reduce((n,x)=>n+x.retentionAmount,0),Math.round(100000003*retention/100));
 assert.equal(rows.reduce((n,x)=>n+x.retentionAmount+x.paymentAmount,0),100000003);
 assert.ok(rows.every(x=>x.paymentAmount>=0));
 }
});
test('all method deducts proportionally and preserves descriptions on recalculation',()=>{
 const s={amount:100000000,retentionPercent:10,paymentStageCount:4,retentionMethod:'all',paymentStages:[{description:'شرط اول'}]};
 assert.deepEqual(syncPaymentStages(s).map(x=>x.paymentAmount),Array(4).fill(22500000));
 s.retentionMethod='first';
 assert.deepEqual(syncPaymentStages(s).map(x=>x.paymentAmount),[15000000,25000000,25000000,25000000]);
 assert.equal(s.paymentStages[0].description,'شرط اول');
 assert.match(contractDocumentMarkup(s),/آخرین صورت‌وضعیت/);
});
test('calculated UI only allows description edits and has no add/delete or numeric buttons',()=>{
 const old=globalThis.document;
 const make=tag=>({tag,children:[],append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);}});
 globalThis.document={createElement:make};
 try{
 const body=make('body');renderPaymentStages(body,{amount:100,retentionPercent:15,paymentStageCount:10});
 const all=[];const walk=x=>{all.push(x);x.children.forEach(walk);};walk(body);
 assert.equal(all.filter(x=>x.tag==='button').length,0);
 assert.equal(all.filter(x=>x.tag==='input').length,10);
 }finally{globalThis.document=old;}
});
