import { test, expect } from '@playwright/test';

test('project settings persist and switch the phase add flow without changing existing items', async ({ page }) => {
  await page.addInitScript(() => {
    if(localStorage.getItem('project-settings-seeded')) return;
    localStorage.setItem('project-settings-seeded','1');
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({schemaVersion:8,activeTab:'branching',viewMode:'simple',starredOrder:[],projects:[
      {id:'branching',name:'تنظیمات تست',tasks:[{id:'package',kind:'stage',text:'بسته تست',progressWeight:1,subtasks:[
        {id:'phase',kind:'stage',text:'مرحله تست',progressWeight:1,subtasks:[]}
      ]},{id:'empty-package',kind:'stage',text:'بسته خالی',progressWeight:1,subtasks:[]}]},
      {id:'other',name:'پروژه دیگر',tasks:[]}
    ]}));
  });
  await page.goto('/index.html#/projects/branching/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaApp && window.KarhaLegacy));
  await page.locator('.wbs-row.is-stage', {hasText:'بسته خالی'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toHaveText('افزودن کار');
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('.wbs-tree-toggle').click();
  await page.locator('.wbs-row.is-stage', {hasText:'مرحله تست'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toHaveText('افزودن کار');
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('#bottomSettingsBtn').click();
  await page.getByRole('button',{name:'تنظیمات پروژه',exact:false}).click();
  await expect(page.locator('#projectSettingsPage')).toBeVisible();
  const none=page.getByRole('radio',{name:'بدون مرحله',exact:true});
  const single=page.getByRole('radio',{name:'یک مرحله‌ای',exact:true});
  const multiple=page.getByRole('radio',{name:'بیش از یک مرحله',exact:true});
  await expect(none).toBeChecked();
  await single.check();
  await page.reload();
  await expect(single).toBeChecked();
  await expect(none).not.toBeChecked();
  await page.locator('#bottomProjectsBtn').click();
  await page.locator('.wbs-row.is-stage', {hasText:'بسته خالی'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toHaveText('افزودن مرحله');
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('#bottomSettingsBtn').click();
  await page.getByRole('button',{name:'تنظیمات پروژه',exact:false}).click();
  await multiple.check();
  await page.reload();
  await expect(multiple).toBeChecked();
  await expect(single).not.toBeChecked();
  await expect(page.locator('#topbar')).toBeVisible();
  await page.locator('#closeProjectSettingsPage').click();
  await expect(page.locator('#settingsPage')).toBeVisible();
  await page.locator('#bottomProjectsBtn').click();
  await page.locator('.wbs-tree-toggle').click();
  await page.locator('.wbs-row.is-stage', {hasText:'مرحله تست'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(2);
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('#bottomSettingsBtn').click();
  await page.getByRole('button',{name:'تنظیمات پروژه',exact:false}).click();
  await none.check();
  await page.reload();
  await expect(none).toBeChecked();
  await expect(multiple).not.toBeChecked();
  const data=await page.evaluate(() => window.KarhaAppData.getProjects());
  expect(data.find(p=>p.id==='other').settings?.stageMode).toBeUndefined();
  expect(data.find(p=>p.id==='branching').tasks[0].subtasks[0].id).toBe('phase');
});
