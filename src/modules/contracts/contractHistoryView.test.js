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

test('compact history keeps event, actor and Persian date/time in separate rows',()=>{
 const event={action:'approve',at:Date.UTC(2026,10,17,13,46),actor:{name:'سروش یوسفی'},reason:'<script>توضیح</script>'};
 const view=renderContractHistory(documentRef,{approvalHistory:[event]},{compact:true});
 const row=view.children[1],heading=row.children[0];
 assert.equal(row.className,'contract-history-entry');
 assert.deepEqual(heading.children.slice(0,2).map(node=>node.textContent),['تأیید شد','سروش یوسفی']);
 assert.equal(heading.children[0].className,'contract-history-event');
 assert.equal(heading.children[1].className,'contract-history-actor');
 const [date,time]=heading.children[2].children;
 assert.match(date.textContent,/[۰-۹]/);assert.match(time.textContent,/^[۰-۹]{2}:[۰-۹]{2}$/);
 assert.equal(time.dir,'ltr');
 assert.equal(row.children[1].textContent,event.reason);
 const legacy=renderContractHistory(documentRef,{approvalHistory:[{action:'create',at:'invalid'}]},{compact:true});
 assert.equal(legacy.children[1].children[0].children[1].textContent,'کاربر');
 assert.equal(legacy.children[1].children[0].children[2].children[0].textContent,'زمان نامشخص');
});

test('advance stage history isolates the creation and rejection events and formats a single payment',()=>{
 const record={statementType:'advance',createdAt:100,createdBy:{name:'ثبت‌کننده'},approvalHistory:[
   {action:'submit',at:200,actor:{name:'ارسال‌کننده'}},
   {action:'reject_finance',at:300,actor:{name:'مالی'},reason:'مدرک ناقص بود'},
 ]};
 const created=renderContractHistory(documentRef,record,{compact:true,actions:['create']});
 assert.equal(created.children.length,2);
 assert.deepEqual(created.children[1].children[0].children.slice(0,2).map(node=>node.textContent),['درخواست پیش‌پرداخت ثبت شد','ثبت‌کننده']);
 const rejected=renderContractHistory(documentRef,record,{compact:true,actions:['reject_finance']});
 assert.equal(rejected.children.length,2);
 assert.equal(rejected.children[1].className,'contract-history-entry is-rejected');
 assert.equal(rejected.children[1].children[1].textContent,'مدرک ناقص بود');
 const payment=renderContractHistory(documentRef,record,{compact:true,payment:{at:400,actor:{name:'حسابدار'},amount:12000}});
 assert.equal(payment.children.length,2);
 assert.equal(payment.children[1].children[0].children[1].textContent,'حسابدار');
 assert.equal(payment.children[1].children[1].textContent,'۱۲٬۰۰۰ تومان');
});
