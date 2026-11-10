import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/* Automated accessibility checks for the markup the app generates at
   runtime, which static linters cannot see. axe covers WCAG 2.2 A/AA and
   best practices, including contrast in both themes. */
const TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
];
const VIEWS = ['events', 'patterns', 'clubs', 'races'] as const;

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

async function expectNoViolations(page: Page, state: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .analyze();
  expect(
    violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join('; ')})`,
    ),
    state,
  ).toEqual([]);
}
/* Every link that opens a new tab says so to screen readers. */
async function expectNewTabLinksAnnounced(page: Page, state: string) {
  const unlabeled = await page
    .locator('a[target="_blank"]')
    .evaluateAll((links) =>
      links
        .filter(
          (link) =>
            !link.querySelector('.sr-only')?.textContent?.includes('new tab'),
        )
        .map((link) => link.textContent?.trim()),
    );
  expect(unlabeled, state).toEqual([]);
}

for (const view of VIEWS)
  test(`${view}: list, filters and details pass automated checks in both themes`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'tablet',
      'Desktop and phone layouts cover the markup',
    );
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`/?view=${view}`);
      await expect(page.locator('[data-kind]').first()).toBeVisible();
      await page.locator('#advanced-filters summary').click();
      await expectNoViolations(page, `${view} list, ${theme}`);
      await expectNewTabLinksAnnounced(page, `${view} list`);
      await page.locator('[data-kind]').first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoViolations(page, `${view} details, ${theme}`);
      await expectNewTabLinksAnnounced(page, `${view} details`);
    }
  });

test('an empty result passes automated checks', async ({ page }) => {
  await page.goto('/?q=no+such+run+anywhere');
  await expect(page.locator('.empty')).toBeVisible();
  await expectNoViolations(page, 'empty results');
});

test('keyboard users can skip ahead, and closing details returns focus to the listing', async ({
  page,
}) => {
  await page.goto('/');
  const row = page.locator('[data-kind]').nth(1);
  await expect(row).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close details' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  // A shared link opens details with nothing focused before it.
  const kind = await row.getAttribute('data-kind');
  const id = await row.getAttribute('data-id');
  await page.goto(`/?${kind}=${id}`);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.locator(`[data-kind="${kind}"][data-id="${id}"]`),
  ).toBeFocused();
});

test('detail sections are headings screen reader users can jump between', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-kind]').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveCount(1);
  await expect(
    dialog.getByRole('heading', { level: 3, name: 'MEETING PLACE' }),
  ).toBeVisible();
});

test('the selected index and status tags stay visible in forced colors', async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/?status=all');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  const fill = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await fill('.view-tabs .selected')).not.toEqual(
    await fill('.view-tabs button:not(.selected)'),
  );
  const tag = page.locator('.tag').first();
  await expect(tag).toBeVisible();
  expect(
    await tag.evaluate((element) => getComputedStyle(element).borderStyle),
  ).toBe('solid');
});
