import { expect, test } from '@playwright/test';
import snapshot from '../fixtures/snapshot.json' with { type: 'json' };
import { replaceData } from './fixtures.mts';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
});

test('clubs are listed A to Z', async ({ page }) => {
  await page.goto('/?view=clubs');
  await expect(page.locator('#context-note')).toHaveText('A TO Z');
  const names = await page
    .locator('#results [data-kind="club"] .row-title')
    .evaluateAll((titles) =>
      titles.map((title) => title.firstChild?.textContent ?? ''),
    );
  expect(names.length).toBeGreaterThan(1);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test('a day of races runs in start order, and a row shows the start of the distances it lists', async ({
  page,
}) => {
  const race = snapshot.races[0];
  const distance = race.distances[0];
  await replaceData(page, {
    races: [
      {
        ...race,
        id: 'race-early-title',
        title: 'Apple Trot',
        distances: [{ ...distance, start_time: '08:05' }],
      },
      {
        ...race,
        id: 'race-late-title',
        title: 'Bay Trot',
        location: 'Several starts',
        distances: [
          { ...distance, start_time: '08:00', location: 'Ferry Building' },
          {
            ...distance,
            name: 'Kids run',
            category: 'other',
            start_time: '10:15',
            location: 'Kids Zone',
          },
        ],
      },
      {
        ...race,
        id: 'race-untimed',
        title: 'Aardvark Dash',
        distances: [{ ...distance, start_time: null }],
      },
    ],
  });
  await page.goto('/?view=races');
  const rows = page.locator('#results [data-kind="race"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('.row-title')).toContainText([
    'Bay Trot',
    'Apple Trot',
    'Aardvark Dash',
  ]);
  await expect(rows.first().locator('.row-place')).toContainText(
    'Several starts',
  );
  await page.goto('/?view=races&distance=other');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('.row-date')).toContainText('10:15 AM');
  await expect(rows.first().locator('.row-place')).toContainText('Kids Zone');
});
