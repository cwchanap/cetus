# HPA-182 — Native UI components and mobile screens: design

**Status:** Planning only (2026-11-02); implementation and device acceptance not yet performed.
**Linear:** https://linear.app/cwchanap/issue/HPA-182/build-the-native-cetusui-components-and-the-mobile-app-screens
**Baseline:** `main` at `9ba318b80d93542d61985bf0348248b8eab69516` (2026-11-02, after merged HPA-179/#100).
**Implementation plan:** [HPA-182 single-PR plan](../plans/2026-11-02-hpa-182-native-ui-mobile-screens-plan.md).

## Goal and boundaries

Make Cetus's existing Expo host a usable native app shell on iOS and Android: native `@cetus/ui` components, game catalog/detail + non-playable intro, leaderboards, achievements, own profile, daily missions/challenges, login rewards and settings. Keep the web app unchanged. This ticket provides **UI and a native host's score transport seam**, **not** game ports: HPA-425 owns the eight view-based games; HPA-533/HPA-535 own the canvas games. Never show a working Play button for an unported game.

**One ticket = one PR.** This draft PR contains planning documents first; land implementation in reviewable commits **on this same branch/PR**, not follow-up PRs for components, screens or backend read support. HPA-182 blocks HPA-425; its blockers HPA-379, HPA-393 and HPA-179 are Done. HPA-533 can proceed independently.

Out of scope: native game renderers, Skia/game-loop abstraction, rewriting web field-plate controllers, second backend, new auth provider, state/query framework, push-delivery service, background sync, analytics, extra currencies/economies, new art or SFX, arbitrary backend refactors, store release. If new visual assets become necessary, plan them in a separate task rather than bundling asset production with coding.

## Verified repository baseline

- `apps/mobile` exists with Expo Router 57, NativeWind 5 RC, Tailwind 4, a shared-token dark theme and Google/Apple browser OAuth. Four tabs are Games, Leaderboard, Achievements, Profile. The catalog already lists all 23 active registry entries but deliberately disables play; Leaderboard/Achievements are placeholders; Profile proves authenticated `GET /api/settings`. Keep the shell/auth configuration, routes and shared `api` from `apps/mobile/src/lib`.
- `packages/ui/src/index.ts` exports browser React components. `packages/ui/package.json` maps `./components/*` **directly to `*.tsx`**, and the root entry to `index.ts`; Metro cannot be assumed to choose `*.native.tsx` with these explicit targets. No shared `variants.ts` exists today: individual components define their variant tables inline. Some feature components import CSS/`react-dom` and must never reach a native bundle.
- The active web UI inventory includes primitives (Button, Card, Badge, Heading, Avatar, Container, Section, Pagination, Select, Slider, Toggle), game chrome (GameTitle/Breadcrumb/Stats/Controls/Overlay), catalog cards (Organism, SpecimenCard), user UI (UserDropdown, DailyMissionsPanel, LoginRewardModal) and award/challenge notifications. Preserve component names, meaningful variant values and reusable presentation; do **not** promise identical DOM and React Native prop types.
- `packages/app-core` currently exports `useGameSession` and session adapters **only**. HPA-393 deliberately deferred five data hooks until actual consumers exist. HPA-182 introduces the first native consumers; implement only those thin hooks that screens actually call, injected with the typed `ApiClient`, not a generalized data layer.
- `@cetus/api-client` already supports `getLeaderboard` (global/game/scoped), `getChallenges`, `getChallengeXp`, `getLoginRewardStatus`/`claimLoginReward`, `getSettings`/`updateSettings`, `getScoreHistory`, `updateProfile`, `uploadAvatar`/`deleteAvatar`. Authenticated `GET /api/achievements` and a private profile summary endpoint **do not exist**. Web achievements/profile pages use server DB queries in Astro; session identity alone lacks the app's profile stats and earned-achievement status.
- `POST /api/user/avatar` expects multipart field `avatar`, PNG/JPEG/WebP/GIF, max 5 MiB, and returns a base64-data-URL image. The API client already strips explicit Content-Type for FormData. The same auth cookie path used by `apps/mobile/src/lib/api.ts` must be reused.
- `POST /api/scores` accepts optional `platform`; native submissions belong to game tickets. It updates achievements/challenges server-side; `ApiClient.submitScore` returns `NETWORK_ERROR` for transport failures and has no server idempotency key. A retry queue must not claim exactly-once semantics.
- HPA-179 was merged, but its own documentation records external OAuth host/provider and real device/EAS acceptance still outstanding. HPA-182 must explicitly sign off mobile integration, not infer it from Linear's Done status.

## Architecture decisions

### A. Native modules and styling: same imports, platform-specific implementation

Use `.native.tsx` counterparts colocated with the browser components. Add `src/index.native.ts` and **explicit `react-native` conditional exports** for the root, deep component subpaths and any needed utilities, with existing web `default` targets unchanged. Verify actual Metro and TypeScript resolution before migrating all components; if Metro's export conditions require a small adjustment, make that adjustment rather than introducing a build step or a second native UI package. Importing `@cetus/ui` and `@cetus/ui/components/ui/button` on mobile must resolve to native implementations without loading `react-dom`, HTML DOM types at runtime or browser CSS. Keep browser tests/SSR unchanged. Mark web-only `react-dom` peer appropriately optional to native consumers, without two React installations.

Share **semantic props** (variant/size/labels/states and callback intent), but let each platform expose suitable props: web Button uses `onClick`, native Button uses `onPress`; web Select uses a native HTML select, native Select uses accessible platform controls; native Heading uses `Text` instead of `h1`. Do not create a universal DOM/RN prop type, giant wrapper, or runtime platform checks inside web components. Extract tiny variant tables into pure shared files **only if** both platforms actually use the same values; otherwise map browser and native classes locally to preserve web behavior. Existing `cn` can stay web-owned when its DOM-specific merge behavior is inappropriate on native.

Add `@source '../../packages/ui/src'` to `apps/mobile/global.css` so Tailwind sees classes used only by workspace-native components. Use shared `--cetus-*` tokens, existing font fallback and NativeWind v5 runtime; no duplicated palette or CSS generator. Native shapes/surfaces follow the readable dark (non-abyssal) host theme. Use `expo-blur` only for visible glass panels; `expo-linear-gradient` and a masked view only for gradient wordmark/heading where needed; Reanimated only for a small number of visible glow/holographic loops. Degrade gracefully to solid token colors/unstyled elevation where a native equivalent is awkward. No Skia/Pixi in the UI package.

Native component families:
- Primitive: Button, Card, Badge, Heading, Avatar, Container, Section, Pagination, Select, Slider, Toggle.
- Game chrome: GameTitle, GameBreadcrumb, GameStats, GameControls, GameOverlay; actions are callbacks, not global IDs/DOM mutation.
- Presentational feature: Organism, SpecimenCard, UserDropdown (native account menu), DailyMissionsPanel, LoginRewardModal, AchievementAward, ChallengeComplete. Preserve existing DTO/variant inputs where reasonable; native Modal/Pressable/View replace web portals and document listeners.

A **dev-only gallery route** exercises every native export with variant/disabled/selected/modal states; exclude the route from production navigation. It doubles as the human side-by-side comparison surface against the web look. Do not add screenshot snapshot infrastructure or a new design system.

### B. Navigation and screen boundaries

Keep the existing four tabs and `apps/mobile/app/_layout.tsx` as the auth/safe-area/theme owner. Make leaf routes, not a second navigation system:

| Route | Experience | Auth and data |
| --- | --- | --- |
| `/(tabs)/index` | Search/filterable Games hub from `GAMES`, tappable cards | Anonymous, local registry |
| `/games/[gameId]` | Game description, controls/score context and **unavailable-to-play** intro until ported; link to board | Anonymous + registry |
| `/(tabs)/leaderboard` and `/leaderboard/[gameId]` | All-games selector and per-game top scores; loading/empty/503 states | Public `getLeaderboard` |
| `/(tabs)/achievements` | Definition list from `@cetus/shared/achievements`; earned/locked state, optional game filter | Signed-in `getUserOverview` for earned IDs |
| `/(tabs)/profile` | Better Auth identity, display name/username/avatar editor, game stats and recent history, sign-out | Signed-in overview + existing mutation/history endpoints |
| `/challenges` | Daily missions, XP/level, UTC reset and claim/progress state | Signed-in `getChallenges` |
| `/settings` | Existing notification preferences, update feedback | Signed-in `getSettings/updateSettings` |
| Login reward modal (opened from signed-in hub/profile) | Seven-day reward, claim/reload/error | `getLoginRewardStatus/claimLoginReward` |
| `/dev/ui-gallery` | Native component variants in development builds only | No network |

Signed-out users can view the catalog and public leaderboard; protected screens show one reusable sign-in CTA without making protected API requests. On focus/sign-in/sign-out, refetch or clear user-bound screen state; don't display cached achievements/profile for a different user. Empty, loading, offline, and authentication states are explicit. HPA-425/533 later replace each game intro's disabled Play state with a real route/renderer; no speculative 23-entry game-loader registry now. Use `expo-haptics` on discrete successful tap/claim/control actions, not animation frames.

### C. One small authenticated read endpoint, reuse the rest

Add `GET /api/user/overview` to the Astro server and `getUserOverview()` to the typed `ApiClient`. Auth via current middleware/session (401 anonymous). Assemble existing DB query results for current user only:
- `profile`: display name/username/name/image/member-since needed by the native editor, with no email duplication where session already supplies it.
- `stats`: the small, documented set of already-available counters actually rendered on Profile (start with games played; add others only after checking the query's real return type).
- `earnedAchievementIds`: IDs from existing `getUserAchievements`; the client joins them with `getAllAchievements()` definitions. Skip global rarity statistics and public profile search in this ticket.
Read helpers remain in existing `apps/web/src/lib/server/db/queries`. No new tables, authentication system or public user endpoint. Add a DTO in `@cetus/shared/api-dto` and endpoint/API-client contract tests including unauthorized access, empty stats and correct avatar updates. Avatar editing uses `expo-image-picker` crop, a native FormData URI/file object under the exact `avatar` key, existing 5 MiB/MIME validation, and refetches after the successful upload so the web profile uses the same server value.

The five deferred HPA-393 hooks become small **consumer-driven** wrappers when their screens are built: `useLeaderboard`, `useChallenges`, `useProfile`, `useAchievements` and `useLoginRewards`; add `useSettings` only because Settings is an actual consumer. Inject `ApiClient`, return `data/loading/error/refresh`, clean up in-flight effects on route/session changes, and expose mutations narrowly where needed. A private helper can deduplicate loading behavior, **not** grow into caching, polling, optimistic updates or a query framework. Reuse the pre-existing `useGameSession` only after a native game exists. A profile/achievements hook may both read overview on demand; avoid speculative cross-screen cache complexity.

### D. Mobile-only score retry seam, no duplicate persistence owner

Add a tiny `apps/mobile/src/lib/score-submitter.ts` using the existing `api.submitScore` plus `@react-native-async-storage/async-storage`. When later native game ports inject their `ScoreSubmitter`, include `platform: 'ios'|'android'` and queue only retryable `NETWORK_ERROR` failures; **never** queue 401, validation failures or `SCORE_CONTEXT_UNAVAILABLE`. Keep at most ~20 entries per signed-in user in a FIFO queue, de-duplicated within the pending queue by a locally generated ID. Retry once on authenticated app launch/foreground, sequentially; remove only after confirmed success, stop on another network failure, and never replay another user's entries. Sign-out clears or isolates local pending entries before switching accounts. The queue does not submit finished `useGameSession` snapshots and does not intercept web scoring; game instances still own their one initial submit.

No backend idempotency key exists: retry after an ambiguous network failure is **at-least-once**, and could produce duplicate score rows if the server committed before the response was lost. Do not imply exactly-once behavior; record the tradeoff, test bounded/owner-aware retries, and only add server deduplication if actual mobile-game integration proves it necessary. No background tasks or recurring timers.

### E. Acceptance and release boundaries

Automated checks: Expo/Jest screen states and navigation, native UI accessible interactions/gallery mounting, API/DTO tests, app-core hook cleanup/session switching, retry queue, root typecheck/lint/format/tests/build, unchanged web Playwright selectors and score behavior. Validate Metro iOS/Android imports and **manually** compare native component gallery + screens against web at narrow and normal widths; do not demand pixel identity for CSS effects. Test on iPhone simulator and mid-range Android emulator/physical phone where available. Check anonymous vs signed-in, API cookie, avatar in web after mobile upload, post-sign-out 401, device keyboard/safe area/accessibility labels and claimed rewards. EAS/provider/tunnel prerequisites from HPA-179 are **external gates**, not proof of test success. Use this same PR for implementation fixes and sign-off; mark ready only when acceptance is recorded.

## Risks and explicit non-goals

- Explicit `.tsx` package exports can silently route Metro to DOM code. Prove root **and** deep imports with an early native bundle before porting all UI.
- Web colors and CSS animation do not map 1:1 to React Native. Match semantic typography/spacing/contrast first; optimize effect parity only where visible.
- Browser-only profile/achievement DB queries require the narrow private overview endpoint; don't scatter direct HTTP calls or duplicate SQL across screens.
- HPA-179 being Done in Linear does not mean native OAuth/device credentials were actually verified. Keep auth integration as a documented manual checkpoint.
- None of the 23 games is ported in HPA-182; do not fake gameplay or test score parity before HPA-425/533.
