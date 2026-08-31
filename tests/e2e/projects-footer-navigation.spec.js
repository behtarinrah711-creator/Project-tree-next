import { test, expect } from '@playwright/test';

const project = {
  id: 'e2e-footer-project',
  name: 'پروژه ناوبری فوتر',
  location: 'تهران',
  tasks: [],
  contacts: [],
  activityTemplates: [],
  contractTemplates: [],
  contracts: [],
  statusForms: [],
  trashed: false,
  archived: false
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(seedProject => {
    localStorage.clear();
    localStorage.setItem('ptnext-v1:app-data', JSON.stringify({
      schemaVersion: 4,
      projects: [seedProject],
      activeTab: seedProject.id,
      viewMode: 'simple',
      starredOrder: []
    }));
  }, project);

  await page.goto('/index.html#/projects/e2e-footer-project/dashboard');
  await page.waitForFunction(() => Boolean(window.KarhaLegacy && window.KarhaApp));
});

test('Projects remains active and its drawer list survives every footer round trip', async ({ page }) => {
  const projects = page.locator('#bottomProjectsBtn');
  const drawer = page.locator('#drawerOverlay');
  const projectRow = page.locator(
    '#drawerProjectList .drawer-project-row[data-project-id="e2e-footer-project"]'
  );

  const assertProjectsHome = async () => {
    await expect(projects).toHaveClass(/\bactive\b/);
    await page.locator('#hamburgerBtn').click();
    await expect(drawer).not.toHaveClass(/\bhidden\b/);
    await expect(projectRow).toBeVisible();
    await expect(projectRow).toHaveClass(/\bactive\b/);
    await expect(projectRow).toContainText(project.name);
    // Select through the real drawer handler rather than mutating the fixture DOM.
    // This also proves the recovered row remains actionable after each round trip.
    await projectRow.click();
    await expect(drawer).toHaveClass(/\bhidden\b/);
    await expect(page).toHaveURL(/#\/projects\/e2e-footer-project\/dashboard$/);
  };

  await assertProjectsHome();

  for (const destination of ['Reports', 'Accounting', 'Settings']) {
    const destinationButton = page.locator(`#bottom${destination}Btn`);
    await destinationButton.click();
    await expect(destinationButton).toHaveClass(/\bactive\b/);
    await projects.click();
    await assertProjectsHome();
  }
});
