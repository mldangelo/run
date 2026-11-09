import assert from 'node:assert/strict';
import { expect, type Page, test } from '@playwright/test';
import events from '../../data/events.json' with { type: 'json' };
import races from '../../data/races.json' with { type: 'json' };

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

async function replaceData(page: Page, name: string, records: unknown[]) {
  await page.route(`**/data/${name}.json`, (route) =>
    route.fulfill({ json: records }),
  );
}

for (const status of ['cancelled', 'postponed']) {
  for (const [name, kind, records] of [
    ['events', 'event', events],
    ['races', 'race', races],
  ] as const) {
    test(`${status} ${kind} permalinks preserve their status and stay out of results`, async ({
      page,
    }) => {
      const record = { ...records[0], status };
      await replaceData(page, name, [record]);
      await page.goto(`/?${kind}=${record.id}`);
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('.detail-label')).toContainText(
        status.toUpperCase(),
      );
      await expect(page.locator('.status-warning')).toContainText(
        'Previously listed details',
      );
      await expect(page.locator('.detail-label')).not.toContainText(
        'PUBLISHED',
      );
      await page.getByRole('button', { name: 'Close details' }).click();
      await expect(page.locator(`[data-id="${record.id}"]`)).toHaveCount(0);
    });
  }
}

test('the displayed start and location match the time filter', async ({
  page,
}) => {
  const record = {
    ...events[0],
    starts_at_local: '2026-11-09T12:00',
    location: 'Noon meeting place',
    meeting_options: [
      {
        local_time: '11:45',
        location: 'Morning meeting place',
        details: 'Early start',
      },
    ],
  };
  await replaceData(page, 'events', [record]);
  await page.goto('/?time=am');
  const row = page.locator(`[data-id="${record.id}"]`);
  await expect(row).toContainText('11:45 AM');
  await expect(row).toContainText('Morning meeting place');
  await expect(row).not.toContainText('Noon meeting place');
});

test('simultaneous starts retain the primary location and indicate other choices', async ({
  page,
}) => {
  const record = {
    ...events[0],
    starts_at_local: '2026-11-09T07:00',
    location: 'Primary meeting place',
    meeting_options: [
      {
        local_time: '07:00',
        location: 'Alternate meeting place',
        details: 'Same time, different place',
      },
    ],
  };
  await replaceData(page, 'events', [record]);
  await page.goto('/');
  const row = page.locator(`[data-id="${record.id}"]`);
  await expect(row).toContainText('Primary meeting place');
  await expect(row).toContainText('7:00 AM + more');
  await row.click();
  await expect(page.getByRole('dialog')).toContainText(
    'Alternate meeting place',
  );
});

test('an event with a remaining alternate start is upcoming and not past', async ({
  page,
}) => {
  const record = events.find((event) => event.id === 'evt-3ef072fa559e');
  assert(record);
  await page.clock.setFixedTime(new Date('2026-11-12T14:50:00Z'));
  await replaceData(page, 'events', [record]);
  await page.goto('/');
  await expect(page.locator(`[data-id="${record.id}"]`)).toContainText(
    '7:00 AM',
  );
  await page.locator('#period').selectOption('past');
  await expect(page.locator(`[data-id="${record.id}"]`)).toHaveCount(0);
  await page.clock.setFixedTime(new Date('2026-11-12T15:01:00Z'));
  await page.reload();
  await expect(page.locator(`[data-id="${record.id}"]`)).toBeVisible();
});

test('filters can be cleared with matching results and bookmarked advanced choices stay visible', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  await expect(page.locator('#advanced-filters')).not.toHaveAttribute(
    'open',
    '',
  );
  await page.locator('#search').fill('SFH3');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(page.locator('#search')).toHaveValue('');
  await page.locator('#advanced-filters summary').click();
  await page.locator('#time').selectOption('am');
  await expect(page.locator('#filter-summary')).toHaveText(' · 1 active');
  const clear = await page.locator('#reset-filters').boundingBox();
  assert(clear);
  const controls = await page.locator('.advanced-controls').boundingBox();
  assert(controls);
  expect(clear.y + clear.height).toBeLessThanOrEqual(controls.y);
  await page.reload();
  await expect(page.locator('#time')).toBeVisible();
  await expect(page.locator('#time')).toHaveValue('am');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await expect(page.locator('#time')).toHaveValue('all');
  await expect(page.locator('#advanced-filters')).not.toHaveAttribute(
    'open',
    '',
  );
});

test('every view fits narrow and tablet screens in both themes', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  const widths = {
    desktop: [1024, 1440],
    tablet: [761, 768, 820, 1000],
    mobile: [320, 390],
  }[testInfo.project.name as 'desktop' | 'tablet' | 'mobile'];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ['light', 'dark']) {
      await page.locator('#theme').selectOption(theme);
      for (const view of ['events', 'patterns', 'clubs', 'races']) {
        await page.locator(`[data-view="${view}"]`).click();
        const size = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        expect(
          size.document,
          `${view}, ${theme}, ${width}px`,
        ).toBeLessThanOrEqual(size.viewport);
      }
    }
  }
});

test('a phone shows the first listing without a full screen of scrolling', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone layout assertion');
  await page.goto('/');
  const row = page.locator('[data-kind]').first();
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  assert(box);
  expect(box.y).toBeLessThan(784);
});

test('recorded distance options can be found and agree with the detail dialog', async ({
  page,
}) => {
  await page.goto('/?run_distance=up_to_3&q=Wednesday+Fun+Run+in+the+Presidio');
  const row = page.locator('[data-id="evt-01a00397ace4"]');
  await expect(row).toBeVisible();
  await row.click();
  const details = page.getByRole('dialog');
  await expect(details).toContainText('3 miles (no-drop option)');
  await expect(details).toContainText('5–6 miles');
  await expect(details).not.toContainText('Distance: Not listed');
});

test('long RSVP URLs fit inside a narrow detail dialog', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/?event=evt-202ccd19d257');
  await expect(page.getByRole('dialog')).toBeVisible();
  const size = await page.locator('.dialog-body').evaluate((element) => ({
    width: element.clientWidth,
    content: element.scrollWidth,
  }));
  expect(size.content).toBeLessThanOrEqual(size.width);
});

test('registration filters, distance availability, dates and shared dialogs agree', async ({
  page,
}) => {
  const registration = {
    status: 'open',
    checked_on: '2026-11-09',
    review_due: '2026-11-16',
    source_url: 'https://example.org/evidence',
    url: 'https://example.org/enter',
    notes: 'Current edition entries.',
    closes_at: '2026-11-13T22:00',
  };
  const race = {
    ...races[0],
    registration,
    distances: [
      { name: '5K', category: '5k', start_time: '08:00', location: null },
      {
        name: 'Half marathon',
        category: 'half',
        start_time: '13:00',
        location: null,
        registration: {
          ...registration,
          status: 'sold_out',
          notes: 'Half marathon at capacity.',
        },
      },
    ],
  };
  await replaceData(page, 'races', [race]);
  await page.goto('/?view=races&registration=mixed');
  const row = page.locator(`[data-id="${race.id}"]`);
  await expect(row).toContainText('Varies by distance');
  await expect(page.locator('#registration')).toBeVisible();
  await page.locator('#registration').selectOption('open');
  await expect(row).toContainText('Registration open');
  await expect(row).toContainText('5K');
  await expect(row).not.toContainText('Half marathon');
  await row.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Varies by distance');
  await expect(dialog).toContainText('Sold out');
  await expect(dialog).toContainText('10:00 PM Pacific');
  await expect(
    dialog
      .getByRole('link', { name: 'Registration source', exact: false })
      .first(),
  ).toHaveAttribute('href', registration.source_url);
  await page.reload();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#registration')).toHaveValue('open');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.locator('#distance').selectOption('half');
  await expect(row).toHaveCount(0);
  await page.locator('#registration').selectOption('sold_out');
  await expect(row).toContainText('Half marathon');
  await expect(row).not.toContainText('5K');
});

test('stale and unverified registration cannot look open, even at a race permalink', async ({
  page,
}) => {
  const race = {
    ...races[0],
    registration: {
      status: 'open',
      checked_on: '2026-10-01',
      review_due: '2026-10-08',
      source_url: 'https://example.org/evidence',
      notes: 'Earlier availability.',
    },
  };
  await replaceData(page, 'races', [
    race,
    { ...races[1], registration: undefined },
  ]);
  await page.goto('/?view=races&registration=open');
  await expect(page.locator('#snapshot-text')).toContainText(
    'Registration availability is shown separately',
  );
  await expect(page.locator('[data-kind="race"]')).toHaveCount(0);
  await page.locator('#registration').selectOption('unknown');
  await expect(page.locator('[data-kind="race"]')).toHaveCount(2);
  await page.goto(`/?race=${race.id}`);
  await expect(page.getByRole('dialog')).toContainText(
    'Last reported: Registration open',
  );
  await expect(page.getByRole('dialog').locator('.tag')).toContainText(
    'Check registration',
  );
});

test('registration filters and race permalinks work under the Pages /run/ base', async ({
  page,
}) => {
  // Mount this checkout at the production prefix without relying on the dev
  // server to provide a /run/ directory.
  await page.route('**/run/**', async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/run\//, '/');
    await route.fulfill({ response: await page.request.get(url.href) });
  });
  await page.goto('/run/?view=races&registration=sold_out');
  const row = page.locator('[data-id="sf-turkey-2026"]');
  await expect(row).toContainText('Sold out');
  await row.click();
  await expect(page).toHaveURL(
    /\/run\/\?.*registration=sold_out.*race=sf-turkey-2026/,
  );
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('Sold out');
  await expect(page.getByRole('link', { name: 'DIRECT LINK' })).toHaveAttribute(
    'href',
    '?race=sf-turkey-2026',
  );
});
