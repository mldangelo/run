const { test, expect } = require('@playwright/test');
const events = require('../../data/events.json');
const races = require('../../data/races.json');

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

async function replaceData(page, name, records) {
  await page.route(`**/data/${name}.json`, (route) =>
    route.fulfill({ json: records }),
  );
}

for (const status of ['cancelled', 'postponed']) {
  for (const [name, kind, records] of [
    ['events', 'event', events],
    ['races', 'race', races],
  ]) {
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
  const controls = await page.locator('.advanced-controls').boundingBox();
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
  }[testInfo.project.name];
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
