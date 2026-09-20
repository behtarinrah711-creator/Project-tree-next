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

test('notebook restores centered tabs, rapid entry, item sheet, cost mode and full export', async ({ page }) => {
  await page.locator('.nb-tab[data-list="l2"]').click();
  await expect(page.locator('.nb-tab[data-list="l2"]')).toHaveClass(/active/);

  await page.locator('.nb-tab[data-list="l1"]').click();
  await page.locator('.nb-row', {hasText:'ریشه'}).locator('[data-act="edit"]').click();
  await expect(page.locator('.nb-item-sheet')).toBeVisible();
  await page.locator('#nbSheetCost').click();
  for(const digit of '250000') await page.locator(`.numpad-key[data-d="${digit}"]`).click();
  await page.locator('#numpadDoneBtn').click();
  await page.locator('[data-sheet-save]').click();

  await page.locator('.nb-cost-mode').click();
  await expect(page.locator('[data-cost-toggle]')).toBeChecked();
  await expect(page.locator('.nb-cost')).toHaveCount(1);
  await expect(page.locator('.nb-row', {hasText:'ریشه'}).locator('.nb-cost')).toContainText('۲۵۰٬۰۰۰');
  await page.locator('.nb-cost-mode').click();
  await expect(page.locator('[data-cost-toggle]')).not.toBeChecked();
  await expect(page.locator('.nb-cost')).toHaveCount(0);

  await page.locator('[data-add-root]').click();
  await page.locator('#nbInput').fill('مورد سریع یک');
  await page.locator('#nbInput').press('Enter');
  await expect(page.locator('#nbInput')).toBeFocused();
  await page.locator('#nbInput').fill('مورد سریع دو');
  await page.locator('[data-editor="save"]').click();
  await expect(page.locator('#nbInput')).toBeFocused();
  await expect(page.locator('.nb-row', {hasText:'مورد سریع یک'})).toBeVisible();
  await expect(page.locator('.nb-row', {hasText:'مورد سریع دو'})).toBeVisible();

  await page.locator('[data-editor="cancel"]').click();
  await page.locator('[data-menu-toggle]').click();
  await expect(page.locator('[data-menu-toggle]')).toHaveAttribute('aria-label', 'بستن منو');
  await page.locator('[data-menu-dismiss]').click({position:{x:5,y:5}});
  await expect(page.locator('.nb-project-menu')).toHaveCount(0);
  await expect(page.locator('[data-menu-toggle]')).toHaveAttribute('aria-label', 'عملیات بیشتر');
  await page.locator('[data-menu-toggle]').click();
  await page.locator('[data-project-action="export"]').click();
  await expect(page.locator('#notebookExportPage')).toBeVisible();
  await expect(page.locator('#notebookExportNumbered')).toBeVisible();
  await expect(page.locator('#notebookExportCost')).toBeVisible();
  await expect(page.locator('#notebookExportSignature')).toBeVisible();
  await expect(page.locator('.export-pdf-btn')).toHaveText('PDF');
  await expect(page.locator('.export-jpg-btn')).toHaveText('JPEG');
  await expect(page.locator('#notebookExportBody .export-row')).toHaveCount(3);
});

test('notebook project prompts use concise titles, no placeholder, and autofocus', async ({ page }) => {
  await page.locator('[data-add-list]').click();
  await expect(page.locator('.nb-prompt h2')).toHaveText('اضافه کردن مورد جدید');
  await expect(page.locator('#nbPromptInput')).toHaveAttribute('placeholder', '');
  await expect(page.locator('#nbPromptInput')).toBeFocused();
  await page.locator('[data-prompt-close]').last().click();

  await page.locator('[data-menu-toggle]').click();
  await page.locator('[data-project-action="rename"]').click();
  await expect(page.locator('.nb-prompt h2')).toHaveText('ویرایش عنوان');
  await expect(page.locator('#nbPromptInput')).toHaveValue('دفتر اول');
  await expect(page.locator('#nbPromptInput')).toHaveAttribute('placeholder', '');
  await expect(page.locator('#nbPromptInput')).toBeFocused();
});

test('notebook keeps stars and completed items in parent-child families', async ({ page }) => {
  const root=page.locator('.nb-row',{hasText:'ریشه'});
  for(const title of ['فرزند یک','فرزند دو']){
    await root.locator('[data-act="child"]').click();
    await page.locator('#nbInput').fill(title);
    await page.locator('[data-editor="save"]').click();
  }
  await page.locator('[data-editor="cancel"]').click();

  await page.locator('.nb-row',{hasText:'فرزند یک'}).locator('[data-act="star"]').click();
  await page.locator('[data-starred]').click();
  await expect(page.locator('.nb-row',{hasText:'ریشه'})).toBeVisible();
  await expect(page.locator('.nb-row',{hasText:'فرزند یک'})).toBeVisible();
  await expect(page.locator('.nb-row',{hasText:'فرزند دو'})).toHaveCount(0);

  await page.locator('.nb-tab[data-list="l1"]').click();
  await page.locator('.nb-row',{hasText:'ریشه'}).locator('[data-act="star"]').click();
  await page.locator('[data-starred]').click();
  await expect(page.locator('.nb-row',{hasText:'فرزند دو'})).toBeVisible();

  await page.locator('.nb-tab[data-list="l1"]').click();
  await page.locator('.nb-row',{hasText:'فرزند یک'}).locator('[data-act="done"]').click();
  await page.locator('.nb-row',{hasText:'فرزند دو'}).locator('[data-act="done"]').click();
  await page.locator('.nb-row',{hasText:'ریشه'}).locator('[data-act="done"]').click();
  await page.locator('.nb-completed summary').click();
  await expect(page.locator('.nb-done-row')).toHaveCount(1);
  await expect(page.locator('.nb-done-row .nb-done-node')).toHaveCount(3);
  await page.locator('.nb-done-row [data-restore]').click();
  await expect(page.locator('.nb-row',{hasText:'ریشه'})).toBeVisible();
  await expect(page.locator('.nb-row',{hasText:'فرزند یک'})).toBeVisible();
  await expect(page.locator('.nb-row',{hasText:'فرزند دو'})).toBeVisible();
});

test('empty notebook puts add action directly below its title bar',async({page})=>{
  await page.locator('[data-add-list]').click();
  await page.locator('#nbPromptInput').fill('دفتر خالی');
  await page.locator('[data-prompt-form]').press('Enter');
  await expect(page.locator('.nb-actions + .nb-list > [data-add-root]')).toBeVisible();
  await expect(page.locator('.nb-list > [data-add-root]')).toHaveText(/افزودن مورد جدید/);
});

test('clear completed removes completed families in notebook and starred views',async({page})=>{
  await page.locator('.nb-row',{hasText:'ریشه'}).locator('[data-act="star"]').click();
  await page.locator('.nb-row',{hasText:'ریشه'}).locator('[data-act="done"]').click();
  await page.locator('.nb-completed summary').click();
  await page.locator('[data-clear-completed]').click();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('.nb-done-row')).toHaveCount(0);

  await page.locator('[data-starred]').click();
  await expect(page.locator('.nb-completed summary')).toContainText('۰');
  await expect(page.locator('.nb-done-row')).toHaveCount(0);
});
