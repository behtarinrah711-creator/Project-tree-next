import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {approvalNavigationRow,pendingApprovals}=await import('./pendingApprovals.js');

const actor={uid:'user',phoneNumber:'0912'};
const windowFor=modules=>({firebase:{auth:()=>({currentUser:actor})},KarhaSaosaWorkspaceAccess:{p:{role:'member',permissions:{modules}}}});
const record={status:'final',approvalStatus:'pending',approvalContactIds:['me','other'],approvedContactIds:[]};
const project={
  id:'p',contacts:[{id:'me',phones:['0912']}],
  contracts:[{...record,id:'contract'},{...record,id:'already',approvedContactIds:['me']}],
  contractAddenda:[{...record,id:'addendum',parentContractId:'contract'}],
  tasks:[{id:'work',kind:'work',workTasks:[
    {id:'buy',type:'خرید',approvalContactId:'me',completionState:'pending_approval'},
    {id:'exec',type:'اجرا',approvalContactId:'me',completionState:'pending_approval'},
    {id:'other',type:'اجرا',approvalContactId:'other',completionState:'pending_approval'},
  ]}],
};

test('the inbox counts only the current reviewer’s pending items in each separate category',()=>{
  const {assigned,groups,count}=pendingApprovals(project,windowFor({contracts:'view','execution:shopping':'full','execution:today':'create'}));
  assert.equal(assigned,true);
  assert.equal(count,4);
  assert.equal(groups[0].title,'قراردادها و الحاقیه‌ها');
  assert.deepEqual(groups.map(group=>[group.id,group.writable,group.items.map(item=>item.id)]),[
    ['addenda',false,['contract','addendum']],['shopping',true,['buy']],['execution',true,['exec']],
  ]);
  const restricted=pendingApprovals(project,windowFor({contracts:'none','execution:today':'full'}));
  assert.deepEqual(restricted.groups.map(group=>group.items.length),[0,0,1]);
  assert.equal(pendingApprovals(project,windowFor({})).assigned,false);
  assert.equal(pendingApprovals({...project,contacts:[]},windowFor({contracts:'full'})).assigned,false);
});

test('an approval navigation row shows its title, count and arrow and opens its category',()=>{
  const make=tag=>({tag,children:[],append(...children){this.children.push(...children);},setAttribute(){}});
  let opened=false;
  const row=approvalNavigationRow({createElement:make},'خریدها',1,()=>{opened=true;});
  const empty=approvalNavigationRow({createElement:make},'اجرا',0,()=>{}).children[1].children[0];
  assert.equal(empty.textContent,'۰');
  assert.equal(empty.className,'approval-option-count is-zero');
  assert.equal(row.children[0].children[0].textContent,'خریدها');
  assert.equal(row.children[1].children[0].textContent,'۱');
  assert.equal(row.children[1].children[0].className,'approval-option-count');
  assert.match(row.children[1].children[1].innerHTML,/<svg/);
  row.onclick();
  assert.equal(opened,true);
});
