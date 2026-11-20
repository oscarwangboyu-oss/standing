import { defineConfig } from '@playwright/test';

/**
 * Flow tests (tests/e2e). Phone viewports only, in the Chrome that is installed on this
 * computer (channel "chrome"), so no browser download is needed.
 *
 * The web server is a production build of the app on its own port with its own embedded
 * database directory (.data/e2e). The directory is emptied before each run, so the tests never
 * read or write the data of `npm run dev` (.data/local) and always start from nothing.
 */
const PORT = 8799;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Passphrase of the team dashboard in the e2e server. Tests import it from here. */
export const E2E_TEAM_PASSPHRASE = 'e2e-team-passphrase';

const phone = {
  browserName: 'chromium',
  channel: 'chrome',
  isMobile: true,
  hasTouch: true,
} as const;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  // One embedded database behind the server: run the files one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // The narrowest width the design supports.
    { name: 'phone-360', use: { ...phone, viewport: { width: 360, height: 740 }, deviceScaleFactor: 3 } },
    // A current large phone.
    { name: 'phone-412', use: { ...phone, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625 } },
  ],
  webServer: {
    command:
      `node -e "require('node:fs').rmSync('.data/e2e',{recursive:true,force:true})" && ` +
      `npx next build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // Its own build folder, so a running preview keeps its build (next.config.ts).
      STANDING_DIST_DIR: '.next-e2e',
      STANDING_ENV: 'local',
      STANDING_DB_DIR: '.data/e2e',
      DATABASE_URL: '',
      ADMIN_PASSPHRASE: E2E_TEAM_PASSPHRASE,
      FLAG_DAILY_OPEN: 'on',
      FLAG_PAYDAY: 'on',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
