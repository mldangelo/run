import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  // Never write to the machine's clipboard during browser checks.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copiedLink = text;
        },
      },
    });
  });
});

test('every listing can be copied with the keyboard without changing the current filters', async ({
  page,
}) => {
  for (const view of ['events', 'patterns', 'clubs', 'races']) {
    await page.goto(`/?view=${view}&q=run&period=all`);
    const row = page.locator('[data-kind]').first();
    const kind = await row.getAttribute('data-kind');
    const id = await row.getAttribute('data-id');
    const canonical = new URL(`/?${kind}=${id}`, page.url()).href;
    await row.click();
    const dialog = page.getByRole('dialog');
    const title = await dialog.getByRole('heading', { level: 2 }).textContent();
    const filteredURL = page.url();
    const copy = dialog.getByRole('button', { name: 'Copy link' });
    await copy.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('status')).toHaveText('Link copied.');
    await expect(page.locator('html')).toHaveAttribute(
      'data-copied-link',
      canonical,
    );
    await expect(copy).toBeFocused();
    await expect(page).toHaveURL(filteredURL);
    await page.goto(canonical);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('heading', { level: 2 }),
    ).toHaveText(title || '');
  }
});

test('copied links preserve the Pages base and work on repeated copies', async ({
  page,
}) => {
  await page.route('**/run/**', async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/run\//, '/');
    await route.fulfill({ response: await page.request.get(url.href) });
  });
  await page.goto('/run/?view=patterns&q=Kezar&day=wednesday');
  const row = page.locator('[data-kind]').first();
  const id = await row.getAttribute('data-id');
  const canonical = new URL(`/run/?pattern=${id}`, page.url()).href;
  await row.click();
  const copy = page.getByRole('button', { name: 'Copy link' });
  for (let attempt = 0; attempt < 2; attempt++) {
    await copy.click();
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
      'Link copied.',
    );
    await expect(page.locator('html')).toHaveAttribute(
      'data-copied-link',
      canonical,
    );
    await page.locator('html').evaluate((element) => {
      delete element.dataset.copiedLink;
    });
  }
  await page.goto(canonical);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('link', { name: 'DIRECT LINK' })).toHaveAttribute(
    'href',
    `?pattern=${id}`,
  );
});

for (const mode of ['denied', 'unavailable'])
  test(`clipboard ${mode}: the address is selected for manual copying and retry works`, async ({
    page,
  }) => {
    await page.goto('/?view=clubs&q=Kezar');
    await page.locator('[data-kind]').first().click();
    const dialog = page.getByRole('dialog');
    const canonical = new URL(
      (await dialog
        .getByRole('link', { name: 'DIRECT LINK' })
        .getAttribute('href')) || '',
      page.url(),
    ).href;
    await page.evaluate((mode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value:
          mode === 'unavailable'
            ? undefined
            : {
                writeText: async () => {
                  throw new Error('Permission denied');
                },
              },
      });
    }, mode);
    await dialog.getByRole('button', { name: 'Copy link' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Copy this address:');
    const address = dialog.getByRole('textbox', { name: 'Listing link' });
    await expect(address).toHaveValue(canonical);
    await expect(address).toHaveAttribute('readonly', '');
    await expect(address).toBeFocused();
    expect(
      await address.evaluate((input: HTMLInputElement) => [
        input.selectionStart,
        input.selectionEnd,
      ]),
    ).toEqual([0, canonical.length]);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async () => {} },
      });
    });
    await dialog.getByRole('button', { name: 'Copy link' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Link copied.');
    await expect(address).not.toBeVisible();
  });

test('a delayed clipboard failure cannot move focus after closing or replacing details', async ({
  page,
}) => {
  await page.goto('/?view=patterns');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () =>
          new Promise<void>((_, reject) => {
            document.addEventListener(
              'reject-copy',
              () => reject(new Error('Permission denied')),
              { once: true },
            );
          }),
      },
    });
  });
  for (const reopen of [false, true]) {
    const row = page.locator('[data-kind]').first();
    await row.click();
    const copy = page.getByRole('button', { name: 'Copy link' });
    const pending = await copy.elementHandle();
    await copy.click();
    await expect(copy).toHaveAttribute('aria-busy', 'true');
    await page.keyboard.press('Escape');
    if (reopen) await row.click();
    await page.evaluate(() => document.dispatchEvent(new Event('reject-copy')));
    await expect.poll(() => pending?.getAttribute('aria-busy')).toBeNull();
    if (reopen) {
      await expect(
        page.getByRole('button', { name: 'Close details' }),
      ).toBeFocused();
      await expect(page.getByRole('dialog').getByRole('status')).toBeEmpty();
    } else {
      await expect(row).toBeFocused();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
  }
});

test('the manual-copy fallback fits the dialog and passes accessibility checks in both themes', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'tablet',
    'Desktop and phone cover both layouts',
  );
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/?view=events&period=all');
    await page.locator('[data-kind]').first().click();
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', { value: undefined }),
    );
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(
      page.getByRole('textbox', { name: 'Listing link' }),
    ).toBeVisible();
    expect(
      await page
        .getByRole('dialog')
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    ).toBe(true);
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
