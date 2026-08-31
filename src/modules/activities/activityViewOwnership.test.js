import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Contact and Activity presentation have one modular owner',async()=>{
  const [legacy,people,contactForm,activities,activityForm,taskView]=await Promise.all([
    readFile(new URL('../runtime/featureComposition.js',import.meta.url),'utf8'),
    readFile(new URL('../people/peopleModule.js',import.meta.url),'utf8'),
    readFile(new URL('../people/contactFormModule.js',import.meta.url),'utf8'),
    readFile(new URL('./activitiesModule.js',import.meta.url),'utf8'),
    readFile(new URL('./activityFormModule.js',import.meta.url),'utf8'),
    readFile(new URL('../tasks/taskView.js',import.meta.url),'utf8'),
  ]);

  assert.doesNotMatch(legacy,/function renderItemActivities\(/);
  assert.doesNotMatch(legacy,/className='contact-row'/);
  assert.doesNotMatch(legacy,/className='activity-row'/);
  assert.match(people,/contactApi\.listPage/);
  assert.match(contactForm,/contactApi\.save/);
  assert.match(activities,/activityApi\.listPage/);
  assert.match(activityForm,/activityApi\.save/);
  assert.match(taskView,/renderTaskActivities/);
  assert.match(taskView,/runtime\.updateSubtask\(pid,tid,sid,\{activities\}\)/);
  assert.match(taskView,/runtime\.update\(pid,tid,\{activities\}\)/);
});

test('legacy retains only history-sensitive Contact and Activity navigation delegates',async()=>{
  const legacy=await readFile(new URL('../runtime/featureComposition.js',import.meta.url),'utf8');
  assert.match(legacy,/function openContactsPage\(\).*workspaceSubpage='contacts'/);
  assert.match(legacy,/function renderContactsPage\(\)[\s\S]*?modules\?\.get\('people'\)/);
  assert.match(legacy,/function openProjectActivitiesPage\(\)[\s\S]*?workspaceSubpage='activities'/);
  assert.match(legacy,/function renderProjectActivitiesPage\(\)[\s\S]*?modules\?\.get\('activities'\)/);
});

