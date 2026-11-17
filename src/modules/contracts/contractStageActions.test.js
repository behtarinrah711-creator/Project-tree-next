import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hash:'',search:''}};
const {openStatementAction}=await import('./contractStatementsView.js');
const {openContractHistory}=await import('./contractHistoryView.js');
const make=tag=>({tag,className:'',dataset:{},children:[],append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);},setAttribute(){},classList:{add(){}}});
const nodes=node=>[node,...node.children.flatMap(nodes)];

test('statement stage sheets contain only the matching action and reject other stages',()=>{
 const previous=[globalThis.document,globalThis.window];
 globalThis.document={createElement:make};globalThis.window={location:{hash:'',search:''}};
 const project={id:'p'},contract={id:'c'};
 let opened;
 const openSheet=options=>{const root=make('div');options.body(root);opened={options,root};};
 const draft={id:'s',statementType:'interim',status:'draft',isDraft:true};
 try{
   openStatementAction(project,contract,draft,()=>{},{step:{id:'completed'},openSheet});
   assert.deepEqual(opened.root.children.map(n=>n.textContent),['ویرایش و تکمیل صورت‌وضعیت']);
   assert.ok(!nodes(opened.root).some(n=>['contract-progress','contract-history','contract-financial-table'].includes(n.className)));
   opened=null;
   for(const id of ['created','signed','finance'])openStatementAction(project,contract,draft,()=>{},{step:{id},openSheet});
   assert.equal(opened,null);
   window.KarhaSaosaWorkspaceAccess={p:{role:'member',permissions:{modules:{contracts:'view',accounting:'full'}}}};
   openStatementAction(project,contract,draft,()=>{},{openSheet});
   assert.equal(nodes(opened.root).filter(n=>n.tag==='button').length,0);
 }finally{[globalThis.document,globalThis.window]=previous;}
});

test('history sheets show only an expanded history for the chosen document',()=>{
 const record={id:'a',parentContractId:'c',approvalHistory:[{action:'reject',at:100,reason:'پیوست ناقص',actor:{name:'مسئول تأیید'}}]};
 const root=make('div');let options;
 openContractHistory(record,{documentRef:{createElement:make},openSheet:value=>{options=value;value.body(root);}});
 assert.equal(options.title,'تاریخچه');
 assert.deepEqual(root.children.map(n=>n.className),['contract-history']);
 assert.equal(root.children[0].open,true);
 assert.ok(nodes(root).some(n=>n.textContent==='پیوست ناقص'));
 assert.ok(!nodes(root).some(n=>n.tag==='button'||n.className==='contract-progress'));
});
