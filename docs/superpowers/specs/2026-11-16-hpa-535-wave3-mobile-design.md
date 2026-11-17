# HPA-535 — Wave-3 native games: design specification

**Status:** Proposed design, documentation only (2026-11-16). No runtime implementation or simulator acceptance has been performed in this PR.
**Linear:** [HPA-535](https://linear.app/cwchanap/issue/HPA-535/port-the-wave-3-games-to-mobile-7-heavy-canvas-games)
**Plan:** [Single-PR implementation plan](../plans/2026-11-16-hpa-535-wave3-mobile-plan.md)
**Prerequisite:** [HPA-533 / PR #108](https://github.com/cwchanap/cetus/pull/108) is complete and supplies the native Skia canvas and the first 16 mobile games.
**Related asset-only task:** [HPA-1140](https://linear.app/cwchanap/issue/HPA-1140/create-an-original-60-second-rhythm-reactor-metronome-audio-asset).

## Goal and boundaries

Enable the final seven games in the existing Expo app: **Tetris, Bejeweled, Bubble Shooter, Rhythm Reactor, Circuit Hacker, Satellite Sync and Ice Slide**, preserving their portable \`@cetus/games\` rules and the web's score/achievement contracts. This brings the sole \`NATIVE_GAMES\` registry from **16/23 to 23/23** playable games.

There is **one implementation PR for HPA-535**, beginning with these two documentation files. Subsequent coding and testing stages are commits to this same draft PR; do not make seven per-game PRs. Original image art, music or SFX are not coding deliverables. The required original click-track is scoped to HPA-1140 and supplied to this PR later.

Non-goals: rewrite any game engine, introduce a generic scene/entity graph, add a new scheduler, port PixiJS/web DOM renderers to RN, add a second auth or score transport, change database/API schemas, implement the App Store/Play Store release process, or introduce a new end-to-end testing framework. Authenticated **real web↔app** parity and the Android native/device release gate stay with [HPA-199](https://linear.app/cwchanap/issue/HPA-199/verify-cross-platform-parity-and-release-on-the-app-store-and-google).

## Verified baseline on \`main\`

- \`apps/mobile/src/games/registry.ts\` owns the **16 existing** native entries. Each uses \`createGame({submitScore,platform})\`, \`project\`/\`createProjector\`, and a board component. \`NativeGameHost.tsx\` constructs **one identity-bound** \`createScoreSubmitter(settledUserId)\`, \`createBaseGameSession\` + \`useGameSession\`, forwards structured awards, handles AppState pause for pausable games and disposes on identity change/unmount. \`NativeGameChrome.tsx\` already handles Start/Replay, HUD, saved/pending/unconfirmed result and rewards. Extend rather than duplicate these.
- \`GameCanvas.tsx\` already handles Skia letterboxing and \`toGamePoint\`; \`useGameLoop.ts\` runs one JS-thread rAF with delta **seconds**, capped at **0.1s**, and updates a board-local scene on lifecycle changes. Existing Skia boards show the host-HUD vs board-scene split. \`apps/mobile/__tests__/NativeGameImportGraph.test.ts\` guards against DOM/Pixi runtime imports.
- \`createHandleSession\` already exists in \`@cetus/app-core\` for callback/imperative games, but **native registry/host currently accept only \`BaseGame\`**. Circuit Hacker, Satellite Sync and Ice Slide **do not extend \`BaseGame\`**. Adding them as BaseGame subclasses or faking their model events would duplicate timers and scoring.
- \`@cetus/api-client\` exposes \`getLeaderboard({gameId,mode,competitionKey,limit})\`, and \`/api/leaderboard\` already supports Ice Slide Daily scoped ranking. \`@cetus/shared/scores\` exposes \`ScoreSubmitter\` and \`ScoreData.context\`. No new backend endpoint or database migration is needed.
- Rhythm Reactor's web renderer is currently **visual-only** (no audio asset); the shared model uses a deterministic 60-second, four-lane chart with a **0.5s beat grid**, first note at **2s**, and \`update(deltaSeconds)\` capped at 0.1s. \`apps/mobile/package.json\` has Skia and gesture handling but **does not yet include \`expo-audio\`**. A repository tree scan found no audio file.
- \`.github/workflows/ci.yml\` has an **always-running draft-PR \`mobile-export\`** job using \`EXPO_PUBLIC_API_BASE_URL=https://cetus-ci.example\`, exporting iOS+Android **JS/assets**. Other lint/test/build jobs are draft-gated. Export is **not** a native compilation/device test.
- HPA-535 has no UI mockup attached, so screenshot-based visual acceptance will use the existing mobile theme, legible safe areas, controls and no canvas clipping as references.

## Architecture decisions

### 1. Keep one native host and two small runtime variants

Keep the existing BaseGame port path untouched for its 16 consumers; add four more through precisely the same path (Tetris, Bejeweled, Bubble Shooter and Rhythm Reactor).

For the three imperative models, add a **minimal handle-port variant** to \`NativeGameEntry\` and one **small branch** in \`NativeGameHost\` **after** its existing credential binding. A handle port constructs its model and \`createHandleSession\`, returns a stable controller/board binding plus a single idempotent disposal hook. Both variants use the **same** \`useGameSession\`/chrome/results/rewards, one account-bound submitter, and identity-keyed host lifetime. The handle-specific model callbacks update \`createHandleSession.handlers\`; the host does not poll the full scene into the React HUD.

Keep the variants explicit in types/tests (one entry cannot have both a BaseGame and handle port). Do **not** force the three handles to subclass \`BaseGame\`, duplicate the native chrome in each board or introduce a general plugin runtime. \`createHandleSession\` provides display state, not score persistence: the handle adapter does **one** \`ScoreSubmitter\` call at the web-equivalent scoring boundary.

A handle run creates an incrementing local **run token**. \`onEnd\` first publishes a provisional \`saveStatus: 'pending'\` where a save is expected, then updates the existing result to \`saved\` or \`unconfirmed\` when \`submitScore\` resolves. The same token and mount/identity guard suppress **stale result/reward UI**, not legitimate old-run backend completion. Forward \`newAchievements\` and \`challengeUpdates\` once through the existing host reward banner; never re-POST on failure or Replay. A handle that does not submit (Circuit timeout/manual fail, Daily early exit) must **not** falsely show “saved” or “saving”. \`cleanup\` stops timers/listeners/animation on leave/identity switch.

Capabilities are **model-truthful**: the three handles expose no generic Pause button (no pause methods); game-specific Stop/End and Retry may appear in their own boards where web exposes those actions. \`AppState\` must not claim to pause a non-pausable model.

### 2. Rendering and inputs stay board-local

Reuse \`GameCanvas\` for all seven Skia boards, the same theme tokens, and existing labelled RN \`Button\`/\`Pressable\` controls. GestureDetector/pan/tap logic belongs to the particular board. Use logical coordinates via \`toGamePoint\` only for pointing/aiming; reject taps in letterbox margins. Avoid 60Hz \`NativeGameHost\` re-renders: frame-driven boards use a **small stable HUD projector** and a copied primitive-only scene stored locally. Event-/input-driven games use stable projection and model callback invalidation rather than gratuitous frame loops.

| Game | Model/input | Rendering/update | Distinct acceptance hazard |
| --- | --- | --- | --- |
| Tetris | \`TetrisGame\`: swipe left/right/down, tap Rotate, labelled Hold + Hard drop | Skia 10×20 cells, next/hold previews; \`useGameLoop\` calls existing update; model uses \`Date.now()\` for gravity | No double movement on a swipe; hold once per piece; top-out produces one result; show **elapsed** time instead of \`MAX_SAFE_INTEGER\` countdown |
| Bejeweled | \`BejeweledGame.clickCell\`: swipe-adjacent → first/second cell, with tap selection fallback | 8×8 Skia jewels; use existing \`setAnimator\` swap/swap-back/clear hooks with board-local effects; no physics loop | Lock input while \`isAnimating\`; cascade and reset cancel stale visual work, preserve model-owned score |
| Bubble Shooter | \`BubbleShooterGame.setAimAngle\` while dragging, \`shoot()\` once on release | Skia hex board, current/next bubble, aim guide + projectile; existing \`update(deltaSeconds)\` and model geometry | Use shooter/world logical coordinates and model angle clamp; no accidental shot from letterbox/cancelled gesture or duplicate projectile |
| Rhythm Reactor | \`RhythmReactorGame.hitLane\`, 4 labelled lane pads + optional tap canvas | Skia notes/lanes; one shared **audio playback clock** for visual note position and judgment | Model/audio time divergence, output/input latency, cleanup after finish/background; no duplicate lane hit |
| Circuit Hacker | \`CircuitHackerGame.rotateTile\` on tapped cells; pre-run difficulty | Skia grid, locked/powered connectivity | Generation is lazy at Start; rotate locks ignored; solve submits, timeout/manual fail does **not** submit (matching web) |
| Satellite Sync | \`SatelliteSyncGame.beginAim/updateAim/endAim\` using pan angle | Skia rings/satellites/targets/beams; single board-local rAF calls \`update(deltaSeconds * 1000)\` (**milliseconds**) | Do not pass rAF seconds as milliseconds; level clear, beam snap/lock, timer, failure/win and cleanup must remain model-owned |
| Ice Slide | \`IceSlideGame.move('N'|'E'|'S'|'W')\`, route choice, Undo/reset level | Skia grid/cells; input-driven view projection, no frame loop | Daily UTC key/context, Expedition seed and safe/risky choices, skip Daily early-stop score, proper scoped leaderboard |

The web's Pixi renderers are references for game layout only, **not** native runtime imports. No new art is required for these shapes.

### 3. Rhythm Reactor: a clock, not competing timers

Install the Expo SDK 57-compatible \`expo-audio\` version with \`expo install\` into the mobile workspace and update **only the root \`bun.lock\`**. Use an \`AudioPlayer\` tied to the board's lifetime (SDK 57 \`useAudioPlayer\`, playback status and \`currentTime\`; see [official SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/sdk/audio/)). The **original 60-second local click track** (2s count-in, 120 BPM) comes from separate **HPA-1140**, not generated in this PR. Do not add remote audio/CDN dependencies.

Preload before Start; on successful Start, establish a single media-position timeline. Render notes and judge inputs against the **same chart timebase**. The existing \`update(deltaSeconds)\` caps each frame at 0.1s and therefore cannot reliably converge to playback after a hitch; make the **smallest portable model change** needed to advance monotonically to an absolute media timestamp while expiring missed notes using existing rules. Keep \`update(deltaSeconds)\` intact for web and preserve scoring/windows. Do not add a second physics scheduler or allow audio playback position to drive host React re-render every frame.

A compact, labelled **latency calibration** control (in milliseconds; bounded adjustment, defaults to 0, current run/session only) shifts the note-judgment input offset—not the stored chart, note positions or shared score algorithm. The recorded time offset is display/config only; backend still receives existing Rhythm Reactor \`gameData\`. Test output/input-offset signs with a fake player clock, early/late and perfect/good/miss windows. Start/replay and unmount must stop/rewind/release audio; skip advancing when player isn't playing and don't silently claim synchronized playback if load fails. Model remains non-pausable, with the existing game-end timeout. Native asset/binary playback is only proven by a simulator/device run, not an Expo JS export.

### 4. Handle games: score boundaries and mode contracts

**Circuit Hacker:** Create a model per host. Initialise a difficulty (default existing web tier), generate the grid only on Start, call \`rotateTile\` on valid board touches, and map \`onGameStart/onTimeUpdate/onRotation/onSolved/onFail\` to the handle session. Match web: \`onSolved\` sends one score with \`{difficulty,secondsRemaining,rotationsUsed,solved}\`; timeout/manual failure shows honest result without a score POST. Cleanup \`game.cleanup()\` on host disposal.

**Satellite Sync:** Create once per host, start/stop via \`start/stop\`, call \`beginAim/updateAim/endAim\` from a board-local pan converted to world degrees (reuse \`geometry.ts\` math), and step the moving scene with \`update(deltaMilliseconds)\`. Forward score/time/level events into the handle session; on **either** \`onFail\` or \`onWin\`, submit once with \`game.getGameData()\` and \`platform\`. Stop timers and rAF on finish/unmount, handle the pending-level swap at the next update; on Stop return to idle and do not falsely create a score result.

**Ice Slide:** Use the existing pure run factories:
- Campaign: \`game.start()\` (authored levels).
- Daily: \`createIceSlideDailyRunDefinition(toIceSlideUtcDateKey(new Date()))\`, fixed once at Start using the **UTC** date, not device-local date. It yields the canonical \`runKey\`/versioned stage data.
- Expedition: \`createIceSlideExpeditionRunDefinition(seed)\`; show/copy the seed, keep it for Retry, and expose the actual model's **safe/risky** route choices after stages 2 and 4 plus charge-gated Undo. Never silently generate a new seed on Retry.

Display stage progress, stars/objectives, mode, end/summary controls without reproducing the enormous web initializer's DOM state machine. Wire the *same* \`@cetus/games/ice-slide\` rules and final \`getGameData()\`. Score behavior matches the web initializer: completed run submits if positive; **Daily early stop does not submit**; Campaign and Expedition **early stop submit only if positive**. For \`mode: 'daily'\`, send \`context: {mode:'daily', competitionKey: runKey, rulesetVersion}\` with \`gameData\`; Expedition uses \`{mode:'expedition',rulesetVersion}\`; Campaign remains unscoped. Use the **existing** \`api.getLeaderboard({gameId:GameID.ICE_SLIDE,mode:'daily',competitionKey:runKey,limit})\` to show per-day best-per-player ranking and honest loading/empty/error states. Do not add backend API calls or store a second copy of seeded run logic.

### 5. Score, lifecycle, accessibility and testing rules

- BaseGame ports retain the existing \`submitScore\`, \`Platform.OS\`, structured result and reward path; handle ports use the same injected submitter and platform value. Every expected save is **one POST max**; distinguish pending/saved/unconfirmed and keep guest/identity bindings intact. Prevent stale UI after replay, back navigation or account switch.
- Never leave game timers, rAF, gesture holds, pending animation promises or audio player alive after unmount. Reset/Start/finish must refresh board-local scene even if the model doesn't emit state-change. Don't invent pause support for handle/Rhythm games.
- Accessible labels and clear disabled states for every touch-only control; screen readers must not need to identify Skia primitives to play. Correct hit areas, dynamic phone portrait layout, letterbox touch rejection, readable contrast and safe-area margins.
- Extend \`NativeGamesRegistry.test.ts\`, \`GamesHub.test.tsx\` and \`NativeGameImportGraph.test.ts\` **with each registration commit**, updating 16→19→21→22→23 counts as staged; no speculative registry placeholders.
- Automated Jest/model tests prove model commands, run-mode/context payloads, scene/HUD isolation, time unit conversions, single POST, rewards, guest/identity lifetime, stale async callbacks, audio cleanup and daily-scoped leaderboard states.
- **E2E via MCP:** drive the **iOS simulator** for all seven games (hub → Play → Start → game-specific input → visible progression/result → Replay → leave) and capture **active/result screenshots**. Include Rhythm calibration/audio, Circuit solve vs fail, Satellite target lock, Ice Slide Daily leaderboard + Expedition route. With no attached Linear mockup, visually compare screenshots to the existing Cetus mobile chrome/theme and check safe areas, layout, controls, clipping and legibility. Machine-driven screenshot check is required; **human approval is not an acceptance gate**.
- Single-platform iOS simulator acceptance is sufficient for the shared RN UI/game logic; CI still exports **iOS and Android JS**. Native Android compilation/device verification, real OAuth/backend parity and store release remain explicit **HPA-199** gates, not results inferred from iOS/Jest/Metro.

## Completion definition

All seven game ports are **registered and playable** with their web-equivalent mechanics and score metadata; 23/23 catalog entries have a functional Play button. MCP-driven iOS gameplay/visual evidence, mobile Jest/model tests, cross-workspace quality gates and existing web Playwright e2e pass. The HPA-1140 audio deliverable is integrated and a real simulated iOS playback/calibration flow passes. Any unavailable native build or external authenticated backend proof is **reported as unverified**, never silently marked complete; HPA-199 owns the later cross-platform release checks.
