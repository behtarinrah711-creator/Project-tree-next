import test from 'node:test';
import assert from 'node:assert/strict';
import {rowAmount,syncContractAmount,renderQuantityRows} from './contractPricing.js';
import {syncPaymentStages} from './paymentStagesModule.js';
import {contractDocumentMarkup} from './contractDocument.js';

test('pricing total uses quantities while payment quantities stay independent',()=>{
  const state={amountMethod:'quantity',amountRows:[{description:'شاسی',unit:'عدد',quantity:'750',unitPrice:'10000000'}],
    paymentMethod:'quantity',paymentStageCount:3,paymentRows:[{id:'batch',description:'۲۰ شاسی',unit:'عدد',quantity:'20',unitPrice:'10000000'}],retentionPercent:10,retentionMethod:'first'};
  assert.equal(syncContractAmount(state),'7500000000');
  const rows=syncPaymentStages(state);
  assert.equal(rows.length,1);assert.equal(rows[0].grossAmount,200000000);
  assert.equal(rows[0].paymentAmount,0);assert.equal(rows[0].retentionAmount,200000000);
  assert.equal(state.paymentStageCount,3); // Disabled count never generates rows.
  assert.equal(state.retentionAmount,'750000000');
  const html=contractDocumentMarkup(state);
  assert.equal((html.match(/<table/g)||[]).length,2);
  assert.match(html,/۷٬۵۰۰٬۰۰۰٬۰۰۰/);assert.match(html,/مراحل پرداخت/);
  assert.doesNotMatch(html,/پس از .*٪ پیشرفت/);
});

test('retention spills across unequal rows or applies proportionally, without editing quantities',()=>{
  const state={amount:1000,paymentMethod:'quantity',retentionPercent:30,
    paymentRows:[100,150,750].map((n,i)=>({id:String(i),quantity:n,unitPrice:1}))};
  assert.deepEqual(syncPaymentStages(state).map(x=>x.paymentAmount),[0,0,700]);
  state.retentionMethod='all';
  assert.deepEqual(syncPaymentStages(state).map(x=>x.paymentAmount),[70,105,525]);
  assert.deepEqual(state.paymentRows.map(x=>x.quantity),[100,150,750]);
});

test('decimal quantities and Persian digits calculate correctly; agreed amount is preserved',()=>{
  assert.equal(rowAmount({quantity:'۱۲٫۵',unitPrice:'۱٬۰۰۰'}),12500);
  const agreed={amountMethod:'agreed',amount:'200',amountRows:[{quantity:100,unitPrice:50}]};
  assert.equal(syncContractAmount(agreed),'200');
});

test('quantity editor wires unit suffix, description growth and add/remove renumbering',()=>{
  const previous=globalThis.document;
  const make=tag=>({tag,children:[],dataset:{},attributes:{},append(...xs){this.children.push(...xs);},appendChild(x){this.children.push(x);},setAttribute(k,v){this.attributes[k]=v;}});
  globalThis.document={createElement:make};
  try{
    const root=make('root'),rows=[{id:'one',unit:'مترمربع',description:'شرح',quantity:2,unitPrice:3}];
    let changed=0,dirty=0;const numberFields=[];
    renderQuantityRows(root,rows,{onChange:()=>changed++,onDirty:()=>dirty++,selectRow(){},pick(){},numberRow:(root,label,value,change,options)=>numberFields.push({label,change,options})});
    const list=root.children[0],card=list.children[0];
    assert.equal(numberFields[0].options.suffix,'مترمربع');
    assert.equal(numberFields[0].options.allowDecimal,true);
    const wrap=card.children[1].children[1],textarea=wrap.children[0];
    textarea.value='شرح طولانی\nخط دوم';textarea.oninput();
    assert.equal(rows[0].description,textarea.value);assert.equal(wrap.dataset.value,textarea.value+' ');assert.equal(dirty,1);
    numberFields[0].change('12.5');assert.equal(rows[0].quantity,'12.5');
    list.children.at(-1).onclick();assert.equal(rows.length,2);
    card.children[0].children[1].onclick();assert.equal(rows.length,1);assert.equal(changed,2);
  }finally{globalThis.document=previous;}
});
