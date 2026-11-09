import test from 'node:test';
import assert from 'node:assert/strict';
import { jalaliDayNumber } from '../../domain/wbs/todayDomain.js';
import { collectDailyExecutionReports, executionWorkKey, filterDailyExecutionReports, renderDailyExecutionReports } from './dailyExecutionReportsView.js';

const project = { tasks:[{
  id:'stage', text:'نما', subtasks:[
    { id:'work', text:'جبهه جنوبی', workTasks:[
      { id:'stone', title:'اجرای سنگ نما', completed:true, executionReports:[
        { createdAt:Date.parse('2026-11-09T15:14:00Z'), description:'نصب ردیف ۱', progress:20 },
        { reportDay:'1405/08/19', createdAt:Date.parse('2026-11-09T20:31:00Z'), description:'نصب ردیف ۲', progress:40 },
        { reportDay:'1405/08/19', trashed:true },
      ], executionHistory:[
        { type:'start_delayed', day:'1405/08/17', reason:'تأمین نشدن مصالح', description:'سنگ نما نرسید', actor:{name:'مسئول'} },
        { type:'report_created' },
      ] },
    ] },
    { id:'other', text:'اجرای سنگ نما', executionReports:[{ reportDay:'1405/08/19', description:'کار دیگر' }] },
    { id:'trashed', trashed:true, executionReports:[{ reportDay:'1405/08/19' }] },
    { id:'purchase', type:'خرید', executionReports:[{ reportDay:'1405/08/19' }] },
  ],
}] };
const key = executionWorkKey({ kind:'task', workId:'work', id:'stone' });

test('daily reports use the Tehran day and retain progress and delay history for completed work',()=>{
  const rows = collectDailyExecutionReports(project);
  assert.equal(rows.length,4);
  const selected = filterDailyExecutionReports(rows,{work:key});
  assert.deepEqual(selected.map(row=>row.day),['1405/08/19','1405/08/18','1405/08/17']);
  assert.equal(selected[0].work.path,'نما ← جبهه جنوبی');
  assert.equal(selected[2].kind,'start_delayed');
  assert.equal(selected[2].description,'تأمین نشدن مصالح\nسنگ نما نرسید');
  const day = jalaliDayNumber('1405/08/19');
  assert.deepEqual(filterDailyExecutionReports(rows,{query:'نصب ردیف 2',firstDay:day,lastDay:day}),[selected[0]]);
  assert.deepEqual(filterDailyExecutionReports(rows,{query:'جبهه جنوبی',firstDay:day,lastDay:day}),[selected[0]]);
});

test('a card link opens complete report text for only that work across all dates',()=>{
  const createElement = tag=>({
    tag,children:[],listeners:{},value:'',
    append(...children){ this.children.push(...children); },
    appendChild(child){ this.append(child); },
    replaceChildren(){ this.children=[]; },
    setAttribute(){},
    addEventListener(event,handler){ this.listeners[event]=handler; },
  });
  const frame = renderDailyExecutionReports(project,{createElement},key);
  const [filters,work,totals,days] = frame.children;
  assert.equal(filters.children[2].value,'all');
  assert.equal(work.children[0].textContent,'اجرای سنگ نما');
  assert.equal(totals.textContent,'۲ گزارش پیشرفت · ۱ ثبت دلیل شروع نشدن');
  const cards = days.children.flatMap(day=>day.children.filter(child=>child.tag==='details'));
  assert.equal(cards.length,3);
  assert.ok(cards.every(card=>card.open));
  assert.deepEqual(cards.map(card=>card.children[1].textContent),
    ['نصب ردیف ۲','نصب ردیف ۱','تأمین نشدن مصالح\nسنگ نما نرسید']);
});
