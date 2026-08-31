import {test,expect} from '@playwright/test';

const project={id:'history-matrix-project',name:'History matrix',tasks:[],contacts:[],activityTemplates:[],contractTemplates:[],contracts:[],statusForms:[],trashed:false,archived:false};

test.beforeEach(async({page})=>{
  await page.addInitScript(seed=>{
    localStorage.clear();
    localStorage.setItem('ptnext-v1:app-data',JSON.stringify({schemaVersion:4,projects:[seed],activeTab:seed.id,viewMode:'simple',starredOrder:[]}));
  },project);
  await page.goto('/index.html#/projects/history-matrix-project/dashboard');
  await page.waitForFunction(()=>Boolean(window.KarhaLegacy&&window.KarhaApp&&window.KarhaBrowserHistory));
});

test('route Back/Forward and application Back share browser session history',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#bottomReportsBtn').click();
  await expect(page).toHaveURL(/\/reports$/);
  await page.locator('#bottomSettingsBtn').click();
  await expect(page).toHaveURL(/\/people$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/reports$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/reports$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/people$/);

  await page.locator('#closeSettingsPage').click();
  await expect(page).toHaveURL(/\/reports$/);
  expect(errors).toEqual([]);
});

test('rapid legitimate Back Forward Back dispatches one logical route each time',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#bottomReportsBtn').click();
  await page.locator('#bottomAccountingBtn').click();
  await page.goBack();
  await page.goForward();
  await page.goBack();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(page.locator('#bottomReportsBtn')).toHaveClass(/\bactive\b/);
  expect(errors).toEqual([]);
});

test('refresh preserves a canonical restorable route entry',async({page})=>{
  await page.locator('#bottomReportsBtn').click();
  await page.reload();
  await page.waitForFunction(()=>Boolean(window.KarhaBrowserHistory));
  const state=await page.evaluate(()=>history.state);
  expect(state).toMatchObject({app:'karha',version:1,route:{projectId:project.id,moduleId:'reports'}});
});
