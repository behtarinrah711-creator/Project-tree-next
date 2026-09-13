import { test, expect } from '@playwright/test';

test('project settings persist and switch the phase add flow without changing existing items', async ({ page }) => {
  await page.addInitScript(() => {
    if(localStorage.getItem('project-settings-seeded')) return;
    localStorage.setItem('project-settings-seeded','1');
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({schemaVersion:8,activeTab:'branching',viewMode:'simple',starredOrder:[],projects:[
      {id:'branching',name:'تنظیمات تست',tasks:[{id:'package',kind:'stage',text:'بسته تست',progressWeight:1,subtasks:[
        {id:'phase',kind:'stage',text:'مرحله تست',progressWeight:1,subtasks:[]}
      ]}]},
      {id:'other',name:'پروژه دیگر',tasks:[]}
    ]}));
  });
  await page.goto('/index.html#/projects/branching/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaApp && window.KarhaLegacy));
  await page.locator('.wbs-tree-toggle').click();
  await page.locator('.wbs-row.is-stage', {hasText:'مرحله تست'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toHaveText('افزودن کار');
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('#bottomSettingsBtn').click();
  await page.getByRole('button',{name:'تنظیمات پروژه',exact:false}).click();
  await expect(page.locator('#projectSettingsPage')).toBeVisible();
  const toggle=page.getByRole('switch',{name:'اضافه کردن بیش از یک شاخه به بسته کاری'});
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.reload();
  await expect(toggle).toBeChecked();
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
  await toggle.uncheck();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  const data=await page.evaluate(() => window.KarhaAppData.getProjects());
  expect(data.find(p=>p.id==='other').settings?.allowNestedStages).not.toBe(true);
  expect(data.find(p=>p.id==='branching').tasks[0].subtasks[0].id).toBe('phase');
});
