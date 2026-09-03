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
      { id:'s4', kind:'stage', text:'تأسیسات', progressWeight:1, subtasks:[] },
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
  await page.locator('.wbs-tab[aria-label="پیشرفت"]').click();
  await page.locator('.wbs-tree-toggle').click();
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
  await page.locator('.wbs-tab[aria-label="ثبت"]').click();
  await page.locator('.wbs-row.is-stage', { hasText:'فونداسیون' }).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن کار' })).toBeVisible();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن زیرمرحله' })).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();

  await page.locator('.wbs-row.is-stage', { hasText:'ساختمان' }).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن زیرمرحله' })).toBeVisible();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن کار' })).toHaveCount(0);
});

test('pointer drag reorders sibling stages before or after without nesting', async ({ page }) => {
  await page.locator('.wbs-tab[aria-label="ثبت"]').click();
  await page.locator('.wbs-tree-toggle').click();
  const source = page.locator('.wbs-row.is-stage', { hasText:'ساختمان' });
  const target = page.locator('.wbs-row.is-stage', { hasText:'فونداسیون' });
  const gripBox = await source.locator('.wbs-grip').boundingBox();
  const targetBox = await target.boundingBox();
  if(!gripBox || !targetBox) throw new Error('WBS drag geometry is unavailable');

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 2, { steps:5 });
  await expect(target.locator('..')).toHaveClass(/wbs-drop-before/);
  await expect.poll(() => target.locator('..').evaluate(element =>
    getComputedStyle(element, '::before').backgroundColor
  )).toBe('rgb(0, 7, 93)');
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const project = window.KarhaAppData?.getSnapshot?.().projects?.find(item => item.id === 'e2e-wbs-home');
    return project?.tasks?.filter(item => !item.trashed).map(item => item.id);
  })).toEqual(['s2', 's1']);
  await expect(page.locator('.wbs-row.is-stage', { hasText:'ساختمان' }).locator('..').locator(':scope > .wbs-row')).toHaveCount(1);
});

test('pointer drag persists the order of sibling substages', async ({ page }) => {
  await page.locator('.wbs-tab[aria-label="ثبت"]').click();
  await page.locator('.wbs-tree-toggle').click();
  const source = page.locator('.wbs-row.is-stage', { hasText:'تأسیسات' });
  const target = page.locator('.wbs-row.is-stage', { hasText:'نازک‌کاری' });
  const gripBox = await source.locator('.wbs-grip').boundingBox();
  const targetBox = await target.boundingBox();
  if(!gripBox || !targetBox) throw new Error('Nested WBS drag geometry is unavailable');

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 2, { steps:5 });
  await expect(target.locator('..')).toHaveClass(/wbs-drop-before/);
  await expect.poll(() => target.locator('..').evaluate(element =>
    getComputedStyle(element, '::before').backgroundColor
  )).toBe('rgb(0, 7, 93)');
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => {
    const project = window.KarhaAppData?.getSnapshot?.().projects?.find(item => item.id === 'e2e-wbs-home');
    return project?.tasks?.find(item => item.id === 's2')?.subtasks?.map(item => item.id);
  })).toEqual(['s4', 's3']);
});

test('tree toggle reveals one depth per press and collapses after the deepest level', async ({ page }) => {
  await page.locator('.wbs-tab[aria-label="ثبت"]').click();
  await expect(page.locator('.wbs-row.depth-0')).toHaveCount(2);
  await expect(page.locator('.wbs-row.depth-1')).toHaveCount(0);

  await page.locator('.wbs-tree-toggle').click();
  await expect(page.locator('.wbs-row.depth-1')).toHaveCount(4);
  await expect(page.locator('.wbs-row.depth-2')).toHaveCount(0);

  await page.locator('.wbs-tree-toggle').click();
  await expect(page.locator('.wbs-row.depth-2')).toHaveCount(0);
  await expect(page.locator('.wbs-row.depth-1')).toHaveCount(0);
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
  await expect(page.locator('.wbs-tab[aria-label="ثبت"]')).toBeVisible();
  await expect(page.locator('.wbs-tab[aria-label="برآورد"]')).toBeVisible();
  await expect(page.locator('.wbs-tab[aria-label="پیشرفت"]')).toBeVisible();
  await expect(page.locator('.wbs-tab')).toHaveCount(4);
  await expect(page.locator('.wbs-tab svg')).toHaveCount(4);
  await expect(page.locator('.wbs-tab').first()).toHaveText('');
  await expect(page.locator('.wbs-tree-toggle svg')).toHaveCount(1);
  await expect(page.locator('#bottomNav')).toBeVisible();
  await expect(page.locator('#bottomProjectsBtn')).toBeVisible();
  await page.locator('.wbs-tab[aria-label="برآورد"]').click();
  await expect(page.locator('.wbs-general')).toBeVisible();
});
