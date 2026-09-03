import { test, expect } from '@playwright/test';

test('configured build uses only the current Firebase project', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.KarhaFirebaseRuntime));

  const runtime = await page.evaluate(() => {
    const firebase = window.KarhaFirebaseRuntime;
    const app = firebase?.firebase?.apps?.[0];
    return {
      cloudEnabled:firebase?.cloudEnabled,
      projectId:app?.options?.projectId || null,
      authDomain:app?.options?.authDomain || null,
    };
  });

  expect(runtime).toEqual({
    cloudEnabled:true,
    projectId:'project-tree-next',
    authDomain:'project-tree-next.firebaseapp.com',
  });
  expect(JSON.stringify(runtime)).not.toContain('tree-d92af');
});
