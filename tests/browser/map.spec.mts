import { expect, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
});

async function openMap(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Neighborhood map' }).click();
}
/* The count a place's button shows, without its screen-reader unit. */
const countOf = async (page: Page, name: string) =>
  Number(
    await page
      .locator(`.map-place[data-place="${name}"] .map-count`)
      .evaluate((node) => node.firstChild?.textContent),
  );

test('choosing a place on the map lists its runs, and counts agree with the results', async ({
  page,
}) => {
  await openMap(page, '/?view=patterns&area=sf');
  const panel = page.getByRole('region', { name: 'Where regular runs meet' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.map-art svg')).toBeVisible();
  // The area filter applies to the counts, so Marin has no places.
  await expect(
    panel.getByRole('heading', { name: 'San Francisco' }),
  ).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: 'Marin County' }),
  ).toHaveCount(0);

  const name = 'Golden Gate Park / Panhandle';
  const count = await countOf(page, name);
  expect(count).toBeGreaterThan(1);
  const place = panel.getByRole('button', {
    name: `${name} ${count} regular runs`,
  });
  await place.click();
  await expect(place).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#neighborhood')).toHaveValue(name);
  expect(new URL(page.url()).searchParams.get('neighborhood')).toBe(name);
  await expect(page.locator('#result-count')).toHaveText(
    `${count} REGULAR RUNS`,
  );
  await expect(panel.locator('.map-marker.selected')).toHaveAttribute(
    'data-place',
    name,
  );
  await expect(panel.locator('.map-name.selected')).toHaveText(
    'Golden Gate Park',
  );
  const caption = page.locator('#map-caption');
  await expect(caption).toContainText(`${count} regular runs`);
  await expect(caption).toContainText('Kezar Stadium');
  await page
    .getByRole('button', { name: `Show the ${count} regular runs` })
    .click();
  await expect(page.locator('#results [data-kind]').first()).toBeFocused();

  // Choosing it again clears the filter; the marker works the same way.
  await place.click();
  await expect(page.locator('#neighborhood')).toHaveValue('all');
  // A hovering pointer may still preview the place, but nothing is chosen.
  await expect(page.locator('[data-map-show]')).toHaveCount(0);
  await panel.locator('.map-marker[data-place="Marina / Presidio"]').click();
  await expect(page.locator('#neighborhood')).toHaveValue('Marina / Presidio');
  await expect(
    panel.getByRole('button', {
      name: /^Marina \/ Presidio \d+ regular runs?$/,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('the map follows the view and keyboard users choose from its list', async ({
  page,
}) => {
  await openMap(page, '/');
  await expect(
    page.getByRole('region', { name: 'Where runs meet' }),
  ).toBeVisible();
  // Each place counts whole runs, not starts or clubs.
  const name = 'Embarcadero';
  const count = await countOf(page, name);
  const place = page.getByRole('button', {
    name: new RegExp(`^${name} ${count} runs?$`),
  });
  await place.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#neighborhood')).toHaveValue(name);
  await expect(place).toBeFocused();
  await expect(page.locator('#result-count')).toHaveText(
    `${count} RUN${count === 1 ? '' : 'S'}`,
  );
  // The map's markers are for pointers; the list is the one keyboard stop.
  await expect(page.locator('.map-marker').first()).toHaveAttribute(
    'tabindex',
    '-1',
  );
  await expect(page.locator('#map-canvas')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

  await page.locator('[data-view="clubs"]').click();
  await expect(
    page.getByRole('region', { name: 'Where clubs run' }),
  ).toBeVisible();
  await page.locator('[data-view="races"]').click();
  await expect(page.locator('#map-panel')).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Neighborhood map' }),
  ).toBeHidden();
  await page.locator('[data-view="patterns"]').click();
  await expect(
    page.getByRole('region', { name: 'Where regular runs meet' }),
  ).toBeVisible();
});

test('the map fits a phone, and its list works when the drawing cannot load', async ({
  page,
}) => {
  await page.route('**/site/sf-map.svg', (route) => route.abort());
  await openMap(page, '/?view=clubs');
  const panel = page.getByRole('region', { name: 'Where clubs run' });
  await expect(panel.locator('.map-marker').first()).toBeVisible();
  await expect(panel.locator('.map-art svg')).toHaveCount(0);
  const name = 'Mission / Dolores';
  const count = await countOf(page, name);
  await panel
    .getByRole('button', {
      name: new RegExp(`^${name.replace('/', '\\/')} ${count} clubs?$`),
    })
    .click();
  await expect(page.locator('#result-count')).toHaveText(
    `${count} CLUB${count === 1 ? '' : 'S'}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
