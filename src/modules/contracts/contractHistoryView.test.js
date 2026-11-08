import test from 'node:test';
import assert from 'node:assert/strict';
import {renderContractHistory} from './contractHistoryView.js';
const documentRef={createElement(tag){return {tag,children:[],appendChild(child){this.children.push(child);}};}};
test('contract history is a native disclosure with newest events, author and safe reason text',()=>{
 const events=[{action:'approve',at:1,actor:{name:'مدیر'}},{action:'revoke',at:2,actor:{name:'کارفرما'},reason:'<script>اصلاح مبلغ</script>'}];
 const view=renderContractHistory(documentRef,{approvalHistory:events});
 assert.equal(view.tag,'details');assert.equal(view.open,undefined);
 assert.equal(view.children[0].tag,'summary');assert.equal(view.children[0].textContent,'تاریخچه');
 assert.match(view.children[1].children[0].textContent,/تأیید لغو شد · کارفرما/);
 assert.equal(view.children[1].children[1].textContent,events[1].reason);
 assert.match(view.children[2].children[0].textContent,/تأیید شد · مدیر/);
 assert.equal(events[0].at,1);
 let stopped=false;view.onclick({stopPropagation(){stopped=true;}});assert.equal(stopped,true);
});
test('history supports absent history and legacy entries without names or valid times',()=>{
 const empty=renderContractHistory(documentRef,{});
 assert.equal(empty.children[1].textContent,'هنوز رویدادی ثبت نشده است.');
 const view=renderContractHistory(documentRef,{approvalHistory:[{action:'reject',at:'invalid',reason:'اصلاح لازم است'}]});
 assert.match(view.children[1].children[0].textContent,/کاربر · زمان نامشخص/);
 assert.equal(view.children[1].children[1].textContent,'اصلاح لازم است');
});


test('creation event appears with its creator and date alongside approval events',()=>{
 const view=renderContractHistory(documentRef,{creationEvent:{action:'create',at:100,actor:{name:'مهندس احمدی'}},approvalHistory:[{action:'submit',at:200,actor:{name:'مدیر'}}]});
 assert.match(view.children[1].children[0].textContent,/برای تأیید ارسال شد/);
 assert.match(view.children[2].children[0].textContent,/ایجاد شد · مهندس احمدی/);
 assert.ok(!view.children[2].children[0].textContent.includes('زمان نامشخص'));
});


test('legacy addendum history shows its own known times and financial decisions only',()=>{
 const addendum={parentContractId:'parent',createdAt:100,completedAt:200,completedBy:'legacy-id',
  parentDocument:{creationEvent:{action:'create',at:1,actor:{name:'سازنده قرارداد'}}},
  approvalHistory:[{action:'approve_finance',at:300,actor:{name:'واحد مالی'}}]};
 const view=renderContractHistory(documentRef,addendum);
 assert.equal(view.children.length,4);
 assert.match(view.children[1].children[0].textContent,/توسط بخش مالی تأیید شد · واحد مالی/);
 assert.match(view.children[2].children[0].textContent,/تکمیل الحاقیه اعلام شد · نام ثبت نشده/);
 assert.match(view.children[3].children[0].textContent,/ایجاد شد · نام ثبت نشده/);
 const financial=renderContractHistory(documentRef,addendum,{finance:true});
 assert.equal(financial.children.length,2);
});
