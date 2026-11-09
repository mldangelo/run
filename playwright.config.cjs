const { defineConfig } = require('@playwright/test');
const baseURL = `http://127.0.0.1:${process.env.PORT || 4173}`;

module.exports = defineConfig({
  testDir: './tests/browser',
  testMatch: '*.spec.cjs',
  forbidOnly: Boolean(process.env.CI),
  workers: 2,
  retries: 0,
  globalTimeout: 120_000,
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
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
