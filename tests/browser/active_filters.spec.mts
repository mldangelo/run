import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

test('a hidden advanced filter can be removed without losing the other choices', async ({
  page,
}) => {
  await page.goto('/?q=SFH3&period=all&time=pm&status=all');
  const active = page.getByRole('group', { name: 'Active filters' });
  await expect(active.getByRole('button')).toHaveCount(4);
  await page.locator('#advanced-filters summary').click();
  await expect(page.locator('#time')).not.toBeVisible();
  const time = active.getByRole('button', {
    name: 'Remove Time: Afternoon / evening',
    exact: true,
  });
  await time.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#time')).toHaveValue('all');
  await expect(page.locator('#search')).toHaveValue('SFH3');
  await expect(page.locator('#period')).toHaveValue('all');
  await expect(page.locator('#status')).toHaveValue('all');
  await expect(page.locator('#filter-summary')).toHaveText(' · 1 active');
  await expect(
    active.getByRole('button', { name: 'Remove Status: Both' }),
  ).toBeFocused();
  expect(new URL(page.url()).searchParams.has('time')).toBe(false);
  await page.reload();
  await expect(active.getByRole('button')).toHaveCount(3);
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(active).not.toBeVisible();
});

test('filter labels follow the view and keyboard focus returns to search after the last removal', async ({
  page,
}) => {
  await page.goto('/?q=run&period=all&day=wednesday');
  const active = page.getByRole('group', { name: 'Active filters' });
  await expect(active.getByRole('button')).toHaveCount(3);
  await page.locator('[data-view="clubs"]').click();
  await expect(active.getByRole('button')).toHaveCount(1);
  await page.locator('[data-view="patterns"]').click();
  await expect(active.getByRole('button')).toHaveCount(2);
  await active.getByRole('button', { name: 'Remove Search: run' }).click();
  const day = active.getByRole('button', {
    name: 'Remove Day: Wednesday',
  });
  await expect(day).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(active).not.toBeVisible();
  await expect(page.locator('#search')).toBeFocused();
  await expect(page).toHaveURL(/\?view=patterns$/);
});

test('neighborhood labels omit result counts and removal keeps the selected area', async ({
  page,
}) => {
  const neighborhood = 'Golden Gate Park / Panhandle';
  await page.goto(
    `/?view=patterns&run_area=sf&neighborhood=${encodeURIComponent(neighborhood)}`,
  );
  const active = page.getByRole('group', { name: 'Active filters' });
  const chip = active.getByRole('button', {
    name: `Remove Neighborhood: ${neighborhood}`,
    exact: true,
  });
  await expect(chip).toHaveText(`Neighborhood: ${neighborhood} ×`);
  await chip.click();
  await expect(page.locator('#neighborhood')).toHaveValue('all');
  await expect(page.locator('#run_area')).toHaveValue('sf');
  await expect(
    active.getByRole('button', { name: 'Remove Area: San Francisco' }),
  ).toBeFocused();
});

test('removing a filter updates shared Pages links and survives listing navigation', async ({
  page,
}) => {
  await page.route('**/run/**', async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/run\//, '/');
    await route.fulfill({ response: await page.request.get(url.href) });
  });
  await page.goto('/run/?view=races&distance=5k&registration=sold_out');
  const active = page.getByRole('group', { name: 'Active filters' });
  await active.getByRole('button', { name: 'Remove Distance: 5K' }).click();
  await expect(page).toHaveURL(/\/run\/\?view=races&registration=sold_out$/);
  const listURL = page.url();
  await page.locator('[data-kind]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(listURL);
  await expect(active.getByRole('button')).toHaveCount(1);
  await expect(
    active.getByRole('button', {
      name: 'Remove Registration: Sold out',
    }),
  ).toBeVisible();
});

test('long search labels remain plain text, fit the viewport and pass accessibility checks in both themes', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'tablet',
    'Desktop and phone cover both layouts',
  );
  const query = `<img src=x onerror=alert(1)> ${'longword'.repeat(30)}`;
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/?q=${encodeURIComponent(query)}&period=all&time=am`);
    const active = page.getByRole('group', { name: 'Active filters' });
    await expect(active).toBeVisible();
    await expect(active.locator('img')).toHaveCount(0);
    await expect(active.locator('[data-clear-filter="search"]')).toHaveText(
      `Search: ${query} ×`,
    );
    const width = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(width.document).toBeLessThanOrEqual(width.viewport);
    const { violations } = await new AxeBuilder({ page })
      .withTags([
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
        'wcag22aa',
        'best-practice',
      ])
      .analyze();
    expect(violations).toEqual([]);
  }
});
