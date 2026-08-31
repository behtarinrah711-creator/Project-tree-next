import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-final-save-project', name: 'پروژه تست ذخیره نهایی', location: 'تهران',
  tasks: [], contacts: [], activityTemplates: [], contractTemplates: [], contracts: [], statusForms: [],
  trashed: false, archived: false
};

async function openNewContract(page){
  await page.addInitScript(seed => {
    localStorage.clear();
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({
      schemaVersion: 4, projects: [seed], activeTab: seed.id, viewMode: 'simple', starredOrder: []
    }));
  }, project);

  await page.goto('/index.html#/projects/e2e-final-save-project/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp && window.KarhaChildHistory));
  await page.locator('#hamburgerBtn').click();
  await page.locator('#drawerProjectList .drawer-project-row[data-project-id="e2e-final-save-project"]').click();
  await page.locator('#bottomReportsBtn').click();
  await page.getByText('قرارداد پیمانکاران', { exact: true }).first().click();
  await expect(page.locator('#contractsPage')).toBeVisible();
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
}

test('Save persists a final contract and renders it in the contracts list', async ({ page }) => {
  await openNewContract(page);

  const contractId = await page.evaluate(() => {
    const form = window.KarhaRealContractForm;
    const current = form.getState();
    const next = {
      ...current,
      contractDate: '1400/01/01',
      projectItemId: 'task-1',
      projectItemRootTaskId: 'task-1',
      projectItemPath: 'آیتم تست',
      employerId: 'employer-1',
      contractorId: 'contractor-1',
      contactId: 'contractor-1',
      activityId: 'activity-1',
      activityIds: ['activity-1'],
      startDate: '1400/01/02',
      endDate: '1400/01/03',
      amount: '1000000',
      retentionPercent: '10',
      retentionBasis: 'تحویل موقت',
      retentionDuration: 'یک ماه',
      contractPlace: 'کارگاه تست',
      items: [], paymentStages: [], paymentItems: [], attachments: []
    };
    form.setState(next);
    form.setDirty(true);
    form.render();
    return next.id;
  });

  // Arm the restored dirty-child protection, then dismiss only the transient
  // so successful final Save must also release that protection.
  await page.goBack();
  const prompt = page.locator('.global-incomplete-exit-choice');
  await expect(prompt).toBeVisible();
  await page.goBack();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#contractFormPage')).toBeVisible();

  await page.locator('#contractFormActions .if-save').click();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  await expect(page.locator('#contractsPage')).toBeVisible();

  const stored = await page.evaluate(id => {
    const raw = localStorage.getItem('ptnext-v1:app-data');
    const data = raw ? JSON.parse(raw) : null;
    const p = data?.projects?.find(x => x.id === 'e2e-final-save-project');
    return p?.contracts?.find(c => c.id === id) || null;
  }, contractId);

  expect(stored).not.toBeNull();
  expect(stored.status).toBe('final');
  expect(stored.isDraft).toBe(false);
  expect(stored.contractPlace).toBe('کارگاه تست');

  const exitGuardActive = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(exitGuardActive).toBe(false);

  await expect(page.locator('.contract-row').filter({ hasText: 'کارگاه تست' }).or(page.locator('.contract-row').filter({ hasText: 'قرارداد' })).first()).toBeVisible();
});
