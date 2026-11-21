import { test, expect } from '@playwright/test';
import { tehranTodayJalali } from '../../src/domain/wbs/todayDomain.js';

const today=tehranTodayJalali();

const project = {
  id: 'e2e-wbs-shopping',
  name: 'پروژه خرید',
  location: 'تهران',
  tasks: [
    { id:'s1', kind:'stage', text:'فونداسیون', progressWeight:1, subtasks:[
      { id:'w1', kind:'work', text:'خرید آهن', type:'خرید', priority:'high', assigneeContactId:'c1', approvalContactId:'c1', progress:0, progressWeight:1, quantity:2, unitCost:5000, scheduleStart:today, scheduleEnd:today, subtasks:[] },
      { id:'w2', kind:'work', text:'اجرای آهن', type:'اجرا', progress:0, progressWeight:1, scheduleStart:today, scheduleEnd:today, subtasks:[] },
    ] },
  ],
  contacts: [{id:'c1',name:'مهندس احمدی',phone:'09120000000'}],
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
    localStorage.setItem('saosa:v1:sms-session',JSON.stringify({accountId:'e2e',phone:'09120000000',token:'test',expiresAt:Date.now()+3600000}));
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({
      schemaVersion: 8,
      projects: [seedProject],
      activeTab: seedProject.id,
      viewMode: 'simple',
      starredOrder: [],
    }));
  }, project);
  await page.goto('/index.html#/projects/e2e-wbs-shopping/execution');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp));
});

test('shopping is a native WBS view with its own modular surface', async ({ page }) => {
  const shoppingTab = page.locator('.wbs-tab[aria-label="خریدها"]');
  await expect(shoppingTab).toBeVisible();
  await shoppingTab.click();

  await expect(shoppingTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.wbs-home-root')).toHaveClass(/is-shopping-view/);
  await expect(page.locator('.wbs-shopping-frame')).toBeVisible();
  await expect(page.locator('.wbs-shopping-frame')).toHaveAttribute('data-view', 'shopping');
  await expect(page.locator('.wbs-shopping-frame').getByRole('tab',{name:'امروز',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.wbs-shopping-body')).toBeVisible();
  await expect(page.locator('.wbs-shopping-frame .today-task-tabs').getByRole('tab')).toHaveText(['همه','عقب‌افتاده','امروز','آینده','تکمیل','بی زمان','انتظار','متوقف']);
  await expect(page.locator('.wbs-shopping-frame .today-task-secondary').getByRole('button')).toHaveText(['همه مراحل','فیلتر اشخاص','تقویم']);
  await page.locator('.wbs-shopping-frame').getByRole('button',{name:'فیلتر اشخاص',exact:true}).click();
  const filterSheet=page.locator('#wbsSheetOverlay');
  await expect(filterSheet).toContainText('مسئول پیگیری');
  await filterSheet.getByRole('button',{name:'بستن',exact:true}).click();
  await expect(filterSheet).toHaveCount(0);
  const card=page.locator('.shopping-item-card[data-entity-id="w1"]');
  await expect(card).toContainText('خرید آهن');
  await expect(card).toContainText('فونداسیون');
  await expect(card.locator('.wbs-task-priority')).toHaveText('مهم');
  await expect(card.locator('.today-card-schedule')).toBeVisible();
  await expect(card.locator('.today-card-summary .today-progress-circle')).toBeVisible();
  await expect(card).toContainText('۱۰٬۰۰۰ تومان');
  await expect(card.locator('.today-card-person')).toContainText('مهندس احمدی');
  await expect(card.locator('.today-card-activity .today-report-circle')).toBeVisible();
  await expect(card.locator('.today-card-activity .today-card-stop')).toBeVisible();
  await expect(card.locator('.wbs-type-chip, .today-status-slot, .today-comment-form')).toHaveCount(0);
  await expect(card).not.toContainText('مسئول تأیید');
  await expect(card).not.toContainText('خرید شروع نشده');
  await expect(page.locator('.shopping-item-card[data-entity-id="w2"]')).toHaveCount(0);
  await expect(page.locator('.wbs-toolbar')).toHaveCount(0);
  await expect(page.locator('.wbs-tree')).toHaveCount(0);

  await page.locator('#bottomPlanningBtn').click();
  await page.locator('.wbs-tab[aria-label="نمودار گانت"]').click();
  await expect(page.locator('.wbs-gantt')).toBeVisible();
  await expect(page.locator('.wbs-shopping-frame')).toHaveCount(0);
});

test('shopping report, comment and approval use the same WBS purchase entity',async({page})=>{
  await page.locator('.wbs-tab[aria-label="خریدها"]').click();
  const card=page.locator('.shopping-item-card[data-entity-id="w1"]');
  await card.locator('.today-report-circle').click();
  await page.getByRole('button',{name:'فعال است',exact:true}).click();
  await page.locator('[name="reportDescription"]').fill('پیش‌فاکتور آهن دریافت شد');
  await page.locator('[name="reportProgress"]').click();
  for(const digit of '90') await page.locator(`.numpad-key[data-d="${digit}"]`).click();
  await page.locator('#numpadDoneBtn').click();
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await card.locator('.today-card-titles').click();
  const details=page.locator('#wbsSheetOverlay');
  await expect(details).toContainText('پیش‌فاکتور آهن دریافت شد');
  await details.locator('[name="commentText"]').fill('قیمت با فروشنده بررسی شود');
  await details.getByRole('button',{name:'ارسال',exact:true}).click();
  await details.getByRole('button',{name:'مشاهدهٔ سابقه'}).click();
  await expect(details).toContainText('قیمت با فروشنده بررسی شود');
  await details.getByRole('button',{name:'بستن',exact:true}).click();
  await card.locator('.today-report-circle').click();
  await page.locator('[name="reportProgress"]').click();
  await expect(page.locator('#numpadDisplay')).toContainText('۹۰');
  for(let digit=0;digit<2;digit++) await page.locator('#numpadBackspace').click();
  for(const digit of '100') await page.locator(`.numpad-key[data-d="${digit}"]`).click();
  await page.locator('#numpadDoneBtn').click();
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await expect(page.locator('.wbs-shopping-frame')).toHaveAttribute('data-mode','pending');
  await expect(card).toBeVisible();
  await card.locator('.today-card-titles').click();
  await expect(details).toContainText('در انتظار تأیید');
  await expect.poll(()=>page.evaluate(()=>{const item=window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0];return{reports:item.executionReports.length,comments:item.executionComments.length,state:item.completionState};})).toEqual({reports:1,comments:1,state:'pending_approval'});
});
