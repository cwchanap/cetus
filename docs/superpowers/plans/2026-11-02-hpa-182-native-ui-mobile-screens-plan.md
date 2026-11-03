# HPA-182 — Native UI and mobile screens: single-PR implementation plan

**Status:** Planning only. Implementation not started.
**Issue:** [HPA-182](https://linear.app/cwchanap/issue/HPA-182/build-the-native-cetusui-components-and-the-mobile-app-screens)
**Design:** [Native UI/mobile screens design](../specs/2026-11-02-hpa-182-native-ui-mobile-screens-design.md)
**Baseline:** `main` `9ba318b80d93542d61985bf0348248b8eab69516` (2026-11-02). Reconfirm head before editing.
**Delivery:** **Exactly one PR for HPA-182.** This draft PR starts with docs only; add implementation stages and code-review fixes as commits to **this same PR**, not a series of PRs per component/screen. Do not mark Linear Done merely because planning landed.

## Dependency and ownership gate

- [x] Confirm HPA-379, HPA-393, HPA-179 are Done and HPA-182 blocks HPA-425. HPA-533 is independently unblocked; no production UI/game feature PR was open when planning.
- [x] Confirm current Expo shell includes 4 tabs, sign-in, shared token styles, typed API cookie adapter and Jest setup; inspect existing web component list and backend endpoints.
- [ ] Recheck latest `main` and open PRs at implementation start; reuse Expo scaffolding/auth unchanged and avoid competing edits with concurrent HPA-533 work.
- [ ] Record root baseline `bun run lint`, `bun run typecheck`, `bun run test:coverage`, `bun run build`, existing web Playwright suite, and `bun --cwd apps/mobile test --runInBand` (adapt to verified scripts). Mark pre-existing failures explicitly.
- [ ] Check HPA-179's still-external fixed-HTTPS OAuth, provider registration and device/EAS prerequisites; plan native tests around their real availability. Do not claim device acceptance from a passing web build.

## Stage 1 — Make @cetus/ui resolvable on native (first human checkpoint)

- [ ] Update `packages/ui/package.json` with conditional `react-native` entry for `.` and deep `./components/*` paths and web `default` entries unchanged. Handle current direct `*.tsx` export targets rather than assuming Metro will substitute `*.native.tsx`; keep browser-only CSS/`react-dom` off native import graphs.
- [ ] Add `packages/ui/src/index.native.ts` and a narrow exported native prop surface, while web `index.ts` stays source-compatible. Handle appropriate optional peer dependencies and ensure a single React instance.
- [ ] Implement one Button and Card pair as native pilots (`components/ui/button.native.tsx`, `card.native.tsx`); install `@cetus/ui` only in the mobile workspace at this stage.
- [ ] Add `@source '../../packages/ui/src'` to `apps/mobile/global.css`, preserving shared theme and font runtime. Prove a class used only in the UI package appears in the native build.
- [ ] Prove both `import { Button } from '@cetus/ui'` and `import { Button } from '@cetus/ui/components/ui/button'` resolve to Pressable/View on Metro for iOS and Android, while web SSR still resolves HTML Button/Card and existing tests pass. Typecheck both hosts. If Metro requires a different condition order/extension, fix it here, not after 20 native components.

**Checkpoint:** human review of export conditions, pilot variants and native/web isolation **inside this PR**.

## Stage 2 — Finish the native component gallery and theme parity

- [ ] Port remaining primitives to colocated native files: Badge, Heading, Avatar, Container, Section, Pagination, Select, Slider, Toggle. Keep variant values and accessibility labels, adapt actions to Pressable/Switch/native selector/slider instead of DOM events. Add a small real native slider dependency only if needed; do not build a gesture slider from scratch.
- [ ] Port game chrome: GameTitle, GameBreadcrumb, GameStats, GameControls and GameOverlay, all callback-driven and without DOM IDs, `document` listeners or web lifecycle imports. No game session or renderer is implemented here.
- [ ] Port feature UI: Organism, SpecimenCard, DailyMissionsPanel, LoginRewardModal, UserDropdown, AchievementAward and ChallengeComplete. Native modal and toast lifecycles stay local; shared DTO shapes remain single-source. Cover every web-exported/deep component from HPA-379's inventory, or document a genuine platform-only exclusion in the gallery checklist instead of exporting a broken fallback.
- [ ] Add only real effect dependencies needed for visible native glass/gradient/glow (`expo-blur`, `expo-linear-gradient`, masked view, small Reanimated loops). Preserve dark non-abyssal tokens, text legibility, Android fallback and reduced-motion behavior. No Skia or art.
- [ ] Add `apps/mobile/app/dev/ui-gallery.tsx` or equivalent development-only route with every component family/variant, selected/disabled/error/modal states and stable test IDs. The gallery must not appear in production tabs.
- [ ] Add focused `jest-expo` behavior and accessibility tests for buttons, toggles/select/slider, modal close/claim and gallery mounting. Compare native gallery to existing web on iPhone and Android; note accepted platform differences rather than adding screenshot-golden infrastructure.

**Checkpoint:** visual and interaction review of the gallery in this same draft PR.

## Stage 3 — Minimal profile/achievement read API and consumer-driven hooks

- [ ] Add authenticated `GET apps/web/src/pages/api/user/overview.ts`: current user identity (name/displayName/username/image/member date), a small documented subset of `getUserStats` fields, and earned IDs from `getUserAchievements`. Use existing DB queries and session middleware, respond 401 anonymously, never expose arbitrary users. Confirm the real query result fields before choosing DTO keys.
- [ ] Add `UserOverviewResponse` to `packages/shared/src/api-dto.ts` and `getUserOverview()` to the existing `packages/api-client/src/api-client.ts`. Reuse `getScoreHistory` for recent profile activity and existing score/leaderboard/challenges/reward/settings/avatar/profile mutations. No new DB migration/table or duplicate auth service.
- [ ] Implement thin, `ApiClient`-injected `@cetus/app-core` hooks **only for now-used pages**: `useLeaderboard`, `useChallenges`, `useProfile`, `useAchievements`, `useLoginRewards` and `useSettings`. Reuse at most one small private load/refresh helper; cleanup on unmount/account switch, no React Query/Zustand/caching framework or redundant score submission. The existing `useGameSession` remains unchanged for later game ports.
- [ ] Add tests for private overview auth/empty stats, DTO shape and error cases, hooks' loading/error/refetch behavior, cancellation and account-switch stale-data clearing. Run web API regression tests.

**Checkpoint:** verify no web-only services or SQL leaked into native components, and the endpoint is strictly current-user.

## Stage 4 — Complete native screens using existing four-tab shell

- [ ] Refine `apps/mobile/app/(tabs)/index.tsx` into a searchable/filterable registry-driven hub and add `apps/mobile/app/games/[gameId].tsx` as a game intro with name/description/category/difficulty, back navigation and an honest disabled Play state until HPA-425/533/535. No fake game renderer or speculative game-loader map.
- [ ] Replace `(tabs)/leaderboard.tsx` placeholder, add per-game leaderboard route or `gameId` selection using existing `getLeaderboard` response union. Cover loading/empty/503/network states and game selection. Public access must work anonymously.
- [ ] Replace `(tabs)/achievements.tsx` placeholder with shared achievement definitions + signed-in earned IDs from `getUserOverview`, earned/locked and category filters. Signed-out state gets a sign-in CTA, not a protected request. No fabricated global rarity statistics.
- [ ] Expand `(tabs)/profile.tsx` using `authClient.useSession` plus overview/score history: stats, name/display name/username changes (existing `updateProfile`), avatar preview, edit/remove, sign-out and refreshing state. Preserve existing `GET /api/settings` auth proof where useful for diagnostics but not as the final profile UI.
- [ ] Add `apps/mobile/app/challenges.tsx` and `settings.tsx` as stack destinations, not extra tabs. Use `getChallenges`, `getSettings/updateSettings` and shared challenge DTOs. Clear loading/error/UTC reset states; no fake push permission flow.
- [ ] Add LoginRewardModal mounted from the signed-in hub/profile, driven by `getLoginRewardStatus` and `claimLoginReward`. Show server claim result and refresh status; no second daily reward engine.
- [ ] Add `expo-image-picker` only for avatar editing; use crop and existing `api.uploadAvatar(FormData)` with `avatar` field, allowed type and max 5 MiB, plus delete. Verify the resulting image appears on web too. Add `expo-haptics` for discrete native actions, not continuous animations.
- [ ] Keep app-layer loading/empty/error/sign-in UI simple and reusable. Add Jest tests for tab/stack navigation, anonymous gates, game-detail unavailable state, selector/filter, profile edits/avatar FormData, reward claim, and stale session transitions.

**Checkpoint:** human review of signed-out and signed-in iOS/Android screen flows before score infrastructure.

## Stage 5 — Native score retry adapter for subsequent game-port tickets

- [ ] Add `@react-native-async-storage/async-storage` and `apps/mobile/src/lib/score-submitter.ts`. Export a host-injected `ScoreSubmitter` using existing `api.submitScore`, with device platform set to `ios`/`android`; do **not** call it from HPA-182 non-playable game pages.
- [ ] On retryable `NETWORK_ERROR`, persist a user-scoped FIFO entry (max ~20); exclude 401, 400, score-context failures. Retry sequentially once on authenticated launch/foreground, removing only confirmed successes and stopping on a new transport failure. Keep signed-out/different-user queues isolated or cleared. No background schedule, dependency on a game loop, or extra global store.
- [ ] Test offline enqueue, duplicate pending-key suppression, cap, replay, partial replay failure, account switch, non-retryable responses and that a queued result never claims confirmed success or shows earned-award notifications. Document existing server **at-least-once** tradeoff; defer deduplication/idempotency infrastructure unless real device testing exposes a defect.
- [ ] Write a tiny integration example for HPA-425/533: inject the native submitter when constructing the existing game adapter/instance; `useGameSession` only observes and must never resubmit. Preserve score `context` and `gameData` bytes and server-calculated rewards.

## Stage 6 — Gates, acceptance and handoff (same PR)

- [ ] Root Bun format/lint/typecheck, package/web Vitest with >=90% existing coverage threshold, web build and current Playwright suite green. Web selectors and behavior unchanged; all regressions caused by this PR fixed **on this branch**.
- [ ] Mobile Jest/Jest-Expo checks green; Metro bundles native root/deep `@cetus/ui` imports and runs on iOS and Android with no browser module/CSS runtime errors. Use `expo install` for versions compatible with installed Expo 57 rather than guessed package versions.
- [ ] Manual iPhone and mid-range Android smoke: safe-area, text, touch targets, dynamic keyboard, modal gestures, screen navigation, game intro disabled state, gallery parity, offline empty/error states and performance; no Skia/gameplay E2E in this ticket.
- [ ] With working HPA-179 auth provider credentials/fixed HTTPS host: confirm Google and Apple login, anonymous catalog/boards, private profile/achievement/challenge/settings 401 vs 200, avatar upload reflected on the web, login reward claim, sign-out clears private state, queued score replay with a test fixture (not a real port), then record evidence. If external device/EAS/provider gates cannot be run, mark **not verified** and leave PR draft.
- [ ] Update issue HPA-182 with the design/plan PR, final validation ledger and handoff to HPA-425. Do not mark Done before native acceptance. Leave HPA-533's Skia work independent.

## Files likely to change

- `packages/ui/package.json`, `packages/ui/src/index.native.ts`, `packages/ui/src/components/**/*.native.tsx` (+ tiny shared variant files only where genuinely reused).
- `apps/mobile/package.json`, `apps/mobile/global.css`, `apps/mobile/app/(tabs)/*.tsx`, `apps/mobile/app/{games,leaderboard,dev}/...`, `apps/mobile/app/{challenges,settings}.tsx`, `apps/mobile/src/lib/{api,score-submitter}.ts` and tests.
- `packages/app-core/src/*` for used data hooks; `packages/api-client/src/api-client.ts`, `packages/shared/src/api-dto.ts`; one `apps/web/src/pages/api/user/overview.ts` + tests.
- Existing auth server, shared game logic, web renderers and database schema should remain untouched.

## Deferred/future work — separate tickets, not separate PRs for HPA-182

HPA-425 makes Memory Matrix, Mine Grid, Pattern Pulse, Potion Sorter, Chromatic Tide, Sudoku, Quick Math and Word Scramble playable. HPA-533 supplies Skia/GameCanvas and wave 2; HPA-535 does wave 3. HPA-199 handles full parity, Maestro store release and polished app art/screenshots. Any **new** visual art/SFX task should be separately scoped from coding (reuse an appropriate canceled/duplicate Graveyard ticket if creating one). None is prerequisite to this planning PR.
