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

## 📱 Mobile App (Expo)

`apps/mobile` (`@cetus/mobile`) is the Expo Router shell for iOS/Android: four tabs, the 23-game catalog from `@cetus/shared`, and Google/Apple **browser** sign-in against the same Better Auth server as the web app. Native game screens, native UI kit and Skia are separate tickets (HPA-182/HPA-425/HPA-533).

```sh
bun run mobile:dev              # expo start --dev-client (development builds only, no Expo Go)
bun run --cwd apps/mobile test    # mobile Jest (jest-expo; separate from root Vitest)
bun run --cwd apps/mobile typecheck
bun run --cwd apps/mobile lint
```

Package boundaries: mobile **application code** consumes `@cetus/shared` and `@cetus/api-client` only — no `@cetus/ui` (web React; native variants are HPA-182), `@cetus/games` or `@cetus/app-core` (not imported until native screens exist). Styling still pulls the shared theme tokens (`@cetus/tokens/theme.css` via `global.css`) and tooling extends `@cetus/config`.

**Mobile auth setup (manual prerequisites):**

- `EXPO_PUBLIC_API_BASE_URL` must point at the **fixed HTTPS origin** (e.g. a named Cloudflare Tunnel on an owned subdomain forwarding to local `bun run dev`) that the backend also uses as `BETTER_AUTH_URL`. Replace the placeholder in `apps/mobile/eas.json` before any EAS build (the app refuses to boot against it). This is the only public mobile env var — secrets (`APPLE_PRIVATE_KEY`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`) stay in `apps/web/.env` on the server.
- The backend serves the mobile OAuth flow only with `ENABLE_EXPO_AUTH=1` in `apps/web/.env`: it registers the Better Auth expo plugin (authorization proxy + `cetus://` deep-link origin). Leave it unset on deployments that serve web only — the proxy is an open redirector and should not run on production web.
- Apple sign-in needs a real Apple Developer setup: Services ID + return URL `<origin>/api/auth/callback/apple`, Team ID, Key ID and `.p8` key set via `APPLE_SERVICE_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` in `apps/web/.env` (all four or none; partial config fails fast with the missing names). Google needs redirect `<origin>/api/auth/callback/google`.
- Deep-link scheme is `cetus://`. Bundle ID `com.hapadona.cetus` is a **proposal pending owner confirmation**. No EAS project is linked yet — run `eas init` when the account exists; never invent a project ID.

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
- **Test**: Typecheck (`turbo run typecheck`), unit tests with Vitest, mobile Jest (jest-expo), and coverage
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
