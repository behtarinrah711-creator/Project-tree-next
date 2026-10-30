import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentBalanceSummary} from './paymentStagesModule.js';

test('balance subtracts net stages without deducting retention twice',()=>{
 const state={amount:1000,retentionPercent:10,paymentMethod:'quantity',retentionMethod:'first',
 paymentRows:[{pricingMode:'agreed',agreedPrice:300},{pricingMode:'quantity',quantity:2,unitPrice:100}]};
 assert.deepEqual(paymentBalanceSummary(state),{netAmount:900,payments:[{number:1,amount:200},{number:2,amount:200}],remaining:500});
 state.paymentRows.splice(0,1);
 assert.equal(paymentBalanceSummary(state).remaining,800);
 state.paymentRows=[];
 assert.equal(paymentBalanceSummary(state).remaining,900);
});
test('proportional deductions and excess scheduled amounts remain visible',()=>{
 const state={amount:1000,retentionPercent:10,paymentMethod:'quantity',retentionMethod:'all',
 paymentRows:[{pricingMode:'agreed',agreedPrice:500},{pricingMode:'agreed',agreedPrice:500}]};
 assert.equal(paymentBalanceSummary(state).remaining,0);
 state.paymentRows.push({pricingMode:'agreed',agreedPrice:100});
 assert.equal(paymentBalanceSummary(state).remaining,-90);
});
