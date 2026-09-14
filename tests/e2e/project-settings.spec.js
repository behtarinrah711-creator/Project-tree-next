import { test, expect } from '@playwright/test';

test('project settings persist and switch the phase add flow without changing existing items', async ({ page }) => {
  await page.addInitScript(() => {
    if(localStorage.getItem('project-settings-seeded')) return;
    localStorage.setItem('project-settings-seeded','1');
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({schemaVersion:8,activeTab:'branching',viewMode:'simple',starredOrder:[],projects:[
      {id:'branching',name:'تنظیمات تست',tasks:[{id:'package',kind:'stage',text:'بسته تست',progressWeight:1,subtasks:[
        {id:'phase',kind:'stage',text:'مرحله تست',progressWeight:1,subtasks:[]}
      ]},{id:'empty-package',kind:'stage',text:'بسته خالی',progressWeight:1,subtasks:[]}]},
      {id:'other',name:'پروژه دیگر',tasks:[]}
    ]}));
  });
  await page.goto('/index.html#/projects/branching/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaApp && window.KarhaLegacy));
  await page.locator('.wbs-row.is-stage', {hasText:'بسته خالی'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('ایجاد مرحله جدید برای:');
  await expect(page.locator('#wbsSheetOverlay [name="progressWeight"]')).toHaveCount(0);
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('.wbs-tree-toggle').click();
  await page.locator('.wbs-row.is-stage', {hasText:'مرحله تست'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('ایجاد مرحله جدید برای:');
  await expect(page.locator('#wbsSheetOverlay [name="progressWeight"]')).toHaveCount(0);
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('#bottomSettingsBtn').click();
  await page.getByRole('button',{name:'تنظیمات پروژه',exact:false}).click();
  await expect(page.locator('#projectSettingsPage')).toBeVisible();
  const none=page.getByRole('radio',{name:'دو‌مرحله‌ای',exact:true});
  const single=page.getByRole('radio',{name:'سه‌مرحله‌ای',exact:true});
  const multiple=page.getByRole('radio',{name:'چندمرحله‌ای',exact:true});
  await expect(none).toBeChecked();
  await single.check();
  await page.reload();
  await expect(single).toBeChecked();
  await expect(none).not.toBeChecked();
  await page.locator('#bottomProjectsBtn').click();
  await page.locator('.wbs-row.is-stage', {hasText:'بسته خالی'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('ایجاد مرحله جدید برای:');
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('#bottomSettingsBtn').click();
  await page.getByRole('button',{name:'تنظیمات پروژه',exact:false}).click();
  await multiple.check();
  await page.reload();
  await expect(multiple).toBeChecked();
  await expect(single).not.toBeChecked();
  await expect(page.locator('#topbar')).toBeVisible();
  await page.locator('#closeProjectSettingsPage').click();
  await expect(page.locator('#settingsPage')).toBeVisible();
  await page.locator('#bottomProjectsBtn').click();
  await page.locator('.wbs-tree-toggle').click();
  await page.locator('.wbs-row.is-stage', {hasText:'مرحله تست'}).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(0);
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('ایجاد مرحله جدید برای:');
  await expect(page.locator('#wbsSheetOverlay [name="title"]')).toHaveAttribute('placeholder','مثال: تاسیسات الکتریکی');

  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('#bottomSettingsBtn').click();
  await page.getByRole('button',{name:'تنظیمات پروژه',exact:false}).click();
  await none.check();
  await page.reload();
  await expect(none).toBeChecked();
  await expect(multiple).not.toBeChecked();
  const data=await page.evaluate(() => window.KarhaAppData.getProjects());
  expect(data.find(p=>p.id==='other').settings?.stageMode).toBeUndefined();
  expect(data.find(p=>p.id==='branching').tasks[0].subtasks[0].id).toBe('phase');
});

test('base mode creates work directly from the tree header and retains it when switching modes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({schemaVersion:8,activeTab:'base-project',viewMode:'simple',starredOrder:[],projects:[
      {id:'base-project',name:'پروژه پایه',settings:{stageMode:'base'},tasks:[]}
    ]}));
  });
  await page.goto('/index.html#/projects/base-project/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaApp && window.KarhaLegacy));
  await page.locator('.wbs-root-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toHaveText('ایجاد مرحله جدید');
  await expect(page.locator('#wbsSheetOverlay .wbs-field-label')).toHaveText('نام مرحله');
  await expect(page.locator('#wbsSheetOverlay [name="title"]')).toHaveAttribute('placeholder','مثال: گچ کاری');
  await expect(page.locator('#wbsSheetOverlay .wbs-sheet-save')).toHaveCSS('font-weight','700');
  await expect(page.locator('#wbsSheetOverlay .close-btn')).toHaveCSS('color','rgb(217, 48, 37)');
  await expect(page.locator('#wbsSheetOverlay .close-btn')).toHaveCSS('font-size','22.333px');
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toHaveCSS('font-size','15px');
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toHaveCSS('font-weight','700');
  const bottomFill = await page.locator('#wbsSheetOverlay').evaluate(el => {
    const style = getComputedStyle(el, '::after');
    return {background:style.backgroundColor,top:style.top,height:style.height};
  });
  expect(bottomFill.background).toBe('rgb(255, 255, 255)');
  expect(parseFloat(bottomFill.height)).toBeGreaterThan(0);

  const bounds = await page.locator('#wbsSheetOverlay .wbs-sheet').boundingBox();
  const viewportBottom = await page.evaluate(() => visualViewport.offsetTop + visualViewport.height);
  expect(Math.abs(bounds.y + bounds.height - viewportBottom)).toBeLessThan(2);
  await expect(page.locator('#wbsSheetOverlay [name="progressWeight"]')).toHaveCount(0);
  await page.locator('#wbsSheetOverlay [name="title"]').fill('کار پایه');
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await expect(page.locator('.wbs-row.is-work')).toHaveCount(1);
  await expect(page.locator('.wbs-row.is-stage')).toHaveCount(0);
  await page.locator('.wbs-row.is-work .wbs-title').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('مرحله:');
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await page.locator('#bottomSettingsBtn').click();
  await page.getByRole('button',{name:'تنظیمات پروژه',exact:false}).click();
  await expect(page.getByRole('radio',{name:'تک‌مرحله‌ای',exact:true})).toBeChecked();
  await expect(page.locator('.project-stage-mode')).toHaveCount(4);
  await page.getByRole('radio',{name:'دو‌مرحله‌ای',exact:true}).check();
  await page.locator('#closeProjectSettingsPage').click();
  await page.locator('#bottomProjectsBtn').click();
  await expect(page.locator('.wbs-row.is-work')).toHaveCount(1);
  await page.locator('.wbs-root-add').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toHaveText('ایجاد مرحله جدید');
  await expect(page.locator('#wbsSheetOverlay [name="progressWeight"]')).toHaveCount(0);
});

for(const stageMode of ['base','none','single','multiple']){
  test(`work information excludes removed fields and preserves stored values in ${stageMode}`, async ({ page }) => {
    const work={id:'work',kind:'work',text:'کار تست',manualCost:1234567,progressWeight:1,type:'اجرا',scheduleStart:'1405/06/01',scheduleEnd:'1405/06/03',progress:35,priority:'high',assigneeContactId:'contact',predecessorIds:['previous'],dependencies:[],quantity:2,unit:'متر',unitCost:500,subtasks:[]};
    await page.addInitScript(({stageMode,work}) => {
      localStorage.setItem('ptnext-v1:app-data',JSON.stringify({schemaVersion:8,activeTab:'info',viewMode:'simple',starredOrder:[],projects:[{id:'info',name:'اطلاعات کار',settings:{stageMode},tasks:[{id:'previous',kind:'work',text:'پیش‌نیاز',subtasks:[]},work]}]}));
    },{stageMode,work});
    await page.goto('/index.html#/projects/info/dashboard');
    await page.locator('.wbs-row.is-work',{hasText:'کار تست'}).locator('.wbs-title').click();
    const sheet=page.locator('#wbsSheetOverlay');
    for(const name of ['scheduleStart','scheduleEnd','progress','priority','assigneeContactId','quantity','unit','unitCost']) await expect(sheet.locator(`[name="${name}"]`)).toHaveCount(0);
    await expect(sheet.locator('.wbs-duration-output,.wbs-live-total,.wbs-predecessor-field')).toHaveCount(0);
    await expect(sheet.locator('[name="manualCost"]')).toContainText('۱٬۲۳۴٬۵۶۷');
    await expect(sheet.locator('[name="manualCost"] small')).toHaveText('تومان');
    await sheet.getByRole('textbox',{name:'عنوان مرحله'}).fill('کار ویرایش‌شده');
    await sheet.locator('.wbs-sheet-save').click();
    await expect(page.locator('.wbs-row.is-work',{hasText:'کار ویرایش‌شده'})).toBeVisible();
    const stored=await page.evaluate(()=>window.KarhaAppData.getSnapshot().projects.find(p=>p.id==='info').tasks.find(t=>t.id==='work'));
    for(const key of ['scheduleStart','scheduleEnd','progress','priority','assigneeContactId','predecessorIds','quantity','unit','unitCost']) expect(stored[key]).toEqual(work[key]);
    await page.locator('.wbs-row',{hasText:'کار ویرایش‌شده'}).locator('.wbs-add').click();
    await expect(sheet).toHaveClass(/wbs-work-create-overlay/);
    await expect(sheet.locator('.sheet-caption')).toContainText('اضافه کردن کار به:');
    await expect(sheet.locator('.wbs-work-create-parent')).toHaveText('کار ویرایش‌شده');
    await expect(sheet.locator('.wbs-field-label')).toHaveText('عنوان کار');
    await expect(sheet.locator('[name="title"]')).toHaveAttribute('placeholder','مثال: خرید سیم و کابل');
    await sheet.locator('[name="title"]').fill('خرید سیم و کابل');
    await sheet.locator('.wbs-sheet-save').click();
    await expect(page.locator('.wbs-work-task',{hasText:'خرید سیم و کابل'})).toBeVisible();
  });
}

for(const stageMode of ['base','none','single','multiple']){
  test(`manual work cost is shown only without active child tasks in ${stageMode}`, async ({ page }) => {
    await page.addInitScript(stageMode=>{
      localStorage.setItem('ptnext-v1:app-data',JSON.stringify({schemaVersion:8,activeTab:'cost',viewMode:'simple',starredOrder:[],projects:[{id:'cost',name:'هزینه',settings:{stageMode},tasks:[
        {id:'single',kind:'work',text:'کار مستقل',manualCost:500,progressWeight:1,subtasks:[]},
        {id:'parent',kind:'work',text:'کار والد',manualCost:900,progressWeight:1,subtasks:[],workTasks:[{id:'child',workId:'parent',title:'خرده‌کار',amount:200,weight:1}]}
      ]}]}));
    },stageMode);
    await page.goto('/index.html#/projects/cost/dashboard');
    const openEdit=async title=>{
      await page.locator('.wbs-row.is-work',{hasText:title}).locator('.wbs-title').click();
      };
    await expect(page.locator('.wbs-row.is-work .wbs-type-chip')).toHaveCount(0);
    await openEdit('کار مستقل');
    const sheet=page.locator('#wbsSheetOverlay');
    await expect(sheet.locator('[name="type"],[name="contractorContactId"]')).toHaveCount(0);
    await expect(sheet).not.toContainText('افزودن فعالیت');
    await expect(sheet.locator('[name="manualCost"]')).toHaveAttribute('data-value','500');
    await expect(sheet.locator('[name="manualCost"] small')).toHaveText('تومان');
    await sheet.locator('[name="manualCost"]').click();
    for(let i=0;i<3;i++) await page.locator('#numpadBackspace').click();
    for(const digit of '750') await page.locator(`.numpad-key[data-d="${digit}"]`).click();
    await page.locator('#numpadDoneBtn').click();
    await sheet.locator('.wbs-sheet-save').click();
    await openEdit('کار والد');
    await expect(sheet.locator('[name="manualCost"]')).toHaveCount(0);
    await sheet.locator('.wbs-sheet-save').click();
    const costs=await page.evaluate(()=>window.KarhaAppData.getSnapshot().projects.find(p=>p.id==='cost').tasks.map(t=>t.manualCost));
    expect(costs).toEqual([750,900]);
    await page.locator('.wbs-tree-mode-tab[aria-label="هزینه‌ها"]').click();
    await expect(page.locator('.wbs-row.is-work',{hasText:'کار مستقل'}).locator('.wbs-meta')).toHaveText('۷۵۰');
    await expect(page.locator('.wbs-row.is-work',{hasText:'کار والد'}).locator('.wbs-meta')).toHaveText('۲۰۰');
  });
}


test('multiple-stage work selection persists the shared final-level title and plus behavior', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({schemaVersion:8,activeTab:'terminal',projects:[
      {id:'terminal',name:'terminal',settings:{stageMode:'multiple'},tasks:[
        {id:'a',kind:'stage',text:'مجتمع',subtasks:[
          {id:'b',kind:'stage',text:'بلوک',subtasks:[
            {id:'c',kind:'stage',text:'تاسیسات',subtasks:[
              {id:'d',kind:'stage',text:'برق کشی',subtasks:[]}
            ]}
          ]}
        ]}
      ]}
    ]}));
  });
  await page.goto('/index.html#/projects/terminal/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaApp && window.KarhaLegacy));
  let row=page.locator('.wbs-row', {hasText:'برق کشی'});
  for(let i=0;i<4 && !await row.isVisible();i++) await page.locator('.wbs-tree-toggle').click();
  await row.locator('.wbs-add').click();
  await page.locator('#wbsSheetOverlay .wbs-choice', {hasText:'افزودن کار'}).click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('اضافه کردن کار به:');
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await expect.poll(() => page.evaluate(() => {
    const data=JSON.parse(localStorage.getItem('ptnext-v1:app-data'));
    return data.projects.find(p=>p.id==='terminal').tasks[0].subtasks[0].subtasks[0].subtasks[0].kind;
  })).toBe('stage');
  // addInitScript also runs on reload: preserve the current saved project first.
  await page.evaluate(() => sessionStorage.setItem('terminal-saved',localStorage.getItem('ptnext-v1:app-data')));
  await page.addInitScript(() => {
    const saved=sessionStorage.getItem('terminal-saved');
    if(saved) localStorage.setItem('ptnext-v1:app-data',saved);
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.KarhaApp && window.KarhaLegacy));
  row=page.locator('.wbs-row.is-stage', {hasText:'برق کشی'});
  for(let i=0;i<4 && !await row.isVisible();i++) await page.locator('.wbs-tree-toggle').click();
  await expect(row.locator('.wbs-add')).toBeVisible();
  await row.locator('.wbs-title').click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('مرحله:');
  await expect(page.getByRole('textbox',{name:'عنوان مرحله'})).toHaveText('برق کشی');
  await page.locator('#wbsSheetOverlay .close-btn').click();
  await row.locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(2);
  await page.locator('#wbsSheetOverlay .wbs-choice', {hasText:'افزودن کار'}).click();
  await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('اضافه کردن کار به:');
  await page.locator('#wbsSheetOverlay [name="title"]').fill('خرید سیم و کابل');
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
  await expect(page.locator('.wbs-work-task',{hasText:'خرید سیم و کابل'})).toBeVisible();
  const stage=await page.evaluate(()=>window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0].subtasks[0].subtasks[0]);
  expect(stage.kind).toBe('stage');
  expect(stage.workTasks[0].title).toBe('خرید سیم و کابل');
});

for(const [mode, levels] of [['base',1],['none',2],['single',3],['multiple',4]]){
  test(`creation reveals branches and preserves shared stage styles in ${mode}`, async ({page}) => {
    await page.addInitScript(mode => {
      localStorage.setItem('ptnext-v1:app-data',JSON.stringify({schemaVersion:8,activeTab:'flow',viewMode:'simple',projects:[{id:'flow',name:'flow',settings:{stageMode:mode},tasks:[]}]}));
    },mode);
    await page.goto('/index.html#/projects/flow/dashboard');
    await page.waitForFunction(() => Boolean(window.KarhaApp && window.KarhaLegacy));
    await page.locator('.wbs-root-add').click();
    for(let level=1;level<=levels;level++){
      if(level>1){
        await page.locator('.wbs-row',{hasText:`سطح ${level-1}`}).locator('.wbs-add').click();
        await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('ایجاد مرحله جدید برای:');
        await expect(page.locator('#wbsSheetOverlay .wbs-create-parent')).toHaveText(`سطح ${level-1}`);
      }
      await expect(page.locator('#wbsSheetOverlay [name="progressWeight"]')).toHaveCount(0);
      await page.locator('#wbsSheetOverlay [name="title"]').fill(`سطح ${level}`);
      await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
      const row=page.locator('.wbs-row',{hasText:`سطح ${level}`});
      await expect(row).toBeVisible();
      await expect(row.locator('.wbs-title')).toHaveCSS('font-size','14px');
      await expect(row.locator('.wbs-title')).toHaveCSS('font-weight','700');
      await expect(row).not.toHaveCSS('background-color','rgb(255, 255, 255)');
    }
    const parent=page.locator('.wbs-row',{hasText:`سطح ${levels}`});
    await parent.locator('.wbs-add').click();
    if(mode==='multiple'){
      await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(2);
      await page.locator('#wbsSheetOverlay .wbs-choice',{hasText:'افزودن کار'}).click();
    }
    await expect(page.locator('#wbsSheetOverlay .sheet-caption')).toContainText('اضافه کردن کار به:');
    await expect(page.locator('#wbsSheetOverlay [name="title"]')).toHaveAttribute('placeholder','مثال: خرید سیم و کابل');
    await page.locator('#wbsSheetOverlay [name="title"]').fill('کار نهایی');
    await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
    await expect(page.locator('.wbs-work-task',{hasText:'کار نهایی'})).toBeVisible();
    await expect(page.locator('.wbs-work-task',{hasText:'کار نهایی'})).toHaveCSS('background-color','rgb(255, 255, 255)');
    if(mode==='multiple'){
      await parent.locator('.wbs-add').click();
      await expect(page.locator('#wbsSheetOverlay .wbs-choice')).toHaveCount(2);
      await page.locator('#wbsSheetOverlay .wbs-choice',{hasText:'افزودن زیرمرحله'}).click();
      await expect(page.locator('#wbsSheetOverlay [name="title"]')).toHaveAttribute('placeholder','پیشنهاد می شود تعداد مراحل را کمتر کنید');
      await page.locator('#wbsSheetOverlay [name="title"]').fill('سطح پنجم');
      await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();
      await expect(page.locator('.wbs-row',{hasText:'سطح پنجم'})).toBeVisible();
      await expect(page.locator('.wbs-work-task',{hasText:'کار نهایی'})).toBeVisible();
    }
  });
}
