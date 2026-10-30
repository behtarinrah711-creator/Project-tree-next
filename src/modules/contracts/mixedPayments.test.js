import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ensurePaymentRows,syncPaymentStages} from './paymentStagesModule.js';

test('payment editor has one automatic method and no method/count selector',()=>{
 const source=readFileSync(new URL('./realContractFormModule.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/ftSelectRow\([^\n]*'(نحوه پرداخت|تعداد مراحل پرداخت)'/);
 assert.match(source,/renderRows\(paymentForm,paymentRows,\{mixed:true\}\)/);
 const state={paymentMethod:'',paymentRows:[],paymentStages:[]};
 assert.deepEqual(ensurePaymentRows(state),[]);
 assert.equal(state.paymentMethod,'quantity');
});

test('mixed payment rows retain modes and calculate retention with spillover',()=>{
 const state={amount:1000,retentionPercent:30,retentionMethod:'first',paymentMethod:'quantity',
 paymentRows:[{id:'a',description:'مقطوع',pricingMode:'agreed',agreedPrice:'100',quantity:999,unitPrice:999},
 {id:'b',description:'مقداری',unit:'متر',quantity:2,unitPrice:450}]};
 ensurePaymentRows(state);
 assert.equal(state.paymentRows[1].pricingMode,'quantity');
 const result=syncPaymentStages(state);
 assert.deepEqual(result.map(x=>x.grossAmount),[100,900]);
 assert.deepEqual(result.map(x=>x.retentionAmount),[100,200]);
 assert.deepEqual(result.map(x=>x.paymentAmount),[0,700]);
 state.retentionMethod='all';
 assert.deepEqual(syncPaymentStages(state).map(x=>x.paymentAmount),[70,630]);
 assert.equal(state.paymentRows[0].pricingMode,'agreed');
});

test('existing stages migrate once without losing their gross amounts',()=>{
 const state={amount:1000,paymentStages:[{id:'a',description:'اول',grossAmount:400},{id:'b',description:'دوم',grossAmount:600}]};
 const rows=ensurePaymentRows(state);
 assert.deepEqual(rows.map(x=>x.agreedPrice),['400','600']);
 assert.equal(ensurePaymentRows(state),rows);
});
