import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {projectRepository}=await import('../../data/projectRepository.js');
const {approvalNavigationRow,pendingApprovals,renderPendingApprovals}=await import('./pendingApprovals.js');

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

test('the approval inbox renders the original cards with only review controls',()=>{
  class Element {
    constructor(tag){
      this.tag=tag;this.children=[];this.dataset={};this.className='';this.ownerDocument=documentRef;
      this.classList={add:className=>{this.className+=' '+className;}};
    }
    append(...children){this.children.push(...children);}
    appendChild(child){this.append(child);}
    replaceChildren(...children){this.children=children;}
    setAttribute(){}
    addEventListener(){}
    querySelector(selector){
      if(selector==='.today-task-primary' && this.innerHTML?.includes('today-task-primary')){
        const primary=new Element('div');
        primary.className='today-task-primary';
        this.append(primary);
        return primary;
      }
      return null;
    }
    nodes(){return [this,...this.children.flatMap(child=>child.nodes())];}
  }
  const documentRef={createElement:tag=>new Element(tag)};
  const old=[globalThis.window,globalThis.document,globalThis.Node,projectRepository.find];
  globalThis.window={...old[0],...windowFor({contracts:'create','execution:today':'create','execution:shopping':'create'})};
  globalThis.document=documentRef;
  globalThis.Node=Element;
  projectRepository.find=()=>project;
  const body=documentRef.createElement('div');
  try{
    renderPendingApprovals(body,'p','approvals-addenda',()=>{});
    const contracts=body.children[1].children;
    assert.equal(contracts.length,2);
    for(const card of contracts){
      assert.equal(card.className,'contract-row');
      assert.ok(card.nodes().some(node=>node.className==='contract-card-heading'));
      assert.ok(card.nodes().some(node=>node.className==='contract-progress'));
      assert.deepEqual(card.nodes().filter(node=>node.tag==='button').map(node=>node.textContent),['مشاهده سند','تأیید']);
    }
    assert.match(contracts[1].nodes().find(node=>node.className==='contract-title').textContent,/^الحاقیه /);
    for(const [group,css,label] of [
      ['execution','wbs-costline-work','تأیید'],
      ['shopping','shopping-item-card','تأیید خرید'],
    ]){
      renderPendingApprovals(body,'p','approvals-'+group,()=>{});
      const card=body.children[1].children[0];
      assert.ok(card.className.split(' ').includes(css));
      const buttons=card.nodes().filter(node=>node.tag==='button');
      assert.deepEqual(buttons.map(node=>node.textContent),[undefined,label]);
      assert.equal(buttons[0].disabled,true);
    }
    window.KarhaSaosaWorkspaceAccess.p.permissions.modules.contracts='view';
    renderPendingApprovals(body,'p','approvals-addenda',()=>{});
    assert.deepEqual(body.children[1].nodes().filter(node=>node.tag==='button').map(node=>node.textContent),
      ['مشاهده سند','مشاهده سند']);
  }finally{
    [globalThis.window,globalThis.document,globalThis.Node,projectRepository.find]=old;
  }
});
