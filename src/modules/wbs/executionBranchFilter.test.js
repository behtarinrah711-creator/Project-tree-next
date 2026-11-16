import test from 'node:test';
import assert from 'node:assert/strict';
import {executionFilterTree,searchExecutionBranches} from './executionBranchFilter.js';
import {executionWorkKey} from '../../domain/wbs/todayDomain.js';

test('execution branch selection contains only its descendant cards and search shows their paths',()=>{
  const tree=executionFilterTree({tasks:[
    {id:'suite',kind:'stage',text:'سوئیت نگهبانی',subtasks:[
      {id:'foundation',kind:'work',text:'فونداسیون',workTasks:[{id:'paint',title:'نقاشی'}]},
      {id:'removed',kind:'work',text:'حذف شده',trashed:true},
    ]},
    {id:'other',kind:'work',text:'نقاشی'},
  ]},'1405/08/25');
  const [suite,other]=tree.children;
  assert.deepEqual(suite.keys,[executionWorkKey({kind:'task',workId:'foundation',id:'paint'})]);
  assert.equal(other.keys.length,1);
  assert.deepEqual(searchExecutionBranches(tree,'نگهبانی نقاشي').map(result=>result.path),[
    ['سوئیت نگهبانی','فونداسیون','نقاشی'],
  ]);
});
