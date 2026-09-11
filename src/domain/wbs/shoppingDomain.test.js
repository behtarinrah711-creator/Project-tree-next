import test from 'node:test';
import assert from 'node:assert/strict';
import { collectShoppingItems, shoppingItemsForMode, shoppingStatusLabel } from './shoppingDomain.js';

const project={tasks:[{id:'stage',kind:'stage',text:'فونداسیون',subtasks:[
  {id:'leaf-buy',kind:'work',text:'خرید میلگرد',type:'خرید',scheduleStart:'1405/06/10',scheduleEnd:'1405/06/12',quantity:2,unitCost:100,workTasks:[]},
  {id:'leaf-work',kind:'work',text:'آرماتوربندی',type:'اجرا',scheduleStart:'1405/06/10',scheduleEnd:'1405/06/12',workTasks:[]},
  {id:'parent-buy',kind:'work',text:'تجهیزات',type:'خرید',workTasks:[
    {id:'task-buy',workId:'parent-buy',title:'خرید پمپ',type:'خرید',priority:'high',amount:300,scheduleStart:'1405/06/13',scheduleEnd:'1405/06/14'},
    {id:'task-install',workId:'parent-buy',title:'نصب پمپ',type:'اجرا',scheduleStart:'1405/06/15',scheduleEnd:'1405/06/16'},
  ]},
]}]};

test('shopping extracts only effective WBS purchase leaves without duplicating their Work',()=>{
  const items=collectShoppingItems(project,'1405/06/11');
  assert.deepEqual(items.map(item=>item.id),['leaf-buy','task-buy']);
  assert.equal(items[0].amount,200);assert.equal(items[1].amount,300);
  assert.deepEqual(items[1].path,['فونداسیون','تجهیزات']);
});

test('shopping groups by WBS dates and uses purchase-specific status labels',()=>{
  assert.deepEqual(shoppingItemsForMode(project,'today','1405/06/11').map(item=>item.id),['leaf-buy']);
  assert.deepEqual(shoppingItemsForMode(project,'future','1405/06/11').map(item=>item.id),['task-buy']);
  assert.equal(shoppingStatusLabel(project.tasks[0].subtasks[0]),'خرید شروع نشده');
});
