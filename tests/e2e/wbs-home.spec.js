import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-wbs-home',
  name: 'پروژه WBS',
  location: 'تهران',
  tasks: [
    { id:'s1', kind:'stage', text:'فونداسیون', progressWeight:2, subtasks:[
      { id:'w1', kind:'work', text:'خرید آهن', progress:100, progressWeight:1, quantity:1, unitCost:10, scheduleStart:'1405/06/01', scheduleEnd:'1405/06/02', subtasks:[] },
      { id:'w2', kind:'work', text:'اجرای فونداسیون', progress:10, progressWeight:3, scheduleStart:'1405/06/03', scheduleEnd:'1405/06/08', predecessorIds:['w1'], subtasks:[] },
    ] },
    { id:'s2', kind:'stage', text:'ساختمان', progressWeight:1, subtasks:[
      { id:'s3', kind:'stage', text:'نازک‌کاری', progressWeight:1, subtasks:[
        { id:'s5', kind:'stage', text:'رنگ نهایی', progressWeight:1, subtasks:[] },
      ] },
      { id:'s4', kind:'stage', text:'تأسیسات', progressWeight:1, subtasks:[] },
    ] },
  ],
  contacts: [{ id:'c1', name:'مهندس احمدی' }],
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

async function selectTreeMode(page, label){
  await page.locator(`.wbs-tree-mode-tab[aria-label="${label}"]`).click();
}

test('progress is weighted, work checkbox resets progress, and stage checkbox is derived', async ({ page }) => {
  await selectTreeMode(page, 'درصد پیشرفت');
  await page.locator('.wbs-tree-toggle').click();
  const foundation = page.locator('.wbs-row.is-stage', { hasText:'فونداسیون' });
  await expect(foundation.locator('.wbs-meta')).toHaveText('٪۳۳');
  await expect(foundation.locator('.wbs-check')).toBeDisabled();

  const execution = page.locator('.wbs-row.is-work', { hasText:'اجرای فونداسیون' });
  await execution.locator('.wbs-check').click();
  await expect(foundation.locator('.wbs-meta')).toHaveText('٪۱۰۰');
  await execution.locator('.wbs-check').click();
  await expect(foundation.locator('.wbs-meta')).toHaveText('٪۲۵');
});

test('editing unfinished work weight immediately recalculates its stage progress', async ({ page }) => {
  await selectTreeMode(page, 'درصد پیشرفت');
  await page.locator('.wbs-tree-toggle').click();
  const foundation = page.locator('.wbs-row.is-stage', { hasText:'فونداسیون' });
  const execution = page.locator('.wbs-row.is-work', { hasText:'اجرای فونداسیون' });
  await expect(foundation.locator('.wbs-meta')).toHaveText('٪۳۳');

  await execution.locator('.wbs-title').click();
  await page.locator('#wbsSheetOverlay .wbs-primary-action', { hasText:'ویرایش اطلاعات کار' }).click();
  await page.locator('#wbsSheetOverlay [name="progressWeight"]').fill('9');
  await page.locator('#wbsSheetOverlay .wbs-sheet-save').click();

  await expect(foundation.locator('.wbs-meta')).toHaveText('٪۱۹');
  await expect.poll(() => page.evaluate(() => {
    const project = window.KarhaAppData?.getSnapshot?.().projects?.find(item => item.id === 'e2e-wbs-home');
    return project?.tasks?.find(item => item.id === 's1')?.subtasks?.find(item => item.id === 'w2')?.progressWeight;
  })).toBe(9);
});

test('add menu does not create an incompatible option', async ({ page }) => {
  await expect(page.locator('.wbs-tree-mode-tab[aria-label="ثبت و ویرایش"]')).toHaveAttribute('aria-selected', 'true');
  await page.locator('.wbs-row.is-stage', { hasText:'فونداسیون' }).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن کار' })).toBeVisible();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن زیرمرحله' })).toHaveCount(0);
  await page.locator('#wbsSheetOverlay .close-btn').click();

  await page.locator('.wbs-row.is-stage', { hasText:'ساختمان' }).locator('.wbs-add').click();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن زیرمرحله' })).toBeVisible();
  await expect(page.locator('#wbsSheetOverlay .wbs-choice', { hasText:'افزودن کار' })).toHaveCount(0);
});

test('leaf stages reserve the same responsive disclosure column as expandable stages', async ({ page }) => {
  await page.locator('.wbs-tree-toggle').click();

  const expandable = page.locator('.wbs-row.is-stage', { hasText:'نازک‌کاری' });
  const leaf = page.locator('.wbs-row.is-stage', { hasText:'تأسیسات' });
  const disclosureWidth = await expandable.locator('.wbs-chev').evaluate(element => element.getBoundingClientRect().width);
  const spacerWidth = await leaf.locator('.wbs-chev-spacer').evaluate(element => element.getBoundingClientRect().width);

  expect(disclosureWidth).toBe(32);
  expect(spacerWidth).toBe(disclosureWidth);
});

test('pointer drag reorders sibling stages before or after without nesting', async ({ page }) => {
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
  const treeToggle = page.locator('.wbs-tree-toggle');
  const expandShade = treeToggle.locator('.wbs-expand-shade rect');
  await expect(page.locator('.wbs-row.depth-0')).toHaveCount(2);
  await expect(page.locator('.wbs-row.depth-1')).toHaveCount(0);
  await expect(expandShade).toHaveAttribute('opacity', '0');

  await treeToggle.click();
  await expect(page.locator('.wbs-row.depth-1')).toHaveCount(4);
  await expect(page.locator('.wbs-row.depth-2')).toHaveCount(0);
  await expect(treeToggle).toHaveAttribute('data-expanded-levels', '1');
  await expect(treeToggle).toHaveAttribute('data-total-levels', '2');
  await expect(expandShade).toHaveAttribute('opacity', '0.5');

  await treeToggle.click();
  await expect(page.locator('.wbs-row.depth-2')).toHaveCount(1);
  await expect(expandShade).toHaveAttribute('opacity', '1');

  await treeToggle.click();
  await expect(page.locator('.wbs-row.depth-2')).toHaveCount(0);
  await expect(page.locator('.wbs-row.depth-1')).toHaveCount(0);
  await expect(expandShade).toHaveAttribute('opacity', '0');
});

test('Work Task create, edit, connector, modes and weighted completion share one persisted model', async ({ page }) => {
  await page.locator('.wbs-tree-toggle').click();
  const work = page.locator('.wbs-row.is-work', { hasText:'خرید آهن' });
  await expect(work.locator('.wbs-add')).toHaveAttribute('aria-label', 'ساخت کار');
  await work.locator('.wbs-add').click();
  await page.locator('#wbsSheetOverlay .wbs-primary-action', { hasText:'ساخت کار' }).click();

  const sheet = page.locator('#wbsSheetOverlay');
  await sheet.locator('[name="taskTitle"]').fill('تحویل آهن');
  await sheet.locator('[name="taskType"]').selectOption('خرید');
  await sheet.locator('[name="taskPriority"]').selectOption('high');
  await sheet.locator('[name="taskAssignee"]').click();
  await page.locator('#searchTemplatePage .stpl-row[data-id="c1"]').click();
  await expect(sheet.locator('[name="taskWeight"]')).toHaveValue('1');
  await sheet.locator('[name="taskWeight"]').fill('2');
  await sheet.locator('[name="taskAmount"]').fill('25');
  await sheet.locator('.wbs-sheet-save').click();

  let task = page.locator('.wbs-work-task', { hasText:'تحویل آهن' });
  await expect(task).toBeVisible();
  await expect(task.locator('.wbs-task-connector')).toBeVisible();
  await expect(task.locator('.wbs-check')).toHaveCount(0);
  await expect(task.locator('.wbs-task-main')).toContainText('خرید');
  await expect(task.locator('.wbs-task-secondary')).toContainText('مهندس احمدی');
  await expect(task.locator('.wbs-task-secondary')).toContainText('زیاد');
  await expect(task.locator('.wbs-row')).toHaveCount(0);
  expect(await task.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const work = window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0];
    return { workId:work.workTasks[0].workId, weight:work.workTasks[0].weight };
  })).toEqual({ workId:'w1', weight:2 });

  await selectTreeMode(page, 'هزینه‌ها');
  task = page.locator('.wbs-work-task', { hasText:'تحویل آهن' });
  await expect(task).toBeVisible();
  await expect(task.locator('.wbs-meta')).toHaveCount(0);
  await expect(work.locator('.wbs-meta')).toContainText('۲۵');

  await selectTreeMode(page, 'درصد پیشرفت');
  task = page.locator('.wbs-work-task', { hasText:'تحویل آهن' });
  await expect(task.locator('.wbs-task-progress')).toHaveText('٪۰');
  await expect(work.locator('.wbs-check')).toBeDisabled();
  await task.click();
  await sheet.locator('[name="taskWeight"]').fill('3');
  await sheet.locator('.wbs-sheet-save').click();
  await task.click();
  await sheet.locator('.wbs-task-completion-action').click();

  await expect.poll(() => page.evaluate(() => {
    const task = window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0].workTasks[0];
    return { state:task.completionState, completed:task.completed };
  })).toEqual({ state:'pending_approval', completed:false });
  await page.locator('.wbs-tab[aria-label="کارهای امروز"]').click();
  await page.locator('.today-mode-tab[data-mode="pending"]').click();
  await page.locator('.today-task-card', { hasText:'تحویل آهن' }).getByRole('button', { name:'تأیید', exact:true }).click();
  await page.locator('.wbs-tab[aria-label="درخت پروژه"]').click();
  await selectTreeMode(page, 'درصد پیشرفت');

  task = page.locator('.wbs-work-task', { hasText:'تحویل آهن' });
  await expect(task).toHaveClass(/is-complete/);
  await expect(task.locator('.wbs-task-title')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(task.locator('.wbs-task-progress')).toHaveText('٪۱۰۰');
  await expect(work.locator('.wbs-meta')).toHaveText('٪۱۰۰');
  await expect.poll(() => task.locator('.wbs-task-connector').evaluate(element => ({
    color:getComputedStyle(element).borderInlineStartColor,
    width:getComputedStyle(element).borderInlineStartWidth,
  }))).toEqual({ color:'rgb(22, 163, 74)', width:'3px' });
  await expect.poll(() => page.evaluate(() => (
    window.KarhaAppData.getSnapshot().projects[0].tasks[0].subtasks[0].workTasks[0].weight
  ))).toBe(3);
});

test('confirmed WBS delete is immediate and does not show redundant undo feedback', async ({ page }) => {
  const foundation = page.locator('.wbs-row.is-stage', { hasText:'فونداسیون' });
  await foundation.locator('.wbs-title').click();
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

test('WBS uses six primary views and three modular tree modes', async ({ page }) => {
  await expect(page.locator('.wbs-home-root')).toBeVisible();
  await expect(page.locator('#topbar')).toBeVisible();
  await expect(page.locator('#topbarTitle .app-title-main')).toHaveText('پروژه WBS');
  await expect(page.locator('.wbs-home-header')).toHaveCount(0);

  await expect(page.locator('.wbs-tab[aria-label="کارهای امروز"]')).toBeVisible();
  await expect(page.locator('.wbs-tab[aria-label="درخت پروژه"]')).toBeVisible();
  await expect(page.locator('.wbs-tab[aria-label="تایم‌لاین"]')).toBeVisible();
  await expect(page.locator('.wbs-tab[aria-label="Costline"]')).toBeVisible();
  await expect(page.locator('.wbs-tab[aria-label="لیست خرید"]')).toBeVisible();
  await expect(page.locator('.wbs-tab[aria-label="دیرکردها"]')).toBeVisible();
  await expect(page.locator('.wbs-tab')).toHaveCount(6);
  await expect(page.locator('.wbs-tab svg')).toHaveCount(6);
  await expect(page.locator('.wbs-tab[aria-label="ساده"]')).toHaveCount(0);
  await expect(page.locator('.wbs-tab[aria-label="ثبت"]')).toHaveCount(0);
  await expect(page.locator('.wbs-tab[aria-label="برآورد"]')).toHaveCount(0);
  await expect(page.locator('.wbs-tab[aria-label="پیشرفت"]')).toHaveCount(0);

  const tabRects = await page.locator('.wbs-tab').evaluateAll(tabs => tabs.map(tab => {
    const rect = tab.getBoundingClientRect();
    return { left:rect.left, top:rect.top, width:rect.width };
  }));
  expect(Math.max(...tabRects.map(rect => rect.top)) - Math.min(...tabRects.map(rect => rect.top))).toBeLessThan(2);
  expect(Math.max(...tabRects.map(rect => rect.width)) - Math.min(...tabRects.map(rect => rect.width))).toBeLessThan(2);
  const delayLeft = await page.locator('.wbs-tab[aria-label="دیرکردها"]').evaluate(tab => tab.getBoundingClientRect().left);
  expect(delayLeft).toBe(Math.min(...tabRects.map(rect => rect.left)));

  await page.locator('.wbs-tab[aria-label="دیرکردها"]').click();
  const delayFrame = page.locator('.wbs-delay-frame');
  await expect(delayFrame).toBeVisible();
  await expect(delayFrame).toHaveAttribute('data-view', 'delay');
  await expect(delayFrame.locator('.wbs-view-title')).toHaveText('دیرکرد');
  await expect(delayFrame.locator('.wbs-delay-body')).toBeVisible();
  await expect(page.locator('.wbs-tree')).toHaveCount(0);

  await page.locator('.wbs-tab[aria-label="درخت پروژه"]').click();
  const frame = page.locator('.wbs-view-frame.is-standard-view');
  await expect(frame.locator('.wbs-view-title')).toHaveText('درخت پروژه');
  await expect(frame.locator('.wbs-tree-mode-tab')).toHaveCount(3);
  await expect(frame.locator('.wbs-tree-mode-tab[aria-label="ثبت و ویرایش"]')).toHaveAttribute('aria-selected', 'true');
  await expect(frame.locator('.wbs-tree-mode-tab[aria-label="هزینه‌ها"]')).toBeVisible();
  await expect(frame.locator('.wbs-tree-mode-tab[aria-label="درصد پیشرفت"]')).toBeVisible();

  await selectTreeMode(page, 'هزینه‌ها');
  await expect(page.locator('.wbs-general')).toBeVisible();

  await page.locator('.wbs-tab[aria-label="تایم‌لاین"]').click();
  await page.locator('.wbs-tab[aria-label="درخت پروژه"]').click();
  await expect(page.locator('.wbs-tree-mode-tab[aria-label="ثبت و ویرایش"]')).toHaveAttribute('aria-selected', 'true');

  await expect(page.locator('.wbs-tree-toggle>svg:not(.wbs-expand-shade)')).toHaveCount(1);
  await expect(page.locator('.wbs-root-add')).toHaveText('بسته کار');
  await expect(page.locator('.wbs-root-add svg')).toHaveCount(1);
  await expect(page.locator('#bottomNav')).toBeVisible();
  await expect(page.locator('#bottomProjectsBtn')).toBeVisible();
});

test('Timeline details survive initial render, timescale changes, and tree rerenders', async ({ page }) => {
  await page.locator('.wbs-tab[aria-label="تایم‌لاین"]').click();

  const assertDetails = async expectedBars => {
    const activityBars = page.locator('.wbs-gantt-scale-foreign .wbs-gantt-bar:not(.is-milestone)');
    await expect(activityBars).toHaveCount(expectedBars);
    await expect(page.locator('.wbs-gantt-scale-foreign .wbs-gantt-bar.is-milestone')).toHaveCount(1);
    await expect(page.locator('.wbs-gantt-name.is-milestone')).toContainText('پایان پروژه');
    await expect(page.locator('.wbs-gantt-detail-title').filter({ hasText:/^فونداسیون$/ })).toBeVisible();
    await expect(page.locator('.wbs-gantt-detail-date', { hasText:'۶/۱' }).first()).toBeVisible();
    await expect(page.locator('.wbs-gantt-detail-date', { hasText:'۶/۸' }).first()).toBeVisible();
    const heights = await activityBars.evaluateAll(bars =>
      bars.map(bar => bar.getBoundingClientRect().height)
    );
    expect(heights).toEqual(Array(expectedBars).fill(13));
  };

  await assertDetails(1);
  const initialScale = await page.locator('.wbs-gantt').getAttribute('data-timescale-signature');
  await expect(page.locator('.wbs-timescale-toggle')).toHaveAttribute('aria-label', 'نمای هفتگی');
  await page.locator('.wbs-timescale-toggle').click();
  await expect(page.locator('.wbs-timescale-toggle')).toHaveAttribute('aria-label', 'نمای ماهانه');
  await expect.poll(() => page.locator('.wbs-gantt').getAttribute('data-timescale-signature'))
    .not.toBe(initialScale);
  await expect(page.locator('.wbs-gantt')).toHaveClass(/wbs-scale-month/);
  await assertDetails(1);

  await page.locator('.wbs-tree-toggle').click();
  await assertDetails(3);
  const dependency = page.locator('.wbs-gantt-dependency-link[data-source-id="w1"][data-target-id="w2"]');
  await expect(page.locator('.wbs-timeline-view-header .wbs-view-title')).toHaveText('نمودار گانت');
  await expect(page.locator('.wbs-dependency-toggle')).toHaveCount(0);
  await expect(dependency).toBeHidden();
  await page.getByRole('button', { name:'کانفیگور نمودار گانت' }).click();
  const dependencyOption = page.locator('.wbs-gantt-menu-row', { hasText:'خطوط پیش‌نیاز' }).locator('input');
  await expect(dependencyOption).not.toBeChecked();
  await dependencyOption.check();
  await expect(dependency).toBeVisible();
  const dependencyArrow = page.locator('.wbs-gantt-dependency-arrow-segment[data-source-id="w1"][data-target-id="w2"]');
  const dependencyArrowLayer = page.locator('.wbs-gantt-dependency-arrow-layer');
  await expect(dependencyArrowLayer).toHaveCSS('display', 'block');
  await expect(dependencyArrow).toHaveCSS('visibility', 'visible');
  await expect(dependencyArrow).toHaveAttribute('marker-end', 'url(#wbs-gantt-fs-arrow)');
  const endpoints = await page.evaluate(() => {
    const path = document.querySelector('.wbs-gantt-dependency-link[data-source-id="w1"][data-target-id="w2"]');
    const source = document.querySelector('.wbs-gantt-line[data-dependency-entry-id="w1"] .wbs-gantt-bar');
    const target = document.querySelector('.wbs-gantt-line[data-dependency-entry-id="w2"] .wbs-gantt-bar');
    const matrix = path.getScreenCTM();
    const point = distance => { const value = path.getPointAtLength(distance); return new DOMPoint(value.x, value.y).matrixTransform(matrix); };
    const start = point(0); const finish = point(path.getTotalLength());
    const sourceRect = source.getBoundingClientRect(); const targetRect = target.getBoundingClientRect();
    return {
      start:{ x:start.x, y:start.y }, finish:{ x:finish.x, y:finish.y },
      sourceRect:{ left:sourceRect.left, top:sourceRect.top, height:sourceRect.height },
      targetRect:{ right:targetRect.right, top:targetRect.top, height:targetRect.height },
    };
  });
  expect(Math.abs(endpoints.start.x - endpoints.sourceRect.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(endpoints.start.y - (endpoints.sourceRect.top + endpoints.sourceRect.height / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs(endpoints.finish.x - endpoints.targetRect.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(endpoints.finish.y - (endpoints.targetRect.top + endpoints.targetRect.height / 2))).toBeLessThanOrEqual(1);
  const arrowDirection = await page.evaluate(() => {
    const path = document.querySelector('.wbs-gantt-dependency-arrow-segment[data-source-id="w1"][data-target-id="w2"]');
    const total = path.getTotalLength();
    const a = path.getPointAtLength(Math.max(0, total - 0.5));
    const b = path.getPointAtLength(total);
    return Math.sign(b.x - a.x);
  });
  expect(arrowDirection).toBe(1);
  await expect(page.locator('.wbs-gantt-detail-title', { hasText:'اجرای فونداسیون' })).toBeVisible();
  await expect(page.locator('.wbs-gantt-detail-actual').filter({ hasText:/^٪۱۰$/ })).toBeVisible();

  await page.locator('.wbs-tree-toggle').click();
  await page.locator('.wbs-tree-toggle').click();
  await expect(page.locator('.wbs-gantt-dependency-link')).toHaveCount(0);
  await expect(page.locator('.wbs-gantt-detail-title', { hasText:'اجرای فونداسیون' })).toHaveCount(0);
  await assertDetails(1);
});
