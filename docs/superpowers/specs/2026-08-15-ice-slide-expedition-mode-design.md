# Ice Slide Six-Stage Seeded Expedition Mode — Design

- **Date:** 2026-08-15
- **Status:** Proposed for HPA-490 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-490 — Add the six-stage seeded Ice Slide Expedition mode
- **Foundation:** HPA-484, HPA-487, and HPA-489 are complete on `main`

## 1. Summary

HPA-490 is the next unblocked Ice Slide replayability task. The repository already has the hard parts this mode needs:

- versioned score context and isolation of contextual rows from the legacy Campaign leaderboard;
- explicit `IceSlideRunDefinition` / `IceSlideStageDefinition` contracts and Expedition run-key validation;
- Daily's objective/star/scoring lifecycle and mode-selection UI;
- nine authored Expedition template families, solver validation, transform-invariant duplicate detection, deterministic fallbacks, and the one-stage `createIceSlideExpeditionStage()` seam.

HPA-490 remains an assembly and product-integration task. Add one pure `expedition.ts` run materializer that builds the fixed six-stage tier sequence, then extend the existing game/browser/page seams to make Expedition playable, retryable, restartable with a fresh seed, locally completable when signed out, and persistable as contextual personal history.

Two tiny shared mode-policy helpers in `scoring.ts` prevent Daily/Expedition objective behavior from becoming repeated `daily || expedition` checks. They are not a registry: they only answer whether a mode uses stars/objectives and which existing scoring config applies.

Do not introduce a generated-run framework, mode registry, persistence service, new leaderboard route, generic overlay system, or HPA-491 route-choice/Undo machinery.

## 2. Current reusable seams

Reuse directly:

- `src/lib/games/ice-slide/generator.ts`
  - `createIceSlideExpeditionStage({ seed, stageNumber, difficulty, existingCanonicalKeys })`
  - `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 1`
  - 64-attempt bound, 10,000-state solver cap, deterministic tier fallbacks, transform-orbit dedupe, DEV fallback diagnostics.
- `src/lib/games/ice-slide/run.ts`
  - run/stage validation, stable stage signatures, `ICE_SLIDE_RUN_SCHEMA_VERSION`, `ICE_SLIDE_RULESET_VERSION`, and the existing Expedition run-key grammar.
- `src/lib/games/ice-slide/game.ts`
  - consumes complete materialized runs, owns stage progression/counters/stars/game data, and never chooses seeds or reads browser randomness.
- `src/lib/games/ice-slide/init.ts`
  - owns browser lifecycle, captured retry run, Pixi recreation, HUD/overlay text, input locking, stale-submit guard, and score submission.
- `src/lib/games/ice-slide/scoring.ts`
  - pure configurable stage and completion scoring.
- `src/lib/server/db/game-score-context.ts` and `src/lib/server/db/queries.ts`
  - contextual rows are persisted with `mode`; the default leaderboard is restricted to rows where both `mode` and `competition_key` are null.
- `src/pages/api/scores.ts`
  - contextual non-Daily modes pass through the existing bounded context schema; Daily-only admission checks do not reject Expedition.

No database schema, query, API, or Daily leaderboard change is required for HPA-490.

## 3. Approaches considered

### 3.1 Recommended: pure run materializer + narrow mode integration

Create `expedition.ts` to assemble six stages from the HPA-489 one-stage generator. Keep browser-only random seed creation and the captured retry run in `init.ts`. Reuse two small scoring/mode helpers for behavior that is truly shared by Daily and Expedition. Keep actual differences—Daily competition key/ranking and Expedition submit-on-End—explicit.

This preserves the existing separation: generator code materializes data; `IceSlideGame` consumes data; `init.ts` handles browser state/HUD/submission; the page provides static markup and event wiring.

### 3.2 Generic Daily/Expedition mode framework

Rejected. A mode registry, controller hierarchy, or configuration-driven overlay system would add abstractions without a current need. HPA-490 needs only one config selector and one objective-mode predicate.

### 3.3 Assemble the six stages directly in `init.ts`

Rejected. This would mix deterministic generation with browser randomness and DOM/Pixi lifecycle. It would make Retry Seed correctness harder to unit-test and weaken the existing materialize-before-play contract.

## 4. Fixed decisions

1. Add one pure `src/lib/games/ice-slide/expedition.ts`; do not expand `generator.ts` into a run builder.
2. `IceSlidePlayableMode` becomes `campaign | daily | expedition` only when this mode ships.
3. The six stage difficulties are fixed and exported as:

   ```ts
   ['easy', 'easy', 'medium', 'medium', 'hard', 'hard']
   ```

4. `createIceSlideExpeditionRunDefinition(seed)` calls `createIceSlideExpeditionStage()` exactly six times with stage numbers 1 through 6 and one accumulating transform-orbit canonical-key set.
5. Add each returned `canonicalKey` only after that stage is accepted. The one-stage generator remains responsible for candidate rejection, fallback selection, solver caps, and DEV diagnostics.
6. Expedition run construction is pure and deterministic. It never calls `crypto.getRandomValues()` or `Math.random()`.
7. `init.ts` creates a random seed exactly once for a fresh Expedition using `crypto.getRandomValues(new Uint32Array(4))`, serialized as four zero-padded 8-hex words (32 lowercase hex characters).
8. There is no `Math.random()` fallback if Web Crypto fails; the existing `failRun` path cleans up and shows a player-safe error.
9. `Retry Seed` reuses a defensive clone of the already-materialized six-stage run. It does not regenerate from current generator code.
10. `New Expedition` captures a new Web Crypto seed and materializes a new run.
11. Expedition uses the same three-star model as Daily: Clear, Efficient, and one seeded bonus objective.
12. Expedition uses the Daily stage formula with `objectiveStarBonus = 100` and a six-stage completion budget of 360 seconds at 5 points/second.
13. Add `isIceSlideObjectiveMode(mode)` and `iceSlideScoringConfig(mode)` in `scoring.ts`; use them where Daily and Expedition genuinely share objective/scoring/HUD/overlay/local-auth behavior. Keep Expedition-only End submission explicit.
14. Do not apply non-1.00 stage multipliers in HPA-490. HPA-491 owns route-choice multipliers.
15. Campaign scoring and behavior remain unchanged. The Campaign `levelScore()` / `timeBonus()` calls retain their default-config path; Daily remains 300 seconds.
16. Completed and manually ended Expedition attempts submit contextual rows with `context.mode = 'expedition'`, no `competitionKey`, and the run ruleset version.
17. Manual End persists partial Expedition data even when accumulated score is 0. Add an explicit score-service opt-in rather than changing zero-score behavior for every game.
18. Anonymous Expedition completion/End remains local. `UNAUTHENTICATED` is silent for the two objective modes, while other failures remain visible.
19. Expedition rows remain excluded from Campaign/global ranking by existing contextual-row isolation. Daily queries already require `mode='daily'` and a Daily competition key.
20. Keep `/ice-slide?mode=daily` as the only query preselection. `?mode=expedition` continues to fall back to Campaign.
21. `init.ts`, not page script, owns Expedition seed/HUD/summary text because the full 32-hex seed exists only on the captured `IceSlideRunDefinition.seed`. Do not add the seed to `IceSlideState` or persisted `IceSlideGameData` solely for display.
22. No run resume, Safe/Risky choices, Undo, snow, cracked ice, cross-seed ranking, seasons, rewards, seed-entry/share UI, or history UI.

## 5. Expedition run construction

Create `src/lib/games/ice-slide/expedition.ts` with the narrow public seam:

```ts
export const ICE_SLIDE_EXPEDITION_STAGE_DIFFICULTIES = [
  'easy',
  'easy',
  'medium',
  'medium',
  'hard',
  'hard',
] as const

export function createIceSlideExpeditionRunDefinition(
  seed: string
): IceSlideRunDefinition
```

The function:

1. rejects an empty seed;
2. creates one `Set<string>` for canonical keys;
3. generates stages 1–6 using the fixed tier array and the same seed;
4. passes the accumulated keys as `existingCanonicalKeys`;
5. records each returned key after successful generation;
6. hashes the seed once with `hashString32Hex(seed)` for run identity;
7. returns schema version 1, generator version 1, current ruleset version, `mode: 'expedition'`, the original seed, six materialized stages, and the formatted run key;
8. calls `assertValidIceSlideRunDefinition()` before returning.

No retry loop belongs here; HPA-489 already owns bounded candidate/fallback behavior.

### 5.1 Expedition run-key helpers

`run.ts` already validates:

```text
ice-slide:expedition:<8-hex-seed-hash>:g<generatorVersion>:r<rulesetVersion>
```

Expose parse/format as an actual inverse pair, matching Daily's identity helpers:

```ts
export interface IceSlideExpeditionRunIdentity {
  seedHash: string
  generatorVersion: number
  rulesetVersion: number
}

export function parseIceSlideExpeditionRunKey(
  runKey: string
): IceSlideExpeditionRunIdentity | null

export function formatIceSlideExpeditionRunKey(
  identity: IceSlideExpeditionRunIdentity
): string
```

The formatter validates an 8-character lowercase hex `seedHash` plus positive generator/ruleset versions; it does not know or hash the original seed. `createIceSlideExpeditionRunDefinition()` owns the one hash operation because it still has the seed.

`assertValidIceSlideRunDefinition()` uses the parser for grammar/version extraction, then separately verifies `hashString32Hex(run.seed) === identity.seedHash`. Empty/U+001F seed checks stay in run validation/materialization where the original seed exists.

No new run schema or ruleset version is required. HPA-490 activates already-designed semantics; it does not change Campaign/Daily physics or competitive meaning.

## 6. Shared objective/scoring policy

Add:

```ts
export const EXPEDITION_SCORING_CONFIG: IceSlideModeScoringConfig = {
  objectiveStarBonus: 100,
  timeBudgetSeconds: 360,
  timeBonusPerSec: 5,
}

export function isIceSlideObjectiveMode(mode: IceSlideMode): boolean {
  return mode !== 'campaign'
}

export function iceSlideScoringConfig(
  mode: IceSlideMode
): IceSlideModeScoringConfig {
  return mode === 'daily'
    ? DAILY_SCORING_CONFIG
    : mode === 'expedition'
      ? EXPEDITION_SCORING_CONFIG
      : SCORING_CONFIG
}
```

These helpers are deliberately not a mode registry. They centralize only the policy that otherwise becomes repeated at every call site.

In `IceSlideGame.clearLevel()`:

- derive `isObjectiveMode` through the helper;
- read `state.objectiveIds[0]` only for objective modes;
- count Efficient + Bonus optional stars for objective modes;
- select the Daily/Expedition config through `iceSlideScoringConfig()`;
- keep Campaign's existing default `levelScore(scoringParams)` and `timeBonus(elapsedSeconds)` calls;
- accumulate `starsEarned` only for objective modes.

`init.ts` uses `isIceSlideObjectiveMode()` for shared stage-result overlay gating, objective-mode retry behavior, and silent `UNAUTHENTICATED` handling. It does not use the helper to erase genuine mode differences: Daily still owns date/competition-key leaderboard behavior, and Expedition alone submits partial End results.

## 7. Browser lifecycle and Retry/New semantics

Keep seed creation in `init.ts`:

```ts
function createExpeditionSeed(): string {
  const words = new Uint32Array(4)
  crypto.getRandomValues(words)
  return Array.from(words, word => word.toString(16).padStart(8, '0')).join('')
}
```

Replace `retryDailyRun` with one captured non-Campaign snapshot:

```ts
let retryRun: IceSlideRunDefinition | null = null
```

Behavior:

- `start('campaign')`: current behavior; clear retry metadata.
- `start('daily')`: materialize today's Daily run, clone into `retryRun`, then start it.
- `start('expedition')`: create one seed, materialize the full run, clone into `retryRun`, then start it.
- `playAgain()`: if current mode is an objective mode and `retryRun` exists, clone/restart it; otherwise start Campaign.
- `newExpedition()`: use the same fresh Expedition start path and therefore capture a new seed.

`startRun()` sets `currentMode` from the supplied run rather than a Daily-vs-Campaign binary. `dailyDateKey` remains Daily-only and is cleared for Campaign/Expedition. Pixi recreation remains dimension-driven exactly as today.

## 8. Submission and personal-history semantics

Expedition sends:

```ts
{
  context: {
    mode: 'expedition',
    rulesetVersion: gameData.rulesetVersion,
  },
  gameData,
}
```

No competition key is sent because there is no cross-seed global ranking.

### 8.1 Partial zero-score persistence

Extend `SaveScoreOptions`:

```ts
export interface SaveScoreOptions {
  isStale?: () => boolean
  context?: ScoreSubmissionContext
  allowZeroScore?: boolean
}
```

`saveGameScore()` always rejects negative scores and rejects zero unless `allowZeroScore === true`. Only Expedition passes that opt-in.

This lets authenticated players End before clearing stage 1 and persist `solved: false`, `levelsCleared: 0`, score/counters/run identity/signatures. The full raw seed is intentionally not added to `gameData`; HPA-490 does not ship history UI or seed reconstruction from stored rows.

### 8.2 End and completion

- Expedition completion submits once with `solved: true`.
- Expedition End submits once with `solved: false`, including score 0.
- Daily End remains local-only.
- Campaign End retains current partial-score behavior.
- Submission failure never invalidates the local result.
- `UNAUTHENTICATED` is silent for objective modes; other errors remain visible.
- The existing run guard suppresses stale async callbacks after Retry Seed, New Expedition, mode changes, or cleanup.

## 9. UI and interaction

### 9.1 Mode selector

Add a third shipped radio:

```text
Campaign | Daily | Expedition
```

No disabled placeholder or feature flag is needed.

### 9.2 Expedition HUD ownership

Add a separate hidden `#expedition-meta` card. Display:

- `Seed <32-hex seed>`;
- `Stage N / 6 · EASY|MEDIUM|HARD`;
- cumulative `Stars X / 18`;
- cumulative `Falls X · Resets Y`;
- Clear / Efficient / Bonus objective text.

Moves, crystals, elapsed time, level, and score remain in the shared HUD.

`init.ts::syncHud()` populates this card. The seed comes from `retryRun?.seed`, not `state.runKey`: the run key contains only the 8-hex hash and the full seed is not recoverable from it. `syncHud()` shows exactly one of Daily meta / Expedition meta.

The page adds the DOM only; it does not try to recover a seed from `getState()` / `getGameData()`. The Daily leaderboard remains hidden for Expedition.

### 9.3 Stage-clear and final result

Reuse the current stage-clear overlay for both objective modes on non-final stages and keep input locked until Continue.

Rename the Daily-only final-star IDs to neutral `#run-final-*` IDs. `init.ts::populateFinalStageResult()` sets the heading to `Daily stars` or `Expedition stars` and fills the same three rows.

For Expedition final/End results, add a compact summary containing seed, stages cleared / 6, stars, moves, crystals, falls/resets, and elapsed time. `init.ts` populates these values from `game.getGameData()` plus `retryRun?.seed`; the page never needs direct access to the retry closure.

The page owns only action wiring/presentation:

- Expedition result => Play Again label becomes **Retry Seed** and **New Expedition** is visible.
- New Expedition calls `handle.newExpedition()`.
- Change Mode returns to idle.
- Campaign/Daily retain **Play Again** and hide New Expedition.

No generic result-overlay component is introduced.

## 10. Error handling

- Empty seeds are rejected by the pure materializer.
- Candidate/fallback failures remain bounded by HPA-489 and keep its DEV diagnostics.
- Complete-run materialization failure uses `failRun()`: invalidate stale callbacks, destroy game/timer, clean Pixi/input, hide stage/meta/result UI, restore buttons, and show a player-safe error.
- Web Crypto failure follows the same path and never falls back to `Math.random()`.
- Score persistence failure preserves the completed/ended local result.

## 11. Testing

### 11.1 Pure run tests

Add `expedition.test.ts` covering:

- same seed => deep-equal definitions;
- exact 2/2/2 order;
- six unique transform-orbit canonical boards;
- valid run key/hash/version identity;
- stage IDs/signatures/objectives preserved;
- empty seed rejection;
- no `Math.random()`;
- **32 deterministic full-run seeds** through `createIceSlideExpeditionRunDefinition()`, each asserting six stages, 2/2/2 order, six distinct orbit keys, and `assertValidIceSlideRunDefinition()` success.

The 32-run sweep specifically exercises the HPA-490 path that HPA-489 did not: one seed and one canonical-key set carried across easy, medium, and hard stages. It can catch late-stage depletion/fallback collisions that per-tier validation cannot.

Extend `run.test.ts` for Expedition parse/format inverse round trips and malformed seed-hash/version cases.

### 11.2 Game/scoring tests

Cover:

- `isIceSlideObjectiveMode()` returns false for Campaign and true for Daily/Expedition;
- `iceSlideScoringConfig()` maps all three modes correctly;
- Expedition Efficient + Bonus stars match Daily stage rules;
- Expedition completion uses 360 seconds while Daily remains 300;
- stars accumulate through Expedition;
- Campaign score/stars remain unchanged;
- game data reports Expedition mode, six stages, run key/signatures/counters/solved state without persisting the raw seed.

### 11.3 Lifecycle/submission/HUD tests

Stub Web Crypto with deterministic word arrays and verify:

- fresh Expedition captures Web Crypto once and never calls `Math.random()`;
- Retry Seed restarts the captured run without another crypto call;
- New Expedition consumes a new crypto value and changes identity;
- `syncHud()` renders the full 32-hex seed from `retryRun.seed` and not the run-key hash;
- final/End summary gets seed + game-data counters in `init.ts`;
- completed Expedition sends contextual solved data;
- End sends contextual partial data, including zero;
- `UNAUTHENTICATED` is silent for objective modes;
- other failures preserve result but surface the existing error;
- renderer recreation, stage-clear input gating, failure, and cleanup remain correct.

Score-service tests keep zero skipped by default and permit it only with `allowZeroScore: true`.

### 11.4 Markup/E2E

Update stable markup assertions for the third radio and Expedition/meta/result controls. Extend the existing Ice Slide Playwright suite to prove:

- Expedition starts with six-stage tier/HUD data and the full seed;
- Daily leaderboard stays hidden;
- Retry Seed preserves seed/run identity;
- New Expedition changes identity under deterministic crypto stubs;
- End shows partial summary and sends Expedition context;
- Continue gates input between stages;
- Change Mode restores an enabled three-mode selector;
- Campaign/Daily flows remain green.

Keep `bun run validate:ice-slide-expedition` as an HPA-489 generator/content regression. It does **not** count as HPA-490 six-stage assembly proof because it resets canonical keys per tier. The new full-run unit sweep owns that proof. Do not expand the script into a second run fuzzer.

## 12. Files

Create:

- `src/lib/games/ice-slide/expedition.ts`
- `src/lib/games/ice-slide/expedition.test.ts`

Modify narrowly:

- `src/lib/games/ice-slide/run.ts`
- `src/lib/games/ice-slide/run.test.ts`
- `src/lib/games/ice-slide/types.ts`
- `src/lib/games/ice-slide/scoring.ts`
- `src/lib/games/ice-slide/scoring.test.ts`
- `src/lib/games/ice-slide/game.ts`
- `src/lib/games/ice-slide/game.test.ts`
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/init.test.ts`
- `src/lib/services/scoreService.ts`
- `src/lib/services/scoreService.test.ts`
- `src/pages/ice-slide/index.astro`
- `src/pages/game-board-markup.test.ts`
- `e2e/games/play-coverage.spec.ts`

Explicitly do not modify DB schemas/queries, `/api/scores`, `/api/leaderboard`, `daily-leaderboard.ts`, templates, solver, quality, physics, renderer drawing, or generator internals unless a failing HPA-490 test demonstrates a regression in an already-shipped seam.

## 13. YAGNI boundaries

No generic mode registry/controller, generated-run abstraction above `IceSlideRunDefinition`, server seeds, seed input/share/deep links, Expedition ranking/normalization, history UI, resume, route choices/multipliers/Undo, snow/cracked ice, logger injection, duplicated solver/quality validation, database migration, or new API route.

## 14. Acceptance mapping

- **Retry Seed:** captured materialized run clone + lifecycle tests.
- **New Expedition:** one Web Crypto capture + pure materializer + no `Math.random()`.
- **2/2/2 six-stage run:** fixed exported tier array + single-seed assertions + 32 full-run assembly sweep.
- **Validated/fallback content:** HPA-489 stage generator remains the sole stage source.
- **Campaign/Daily unchanged:** centralized objective/config helpers plus explicit real differences and regression/E2E coverage.
- **Completed/partial persistence:** contextual Expedition submission on win/End, zero-score opt-in.
- **No competitive leakage:** existing contextual isolation/Daily query semantics; no ranking code.
- **Anonymous local play:** silent objective-mode `UNAUTHENTICATED` handling.
- **Seed/HUD/summary:** `init.ts` reads captured `retryRun.seed`; no raw seed added to state/gameData.
- **Renderer/overlay/input/reset/retry/new/cleanup/failure:** existing `init.ts` seams extended and locked with unit/E2E tests.

## 15. Self-review

- **Placeholder scan:** no TBD/TODO or deferred HPA-490 requirement remains.
- **Consistency:** seed creation and raw-seed display stay browser-owned; run generation stays pure; `IceSlideGame` stays generator-agnostic.
- **Scope:** HPA-491/HPA-492/HPA-493 remain separate.
- **Reuse:** two tiny shared policy helpers replace repeated mode ORs without becoming a registry; no DB/API/leaderboard machinery is duplicated.
- **Verification:** HPA-489's per-tier content validator remains a regression gate, while HPA-490 now has direct multi-seed six-stage assembly coverage.
