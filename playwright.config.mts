import { defineConfig } from '@playwright/test';

// Tests always start this checkout's own server. Set PORT to use a free port
// when another preview (possibly from a different checkout) holds 4173.
const baseURL = `http://127.0.0.1:${process.env.PORT || 4173}`;

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '*.spec.mts',
  forbidOnly: Boolean(process.env.CI),
  workers: 2,
  retries: 0,
  // The full suite can need several minutes on hosted runners or a busy
  // machine; individual tests still use Playwright's 30-second default.
  globalTimeout: process.env.CI ? 300_000 : 600_000,
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run serve',
    url: baseURL,
    // An occupied port does not identify its checkout, so fail instead of
    // testing whatever is already there. PW_REUSE_SERVER=1 reuses a server
    // you started from this checkout with `npm run serve`.
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
