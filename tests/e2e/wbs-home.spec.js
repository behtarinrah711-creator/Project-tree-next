test('Timeline details survive initial render, timescale changes, and tree rerenders', async ({ page }) => {
  await page.locator('.wbs-tab[aria-label="تایم‌لاین"]').click();

  const assertDetails = async expectedBars => {
    await expect(page.locator('.wbs-gantt-scale-foreign .wbs-gantt-bar')).toHaveCount(expectedBars);
    await expect(page.locator('.wbs-gantt-detail-title').filter({ hasText:/^فونداسیون$/ })).toBeVisible();
    await expect(page.locator('.wbs-gantt-detail-date', { hasText:'۶/۱' }).first()).toBeVisible();
    await expect(page.locator('.wbs-gantt-detail-date', { hasText:'۶/۸' }).first()).toBeVisible();
    const heights = await page.locator('.wbs-gantt-scale-foreign .wbs-gantt-bar').evaluateAll(bars =>
      bars.map(bar => bar.getBoundingClientRect().height)
    );
    expect(heights).toEqual(Array(expectedBars).fill(13));
  };

  await assertDetails(1);
  const initialScale = await page.locator('.wbs-gantt').getAttribute('data-timescale-signature');
  await expect(page.locator('.wbs-timescale-toggle')).toHaveAttribute('aria-label', 'نمای هفتگی');
  await page.locator('.wbs-timescale-toggle').click();
  await expect(page.locator('.wbs-timescale-toggle')).toHaveAttribute('aria-label', 'نمای ماهانه');