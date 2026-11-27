import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimelineRows, sortTimelineRows } from './timelineRows.js';
import { actualProgress, plannedProgressOf, jalaliDayNumber } from '../../domain/wbs/scheduling.js';
import { ganttLevelOptions, setGanttLevelVisible } from './timelineViewOptions.js';

const task = (id, progress=0) => ({id, title:id, weight:1, progress, scheduleStart:'1405/06/20', scheduleEnd:'1405/06/25'});
test('direct tasks under stage and legacy grouping nodes have identical row order and ranges', () => {
  for(const kind of ['stage','work']){
    const parent={id:'parent',kind,text:'parent',subtasks:[],workTasks:[task('first',20),task('second',60),{...task('deleted'),trashed:true}]};
    const rows=buildTimelineRows([parent],'p',{expanded:()=>true,orderMode:'wbs'});
    assert.deepEqual(rows.map(row=>row.item.id),['parent','first','second']);
    assert.deepEqual(rows.map(row=>row.sourceDepth),[0,1,1]);
    assert.deepEqual(rows.map(row=>row.depth),[0,1,1]);
    assert.equal(rows[1].item.kind,'workTask');
    assert.equal(rows[1].item.parentWork,parent);
    assert.equal(rows[0].range.start,rows[1].range.start);
    assert.equal(rows[0].range.end,rows[2].range.end);
    assert.equal(actualProgress(parent),40);
    assert.equal(plannedProgressOf(parent,jalaliDayNumber('1405/06/20')),0);
  }
});
test('mixed branches include child stages and direct tasks without misaligning details', () => {
  const tree=[{id:'root',kind:'stage',subtasks:[{id:'child',kind:'stage',subtasks:[],workTasks:[task('nested')]}],workTasks:[task('direct')]}];
  const rows=buildTimelineRows(tree,'p',{expanded:()=>true,orderMode:'wbs'});
  assert.deepEqual(rows.map(row=>row.item.id),['root','child','nested','direct']);
  assert.deepEqual(rows.map(row=>row.sourceDepth),[0,1,2,1]);
});
test('hiding grouping levels reveals descendants while preserving source depth', () => {
  const tree=[{id:'root',kind:'stage',subtasks:[{id:'child',kind:'work',subtasks:[],workTasks:[task('leaf')]}]}];
  const rows=buildTimelineRows(tree,'p',{expanded:()=>false,visible:entry=>entry.kind==='workTask'});
  assert.deepEqual(rows.map(row=>row.item.id),['leaf']);
  assert.equal(rows[0].depth,0);
  assert.equal(rows[0].sourceDepth,2);
  assert.deepEqual(ganttLevelOptions(tree).map(option=>option.label),['مرحله ۱','مرحله ۲','کارها','زیرکارها']);
});
test('collapsed stages suppress active task rows until Expand opens them', () => {
  const tree=[{id:'root',kind:'stage',workTasks:[task('leaf')],subtasks:[]}];
  assert.deepEqual(buildTimelineRows(tree,'p',{expanded:()=>false}).map(row=>row.item.id),['root']);
});
test('date order sorts by start then end while leaving unscheduled rows last', () => {
  const rows = [
    {item:{id:'late'},range:{start:30,end:35}},
    {item:{id:'none'},range:null},
    {item:{id:'long'},range:{start:10,end:20}},
    {item:{id:'short'},range:{start:10,end:12}},
  ];
  assert.deepEqual(sortTimelineRows(rows, 'date').map(row => row.item.id), ['short','long','late','none']);
  assert.deepEqual(sortTimelineRows(rows, 'wbs').map(row => row.item.id), ['late','none','long','short']);
});
test('date order is the default timeline row mode', () => {
  const tree=[
    {id:'late',kind:'stage',scheduleStart:'1405/07/01',scheduleEnd:'1405/07/02',subtasks:[]},
    {id:'early',kind:'stage',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/02',subtasks:[]},
  ];
  assert.deepEqual(buildTimelineRows(tree,'p',{expanded:()=>true}).map(row=>row.item.id),['early','late']);
});

test('selected levels are globally date ordered in single- and multi-stage trees', () => {
  for(const nested of [false,true]){
    const work={...task('work'),scheduleStart:'1405/07/01',scheduleEnd:'1405/07/02'};
    const early={...task('subwork'),parentTaskId:'work',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/02'};
    const leaf={id:'leaf',kind:'stage',workTasks:[{...work,id:'later'},work,{...task('undated'),scheduleStart:null,scheduleEnd:null},early]};
    const tree=nested?[{id:'root',kind:'stage',subtasks:[leaf]}]:[leaf];
    const ids=orderMode=>buildTimelineRows(tree,'p',{expanded:()=>true,orderMode}).map(row=>row.item.id);
    const stages=nested?['root','leaf']:['leaf'];
    assert.deepEqual(ids('wbs'),[...stages,'later','work','subwork','undated']);
    const dateIds=ids('date');
    assert.ok(dateIds.indexOf('subwork')<dateIds.indexOf('later'));
    assert.equal(dateIds.at(-1),'undated');
    setGanttLevelVisible('subwork',false);
    try{assert.deepEqual(ids('date'),dateIds.filter(id=>id!=='subwork'));}
    finally{setGanttLevelVisible('subwork',true);}
    setGanttLevelVisible('workTask',false);
    try{assert.ok(ids('date').includes('subwork'));assert.ok(!ids('date').includes('work'));}
    finally{setGanttLevelVisible('workTask',true);}
  }
});

test('WBS filters reach selected descendants even if unrelated ancestors are collapsed',()=>{
  const tree=[{id:'parent',subtasks:[{id:'selected',workTasks:[
    {id:'task',title:'Selected task'},
    {id:'child',parentTaskId:'task',title:'Selected subtask'},
    {id:'other-task',title:'Other task'},
  ]},{id:'other'}]}];
  const options={orderMode:'wbs',visible:()=>true,expanded:id=>id!=='parent'};
  const ids=branchKeys=>buildTimelineRows(tree,'p',{...options,branchKeys}).map(row=>row.item.id);
  assert.deepEqual(ids(new Set(['branch:selected','task:selected:task','task:selected:child','task:selected:other-task'])),
    ['selected','task','child','other-task']);
  assert.deepEqual(ids(new Set(['task:selected:task','task:selected:child'])),['task','child']);
  assert.deepEqual(ids(),['parent']);
});
