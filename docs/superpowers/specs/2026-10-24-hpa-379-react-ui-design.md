# HPA-379 — React UI migration: design

Status: **proposed** · Linear: https://linear.app/cwchanap/issue/HPA-379/port-the-astro-ui-components-to-react-in-cetusui
Base: `main` after HPA-447 (shared games/domain/API extraction).

## Goal and boundaries

Extract the existing reusable presentation and interaction components into a **web React** `@cetus/ui` workspace package, while keeping Astro responsible for routes, layouts, SSR and game-page bootstrapping. Preserve the current visuals, accessibility, routes and imperative game contracts. This PR is **one implementation PR for one ticket**; staged commits, not separate PRs.

No Expo components, React Native / `.native.tsx`, new state library, game logic rewrite, game renderer conversion, score transport rewrite or 23-game `GameScreen` conversion. Those belong to HPA-182 / HPA-393.

## Verified baseline (2026-10-24)

- `apps/web`: Astro 5 + Tailwind 4, `@astrojs/vercel`; no `@astrojs/react`, React or React DOM declared yet. Root Bun workspaces and `@cetus/{games,shared,api-client,tokens,config}` already exist.
- UI currently lives in `apps/web/src/components/ui/*.astro`, feature components in `src/components/*.astro`, organism in `src/components/organisms/Organism.astro`, and game wrappers in `src/components/games/*.astro`.
- `Button.astro` exposes seven variants and four sizes; `Card.astro` has `brackets` and four variants. Preserve their classes/tokens rather than redesigning the HUD.
- `Select.astro` binds DOM events. The legacy `Tabs.astro`, `TabsTrigger.astro`, and `TabsContent.astro` have no active application consumers; `tab-change` is only emitted, not observed. **Remove** this unused family rather than porting it. `UserDropdown.astro` imports the web auth client. `LoginRewardModal.astro` takes a type currently imported from a web service.
- `GamePage.astro` **directly imports** `AppLayout.astro`, owns named slots (`game-board`, `controls`, `additional-stats`, `game-info`, `bottom-info`, `final-stats`) and preserves root-level page scripts (Astro does not hoist scripts in named slots). `GameControls` exposes `start-btn`, `pause-btn`, `reset-btn`, `end-btn`; `GameStats` exposes `score` and `time-remaining`; `GameOverlay` defaults to `game-over-overlay`, `game-over-title`, `final-score`, `play-again-btn`. Existing game scripts mutate these DOM nodes directly.
- `Organism.astro` and `SpecimenCard.astro` have scoped styles; their CSS cannot silently disappear when markup moves to React. Existing wrappers tests use `AstroContainer`; root Vitest already aggregates package projects with a 90% coverage policy.

## Design decisions

### 1. Package and ownership

Add `packages/ui` exporting React web components, matching `@cetus/shared` domain types and `@cetus/tokens/theme.css`. Put `variants.ts` only where component variants actually exist; use existing `class-variance-authority` or a simple shared function rather than introducing a new styling system. Standard React `className`/DOM prop types; update Astro consumers at migration rather than maintaining dual `class` and `className` APIs.

`@cetus/ui` may import `@cetus/shared` and the shared design tokens. It must **not** import Astro components or web-only `@/` paths, server services, authentication clients, game initializers or Pixi. Move web-specific actions (logout, claim reward, load dashboard state) behind props/callbacks owned by a tiny `apps/web` adapter where needed; serializable initial view models come from the Astro server boundary, not from leaking service types into UI.

Single compatible React / React DOM version managed at workspace root, with matching `@astrojs/react` integration in `apps/web/astro.config.mjs`. `@cetus/ui` is private and declares React peer dependencies. Do not introduce a component build/publish pipeline unless Astro/Vite actually requires one.

### 2. Astro rendering and hydration

Astro retains route/layout ownership. Render passive React components as server-rendered output **without** `client:*`; add `client:load` only for genuinely interactive islands (e.g. select, dropdown, claim/dismiss dialogs). Prefer a single island at an interactive feature boundary rather than hydrating each Button/Card/Badge. Keep DOM events/state owned by React *inside* those islands. Where legacy code uses global APIs or custom events, provide a narrow web adapter and remove duplicate vanilla-JS listeners to avoid double events.

Keep Tailwind 4 and existing Cetus CSS variables. Move Organism/SpecimenCard CSS into a stylesheet imported by the web app or by the UI entry point, preserving specificity, keyframes and `data-*` selectors. The current `apps/web/src/styles/global.css` has `@import 'tailwindcss' source('../..')`, scanning only `apps/web`; add `@source "../../../../packages/ui";` near the imports to scan UI package class strings. **Path is relative to `apps/web/src/styles/global.css`** (four levels up to the repo root); the reviewer's proposed `../../packages/ui` incorrectly resolves under `apps/web/`. Verify representative package-only utility classes are present in the built CSS.

### 3. Scope and order

**Presentational primitives:** Button, Card, Badge, Heading, Avatar, Container, Section, Pagination, SpecimenCard, Organism. **Interactive primitives:** Select, Slider, Toggle. Preserve native form semantics, keyboard navigation, `aria-*`, selected values, change notifications and focus behavior. **Do not port unused Tabs/TabsTrigger/TabsContent.** Delete their `.astro` sources and any orphaned Tab-only tests/styles during Stage 6; if a real consumer needs tabs later (e.g. HPA-182), design them then. No `tab-change` adapter.

**Feature UI:** GameOverlay, AchievementAward, LoginRewardModal, ChallengeComplete, DailyMissionsPanel, UserDropdown. Convert markup and local interaction; API/service calls continue through existing web-owned adapters (`@cetus/api-client` where applicable). Avoid introducing a shared app state or universal modal manager.

**Game wrappers:** GameTitle, GameStats, GameControls, GameBreadcrumb should render with React, keeping HTML IDs, controls and slot behavior unchanged. `GameOverlay` shares the same contract. Use Astro to compose the wrappers with existing named slots until the game pages move to `GameScreen`.

**Intentional HPA-379 acceptance exception:** `GamePage.astro` must remain a *thin Astro compatibility shell* while it owns `AppLayout.astro`, named slots and root game scripts. Do **not** build an unused React `GamePage` abstraction solely to satisfy a filename checklist. Delete this last shell only when HPA-393 converts game pages to `GameScreen`. All *actually replaced* `.astro` component files should be removed within HPA-379. The October 24 design review explicitly endorsed this acceptance-criteria exception; record it in Linear HPA-379 and retain the shell until HPA-393.

### 4. Contract and migration controls

- Preserve existing route URLs, `window.<game>Game` debug handles and game renderer mount points. No game script or rules refactor.
- Preserve IDs and `data-*` hooks as long as legacy scripts use them; React should not re-render subtrees that those scripts imperatively mutate. SSR-only game HUD/controls are preferable until HPA-393 owns their state.
- Astro slots are not React props by default. Explicitly map named slot content in the Astro compatibility shell; do not pass Astro components as runtime React imports or place a game `<script>` in a named slot.
- Define a lightweight one-time migration inventory for every component and its consumers (static / interactive; SSR / hydrated; identifiers/events; CSS). No long-lived migration framework or codemod infrastructure.
- Use the current shared DTOs for API-facing data and keep auth/session boundaries in `apps/web`.

## Validation / acceptance

1. `@cetus/ui` can typecheck and test independently; imports resolve in Astro SSR + client bundles, and lint rejects package-to-web/server dependencies.
2. Every migrated component has representative React Testing Library tests. Exercise select keyboard/change/disabled behavior, login reward claim, achievement dismissal and dropdown logout callback at the appropriate adapter boundary. No Tabs or `tab-change` tests are required because there are no consumers.
3. Existing AstroContainer coverage for `GamePage.astro` composition remains until HPA-393; test custom/default controls, overlay title and game HUD IDs. Replace other obsolete Astro-specific component tests with React tests.
4. Snapshot or visually compare homepage specimen cards, dashboard, profile/menu, representative game page (Snake), and game-over/achievement/reward overlays, including responsive/mobile widths.
5. Existing complete root test/coverage, lint, typecheck, build and Playwright suites pass. Keep the existing >=90% coverage gate for executable source; add the UI package to root Vitest aggregation.
6. No duplicate listeners, hydration race, DOM-ID breakage or CSS regression; no new app-wide hydration.

## Risks and decisions needing review

- **Resolved scope decision:** although the ticket originally targeted `GamePage.astro`, the October 24 design review approved keeping its Astro layout/slot shell until HPA-393. Deleting it during HPA-379 would pull all 23 game-page migrations into the PR.
- Astro scoped CSS and Tailwind scanning across workspace packages can silently change the UI; verify with browser screenshots, not only unit tests.
- Imperative modal/score scripts and React ownership can conflict. Convert ownership atomically per interactive component; never leave two controllers attached to the same element.
