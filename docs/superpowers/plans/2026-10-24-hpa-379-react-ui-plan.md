# HPA-379 — Implementation plan (single PR)

Design: [HPA-379 React UI migration](../specs/2026-10-24-hpa-379-react-ui-design.md)
Linear: https://linear.app/cwchanap/issue/HPA-379/port-the-astro-ui-components-to-react-in-cetusui

**PR strategy:** one PR for HPA-379, with reviewable staged commits; no split PRs. This draft is *documentation only*, not a claim that implementation/testing is complete.

## Stage 0 — Inventory and baseline gates

- [ ] Confirm `main` contains merged HPA-447 and no ongoing overlapping UI migration.
- [ ] Inventory `apps/web/src/components/{ui,organisms,games}` and feature components; classify every usage: SSR-only vs interactive; capture DOM IDs, `data-*`, custom events, Astro slots, CSS and browser scripts.
- [ ] Establish baseline root `bun run typecheck`, `bun run lint`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`. Record any pre-existing failures rather than attributing them to migration.
- [ ] Take reference screenshots at desktop/mobile widths for home/catalog, dashboard, profile dropdown, Snake game/overlay, achievement and daily reward; reuse existing Playwright tools/fixtures.

## Stage 1 — React and package skeleton

- [ ] Add one compatible React/React DOM pair and `@astrojs/react` to `apps/web`/workspace, register `react()` alongside the current Vercel/Tailwind configuration. Confirm Astro 5 and TypeScript 6 compatibility when installing; do not guess version numbers.
- [ ] Create `packages/ui/package.json`, TS config and component entry points. Use React peer dependencies and `@cetus/shared` types; no Astro/runtime backend imports.
- [ ] Reuse existing `cn` behavior (clsx + tailwind-merge), existing `cva` library, and `@cetus/tokens`; **do not** add a design system, new themes or global state dependency.
- [ ] Add `@testing-library/react` to the web/UI test dependencies (the repo already has `@testing-library/dom` and jest-dom). Add UI jsdom tests to the root Vitest projects/coverage aggregation and package boundary rules to existing ESLint config.
- [ ] In `apps/web/src/styles/global.css`, keep the existing `@import 'tailwindcss' source('../..')` and add `@source "../../../../packages/ui";` near it. That path is relative to the stylesheet, **not** `../../packages/ui` as proposed in review. Smoke-test Astro SSR for a static component and `client:load` for an interactive one; assert a package-only utility appears in the built CSS.

## Stage 2 — Migrate static primitives and catalog (mechanical)

- [ ] Move variants and markup of Button, Card, Badge, Heading, Avatar, Container, Section, Pagination into typed TSX. Verify Button variant/size classes and Card bracket decorations exactly.
- [ ] Port Organism and SpecimenCard using `@cetus/shared/games` / `@cetus/shared/organisms`; move their scoped Astro CSS into imported plain CSS; keep existing `data-testid`, `data-color`, SVG and hover/focus behavior.
- [ ] Convert affected Astro callers to TSX component imports. Passive components are SSR-only, not `client:load`.
- [ ] Add React Testing Library tests for props, semantics, variants, catalog link disabled/active states and organism rendering. Delete replaced Astro files only after consumers compile.
- [ ] Gate: root typecheck, lint, unit tests, build and homepage/catalog Playwright or screenshot comparison.

## Stage 3 — Interactive primitives

- [ ] Port Select, Slider and Toggle with their current visuals and native controls/ARIA. Prefer simple React state/handlers over copying document-wide listeners. Do not implement Tabs/TabsTrigger/TabsContent: current code has no consumers.
- [ ] Inventory legacy events before removal and preserve events that have actual consumers. Do not create a `tab-change` adapter; the existing Tabs event has no listeners.
- [ ] Apply `client:load` only at owning interactive island boundaries. Verify controlled/uncontrolled values, keyboard, disabled, form submission, focus and no duplicate init on navigation.
- [ ] Gate: Testing Library event/keyboard tests plus representative browser flows.

## Stage 4 — Feature components and web adapters

- [ ] Port GameOverlay, AchievementAward, LoginRewardModal, ChallengeComplete, DailyMissionsPanel, UserDropdown. Keep existing IDs, class tokens and required UI behavior.
- [ ] Move auth/logout, reward claim and any server/service work to `apps/web` adapters. Props into `@cetus/ui` must be serializable data/callback contracts; do not import `@/lib/auth-client`, `@/lib/services` or server modules inside the package.
- [ ] For legacy imperatively invoked overlays, centralize transition ownership per component. Use a narrow bridge at the **web boundary** where pages currently call global handlers; eliminate the old competing listeners/templates after migrating consumers.
- [ ] Test achievement queue/dismissal, reward status/claim, daily challenge progress, logout and modal focus/ESC behavior using existing expectations (no speculative extra UX).
- [ ] Gate: dashboard/login/profile/overlay browser and screenshot checks; root quality gates.

## Stage 5 — Game presentation wrappers, preserving Astro shell

- [ ] Port GameTitle, GameBreadcrumb, GameStats and GameControls into `@cetus/ui` TSX; preserve game DOM IDs, visibility defaults and text/classes. Reuse the new React GameOverlay presentation.
- [ ] Keep `apps/web/src/components/games/GamePage.astro` as the thin adapter composing `AppLayout.astro` + **existing named slots and root-level scripts**. It can SSR the React presentational wrappers without hydrating the game HUD.
- [ ] Preserve `game-board`, custom `controls`, `additional-stats`, `game-info`, `bottom-info`, `final-stats` behavior. Do not import Astro layouts into `@cetus/ui`, hide page scripts in named slots or create an unused React GamePage implementation.
- [ ] Keep AstroContainer tests for this remaining shell and convert presentational wrapper tests to React Testing Library.
- [ ] Gate: Snake gameplay and score submission, custom-control page, game-over/restart, `window.snakeGame`, plus full Playwright. No rewrites of the 23 pages' gameplay scripts.

## Stage 6 — Cleanup, regression, single-PR finish

- [ ] Delete the unused `apps/web/src/components/ui/Tabs.astro`, `TabsTrigger.astro` and `TabsContent.astro` outright (plus orphaned Tab-only tests/styles); do **not** recreate them in React. Remove replaced Astro component files and old event scripts; check for dead imports, duplicate CSS and stale event listeners. The approved game-wrapper exception is the `GamePage.astro` layout/slot shell retained for HPA-393.
- [ ] Verify no `@cetus/ui` import reaches `apps/web`, Astro, Pixi, auth or server code; check there are no unnecessary hydrated static islands.
- [ ] Run `bun run typecheck`, `bun run lint`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`; record results and maintain 90% coverage gates. Compare reference screenshots at both widths and review client bundle/hydration behavior.
- [ ] Update the **same PR** with outcome, residual caveats and exact contract retained for HPA-393. Link it on HPA-379 (the October 24 reviewer approved the Astro shell exception and Tabs scope cut); do not mark ticket Done until implementation and gates pass.

## Expected files

- `packages/ui/{package.json,tsconfig.json,src/**}`: React components, local variants/CSS, tests.
- `apps/web/{astro.config.mjs,package.json,src/pages/**,src/components/**}`: integration, imports, thin adapters, legacy component deletion.
- `{package.json,bun.lock,vitest.config.ts,eslint.config.*}`: version pin, test aggregation, dependency boundary checks as needed.
- `apps/web/src/components/games/GamePage.astro`: retained transitional shell until HPA-393.
- Existing e2e tests and minimal adapter/contract tests adjusted; no new apps/services.

## Explicitly deferred

HPA-393 owns `GameScreen`, game-session hooks, per-game page script replacement, deleting the last `GamePage.astro` shell and game state ownership. HPA-182 owns `.native.tsx` counterparts and Expo screens. No refactor solely to support hypothetical future platforms.
