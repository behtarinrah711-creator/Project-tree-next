import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-wbs-home',
  name: 'پروژه WBS',
  location: 'تهران',
  tasks: [
    { id:'s1', kind:'stage', text:'فونداسیون', progressWeight:2, subtasks:[
      { id:'w1', kind:'work', text:'خرید آهن', progress:100, progressWeight:1, quantity:1, unitCost:10, subtasks:[] },
      { id:'w2', kind:'work', text:'اجرای فونداسیون', progress:0, progressWeight:3, subtasks:[] },
    ] },
    { id:'s2', kind:'stage', text:'ساختمان', progressWeight:1, subtasks:[
      { id:'s3', kind:'stage', text:'نازک‌کاری', progressWeight:1, subtasks:[] },
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

test('progress is weighted, work checkbox resets progress, and stage checkbox is derived', async ({ page }) => {
  await page.locator('.wbs-tab', { hasText: 'پیشرفت' }).click();
  const foundation = page.locator('.wbs-row.is-stage', { hasText:'فونداسیون' });
  await expect(foundation.locator('.wbs-meta')).toHaveText('٪۲۵');
  await expect(foundation.locator('.wbs-check')).toBeDisabled();

  const execution = page.locator('.wbs-row.is-work', { hasText:'اجرای فونداسیون' });
  await execution.locator('.wbs-check').click();
  await expect(foundation.locator('.wbs-meta')).toHaveText('٪۱۰۰');
  await execution.locator('.wbs-check').click();
  await expect(foundation.locator('.wbs-meta')).toHaveText('٪۲۵');
});

test('add menu does not create an incompatible option', async ({ page }) => {
  await page.locator('.wbs-tab', { hasText: 'ثبت' }).click();
  await page.locator('.wbs-row.is-stage', { hasText:'فونداسیون' }).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن کار' })).toBeVisible();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن زیرمرحله' })).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();

  await page.locator('.wbs-row.is-stage', { hasText:'ساختمان' }).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن زیرمرحله' })).toBeVisible();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن کار' })).toHaveCount(0);
});

test('confirmed WBS delete is immediate and does not show redundant undo feedback', async ({ page }) => {
  const foundation = page.locator('.wbs-simple-row.is-stage', { hasText:'فونداسیون' });
  await foundation.locator('.wbs-simple-title').click();
  await page.locator('#wbsSheetOverlay .wbs-info-row', { hasText:'حذف مرحله' }).click();
  await expect(page.locator('#confirmOverlay')).toBeVisible();
  await page.locator('#confirmOkBtn').click();

  await expect(foundation).toHaveCount(0);
  await expect(page.locator('#undoToast')).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const project = window.KarhaAppData?.getSnapshot?.().projects?.find(item => item.id === 'e2e-wbs-home');
    return project?.tasks?.find(item => item.id === 's1')?.trashed;
  })).toBe(true);
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
