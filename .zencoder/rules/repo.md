---
description: Repository Information Overview
alwaysApply: true
---

# Cetus - Sci-Fi Gaming Platform


## Summary
Cetus is a futuristic single-player gaming platform featuring interactive minigames with a focus on the "Quick Draw Challenge" drawing game and "Tetris Challenge". Built with Astro, TypeScript, and Tailwind CSS, it offers a sci-fi themed user interface with neon effects and animations. The platform includes multiple games such as Tetris, Bubble Shooter, Quick Math, and Memory Matrix.

## Structure
- **src/**: Main source code directory containing components, layouts, pages, and styles
  - **src/lib/**: Core application logic, game definitions, and utilities
  - **src/pages/**: Astro pages for each game and application routes
  - **src/components/**: Reusable UI components
- **public/**: Static assets like images and fonts
- **scripts/**: Database initialization and utility scripts
- **.github/**: CI/CD workflows and GitHub configurations
- **better-auth_migrations/**: Database migrations for authentication

## Language & Runtime
**Language**: TypeScript
**Version**: Based on tsconfig.json using Astro's strict TypeScript configuration
**Build System**: Astro build system
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- astro: ^5.10.1 - Main framework for building the application
- @astrojs/vercel: ^8.2.0 - Vercel adapter for Astro deployment
- @libsql/client: ^0.15.9 - Turso/LibSQL database client
- kysely: ^0.28.2 - SQL query builder for type-safe database operations
- better-auth: ^1.2.12 - Authentication library
- pixi.js: ^8.10.2 - Canvas-based graphics library for drawing game
- tailwindcss: ^4.1.3 - CSS framework for styling

**Development Dependencies**:
- vitest: ^3.2.4 - Testing framework with JSDOM for browser-like testing
- eslint: ^9.30.1 - Code linting
- prettier: ^3.6.2 - Code formatting
- husky: ^9.1.7 - Git hooks for code quality checks
- typescript-eslint: ^8.35.1 - TypeScript ESLint integration

## Build & Installation
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Database
**Type**: Turso (LibSQL/SQLite)
**Development Command**: `npm run db:dev`
**Schema**: 
- Authentication tables (user, session, account, verification) managed by better-auth
- Game-specific tables (game_scores, user_stats, user_achievements)
**Initialization**: `scripts/init-db.sql`
**Query Builder**: Kysely for type-safe database operations

## Testing
**Unit Testing Framework**: Vitest with JSDOM
**E2E Testing Framework**: Playwright
**Test Locations**: 
- Unit tests: `src/test/` and test files alongside source files
- E2E tests: `tests/e2e/`
**Naming Convention**: `*.test.ts` or `*.spec.ts`
**Configuration**: 
- Unit tests: `vitest.config.ts`
- E2E tests: `playwright.config.ts`
**Run Commands**:
```bash
# Unit tests
npm run test          # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:coverage # Run tests with coverage
npm run test:ui       # Run tests with UI

# E2E tests
npm run test:e2e      # Run E2E tests
npm run test:e2e:ui   # Run E2E tests with Playwright UI
npm run test:e2e:headed # Run E2E tests in headed mode
npm run test:e2e:debug  # Run E2E tests in debug mode
npm run test:e2e:report # Show E2E test report
```

## CI/CD Pipeline
**Provider**: GitHub Actions
**Workflow Files**: 
- `.github/workflows/ci.yml` - Main CI pipeline
- `.github/workflows/e2e-tests.yml` - E2E tests (manual trigger)

**Main CI Pipeline Steps**:
1. Lint & Format: ESLint and Prettier checks
2. Test: Unit tests with Vitest
3. Build: Astro production build
4. Coverage: Test coverage reporting

**E2E Pipeline**:
- **Trigger**: Manual (`workflow_dispatch`)
- **Options**: Browser selection (chromium/firefox/webkit/all), headed mode
- **Artifacts**: Playwright reports, screenshots, videos
- **Timeout**: 20 minutes

## Deployment
**Platform**: Vercel
**Configuration**: `astro.config.mjs` with Vercel adapter
**Output Mode**: Server-side rendering (`output: 'server'`)

## Authentication
**System**: better-auth library
**Providers**: 
- Email/Password authentication
- Google OAuth
**Session Management**: 7-day expiration with 1-day refresh
**Configuration**: Defined in `src/lib/auth.ts`

## Game System
**Games**: 
- Tetris Challenge: Classic block-stacking puzzle game
- Quick Draw: Fast-paced drawing and guessing game using PixiJS
- Bubble Shooter: Color matching bubble game
- Quick Math: Fast-paced math challenge
- Memory Matrix: Memory-based matching game

**Achievement System**: 
- Tiered achievements for each game with different rarity levels (common, rare, epic, legendary)
- Achievement definitions in `src/lib/achievements.ts`
- User achievements stored in database

## Main Features
- **Multiple Minigames**: Collection of interactive games with different mechanics
- **User Authentication**: Optional login to track scores and progress
- **Achievement System**: Unlock achievements based on game performance
- **Sci-Fi UI**: Custom Tailwind theme with neon effects, animations, and futuristic styling