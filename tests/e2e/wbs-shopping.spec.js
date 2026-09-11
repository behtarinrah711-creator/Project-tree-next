import { test, expect } from '@playwright/test';
import { tehranTodayJalali } from '../../src/domain/wbs/todayDomain.js';

const today=tehranTodayJalali();

const project = {
  id: 'e2e-wbs-shopping',
  name: 'پروژه خرید',
  location: 'تهران',
  tasks: [
    { id:'s1', kind:'stage', text:'فونداسیون', progressWeight:1, subtasks:[
      { id:'w1', kind:'work', text:'خرید آهن', type:'خرید', priority:'high', assigneeContactId:'c1', progress:0, progressWeight:1, quantity:2, unitCost:5000, scheduleStart:today, scheduleEnd:today, subtasks:[] },
      { id:'w2', kind:'work', text:'اجرای آهن', type:'اجرا', progress:0, progressWeight:1, scheduleStart:today, scheduleEnd:today, subtasks:[] },
    ] },
  ],
  contacts: [{id:'c1',name:'مهندس احمدی'}],
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
  await expect(page.locator('.wbs-shopping-frame .wbs-view-title')).toHaveText('خریدهای امروز');
  await expect(page.locator('.wbs-shopping-body')).toBeVisible();
  await expect(page.locator('.wbs-shopping-frame .today-mode-tab img')).toHaveCount(4);
  await expect(page.locator('.wbs-shopping-frame .today-filter')).toHaveCount(1);
  await page.locator('.wbs-shopping-frame .today-filter').click();
  await expect(page.locator('#wbsSheetOverlay')).toHaveCount(0);
  const card=page.locator('.shopping-item-card[data-entity-id="w1"]');
  await expect(card).toContainText('خرید آهن');
  await expect(card).toContainText('فونداسیون');
  await expect(card).toContainText('اهمیت: زیاد');
  await expect(card).toContainText('۱۰٬۰۰۰ تومان');
  await expect(card).toContainText('مسئول: مهندس احمدی');
  await expect(card).toContainText('وضعیت: خرید شروع نشده');
  await expect(page.locator('.shopping-item-card[data-entity-id="w2"]')).toHaveCount(0);
  await expect(page.locator('.wbs-toolbar')).toHaveCount(0);
  await expect(page.locator('.wbs-tree')).toHaveCount(0);

  await page.locator('.wbs-tab[aria-label="تایم‌لاین"]').click();
  await expect(page.locator('.wbs-gantt')).toBeVisible();
  await expect(page.locator('.wbs-shopping-frame')).toHaveCount(0);
});

test('shopping report, comment and approval use the same WBS purchase entity',async({page})=>{
  await page.locator('.wbs-tab[aria-label="لیست خرید"]').click();
  let card=page.locator('.shopping-item-card[data-entity-id="w1"]');
  await card.getByRole('button',{name:'ثبت گزارش'}).click();
  await page.locator('[name="reportDescription"]').fill('پیش‌فاکتور آهن دریافت شد');
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await expect(card).toContainText('پیش‌فاکتور آهن دریافت شد');
  await card.locator('[name="comment"]').fill('قیمت با فروشنده بررسی شود');
  await card.locator('.today-comment-form button').click();
  await expect(card).toContainText('قیمت با فروشنده بررسی شود');
  await card.locator('.today-complete').click();
  await expect(page.locator('.wbs-shopping-frame')).toHaveAttribute('data-mode','pending');
  card=page.locator('.shopping-item-card[data-entity-id="w1"]');
  await expect(card).toContainText('در انتظار تأیید خرید');
  await expect.poll(()=>page.evaluate(()=>{const item=window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0];return{reports:item.executionReports.length,comments:item.executionComments.length,state:item.completionState};})).toEqual({reports:1,comments:1,state:'pending_approval'});
});
