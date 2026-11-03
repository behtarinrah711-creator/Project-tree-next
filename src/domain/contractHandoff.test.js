import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionContractHandoff as transition,isContractSigned,isContractInFinance,preserveContractHandoff} from './contractHandoff.js';
const actor={id:'member',name:'مهندس احمدی'};
const base=()=>({id:'c',status:'final',approvalStatus:'approved',updatedAt:1,title:'قرارداد',approvalHistory:[]});
const file=(id='one')=>({id,projectId:'p',category:'contracts',recordId:'c',mime:'image/jpeg',name:id+'.jpg'});
test('signature files, replacement, finance handoff and reasoned withdrawal follow real state',()=>{
  let c=base();assert.equal(transition(c,'send_finance',actor).ok,false);
  c=transition(c,'save_signed',actor,{files:[file()],at:10}).contract;
  assert.equal(isContractSigned(c),true);assert.equal(c.handoffVersion,1);
  c=transition(c,'save_signed',actor,{files:[file('two')],at:20}).contract;
  assert.equal(c.approvalHistory.at(-1).action,'replace_signed');
  c=transition(c,'send_finance',actor,{at:30}).contract;
  assert.equal(isContractInFinance(c),true);assert.equal(c.accountingPackage.contract.title,'قرارداد');
  assert.equal(transition(c,'save_signed',actor,{files:[]}).ok,false);
  assert.equal(transition(c,'withdraw_finance',actor,{reason:'کم'}).ok,false);
  const frozen=JSON.stringify(c.accountingPackage);
  c=transition(c,'withdraw_finance',actor,{reason:'اصلاح تصویر',at:40}).contract;
  assert.equal(isContractInFinance(c),false);assert.equal(JSON.stringify(c.accountingPackage),frozen);
  c=transition(c,'save_signed',actor,{files:[],at:50}).contract;
  assert.equal(isContractSigned(c),false);assert.equal(c.approvalHistory.at(-1).action,'remove_signed');
  assert.ok(c.approvalHistory.every(e=>e.actor.id==='member'));
});
test('only final approved contracts accept signature files, with strict document references',()=>{
  for(const extra of [{status:'draft'},{isDraft:true},{approvalStatus:'pending'},{approvalStatus:'unapproved'},{trashed:true}])assert.equal(transition({...base(),...extra},'save_signed',actor,{files:[file()]}).ok,false);
  for(const files of [[{...file(),category:'contacts'}],[{...file(),recordId:'other'}],[{...file(),mime:'application/zip'}],[file(),file()]])assert.equal(transition(base(),'save_signed',actor,{files}).ok,false);
  assert.equal(transition(base(),'save_signed',{id:'guest'},{files:[file()]}).ok,false);
  assert.equal(transition(base(),'save_signed',actor,{files:[{...file(),mime:'application/pdf'}]}).ok,true);
});
test('old workspace snapshots cannot erase signatures, forge finance state or delete an executed contract',()=>{
  const signed=transition(base(),'save_signed',actor,{files:[file()],at:10}).contract;
  const sent=transition(signed,'send_finance',actor,{at:20}).contract;
  const previous={contracts:[sent]};
  for(const contracts of [[],[{...base(),title:'changed'}],[{...sent,signedFiles:[],accountingStatus:'withdrawn'}]])assert.deepEqual(preserveContractHandoff({contracts},previous).contracts,[sent]);
  const forged=preserveContractHandoff({contracts:[{...base(),signedAt:4,signedFiles:[file()],accountingStatus:'sent',approvalHistory:[{action:'send_finance',actor}]}]},{contracts:[base()]}).contracts[0];
  assert.equal(forged.signedAt,undefined);assert.equal(forged.accountingStatus,undefined);assert.deepEqual(forged.approvalHistory,[]);
});
