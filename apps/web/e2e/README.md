# End-to-End Testing with Playwright

This directory contains end-to-end tests for the Cetus gaming platform using Playwright.

## Running E2E Tests

### Local Development

```bash
# Run E2E tests (all browsers)
bun run test:e2e

# Run E2E tests with UI (interactive mode)
bun run test:e2e:ui

# Run E2E tests in headed mode (see browser)
bun run test:e2e:headed

# Run E2E tests in debug mode
bun run test:e2e:debug

# Show test report
bun run test:e2e:report
```

### CI/CD

E2E tests are run separately from the main CI pipeline and must be triggered manually:

1. Go to the **Actions** tab in the GitHub repository
2. Select the **🎭 E2E Tests** workflow
3. Click **Run workflow**
4. Choose your options:
   - **Browser**: `chromium`, `firefox`, `webkit`, or `all`
   - **Headed Mode**: `true` or `false`

## Test Structure

- `homepage.spec.ts` - Tests for the main homepage navigation and game links
- Add new test files following the pattern: `[feature].spec.ts`

## Writing Tests

### Best Practices

1. **Use stable selectors**: Prefer `getByRole`, `getByText`, or `data-testid` attributes
2. **Keep tests deterministic**: Avoid hard waits, use Playwright's built-in waiting
3. **Follow the Page Object Model**: Extract reusable page interactions
4. **Test user journeys**: Focus on end-to-end user flows rather than isolated components

### Example Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Game Feature', () => {
  test('should allow user to play game', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to game
    await page.getByRole('link', { name: 'Play Now' }).first().click();
    
    // Verify game loaded
    await expect(page.getByRole('heading', { name: 'Game Title' })).toBeVisible();
    
    // Test game interaction
    await page.getByRole('button', { name: 'Start Game' }).click();
    
    // Verify game state
    await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible();
  });
});
```

## Configuration

The E2E tests are configured in `playwright.config.ts`:

- **Base URL**: `http://localhost:4325`
- **Browsers**: Chrome (Firefox/Safari projects are defined but commented out)
- **Database**: Playwright initializes `db/db.sqlite` (`bun run e2e:db:init`) and boots Astro with `E2E_FILE_DB=1`, so E2E runs against a file-backed DB — no `turso dev` process needed
- **Existing server**: `reuseExistingServer` is `false`. If `localhost:4325` is already serving (e.g. a `bun run web:dev` session), `bun run test:e2e` fails fast on the port conflict instead of silently running against that server's real database — stop the dev server first
- **Timeouts**: 30 seconds for actions
- **Artifacts**: Screenshots on failure, videos on retry
- **Parallelization**: Tests run in parallel for faster execution

## Troubleshooting

### Common Issues

1. **Test timeouts**: Increase timeout for slow operations
2. **Element not found**: Use `waitForSelector` or improve selectors
3. **Flaky tests**: Add proper waits and remove dependencies on timing

### Debugging

```bash
# Run single test in debug mode
bun run test:e2e:debug -- --grep "test name"

# Run specific test file
bun run test:e2e -- e2e/homepage.spec.ts

# Run with specific browser
bun run test:e2e -- --project=chromium
```

For more information, see the [Playwright documentation](https://playwright.dev/docs/intro).