import test from 'node:test';
import assert from 'node:assert/strict';
import { projectProvinces, projectCities, PROJECT_TYPES, projectDetailsDraft, updateProjectDetails } from './projectDetailsDomain.js';
import { createAppDataStore } from '../../data/appDataStore.js';
import { docToProjectFromCloud } from '../../sync/docToProject.js';

const fars = projectProvinces().find(item => item.name === 'فارس');
const shiraz = projectCities(fars.id).find(item => item.name === 'شیراز');
const project = { id:'p1', name:'قدیمی', contractProjectCode:'A7B', contractOwnerCode:'Z9C', tasks:[{ id:'w1' }], contacts:[{ id:'c1', name:'کارفرما' }], settings:{ stageMode:'multiple' } };

test('location options include 31 provinces sorted in Persian and cities scoped to their province', () => {
  const provinces = projectProvinces();
  assert.equal(provinces.length, 31);
  assert.deepEqual(provinces, [...provinces].sort((a,b) => a.name.localeCompare(b.name,'fa')));
  assert.ok(shiraz);
  assert.ok(projectCities(fars.id).every(city => city.provinceId === fars.id));
  assert.deepEqual(projectCities('missing'), []);
  assert.equal(PROJECT_TYPES.length, 10);
});

test('saving project details preserves contract identity, tasks and unrelated settings and survives cloud metadata hydration', () => {
  const draft = { ...projectDetailsDraft(project), name:' نام جدید ', provinceId:fars.id, cityId:shiraz.id,
    projectType:'ساختمان و ابنیه', currency:'افغانی', employerId:'c1', startDate:'1405/08/07', address:' آدرس ', description:' توضیح ' };
  const saved = updateProjectDetails(project, draft);
  assert.equal(saved.name, 'نام جدید');
  assert.equal(saved.contractProjectCode, 'A7B');
  assert.equal(saved.contractOwnerCode, 'Z9C');
  assert.equal(saved.tasks, project.tasks);
  assert.equal(saved.settings.stageMode, 'multiple');
  assert.equal(saved.settings.projectDetails.address, 'آدرس');
  const hydrated = docToProjectFromCloud({ id:'p1', data:() => saved }, null, { appDataStore:createAppDataStore({storage:null}) });
  assert.deepEqual(projectDetailsDraft(hydrated), { ...draft, name:'نام جدید', address:'آدرس', description:'توضیح' });
  assert.equal(project.name, 'قدیمی');
});

test('rejects wrong province/city pairing, missing employers, invalid currency and blank name', () => {
  const draft = projectDetailsDraft(project);
  assert.throws(() => updateProjectDetails(project, { ...draft, cityId:shiraz.id }), /شهر/);
  assert.throws(() => updateProjectDetails(project, { ...draft, employerId:'missing' }), /کارفرما/);
  assert.throws(() => updateProjectDetails(project, { ...draft, currency:'دلار' }), /ارزی/);
  assert.throws(() => updateProjectDetails(project, { ...draft, name:' ' }), /نام پروژه/);
});
