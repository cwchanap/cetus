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

HPA-490 should therefore remain an assembly and product-integration task. Add one pure `expedition.ts` run materializer that builds the fixed six-stage tier sequence, then extend the existing Daily-aware game/browser/page seams to make Expedition playable, retryable, restartable with a fresh seed, locally completable when signed out, and persistable as contextual personal history.

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
  - consumes complete materialized runs, owns stage progression/counters/stars/game data, and never reads the clock for seed choice or randomness.
- `src/lib/games/ice-slide/init.ts`
  - owns browser lifecycle, mode start/retry behavior, Pixi recreation, overlays, input locking, stale-submit guard, and score submission.
- `src/lib/games/ice-slide/scoring.ts`
  - pure configurable stage and completion scoring.
- `src/lib/server/db/game-score-context.ts` and `src/lib/server/db/queries.ts`
  - contextual rows are persisted with `mode`; the default leaderboard is restricted to rows where both `mode` and `competition_key` are null.
- `src/pages/api/scores.ts`
  - contextual non-Daily modes pass through the existing bounded context schema; Daily-only admission checks do not reject Expedition.

No database schema, query, API, or Daily leaderboard change is required for HPA-490.

## 3. Approaches considered

### 3.1 Recommended: pure run materializer + narrow mode integration

Create `expedition.ts` to assemble six stages from the HPA-489 one-stage generator. Keep browser-only random seed creation in `init.ts`, and minimally generalize the existing Daily objective/star lifecycle so it also applies to Expedition.

This preserves the existing separation: generator code materializes data; `IceSlideGame` consumes data; `init.ts` handles browser lifecycle; the page renders mode-specific UI.

### 3.2 Generic Daily/Expedition mode framework

Rejected. Daily and Expedition currently share only a small objective/star surface. A mode registry, controller hierarchy, or configuration-driven overlay system would add abstractions before HPA-491/HPA-492 prove a second real need.

### 3.3 Assemble the six stages directly in `init.ts`

Rejected. This would mix deterministic generation with browser randomness and DOM/Pixi lifecycle. It would make Retry Seed correctness harder to unit-test and weaken the existing materialize-before-play contract.

## 4. Fixed decisions

1. Add one pure `src/lib/games/ice-slide/expedition.ts`; do not expand `generator.ts` into a run builder.
2. `IceSlidePlayableMode` becomes `campaign | daily | expedition` only when this mode ships.
3. The six stage difficulties are fixed and exported as:

   ```ts
   ['easy', 'easy', 'medium', 'medium', 'hard', 'hard']
   ```

4. `createIceSlideExpeditionRunDefinition(seed)` calls `createIceSlideExpeditionStage()` exactly six times with stage numbers 1 through 6 and an accumulating transform-orbit canonical-key set.
5. Add each returned `canonicalKey` to the set only after that stage has been accepted. The one-stage generator remains responsible for candidate rejection, fallback selection, solver caps, and DEV diagnostics.
6. Expedition run construction is pure and deterministic. It never calls `crypto.getRandomValues()` or `Math.random()`.
7. `init.ts` creates a random seed exactly once for **New Expedition** using `crypto.getRandomValues(new Uint32Array(4))`, serialized as four zero-padded 8-hex words (32 lowercase hex characters).
8. There is no fallback to `Math.random()` if Web Crypto fails; the existing `failRun` path cleans up and shows a player-safe error.
9. `Retry Seed` reuses a defensive clone of the already-materialized six-stage run. It does not regenerate the run from current generator code.
10. `New Expedition` captures a new Web Crypto seed and materializes a new run.
11. Expedition uses the same three-star model as Daily: Clear, Efficient, and one seeded bonus objective.
12. Expedition uses the Daily stage formula with `objectiveStarBonus = 100` and a six-stage completion budget of 360 seconds at 5 points/second.
13. Do not apply non-1.00 stage multipliers in HPA-490. All HPA-489 stages currently use `scoreMultiplierBps = 10_000`; HPA-491 owns route-choice multipliers.
14. Campaign scoring and behavior remain unchanged. Daily keeps its 300-second completion budget and ranking behavior unchanged.
15. Completed and manually ended Expedition attempts submit contextual rows with `context.mode = 'expedition'`, no `competitionKey`, and the run ruleset version.
16. Manual End persists partial Expedition data even when the accumulated score is 0. Add an explicit score-service opt-in for zero-score persistence rather than changing zero-score behavior for every game.
17. Anonymous Expedition completion/End remains local. A 401/`UNAUTHENTICATED` score response is silently ignored for Expedition, matching Daily's local-play behavior.
18. Expedition rows are automatically excluded from the Campaign/global leaderboard by the existing contextual-row isolation. Daily queries already require `mode='daily'` and a Daily competition key, so Expedition cannot appear there either.
19. Keep `/ice-slide?mode=daily` as the only mode-query preselection. An unknown query value, including `mode=expedition`, may continue to fall back to Campaign; HPA-490 only requires Expedition in the shipped pre-run selector.
20. No run resume after refresh, Safe/Risky route choices, Undo, snow, cracked ice, cross-seed ranking, seasons, rewards, or seed-entry/share UI.

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
2. creates `const canonicalKeys = new Set<string>()`;
3. generates stage 1 through stage 6 using the fixed tier array and the same seed;
4. passes `canonicalKeys` as `existingCanonicalKeys`;
5. records each returned `canonicalKey` after successful generation;
6. returns schema version 1, generator version 1, current ruleset version, `mode: 'expedition'`, the original seed, the six materialized stages, and a run key derived from the seed hash and versions;
7. calls `assertValidIceSlideRunDefinition()` before returning so the public materializer never returns an internally inconsistent run.

### 5.1 Expedition run-key helpers

`run.ts` already validates this grammar internally:

```text
ice-slide:expedition:<8-hex-seed-hash>:g<generatorVersion>:r<rulesetVersion>
```

Expose the grammar instead of duplicating string construction in `expedition.ts` or UI code:

```ts
export interface IceSlideExpeditionRunIdentity {
  seedHash: string
  generatorVersion: number
  rulesetVersion: number
}

export function parseIceSlideExpeditionRunKey(
  runKey: string
): IceSlideExpeditionRunIdentity | null

export function formatIceSlideExpeditionRunKey(input: {
  seed: string
  generatorVersion: number
  rulesetVersion: number
}): string
```

`assertValidIceSlideRunDefinition()` should use the parser for grammar/version extraction, then continue to verify `hashString32Hex(run.seed) === identity.seedHash`.

No new run schema version or ruleset version is required. HPA-490 activates already-designed semantics; it does not change physics or competitive score meaning for Campaign/Daily.

## 6. Game scoring and stage results

Add:

```ts
export const EXPEDITION_SCORING_CONFIG: IceSlideModeScoringConfig = {
  objectiveStarBonus: 100,
  timeBudgetSeconds: 360,
  timeBonusPerSec: 5,
}
```

In `IceSlideGame.clearLevel()`:

- treat `daily` and `expedition` as objective/star modes;
- choose the bonus objective from `state.objectiveIds[0]` for either mode;
- calculate `optionalStarsEarned = Efficient + Bonus` for either mode;
- call `levelScore(..., DAILY_SCORING_CONFIG)` for Daily and `levelScore(..., EXPEDITION_SCORING_CONFIG)` for Expedition;
- accumulate `starsEarned` for Daily and Expedition;
- apply the final `timeBonus()` with the mode's config;
- preserve the Campaign branch byte-for-behavior: no optional objective star points, no accumulated stars, 360-second legacy completion bonus.

Do not make the engine branch on Expedition templates, seed creation, fallback status, or route choices. It continues to consume only the materialized run definition.

## 7. Browser lifecycle and Retry/New semantics

Keep seed creation in `init.ts` because Web Crypto is a browser lifecycle concern.

Add a tiny local helper:

```ts
function createExpeditionSeed(): string {
  const words = new Uint32Array(4)
  crypto.getRandomValues(words)
  return Array.from(words, word => word.toString(16).padStart(8, '0')).join('')
}
```

Replace the Daily-only retry slot with one captured retry run for both non-Campaign modes:

```ts
let retryRun: IceSlideRunDefinition | null = null
```

Behavior:

- `start('campaign')`: current behavior, no retry snapshot needed.
- `start('daily')`: materialize today's Daily run, clone into `retryRun`, then start it.
- `start('expedition')`: create one random seed, materialize the full run, clone into `retryRun`, then start it.
- `playAgain()`: if current mode is Daily or Expedition and `retryRun` exists, clone and restart it; otherwise start Campaign.
- a new handle method `newExpedition()` simply follows the same fresh-start path as `start('expedition')`; the page does not construct seeds or runs itself.

`startRun()` must recognize all three modes, clear stale Daily-only metadata when leaving Daily, and continue to recreate Pixi when stage dimensions change.

## 8. Submission and personal-history semantics

The existing score-context platform is sufficient. Expedition sends:

```ts
{
  context: {
    mode: 'expedition',
    rulesetVersion: gameData.rulesetVersion,
  },
  gameData,
}
```

No competition key is sent because Expedition has no global cross-seed ranking.

### 8.1 Partial zero-score persistence

`saveGameScore()` currently returns early for `score <= 0`, while the server schema already accepts 0. Add:

```ts
export interface SaveScoreOptions {
  isStale?: () => boolean
  context?: ScoreSubmissionContext
  allowZeroScore?: boolean
}
```

The client helper rejects negative scores unconditionally and rejects zero unless `allowZeroScore === true`. Only Expedition passes `allowZeroScore: true`.

This lets an authenticated player End before clearing stage 1 and still persist `gameData` with `solved: false`, `levelsCleared: 0`, zero score, current counters, run identity, and stage signatures. It does not alter existing score behavior for other games.

### 8.2 End and completion

- Expedition completion submits once with `solved: true`.
- Expedition End submits once with `solved: false`, including score 0.
- Daily End remains local-only and never ranked/submitted.
- Campaign End retains its current partial-score behavior.
- Submission failure never invalidates the local result.
- `UNAUTHENTICATED` is silent for Daily and Expedition; other errors still use the existing error callback.
- The existing run guard suppresses stale async callbacks after Retry Seed, New Expedition, mode changes, or cleanup.

## 9. UI and interaction

### 9.1 Mode selector

Add a third shipped radio:

```text
Campaign | Daily | Expedition
```

No disabled placeholder or feature flag is needed.

### 9.2 Expedition HUD

Use a separate `#expedition-meta` card rather than turning the Daily card into a generic mode framework. Display:

- `Seed <32-hex seed>` (monospace; wrapping allowed);
- `Stage N / 6 · EASY|MEDIUM|HARD`;
- cumulative `Stars X / 18`;
- cumulative `Falls X · Resets Y`;
- Clear / Efficient / Bonus objective text for the current stage.

Moves, crystals, elapsed time, current level, and score already exist in the shared page HUD and should not be duplicated.

The Daily leaderboard is hidden whenever Expedition is selected or running.

### 9.3 Stage-clear and final result

The existing stage-clear overlay already has the correct three-star shape. Reuse it for both Daily and Expedition non-final stages and keep input locked until Continue.

Rename the Daily-only final-star container to a neutral run-result container rather than duplicating the same three star rows. Its heading is set to `Daily stars` or `Expedition stars` based on the active run.

For Expedition final/End results, add a compact summary containing:

- seed;
- stages cleared out of 6;
- total stars;
- total moves;
- crystals;
- falls/resets;
- elapsed time.

When an Expedition result is visible:

- the shared Play Again button label becomes **Retry Seed**;
- show an additional **New Expedition** button;
- **Change Mode** returns to the idle selector.

For Campaign/Daily, the shared button continues to read **Play Again** and New Expedition stays hidden.

## 10. Error handling

- Empty seeds are rejected by the pure Expedition materializer.
- Candidate/fallback failures continue through HPA-489's bounded generator and DEV diagnostics.
- If the complete run cannot materialize, `init.ts` uses the existing `failRun()` path: invalidate stale callbacks, destroy game/timer, clean Pixi/input handlers, hide stage overlays/meta, restore buttons, and show a player-safe `Ice Slide Error` message.
- Web Crypto failure uses the same path and never falls back to `Math.random()`.
- Score persistence failure does not tear down or invalidate the completed/ended local result.

## 11. Testing

### 11.1 Pure run tests

Add `expedition.test.ts` covering:

- same seed => deep-equal run definitions;
- exact 2 easy / 2 medium / 2 hard order;
- six unique transform-orbit canonical boards;
- valid run key/hash/version identity;
- stage IDs 1 through 6 and stage signatures preserved;
- empty seed rejection;
- run generation does not call `Math.random()`.

Extend `run.test.ts` for Expedition run-key parse/format/validation round trips and malformed hash/version cases.

### 11.2 Game/scoring tests

Cover:

- Expedition Efficient + Bonus stars score identically to Daily stage rules;
- Expedition completion bonus uses 360 seconds while Daily stays 300;
- `starsEarned` accumulates through all six Expedition stages;
- Campaign score/stars behavior is unchanged;
- run data reports `mode='expedition'`, six stages, seed-derived run key, signatures, counters, and solved state.

### 11.3 Lifecycle/submission tests

Stub `crypto.getRandomValues` with deterministic word arrays and verify:

- fresh Expedition captures Web Crypto once and never calls `Math.random()`;
- Retry Seed starts a deep-equal captured run without another crypto call;
- New Expedition consumes a new crypto value and produces a different run identity;
- completed Expedition sends contextual solved data;
- End sends contextual partial data, including score 0;
- `UNAUTHENTICATED` is silent for Expedition;
- network/server errors remain visible but preserve the result;
- stage-size changes still recreate the renderer;
- stage-clear overlay gates keyboard/pointer input;
- failure and cleanup remove renderer/listeners/meta and restore controls.

Add score-service coverage that zero remains skipped by default and is submitted only with `allowZeroScore: true`.

### 11.4 Markup/E2E

Update durable markup assertions for the third radio and Expedition/meta/result controls.

Extend the existing Ice Slide Playwright suite to prove:

- Expedition is selectable and starts with six-stage tier/HUD data;
- Daily leaderboard stays hidden in Expedition;
- Retry Seed preserves the seed/run identity;
- New Expedition changes identity under deterministic crypto stubs;
- End displays partial summary and sends Expedition context;
- Continue gates input between stages;
- Change Mode returns to an enabled three-mode selector;
- existing Campaign and Daily flows remain green.

Do not add a new E2E framework or separate Expedition test harness.

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

Explicitly do not modify DB schemas, DB queries, `/api/leaderboard`, `daily-leaderboard.ts`, templates, solver, quality gate, physics, renderer drawing, or generator internals unless implementation reveals an actual regression in the already-shipped seam.

## 13. YAGNI boundaries

No:

- generic mode registry or mode controller;
- new generated-run abstraction above `IceSlideRunDefinition`;
- server-generated seeds;
- seed input/share/deep-linking;
- Expedition leaderboard or normalization;
- new personal-history UI;
- resume after refresh;
- route choices, stage multipliers, or Undo;
- snow/cracked-ice mechanics;
- logger injection around generator fallbacks;
- duplicated Expedition solver/quality validation;
- new database migration or API route.

## 14. Acceptance mapping

- **Retry Seed exact reproduction:** captured materialized run clone plus pure run-generation unit coverage.
- **New Expedition:** one Web Crypto seed capture, deterministic builder, no `Math.random()`.
- **2/2/2 six-stage run:** fixed exported tier array and run-builder tests.
- **Validated/fallback content only:** HPA-489 one-stage generator remains the only stage source.
- **Campaign/Daily unchanged:** separate scoring branches and regression/E2E coverage.
- **Completed/partial persistence:** Expedition contextual submission on win and End, zero-score opt-in for early End.
- **No competitive leakage:** existing contextual-row isolation and Daily `mode='daily'` query semantics; no new ranking code.
- **Anonymous local play:** silent `UNAUTHENTICATED` handling for Expedition.
- **Renderer/overlay/input/reset/retry/new/cleanup/failure coverage:** existing `init.ts` seams extended and locked with unit/E2E tests.

## 15. Self-review

- **Placeholder scan:** no TBD/TODO or deferred HPA-490 requirement remains.
- **Consistency:** seed creation is browser-only; run generation is pure; `IceSlideGame` remains generator-agnostic.
- **Scope:** HPA-491 route choices/Undo and HPA-492/HPA-493 tile work remain separate.
- **Reuse:** no DB/API/leaderboard machinery is duplicated; HPA-489 generation is consumed exactly at its intended one-stage boundary.
- **Development cost:** one new production module and targeted extensions to already-proven Daily/product seams; no anticipatory framework work.
