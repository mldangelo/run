import { expect, test } from '@playwright/test';
import clubs from '../../data/clubs.json' with { type: 'json' };
import events from '../../data/events.json' with { type: 'json' };
import races from '../../data/races.json' with { type: 'json' };
import schedules from '../../data/schedules.json' with { type: 'json' };

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

const name = 'Café Runner’s Club';
const location = 'Crane Cove Park';
const query = 'COVE   cafe runners';
const cases = [
  {
    view: 'events',
    dataset: 'events',
    record: { ...events[0], title: name, location, status: 'published' },
  },
  {
    view: 'patterns',
    dataset: 'schedules',
    record: {
      ...schedules[0],
      label: name,
      location,
      status: undefined,
      valid_from: null,
      valid_until: null,
    },
  },
  {
    view: 'clubs',
    dataset: 'clubs',
    record: { ...clubs[0], name, description: `Meets at ${location}.` },
  },
  {
    view: 'races',
    dataset: 'races',
    record: { ...races[0], title: name, location, status: 'scheduled' },
  },
];

for (const { view, dataset, record } of cases)
  test(`${view}: search combines words, preserves the query and respects other filters`, async ({
    page,
  }) => {
    await page.route(`**/data/${dataset}.json`, (route) =>
      route.fulfill({ json: [record] }),
    );
    await page.goto(`/?view=${view}`);
    const row = page.locator(`[data-id="${record.id}"]`);
    await expect(row).toBeVisible();
    await page.keyboard.press('/');
    await expect(page.locator('#search')).toBeFocused();
    await page.keyboard.type(query);
    await expect(row).toBeVisible();
    expect(new URL(page.url()).searchParams.get('q')).toBe(query);
    await page.reload();
    await expect(page.locator('#search')).toHaveValue(query);
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByRole('dialog')).toContainText(name);
    await page.goBack();
    await expect(row).toBeFocused();
    await expect(page.locator('#search')).toHaveValue(query);

    // Searching cannot include a listing excluded by another filter.
    if (view === 'clubs') await page.locator('#area').selectOption('unknown');
    else if (view === 'patterns') {
      await page.locator('#advanced-filters summary').click();
      await page.locator('#time').selectOption('unknown');
    } else await page.locator('#period').selectOption('past');
    await expect(row).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Clear filters', exact: true })
      .click();
    await expect(row).toBeVisible();
    await page.locator('#search').fill(`${query} missingword`);
    await expect(row).toHaveCount(0);
  });

test('combined searches keep their original text in shared Pages links', async ({
  page,
}) => {
  await page.route('**/run/**', async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/run\//, '/');
    await route.fulfill({ response: await page.request.get(url.href) });
  });
  await page.goto('/run/?view=clubs&q=Crane+Rafiki');
  const row = page.locator('[data-id="gr8tr-u-rafiki-run-club"]');
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole('dialog')).toContainText('Rafiki');
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#search')).toHaveValue('Crane Rafiki');
  await page.getByRole('button', { name: 'Close details' }).click();
  await expect(page).toHaveURL(/\/run\/\?view=clubs&q=Crane\+Rafiki$/);
  await expect(row).toBeFocused();
});
