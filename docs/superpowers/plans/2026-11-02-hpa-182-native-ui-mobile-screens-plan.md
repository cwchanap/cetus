# HPA-182 — Native UI and mobile screens: single-PR implementation plan

**Status:** Planning only; PR #103 design review incorporated 2026-11-02. Implementation not started.
**Issue:** [HPA-182](https://linear.app/cwchanap/issue/HPA-182/build-the-native-cetusui-components-and-the-mobile-app-screens)
**Design:** [Updated design spec](../specs/2026-11-02-hpa-182-native-ui-mobile-screens-design.md)
**Baseline:** `main` `9ba318b80d93542d61985bf0348248b8eab69516` (reconfirm at implementation start).
**Delivery:** One Linear ticket = **one PR**. All implementation and code-review fixes go as commits to **draft PR #103**. Do not split by component or screen.

## Gate 0 — Inventory and baseline

- [x] Confirm HPA-379, HPA-393 and HPA-179 Done; HPA-182 blocks HPA-425; HPA-533 is independently actionable.
- [x] Confirm current Expo four-tab shell, typed cookie-bound API client, web-only UI exports and no native games or UI component counterparts.
- [x] Review PR #103 findings against existing ESLint dependency boundaries, root coverage config and current DB-query failure semantics. Choose a generic app-core hook and consumer-driven ports, not six API-client-dependent hooks and every web UI component.
- [ ] Recheck latest `main`, open feature PRs and HPA-533's touched files before implementation.
- [ ] Capture baseline `bun run lint`, `bun run turbo run typecheck`, `bun run test:coverage`, `bun run build`, current web Playwright suite, and `bun --cwd apps/mobile test --runInBand` (adjust to verified Bun/Jest syntax). Record pre-existing failures explicitly.
- [ ] Check HPA-179's fixed-HTTPS OAuth/provider configuration and iOS/Android dev-client/EAS availability. These are **manual/external gates**, not guaranteed by merged HPA-179.

## Stage 1 — Export resolution, pilots, config and one native rebuild

- [ ] First define **only** the native components this ticket will actually use (Button, Card, Badge, Heading, Avatar, Container/Section, Select, Toggle, optional catalog/missions/reward features if rendered). Explicitly defer unused GameTitle/Breadcrumb/Stats/Controls/Overlay, AchievementAward, ChallengeComplete, Slider, Pagination and UserDropdown.
- [ ] Add `packages/ui/src/variants.ts` **type unions only** for shared variant/size **names**. Wire web class tables with `satisfies Record<...>` so native and web must support matching names but keep their platform-specific class values.
- [ ] Add `src/index.native.ts` and `react-native` conditional `exports` for root and deep `./components/*` paths, with existing web targets untouched. Native root exports only implemented components; don't fall through to browser HTML/CSS/`react-dom`.
- [ ] Build native **Button and Card pilots**, using Pressable/View, current shared tokens and semantic `onPress`/variant props. Add `@cetus/ui` as an app dependency and only the actual native dependencies needed by planned screens. Batch `expo-image-picker`, `expo-haptics` and any justified `expo-blur`/`expo-linear-gradient`/masked view in this stage; `react-native-reanimated` is already present. No Slider package, AsyncStorage, Skia or extra store. **Rebuild the iOS and Android dev-client once** after dependency selection.
- [ ] Restrict native Tailwind source to `packages/ui/src/**/*.native.tsx` (e.g., `@source '../../packages/ui/src/**/*.native.tsx'` relative to `apps/mobile/global.css`), retaining `@source './app'`; verify native-only utility appears and web-only classes are not scanned. If the installed Tailwind toolchain interprets a narrow glob differently, adjust to a verified equivalent instead of scanning all browser UI.
- [ ] Set or verify mobile `tsconfig` `moduleResolution: 'bundler'` and `customConditions: ['react-native']`; assert mobile Button `onPress` typechecks while web Button `onClick` still typechecks. Add native-compatible types to `packages/ui` **devDependencies** so root Turbo package typecheck sees `.native.tsx` without a duplicate React runtime.
- [ ] Verify jest-expo's export conditions resolve `@cetus/ui` **and** `@cetus/ui/components/ui/button` to native Pressable/View (not DOM). Keep all native tests in `apps/mobile/__tests__`, never `packages/ui/src/**/*.test.tsx`.
- [ ] Exclude `**/*.native.{ts,tsx}` from **root** `vitest.config.ts` coverage; Jest owns native validation. If Codecov patch still reports uninstrumented native files, narrowly ignore `packages/ui/src/**/*.native.tsx` in `codecov.yml` after confirming the behavior.
- [ ] Prove Metro iOS/Android root+deep imports, jest-expo, UI-package and mobile typecheck, root lint/coverage, and existing web SSR. **Human checkpoint in PR #103:** export/type/coverage correctness before more ports.

## Stage 2 — Private profile GET and a single generic remote-data hook

- [ ] Extend **existing** `apps/web/src/pages/api/user/profile.ts` with `GET`; leave current `POST` semantics intact. Respond 401 unsigned and return current user's profile identity, subset of existing stats needed for native UI, and `earnedAchievementIds`. No arbitrary-user lookup or new DB table.
- [ ] Correct DB failure semantics **for this GET only**: current `getUserAchievements` silently returns `[]`, `getUserStats`/`getUserIdentityById` return `null` on SQL errors. Introduce narrow strict/throwing read variants (extract underlying query only when needed) so true empty/zero stats and no achievements yield 200, and SQL failure yields 5xx. Preserve legacy web fallback behavior. Test missing identity, 401, success/empty and DB errors.
- [ ] Add `UserOverviewResponse` DTO to `@cetus/shared/api-dto` and `getUserOverview()` to `@cetus/api-client`, pointing to `GET /api/user/profile`. Reuse `getScoreHistory`, `updateProfile`, `uploadAvatar` and `deleteAvatar`; avoid new data fetching methods for resources already served.
- [ ] Add **one** generic `useRemoteData<T>(load, key, enabled?)` in `@cetus/app-core`, not six endpoint-specific hooks. Import no `@cetus/api-client` (lint bans even type-only), no web services or DOM globals. Screens pass API call closures.
- [ ] Implement loading/data/error/refresh, `enabled` for signed-out users, keyed data isolation and no old-user flash on render when session key changes. Abort when an API method supports signals; add a stale-result token for nonabortable ones. Avoid infinite refetch from fresh inline callbacks or freshly allocated key arrays. Test races, session changes, unmount, refresh and disabled state with React Testing Library.
- [ ] Human checkpoint in **this PR**: current-user-only route, strict SQL error handling, and dependency-direction tests. Do not add React Query/Zustand or multiple redundant app-core hooks.

## Stage 3 — Vertical mobile screens (runnable and testable per commit)

Each item is a **stage/commit within PR #103**, never a separate PR. Port only the native UI components that screen renders, and put native tests in `apps/mobile/__tests__`. Keep a coherent runnable app after every item.

- [ ] **Games hub/intro**: keep `(tabs)/index.tsx`, add `/games/[gameId]` route; GAMES-derived searchable/filterable cards, game metadata and honest **disabled** Play CTA. Begin Button/Card/Badge/Heading, then catalog components only if actually displayed. Test anonymous navigation and unported state.
- [ ] **Leaderboard**: replace placeholder `(tabs)/leaderboard.tsx`; use `api.getLeaderboard` and the response union for public global/per-game entries. Port native Select if a selector is used; tests cover active selection, loading/empty, 503/network and anonymous access.
- [ ] **Achievements**: replace placeholder with shared definitions + earned IDs from current-user GET, filter/earned/locked states. Signed-out CTA, no protected request, stale-user suppression tests. Port needed badges/cards only.
- [ ] **Profile + avatar**: extend `(tabs)/profile.tsx` with session, GET overview, recent scores, profile update and same-URL server avatar; use `expo-image-picker` crop, native `FormData` part named `avatar`, existing 5 MiB/type limits and existing API methods. Confirm avatar displays after refresh and on web. Retain sign-out; test anonymous/401/account switch.
- [ ] **Challenges**: add stack route `/challenges`, reuse `api.getChallenges` and XP/reset DTO, port DailyMissionsPanel only if used; include UTC-reset/empty/loading/error tests.
- [ ] **Settings**: add stack route `/settings` with `api.getSettings/updateSettings` and three Toggle-backed booleans; no volume Slider, unsupported push-registration feature or new preference DTO.
- [ ] **Login rewards**: native LoginRewardModal where needed (hub/profile), reuse `api.getLoginRewardStatus/claimLoginReward`; test claims, errors, close, server-derived day/status.
- [ ] After every screen, smoke Expo navigation with and without auth, app focus/refetch, accessibility labels, safe areas and keyboard behavior. Haptics only for discrete intended feedback. Reuse existing native modules installed in Stage 1; avoid new dev-client rebuilds.

**Human checkpoint:** review completed anonymous and signed-in screen flows; no gameplay port or fake score submit.

## Stage 4 — Gallery, validation and handoff

- [ ] Add **dev-only** `/dev/ui-gallery` displaying only the native components HPA-182 actually uses (variants, states and relevant modals). Hide it from production navigation. Compare native UI to the existing web look on iPhone/Android, accepting non-identical decorative CSS effects; no screenshot-golden infrastructure.
- [ ] Confirm native root/deep imports resolve correctly under Metro, TypeScript and Jest after final changes, with no browser CSS or react-dom in native bundles.
- [ ] Root format/lint/Turbo typechecks, Vitest coverage ≥90%/CodeCov, web build, all web Playwright selectors unchanged; mobile jest-expo passing. Mark genuine pre-existing failures rather than claiming success.
- [ ] Manual iOS and Android smoke: four tabs, hub/unplayable game intro, public leaderboard, private achievement/profile/challenge/settings flows, rewards, haptics, safe area, modals, keyboard, account switching and offline/error UI. Verify mobile avatar updated web profile.
- [ ] Revalidate HPA-179's fixed HTTPS origin, Google + Apple OAuth provider registration, and real device/EAS builds when credentials/devices exist. Until then, record **not verified** and **keep PR draft**, even if all automated gates pass.
- [ ] Update HPA-182 Linear issue with review decisions and final validation ledger. No Done status before device/API acceptance.

## Files expected to change

- `packages/ui/package.json`, `packages/ui/src/variants.ts`, `packages/ui/src/index.native.ts` and only screen-consumed `*.native.tsx`; existing web class tables only to enforce shared variant name unions.
- `apps/mobile/package.json`, `tsconfig.json`, `global.css`, `app/(tabs)/*`, leaf routes `games/[gameId]`, `leaderboard/[gameId]`, `challenges`, `settings`, `dev/ui-gallery`; focused `__tests__`.
- `vitest.config.ts` native coverage exclusion; optional narrow `codecov.yml` exception if verified necessary; `packages/ui` dev types to make Turbo typecheck succeed.
- `apps/web/src/pages/api/user/profile.ts` GET, reused DB queries with strict variants, `packages/shared/src/api-dto.ts`, `packages/api-client/src/api-client.ts`, `packages/app-core/src/useRemoteData.ts` and tests.
- **Do not touch:** native game logic/Skia, score queue, AsyncStorage, database schema, auth-provider code or web renderers.

## Deferred scope and ownership

**HPA-425** owns native game chrome (GameTitle, GameBreadcrumb, GameStats, GameControls, GameOverlay), score-award toasts (AchievementAward/ChallengeComplete) and the **score retry decision at the first actual native score producer**. Use existing `ScoreSubmitter` injection; start with direct submission and surfaced failures. Evaluate ambiguous `NETWORK_ERROR` post-commit success and stale UTC daily/`competitionKey` semantics before introducing any persistent retry. If necessary, implement safely **inside HPA-425's single implementation PR**, not in HPA-182.

Slider, Pagination and UserDropdown remain web-only until required by a specific native screen. HPA-533 owns Skia/GameCanvas wave 2, HPA-535 wave 3, HPA-199 store release and store imagery. Any **new** art/SFX work becomes a separate task (reuse an appropriate Graveyard ticket instead of creating unnecessary new work). Do not reopen the HPA-182 implementation as multiple PRs.

## Review resolutions

In PR #103's design review: findings **#1–#8 accepted**, with one scoped adjustment: install **only necessary** native dependencies, but batch them in Stage 1 so the dev-client builds once. The original broad component-gallery and offline queue stages are removed. This plan is still planning-only until implementation commits and test evidence arrive.
