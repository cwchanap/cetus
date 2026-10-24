# HPA-379 — Implementation plan (single PR)

Design: [HPA-379 React UI migration](../specs/2026-10-24-hpa-379-react-ui-design.md)
Linear: https://linear.app/cwchanap/issue/HPA-379/port-the-astro-ui-components-to-react-in-cetusui

**PR strategy:** one PR for HPA-379, with reviewable staged commits; no split PRs. This draft is *documentation only*, not a claim that implementation/testing is complete.

## Stage 0 — Inventory and baseline gates

- [ ] Confirm `main` contains merged HPA-447 and no ongoing overlapping UI migration.
- [x] Review inventory is complete: Card 31, Button 23, Badge 23, Container 10, Heading 9, Section 9, Select 2, Avatar/Pagination/Slider/Toggle/SpecimenCard 1 each, Tabs family 0, and web-owned feature consumers identified. Key integration seam: `settings.astro` uses `toggle-change`/`slider-change` and expando setters; achievements and leaderboard use hidden Select input changes; AppLayout provides notification overlays; Navigation owns UserDropdown. Reconfirm the touched paths against current `main` when implementation starts; **no separate inventory artifact**.
- [ ] Establish baseline root `bun run typecheck`, `bun run lint`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`. Record any pre-existing failures rather than attributing them to migration.
- [ ] Capture ad-hoc desktop/mobile references for home/catalog, dashboard, profile dropdown, Snake game/overlay, achievement and daily reward using existing Playwright facilities. No new `toHaveScreenshot` baseline framework.

## Stage 1 — React and package skeleton

- [ ] Add one compatible React/React DOM pair and `@astrojs/react` to `apps/web`/workspace, register `react()` alongside the current Vercel/Tailwind configuration. Confirm Astro 5 and TypeScript 6 compatibility when installing; do not guess version numbers.
- [ ] Create `packages/ui/package.json`, TS config and component entry points. Use React peer dependencies and `@cetus/shared` types; no Astro/runtime backend imports.
- [ ] Move `cn` (clsx + tailwind-merge) from `apps/web/src/lib/utils.ts` into `@cetus/ui`; keep the existing web file as a one-line re-export, avoiding duplicate behavior and ~19 importer edits. Reuse existing `cva`, `@cetus/tokens` and shared DTOs (`LoginRewardStatusResponse`, `UserChallengeProgress`), not new view-model types or a state library.
- [ ] Add `@testing-library/react` to web/UI test deps (DOM and jest-dom are already installed). Add a `packages/ui` **jsdom** project to root Vitest `test.projects`, loading `apps/web/src/test/setup.ts`; exclude `**/*.test.tsx` and `**/*.spec.tsx` alongside their `.ts` equivalents from root coverage. Confirm 90% gates measure executable UI source, not the tests themselves.
- [ ] Update existing root ESLint `packages/**/*.ts`/package-direction globs to `**/*.{ts,tsx}`. Add a `packages/ui` direction rule: allow `@cetus/shared`/`@cetus/tokens`, deny `@cetus/games`, `@cetus/api-client`, Astro, Pixi, database and web aliases/imports. Prove enforcement once by injecting then removing a forbidden import in a `.tsx` fixture.
- [ ] Introduce `apps/web/src/test/createContainer.ts`: call `loadRenderers([getContainerRenderer()])` from `astro:container` and `@astrojs/react` then `AstroContainer.create({ renderers })` (verify installed integration export). Switch every AstroContainer test with React descendants—AppLayout, homepage, abyssal shell, wrappers and shell-token tests—to this helper **before** converting components.
- [ ] In `apps/web/src/styles/global.css`, keep the existing `@import 'tailwindcss' source('../..')` and add `@source "../../../../packages/ui";` near it. That path is relative to the stylesheet, **not** `../../packages/ui` as proposed in review. Smoke-test Astro SSR for a static component and `client:load` for an interactive one; assert a package-only utility appears in the built CSS.

## Stage 2 — Migrate static primitives and catalog (mechanical)

- [ ] Move variants and markup of Button, Card, Badge, Heading, Avatar, Container, Section, Pagination into typed TSX. Verify Button variant/size classes and Card bracket decorations exactly.
- [ ] Port Organism and SpecimenCard using `@cetus/shared/games` / `@cetus/shared/organisms`; move their scoped Astro CSS into imported plain CSS; keep existing `data-testid`, `data-color`, SVG and hover/focus behavior.
- [ ] Convert affected Astro callers to React component imports and `className` (not a dual `class`/`className` API). Components must forward `...rest` root DOM props including Astro's scoped-style `data-astro-cid-*` attributes; verify at least one scoped `.astro` style still matches. Test whether `astro check` flags a remaining `<Button class=...>`; add a narrowly scoped search gate if not. Passive components are SSR-only, not `client:load`.
- [ ] **Keep existing class-token assertions** in `apps/web/src/components/ui/shell-tokens.test.ts` and `apps/web/src/styles/global.test.ts`: switch migrated component rendering to React's `renderToStaticMarkup`, while keeping AstroContainer assertions for Navigation/Footer. Add only targeted new React Testing Library tests for behavior not covered by those tests, including catalog active/disabled states and Organism. Delete replaced Astro files only after consumers compile.
- [ ] Gate: root typecheck, lint, unit tests, build and homepage/catalog Playwright or screenshot comparison.

## Stage 3 — Interactive primitives + three web page islands

- [ ] Port Select, Slider and Toggle with native controls/ARIA, controlled/uncontrolled **React props only** (`checked`/`onCheckedChange`, `value`/`onValueChange`, native `name` for forms); no `toggle-change`, `slider-change`, synthetic hidden input `change` or DOM expando component setters. Do not implement the unused Tabs family or any `tab-change` adapter.
- [ ] Implement **`apps/web`-owned `SettingsPreferences.tsx`**: takes server preferences from Astro, reads client preferences through existing `getClientPreferences` after mount, saves via existing `saveClientPreferences` / `@cetus/api-client` and owns the settings controls plus save status. On failed server preference save, revert via React state rather than simulated clicks/re-entry flags. Remove the superseded settings DOM script; keep authentication/server DB fetching in `settings.astro`.
- [ ] Implement **Achievements filter island** with Select + the existing ~25-line `game`/`page` URL navigation semantics; remove only the corresponding hidden-input listener. Keep unrelated card-hover code until it is replaced by an actual component.
- [ ] Implement **Leaderboard selector + boards island** from the game's data **already fetched on the server**; transfer selection and displayed board markup into one React owner. Do not have a React Select toggle `hidden` on Astro-owned leaderboard nodes. Remove superseded page controller.
- [ ] Mount these three as appropriately hydrated page/feature islands; `.astro` passes serializable data, while React callbacks live inside each island. Verify selected value, keyboard, disabled, form submission, focus, reload and absence of duplicate listeners.
- [ ] **New authenticated settings e2e:** use the existing test-auth helpers to sign in, seed localStorage preferences, reload, assert the controls mirror saved preferences, simulate a failed server preference save and assert visual/state revert. Current `e2e/settings.spec.ts` covers only redirects and unauthenticated 401s; reuse current fixtures rather than inventing a test framework.
- [ ] Gate: focused React Testing Library tests, this authenticated e2e and representative achievements/leaderboard flows, plus root quality gates.

## Stage 4 — Feature components with explicit hydration ownership

- [ ] Port GameOverlay, AchievementAward, LoginRewardModal, ChallengeComplete, DailyMissionsPanel, UserDropdown. Keep relevant IDs, class tokens and behavior; derive view props directly from existing `@cetus/shared` DTOs, not duplicate models.
- [ ] Mount **one `AppNotifications` web-owned island** in AppLayout's default notifications slot for AchievementAward + ChallengeComplete. Register existing `window.showAchievementAward` and `window.showChallengeComplete` functions in the island's React effect and clean them up on unmount; keep existing score-service/game callers and already-present real-game e2e coverage. Retire old controllers/template listeners to avoid two owners; no new generic modal manager.
- [ ] Mount the navigation UserDropdown as an island where the user exists; leave Navigation, Footer and AppLayout Astro. Accept that the shared notification island brings React/ReactDOM to pages that render it. **Do not gate on zero app-wide React runtime**; prevent unnecessary **per-primitive** hydration instead.
- [ ] Keep auth/logout, reward claim and other web service work in `apps/web` owners. `.astro` can pass serializable server values to hydrated islands, not callback function props. Drop unused `window.loginRewardModal` rather than porting it.
- [ ] Test achievement queue/dismissal, reward status/claim, daily challenge progress, logout and modal focus/ESC behavior using current expectations. Gate: dashboard/login/profile/overlay browser checks and root tests/build.

## Stage 5 — Game presentation wrappers, preserving Astro shell

- [ ] Port GameTitle, GameBreadcrumb, GameStats and GameControls into `@cetus/ui` TSX; preserve game DOM IDs, visibility defaults and text/classes. Reuse the new React GameOverlay presentation.
- [ ] Keep `apps/web/src/components/games/GamePage.astro` as the thin adapter composing `AppLayout.astro` + **existing named slots and root-level scripts**. It can SSR the React presentational wrappers without hydrating the game HUD.
- [ ] Preserve `game-board`, custom `controls`, `additional-stats`, `game-info`, `bottom-info`, `final-stats` behavior. Do not import Astro layouts into `@cetus/ui`, hide page scripts in named slots or create an unused React GamePage implementation.
- [ ] Keep AstroContainer tests for the remaining shell, via the Stage 1 React-enabled `createContainer()` helper. Convert pure presentational wrapper checks using `renderToStaticMarkup`, adding RTL only for actual React interaction.
- [ ] Gate: Snake gameplay and score submission, custom-control page, game-over/restart, `window.snakeGame`, plus full Playwright. No rewrites of the 23 pages' gameplay scripts.

## Stage 6 — Cleanup, regression, single-PR finish

- [ ] Delete the unused `apps/web/src/components/ui/Tabs.astro`, `TabsTrigger.astro` and `TabsContent.astro` outright (plus orphaned Tab-only tests/styles); do **not** recreate them in React. Remove replaced Astro component files and old event scripts; check for dead imports, duplicate CSS and stale event listeners. The approved game-wrapper exception is the `GamePage.astro` layout/slot shell retained for HPA-393.
- [ ] Verify no `@cetus/ui` import reaches `apps/web`, Astro, Pixi, auth or server code; check there are no unnecessary hydrated static islands.
- [ ] Run `bun run typecheck`, `bun run lint`, `bun run test:coverage`, `bun run build`, `bun run test:e2e`; record results and maintain 90% coverage gates (excluding test `.tsx` from covered sources). Manually compare reference screenshots at both widths, assert built Tailwind CSS includes package-only classes, and check there is no unnecessary *component-level* hydration.
- [ ] Update the **same PR** with outcome, residual caveats and exact contract retained for HPA-393. Link it on HPA-379 (the October 24 reviewer approved the Astro shell exception and Tabs scope cut); do not mark ticket Done until implementation and gates pass.

## Expected files

- `packages/ui/{package.json,tsconfig.json,src/**}`: React components, local variants/CSS, tests.
- `apps/web/{astro.config.mjs,package.json,src/pages/**,src/components/**,src/test/createContainer.ts}`: integration, SSR shells, three page islands, notification owner, test renderer helper, old script deletion.
- `{package.json,bun.lock,vitest.config.ts,eslint.config.*}`: version pin, test aggregation, dependency boundary checks as needed.
- `apps/web/src/components/games/GamePage.astro`: retained transitional shell until HPA-393.
- Existing e2e tests and minimal adapter/contract tests adjusted; no new apps/services.

## Explicitly deferred

HPA-393 owns `GameScreen`, game-session hooks, per-game page script replacement, deleting the last `GamePage.astro` shell and game state ownership. HPA-182 owns `.native.tsx` counterparts and Expo screens. No refactor solely to support hypothetical future platforms.
