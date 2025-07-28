# Cetus - Sci-Fi Gaming Platform Repository Rules

## Testing Framework
**E2E Testing Framework**: Playwright
- **Version**: Latest
- **Language**: TypeScript
- **Test Location**: `tests/e2e/`
- **Configuration**: `playwright.config.ts`
- **Run Commands**:
  - `npm run test:e2e` - Run E2E tests
  - `npm run test:e2e:ui` - Run E2E tests with Playwright UI
  - `npm run test:e2e:headed` - Run E2E tests in headed mode
  - `npm run test:e2e:debug` - Run E2E tests in debug mode
  - `npm run test:e2e:report` - Show E2E test report

## Test Structure
- **Page Object Model**: Used for maintainable test code
- **Test Categories**:
  - **Game Tests**: `tests/e2e/games/` - Individual game functionality tests
  - **Authentication Tests**: `tests/e2e/auth/` - Login/signup flow tests
  - **Navigation Tests**: `tests/e2e/games/all-games-navigation.spec.ts` - Cross-game navigation
  - **User Journey Tests**: `tests/e2e/user-journey/` - End-to-end user scenarios

## Element Selectors
- **Prefer Element IDs**: Use `#element-id` for reliable, stable selectors
- **Game-Specific IDs**:
  - **Tetris**: `#score`, `#level`, `#lines`, `#pieces-count`, `#start-btn`, `#pause-btn`, `#reset-btn`
  - **Quick Math**: `#score`, `#time-remaining`, `#question`, `#current-questions`, `#current-correct`, `#current-score`
- **Fallback**: Use semantic role-based selectors: `getByRole('button', { name: 'Button Text' })`
- **Avoid**: Generic CSS selectors that might match multiple elements

## Best Practices
- **Deterministic Tests**: No hard waits, use appropriate assertions
- **Stable Selectors**: Prefer data-testid, IDs, or ARIA roles over CSS classes
- **Page Object Pattern**: Encapsulate page interactions in Page Object classes  
- **Cross-Browser Testing**: Tests run on Chromium, Firefox, and Webkit
- **Test Independence**: Each test should be able to run independently
- **Meaningful Assertions**: Assert on user-visible behavior, not implementation details

## Game Testing Approach
- **Test Game States**: Initial state, running state, paused state, ended state
- **Test User Interactions**: Button clicks, form submissions, keyboard inputs
- **Test Navigation**: Between games, to home page, browser back/forward
- **Test Score Tracking**: Verify score updates, statistics, achievements
- **Test Error Handling**: Invalid inputs, network issues, game failures

## CI/CD Integration
- **GitHub Actions**: `.github/workflows/e2e-tests.yml`
- **Manual Trigger**: E2E tests run manually via workflow_dispatch
- **Artifacts**: Test reports, screenshots, videos saved on failure
- **Timeout**: 20 minutes maximum execution time
- **Parallel Execution**: Tests run in parallel across multiple workers

## Development Workflow
1. **Write Tests First**: Create E2E tests for new features before implementation
2. **Browser Verification**: Manually verify scenarios in browser before coding tests
3. **Element Inspection**: Use browser dev tools to find reliable selectors
4. **Test Execution**: Run tests locally before pushing changes
5. **CI Verification**: Ensure tests pass in CI environment

## Authentication Testing
- **Login Flow**: Email/password and Google OAuth
- **Signup Flow**: Account creation with validation
- **Session Management**: Login persistence and logout
- **Protected Routes**: Game features requiring authentication
- **Error States**: Invalid credentials, network failures

## Game-Specific Testing Notes
- **Tetris**: Canvas-based game, test via game state elements not canvas content
- **Quick Math**: Time-based game, use waitForTimeout judiciously
- **All Games**: Test basic gameplay loop, not complex game mechanics
- **Navigation**: Consistent navigation behavior across all games
- **Responsive**: Tests should work across different viewport sizes