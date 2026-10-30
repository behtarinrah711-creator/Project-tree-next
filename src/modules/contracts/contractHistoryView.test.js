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
