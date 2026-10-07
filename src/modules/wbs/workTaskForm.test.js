import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./workTaskView.js',import.meta.url),'utf8');

test('work form uses Saosa sheets, pickers and numpad without progress submission controls',()=>{
  assert.match(source,/presentation:'stage-create'/);
  assert.match(source,/optionButton\(\{name:'taskType'/);
  assert.match(source,/optionButton\(\{name:'taskPriority'/);
  assert.doesNotMatch(source,/taskRequiresApproval/);
  assert.match(source,/بدون مسئول تأیید/);
  assert.match(source,/numericButton\('taskWeight'/);
  assert.match(source,/numericButton\('taskAmount'/);
  assert.doesNotMatch(source,/taskProgress/);
  assert.doesNotMatch(source,/ارسال برای تأیید/);
});
