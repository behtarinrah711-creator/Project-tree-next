import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./workTaskView.js',import.meta.url),'utf8');

test('work form uses Saosa sheets, pickers and numpad without progress submission controls',()=>{
  assert.match(source,/presentation:'stage-create'/);
  assert.match(source,/historyKey:`wbs-work-task:/);
  assert.match(source,/optionButton\(\{name:'taskType'/);
  assert.match(source,/optionButton\(\{name:'taskPriority'/);
  assert.doesNotMatch(source,/taskRequiresApproval/);
  assert.match(source,/بدون مسئول تأیید/);
  assert.match(source,/const COUNTERPARTY_LABELS/);
  assert.match(source,/'پیمانکار':'پیمانکار'/);
  assert.match(source,/'خرید':'فروشنده'/);
  assert.match(source,/'نیروی کار':'شخص'/);
  assert.match(source,/'حمل و نقل':'راننده'/);
  assert.match(source,/'خدمات':'ارائه‌دهنده'/);
  assert.match(source,/'ماشین آلات':'شخص'/);
  assert.doesNotMatch(source,/'پیگیری':'/);
  assert.match(source,/contextKey:`wbs-task-counterparty:/);
  assert.match(source,/counterpartyContactId:root\.querySelector/);
  assert.match(source,/contextKey:`wbs-task-activity:/);
  assert.match(source,/activityId:root\.querySelector\('\[name="taskActivity"\]'\)/);
  assert.match(source,/فعالیت منتخب/);
  assert.match(source,/hasLaborPayroll:/);
  assert.match(source,/numericButton\('taskWeight'/);
  assert.match(source,/numericButton\('taskAmount'/);
  assert.doesNotMatch(source,/taskProgress/);
  assert.doesNotMatch(source,/ارسال برای تأیید/);
});
