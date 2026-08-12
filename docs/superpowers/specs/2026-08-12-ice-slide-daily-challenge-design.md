# Ice Slide Daily Challenge MVP — Design

- **Date:** 2026-08-12
- **Status:** Proposed for HPA-487 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-487 — Ship Ice Slide Daily Challenge MVP with mode selection and three-star objectives
- **Parent design:** `docs/superpowers/specs/2026-07-30-ice-slide-replayability-design.md`

## 1. Summary

HPA-487 is the next unblocked Ice Slide replayability task. Its prerequisites are already merged: HPA-484 added optional score context, HPA-485 added deterministic run definitions/RNG/transforms, and HPA-486 added the production solver and stage-quality validator.

This change should therefore be an integration feature, not a new game framework. Daily generation materializes an `IceSlideRunDefinition` before play starts; `IceSlideGame` continues to consume materialized runs. Pure helpers own Daily generation, objective evaluation, and scoring. `init.ts` owns the clock boundary, retry identity, local UI gating, and submission choice.

The MVP ships only two selectable modes:

- **Campaign** — unchanged default behavior.
- **Daily** — one deterministic five-stage run per UTC date and version pair.

HPA-488 remains responsible for server-side semantic admission and the Daily leaderboard UI/query flow.

## 2. Why HPA-487 Is Next

Linear currently models HPA-487 as blocked by HPA-484, HPA-485, and HPA-486. All three are Done. HPA-487 in turn blocks HPA-488, HPA-489, and HPA-490, so completing it unlocks both the Daily ranking finish work and Expedition generation work.

No HPA-487 branch or PR currently exists in GitHub.

## 3. Existing Boundaries to Reuse

The current code already provides the important foundations:

- `run.ts` owns run schema/version checks, exact Daily run-key/seed validation, stage signatures, Campaign materialization, and defensive cloning.
- `seeded-rng.ts` owns stable FNV-1a/Mulberry32 RNG and labeled forks.
- `transforms.ts` owns all eight transforms and canonical deduplication through `getUniqueBoardTransforms()`.
- `quality.ts` owns solver-backed board, par, duplicate, and objective-feasibility validation.
- `game.ts` already accepts `start(run?: IceSlideRunDefinition)` and reports run/version metadata in state/game data.
- `scoreService.ts` already accepts contextual submissions through `SaveScoreOptions.context`.
- `index.astro` already owns the page-level Start/End/Reset/Play Again wiring.

HPA-487 should extend these seams rather than introduce a generic generator framework, mode registry, overlay framework, or new persistence service.

## 4. Approaches Considered

### 4.1 Recommended: thin Daily materializer + pure policy helpers

Add a focused `daily.ts` that turns an explicit UTC date key into a complete five-stage run, plus `objectives.ts` for objective evaluation. Extend existing scoring/game/init/page surfaces only where Daily behavior differs.

**Why this fits now**

- Reuses every HPA-484/485/486 primitive directly.
- Keeps date/random selection out of `IceSlideGame`.
- Keeps Expedition-specific template/retry orchestration out of HPA-487.
- Produces deterministic, independently testable contracts.
- Is small enough to replace later only if Expedition proves a shared abstraction is actually useful.

### 4.2 Generic generated-run service

Create a reusable generator pipeline with policies for pools, retries, objectives, fallbacks, and modes.

**Rejected for HPA-487:** only Daily uses generated content today. HPA-489 has materially different authored mutation templates and bounded candidate generation. Generalizing before that code exists would encode guesses and increase the implementation surface.

### 4.3 Put Daily generation inside `IceSlideGame`

Have the game inspect the current date and construct Daily stages internally.

**Rejected:** this breaks the already-established materialized-run boundary, makes rollover/retry testing harder, and couples gameplay state to clock/RNG policy.

## 5. Fixed Product Decisions

1. Campaign remains the default and keeps its existing score/submission semantics.
2. Daily is the only additional selectable mode. Do not show Expedition placeholders.
3. `/ice-slide?mode=daily` preselects Daily. Any other/malformed value selects Campaign. Query selection never auto-starts a run.
4. A fresh Daily Start captures the current UTC date once and materializes a run from that date.
5. `Play Again` reuses the exact previously materialized Daily run, even after UTC rollover.
6. A player can choose **Change Mode** from the result overlay to return to the idle selector; starting Daily from there captures the then-current UTC date.
7. Daily has exactly five stages and one seeded bonus objective per stage.
8. Stage-clear feedback uses an explicit **Continue** button. There is no auto-advance timer or forced animation delay.
9. Daily partial End is local only and never sends a score.
10. Daily completed authenticated runs send contextual scores. A positively confirmed anonymous session stays local without producing a score-save error.
11. HPA-488 owns server-side Daily admission rules and leaderboard presentation; HPA-487 does not duplicate them.
12. Expedition, mutation templates, snow, cracked ice, abilities, and the platform-wide Daily Challenge rotation remain out of scope.

## 6. Daily Run Materialization

### 6.1 Version and identity

Add:

```ts
export const ICE_SLIDE_DAILY_GENERATOR_VERSION = 1
export const ICE_SLIDE_DAILY_SOLVER_MAX_STATES = 10_000
```

For an explicit `dateKey: YYYY-MM-DD`:

```text
seed = ice-slide:daily:<generatorVersion>:<rulesetVersion>:YYYY-MM-DD
runKey = ice-slide:daily:YYYY-MM-DD:g<generatorVersion>:r<rulesetVersion>
```

The generator uses the existing `ICE_SLIDE_RULESET_VERSION`. `init.ts`, not the generator or game engine, converts `new Date()` to a UTC date key.

### 6.2 Tier pools

Daily stage pools are fixed to the parent design:

```ts
[
  [1, 2],
  [2, 3],
  [3, 4, 5],
  [5, 6, 7],
  [7, 8],
]
```

The values are authored Campaign level IDs, not array offsets.

`run.ts` should expose the existing Campaign difficulty mapping under a stable exported name so `daily.ts` does not duplicate level-to-difficulty knowledge.

### 6.3 Exact deterministic selection algorithm

The algorithm is deliberately finite and bounded by the small authored pools:

1. Create `rootRng = createSeededRng(seed)`.
2. For stage number `N` (1-based), create `stageRng = rootRng.fork('stage:N')`.
3. Shuffle that stage's level pool with `stageRng.fork('template').shuffle(pool)`.
4. Iterate the shuffled level IDs and skip any template ID already used by this run.
5. For each remaining source level, call `getUniqueBoardTransforms(level.rows)`. This removes symmetric duplicate transforms before random choice.
6. Shuffle those unique variants with `stageRng.fork('transform:<levelId>').shuffle(variants)`.
7. Iterate variants and call `validateIceSlideStageQuality()` with:
   - `objectiveIds: []`;
   - `parBand.minMoves = source.parMoves`;
   - `parBand.maxMoves = source.parMoves`;
   - `maxStates = 10_000`;
   - the canonical keys already accepted for earlier stages.
8. The first accepted candidate wins. Its returned `parMoves` becomes the materialized par.
9. Build the eligible bonus-objective list from the validator's `objectiveFeasibility` in this fixed order:
   `collect_all_crystals`, `no_falls`, `no_reset`.
10. Pick exactly one with `stageRng.fork('objective').pick(eligibleObjectives)`.
11. Materialize the stage with the selected transform, no mutation IDs, `scoreMultiplierBps = 10000`, and a signature from `createIceSlideStageSignature()`.
12. Record the source template ID and canonical key, then continue to the next stage.
13. After five stages, call `assertValidIceSlideRunDefinition(run)` before returning it.

`no_reset` is feasible for every solvable board, so the eligible-objective list is non-empty after quality acceptance.

The complete search space is at most three authored templates × eight unique transforms for any one Daily stage, so it stays below the parent design's 64-candidate cap without introducing a retry service. If the checked-in authored content cannot produce a valid unique candidate, `createIceSlideDailyRunDefinition()` throws. The existing `failRun` path owns cleanup and player-safe error display.

### 6.4 No hidden nondeterminism

`daily.ts` must not call `Math.random()`, `crypto.getRandomValues()`, or read the current clock. All entropy comes from the explicit seed and labeled RNG forks.

## 7. Objective and Star Model

Add a pure `objectives.ts` helper rather than embedding policy in the renderer or page.

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

Daily stars are computed at clear time:

- Clear: always earned when the result is produced.
- Efficient: `movesUsed <= parMoves`.
- Bonus: evaluate the stage's single `objectiveIds[0]` with the facts above.

The game records the cumulative Daily star count in the existing `starsEarned` field. Campaign continues to report `starsEarned = 0`.

## 8. Runtime State and Stage Results

Extend `IceSlideState` only with data needed to render/evaluate the active stage:

```ts
parMoves: number
objectiveIds: IceSlideObjectiveId[]
levelFalls: number
levelResets: number
```

`getState()` must defensively copy `objectiveIds`.

Counter rules:

- A normal committed move keeps the existing move behavior.
- Manual Reset increments `resets` and `levelResets`; it does not increment falls.
- Hazard entry increments `falls`, `resets`, `levelFalls`, and `levelResets` exactly once.
- Existing hazard behavior continues to preserve the hazard move in `levelMoves`.
- Starting a new stage resets `levelFalls`/`levelResets` to zero.
- Reloading the same stage because of Reset/hazard preserves those stage counters.

Replace the numeric `onLevelClear(level)` payload with a focused result object because the callback is local to Ice Slide and the new UI needs the facts anyway:

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

For Campaign, `bonus` is `null` and cumulative `starsEarned` remains unchanged. The `efficient` fact may still be reported for consistency, but Campaign UI does not show star feedback.

The game can prepare the next stage immediately after producing this result. The browser integration places an opaque stage-clear overlay above the canvas before `afterMove()` renders again, so the player sees the completed-stage result before interacting with the next board without adding a new game-engine pause/advance state.

## 9. Scoring

Existing Campaign functions and constants remain unchanged.

Add pure Daily functions in `scoring.ts`:

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

`dailyStageScore` reuses the current Campaign primitives for base clear, move efficiency, and crystals:

```text
200 × stageNumber
+ moveBonus(parMoves, movesUsed)
+ 50 × crystalsCollected
+ 100 × optionalStarsEarned
```

`optionalStarsEarned` is the number of earned Efficient/bonus stars (`0..2`); the Clear star is represented by the base clear points.

The Daily completion bonus is:

```text
max(0, (300 - elapsedSeconds) × 5)
```

Only `mode === 'daily'` uses these new functions. Campaign keeps the existing 360-second completion bonus. Expedition scoring is not implemented or changed by HPA-487.

## 10. Browser Lifecycle and Retry Semantics

Change the handle to expose the two shipped choices without inventing a mode registry:

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

`start(mode)` means a **fresh** run:

- Campaign creates the normal Campaign run.
- Daily captures `new Date().toISOString().slice(0, 10)`, materializes the Daily run, and stores a defensive copy as the retry run.

`playAgain()` means **retry the last started run**:

- Campaign starts Campaign again.
- Daily starts a clone of the exact stored run. It never re-reads the date.

This distinction directly handles UTC rollover without adding clock state to `IceSlideGame`.

## 11. Stage-Clear and Input Gating

`init.ts` owns a small `inputLocked` flag.

Input is accepted only while:

```text
game.status === 'playing' && inputLocked === false
```

Both keyboard and pointer/swipe paths use the same condition.

For Daily stage clear:

1. Receive `IceSlideStageClearResult`.
2. Set `inputLocked = true`.
3. Fill the stage-clear overlay with Clear/Efficient/bonus states and score gained.
4. Show the overlay and focus its Continue button.
5. On Continue, hide the overlay, clear the lock, render/sync the next stage.

There is no auto-dismiss timer. This makes keyboard behavior deterministic and inherently satisfies reduced-motion requirements.

On the fifth Daily stage, `onWin` records the pending final score while the stage-clear overlay remains visible. Continue then transitions to the existing mission-complete overlay, invokes the external win callback, and submits the completed result.

All failure/cleanup/start paths clear pending overlay state and input locks.

## 12. Page UI

Keep the UI local to `src/pages/ice-slide/index.astro`.

### 12.1 Pre-run mode selector

Add a compact semantic selector above the canvas:

- Campaign
- Daily

Campaign starts selected. The page reads `URLSearchParams` once during initialization; only the exact string `daily` preselects Daily. `campaign`, missing values, `expedition`, and malformed values all select Campaign.

The selector is disabled while a run is active.

### 12.2 Daily HUD

Show only in Daily mode:

- UTC competition date.
- `Resets at 00:00 UTC` plus the next UTC date.
- `Stage N / 5`.
- active objective rows for Clear, Efficient (`≤ par`), and the seeded bonus objective.

Do not add a countdown timer; the existing elapsed-time ticker should not be overloaded with UTC boundary scheduling.

### 12.3 Stage-clear overlay

Add a page-local overlay inside the board area with:

- stage name/number;
- three objective rows with earned/missed states;
- stage score gained;
- Continue button.

Use text/symbol state in addition to color.

### 12.4 Result overlay escape path

Keep the shared GameOverlay's primary **Play Again** button. Add a small **Change Mode** button through the existing `final-stats` slot. It hides the result overlay, returns to the idle selector, and does not start a run.

This preserves the required Daily retry behavior while still letting a player switch mode or start a new post-rollover Daily run.

### 12.5 Scoring copy

Keep existing Campaign scoring copy and add one concise Daily note: Daily gives +100 for each Efficient/bonus star and uses a 5:00 completion budget.

No new shared UI component is needed for one page.

## 13. Score Submission and Anonymous Play

Campaign submission remains byte-for-behavior compatible:

- completed Campaign submits unscoped;
- manually ended Campaign with positive score still submits its partial score.

Daily behavior:

- manual End never submits;
- only the final completed five-stage run submits;
- submission uses current game data and:

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

Before a Daily submission, call the existing `authClient.getSession()`:

- if it positively returns no session and no error, keep the result local and skip `saveGameScore()`;
- if a session exists, submit normally;
- if the session check itself fails, allow the existing score endpoint to remain authoritative rather than silently discarding a potentially authenticated result.

A score-save failure never invalidates the completed local run.

HPA-487 performs only this client lifecycle guard. HPA-488 will add server-side checks for solved state, matching Daily key/version identity, and leaderboard admission.

## 14. Error Handling

- Invalid/malformed mode query values fall back to Campaign without auto-start.
- Daily materialization failures flow through the existing `failRun()` cleanup path.
- Failed renderer setup retains the existing cleanup behavior.
- `start()` clears stale stage/result overlay state before creating a new game.
- Run guard semantics continue to suppress stale achievement callbacks.
- Daily score failures use the existing `Score not saved` reporting but do not remove local completion UI.
- A confirmed anonymous Daily completion is not an error.
- No path falls back to nondeterministic generation.

## 15. File Boundaries

### Create

- `src/lib/games/ice-slide/daily.ts` — deterministic Daily identity/stage materialization.
- `src/lib/games/ice-slide/daily.test.ts` — deterministic pools/transforms/quality/version tests.
- `src/lib/games/ice-slide/objectives.ts` — pure objective completion and display labels.
- `src/lib/games/ice-slide/objectives.test.ts` — objective rules.

### Modify

- `src/lib/games/ice-slide/types.ts` — active-stage facts, stage-clear result, playable mode type.
- `src/lib/games/ice-slide/run.ts` — expose Campaign difficulty mapping for reuse.
- `src/lib/games/ice-slide/scoring.ts` and tests — Daily pure score functions.
- `src/lib/games/ice-slide/game.ts` and tests — counters, Daily stars/scoring/result payload.
- `src/lib/games/ice-slide/init.ts` and tests — fresh-vs-retry runs, input gate, overlays, scoped completed submission, anonymous guard.
- `src/pages/ice-slide/index.astro` — selector, Daily HUD, stage/result controls and URL preselection.
- `e2e/games/play-coverage.spec.ts` — preserve Campaign smoke and add focused Daily selector/query/lifecycle coverage.

### Do not modify for HPA-487

- database schema/query code;
- `/api/leaderboard` or leaderboard pages;
- server-side score admission logic;
- Expedition templates/generation;
- shared `GamePage`/`GameOverlay` APIs unless implementation discovers an actual blocker;
- platform Daily Challenge rotation.

## 16. Testing Strategy

### Pure generation

- exact seed/run-key format for a fixed UTC date;
- exactly five stages;
- stage templates follow pools and never repeat;
- all final canonical boards are unique;
- same date/version produces deeply equal run definitions;
- multiple representative dates produce deterministic variation;
- every materialized par equals the production solver result;
- every assigned objective is feasible;
- generated signatures pass `assertValidIceSlideRunDefinition()`.

### Objectives/scoring

- collect-all success/failure;
- no-falls success/failure;
- no-reset distinguishes manual/hazard reset history;
- Efficient uses `<= par`;
- Daily optional-star bonus and 300-second completion bonus exact boundaries;
- existing Campaign scoring tests stay unchanged.

### Game runtime

- manual Reset increments reset counters once;
- hazard increments fall/reset counters once and preserves move semantics;
- per-stage attempt counters survive reload then reset on next stage;
- Daily clear result reports exact star outcome/score gained;
- cumulative Daily stars carry across stages;
- Campaign score, stars, progression, reset/hazard behavior remain compatible.

### Browser integration

- fresh Daily captures current UTC date;
- `playAgain()` reproduces exact run/signatures after simulated UTC rollover;
- a new Daily `start('daily')` after rollover uses the new date;
- partial Daily End does not call `saveGameScore()`;
- completed Daily uses exact score context;
- confirmed anonymous completion skips submission;
- stage-clear overlay gates keyboard and swipe until Continue;
- cleanup/failure clears locks/overlays;
- Campaign partial/full submission remains unscoped.

### Page/E2E

- `/ice-slide` defaults to Campaign;
- `/ice-slide?mode=daily` preselects Daily;
- malformed/unavailable `mode` falls back to Campaign;
- Daily Start shows date/stage/objectives;
- Campaign happy path remains covered;
- stage-clear Continue path is keyboard accessible;
- Change Mode returns to the selector;
- reduced-motion mode has no mandatory wait because the overlay is manual.

## 17. Acceptance Criteria

HPA-487 is complete when:

1. same UTC date + versions produces byte-equivalent five-stage Daily run data across retries/clients;
2. representative dates deterministically vary while templates/final boards do not repeat within a run;
3. every Daily stage is solver-validated, has recomputed par, and has one feasible seeded bonus objective;
4. stars correctly reflect par, crystals, hazards, manual Reset, and hazard reset;
5. Daily scoring uses the documented stage formula and 300-second time budget;
6. only completed Daily runs attempt contextual submission and confirmed anonymous runs remain local;
7. Campaign behavior, scoring, achievements, partial End semantics, and unscoped submission remain unchanged;
8. mode selection, URL preselection, stage metadata, objective feedback, retry identity, input gating, keyboard/swipe parity, cleanup, and reduced-motion behavior are covered by tests;
9. no HPA-488 leaderboard/server-admission work or Expedition/evolving-tile work is pulled into this implementation.

## 18. Spec Self-Review

- **Placeholder scan:** no TBD/TODO or deferred decision exists inside HPA-487 scope.
- **Consistency:** Daily generation remains outside `IceSlideGame`; the game consumes only materialized runs.
- **Scope:** HPA-488 server admission/leaderboard work and HPA-489+ Expedition work remain explicitly separate.
- **YAGNI:** no mode registry, generic generator pipeline, new persistence service, shared overlay abstraction, UTC countdown scheduler, or automatic stage-delay state machine is introduced.
- **Ambiguity:** fresh Start vs Play Again has explicit rollover semantics; objective RNG order and selection labels are fixed; partial Daily End submission behavior is explicit.