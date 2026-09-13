import test from 'node:test';
import assert from 'node:assert/strict';
import { stageCreationPlaceholder } from './stagePresentation.js';

const tasks = [{id:'one',subtasks:[{id:'two',subtasks:[{id:'three',subtasks:[{id:'four',subtasks:[{id:'five',subtasks:[]}]}]}]}]}];
test('creation examples follow the chosen hierarchy and its actual parent depth', () => {
  const cases = {
    base:['گچ کاری'],
    none:['تاسیسات الکتریکی','برق کشی'],
    single:['بلوک شماره ۱','تاسیسات الکتریکی','برق کشی'],
    multiple:['مجتمع شماره ۱','بلوک شماره ۱','تاسیسات الکتریکی','برق کشی'],
  };
  for(const [stageMode, names] of Object.entries(cases)){
    const project = {settings:{stageMode},tasks};
    names.forEach((name, depth) => assert.equal(
      stageCreationPlaceholder(project, [null,'one','two','three'][depth]), `مثال: ${name}`,
    ));
  }
  for(const parentId of ['four','five']) assert.equal(
    stageCreationPlaceholder({settings:{stageMode:'multiple'},tasks},parentId),
    'پیشنهاد می شود تعداد مراحل را کمتر کنید',
  );
});
