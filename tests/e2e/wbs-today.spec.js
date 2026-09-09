import { test, expect } from '@playwright/test';
import { tehranTodayJalali } from '../../src/domain/wbs/todayDomain.js';

const today = tehranTodayJalali();
const todayShort = new Intl.NumberFormat('fa-IR').format(Number(today.split('/')[1]))
  + '/' + new Intl.NumberFormat('fa-IR').format(Number(today.split('/')[2]));

const project={id:'e2e-today',name:'پروژه امروز',location:'تهران',contacts:[{id:'a',name:'مهندس احمدی'},{id:'c',name:'پیمانکار قرارداد'}],contracts:[{id:'contract',projectItemId:'w1',contractorId:'c'}],tasks:[{id:'s1',kind:'stage',text:'سازه',subtasks:[
  {id:'w1',kind:'work',text:'فونداسیون',type:'اجرا',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/30',workTasks:[
    {id:'today-task',workId:'w1',title:'قالب‌بندی',type:'اجرا',scheduleStart:today,scheduleEnd:today,priority:'high',assigneeContactId:'a',weight:1,executionComments:[
      {id:'c1',text:'نظر اول',createdBy:{id:'a',name:'الف'},createdAt:1},{id:'c2',text:'نظر دوم',createdBy:{id:'a',name:'الف'},createdAt:2},{id:'c3',text:'نظر سوم',createdBy:{id:'a',name:'الف'},createdAt:3},
    ]},
    {id:'unscheduled-task',workId:'w1',title:'بدون تاریخ',type:'خرید',scheduleStart:'',scheduleEnd:'',priority:'normal',weight:1},
  ]},
  {id:'future-work',kind:'work',text:'کار آینده',type:'خدمات',scheduleStart:'1405/06/19',scheduleEnd:'1405/06/25',workTasks:[]},
  {id:'overdue-work',kind:'work',text:'کار عقب‌افتاده',type:'اجرا',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/17',workTasks:[]},
]}],activityTemplates:[],contractTemplates:[],generalConditions:[],trashed:false,archived:false};

test.beforeEach(async({page})=>{
  await page.addInitScript(seed=>{localStorage.clear();localStorage.setItem('ptnext-v1:app-data',JSON.stringify({schemaVersion:8,projects:[seed],activeTab:seed.id,viewMode:'simple',starredOrder:[]}));},project);
  await page.goto('/index.html#/projects/e2e-today/dashboard');
  await page.waitForFunction(()=>Boolean(window.KarhaLegacy&&window.KarhaApp));
  await page.locator('.wbs-tab[aria-label="کارهای امروز"]').click();
});

test('Today header reuses tree controls and conditionally includes unscheduled and filter-only mode',async({page})=>{
  const header=page.locator('.wbs-today-frame .wbs-view-header');
  await expect(header.locator('.wbs-view-title')).toHaveText('کارهای امروز');
  await expect(header.locator('.today-mode-tab[data-mode="today"]')).toHaveAttribute('aria-selected','true');
  await expect(header.locator('.today-filter')).toHaveCount(1);
  await expect(header.locator('.today-filter')).not.toHaveAttribute('aria-expanded','true');
  await expect(header.locator('.wbs-view-action-separator')).toHaveCount(1);
  await expect(header.locator('.today-mode-tab img')).toHaveCount(5);
  expect(await header.locator('.today-mode-tab').evaluateAll(nodes=>nodes.map(node=>node.dataset.mode))).toEqual(['overdue','today','future','pending','unscheduled']);
});

test('Today shows Tasks instead of their Work, formats one-day dates once, and expands comments newest-first',async({page})=>{
  const card=page.locator('.today-task-card[data-entity-id="today-task"]');
  await expect(card).toContainText('قالب‌بندی');
  await expect(page.locator('.today-task-card',{hasText:'فونداسیون'})).toHaveCount(1);
  await expect(card).toContainText(todayShort);
  await expect(card).not.toContainText(`${todayShort} ← ${todayShort}`);
  await expect(card).toContainText('امروز');
  await expect(card).toContainText('پیمانکار: پیمانکار قرارداد');
  const visible=card.locator('.today-comment');
  await expect(visible).toHaveCount(2);
  await expect(visible.first()).toContainText('نظر سوم');
  await card.locator('.today-show-comments').click();
  await expect(visible).toHaveCount(3);
  await expect(visible.last()).toContainText('نظر اول');
  expect(await card.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
});

test('report is edited in place with edit time and upload placeholders remain disabled',async({page})=>{
  const card=page.locator('.today-task-card[data-entity-id="today-task"]');
  await card.getByRole('button',{name:'ثبت گزارش'}).click();
  const sheet=page.locator('#wbsSheetOverlay');
  await expect(sheet.getByRole('button',{name:/عکس/})).toBeDisabled();
  await expect(sheet.getByRole('button',{name:/ویدئو/})).toBeDisabled();
  await expect(sheet.getByRole('button',{name:/فایل/})).toBeDisabled();
  await sheet.locator('[name="reportDescription"]').fill('گزارش اجرای امروز');
  await sheet.locator('.wbs-sheet-save').click();
  await expect(card.getByRole('button',{name:'ویرایش گزارش'})).toBeVisible();
  await card.getByRole('button',{name:'ویرایش گزارش'}).click();
  await sheet.locator('[name="reportDescription"]').fill('گزارش اصلاح‌شده امروز');
  await sheet.locator('.wbs-sheet-save').click();
  await expect(card).toContainText('گزارش اصلاح‌شده امروز');
  await expect(card).toContainText('ویرایش‌شده');
  await expect.poll(()=>page.evaluate(()=>{const t=window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0].workTasks[0];return {reports:t.executionReports.length,last:t.executionHistory.at(-1).type,updated:Boolean(t.executionReports[0].updatedAt)};})).toEqual({reports:1,last:'report_edited',updated:true});
});

test('completion enters pending approval, rejection returns Today with typed newest comment, and approval is final',async({page})=>{
  let card=page.locator('.today-task-card[data-entity-id="today-task"]');
  await card.locator('.today-complete').click();
  await expect(page.locator('.wbs-today-frame')).toHaveAttribute('data-mode','pending');
  card=page.locator('.today-task-card[data-entity-id="today-task"]');
  await expect(card).toContainText('در انتظار تأیید');
  await card.getByRole('button',{name:'رد',exact:true}).click();
  await page.locator('[name="rejectionReason"]').fill('نیاز به اصلاح قالب‌بندی دارد');
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await expect(page.locator('.wbs-today-frame')).toHaveAttribute('data-mode','today');
  card=page.locator('.today-task-card[data-entity-id="today-task"]');
  await expect(card.locator('.today-comment').first()).toContainText('نیاز به اصلاح');
  await card.locator('.today-complete').click();
  await page.locator('.today-task-card[data-entity-id="today-task"]').getByRole('button',{name:'تأیید',exact:true}).click();
  await expect(page.locator('.today-task-card[data-entity-id="today-task"]')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0].workTasks[0].completionState)).toBe('approved');
});
