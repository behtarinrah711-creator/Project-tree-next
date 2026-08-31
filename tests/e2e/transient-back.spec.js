import { test, expect } from '@playwright/test';

const baseProject = {
  id: 'e2e-transient-back-project', name: 'پروژه تست بک مودال', location: 'تهران',
  tasks: [], contacts: [], activityTemplates: [], contractTemplates: [], contracts: [], statusForms: [],
  trashed: false, archived: false
};

const row = (page, label) => page.locator('#contractFormBody .ft-row').filter({
  has: page.locator('.ft-label').filter({ hasText: new RegExp(`^${label}:?$`) })
}).first();

async function openContractsList(page, project = baseProject){
  await page.addInitScript(seed => {
    localStorage.clear();
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({
      schemaVersion: 4, projects: [seed], activeTab: seed.id, viewMode: 'simple', starredOrder: []
    }));
  }, project);

  await page.goto('/index.html#/projects/e2e-transient-back-project/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp && window.KarhaChildHistory));
  await page.locator('#hamburgerBtn').click();
  const projectRow = page.locator('#drawerProjectList .drawer-project-row[data-project-id="e2e-transient-back-project"]');
  await expect(projectRow).toBeVisible();
  await projectRow.click();
  await page.locator('#bottomReportsBtn').click();
  await page.getByText('قرارداد پیمانکاران', { exact: true }).first().click();
  await expect(page.locator('#contractsPage')).toBeVisible();
}

async function openDirtyNewContract(page){
  await openContractsList(page);
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  const place = row(page, 'محل انعقاد قرارداد').locator('input');
  await place.fill('کارگاه مرکزی');
  await expect(place).toHaveValue('کارگاه مرکزی');
  return place;
}

test('browser Back on dirty New Contract can repeatedly toggle confirmation without leaving the form', async ({ page }) => {
  const place = await openDirtyNewContract(page);
  const prompt = page.locator('.global-incomplete-exit-choice');
  const startUrl = page.url();
  const nativeDialogs = [];
  page.on('dialog', dialog => {
    nativeDialogs.push(dialog.type());
    void dialog.dismiss();
  });

  for(let cycle=0; cycle<10; cycle++){
    await page.evaluate(() => window.history.back());
    await expect(prompt).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
      .toBe('transient:incomplete-exit-choice');
    await expect(page.locator('#contractFormPage')).toBeVisible();
    await expect(place).toHaveValue('کارگاه مرکزی');
    expect(page.url()).toBe(startUrl);
    expect(nativeDialogs).toEqual([]);

    await page.evaluate(() => window.history.back());
    await expect(prompt).toBeHidden();
    await expect(page.locator('#contractFormPage')).toBeVisible();
    await expect(place).toHaveValue('کارگاه مرکزی');
    await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
      .toBe('contract-form');
    expect(page.url()).toBe(startUrl);
    expect(nativeDialogs).toEqual([]);
  }

  await page.evaluate(() => window.history.back());
  await expect(prompt).toBeVisible();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(place).toHaveValue('کارگاه مرکزی');
  expect(page.url()).toBe(startUrl);
  expect(nativeDialogs).toEqual([]);

  await prompt.locator('[data-exit="no"]').click();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();
  expect(nativeDialogs).toEqual([]);
});

test('purple header Back uses the same canonical dirty-form path', async ({ page }) => {
  await openDirtyNewContract(page);
  const prompt = page.locator('.global-incomplete-exit-choice');

  await page.locator('#closeContractFormPage').click();
  await expect(prompt).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
    .toBe('transient:incomplete-exit-choice');

  await page.evaluate(() => window.history.back());
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
    .toBe('contract-form');
});

test('Yes persists a visible project-scoped Draft row and reopening it uses the same form lifecycle', async ({ page }) => {
  await openDirtyNewContract(page);
  const prompt = page.locator('.global-incomplete-exit-choice');

  await page.evaluate(() => window.history.back());
  await expect(prompt).toBeVisible();
  await prompt.locator('[data-exit="yes"]').click();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();

  const draftRow = page.locator('.contract-row').filter({ hasText: 'پیش‌نویس قرارداد' }).first();
  await expect(draftRow).toBeVisible();

  const savedDraft = await page.evaluate(() => {
    const raw = localStorage.getItem('ptnext-v1:app-data');
    const data = raw ? JSON.parse(raw) : null;
    const project = data?.projects?.find(p => p.id === 'e2e-transient-back-project');
    return project?.contracts?.find(c => c.status === 'draft') || null;
  });
  expect(savedDraft?.contractPlace).toBe('کارگاه مرکزی');
  expect(savedDraft?.isDraft).toBe(true);

  await draftRow.locator('.contract-main').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(row(page, 'محل انعقاد قرارداد').locator('input')).toHaveValue('کارگاه مرکزی');
  await expect.poll(() => page.evaluate(() => window.KarhaRealContractForm?.getLifecycleMode?.()))
    .toBe('draft');

  await page.locator('#closeContractFormPage').click();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();
});

test('saved contract and draft contract share History ownership but keep different save policies', async ({ page }) => {
  const project = {
    ...baseProject,
    contracts: [{
      id: 'saved-contract-1', title: 'قرارداد ذخیره‌شده', status: 'final', isDraft: false,
      contractPlace: 'محل قبلی', contractDate: '1405/06/05', startDate: '', endDate: '', amount: '',
      employerId: '', contractorId: '', contactId: '', activityId: '', projectItemId: '',
      items: [], paymentStages: [], paymentItems: [], attachments: [], trashed: false,
      createdAt: 1, updatedAt: 1
    }]
  };
  await openContractsList(page, project);
  await page.locator('.contract-row').filter({ hasText: 'قرارداد ذخیره‌شده' }).locator('.contract-main').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.KarhaRealContractForm?.getLifecycleMode?.()))
    .toBe('saved');

  const place = row(page, 'محل انعقاد قرارداد').locator('input');
  await place.fill('محل ویرایش‌شده');
  await page.locator('#closeContractFormPage').click();
  const prompt = page.locator('.global-incomplete-exit-choice');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('.contact-exit-text')).toContainText('تغییرات این قرارداد');
  await expect.poll(() => page.evaluate(() => window.history.state?.child?.key || null))
    .toBe('transient:incomplete-exit-choice');

  await prompt.locator('[data-exit="no"]').click();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();
});
