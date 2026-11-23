import { expect, test } from '@playwright/test';

/* What the page downloads and how it settles while loading. */

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
});

test('the page, its fonts and its data come only from the site itself', async ({
  page,
  baseURL,
}, testInfo) => {
  const elsewhere: string[] = [];
  const fonts: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:')) return;
    if (!url.startsWith(`${baseURL}/`)) elsewhere.push(url);
    if (request.resourceType() === 'font') fonts.push(new URL(url).pathname);
  });
  // Content Security Policy violations are reported as console errors.
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => face.family.replace(/"/g, ''));
  });
  expect(elsewhere).toEqual([]);
  expect(errors).toEqual([]);
  expect(new Set(loaded)).toEqual(new Set(['DM Sans', 'Space Mono']));
  // Each font file is fetched once from site/fonts.
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((font) => font.startsWith('/site/fonts/'))).toBe(true);
  expect(new Set(fonts).size).toBe(fonts.length);
  // Phones show no regular-weight Space Mono text, so they skip its file.
  if (testInfo.project.name === 'mobile')
    expect(fonts.filter((font) => font.includes('space-mono-400'))).toEqual([]);
});

test('the listings download once, alongside the modules', async ({ page }) => {
  const listings: string[] = [];
  let requested = () => {};
  const listingsRequested = new Promise<void>((resolve) => {
    requested = resolve;
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/data/site.json')) {
      listings.push(request.url());
      requested();
    }
  });
  // Hold back a module app.js imports until the listings are requested. A
  // request that waited for the app to run would only start after this gives
  // up.
  let heldUntilRequested = false;
  await page.route('**/site/model.js', async (route) => {
    heldUntilRequested = await Promise.race([
      listingsRequested.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(resolve, 5_000, false)),
    ]);
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  expect(heldUntilRequested).toBe(true);
  expect(listings).toHaveLength(1);
});

test('only wide screens download the introduction illustration, at the size shown', async ({
  page,
}, testInfo) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('running-together'))
      requested.push(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect(page.locator('[data-kind]').first()).toBeVisible();
  const art = page.locator('.intro-art img');
  if (testInfo.project.name === 'desktop') {
    await expect(art).toBeVisible();
    // A 600-pixel copy covers the at most 300 CSS pixels it is shown at on
    // one- and two-times displays.
    await expect
      .poll(() =>
        art.evaluate((image: HTMLImageElement) =>
          image.complete ? new URL(image.currentSrc).pathname : '',
        ),
      )
      .toBe('/site/running-together-600.webp');
    expect((await art.boundingBox())?.width).toBeLessThanOrEqual(300);
    expect(requested).toEqual(['/site/running-together-600.webp']);
  } else {
    await expect(art).toBeHidden();
    expect(requested).toEqual([]);
  }
});

// Web Vitals counts a page under 0.1 as good. On the default view only the
// view tab counts still widen the tabs a little on wide screens; an empty
// result gives back the line kept for the result summary.
for (const [path, limit] of [
  ['/', 0.01],
  ['/?q=no+such+run+anywhere', 0.05],
] as const)
  test(`listings arriving do not push the page around: ${path}`, async ({
    page,
  }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/data/*.json', async (route) => {
      await held;
      await route.continue();
    });
    await page.addInitScript(() => {
      const scores = window as unknown as { layoutShift: number };
      scores.layoutShift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          scores.layoutShift += (entry as unknown as { value: number }).value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const shift = () =>
      page.evaluate(
        () => (window as unknown as { layoutShift: number }).layoutShift,
      );
    await page.goto(path);
    await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => document.fonts.ready);
    // The closing note and footer wait for the listings instead of jumping.
    await expect(page.locator('.bottom-note')).toBeHidden();
    await expect(page.locator('footer')).toBeHidden();
    await page.waitForTimeout(100);
    const before = await shift();
    release();
    await expect(page.locator('#results')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    await expect(page.locator('footer')).toBeVisible();
    await page.waitForTimeout(250);
    expect((await shift()) - before).toBeLessThan(limit);
  });

test('phone links have full-size touch targets and filter menus show their values at 320px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Touch layout');
  for (const [width, path] of [
    [390, '/'],
    [320, '/'],
    [320, '/?view=races'],
  ] as const) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto(path);
    await expect(page.locator('[data-kind]').first()).toBeVisible();
    await page.locator('#advanced-filters summary').click();
    for (const link of await page
      .locator('.notice a, .bottom-note a, footer a')
      .all())
      expect(
        (await link.boundingBox())?.height,
        `${await link.textContent()} at ${width}px`,
      ).toBeGreaterThanOrEqual(44);
    const cramped = await page
      .locator('.select-label:not([hidden]) select')
      .evaluateAll((selects) => {
        const context = document.createElement('canvas').getContext('2d');
        if (!context) return ['no canvas'];
        return (selects as HTMLSelectElement[]).flatMap((select) => {
          const style = getComputedStyle(select);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const text = select.selectedOptions[0]?.text || '';
          // Leave room for the menu arrow.
          return select.clientWidth - context.measureText(text).width < 24
            ? [`#${select.id} "${text}"`]
            : [];
        });
      });
    expect(cramped, `${path} at ${width}px`).toEqual([]);
    // The suggestion link lines up with the text above it.
    const [text, link] = await Promise.all([
      page.locator('.bottom-note > div').boundingBox(),
      page.locator('.bottom-note a').boundingBox(),
    ]);
    expect(link?.x).toBe(text?.x);
  }
});

test('phone form fields use at least 16px text, so iOS does not zoom when one is focused', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone layout');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await page.locator('[data-kind]').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Every field, shown or not: filters, the date field and the dialog's
    // copy-link fallback.
    const small = await page.locator('input, select').evaluateAll((elements) =>
      elements.flatMap((element) => {
        const size = getComputedStyle(element).fontSize;
        return Number.parseFloat(size) < 16
          ? [`${element.id || element.parentElement?.className} ${size}`]
          : [];
      }),
    );
    expect(small, `at ${width}px`).toEqual([]);
    await expect(page.locator('.copy-fallback input')).toHaveCount(1);
  }
});
