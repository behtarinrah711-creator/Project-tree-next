import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-wbs-home',
  name: 'پروژه WBS',
  location: 'تهران',
  tasks: [
    { id:'s1', kind:'stage', text:'فونداسیون', subtasks:[
      { id:'w1', kind:'work', text:'بتن مگر', quantity:1, unitCost:10, subtasks:[] },
    ] },
  ],
  contacts: [],
  activityTemplates: [],
  contractTemplates: [],
  contracts: [],
  generalConditions: [],
  trashed: false,
  archived: false,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(seedProject => {
    localStorage.clear();
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({
      schemaVersion: 8,
      projects: [seedProject],
      activeTab: seedProject.id,
      viewMode: 'simple',
      starredOrder: [],
    }));
  }, project);
  await page.goto('/index.html#/projects/e2e-wbs-home/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp));
});

test('WBS home uses the unified project header, keeps tabs, and does not hide project footer', async ({ page }) => {
  await expect(page.locator('.wbs-home-root')).toBeVisible();
  await expect(page.locator('#topbar')).toBeVisible();
  await expect(page.locator('#topbarTitle .app-title-main')).toHaveText('پروژه WBS');
  await expect(page.locator('.wbs-home-header')).toHaveCount(0);
  await expect(page.locator('.wbs-tab', { hasText: 'ثبت' })).toBeVisible();
  await expect(page.locator('.wbs-tab', { hasText: 'برآورد' })).toBeVisible();
  await expect(page.locator('.wbs-tab', { hasText: 'پیشرفت' })).toBeVisible();
  await expect(page.locator('#bottomNav')).toBeVisible();
  await expect(page.locator('#bottomProjectsBtn')).toBeVisible();
  await page.locator('.wbs-tab', { hasText: 'برآورد' }).click();
  await expect(page.locator('.wbs-general')).toBeVisible();
});
