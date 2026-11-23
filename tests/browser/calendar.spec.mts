import { readFile } from 'node:fs/promises';
import { type Download, expect, test } from '@playwright/test';
import events from '../../data/events.json' with { type: 'json' };
import races from '../../data/races.json' with { type: 'json' };
import { replaceData } from './fixtures.mts';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

/* The downloaded file's unfolded content lines, after checking CRLF. */
async function calendarLines(download: Download) {
  const text = await readFile((await download.path()) || '', 'utf8');
  expect(text.endsWith('\r\n')).toBe(true);
  expect(/[^\r]\n/.test(text)).toBe(false);
  return text.slice(0, -2).replace(/\r\n /g, '').split('\r\n');
}

const run = {
  ...events[0],
  id: 'evt-calendar-test',
  title: 'Café Long Run — Calendar Test',
  // November 14 is in Pacific Standard Time (UTC-8).
  starts_at_local: '2026-11-14T08:00',
  ends_at_local: '2026-11-14T09:30',
  status: 'published',
  location: 'Ferry Building, San Francisco',
  notes: 'Bring water; meet by the clock tower.',
};
const race = {
  ...races[0],
  id: 'calendar-test-relay',
  title: 'Calendar Test Relay',
  date: '2026-11-14',
  end_date: '2026-11-15',
  status: 'scheduled',
};

test('a run downloads as a calendar file with the keyboard, keeping the Pages base', async ({
  page,
}) => {
  await page.route('**/run/**', async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/run\//, '/');
    await route.fulfill({ response: await page.request.get(url.href) });
  });
  await replaceData(page, { events: [run] });
  await page.goto(`/run/?event=${run.id}`);
  const dialog = page.getByRole('dialog');
  const button = dialog.getByRole('button', { name: 'Add to calendar' });
  await expect(button).toBeVisible();
  const shownURL = page.url();
  await button.focus();
  const downloading = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(
    'cafe-long-run-calendar-test-2026-11-14.ics',
  );
  const lines = await calendarLines(download);
  expect(lines.slice(0, 5)).toEqual([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SF Run Club Index//Add to calendar//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
  ]);
  expect(lines).toContain('UID:evt-calendar-test@mldangelo.github.io');
  expect(lines).toContain('DTSTAMP:20261109T120000Z');
  expect(lines).toContain('DTSTART:20261114T160000Z');
  expect(lines).toContain('DTEND:20261114T173000Z');
  expect(lines).toContain('SUMMARY:Café Long Run — Calendar Test');
  expect(lines).toContain('LOCATION:Ferry Building\\, San Francisco');
  expect(lines).toContain(
    `URL:${new URL(`/run/?event=${run.id}`, page.url()).href}`,
  );
  const description = lines.find((line) => line.startsWith('DESCRIPTION:'));
  expect(description).toContain('Bring water\\; meet by the clock tower.');
  expect(description).toContain('Confirm with the club or organizer');
  expect(lines.slice(-2)).toEqual(['END:VEVENT', 'END:VCALENDAR']);
  // Saving the file leaves the visitor where they were.
  await expect(dialog).toBeVisible();
  await expect(button).toBeFocused();
  await expect(page).toHaveURL(shownURL);
});

test('a race downloads as an all-day calendar entry', async ({ page }) => {
  await replaceData(page, { races: [race] });
  await page.goto(`/?race=${race.id}`);
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add to calendar' })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(
    'calendar-test-relay-2026-11-14.ics',
  );
  const lines = await calendarLines(download);
  expect(lines).toContain('DTSTART;VALUE=DATE:20261114');
  // The end date is exclusive: a race through November 15 ends on the 16th.
  expect(lines).toContain('DTEND;VALUE=DATE:20261116');
  expect(lines).toContain('SUMMARY:Calendar Test Relay');
  expect(lines).toContain(`URL:${new URL(`/?race=${race.id}`, page.url())}`);
  expect(lines.some((line) => /^DT(START|END):/.test(line))).toBe(false);
});

for (const [kind, status, offered] of [
  ['event', 'published', true],
  ['event', 'unconfirmed', true],
  ['event', 'cancelled', false],
  ['event', 'postponed', false],
  ['race', 'scheduled', true],
  ['race', 'cancelled', false],
  ['race', 'postponed', false],
] as const)
  test(`a ${status} ${kind} ${offered ? 'offers' : 'does not offer'} Add to calendar`, async ({
    page,
  }) => {
    const record = { ...(kind === 'event' ? run : race), status };
    await replaceData(page, {
      [kind === 'event' ? 'events' : 'races']: [record],
    });
    await page.goto(`/?${kind}=${record.id}`);
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('button', { name: 'Copy link' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Add to calendar' }),
    ).toHaveCount(offered ? 1 : 0);
  });

test('regular runs and clubs have no calendar download', async ({ page }) => {
  for (const view of ['patterns', 'clubs']) {
    await page.goto(`/?view=${view}`);
    await page.locator('[data-kind]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('button', { name: 'Copy link' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Add to calendar' }),
    ).toHaveCount(0);
  }
});

test('Add to calendar matches the other detail actions and is easy to tap', async ({
  page,
}) => {
  await replaceData(page, { events: [run] });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/?event=${run.id}`);
    const dialog = page.getByRole('dialog');
    const style = (name: string) =>
      dialog
        .getByRole('button', { name })
        .evaluate((element) =>
          [
            'font',
            'color',
            'background-color',
            'text-decoration-line',
            'border-top-width',
          ].map((property) =>
            getComputedStyle(element).getPropertyValue(property),
          ),
        );
    expect(await style('Add to calendar')).toEqual(await style('Copy link'));
    const box = await dialog
      .getByRole('button', { name: 'Add to calendar' })
      .boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('past runs and races are not offered for calendars', async ({ page }) => {
  await replaceData(page, {
    events: [
      {
        ...run,
        id: 'evt-calendar-past',
        starts_at_local: '2026-11-08T08:00',
        ends_at_local: '2026-11-08T09:00',
      },
    ],
    races: [
      {
        ...race,
        id: 'race-calendar-past',
        date: '2026-11-07',
        end_date: '2026-11-08',
      },
    ],
  });
  for (const path of [
    '/?event=evt-calendar-past',
    '/?race=race-calendar-past',
  ]) {
    await page.goto(path);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Add to calendar' }),
    ).toHaveCount(0);
  }
});
