import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import events from '../../data/events.json' with { type: 'json' };

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

test('failed loads preserve shared links and recover with keyboard retry in both themes', async ({
  page,
}) => {
  let failures = 0;
  await page.route('**/data/events.json', (route) =>
    failures-- > 0
      ? route.fulfill({ status: 503, body: 'Temporarily unavailable' })
      : route.continue(),
  );
  for (const theme of ['light', 'dark'] as const) {
    failures = 2;
    await page.emulateMedia({ colorScheme: theme });
    const query = `?event=${events[0].id}&q=Rafiki&status=all`;
    await page.goto(`/${query}`);
    await expect(page.locator('#result-count')).toHaveText('DATA UNAVAILABLE');
    await expect(page.locator('#search')).toBeDisabled();
    await expect(page.locator('[data-view="races"]')).toBeDisabled();
    await expect(page.locator('#results')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect(new URL(page.url()).search).toBe(query);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(violations).toEqual([]);
    const retry = page.getByRole('button', { name: 'Try again' });
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(retry).toBeFocused();
    await expect(page.locator('#result-count')).toHaveText('DATA UNAVAILABLE');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('#search')).toBeEnabled();
    await expect(page.locator('#search')).toHaveValue('Rafiki');
    await expect(page.locator('#status')).toHaveValue('all');
    expect(new URL(page.url()).searchParams.get('event')).toBe(events[0].id);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
});

test('a stalled request times out and retry restores the requested view and filters', async ({
  page,
}) => {
  let stall = true;
  await page.route('**/data/races.json', (route) => {
    if (!stall) return route.continue();
  });
  await page.goto('/?view=races&distance=5k');
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#search')).toBeDisabled();
  await expect(page.locator('#result-count')).toHaveText('LOADING…');
  await page.clock.runFor(15_001);
  await expect(page.locator('#result-count')).toHaveText('DATA UNAVAILABLE');
  stall = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('[data-kind="race"]').first()).toBeVisible();
  await expect(page.locator('#distance')).toHaveValue('5k');
  await expect(page.locator('#section-title')).toBeFocused();
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'false');
});

for (const body of ['not JSON', '{"error":"unavailable"}'])
  test(`an invalid response remains an error and is retryable: ${body}`, async ({
    page,
  }) => {
    let invalid = true;
    await page.route('**/data/clubs.json', (route) =>
      invalid
        ? route.fulfill({ contentType: 'application/json', body })
        : route.continue(),
    );
    await page.goto('/');
    await expect(page.locator('#result-count')).toHaveText('DATA UNAVAILABLE');
    await expect(page.locator('[data-kind]')).toHaveCount(0);
    invalid = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('[data-kind]').first()).toBeVisible();
    await expect(page.locator('#section-title')).toBeFocused();
  });
