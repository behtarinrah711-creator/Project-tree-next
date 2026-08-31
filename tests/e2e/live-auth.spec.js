import { test, expect } from '@playwright/test';

test('isolated build never opens production Firebase/Google auth while cloud is unconfigured', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#avatarBtn')).toBeVisible();
  await page.locator('#avatarBtn').click();
  await expect(page.locator('#drawerSigninBtn')).toBeVisible();

  const before=context.pages().length;
  await page.locator('#drawerSigninBtn').click();
  await page.waitForTimeout(300);

  for(const candidate of context.pages()){
    expect(candidate.url()).not.toMatch(/tree-d92af|accounts\.google\.com/i);
  }
  expect(context.pages().length).toBe(before);
});
