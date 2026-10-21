import { defineConfig, devices } from '@playwright/test'

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './e2e',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    // Never auto-open the HTML report in any environment. On CI, also emit GitHub annotations.
    reporter: process.env.CI
        ? [['html', { open: 'never' }], ['github']]
        : [['html', { open: 'never' }]],
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:4325',
        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
        /* Take screenshot on failure */
        screenshot: 'only-on-failure',
        /* Capture video on failure */
        video: 'retain-on-failure',
        /* Ensure headless mode to avoid GUI/app launches in CI */
        headless: true,
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },

        // {
        //     name: 'firefox',
        //     use: { ...devices['Desktop Firefox'] },
        // },

        // {
        //     name: 'webkit',
        //     use: { ...devices['Desktop Safari'] },
        // },

        /* Test against mobile viewports. */
        // {
        //   name: 'Mobile Chrome',
        //   use: { ...devices['Pixel 5'] },
        // },
        // {
        //   name: 'Mobile Safari',
        //   use: { ...devices['iPhone 12'] },
        // },

        /* Test against branded browsers. */
        // {
        //   name: 'Microsoft Edge',
        //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
        // },
        // {
        //   name: 'Google Chrome',
        //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
        // },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        // CI and local runs both use the Astro-only dev server — no turso
        // process. The DB connects via the file-based fallback under
        // apps/web/db: src/lib/server/db/client.ts activates it when CI is
        // set, and E2E_FILE_DB=1 opts local runs into the same path.
        // better-auth stopped auto-creating its tables in 1.7, so initialize
        // the schema (auth + game tables) before the server starts.
        command: 'bun run e2e:db:init && E2E_FILE_DB=1 bun run web:dev',
        url: 'http://localhost:4325',
        reuseExistingServer: !process.env.CI,
    },
})
