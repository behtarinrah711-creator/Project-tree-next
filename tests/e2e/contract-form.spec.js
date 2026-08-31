import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-contract-project', name: 'پروژه تست قرارداد', location: 'تهران',
  tasks: [{ id: 'task-1', title: 'عملیات سازه', activities: ['activity-1'], children: [] }],
  contacts: [
    { id: 'employer-1', firstName: 'کارفرمای', lastName: 'آزمایشی', activities: [] },
    { id: 'contractor-1', firstName: 'پیمانکار', lastName: 'آزمایشی', activities: ['activity-1'] }
  ],
  activityTemplates: [{ id: 'activity-1', name: 'اجرای سازه' }],
  contractTemplates: [], contracts: [], statusForms: [], trashed: false, archived: false
};

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const row = (page, label) => page.locator('#contractFormBody .ft-row').filter({
  has: page.locator('.ft-label').filter({ hasText: new RegExp(`^${escapeRegExp(label)}:?$`) })
}).first();

async function openRealContractForm(page, errors) {
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(seed => {
    localStorage.clear();
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({
      schemaVersion: 4, projects: [seed], activeTab: seed.id, viewMode: 'simple', starredOrder: []
    }));
  }, project);

  // Boot through the supported dashboard lifecycle instead of cold-loading an
  // internal Contracts hash route. Then select the project and enter Contracts
  // through the same real UI path a user follows.
  await page.goto('/index.html#/projects/e2e-contract-project/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp));

  await page.locator('#hamburgerBtn').click();
  const drawer = page.locator('#drawerOverlay');
  await expect(drawer).not.toHaveClass(/\bhidden\b/);
  const projectRow = page.locator('#drawerProjectList .drawer-project-row[data-project-id="e2e-contract-project"]');
  await expect(projectRow).toBeVisible();
  await projectRow.click();
  await expect(drawer).toHaveClass(/\bhidden\b/);
  await expect(page).toHaveURL(/#\/projects\/e2e-contract-project\/dashboard$/);

  await page.locator('#bottomReportsBtn').click();
  await expect(page.locator('#bottomReportsBtn')).toHaveClass(/\bactive\b/);

  const contractsEntry = page.getByText('قرارداد پیمانکاران', { exact: true }).first();
  await expect(contractsEntry).toBeVisible();
  await contractsEntry.click();

  await expect(page.locator('#contractsPage')).toBeVisible();
  await expect(page.locator('#contractAddBtn')).toBeVisible();
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(page.locator('#contractFormBody > .form-template:has(.ft-label:text-is("شماره قرارداد"))')).toBeVisible();
}

async function openEmptyContractFromList(page) {
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(page.locator('#contractFormBody > .form-template:has(.ft-label:text-is("شماره قرارداد"))')).toBeVisible();
}

async function waitForSearchHistoryToSettle(page) {
  await page.waitForFunction(() => {
    const state = window.history.state || {};
    return !state.karhaSearchTemplate && !state.karhaSearchTemplateSearch;
  });
  await expect(page.locator('#contractFormPage')).toBeVisible();
}

async function selectSearchOption(page, field, option, { settle = true } = {}) {
  await row(page, field).click();
  await expect(page.locator('#searchTemplatePage')).toBeVisible();
  await page.locator('.stpl-row').filter({ hasText: option }).first().click();
  if (settle) {
    await expect(page.locator('#searchTemplatePage')).toBeHidden();
    await waitForSearchHistoryToSettle(page);
  }
}

async function enterNumpad(page, field, digits) {
  await row(page, field).click();
  await expect(page.locator('#numpadOverlay')).toBeVisible();
  for (const digit of digits) await page.locator(`.numpad-key[data-d="${digit}"]`).click();
  await page.locator('#numpadDoneBtn').click();
  await expect(page.locator('#numpadOverlay')).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();
}

test('real New Contract preserves its state and owns child Back navigation', async ({ page }) => {
  const errors = [];
  await openRealContractForm(page, errors);

  for (const label of [
    'شماره قرارداد', 'تاریخ تنظیم قرارداد', 'محل انعقاد قرارداد', 'آیتم پروژه', 'کارفرما',
    'پیمانکار', 'تاریخ شروع قرارداد', 'تاریخ پایان قرارداد', 'مبلغ کل قرارداد',
    'درصد حسن انجام کار', 'مبنای شروع مدت نگهداری حسن انجام کار', 'مدت نگهداری حسن انجام کار'
  ]) await expect(row(page, label)).toBeVisible();

  const place = row(page, 'محل انعقاد قرارداد').locator('input');
  await place.fill('کارگاه مرکزی');
  await expect(place).toHaveValue('کارگاه مرکزی');

  // Picker search is its own first Back layer; the picker is the second.
  await row(page, 'کارفرما').click();
  await page.locator('#searchTemplateSearchBtn').click();
  await expect(page.locator('#searchTemplateInput')).toBeFocused();
  await page.goBack();
  await expect(page.locator('#searchTemplatePage')).toBeVisible();
  await expect(page.locator('#searchTemplateInput')).not.toBeFocused();
  await page.goBack();
  await expect(page.locator('#searchTemplatePage')).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(place).toHaveValue('کارگاه مرکزی');

  await selectSearchOption(page, 'آیتم پروژه', 'عملیات سازه', { settle: false });
  // Project-item selection intentionally continues to the activity picker.
  await expect(page.locator('#searchTemplatePage')).toBeVisible();
  await page.locator('.stpl-row').filter({ hasText: 'اجرای سازه' }).click();
  await expect(page.locator('#searchTemplatePage')).toBeHidden();
  await waitForSearchHistoryToSettle(page);
  await expect(row(page, 'آیتم پروژه')).toContainText('عملیات سازه');
  await selectSearchOption(page, 'کارفرما', 'کارفرمای آزمایشی');
  await expect(row(page, 'کارفرما')).toContainText('کارفرمای آزمایشی');
  await selectSearchOption(page, 'پیمانکار', 'پیمانکار آزمایشی');
  await expect(row(page, 'پیمانکار')).toContainText('پیمانکار آزمایشی');
  await selectSearchOption(page, 'مبنای شروع مدت نگهداری حسن انجام کار', 'تحویل موقت');
  await expect(row(page, 'مبنای شروع مدت نگهداری حسن انجام کار')).toContainText('تحویل موقت');
  await selectSearchOption(page, 'مدت نگهداری حسن انجام کار', 'دو ماه');
  await expect(row(page, 'مدت نگهداری حسن انجام کار')).toContainText('دو ماه');

  await enterNumpad(page, 'مبلغ کل قرارداد', '1250');
  await expect(row(page, 'مبلغ کل قرارداد')).toContainText(/1[,٬]?250|۱۲۵۰|۱[,٬]?۲۵۰/);
  await enterNumpad(page, 'درصد حسن انجام کار', '10');
  await expect(row(page, 'درصد حسن انجام کار')).toContainText(/10|۱۰/);

  await row(page, 'مبلغ کل قرارداد').click();
  await expect(page.locator('#numpadOverlay')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#numpadOverlay')).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();

  await row(page, 'تاریخ شروع قرارداد').click();
  await expect(page.locator('#jalaliPop')).toBeVisible();
  await page.locator('#jalaliBox .jalali-days button[data-d]:not([disabled])').first().click();
  await expect(page.locator('#jalaliPop')).toBeHidden();
  await expect(row(page, 'تاریخ شروع قرارداد')).not.toContainText('انتخاب تاریخ');
  await expect(page.locator('#contractFormPage')).toBeVisible();

  await row(page, 'تاریخ پایان قرارداد').click();
  await page.goBack();
  await expect(page.locator('#jalaliPop')).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();

  // With no child open, Back belongs to the dirty form and must ask about draft exit.
  await page.goBack();
  await expect(page.locator('.global-incomplete-exit-choice')).toBeVisible();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(page.locator('#contractsPage')).toBeHidden();
  await expect(place).toHaveValue('کارگاه مرکزی');
  expect(errors).toEqual([]);
});

test('real contract form consumes exactly one history entry across repeated sessions', async ({ page }) => {
  const errors = [];
  await openRealContractForm(page, errors);

  for (let session = 0; session < 3; session += 1) {
    if (session > 0) await openEmptyContractFromList(page);

    await page.goBack();
    await expect(page.locator('#contractFormPage')).toBeHidden();
    await expect(page.locator('#contractsPage')).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test('dirty Back restore is consumed after exit and retained once after Stay', async ({ page }) => {
  const errors = [];
  await openRealContractForm(page, errors);
  const place = row(page, 'محل انعقاد قرارداد').locator('input');
  await place.fill('کارگاه مرکزی');

  await page.goBack();
  const prompt = page.locator('.global-incomplete-exit-choice');
  await expect(prompt).toBeVisible();
  // Tapping the dialog backdrop is the existing "Stay" action.
  await prompt.click({ position: { x: 5, y: 5 } });
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();

  await page.goBack();
  await expect(prompt).toBeVisible();
  await prompt.locator('[data-exit="no"]').click();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();

  // A new form must not inherit the restored entry from the prior session.
  await openEmptyContractFromList(page);
  await page.goBack();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();
  expect(errors).toEqual([]);
});
