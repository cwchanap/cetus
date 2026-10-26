# HPA-379 — React UI migration: design

Status: **implemented** (2026-10-25) · Linear: https://linear.app/cwchanap/issue/HPA-379/port-the-astro-ui-components-to-react-in-cetusui
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
- **Round-2 consumer inventory (Oct 24 review, checked against code):** Settings owns the `toggle-change`/`slider-change` events, expando setters and a click-to-revert script; achievements listens for a hidden Select input change and navigates; leaderboard listens for the same change and toggles SSR board visibility. `AppLayout.astro` mounts the shared achievement/challenge notifications; `Navigation.astro` mounts `UserDropdown`. The initial inventory is complete; reconfirm touched consumers before editing, not via a new inventory document.
- Existing ESLint package bans match `*.ts` only, root coverage excludes `*.test.ts` but not `*.test.tsx`, and AstroContainer tests instantiate without React renderers. These are Stage 1 blockers, not optional cleanup.

## Design decisions

### 1. Package and ownership

Add `packages/ui` exporting React web components, matching `@cetus/shared` domain types and `@cetus/tokens/theme.css`. Put `variants.ts` only where component variants actually exist; use existing `class-variance-authority` or a simple shared function rather than introducing a new styling system. Standard React `className`/DOM prop types; update Astro consumers at migration rather than maintaining dual `class` and `className` APIs.

`@cetus/ui` may import `@cetus/shared` and the shared design tokens. It must **not** import Astro components or web-only `@/` paths, server services, authentication clients, game initializers or Pixi. Move web-specific actions (logout, claim reward, load dashboard state) behind props/callbacks owned by web React islands in `apps/web`. **Use existing view models** from `@cetus/shared`, especially `LoginRewardStatusResponse` (`LoginRewardStatusResult` in the web service is only an alias) and `UserChallengeProgress`; do not invent parallel DTOs. Astro passes serializable initial data only; callback functions originate **inside** each hydrated React island, not from `.astro` props. Move the existing `cn` utility (clsx + tailwind-merge) into `@cetus/ui` and turn `apps/web/src/lib/utils.ts` into a re-export, preserving existing web imports without duplicate implementations.

Single compatible React / React DOM version managed at workspace root, with matching `@astrojs/react` integration in `apps/web/astro.config.mjs`. `@cetus/ui` is private and declares React peer dependencies. Do not introduce a component build/publish pipeline unless Astro/Vite actually requires one.

### 2. Astro rendering and hydration

Astro retains route/layout ownership. Render passive React components as server-rendered output **without** `client:*`; add `client:load` only for genuinely interactive **page or feature** islands (settings, achievements filter, leaderboard selector+boards, dropdown, dashboard reward, and shared notifications). Never hydrate individual Button/Card/Badge/Toggle/Slider/Select instances from an Astro page. React-only state and callbacks live inside the owning island; the reusable primitives do **not** emit CustomEvents or attach DOM expando APIs.

**Accepted tradeoff:** the shared notification island in AppLayout and the authenticated navigation dropdown mean React is loaded on pages that render them, including most game pages. This is acceptable for the Phase 3 migration; do not retain old vanilla controllers merely to avoid React. Mount `AchievementAward` and `ChallengeComplete` as **one** notifications island and preserve the existing `window.showAchievementAward` / `window.showChallengeComplete` calls through effect-registered functions in the **web island** (current score/game callers remain unchanged). Clear the registrations on unmount and avoid an independently attached old controller. The unused `window.loginRewardModal` global is removed, not reimplemented.

Keep Tailwind 4 and existing Cetus CSS variables. Move Organism/SpecimenCard CSS into a stylesheet imported by the web app or by the UI entry point, preserving specificity, keyframes and `data-*` selectors. The current `apps/web/src/styles/global.css` has `@import 'tailwindcss' source('../..')`, scanning only `apps/web`; add `@source "../../../../packages/ui";` near the imports to scan UI package class strings. **Path is relative to `apps/web/src/styles/global.css`** (four levels up to the repo root); the reviewer's proposed `../../packages/ui` incorrectly resolves under `apps/web/`. Verify representative package-only utility classes are present in the built CSS.

### 3. Scope and order

**Presentational primitives:** Button, Card, Badge, Heading, Avatar, Container, Section, Pagination, SpecimenCard, Organism. **Interactive primitives:** Select, Slider, Toggle with controlled/uncontrolled React props (`value`/`onValueChange`, `checked`/`onCheckedChange`, native `name` where appropriate), no emitted CustomEvents or attached component handles. Preserve native form semantics, keyboard navigation, `aria-*`, selection and focus behavior. **Do not port unused Tabs/TabsTrigger/TabsContent.** Delete their `.astro` sources and orphaned tests/styles in Stage 6; build tabs only when a real consumer emerges. No `tab-change` adapter.

**Three web-owned page islands:** `SettingsPreferences.tsx` owns all settings toggles/sliders, initializes client-only preferences from `getClientPreferences` after mount, uses the existing `saveClientPreferences`/`@cetus/api-client`, receives server preference values from Astro, and reverts failed saves via React state (no synthesized clicks). A small `AchievementsGameFilter.tsx` owns its Select and URL navigation (`game` / `page` behavior unchanged). `LeaderboardBoards.tsx` owns its Select **and the board markup it switches**; Astro still fetches the existing leaderboard data and passes serializable props; do not imperatively hide Astro-owned children. Remove only the superseded page scripts, leaving unrelated page functionality intact.

**Feature UI:** GameOverlay, AchievementAward, LoginRewardModal, ChallengeComplete, DailyMissionsPanel, UserDropdown. Convert markup and local interaction; API/service calls continue in the owning web islands (`@cetus/api-client` where applicable). Mount the two app-wide notifications together and keep their already-consumed globals at the web boundary; drop the unused login reward global. Avoid a new shared app state or universal modal manager.

**Game wrappers:** GameTitle, GameStats, GameControls, GameBreadcrumb should render with React, keeping HTML IDs, controls and slot behavior unchanged. `GameOverlay` shares the same contract. Use Astro to compose the wrappers with existing named slots until the game pages move to `GameScreen`.

**Intentional HPA-379 acceptance exception:** `GamePage.astro` must remain a *thin Astro compatibility shell* while it owns `AppLayout.astro`, named slots and root game scripts. Do **not** build an unused React `GamePage` abstraction solely to satisfy a filename checklist. Delete this last shell only when HPA-393 converts game pages to `GameScreen`. All *actually replaced* `.astro` component files should be removed within HPA-379. The October 24 design review explicitly endorsed this acceptance-criteria exception; record it in Linear HPA-379 and retain the shell until HPA-393.

### 4. Contract and migration controls

- Preserve existing route URLs, `window.<game>Game` debug handles and game renderer mount points. No game script or rules refactor.
- Preserve IDs and `data-*` hooks as long as legacy scripts use them; React should not re-render subtrees that those scripts imperatively mutate. SSR-only game HUD/controls are preferable until HPA-393 owns their state.
- Astro **does** pass named children to a React component as camelCased props (per Astro's framework component behavior); ordinary passive Card/Container/Section children need no custom slot-mapping bridge. `GamePage.astro` still owns its own six *Astro* named slots and layout; map them only as needed in that shell, never import Astro layout components into the React package or place a game `<script>` in a named slot.
- React components spread forwarded DOM props onto their root element, including `data-astro-cid-*` scoped-style markers. Migrate each Astro caller from `class` to React `className`; validate a representative scoped-style caller and whether `astro check` rejects legacy `class`, adding a focused search/check only if it does not.
- Define a lightweight one-time migration inventory for every component and its consumers (static / interactive; SSR / hydrated; identifiers/events; CSS). No long-lived migration framework or codemod infrastructure.
- Use the current shared DTOs for API-facing data and keep auth/session boundaries in `apps/web`.

## Validation / acceptance

1. `@cetus/ui` can typecheck and test independently; imports resolve in Astro SSR + client bundles. Extend the root ESLint restricted-import globs to `*.{ts,tsx}`, add a UI-specific direction rule allowing `@cetus/shared` and `@cetus/tokens` but forbidding games, API client, web, server and Pixi imports, then prove with a temporary forbidden import that the lint gate fails. Exclude `.test.tsx`/`.spec.tsx` from coverage and register a UI jsdom Vitest project with the existing web jest-dom setup.
2. Preserve existing Button/Card/Badge/Heading class-token assertions in `shell-tokens.test.ts` and `global.test.ts`, using `renderToStaticMarkup` for migrated React components; keep AstroContainer testing for the still-Astro Navigation/Footer. Add focused React Testing Library interaction tests for changed primitives and owners (Select, Toggle, Slider, settings revert, login reward, notifications and logout). No Tabs or `tab-change` tests are required because there are no consumers.
3. Provide a shared `createContainer()` helper under `apps/web/src/test/`, calling `loadRenderers([getContainerRenderer()])` from `astro:container` / `@astrojs/react` and passing the result into `AstroContainer.create({ renderers })`. Convert all container tests that render any React descendants (`AppLayout`, homepage, abyssal shell, wrappers, shell-token tests); preserve `GamePage.astro` composition coverage until HPA-393. Test custom/default controls, overlay title and game HUD IDs.
4. Reuse existing Playwright flows and manually compare captured output for homepage specimen cards, dashboard, profile/menu, representative game page (Snake) and overlays at desktop/mobile widths. There is no existing `toHaveScreenshot` baseline setup: **do not build a new screenshot-baseline framework** for this migration. Assert actual built CSS contains representative UI-package utility classes.
5. Existing complete root test/coverage, lint, typecheck, build and Playwright suites pass. Keep the existing >=90% coverage gate for executable source; add the UI package to root Vitest aggregation.
6. No duplicate listeners, hydration-order race, DOM-ID breakage or CSS regression. **React runtime on pages with shared notifications is accepted**; avoid unnecessary per-primitive hydration. Settings must pass an authenticated browser flow covering persisted preferences on reload and failed server-save state revert.

## Risks and decisions needing review

- **Resolved scope decision:** although the ticket originally targeted `GamePage.astro`, the October 24 design review approved keeping its Astro layout/slot shell until HPA-393. Deleting it during HPA-379 would pull all 23 game-page migrations into the PR.
- Astro scoped CSS and Tailwind scanning across workspace packages can silently change the UI; verify with browser screenshots, not only unit tests.
- Imperative modal/score scripts and React ownership can conflict. Convert ownership atomically per interactive component; never leave two controllers attached to the same element. The two global notification entry points remain a deliberate web-only interoperability seam, not generic primitive APIs.
