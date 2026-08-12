# Ice Slide Daily Challenge MVP — Design

- **Date:** 2026-08-12
- **Status:** Proposed for HPA-487 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-487 — Ship Ice Slide Daily Challenge MVP with mode selection and three-star objectives
- **Parent design:** `docs/superpowers/specs/2026-07-30-ice-slide-replayability-design.md`

## 1. Summary

HPA-487 is the next unblocked Ice Slide replayability task. HPA-484 already added optional score context, HPA-485 added deterministic materialized runs/RNG/transforms, and HPA-486 added the production solver and stage-quality validator.

Daily therefore remains an integration feature, not a second game engine or a generic generation framework:

- `daily.ts` materializes a complete `IceSlideRunDefinition` from an explicit UTC date key.
- `IceSlideGame` consumes the materialized run and never reads the clock or random source.
- objective completion and score policy stay pure.
- `init.ts` owns fresh-vs-retry identity, HUD synchronization, mid-run stage-result gating, and score submission.
- `index.astro` owns the page-local Campaign/Daily selector and overlays.

Only **Campaign** and **Daily** are selectable. HPA-488 remains responsible for server-side Daily semantic admission and per-day leaderboard presentation.

## 2. Why HPA-487 Is Next

Linear models HPA-487 as blocked by HPA-484, HPA-485, and HPA-486; all three are Done. HPA-487 then unblocks HPA-488, HPA-489, and HPA-490.

The current shipping seams already cover almost everything this feature needs:

- `run.ts`: run schema/version validation, Daily run-key/seed validation, signatures, Campaign materialization, defensive cloning.
- `seeded-rng.ts`: stable FNV-1a/Mulberry32 and labeled forks.
- `transforms.ts`: all eight transforms and canonical transform deduplication.
- `quality.ts` / `solver.ts`: pure solver-backed stage validation.
- `physics.ts`: parsing, sliding, and crystal counting.
- `game.ts`: explicit `start(run?)` plus run metadata/state.
- `scoreService.ts`: score submission plus optional contextual metadata.
- `GamePage.astro` / `GameOverlay.astro`: existing final result overlay and `final-stats` slot.

Do not introduce `generator.ts`, a mode registry, shared overlay framework, or new persistence service.

## 3. Approaches Considered

### 3.1 Recommended: thin Daily materializer + local integration

Create one focused `daily.ts`, one pure objective helper, and additive score configuration. Extend only the existing Ice Slide game/init/page seams.

This is the smallest implementation that preserves deterministic contracts and leaves HPA-489 free to design mutation templates without inheriting a guessed abstraction.

### 3.2 Generic generated-run service

Rejected. Daily v1 only selects/transforms authored Campaign levels. Expedition has different authored mutation/fallback requirements and should not be forced into an abstraction written before it exists.

### 3.3 Generate inside `IceSlideGame`

Rejected. Clock/RNG ownership would break the materialized-run boundary and make retry/UTC-rollover behavior harder to reason about and test.

## 4. Fixed Product Decisions

1. Campaign remains the default and keeps current scoring, achievements, unscoped submission, and positive-score partial-End behavior.
2. Daily is the only additional selectable mode; no Expedition placeholder is shown.
3. `/ice-slide?mode=daily` preselects Daily. Missing, malformed, `campaign`, or unavailable values select Campaign. Query selection never auto-starts.
4. A fresh `start('daily')` captures the current UTC date once and materializes that run.
5. `playAgain()` retries the exact previously materialized Daily run even after UTC rollover.
6. Change Mode returns to the idle selector without auto-start; the next Start is fresh.
7. Daily contains exactly five stages and one seeded feasible bonus objective per stage.
8. Non-final Daily stage clears use an explicit Continue overlay; there is no auto-advance timer.
9. The final Daily stage does **not** require Continue. Its three-star result is rendered in the existing final result overlay and `onWin` follows the existing immediate submission path.
10. Daily End is always local-only and never submits. Ending an active Daily run shows `RUN ENDED` even when score is zero so Play Again/Change Mode remain available.
11. Anonymous Daily completion may hit the normal score endpoint; a structured unauthenticated result is treated as local-only rather than as a visible save error.
12. HPA-488 owns server admission/ranking. Expedition, mutation templates, snow, cracked ice, abilities, and platform Daily Challenge rotation are out of scope.

## 5. Shared UTC Day Contract

### 5.1 One calendar validator

`run.ts` already contains the calendar-valid `YYYY-MM-DD` logic inside `assertValidIceSlideRunDefinition()`. Extract it once:

```ts
export function assertValidIceSlideUtcDateKey(dateKey: string): void
```

The function:

- requires exact `YYYY-MM-DD` syntax;
- parses year/month/day numerically;
- constructs UTC midnight;
- round-trips UTC year/month/day;
- throws `RangeError` for malformed or impossible dates.

Daily run validation calls this helper instead of maintaining its current inline copy.

### 5.2 Explicit-Date formatter

`daily.ts` exposes:

```ts
export function toIceSlideUtcDateKey(date: Date): string
```

It rejects an invalid `Date`, derives the UTC `YYYY-MM-DD` value, calls `assertValidIceSlideUtcDateKey()`, and returns the key.

This intentionally overlaps the **same UTC-midnight boundary** used by platform `getTodayUTC()` / `getSecondsUntilMidnightUTC()` in `src/lib/challenges.ts`, but keeps an explicit `Date` input so Ice Slide rollover tests do not depend on the wall clock. Do not create a second platform date system.

## 6. Daily Run Materialization

### 6.1 Version and identity

Add:

```ts
export const ICE_SLIDE_DAILY_GENERATOR_VERSION = 1
export const ICE_SLIDE_DAILY_SOLVER_MAX_STATES = 10_000
```

For `dateKey`:

```text
seed   = ice-slide:daily:<generatorVersion>:<rulesetVersion>:YYYY-MM-DD
runKey = ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>
```

The ruleset version is the existing `ICE_SLIDE_RULESET_VERSION`.

### 6.2 Tier pools

Pools contain authored `IceSlideLevel.id` values, never array offsets:

```ts
export const ICE_SLIDE_DAILY_STAGE_POOLS = [
  [1, 2],
  [2, 3],
  [3, 4, 5],
  [5, 6, 7],
  [7, 8],
] as const
```

Resolve a source by finding the level whose `level.id` matches the selected ID. Never use `ICE_SLIDE_LEVELS[id - 1]`.

`run.ts` exports the existing Campaign mapping:

```ts
export const CAMPAIGN_STAGE_DIFFICULTIES: readonly IceSlideDifficulty[]
```

After resolving the source, use its real Campaign array index to obtain difficulty.

### 6.3 Frozen stage metadata

Every Daily stage materializes:

```ts
{
  id: `daily:${dateKey}:${stageNumber}`,
  name: source.name,
  templateId: `campaign:${source.id}`,
  difficulty: CAMPAIGN_STAGE_DIFFICULTIES[sourceIndex],
  rows: variant.rows,
  parMoves: quality.parMoves,
  transform: variant.transform,
  mutationIds: [],
  objectiveIds: [bonusObjective],
  scoreMultiplierBps: 10_000,
}
```

Then compute `signature` with `createIceSlideStageSignature()`.

`id`, name, template identity, difficulty, rows, par, transform, objective, multiplier, and signature are all generator-v1 output. Do not casually re-record changed golden output under generator version 1.

### 6.4 Frozen selection algorithm

For each 1-based stage `N`:

1. `rootRng = createSeededRng(seed)`.
2. `stageRng = rootRng.fork(`stage:${N}`)`.
3. `templateOrder = stageRng.fork('template').shuffle(pool)`.
4. Iterate template IDs, skipping `campaign:<id>` values already used in this run.
5. Resolve source by `level.id`.
6. `variants = getUniqueBoardTransforms(source.rows)`.
7. `variantOrder = stageRng.fork(`transform:${source.id}`).shuffle(variants)`.
8. Iterate variants and call `validateIceSlideStageQuality()` with:
   - `objectiveIds: []`;
   - exact par band `[source.parMoves, source.parMoves]`;
   - `maxStates = 10_000`;
   - canonical keys already accepted earlier in the run.
9. Use the first accepted candidate and its returned `quality.parMoves`.
10. Build eligible objective IDs in this fixed order:

   ```ts
   ['collect_all_crystals', 'no_falls', 'no_reset']
   ```

11. `bonusObjective = stageRng.fork('objective').pick(eligibleObjectives)`.
12. Materialize the frozen stage metadata and signature.
13. Record template/canonical identities and continue.
14. Validate the finished run with `assertValidIceSlideRunDefinition()`.

`no_reset` is feasible on every accepted solvable board, so the objective list is non-empty.

### 6.5 Quality gate behavior in generator v1

With the current checked-in Campaign content, transforms are board isometries, the par band is exactly the authored par, and the 2026 content sweep observes no rejected candidate: the first eligible candidate passes the quality gate.

Keep the quality call anyway because HPA-487 explicitly requires production-solver verification and because it catches future content drift (bad par, solver truncation, invalid content, accidental duplicate). Do **not** add dependency injection or synthetic Daily pools only to force the Daily throw branch. Rejection behavior is already covered by `quality.test.ts`.

If the finite authored candidate set cannot satisfy the contract, `createIceSlideDailyRunDefinition()` throws and the existing `failRun()` lifecycle owns cleanup/error display. There is no Daily retry/fallback subsystem.

“Recomputed par” in HPA-487 means the production solver independently verifies the transformed board and returns the materialized par; in v1 that value equals the authored source par by transform isometry. Canonical uniqueness is still asserted on the materialized run even though current source/template constraints make duplicates absent by construction.

### 6.6 Generator-v1 golden output

The literal projection for `2026-08-12` is frozen:

```ts
[
  {
    id: 'daily:2026-08-12:1',
    name: 'Corner Pocket',
    templateId: 'campaign:2',
    transform: 'identity',
    objectiveIds: ['no_reset'],
    parMoves: 3,
    difficulty: 'easy',
    signature: 'is2-8c5387f7',
  },
  {
    id: 'daily:2026-08-12:2',
    name: 'Bank Shot',
    templateId: 'campaign:3',
    transform: 'rotate_180',
    objectiveIds: ['no_reset'],
    parMoves: 4,
    difficulty: 'easy',
    signature: 'is2-c8c370cb',
  },
  {
    id: 'daily:2026-08-12:3',
    name: 'Crystal Cache',
    templateId: 'campaign:5',
    transform: 'reflect_anti_diagonal',
    objectiveIds: ['collect_all_crystals'],
    parMoves: 6,
    difficulty: 'medium',
    signature: 'is2-2394afd9',
  },
  {
    id: 'daily:2026-08-12:4',
    name: 'Deep Freeze',
    templateId: 'campaign:7',
    transform: 'reflect_vertical',
    objectiveIds: ['collect_all_crystals'],
    parMoves: 6,
    difficulty: 'hard',
    signature: 'is2-07d0c27d',
  },
  {
    id: 'daily:2026-08-12:5',
    name: 'Absolute Zero',
    templateId: 'campaign:8',
    transform: 'reflect_main_diagonal',
    objectiveIds: ['no_reset'],
    parMoves: 6,
    difficulty: 'hard',
    signature: 'is2-c31fa49b',
  },
]
```

`daily.test.ts` asserts this literal tuple. The test name/documentation must state that a red golden test requires a generator-version decision; do not “fix” it by blindly re-recording the vector.

Also materialize every date from `2026-01-01` through `2026-12-31` and assert none throws. This is a cheap bounded content-validity sweep, not a statistical quality benchmark.

### 6.7 Version-bump rules

Increment `ICE_SLIDE_DAILY_GENERATOR_VERSION` whenever the same date could materialize different run data. This explicitly includes:

- pool contents/order;
- fork labels or RNG selection order;
- transform candidate behavior/order;
- objective eligibility ordering/selection;
- stage metadata mapping;
- stage-signature inputs;
- `CAMPAIGN_STAGE_DIFFICULTIES` changes affecting eligible Daily levels;
- **any edit to eligible `ICE_SLIDE_LEVELS` identity/name/rows/parMoves that changes Daily output**.

Competitive physics/objective/scoring interpretation changes use `ICE_SLIDE_RULESET_VERSION` as already designed.

No Daily path calls `Math.random()`, `crypto.getRandomValues()`, or reads the clock.

## 7. Objective and Star Policy

### 7.1 Stage-scoped facts

Add a pure helper with names that cannot be confused with cumulative run counters:

```ts
export interface IceSlideObjectiveFacts {
  crystalsCollected: number
  totalCrystals: number
  stageFalls: number
  stageResets: number
}

export function isIceSlideObjectiveComplete(
  objectiveId: IceSlideObjectiveId,
  facts: IceSlideObjectiveFacts
): boolean
```

Rules:

- `collect_all_crystals`: `totalCrystals > 0` and `crystalsCollected === totalCrystals`.
- `no_falls`: `stageFalls === 0`.
- `no_reset`: `stageResets === 0`.

Add `ICE_SLIDE_OBJECTIVE_LABELS` for the three bonus-objective labels.

### 7.2 Efficient uses one expression

Efficient is not a second objective helper. In `clearLevel()` compute once:

```ts
const efficient = this.state.levelMoves <= stage.parMoves
```

Use that same boolean both for existing `perfectLevels` behavior and for the Daily Efficient star.

### 7.3 Counters

`IceSlideState` already has cumulative `falls`, `resets`, and `starsEarned`. Make them live and add only:

```ts
parMoves: number
objectiveIds: IceSlideObjectiveId[]
levelFalls: number
levelResets: number
```

Rules:

- manual Reset: cumulative `resets += 1`, stage `levelResets += 1`, no fall increment;
- hazard: cumulative `falls += 1`, `resets += 1`, stage `levelFalls += 1`, `levelResets += 1` exactly once;
- hazard move remains counted in `levelMoves`;
- same-stage reload preserves stage attempt counters;
- normal stage advance resets stage attempt counters to zero.

At clear time, obtain the source-stage crystal total using existing physics parsing/counting (`countCrystals(parseGrid(stage))`) rather than exporting the private quality-module glyph counter.

A regression test must prove stage scope: make a mistake on stage 1, then cleanly clear stage 2 and still earn stage 2 `no_falls`/`no_reset` as appropriate.

## 8. Stage-Clear Result Contract

Replace numeric `onLevelClear(level)` with:

```ts
export interface IceSlideStageClearResult {
  stageNumber: number
  stageName: string
  parMoves: number
  movesUsed: number
  crystalsCollected: number
  scoreGained: number
  stars: {
    clear: boolean
    efficient: boolean
    bonus: { id: IceSlideObjectiveId; earned: boolean } | null
    earnedCount: number
  }
}
```

Campaign may expose `efficient` in the result object, but does not show Daily star UI and does not increment `starsEarned`.

Preserve engine callback ordering:

- non-final clear: compute result, load next stage through the existing immediate flow, then invoke `onLevelClear(result)`;
- final clear: apply completion bonus, set `status = 'won'`, stop timer, invoke `onLevelClear(result)`, then invoke `onWin(finalScore)` synchronously.

Tests lock final order as `level-clear` then `win`.

## 9. Scoring Without Per-Mode Function Copies

Keep the existing shared scoring primitives. Add only the data needed to vary Daily behavior.

```ts
export interface IceSlideModeScoringConfig {
  objectiveStarBonus: number
  timeBudgetSeconds: number
  timeBonusPerSec: number
}

export const SCORING_CONFIG = {
  levelClearBase: 200,
  moveBonusPerUnderPar: 25,
  crystalBonus: 50,
  timeBudgetSeconds: 360,
  timeBonusPerSec: 5,
  objectiveStarBonus: 0,
} as const

export const DAILY_SCORING_CONFIG: IceSlideModeScoringConfig = {
  timeBudgetSeconds: 300,
  timeBonusPerSec: 5,
  objectiveStarBonus: 100,
}
```

Keep `levelClearPoints()`, `moveBonus()`, and `crystalBonus()` behavior unchanged.

Extend existing functions additively:

```ts
export function timeBonus(
  elapsedSeconds: number,
  config: IceSlideModeScoringConfig = SCORING_CONFIG
): number

export function levelScore(
  params: {
    levelNumber: number
    parMoves: number
    movesUsed: number
    crystalsCollected: number
    optionalStarsEarned?: number
  },
  config: IceSlideModeScoringConfig = SCORING_CONFIG
): number
```

`levelScore()` adds:

```text
(optionalStarsEarned ?? 0) × config.objectiveStarBonus
```

Campaign callers remain unchanged and therefore get zero star bonus plus the existing 360-second time budget. Daily passes `DAILY_SCORING_CONFIG` and a `0..2` Efficient/bonus star count. This same closed shape can serve Expedition later without another pair of mode-named scoring functions.

## 10. Browser Lifecycle and Retry Semantics

Use the narrow playable boundary:

```ts
export type IceSlidePlayableMode = 'campaign' | 'daily'

export interface IceSlideHandle {
  start: (mode?: IceSlidePlayableMode) => Promise<void>
  playAgain: () => Promise<void>
  stop: () => void
  resetLevel: () => void
  cleanup: () => void
  getGame: () => IceSlideGame | null
}
```

`IceSlideMode` remains broader (`campaign | daily | expedition`) on materialized run contracts.

Fresh Start:

- Campaign starts the existing Campaign run.
- Daily calls `toIceSlideUtcDateKey(new Date())`, materializes the run, and stores a defensive retry copy plus captured date key.

Play Again:

- Campaign starts Campaign again.
- Daily starts a clone of the stored Daily run and reuses its captured date key; it never reads the clock.

Start/fail/cleanup clear any non-final stage overlay/input lock state.

## 11. Non-Final Stage Overlay and Final Result

### 11.1 Input gate

`init.ts` owns one `inputLocked` flag. Keyboard, pointer/swipe, and Reset accept input only when the game is playing and the lock is clear.

### 11.2 Non-final Daily clear

When Daily `onLevelClear(result)` runs and the current game status is still `playing`:

1. set `inputLocked = true`;
2. populate/show the page-local stage-clear overlay;
3. focus Continue;
4. the already-loaded next board may render underneath the opaque overlay;
5. Continue hides the overlay, clears the lock, and re-renders/re-syncs HUD before the next move.

There is no timer.

### 11.3 Final Daily clear

When Daily `onLevelClear(result)` observes current status `won`:

- do **not** show the mid-run stage-clear overlay;
- populate the Daily final-stage star/result rows already rendered through `GamePage`'s `final-stats` slot.

The immediately following `onWin(finalScore)` keeps the existing result path:

- invoke external `callbacks.onWin`;
- reset controls;
- show `MISSION COMPLETE`;
- submit the completed Daily score immediately;
- keep the completed local result visible regardless of submission outcome.

This removes `pendingDailyWinScore`, inert-End special cases, and the risk of losing a completed run because the player closes the tab before pressing Continue.

### 11.4 Daily End

Daily `stop()` is deliberately different from Campaign partial submission:

- if Daily is active and `status === 'playing'`, stop it, clear any non-final stage overlay/lock, restore controls, show local `RUN ENDED` with the current score **even when score is zero**, and never submit;
- retain the stored Daily retry snapshot so Play Again reproduces the same run;
- Campaign keeps its existing positive-score partial submission behavior.

After final win, normal result UI has already replaced gameplay controls, so no final-overlay End state machine is needed.

## 12. Daily HUD and Page UI

Keep markup page-local.

### 12.1 Selector

Use a semantic Campaign/Daily fieldset/radio control patterned after existing page-local controls. Do not override the GamePage controls slot, because that would require recreating Start/End/Reset controls.

### 12.2 HUD ownership

Extend `init.ts` `syncHud()`:

Campaign:

- hide `#daily-meta`;
- preserve existing score/level/moves/crystals/time/name rendering.

Daily:

- show `#daily-meta`;
- set `#daily-date` from captured/retried date key;
- set `#daily-reset` to the next UTC day boundary (`Resets at 00:00 UTC …`);
- set `#daily-stage-progress` to `Stage N / 5`;
- set Clear copy;
- set Efficient copy from `state.parMoves`;
- set bonus copy from `ICE_SLIDE_OBJECTIVE_LABELS[state.objectiveIds[0]]`.

Call HUD sync on initial Start, normal move/render paths, and after Continue. Every Daily stage therefore shows objectives before its first accepted move.

### 12.3 Result markup

Use the existing `final-stats` slot for two page-local pieces:

- a hidden Daily final-stage result block with Clear/Efficient/bonus earned/missed rows;
- `#change-mode-btn`.

No `GameOverlay` API change.

### 12.4 Page wiring

- Start reads the selected radio and calls `gameHandle.start(mode)`.
- Play Again calls `gameHandle.playAgain()`.
- Change Mode hides result UI, restores the pre-run status/selector, re-enables mode controls, and does not start anything.

Do not add leaderboard copy before HPA-488.

## 13. Submission and Anonymous Play

### 13.1 Reuse the existing score request

Do not perform an `authClient.getSession()` preflight. The score endpoint is already authoritative and returns 401 for anonymous users.

Extend the existing client result channel additively:

```ts
export type ScoreSubmissionPublicErrorCode =
  | 'SCORE_CONTEXT_UNAVAILABLE'
  | 'UNAUTHENTICATED'
```

In `submitScore()`, map HTTP 401 to `code: 'UNAUTHENTICATED'` regardless of response-body code.

Expose the structured failure through the existing callback without breaking one-argument callers:

```ts
onError?: (error: string, result?: ScoreSubmissionResult) => void
```

`saveGameScore()` invokes `onError(message, result)` for a completed non-success response; transport exceptions still call it without a structured result.

Daily `init.ts` then:

- submits immediately from final `onWin` with contextual game data;
- suppresses visible `Score not saved` UI only when `result?.code === 'UNAUTHENTICATED'`;
- reports other save/network failures normally;
- retains existing run-guard stale-response behavior in `saveGameScore()`.

This avoids an extra session request and a second staleness check while preserving local anonymous completion.

### 13.2 Daily context

Completed Daily submits:

```ts
{
  context: {
    mode: 'daily',
    competitionKey: gameData.runKey,
    rulesetVersion: gameData.rulesetVersion,
  },
  isStale,
}
```

Daily partial End never submits. Campaign remains unscoped. HPA-488 adds server-side solved/run/version admission and ranking.

## 14. Error Handling

- malformed/unavailable mode query => Campaign selection, no auto-start;
- materialization failure => existing `failRun()` cleanup/player-safe error;
- renderer failure => existing cleanup path;
- start/fail/cleanup => clear mid-run overlay/lock state;
- Daily 401 => local completed result, no save-error toast;
- other Daily score failure => local result remains visible and normal save error is reported;
- no nondeterministic generation fallback.

## 15. File Boundaries

### Create

- `src/lib/games/ice-slide/daily.ts`
- `src/lib/games/ice-slide/daily.test.ts`
- `src/lib/games/ice-slide/objectives.ts`
- `src/lib/games/ice-slide/objectives.test.ts`
- `src/lib/games/ice-slide/scoring.test.ts`

### Modify

- `src/lib/games/ice-slide/types.ts`
- `src/lib/games/ice-slide/run.ts`
- `src/lib/games/ice-slide/scoring.ts`
- `src/lib/games/ice-slide/test-fixtures.ts`
- `src/lib/games/ice-slide/game.ts` and focused tests
- `src/lib/games/ice-slide/init.ts` and tests
- `src/lib/services/scoreService.ts` and tests (additive unauthenticated error propagation)
- `src/pages/ice-slide/index.astro`
- `src/pages/game-board-markup.test.ts`
- `e2e/games/play-coverage.spec.ts`

### Do not modify

- database schema/query code;
- `/api/leaderboard` or leaderboard pages;
- server Daily semantic admission;
- shared `GamePage`/`GameOverlay` APIs;
- Expedition/templates/snow/cracked ice;
- platform Daily Challenge rotation.

## 16. Testing Strategy

### Daily materializer

- strict shared UTC date validation;
- exact run key/seed;
- literal `2026-08-12` golden tuple;
- all 365 dates in 2026 materialize without throw;
- pool membership/source-template uniqueness;
- canonical final-board uniqueness;
- production quality validation returns accepted and verified par;
- exactly one feasible bonus objective;
- full run passes `assertValidIceSlideRunDefinition()`.

Do not add a synthetic dependency-injected Daily generator solely to force rejection; `quality.test.ts` already owns rejection branch coverage.

### Objective/runtime/scoring

- collect-all/no-falls/no-reset stage facts;
- stage-1 mistake does not poison stage-2 clean objective results;
- Efficient boolean drives both existing perfect-level behavior and Daily star;
- reset/hazard counters increment exactly once;
- Daily stage star bonus through `levelScore(..., DAILY_SCORING_CONFIG)`;
- Daily 300-second `timeBonus(..., DAILY_SCORING_CONFIG)` boundaries;
- Campaign scoring unchanged with default config;
- final callback order remains level-clear then win.

### Browser integration

- fresh Daily captures current UTC date;
- handle `playAgain()` retains exact run across rollover;
- fresh Daily after rollover uses new date;
- Daily HUD is populated before first move and after Continue;
- non-final Continue gates keyboard/swipe/Reset;
- Daily End at zero score shows local `RUN ENDED` and does not submit;
- completed Daily submits immediately from final `onWin` with exact context;
- final result overlay contains final stage star outcome;
- `UNAUTHENTICATED` result is silent/local; other save errors remain visible;
- Campaign full/partial submission stays unscoped.

### Page/E2E

- default/query mode selection;
- actual Play Again button preserves Daily date across simulated UTC rollover;
- Change Mode returns to idle without auto-start;
- Daily HUD/objectives visible before first move;
- Campaign smoke remains intact;
- malformed/unavailable modes fall back to Campaign.

Static markup tests assert stable DOM IDs/semantics only. They do not assert source-code snippets such as `gameHandle?.playAgain()` or non-contract copy strings; Playwright owns those behaviors.

## 17. Coverage and Verification

The repository's Vitest config does not define a local numeric threshold, but `codecov.yml` currently requires **95% project and 95% patch coverage**. HPA-487 must satisfy the repository's existing Codecov status gate; this feature does not introduce or change that threshold.

Final implementation verification:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test:run
bun run test:coverage
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Any pre-existing typecheck baseline may be documented only if it is byte-identical on `main`; diagnostics in HPA-487-touched files must be fixed.

## 18. Acceptance Criteria

HPA-487 is complete when:

1. the frozen generator-v1 date produces its exact golden run and the 2026 sweep succeeds;
2. each Daily run contains five pool-valid unique templates and unique materialized canonical boards;
3. every materialized stage passes the production quality/solver verification and uses the returned par;
4. bonus objectives and stars use **stage-scoped** crystal/fall/reset facts;
5. Campaign scoring/output remain unchanged while Daily uses the same scoring functions with Daily config;
6. non-final stage results gate input until Continue; final stars appear in the normal final result overlay without an extra Continue;
7. completed Daily submits immediately with scoped context, while Daily End never submits and anonymous 401 remains local/silent;
8. fresh Start vs Play Again preserve the documented UTC rollover identity through the real page wiring;
9. Daily HUD shows date/reset/stage/par/bonus objective before each stage's first accepted move;
10. no HPA-488 ranking/server-admission or Expedition/evolving-tile work enters this implementation.

## 19. Spec Self-Review

- **Scope:** still six bounded implementation tasks; no new subsystem.
- **Reuse:** existing run/RNG/transforms/quality/physics/score/overlay seams remain authoritative.
- **Determinism:** source content edits are explicitly generator-versioned and the golden vector is a tripwire, not a snapshot to casually update.
- **Lifecycle:** only non-final Daily stages need a Continue state; final completion uses the existing result/submission path.
- **Stage policy:** stage counters cannot be confused with cumulative run counters.
- **Submission:** no auth preflight; the existing response channel gains one additive structured code.
- **Coverage:** 95% is an existing Codecov policy, not a new Vitest threshold introduced by HPA-487.
