# Ice Slide Daily Challenge MVP — Design

- **Date:** 2026-08-12
- **Status:** Proposed for HPA-487 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-487 — Ship Ice Slide Daily Challenge MVP with mode selection and three-star objectives
- **Planning PR:** #60
- **Parent design:** `docs/superpowers/specs/2026-07-30-ice-slide-replayability-design.md`

## 1. Summary

HPA-487 is the next unblocked Ice Slide replayability task. HPA-484 already added optional score context, HPA-485 added deterministic run definitions/RNG/transforms, and HPA-486 added the production solver and stage-quality validator.

This is an integration feature, not a new game framework. Daily generation materializes an `IceSlideRunDefinition` before play starts; `IceSlideGame` continues to consume materialized runs. Pure helpers own Daily generation, objective evaluation, and scoring. `init.ts` owns the clock boundary, exact retry identity, Daily HUD synchronization, stage-result gating, and submission choice.

The MVP ships only two selectable modes:

- **Campaign** — unchanged default behavior.
- **Daily** — one deterministic five-stage run per UTC date and version pair.

HPA-488 remains responsible for server-side Daily semantic admission and the Daily leaderboard UI/query flow.

## 2. Why HPA-487 Is Next

Linear models HPA-487 as blocked by HPA-484, HPA-485, and HPA-486. All three are Done. HPA-487 then unlocks HPA-488, HPA-489, and HPA-490.

The planning work lives in draft PR #60. HPA-487 remains a planning-only Backlog item until implementation begins.

## 3. Existing Boundaries to Reuse

The current code already provides the important foundations:

- `run.ts` owns run schema/version checks, Daily run-key/seed validation, stage signatures, Campaign materialization, and defensive cloning.
- `seeded-rng.ts` owns stable FNV-1a/Mulberry32 RNG and labeled forks.
- `transforms.ts` owns all eight transforms and canonical deduplication through `getUniqueBoardTransforms()`.
- `solver.ts` and `quality.ts` own bounded solve facts and stage admission.
- `game.ts` already accepts `start(run?: IceSlideRunDefinition)` and reports run/version metadata.
- `scoreService.ts` already accepts contextual submissions through `SaveScoreOptions.context`.
- `index.astro` already owns page-level Start/End/Reset/Play Again wiring.

HPA-487 extends these seams. It does not introduce `generator.ts`, a generic generated-run service, a mode registry, a new persistence service, or a shared overlay framework.

## 4. Approaches Considered

### 4.1 Recommended: thin Daily materializer + pure policy helpers

Add a focused `daily.ts` that turns an explicit UTC date key into a complete five-stage run, plus `objectives.ts` for objective evaluation. Extend existing scoring/game/init/page surfaces only where Daily differs.

This reuses every HPA-484/485/486 primitive directly and keeps the clock/RNG out of `IceSlideGame`.

### 4.2 Generic generated-run service

Rejected. Only Daily uses generated content today, while HPA-489 has materially different authored mutation templates and bounded candidate generation. Generalizing now would encode guesses.

### 4.3 Put Daily generation inside `IceSlideGame`

Rejected. It breaks the materialized-run boundary and couples gameplay state to the current clock and random-selection policy.

## 5. Fixed Product Decisions

1. Campaign remains the default and keeps existing score/submission semantics.
2. Daily is the only additional selectable mode. Do not show an Expedition placeholder.
3. `/ice-slide?mode=daily` preselects Daily. Any other/malformed value selects Campaign. Query selection never auto-starts.
4. A fresh Daily Start captures the current UTC date once and materializes a run for that date.
5. `Play Again` reuses the exact previously materialized Daily run, even after UTC rollover.
6. **Change Mode** from the result overlay returns to the idle selector without starting a run; a later Daily Start captures the then-current UTC date.
7. Daily has exactly five stages and exactly one seeded feasible bonus objective per stage.
8. Stage-clear feedback uses an explicit **Continue** button. There is no auto-advance timer or forced animation delay.
9. A partial Daily End is local only and never sends a score.
10. A completed authenticated Daily sends contextual score data. A positively confirmed anonymous session stays local without a score-save error.
11. HPA-488 owns server-side Daily admission and ranked presentation.
12. The finite authored Daily candidate set throws if it cannot materialize a valid stage; HPA-487 does not add the parent roadmap's mutation-generation fallback/retry service.
13. Expedition, mutation templates, snow, cracked ice, abilities, and the platform-wide Daily Challenge rotation remain out of scope.

## 6. Daily Run Materialization

### 6.1 Shared UTC date-key validation

The existing calendar-valid `YYYY-MM-DD` check inside `assertValidIceSlideRunDefinition()` must become one exported `run.ts` helper instead of being copied into `daily.ts`:

```ts
export function assertValidIceSlideUtcDateKey(dateKey: string): void
```

The helper requires the exact `YYYY-MM-DD` shape, constructs a UTC calendar date, round-trips year/month/day, and throws `RangeError` for malformed or impossible dates.

`assertValidIceSlideRunDefinition()` calls this helper for the date segment captured by the Daily run-key regex.

`daily.ts` exposes:

```ts
export function toIceSlideUtcDateKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('date must be valid')
  }
  const dateKey = date.toISOString().slice(0, 10)
  assertValidIceSlideUtcDateKey(dateKey)
  return dateKey
}
```

`createIceSlideDailyRunDefinition(dateKey)` also calls `assertValidIceSlideUtcDateKey(dateKey)` before constructing any seed or run key. There is one calendar-validation contract, not a second Daily parser.

### 6.2 Version and identity

Add:

```ts
export const ICE_SLIDE_DAILY_GENERATOR_VERSION = 1
export const ICE_SLIDE_DAILY_SOLVER_MAX_STATES = 10_000
```

For an explicit `dateKey`:

```text
seed = ice-slide:daily:<generatorVersion>:<rulesetVersion>:YYYY-MM-DD
runKey = ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>
```

The generator uses the existing `ICE_SLIDE_RULESET_VERSION`. It never reads the current clock itself.

### 6.3 Tier pools and source resolution

Daily stage pools are fixed:

```ts
export const ICE_SLIDE_DAILY_STAGE_POOLS = [
  [1, 2],
  [2, 3],
  [3, 4, 5],
  [5, 6, 7],
  [7, 8],
] as const
```

Pool values are authored `IceSlideLevel.id` values, never array offsets. Resolve a source by searching `ICE_SLIDE_LEVELS` for matching `level.id`; do not use `ICE_SLIDE_LEVELS[id - 1]`.

`run.ts` exports its existing difficulty mapping as:

```ts
export const CAMPAIGN_STAGE_DIFFICULTIES: readonly IceSlideDifficulty[]
```

After resolving the level, use that level's actual array index to read its Campaign difficulty.

### 6.4 Frozen stage metadata

Every selected Daily stage materializes these exact identity fields:

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

Compute `signature` from that complete object with `createIceSlideStageSignature()`.

These fields are part of the deterministic generator contract. A change that alters them for an existing date requires a Daily generator-version bump.

### 6.5 Exact deterministic selection algorithm

The selection algorithm is frozen as follows:

1. Create `rootRng = createSeededRng(seed)`.
2. For 1-based stage `N`, create `stageRng = rootRng.fork(`stage:${N}`)`.
3. Shuffle that stage's level-ID pool with `stageRng.fork('template').shuffle(pool)`.
4. Iterate the shuffled IDs and skip any `campaign:<id>` template already used by the run.
5. Resolve the source by `level.id` and call `getUniqueBoardTransforms(source.rows)`.
6. Shuffle those canonical-deduplicated variants with:

   ```ts
   stageRng
     .fork(`transform:${source.id}`)
     .shuffle(getUniqueBoardTransforms(source.rows))
   ```

7. Iterate variants and call `validateIceSlideStageQuality()` with:
   - `objectiveIds: []`;
   - par band exactly equal to `source.parMoves`;
   - `maxStates = 10_000`;
   - canonical keys already accepted for earlier stages.
8. The first accepted candidate wins; use `quality.parMoves` as the materialized par.
9. Build eligible bonus objectives from `quality.objectiveFeasibility` in this fixed order:

   ```ts
   [
     'collect_all_crystals',
     'no_falls',
     'no_reset',
   ]
   ```

10. Pick exactly one with `stageRng.fork('objective').pick(eligibleObjectives)`.
11. Materialize the frozen metadata from §6.4 and compute the signature.
12. Record its template ID and canonical key, then continue.
13. After five stages, call `assertValidIceSlideRunDefinition(run)` before returning it.

`no_reset` is feasible for every accepted solvable board, so the eligible-objective list cannot be empty.

The largest stage pool has three sources and each source has at most eight unique transforms. The finite authored search is therefore below the parent design's 64-candidate bound without adding a retry/fallback subsystem. If no source/variant satisfies the frozen contract, `createIceSlideDailyRunDefinition()` throws and the existing `failRun()` lifecycle owns cleanup/error display.

### 6.6 Generator-v1 golden output

Generator version 1 is not defined only by invariants. The full deterministic tuple for `2026-08-12` is frozen:

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

`daily.test.ts` asserts this literal projection in addition to run-key/seed and structural invariants.

Before generator v1 is considered frozen, the test suite also materializes every UTC date from `2026-01-01` through `2026-12-31` and asserts that none throws. This is a bounded content-validity sweep, not a statistical quality guarantee.

Any future change to pool contents/order, fork labels, transform candidate order, objective ordering, source metadata mapping, stage-signature inputs, or another generator choice that changes the same date's materialized run increments `ICE_SLIDE_DAILY_GENERATOR_VERSION`. Competitive physics/objective/scoring meaning continues to use `ICE_SLIDE_RULESET_VERSION`.

### 6.7 No hidden nondeterminism

`daily.ts` does not call `Math.random()`, `crypto.getRandomValues()`, or read the current clock. All entropy comes from the explicit seed and the frozen labeled RNG forks.

## 7. Objective and Star Model

Add a pure `objectives.ts` helper:

```ts
export interface IceSlideObjectiveFacts {
  parMoves: number
  movesUsed: number
  crystalsCollected: number
  totalCrystals: number
  falls: number
  resets: number
}

export function isIceSlideObjectiveComplete(
  objectiveId: IceSlideObjectiveId,
  facts: IceSlideObjectiveFacts
): boolean
```

Completion rules:

- `collect_all_crystals`: `totalCrystals > 0` and all stage crystals were collected.
- `no_falls`: no hazard was entered during the stage.
- `no_reset`: neither manual Reset nor hazard reset occurred during the stage.

Daily stars at clear time:

- Clear: always earned.
- Efficient: `movesUsed <= parMoves`.
- Bonus: evaluate the stage's single `objectiveIds[0]`.

The game records cumulative Daily stars in the existing `starsEarned` field. Campaign continues to report zero Daily stars.

## 8. Runtime State and Stage Results

Extend `IceSlideState` only with active-stage facts needed by policy/UI:

```ts
parMoves: number
objectiveIds: IceSlideObjectiveId[]
levelFalls: number
levelResets: number
```

`getState()` defensively copies `objectiveIds`.

Counter rules:

- A normal committed move keeps existing move behavior.
- Manual Reset increments `resets` and `levelResets`; it does not increment falls.
- Hazard entry increments `falls`, `resets`, `levelFalls`, and `levelResets` exactly once.
- Hazard reload preserves the hazard move in `levelMoves`.
- A new stage resets `levelFalls`/`levelResets` to zero.
- Same-stage Reset/hazard reload preserves those stage attempt counters.

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

Campaign may report Efficient as a fact but shows no star UI and does not increment `starsEarned`.

### 8.1 Preserve the current callback order

Do not redesign `IceSlideGame` into a paused-stage state machine.

- On a non-final clear, the game computes the completed-stage result, prepares the next stage using the existing immediate-load flow, and invokes `onLevelClear(result)`.
- On a final clear, it applies the correct completion bonus, sets `status = 'won'`, stops the timer, invokes `onLevelClear(result)`, then invokes `onWin(finalScore)` synchronously.

Tests lock final callback order as `level-clear` then `win`.

The browser overlay, not the game engine, prevents interaction with the already-prepared next stage.

## 9. Scoring

Existing Campaign functions/constants remain unchanged.

Add:

```ts
export const DAILY_SCORING_CONFIG = {
  objectiveStarBonus: 100,
  timeBudgetSeconds: 300,
  timeBonusPerSec: 5,
} as const

export function dailyStageScore(params: {
  stageNumber: number
  parMoves: number
  movesUsed: number
  crystalsCollected: number
  optionalStarsEarned: number
}): number

export function dailyTimeBonus(elapsedSeconds: number): number
```

Daily stage score:

```text
200 × stageNumber
+ moveBonus(parMoves, movesUsed)
+ 50 × crystalsCollected
+ 100 × optionalStarsEarned
```

`optionalStarsEarned` counts Efficient and bonus stars only (`0..2`). Clear is represented by the base clear points.

Daily completion bonus:

```text
max(0, (300 - elapsedSeconds) × 5)
```

Campaign keeps the existing 360-second completion bonus. Expedition scoring is untouched.

## 10. Browser Lifecycle and Retry Semantics

Use the two shipped choices only:

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

`start(mode)` means a fresh run:

- Campaign starts the normal Campaign.
- Daily calls `toIceSlideUtcDateKey(new Date())`, materializes the Daily, and stores a defensive copy plus the captured date key for retry/HUD use.

`playAgain()` retries the last started run:

- Campaign starts Campaign again.
- Daily starts a clone of the exact stored run and reuses its captured date key. It does not read the clock.

This is the only fresh-vs-retry distinction needed for UTC rollover.

## 11. Stage-Clear, Final-Win, and End Semantics

`init.ts` owns `inputLocked`, the stage-clear DOM state, and `pendingDailyWinScore`.

Movement is accepted only when:

```text
game.status === 'playing' && inputLocked === false
```

Keyboard and pointer/swipe use the same predicate. Reset also no-ops while the stage-clear overlay is active.

### 11.1 Daily non-final clear

1. `onLevelClear(result)` sets `inputLocked = true`.
2. Fill/show the stage-clear overlay and focus Continue.
3. `afterMove()` may render/synchronize the already-prepared next stage underneath the opaque overlay.
4. Continue hides the overlay, clears the lock, and calls render/HUD sync again before the player can move.

### 11.2 Daily final clear

Keep the engine callback order from §8.1.

1. Final `onLevelClear(result)` shows/locks the stage-clear overlay.
2. The immediately following Daily `onWin(finalScore)` **only** stores `pendingDailyWinScore = finalScore`; it does not show `MISSION COMPLETE`, call the external `callbacks.onWin`, reset buttons, authenticate, or submit.
3. Continue on that final overlay clears the stage overlay, shows `MISSION COMPLETE`, invokes the external win callback, resets controls, and starts the completed Daily submission flow exactly once.

This guarantees that the final stage result is visible before the result overlay or network work.

### 11.3 End while a stage-clear overlay is visible

The behavior is explicit because the engine has already advanced/finished underneath the overlay:

- **Non-final Daily overlay:** `stop()` hides the stage-clear overlay, clears the lock/pending stage UI, stops the now-current run, restores controls, shows local `RUN ENDED`, and does **not** submit any Daily score.
- **Final Daily overlay:** the End control is hidden/disabled while the final result awaits Continue. A programmatic `stop()` is a no-op: it leaves the final stage-clear overlay and pending win intact and does not submit. Continue remains the only transition to completed-result submission.

All start/fail/cleanup paths clear stage-result DOM state, locks, and pending win state.

There is no auto-dismiss timer. Reduced-motion users therefore have no forced delay.

## 12. Daily HUD and Page UI

Keep all page markup local to `src/pages/ice-slide/index.astro`; no shared component/API changes are needed.

### 12.1 Pre-run selector

Add a semantic Campaign/Daily selector above the canvas. Campaign is selected by default. Only exact query value `daily` changes that preselection. The selector is disabled while a run is active and re-enabled by Change Mode.

### 12.2 HUD ownership

`init.ts` extends `syncHud()` so the objective state cannot drift from the already-loaded game stage.

For Campaign:

- hide `#daily-meta`;
- preserve existing score/level/moves/crystals/time/name behavior.

For Daily:

- show `#daily-meta`;
- set `#daily-date` from the captured/retried Daily date key;
- set `#daily-reset` to `Resets at 00:00 UTC` plus the next UTC date;
- set `#daily-stage-progress` to `Stage N / 5`;
- set Clear text for reaching the goal;
- set Efficient text from current `state.parMoves`;
- set bonus text from `ICE_SLIDE_OBJECTIVE_LABELS[state.objectiveIds[0]]`.

Call this synchronization on initial Daily Start, normal `syncHud()` paths, and again after stage-clear Continue. Therefore every new Daily board exposes its three objectives before its first accepted move.

Do not add a UTC countdown scheduler.

### 12.3 Stage-clear overlay

Add a page-local opaque overlay inside the board area containing stage name/number, all three earned/missed objective rows, stage score gained, and a real Continue button. Use text/symbols in addition to color.

### 12.4 Result overlay and Change Mode

Keep shared GameOverlay's Play Again button. Add a page-local `#change-mode-btn` through `final-stats`.

- Play Again calls `gameHandle.playAgain()`.
- Change Mode hides the result overlay, shows the pre-run status/selector, re-enables mode controls, and does not auto-start.

No `GameOverlay` API change is required.

### 12.5 Scoring copy

Keep Campaign scoring copy and add a concise Daily note: +100 for each Efficient/bonus star and a 5:00 completion budget.

## 13. Score Submission and Anonymous Play

Campaign remains behavior-compatible:

- completed Campaign submits unscoped;
- manually ended Campaign with positive score still submits partial score.

Daily:

- any partial End never submits;
- only final-stage Continue may initiate completed submission;
- submission includes current game data and:

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

Before Daily submission, call `authClient.getSession()`:

- confirmed no session/no auth error => local result only;
- session exists => submit normally;
- session check fails => let the existing score endpoint remain authoritative instead of silently discarding a possibly authenticated result.

Capture the run guard before awaiting auth and re-check staleness afterward.

A score-save failure never invalidates local completion. HPA-488 adds server-side solved/run/version admission and ranking.

## 14. Error Handling

- Invalid/malformed mode query values fall back to Campaign without auto-start.
- Daily materialization failures use existing `failRun()` cleanup.
- Failed renderer setup keeps existing cleanup behavior.
- Fresh/retry start clears stale stage/result overlay state before creating a game.
- Run guards continue to suppress stale async callbacks.
- Daily score failure uses existing `Score not saved` reporting without removing local completion UI.
- Confirmed anonymous Daily completion is not an error.
- No path falls back to nondeterministic generation.

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
- `src/lib/games/ice-slide/game.ts` and existing game tests
- `src/lib/games/ice-slide/init.ts` and `init.test.ts`
- `src/pages/ice-slide/index.astro`
- `src/pages/game-board-markup.test.ts`
- `e2e/games/play-coverage.spec.ts`

### Do not modify for HPA-487

- database schema/query code;
- `/api/leaderboard` or leaderboard pages;
- server-side Daily admission logic;
- Expedition templates/generation;
- shared `GamePage`/`GameOverlay` APIs;
- platform Daily Challenge rotation.

## 16. Testing Strategy

### Pure generation

- shared UTC date-key helper accepts/rejects calendar dates once for both run validation and Daily materialization;
- exact seed/run-key for `2026-08-12`;
- literal generator-v1 golden tuple from §6.6;
- exactly five stages with pool-valid, non-repeated source template IDs;
- unique final canonical boards;
- source resolution by `level.id`, copied source name, and Campaign difficulty mapping;
- same date/version is byte-equivalent;
- representative different dates vary deterministically;
- every par equals the production solver result and assigned objective is feasible;
- every date in calendar year 2026 materializes without throwing;
- run signatures validate through `assertValidIceSlideRunDefinition()`.

### Objectives/scoring

- collect-all success/failure and zero-crystal behavior;
- no-falls success/failure;
- no-reset distinguishes manual/hazard reset history;
- Efficient uses `<= par`;
- exact Daily star bonus and 300-second completion boundaries;
- Campaign scoring remains unchanged.

### Game runtime

- manual Reset increments reset counters once;
- hazard increments fall/reset counters once and preserves move semantics;
- per-stage counters survive same-stage reload and reset on advance;
- Daily clear result reports exact stars/score gained;
- cumulative Daily stars carry across stages;
- final callback order stays `onLevelClear` then `onWin`;
- Campaign score/progression/reset/hazard behavior remains compatible.

### Browser integration

- fresh Daily captures current UTC date;
- `playAgain()` reproduces the exact run/signatures after simulated UTC rollover;
- fresh Daily after rollover uses the new date;
- Campaign hides Daily HUD;
- Daily start populates date/reset/stage/par/bonus HUD before the first move;
- Continue re-syncs the next stage HUD;
- non-final overlay End terminates locally with no submission;
- final overlay `onWin` remains pending until Continue; final overlay End is inert;
- partial Daily End never calls `saveGameScore()`;
- completed Daily uses exact context once;
- confirmed anonymous completion skips submission;
- keyboard/swipe/reset remain locked while stage result is active;
- cleanup/failure clears locks/overlays/pending win;
- Campaign partial/full submissions remain unscoped.

### Page/E2E

- `/ice-slide` defaults to Campaign;
- `/ice-slide?mode=daily` preselects Daily;
- malformed/unavailable mode falls back to Campaign;
- Daily Start shows date/stage/objectives;
- Playwright fixes browser time before UTC rollover, starts Daily, ends locally, advances clock across midnight, clicks Play Again, and verifies the displayed Daily date is unchanged;
- Change Mode returns to an enabled selector/pre-run state without auto-start;
- Campaign happy path remains covered;
- manual Continue has keyboard-accessible behavior and no reduced-motion wait.

## 17. Acceptance Criteria

HPA-487 is complete when:

1. the generator-v1 golden `2026-08-12` tuple and same-date byte equivalence are locked;
2. the complete 2026 UTC date sweep materializes without failure and representative dates vary;
3. every run has five unique source templates and canonical boards, recomputed pars, and one feasible bonus objective;
4. stars correctly reflect par, crystals, hazards, manual Reset, and hazard reset;
5. Daily scoring uses the documented stage formula and 300-second budget while Campaign stays unchanged;
6. final engine callbacks keep `onLevelClear` then `onWin`, while browser completion/submission waits for final Continue;
7. partial/overlay End behavior is deterministic and never admits a partial Daily submission;
8. Daily HUD is correct before each stage's first accepted move;
9. Play Again retry identity is covered both in handle tests across UTC rollover and in page-level Playwright wiring; Change Mode has no auto-start;
10. only completed Daily runs attempt contextual submission and confirmed anonymous runs remain local;
11. no HPA-488 ranking/server-admission or Expedition/evolving-tile work is pulled into this implementation.

## 18. Spec Self-Review

- **Placeholder scan:** no TBD/TODO remains.
- **Consistency:** one materialized-run boundary; one UTC calendar validator; one frozen RNG-label/output contract.
- **Scope:** HPA-488 and HPA-489+ remain separate.
- **YAGNI:** no generic generator pipeline, mode registry, persistence service, shared overlay abstraction, countdown scheduler, or game-engine pause state.
- **Lifecycle ambiguity:** final callback order, final Continue, non-final/final End, HUD re-sync, Play Again, and Change Mode are explicit.
- **Versioning:** a same-date materialization change is a generator-version change, not a silent patch.