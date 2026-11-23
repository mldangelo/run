import type { Page } from '@playwright/test';
import type { SiteData } from '../../scripts/types.mts';
import snapshot from '../fixtures/snapshot.json' with { type: 'json' };

/* The one data file the site loads. */
export const SITE_DATA = '**/data/site.json';

/* Serve the generated site data with the named members replaced and the rest
   unchanged. Pass every member to replace in one call. Playwright tries the
   latest matching route first, so call this after a broader route such as
   one mounting the Pages /run/ base. */
export async function replaceData(
  page: Page,
  members: Partial<Record<keyof SiteData, unknown>>,
) {
  await page.route(SITE_DATA, async (route) => {
    // The preview serves this checkout's file at the root under any base.
    const response = await route.fetch({
      url: new URL('/data/site.json', route.request().url()).href,
    });
    await route.fulfill({
      response,
      json: { ...(await response.json()), ...members },
    });
  });
}

// Navigation tests freeze time at November 9. Keep availability independent
// of research checks that can advance beyond that clock or change status.
export const soldOutRace = {
  ...snapshot.races[0],
  registration: {
    status: 'sold_out',
    source_url: 'https://example.org/race',
    checked_on: '2026-11-08',
    review_due: '2026-11-15',
    access_method: 'web',
    notes: 'Registration is sold out.',
  },
};
