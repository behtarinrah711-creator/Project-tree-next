import { test, expect } from '@playwright/test';

// Real browser regression: create a WorkTask through the UI, reload the page,
// and require the exact task to remain visible afterwards.
test('created WBS WorkTask survives a real page refresh', async ({ page }) => {
  await page.goto('/');

  // This intentionally uses the real app UI. Fail loudly if the expected
  // WBS controls cannot be reached rather than simulating repository calls.
  const project = page.getByText('کشتارگاه', { exact: true }).first();
  await expect(project).toBeVisible({ timeout: 15000 });
  await project.click();

  const treeTab = page.getByText('درخت پروژه', { exact: true }).first();
  if (await treeTab.count()) await treeTab.click();

  const work = page.getByText('خرید یخچال', { exact: true }).first();
  await expect(work).toBeVisible({ timeout: 15000 });
  await work.click();

  const addTask = page.getByRole('button', { name: /تسک|وظیفه|کار/ }).last();
  await expect(addTask).toBeVisible();
  await addTask.click();

  const title = `تست رفرش ${Date.now()}`;
  const titleInput = page.locator('input').filter({ has: page.locator(':scope') }).first();
  await titleInput.fill(title);

  const save = page.getByRole('button', { name: /ذخیره|ثبت/ }).last();
  await save.click();
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 10000 });

  await page.reload();
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 15000 });
});
