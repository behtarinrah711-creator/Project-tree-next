import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-wbs-shopping',
  name: 'پروژه خرید',
  location: 'تهران',
  tasks: [
    { id:'s1', kind:'stage', text:'فونداسیون', progressWeight:1, subtasks:[
      { id:'w1', kind:'work', text:'خرید آهن', progress:0, progressWeight:1, quantity:1, unitCost:10, scheduleStart:'1405/06/01', scheduleEnd:'1405/06/02', subtasks:[] },
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
  await page.goto('/index.html#/projects/e2e-wbs-shopping/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp));
});

test('shopping is a native WBS view with its own modular surface', async ({ page }) => {
  const shoppingTab = page.locator('.wbs-tab[aria-label="لیست خرید"]');
  await expect(shoppingTab).toBeVisible();
  await shoppingTab.click();

  await expect(shoppingTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.wbs-home-root')).toHaveClass(/is-shopping-view/);
  await expect(page.locator('.wbs-shopping-frame')).toBeVisible();
  await expect(page.locator('.wbs-shopping-frame')).toHaveAttribute('data-view', 'shopping');
  await expect(page.locator('.wbs-shopping-frame .wbs-view-title')).toHaveText('لیست خرید');
  await expect(page.locator('.wbs-shopping-body')).toBeVisible();
  await expect(page.locator('.wbs-toolbar')).toHaveCount(0);
  await expect(page.locator('.wbs-tree')).toHaveCount(0);

  await page.locator('.wbs-tab[aria-label="تایم‌لاین"]').click();
  await expect(page.locator('.wbs-gantt')).toBeVisible();
  await expect(page.locator('.wbs-shopping-frame')).toHaveCount(0);
});
