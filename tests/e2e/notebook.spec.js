import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({
      schemaVersion:8, activeTab:'p1', viewMode:'simple', starredOrder:[],
      projects:[{ id:'p1', name:'پروژه تست', tasks:[] }],
    }));
    localStorage.setItem('ptnext-v1:notebook', JSON.stringify({
      version:1, activeListId:'l1',
      lists:[
        { id:'l1', title:'دفتر اول', items:[{ id:'i1', text:'ریشه', done:false, starred:false, cost:null, trashed:false, expanded:true, children:[] }] },
        { id:'l2', title:'دفتر دوم', items:[{ id:'i2', text:'ستاره دوم', done:false, starred:true, cost:null, trashed:false, expanded:true, children:[] }] },
      ],
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp));
  await page.locator('#topbarTitle').click();
  await page.locator('#globalNotebookBtn').click();
});

test('notebook owns horizontal lists, unlimited hierarchy, and global starred view', async ({ page }) => {
  await expect(page.locator('.nb-tabs')).toBeVisible();
  await expect(page.locator('#topbarTitle .app-title-main')).toHaveText('دفترچه یادداشت');
  await expect(page.locator('#topbarTitle')).toHaveAttribute('aria-haspopup', 'true');
  await page.locator('#topbarTitle').click();
  await expect(page.locator('#drawerOverlay')).toBeVisible();
  await page.locator('#globalNotebookBtn').click();
  await expect(page.locator('.nb-tab[data-list]')).toHaveCount(2);
  let parent = 'ریشه';
  for(const title of ['سطح یک','سطح دو','سطح سه','سطح چهار']){
    await page.locator('.nb-row', { hasText:parent }).locator('[data-act="child"]').click();
    await expect(page.locator('.nb-editor')).toHaveCSS('position', 'static');
    await page.locator('#nbInput').fill(title);
    await page.locator('[data-editor="save"]').click();
    parent = title;
  }
  await expect(page.locator('.nb-row', { hasText:'سطح چهار' })).toBeVisible();
  await page.locator('.nb-row', { hasText:'سطح چهار' }).locator('[data-act="star"]').click();
  await page.locator('[data-starred]').click();
  await expect(page.locator('.nb-row', { hasText:'سطح چهار' })).toBeVisible();
  await expect(page.locator('.nb-row', { hasText:'ستاره دوم' })).toBeVisible();
  await expect(page.locator('.nb-row', { hasText:'سطح چهار' }).locator('.nb-title small')).toContainText('دفتر اول');
});
