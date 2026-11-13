import { test, expect } from '@playwright/test';
import { tehranTodayJalali } from '../../src/domain/wbs/todayDomain.js';

const today = tehranTodayJalali();
const todayShort = new Intl.NumberFormat('fa-IR').format(Number(today.split('/')[1]))
  + '/' + new Intl.NumberFormat('fa-IR').format(Number(today.split('/')[2]));

const project={id:'e2e-today',name:'پروژه امروز',location:'تهران',contacts:[{id:'a',name:'مهندس احمدی',phone:'09120000000'},{id:'c',name:'پیمانکار قرارداد'}],contracts:[{id:'contract',projectItemId:'w1',contractorId:'c'}],tasks:[{id:'s1',kind:'stage',text:'سازه',subtasks:[
  {id:'w1',kind:'work',text:'فونداسیون',type:'اجرا',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/30',workTasks:[
    {id:'today-task',workId:'w1',title:'قالب‌بندی',type:'اجرا',scheduleStart:today,scheduleEnd:today,priority:'high',assigneeContactId:'a',approvalContactId:'a',weight:1,executionComments:[
      {id:'c1',text:'نظر اول',createdBy:{id:'a',name:'الف'},createdAt:1},{id:'c2',text:'نظر دوم',createdBy:{id:'a',name:'الف'},createdAt:2},{id:'c3',text:'نظر سوم',createdBy:{id:'a',name:'الف'},createdAt:3},
    ]},
    {id:'unscheduled-task',workId:'w1',title:'بدون تاریخ',type:'پیگیری',scheduleStart:'',scheduleEnd:'',priority:'normal',weight:1},
  ]},
  {id:'future-work',kind:'work',text:'کار آینده',type:'خدمات',scheduleStart:'1405/06/19',scheduleEnd:'1405/06/25',workTasks:[]},
  {id:'overdue-work',kind:'work',text:'کار عقب‌افتاده',type:'اجرا',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/17',workTasks:[],executionHistory:[{id:'past-status',type:'daily_status',day:'1405/08/18',status:'active',at:Date.parse('2026-11-09T09:00:00Z')}],executionReports:[{id:'past-report',reportDay:'1405/08/18',description:'گزارش کار عقب‌افتاده'}]},
]}],activityTemplates:[],contractTemplates:[],generalConditions:[],trashed:false,archived:false};

const overdue=project.tasks[0].subtasks.find(work=>work.id==='overdue-work');
project.tasks[0].subtasks.push({...overdue,id:'midnight-work',text:'کار در حال اجرا',
  scheduleStart:'1405/08/18',scheduleEnd:'1405/08/19',
});

test.beforeEach(async({page})=>{
  await page.addInitScript(seed=>{localStorage.clear();localStorage.setItem('saosa:v1:sms-session',JSON.stringify({accountId:'e2e',phone:'09120000000',token:'test',expiresAt:Date.now()+3600000}));localStorage.setItem('ptnext-v1:app-data',JSON.stringify({schemaVersion:8,projects:[seed],activeTab:seed.id,viewMode:'simple',starredOrder:[]}));},project);
  await page.goto('/index.html#/projects/e2e-today/execution');
  await page.waitForFunction(()=>Boolean(window.KarhaLegacy&&window.KarhaApp));
  await page.locator('.wbs-tab[aria-label="لیست کارها"]').click();
});

async function openTaskDetails(page,card){
  await card.locator('.today-progress-circle').click();
  const sheet=page.locator('#wbsSheetOverlay');
  await expect(sheet.locator('.sheet-caption')).toHaveText('قالب‌بندی');
  return sheet;
}

test('Today toolbar shows five ordered tabs and a separate filter',async({page})=>{
  const header=page.locator('.wbs-today-frame .wbs-view-header');
  const tabs=header.getByRole('tab');
  await expect(header.locator('.wbs-view-title')).toHaveCount(0);
  await expect(tabs).toHaveText(['عقب‌افتاده','امروز','آینده','تکمیل','بی زمان']);
  await expect(header.getByRole('tab',{name:'امروز',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(header.getByRole('button',{name:'تقویم'})).toBeVisible();
  const filter=header.getByRole('button',{name:'فیلتر'});
  await expect(filter.locator('img')).toHaveAttribute('src',/filter-alt\.svg$/);
  await expect(filter).not.toHaveAttribute('aria-expanded','true');
  const positions=await header.locator('button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().left));
  expect(positions).toEqual([...positions].sort((a,b)=>b-a));
  await header.getByRole('tab',{name:'بی زمان'}).click();
  await expect(page.locator('.today-task-card[data-entity-id="unscheduled-task"]')).toBeVisible();
});

test('Today shows Tasks instead of their Work, formats one-day dates once, and expands comments newest-first',async({page})=>{
  const card=page.locator('.wbs-today-frame[data-view="today"] .today-task-card[data-entity-id="today-task"]');
  await expect(card).toContainText('قالب‌بندی');
  await expect(page.locator('.today-task-card',{hasText:'فونداسیون'})).toHaveCount(1);
  await expect(card.locator('.today-card-activity')).toHaveText(['نامشخص','گزارش ثبت نشده']);
  await expect(card.locator('.today-comment, .wbs-type-chip')).toHaveCount(0);
  const details=await openTaskDetails(page,card);
  await expect(details).toHaveClass(/today-detail-overlay/);
  const bounds=await details.locator('.wbs-sheet').boundingBox();
  expect(bounds.height).toBe(page.viewportSize().height);
  await expect(details).toContainText(todayShort);
  await expect(details).not.toContainText(`${todayShort} ← ${todayShort}`);
  await expect(details).toContainText('امروز');
  await expect(details).toContainText('پیمانکار: پیمانکار قرارداد');
  const visible=details.locator('.today-comment');
  await expect(visible).toHaveCount(2);
  await expect(visible.first()).toContainText('نظر سوم');
  await details.locator('.today-show-comments').click();
  await expect(visible).toHaveCount(3);
  await expect(visible.last()).toContainText('نظر اول');
  expect(await card.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.goBack();
  await expect(details).toHaveCount(0);
  await expect(card).toBeVisible();
});

test('report is edited in place with edit time and a photo uploader',async({page})=>{
  const card=page.locator('.wbs-today-frame[data-view="today"] .today-task-card[data-entity-id="today-task"]');
  const sheet=await openTaskDetails(page,card);
  await sheet.getByRole('button',{name:/^(ثبت|ویرایش) گزارش$/}).click();
  await expect(sheet.locator('.sheet-caption')).toHaveText('ثبت گزارش: قالب‌بندی');
  await expect(sheet.locator('.saosa-file-uploader')).toBeVisible();
  await expect(sheet.locator('.today-submit-approval')).toHaveCount(0);
  await expect(sheet.getByRole('button',{name:/ویدئو/})).toBeDisabled();
  await expect(sheet.getByRole('button',{name:/فایل/})).toBeDisabled();
  await sheet.locator('[name="reportDescription"]').fill('گزارش اجرای امروز');
  await sheet.locator('.wbs-sheet-save').click();
  await openTaskDetails(page,card);
  await sheet.getByRole('button',{name:/^(ثبت|ویرایش) گزارش$/}).click();
  await sheet.locator('[name="reportDescription"]').fill('گزارش اصلاح‌شده امروز');
  await sheet.locator('.wbs-sheet-save').click();
  await expect(card.locator('.today-card-activity')).toHaveText(['نامشخص','گزارش ثبت شده']);
  await openTaskDetails(page,card);
  await expect(sheet).toContainText('گزارش اصلاح‌شده امروز');
  await expect(sheet).toContainText('ویرایش‌شده');
  await expect.poll(()=>page.evaluate(()=>{const t=window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0].workTasks[0];return {reports:t.executionReports.length,last:t.executionHistory.at(-1).type,updated:Boolean(t.executionReports[0].updatedAt)};})).toEqual({reports:1,last:'report_edited',updated:true});
});

test('completion enters pending approval, rejection returns Today with typed newest comment, and approval is final',async({page})=>{
  const list=page.locator('.wbs-today-frame[data-view="today"]');
  const card=list.locator('.today-task-card[data-entity-id="today-task"]');
  const sheet=await openTaskDetails(page,card);
  await sheet.getByRole('button',{name:'تغییر وضعیت'}).click();
  await page.locator('#searchTemplatePage .stpl-row[data-id="active"]').click();
  await expect(card.locator('.today-card-activity')).toHaveText(['فعال','گزارش ثبت نشده']);
  await sheet.getByRole('button',{name:/^(ثبت|ویرایش) گزارش$/}).click();
  await page.locator('[name="reportDescription"]').fill('گزارش تکمیل قالب‌بندی');
  await page.locator('[name="reportProgress"]').click();
  await expect(page.locator('#numpadDisplay')).toHaveText('وارد کنید…');
  for(const digit of '100') await page.locator(`.numpad-key[data-d="${digit}"]`).click();
  await expect(page.locator('#numpadDisplay')).toHaveText('٪۱۰۰');
  await page.locator('#numpadDoneBtn').click();
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await expect(list).toHaveAttribute('data-mode','pending');
  await openTaskDetails(page,card);
  await expect(sheet).toContainText('در انتظار تأیید');
  await sheet.getByRole('button',{name:'رد',exact:true}).click();
  await page.locator('[name="rejectionReason"]').fill('نیاز به اصلاح قالب‌بندی دارد');
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await expect(list).toHaveAttribute('data-mode','today');
  await openTaskDetails(page,card);
  await expect(sheet.locator('.today-comment').first()).toContainText('نیاز به اصلاح');
  await sheet.getByRole('button',{name:/^(ثبت|ویرایش) گزارش$/}).click();
  await page.locator('[name="reportProgress"]').click();
  for(const digit of '100') await page.locator(`.numpad-key[data-d="${digit}"]`).click();
  await page.locator('#numpadDoneBtn').click();
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await openTaskDetails(page,card);
  await sheet.getByRole('button',{name:'تأیید',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  await expect(card).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0].workTasks[0].completionState)).toBe('approved');
});


for(const [tab,id] of [['امروز','midnight-work'],['عقب‌افتاده','overdue-work']]){
  test(`daily badges reset at Tehran midnight in ${tab}`,async({page})=>{
    await page.clock.setFixedTime(new Date('2026-11-09T20:29:55Z'));
    await page.reload();
    await page.locator('.wbs-tab[aria-label="لیست کارها"]').click();
    await page.getByRole('tab',{name:tab,exact:true}).click();
    const card=page.locator(`.today-task-card[data-entity-id="${id}"]`);
    const badges=card.locator('.today-card-activity');
    await expect(badges).toHaveText(['فعال','گزارش ثبت شده']);
    await page.clock.setFixedTime(new Date('2026-11-09T20:30:01Z'));
    await expect(badges).toHaveText(['نامشخص','گزارش ثبت نشده']);
    await expect(page.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true');
    await card.locator('.today-progress-circle').click();
    await page.locator('.today-history summary').click();
    await expect(page.locator('.today-history')).toContainText('فعال');
  });
}
