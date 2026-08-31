import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-contract-back-stress', name: 'پروژه تست بک تکراری', location: 'تهران',
  tasks: [], contacts: [], activityTemplates: [], contractTemplates: [], contracts: [], statusForms: [],
  trashed: false, archived: false
};

const row = (page, label) => page.locator('#contractFormBody .ft-row').filter({
  has: page.locator('.ft-label').filter({ hasText: new RegExp(`^${label}:?$`) })
}).first();

async function openDirtyContract(page,{dirty=true}={}){
  await page.addInitScript(seed => {
    localStorage.clear();
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({
      schemaVersion: 4, projects: [seed], activeTab: seed.id, viewMode: 'simple', starredOrder: []
    }));
  }, project);

  await page.goto('/index.html#/projects/e2e-contract-back-stress/dashboard');
  await page.waitForFunction(projectId => {
    try {
      window.KarhaLegacy?.renderDrawerProjectList?.();
      return Boolean(document.querySelector(`#drawerProjectList .drawer-project-row[data-project-id="${projectId}"]`));
    } catch {
      return false;
    }
  }, project.id);
  const projectRow = page.locator('#drawerProjectList .drawer-project-row[data-project-id="e2e-contract-back-stress"]');
  await page.locator('#topbarTitle').click();
  await projectRow.click();
  await page.locator('#bottomReportsBtn').click();
  await page.getByText('قرارداد پیمانکاران', { exact: true }).first().click();
  await expect(page.locator('#contractsPage')).toBeVisible();
  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  if(dirty) await row(page, 'محل انعقاد قرارداد').locator('input').fill('کارگاه تست بک تکراری');
}

async function childKey(page){
  return page.evaluate(() => window.history.state?.child?.key || null);
}

async function physicalBack(page){
  await page.evaluate(() => window.history.back());
}

async function exitGuardWouldBlock(page){
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test('dirty contract survives ten complete Back/prompt-dismiss cycles', async ({ page }) => {
  await openDirtyContract(page);
  const prompt = page.locator('.global-incomplete-exit-choice');
  const startUrl=page.url();

  for(let cycle = 0; cycle < 10; cycle++){
    await physicalBack(page);
    await expect(prompt, `prompt cycle ${cycle + 1}`).toBeVisible();
    await expect.poll(() => childKey(page)).toBe('transient:incomplete-exit-choice');
    await expect(page.locator('#contractFormPage')).toBeVisible();
    await expect(row(page, 'محل انعقاد قرارداد').locator('input')).toHaveValue('کارگاه تست بک تکراری');
    expect(page.url()).toBe(startUrl);

    await physicalBack(page);
    await expect(prompt, `dismiss cycle ${cycle + 1}`).toBeHidden();
    await expect(page.locator('#contractFormPage')).toBeVisible();
    await expect.poll(() => childKey(page)).toBe('contract-form');
    await expect(row(page, 'محل انعقاد قرارداد').locator('input')).toHaveValue('کارگاه تست بک تکراری');
    expect(page.url()).toBe(startUrl);
  }

  await physicalBack(page);
  await expect(prompt).toBeVisible();
  await expect.poll(() => childKey(page)).toBe('transient:incomplete-exit-choice');
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await expect(row(page, 'محل انعقاد قرارداد').locator('input')).toHaveValue('کارگاه تست بک تکراری');
  expect(page.url()).toBe(startUrl);
});

test('repeated physical Back gestures remain owned by form and transient', async ({ page }) => {
  await openDirtyContract(page);
  const prompt = page.locator('.global-incomplete-exit-choice');
  const appUrl = page.url();

  for(let cycle=0;cycle<6;cycle++){
    await physicalBack(page);
    await expect(prompt).toBeVisible();
    await expect.poll(() => childKey(page)).toBe('transient:incomplete-exit-choice');

    await physicalBack(page);
    await expect(prompt).toBeHidden();
    await expect.poll(() => childKey(page)).toBe('contract-form');

    expect(new URL(page.url()).pathname).toBe(new URL(appUrl).pathname);
    await expect(page.locator('#contractFormPage')).toBeVisible();
    await expect(row(page, 'محل انعقاد قرارداد').locator('input')).toHaveValue('کارگاه تست بک تکراری');
    const state = await page.evaluate(() => window.history.state);
    const controllerTop = await page.evaluate(() => window.KarhaChildHistory?.top?.() || null);
    expect(state?.app).toBe('karha');
    expect(controllerTop?.id).toBe(state?.child?.id);
    expect(controllerTop?.key).toBe('contract-form');
  }
});

test('draft, discard and clean close release document exit protection', async ({ page }) => {
  await openDirtyContract(page);
  let prompt = page.locator('.global-incomplete-exit-choice');
  await physicalBack(page);
  await expect(prompt).toBeVisible();
  await prompt.locator('[data-exit="yes"]').click();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  expect(await exitGuardWouldBlock(page)).toBe(false);

  await page.locator('#contractAddBtn').click();
  await row(page, 'محل انعقاد قرارداد').locator('input').fill('Discard protection test');
  await physicalBack(page);
  prompt = page.locator('.global-incomplete-exit-choice');
  await expect(prompt).toBeVisible();
  await prompt.locator('[data-exit="no"]').click();
  await expect(page.locator('#contractFormPage')).toBeHidden();
  expect(await exitGuardWouldBlock(page)).toBe(false);

  await page.locator('#contractAddBtn').click();
  await expect(page.locator('#contractFormPage')).toBeVisible();
  await physicalBack(page);
  await expect(page.locator('#contractFormPage')).toBeHidden();
  expect(await exitGuardWouldBlock(page)).toBe(false);
});
