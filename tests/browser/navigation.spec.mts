import { expect, test } from '@playwright/test';
import races from '../../data/races.json' with { type: 'json' };

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

for (const [view, filter] of [
  ['events', 'period=all'],
  ['patterns', 'time=am'],
  ['clubs', 'area=sf'],
  ['races', 'period=all'],
])
  test(`${view}: Back restores filtered results and Forward reopens the listing`, async ({
    page,
  }) => {
    await page.goto(`/?view=${view}&q=a&${filter}`);
    const row = page.locator('[data-kind]').first();
    await expect(row).toBeVisible();
    const id = await row.getAttribute('data-id');
    const listURL = page.url();
    const listTitle = await page.title();
    const count = await page.locator('#result-count').textContent();
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    const detailURL = page.url();
    const detailTitle = await page.title();

    await page.goBack();
    await expect(page).toHaveURL(listURL);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('#search')).toHaveValue('a');
    await expect(page.locator('#result-count')).toHaveText(count || '');
    await expect(page.locator(`[data-id="${id}"]`)).toBeFocused();
    await expect(page).toHaveTitle(listTitle);

    // Forward restores the URL's filters even if the list has since changed.
    await page.locator('#search').fill('no such running club or race');
    const changedURL = page.url();
    await page.goForward();
    await expect(page).toHaveURL(detailURL);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#search')).toHaveValue('a');
    await expect(page).toHaveTitle(detailTitle);
    await page.goBack();
    await expect(page).toHaveURL(changedURL);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('.empty')).toBeVisible();
    await expect(page.locator('#section-title')).toBeFocused();
  });

for (const close of ['button', 'escape', 'backdrop'])
  test(`${close} closes details without leaving an extra history entry`, async ({
    page,
  }) => {
    await page.goto('/?view=clubs');
    await expect(page.locator('[data-kind]').first()).toBeVisible();
    const previousURL = page.url();
    await page.goto('/?view=races');
    const row = page.locator('[data-kind]').first();
    await expect(row).toBeVisible();
    const listURL = page.url();
    await row.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (close === 'button')
      await page.getByRole('button', { name: 'Close details' }).click();
    else if (close === 'escape') await page.keyboard.press('Escape');
    else await page.mouse.click(1, 1);
    await expect(page).toHaveURL(listURL);
    await expect(row).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(previousURL);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

test('a directly opened shared link closes in place and preserves the previous page', async ({
  page,
}) => {
  await page.goto('/?view=clubs');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  const previousURL = page.url();
  const race = races[races.length - 1];
  await page.goto(`/?race=${race.id}&period=all`);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\?view=races&period=all$/);
  await expect(page.locator(`[data-id="${race.id}"]`)).toBeInViewport();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(previousURL);
});

test('reloading an opened listing still returns to its results on close', async ({
  page,
}) => {
  await page.goto('/?view=races&period=all');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  const listURL = page.url();
  await page.locator('[data-kind]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const detailURL = page.url();
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page).toHaveURL(listURL);
  await page.goForward();
  await expect(page).toHaveURL(detailURL);
  await expect(page.getByRole('dialog')).toBeVisible();
});
