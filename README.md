# Cetus - Sci-Fi Gaming Platform

A futuristic single-player gaming platform featuring interactive minigames with a focus on the "Quick Draw Challenge" drawing game. Built with Astro, TypeScript, and Tailwind CSS.

## 🚀 Quick Start

Requires [Bun](https://bun.sh) 1.3.14. This is a Bun-workspaces monorepo — the Astro app lives in `apps/web` (`@cetus/web`), portable code in `packages/` — with root scripts proxying into the app:

- `@cetus/shared` — portable domain (Zod request schemas, wire DTOs, score types)
- `@cetus/games` — portable game rules for all 23 games (depends on `@cetus/shared`)
- `@cetus/api-client` — typed client for the app API (depends on `@cetus/shared`)
- `@cetus/config` / `@cetus/tokens` — shared tooling configs and theme tokens

Dependency direction: `web → games/api-client → shared`. The web app owns renderers, DOM pages, Astro routing, auth and the database; new game rules belong in `@cetus/games` (no DOM), renderers stay in `apps/web`.

```sh
# Install dependencies
bun install

# Start development server (Turbo: database + web in parallel)
bun run dev

# Build for production (emits apps/web/dist)
bun run build

# Preview production build
bun run preview
```

Environment variables (`.env`) live in `apps/web/.env` (see `CLAUDE.md` for the full list).

## 🧪 Development Workflow

### Testing
```sh
# Run tests in watch mode
bun run test

# Run tests once
bun run test:run

# Run tests with coverage
bun run test:coverage

# Test UI
bun run test:ui
```

### End-to-End Testing
```sh
# Run Playwright E2E tests (webServer auto-runs `bun run e2e:db:init` first)
bun run test:e2e
```

### Code Quality
```sh
# Lint code
bun run lint

# Fix linting issues
bun run lint:fix

# Format code
bun run format

# Check formatting
bun run format:check

# Typecheck the web app
bun run typecheck

# Typecheck every workspace package (Turbo)
bun run turbo run typecheck
```

## 🔄 CI/CD Pipeline

The project uses GitHub Actions for automated testing and building:

- **Lint & Format**: ESLint and Prettier checks
- **Test**: Unit tests with Vitest
- **Build**: Astro production build
- **Coverage**: Test coverage reporting (optional Codecov integration)

The CI pipeline runs on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

### ⚠️ Playwright/Bun Compatibility Note

**Issue**: Playwright E2E tests may have compatibility issues with regular Bun due to memory constraints when running the full development server stack.

**Workaround**: E2E tests run under Bun in CI with optimized configuration. For local development, use Bun with reduced memory footprint if needed.

**For local development**:
- Use `bun run dev` for regular development (faster builds and hot reload)
- Use `bun --smol run dev` if you encounter memory issues with Playwright tests
- Use `bunx playwright test` for running E2E tests directly

**References**:
- [Playwright/Bun compatibility discussion](https://github.com/microsoft/playwright/issues/31106)
- [Bun memory management issues with complex dev servers](https://github.com/oven-sh/bun/issues/4287)

### Pre-commit Hooks

Husky is configured to run quality checks before commits:
- ESLint auto-fix on staged files
- Prettier formatting on staged files
- Tests run before push

## 🏗️ Tech Stack

- **Framework**: Astro 5.10.1 with TypeScript
- **Styling**: Tailwind CSS 4.1.3 with custom sci-fi theme
- **Testing**: Vitest with JSDOM
- **Graphics**: PixiJS 8.10.2 for canvas-based drawing
- **Database**: Turso (LibSQL) with Kysely query builder
- **Auth**: Better Auth with Google OAuth
- **Deployment**: Vercel

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/withastro/astro/tree/latest/examples/with-tailwindcss)
[![Open with CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/sandbox/github/withastro/astro/tree/latest/examples/with-tailwindcss)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/withastro/astro?devcontainer_path=.devcontainer/with-tailwindcss/devcontainer.json)
