# HPA-182 — Native UI components and mobile screens: design

**Status:** Implemented in PR #103; design-review corrections incorporated (2026-11-02). Device and external HPA-179 acceptance not yet verified.
**Linear:** https://linear.app/cwchanap/issue/HPA-182/build-the-native-cetusui-components-and-the-mobile-app-screens
**Baseline:** `main` at `9ba318b80d93542d61985bf0348248b8eab69516` (after HPA-179/#100; recheck at implementation start).
**Implementation:** [Single-PR plan](../plans/2026-11-02-hpa-182-native-ui-mobile-screens-plan.md) · [Review discussion](https://github.com/cwchanap/cetus/pull/103#issuecomment-6597169546).

## Outcome and scope

Deliver an attractive, usable native Expo **shell** on iOS and Android: native `@cetus/ui` components **consumed by this ticket's screens**, the games hub + unplayable game intro, leaderboard, achievements, own profile/avatar editing, challenges/daily missions, settings and login rewards. Build these vertically, validating each complete screen as it lands. **No game becomes playable** in HPA-182.

This is **one ticket / one draft PR** (planning first, implementation commits later). HPA-379, HPA-393 and HPA-179 are Done; HPA-182 blocks HPA-425. HPA-533 (Skia) is independently actionable. No new game art, sounds, game renderers, database tables, state/query framework, backend rewrite or store submission.

**Explicit scope reduction from PR #103 review:** The initial ticket requested native counterparts for every web component and an offline score retry queue. Those have **no HPA-182 consumers**. Deliver only native components its screens render; leave game chrome, score-award toasts and the retry decision to the first game-port ticket HPA-425. Keep Slider, Pagination and UserDropdown web-only unless a later native consumer actually needs them. Update the Linear Done-when accordingly.

## Verified repository baseline

- `apps/mobile` has Expo Router 57, NativeWind 5 RC/Tailwind 4, shared tokens, a 4-tab layout, Better Auth Google/Apple browser OAuth, and an authenticated `api` adapter. Games displays the 23-entry registry but disables play; Leaderboard/Achievements are placeholders. Profile currently demonstrates `GET /api/settings` auth. Reuse the existing shell and auth.
- `packages/ui` currently exports **web React** components from `src/index.ts` and direct `./components/* → *.tsx` paths. There are no `.native.tsx` counterparts or `variants.ts` yet; some web components load CSS or `react-dom`. Metro must never import those on native.
- `packages/app-core` contains `useGameSession` and session adapters only; its enforced import direction is `app-core → shared/games`. Root `eslint.config.js` **prohibits `@cetus/api-client`, including type-only imports**, inside app-core. Screens already have a native, typed `@cetus/api-client` instance and must supply API work via closures, not imports in app-core.
- `@cetus/api-client` already provides global/scoped leaderboards, challenges/XP, login reward status/claim, settings read/update, score history, profile update, avatar upload/delete. `GET /api/user/profile` does **not** exist; its POST handler already updates profile data. The Astro Profile/Achievements pages currently read DB directly, so a small private GET is required for native display.
- Current DB helper contracts are **lossy on error**: `getUserAchievements` returns `[]` when SQL fails; `getUserStats` and `getUserIdentityById` return `null` both for missing data and DB errors. A mobile 200 based on those fallbacks would wrongly show locked achievements or missing stats. The endpoint must distinguish genuine zero/empty state from read failure.
- `POST /api/user/avatar` expects multipart `avatar`, PNG/JPEG/WebP/GIF, max 5 MiB; response image is a base64 data URL. Existing client correctly omits explicit Content-Type for FormData.
- Shared `ScoreSubmitter` is **already injectable** via `BaseGameConfig.submitScore` and BaseGame sets `platform`. No mobile game constructs a submitter in HPA-182, so a new adapter or queue is premature.
- Root Vitest coverage includes `packages/*/src/**`, but native source is exercised by `apps/mobile` jest-expo, not root Vitest. Unexcluded native files would dilute the 90% Codecov project/patch gates; colocated native `*.test.tsx` could be picked up by jsdom Vitest.

## Design decisions

### A. Platform exports and shared variants (pilot first)

Retain the **same import path** for a supported component across web and mobile: `@cetus/ui` and `@cetus/ui/components/ui/button`, for example. Put `.native.tsx` modules next to the web modules and add `src/index.native.ts`. In `packages/ui/package.json`, condition both root and deep exports with a first-class `react-native` target and unchanged web `default` target. The current direct `*.tsx` paths make extension substitution unreliable; **explicit conditions** are required. Only export native modules that actually exist, so unsupported browser-only component imports fail rather than silently resolving DOM code. No second UI package, build/publish step or runtime platform switch inside the web implementations.

Share **variant names/types**, not browser class strings: add small `packages/ui/src/variants.ts` unions (e.g., `ButtonVariant`, `ButtonSize` and relevant Card/Badge/Heading variants). Keep platform-specific class tables declared `satisfies Record<ButtonVariant, string>` (and corresponding size/other types) on both sides, so missing names fail typechecking. Keep DOM and native prop types distinct (`onClick` vs `onPress`, `button` vs `Pressable`). Extract no shared CSS-in-JS styling layer.

Prove with **Button and Card pilots**, before porting further components:
- Metro iOS/Android import resolution for **both root and deep imports**; no CSS/`react-dom` in native import graph, unchanged web SSR.
- TypeScript using mobile `moduleResolution: 'bundler'` and `customConditions: ['react-native']` **if Expo's inherited config does not already provide it**. Assert native `onPress` types resolve from the package.
- Jest/jest-expo's export conditions actually render `Pressable`/`View` rather than HTML `button`/`div`.
- `packages/ui` typechecking compiles colocated native source; add `react-native` typings/runtime as a package dev dependency where needed, without dragging a second React copy into the workspace.
- Root coverage excludes `**/*.native.{ts,tsx}`; keep native jest-expo tests in `apps/mobile/__tests__`, out of the web UI Vitest project's `packages/ui/src/**/*.test.{ts,tsx}` glob. If Codecov patch reporting still counts uninstrumented native sources, add a **narrow** Codecov ignore for them.
- Native stylesheet scans native UI classes only (e.g., relative `@source '../../packages/ui/src/**/*.native.tsx'`), **not** the whole web UI directory; prove a native-only utility is emitted. Keep existing `@source './app'` and shared `@cetus/tokens`.

HPA-179's `expo start --dev-client` requires rebuilding the native app when modules change. Decide which actual native dependencies the scoped screens require (e.g., `expo-image-picker`, `expo-haptics`, `expo-blur` and optional gradient/masked-view packages); install them **together in Stage 1**, then do a single native dev-client rebuild. Don't add modules for decorative effects that can use a solid-token fallback. Reanimated is already installed. Keep non-abyssal dark styling, token colors, existing font fallback, accessible touch targets and reduced-motion behavior. No screenshot-golden system.

### B. One generic app-core data hook, no API-client dependency

Add exactly **one** generic hook in `packages/app-core`, for example:
`useRemoteData<T>(load: (signal: AbortSignal) => Promise<T>, key: readonly unknown[], enabled?: boolean)`
returning `{ data, loading, error, refresh }`. It imports **no** API client, service, navigation or component; native screens pass closures calling their existing `api`. Only `getLeaderboard` and `getChallenges` currently accept AbortSignal; for the other methods, a stale-request token must suppress late results. Do not add signal arguments to every API method speculatively.

The hook must clear/isolate data on account or query-key changes and **never render a previous user's cached profile/achievement data** in the handoff render before the new effect executes. Include the session user ID in private keys, an `enabled` guard for anonymous state, and a stable key-compare/refetch strategy that doesn't rerun for fresh inline callback/dependency-array objects each render. On mutation, call existing `api` method then `refresh()`. No React Query/Zustand/global cache/optimistic updates. `useGameSession` remains unchanged and unused until actual native game ports.

### C. Minimal authenticated GET on existing profile route

Extend existing `apps/web/src/pages/api/user/profile.ts` with `GET`. Use current session middleware (`locals.user`) to return a canonical `UserOverviewResponse` for **the current user only**: `profile` (name/displayName/username/image/member date), the subset of user stats used by the screen, and `earnedAchievementIds`. Read achievements' static definitions from `@cetus/shared/achievements` client-side; use existing `getScoreHistory` for recent activity. Keep existing `POST` unchanged. Add `getUserOverview()` to typed `@cetus/api-client` and the response DTO to `@cetus/shared/api-dto`; do not create a second `overview` URL or duplicate auth.

The GET must **return 5xx on DB read failure**, not 200/empty. Reuse existing query logic, but introduce narrow throwing/strict read variants (or extract existing raw reads into helpers used by both variants) so SQL errors propagate without changing current web fallback semantics. Distinguish absent stats rows (legitimate empty/zero default) from a query error; don't disguise missing authenticated user identity as a successful profile. Test 401, valid empty state, SQL error and mutation parity.

Avatar editing uses `expo-image-picker` with crop; construct native FormData using the returned URI/file under the exact `avatar` key. Check size/type and use existing `api.uploadAvatar()` and `api.deleteAvatar()`; refresh overview and observe the same server image on web. No image storage migration.

### D. Vertical mobile screens: only native components they consume

Retain the four tabs and root auth/theme layout. Add leaf routes without a second router:

| Screen | Behavior/data | Native UI needs |
| --- | --- | --- |
| Games hub + `/games/[gameId]` intro | Search/filter `GAMES`, show game metadata and **disabled/unavailable** Play for every game until it is ported | Button/Card/Badge/Heading; optional SpecimenCard/Organism only if actually displayed |
| Leaderboard tab + per-game route | Existing public `api.getLeaderboard`; top scores and explicit loading/empty/503/network states | Select (or accessible native picker), Card/Avatar |
| Achievements tab | Shared achievement definitions + private earned IDs; filter, earned/locked, sign-in CTA | Badge/Card/Heading |
| Profile tab | Session identity + private GET, editable display name/username/avatar, recent score history, sign-out | Avatar/Button/Card/text inputs |
| `/challenges` | `api.getChallenges`, missions, level/XP/streak, UTC reset | DailyMissionsPanel only when consumed |
| `/settings` | `api.getSettings/updateSettings`; three boolean preferences, no volume control or fake push permission flow | Toggle |
| Login reward modal | `api.getLoginRewardStatus/claimLoginReward`, server claim state and close action | LoginRewardModal |

Browse catalog and public leaderboards signed out; for private screens show a sign-in CTA without a protected API call. Reset keyed query data on sign-out/change-user. Show honest empty/error/offline states. Use `expo-haptics` only for discrete supported actions.

**Deferred components** (no HPA-182 consumer): GameTitle, GameBreadcrumb, GameStats, GameControls, GameOverlay, AchievementAward and ChallengeComplete → HPA-425 when its first actual native `useGameSession`/score submission needs them. Slider, Pagination and UserDropdown stay web-only; native Settings currently uses booleans, lists use FlatList, Profile is the account menu. Never port components merely to fill a gallery. Add a small **dev-only** gallery for the components actually used in HPA-182 and compare screens against web manually.

### E. Do not build the offline score retry queue in HPA-182

`BaseGameConfig.submitScore` already takes a `ScoreSubmitter`, and the native API client can be injected later with `platform: ios/android`. With no native game producer, **do not add** `score-submitter.ts`, AsyncStorage, replay lifecycle, or fabricated score fixtures to HPA-182. Evaluate retry UX with the first playable native game in **HPA-425** (single PR for that ticket).

Two correctness questions require answers **before** any retry implementation:
1. `api.submitScore` classifies some ambiguous failures (including failure parsing a successful response) as `NETWORK_ERROR`; the server may already have inserted the score. Automatic replay can duplicate a committed score without server idempotency.
2. Daily/`competitionKey` context and challenge progress can change between submission and next-launch replay (UTC day or competition key). An old result must not silently count in the wrong period.

Start with direct injection + an honest save-failure state. If offline retry becomes necessary, define idempotency/admission semantics against real gameplay and add it **within HPA-425's PR**, not now. Do not promise exactly-once delivery, background monitoring or generic queue infrastructure.

### F. Acceptance

Automated: web build, type/lint, Vitest/Codecov ≥90% with native sources excluded from **root** instrumentation, existing web Playwright selectors unchanged; native jest-expo screen/component tests and dedicated Metro+TypeScript/Jest root/deep export checks. Tests must demonstrate stale authenticated results cannot leak across account changes; missing stats vs SQL errors are distinguishable.

Device: one iPhone and one Android development build (or emulators where possible), four tabs and leaf navigation, gallery visual/interaction comparison, safe-area and keyboard, anonymous/private routes, avatar upload visible on web, API cookie, login reward claims and sign-out clearing state. HPA-179's external OAuth host/provider/device/EAS verification remains **unverified** until demonstrated; a successful web preview does not satisfy it. Keep this **draft PR** open while any external acceptance gate remains outstanding. HPA-425/533/535 own gameplay parity.

## Review resolution

PR #103's review recommendations #1–#7 are accepted and reflected above. Finding #8 is accepted: use the existing profile URL and **strict DB error propagation**. Deliberate nuance: install only native dependencies the scoped screens actually use, but batch them in one Stage 1 dev-client rebuild; do not install speculative effects. No new Linear ticket was created; the deferred score transport decision belongs to existing HPA-425.
