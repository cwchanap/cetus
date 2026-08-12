# Ice Slide Daily Challenge MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-487 with a deterministic five-stage Ice Slide Daily mode, stage-scoped objectives/stars, Daily score configuration, exact retry identity, compact mode/HUD UX, and contextual completed-run submission while preserving Campaign behavior.

**Architecture:** Materialize a complete Daily `IceSlideRunDefinition` from an explicit UTC date before gameplay. Keep generation/objective/scoring policy pure; keep the game engine clock/RNG-free; let `init.ts` own retry identity, HUD synchronization, non-final stage-result gating, End behavior, and submission. Final Daily completion reuses the existing `onWin` result/submission path rather than adding a second final-Continue state.

**Tech Stack:** Astro 5, TypeScript 6, PixiJS 8, Vitest 3, Playwright, existing Cetus score service and deterministic Ice Slide run/RNG/transform/solver/quality modules.

## Global Constraints

- Campaign remains default and preserves current scoring, achievements, unscoped submission, and positive-score partial-End behavior.
- Daily is the only additional playable mode; no Expedition placeholder.
- `IceSlideMode` remains `campaign | daily | expedition`; browser `IceSlidePlayableMode` is only `campaign | daily`.
- `IceSlideGame` never reads the clock or random source.
- Daily generation never calls `Math.random()` or `crypto.getRandomValues()`.
- Fresh Daily Start captures current UTC date; Play Again retries the exact stored materialized run.
- Daily contains five stages, unique source templates, unique materialized canonical boards, and one feasible seeded bonus objective per stage.
- Non-final Daily stage clears use manual Continue. Final Daily stars render in the normal result overlay and submission starts immediately from `onWin`.
- Daily End is local-only, never submits, and shows `RUN ENDED` even at score 0.
- Anonymous completion uses the normal score endpoint; structured `UNAUTHENTICATED` is silent/local.
- HPA-488 owns server-side semantic admission and Daily leaderboard/ranking.
- No generic generator service, mode registry, shared overlay framework, persistence service, mutation templates, Expedition, snow, cracked ice, or abilities.
- Existing `codecov.yml` 95% project/patch status targets remain in force; HPA-487 does not create a new coverage threshold.

---

## File Structure

### Create

- `src/lib/games/ice-slide/daily.ts` — deterministic UTC-keyed Daily run materialization.
- `src/lib/games/ice-slide/daily.test.ts` — golden vector, full-year sweep, deterministic invariants.
- `src/lib/games/ice-slide/objectives.ts` — pure stage-scoped bonus-objective rules and labels.
- `src/lib/games/ice-slide/objectives.test.ts` — objective-rule tests.
- `src/lib/games/ice-slide/scoring.test.ts` — default Campaign and Daily-config score tests.

### Modify

- `src/lib/games/ice-slide/run.ts` — shared UTC date-key validator; export Campaign difficulty mapping.
- `src/lib/games/ice-slide/types.ts` — playable mode, active-stage facts, clear-result payload.
- `src/lib/games/ice-slide/scoring.ts` — one configurable `levelScore()`/`timeBonus()` shape.
- `src/lib/games/ice-slide/test-fixtures.ts` — valid five-stage Daily test run helper.
- `src/lib/games/ice-slide/game.ts` and focused tests — counters, stars, score config, clear-result payload/order.
- `src/lib/games/ice-slide/init.ts` and tests — fresh/retry lifecycle, HUD, non-final overlay, Daily End, scoped submit.
- `src/lib/services/scoreService.ts` and tests — additive `UNAUTHENTICATED` structured failure propagation.
- `src/pages/ice-slide/index.astro` — page-local selector/HUD/overlays/Play Again/Change Mode.
- `src/pages/game-board-markup.test.ts` — stable DOM contracts only.
- `e2e/games/play-coverage.spec.ts` — Campaign + Daily page-level lifecycle coverage.

### Explicitly unchanged

- database schema/query code;
- `/api/leaderboard` and leaderboard UI;
- server Daily admission rules;
- shared `GamePage` / `GameOverlay` APIs;
- platform Daily Challenge rotation;
- Expedition/template/evolving-tile modules.

---

## Task 1: Freeze and materialize deterministic Daily generator v1

**Files:**
- Create: `src/lib/games/ice-slide/daily.ts`
- Create: `src/lib/games/ice-slide/daily.test.ts`
- Modify: `src/lib/games/ice-slide/run.ts`

**Produces:**

```ts
export function assertValidIceSlideUtcDateKey(dateKey: string): void
export const CAMPAIGN_STAGE_DIFFICULTIES: readonly IceSlideDifficulty[]

export const ICE_SLIDE_DAILY_GENERATOR_VERSION = 1
export const ICE_SLIDE_DAILY_SOLVER_MAX_STATES = 10_000
export const ICE_SLIDE_DAILY_STAGE_POOLS: readonly (readonly number[])[]
export function toIceSlideUtcDateKey(date: Date): string
export function createIceSlideDailyRunDefinition(
  dateKey: string
): IceSlideRunDefinition
```

### Step 1: Write failing shared-date tests

- [ ] Extract/add tests in `run.test.ts` (or the existing run test file) for exact calendar validity:

```ts
expect(() => assertValidIceSlideUtcDateKey('2026-08-12')).not.toThrow()
expect(() => assertValidIceSlideUtcDateKey('2026-02-29')).toThrow(RangeError)
expect(() => assertValidIceSlideUtcDateKey('2024-02-29')).not.toThrow()
expect(() => assertValidIceSlideUtcDateKey('2026-13-01')).toThrow(RangeError)
expect(() => assertValidIceSlideUtcDateKey('08-12-2026')).toThrow(RangeError)
```

- [ ] Add `daily.test.ts` red tests:

```ts
expect(toIceSlideUtcDateKey(new Date('2026-08-12T23:59:59Z'))).toBe(
  '2026-08-12'
)
expect(() => toIceSlideUtcDateKey(new Date(Number.NaN))).toThrow(RangeError)
```

- [ ] Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/daily.test.ts
```

Expected: FAIL on missing exports/module.

### Step 2: Extract the existing date validator

- [ ] Move the current Daily run-key calendar round-trip check from `assertValidIceSlideRunDefinition()` into `assertValidIceSlideUtcDateKey()`.
- [ ] Make Daily run validation call that helper with the run-key date segment.
- [ ] Keep run-key/seed/version behavior otherwise byte-compatible.

### Step 3: Export Campaign difficulty metadata

- [ ] Rename the private Campaign difficulty constant to:

```ts
export const CAMPAIGN_STAGE_DIFFICULTIES: readonly IceSlideDifficulty[] = [
  'tutorial',
  'easy',
  'easy',
  'medium',
  'medium',
  'medium',
  'hard',
  'hard',
]
```

- [ ] Reuse it in Campaign materialization; keep the existing length assertion.

### Step 4: Write the full generator-v1 golden test before implementation

- [ ] Lock identity:

```ts
const run = createIceSlideDailyRunDefinition('2026-08-12')
expect(run).toMatchObject({
  schemaVersion: 1,
  generatorVersion: 1,
  rulesetVersion: 1,
  mode: 'daily',
  seed: 'ice-slide:daily:1:1:2026-08-12',
  runKey: 'ice-slide:daily:2026-08-12:g1:r1',
})
```

- [ ] Lock the literal stage projection:

```ts
expect(
  run.stages.map(stage => ({
    id: stage.id,
    name: stage.name,
    templateId: stage.templateId,
    transform: stage.transform,
    objectiveIds: stage.objectiveIds,
    parMoves: stage.parMoves,
    difficulty: stage.difficulty,
    signature: stage.signature,
  }))
).toEqual([
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
])
```

Name the test so failure says generator v1 output changed and a version-bump decision is required. Do not treat it as a snapshot to casually re-record.

### Step 5: Add deterministic invariant tests

- [ ] Same date returns byte-equivalent JSON.
- [ ] Exactly five stages.
- [ ] Each stage's `templateId` belongs to its stage pool and all five templates are unique.
- [ ] `serializeBoardRows(stage.rows)` is unique across the five materialized stages.
- [ ] Every stage has exactly one objective, no mutations, multiplier 10_000, and positive verified par.
- [ ] `assertValidIceSlideRunDefinition(run)` succeeds.
- [ ] Representative dates vary deterministically.

### Step 6: Add the bounded full-year content sweep

- [ ] Materialize each calendar date from `2026-01-01` through `2026-12-31` and assert no throw:

```ts
for (let day = new Date('2026-01-01T00:00:00Z');
     day <= new Date('2026-12-31T00:00:00Z');
     day = new Date(day.getTime() + 86_400_000)) {
  expect(() =>
    createIceSlideDailyRunDefinition(toIceSlideUtcDateKey(day))
  ).not.toThrow()
}
```

Do not add a benchmark threshold; this is content validity.

### Step 7: Implement `daily.ts` with the frozen algorithm

- [ ] Exact pools:

```ts
export const ICE_SLIDE_DAILY_STAGE_POOLS = [
  [1, 2],
  [2, 3],
  [3, 4, 5],
  [5, 6, 7],
  [7, 8],
] as const
```

- [ ] Resolve each pool entry by `ICE_SLIDE_LEVELS.findIndex(level => level.id === id)`; throw if missing. Never use `id - 1`.
- [ ] Exact forks:

```ts
const stageRng = rootRng.fork(`stage:${stageNumber}`)
const templateOrder = stageRng.fork('template').shuffle(pool)
const variantOrder = stageRng
  .fork(`transform:${source.id}`)
  .shuffle(getUniqueBoardTransforms(source.rows))
```

- [ ] Validate each candidate using the production quality gate with empty objectives, exact source par band, 10_000 max states, and previously accepted canonical keys.
- [ ] Current generator-v1 content is expected to accept the first eligible candidate; retain candidate iteration as defensive content validation but do not create dependency injection solely to force its failure path.
- [ ] Eligible objectives are filtered in exact order:

```ts
['collect_all_crystals', 'no_falls', 'no_reset']
```

- [ ] Pick with `stageRng.fork('objective')`.
- [ ] Materialize exact metadata:

```ts
const stage = {
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
  signature: '',
}
stage.signature = createIceSlideStageSignature(stage)
```

- [ ] Throw if the finite authored set cannot produce a stage; do not add fallback/retry infrastructure.
- [ ] Validate the complete run before returning.

### Step 8: Verify Task 1

- [ ] Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/transforms.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/shared/seeded-rng.test.ts
```

Expected: PASS.

- [ ] Confirm no `Math.random`, `crypto.getRandomValues`, or `new Date()` inside materialization logic.

### Step 9: Commit

- [ ] Commit only Task 1 files:

```bash
git add \
  src/lib/games/ice-slide/run.ts \
  src/lib/games/ice-slide/daily.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/run.test.ts
git commit -m "feat(ice-slide): materialize deterministic daily runs"
```

---

## Task 2: Add stage-scoped objective policy and configurable scoring

**Files:**
- Create: `src/lib/games/ice-slide/objectives.ts`
- Create: `src/lib/games/ice-slide/objectives.test.ts`
- Create: `src/lib/games/ice-slide/scoring.test.ts`
- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/scoring.ts`

**Produces:**

```ts
export type IceSlidePlayableMode = 'campaign' | 'daily'

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

export const ICE_SLIDE_OBJECTIVE_LABELS: Record<IceSlideObjectiveId, string>

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

Add state fields:

```ts
parMoves: number
objectiveIds: IceSlideObjectiveId[]
levelFalls: number
levelResets: number
```

Change Ice Slide callback only:

```ts
onLevelClear: (result: IceSlideStageClearResult) => void
```

### Step 1: Write failing objective tests

- [ ] Test collect-all true/false and zero-crystal false.
- [ ] Test `no_falls` against **stageFalls** only.
- [ ] Test `no_reset` against **stageResets** only.

Example:

```ts
expect(isIceSlideObjectiveComplete('no_falls', {
  crystalsCollected: 0,
  totalCrystals: 0,
  stageFalls: 0,
  stageResets: 4,
})).toBe(true)

expect(isIceSlideObjectiveComplete('no_reset', {
  crystalsCollected: 0,
  totalCrystals: 0,
  stageFalls: 3,
  stageResets: 0,
})).toBe(true)
```

These tests make the stage-vs-run distinction explicit.

### Step 2: Write failing scoring tests

- [ ] Preserve current Campaign defaults:

```ts
expect(levelScore({
  levelNumber: 2,
  parMoves: 4,
  movesUsed: 4,
  crystalsCollected: 1,
})).toBe(400 + 25 + 50)
expect(timeBonus(0)).toBe(1800)
expect(timeBonus(360)).toBe(0)
```

- [ ] Lock Daily config:

```ts
expect(levelScore({
  levelNumber: 2,
  parMoves: 4,
  movesUsed: 4,
  crystalsCollected: 1,
  optionalStarsEarned: 2,
}, DAILY_SCORING_CONFIG)).toBe(400 + 25 + 50 + 200)

expect(timeBonus(0, DAILY_SCORING_CONFIG)).toBe(1500)
expect(timeBonus(299, DAILY_SCORING_CONFIG)).toBe(5)
expect(timeBonus(300, DAILY_SCORING_CONFIG)).toBe(0)
expect(timeBonus(301, DAILY_SCORING_CONFIG)).toBe(0)
```

### Step 3: Prove red

- [ ] Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/scoring.test.ts
```

Expected: FAIL on missing helpers/config.

### Step 4: Implement pure objective rules

- [ ] `objectives.ts` contains no game state/DOM/Pixi imports.
- [ ] Implement:

```ts
case 'collect_all_crystals':
  return facts.totalCrystals > 0 &&
    facts.crystalsCollected === facts.totalCrystals
case 'no_falls':
  return facts.stageFalls === 0
case 'no_reset':
  return facts.stageResets === 0
```

- [ ] Add concise labels: `Collect all crystals`, `No falls`, `No resets`.

### Step 5: Extend scoring once, not per mode

- [ ] Add `objectiveStarBonus: 0` to existing `SCORING_CONFIG`.
- [ ] Add:

```ts
export interface IceSlideModeScoringConfig {
  objectiveStarBonus: number
  timeBudgetSeconds: number
  timeBonusPerSec: number
}

export const DAILY_SCORING_CONFIG: IceSlideModeScoringConfig = {
  objectiveStarBonus: 100,
  timeBudgetSeconds: 300,
  timeBonusPerSec: 5,
}
```

- [ ] Keep `levelClearPoints()`, `moveBonus()`, and `crystalBonus()` unchanged.
- [ ] Change `timeBonus(elapsedSeconds, config = SCORING_CONFIG)` to use the supplied time fields.
- [ ] Add optional `optionalStarsEarned?: number` and config argument to `levelScore()`, adding only:

```ts
(params.optionalStarsEarned ?? 0) * config.objectiveStarBonus
```

Existing Campaign call sites remain valid without changes.

### Step 6: Extend local types

- [ ] Add playable-mode, clear-result, and active-stage state fields.
- [ ] `getState()` will later copy `objectiveIds`; do not introduce a generic cross-game result type.

### Step 7: Verify Task 2

- [ ] Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS.

### Step 8: Commit

- [ ] Commit:

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/objectives.ts \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/scoring.ts \
  src/lib/games/ice-slide/scoring.test.ts
git commit -m "feat(ice-slide): add daily objectives and score config"
```

---

## Task 3: Make run/stage counters live and emit Daily stage results

**Files:**
- Modify: `src/lib/games/ice-slide/test-fixtures.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.hazard.test.ts`
- Update other Ice Slide tests only where the `onLevelClear` payload type requires it.

### Step 1: Add a valid five-stage Daily test fixture

- [ ] Add:

```ts
export function createTestDailyRun(
  stages: IceSlideStageDefinition[] = fiveSimpleStages(),
  dateKey = '2026-08-12'
): IceSlideRunDefinition
```

Use `ICE_SLIDE_DAILY_GENERATOR_VERSION`, `ICE_SLIDE_RULESET_VERSION`, correct Daily key/seed, and real stage signatures. Do not hand-copy version numbers.

### Step 2: Write counter red tests

- [ ] Manual Reset:

```ts
expect(after.resets).toBe(before.resets + 1)
expect(after.levelResets).toBe(1)
expect(after.levelFalls).toBe(0)
expect(after.levelMoves).toBe(0)
```

- [ ] Hazard:

```ts
expect(after.falls).toBe(before.falls + 1)
expect(after.resets).toBe(before.resets + 1)
expect(after.levelFalls).toBe(1)
expect(after.levelResets).toBe(1)
expect(after.levelMoves).toBe(1)
```

- [ ] Normal stage advance resets `levelFalls` / `levelResets` while cumulative fields remain.

### Step 3: Write the cross-stage objective regression

- [ ] Use a two-stage/five-stage Daily fixture where stage 1 contains a hazard and stage 2 has `no_falls`.
- [ ] Enter the stage-1 hazard, then clear stage 1, then clear stage 2 cleanly.
- [ ] Assert stage-2 bonus is earned despite cumulative `state.falls > 0`.
- [ ] Add the analogous manual-reset case for `no_reset` if the fixture is cheap; at minimum one test must prove previous-stage mistakes do not poison later stage facts.

### Step 4: Write Daily stage-result/scoring tests

- [ ] Exact-par + clean bonus => Clear/Efficient/bonus earned, `earnedCount = 3`.
- [ ] Over-par => Efficient false.
- [ ] Reset this stage => `no_reset` false.
- [ ] Hazard this stage => `no_falls` false.
- [ ] Collect-all true/false based on source-stage crystal count.
- [ ] Cumulative `state.starsEarned` equals Daily earned counts.
- [ ] `scoreGained` matches `levelScore(..., DAILY_SCORING_CONFIG)`.

### Step 5: Write completion/callback-order tests

- [ ] Complete a five-stage Daily fixture under fake timers and verify final completion bonus uses:

```ts
timeBonus(elapsedSeconds, DAILY_SCORING_CONFIG)
```

- [ ] Lock final callback order:

```ts
expect(events).toEqual(['level-clear', 'win'])
```

- [ ] Campaign still gets `starsEarned === 0`, existing scoring, and existing final callback order.

### Step 6: Prove red

- [ ] Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

Expected: FAIL on counters/results/config use.

### Step 7: Implement active-stage state

- [ ] Idle fields:

```ts
parMoves: 0,
objectiveIds: [],
levelFalls: 0,
levelResets: 0,
```

- [ ] Loaded stage:

```ts
parMoves: stage.parMoves,
objectiveIds: [...stage.objectiveIds],
```

- [ ] `getState()` copies `objectiveIds`.
- [ ] Add one `preserveLevelAttemptStats` reload option. Reset/hazard same-stage reloads use it; normal stage advance does not.
- [ ] Keep existing independent `preserveLevelMoves`: manual Reset resets moves; hazard preserves the hazard move.

### Step 8: Increment counters exactly once

- [ ] Manual Reset increments cumulative/stage reset counters before reload.
- [ ] Hazard increments cumulative/stage fall and reset counters before reload.
- [ ] Do not derive counter changes from callbacks/renderer state.

### Step 9: Build one clear-result object

- [ ] Reuse existing physics helpers for source crystal count:

```ts
const totalCrystals = countCrystals(parseGrid(stage))
```

- [ ] Compute Efficient exactly once:

```ts
const efficient = this.state.levelMoves <= stage.parMoves
```

Use the same boolean for existing `perfectLevels` and Daily Efficient star.

- [ ] For Daily, evaluate the single bonus objective using:

```ts
{
  crystalsCollected: this.state.levelCrystalsCollected,
  totalCrystals,
  stageFalls: this.state.levelFalls,
  stageResets: this.state.levelResets,
}
```

- [ ] `optionalStarsEarned = Number(efficient) + Number(bonusEarned)`.
- [ ] Campaign calls default `levelScore()` and never accumulates Daily stars.
- [ ] Daily calls `levelScore({... optionalStarsEarned}, DAILY_SCORING_CONFIG)` and accumulates all three earned stars including Clear.
- [ ] Final Daily time bonus uses `timeBonus(..., DAILY_SCORING_CONFIG)`; Campaign uses default.
- [ ] Preserve non-final immediate load and final callback order.

### Step 10: Verify Task 3

- [ ] Run:

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS.

### Step 11: Commit

- [ ] Stage exact changed files; inspect staged names before committing:

```bash
git diff --cached --name-only
git commit -m "feat(ice-slide): track daily stage results"
```

---

## Task 4: Integrate Daily lifecycle, HUD, End, and score response handling

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/lib/services/scoreService.ts`
- Modify: `src/lib/services/scoreService.test.ts`

**Produces:**

```ts
export interface IceSlideHandle {
  start: (mode?: IceSlidePlayableMode) => Promise<void>
  playAgain: () => Promise<void>
  stop: () => void
  resetLevel: () => void
  cleanup: () => void
  getGame: () => IceSlideGame | null
}
```

### Step 1: Extend JSDOM fixture

- [ ] Add the IDs `init.ts` will own:

```text
#daily-meta
#daily-date
#daily-reset
#daily-stage-progress
#daily-objective-clear
#daily-objective-efficient
#daily-objective-bonus
#stage-clear-overlay
#stage-clear-title
#stage-clear-score
#stage-clear-clear
#stage-clear-efficient
#stage-clear-bonus
#stage-clear-continue-btn
#daily-final-stage-result
#daily-final-clear
#daily-final-efficient
#daily-final-bonus
```

No auth-client mock is needed.

### Step 2: Write fresh/retry/rollover red tests

- [ ] Use fake time:

```ts
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-08-12T23:59:59Z'))
await handle.start('daily')
const runKey = handle.getGame()!.getState().runKey
const signatures = handle.getGame()!.getState().stageSignatures

vi.setSystemTime(new Date('2026-08-13T00:00:01Z'))
await handle.playAgain()
expect(handle.getGame()!.getState().runKey).toBe(runKey)
expect(handle.getGame()!.getState().stageSignatures).toEqual(signatures)

await handle.start('daily')
expect(handle.getGame()!.getState().runKey).toContain('2026-08-13')
```

- [ ] `start()` with no mode remains Campaign.

### Step 3: Write HUD red tests

- [ ] Daily Start immediately shows `#daily-meta` and sets:
  - exact captured `#daily-date`;
  - reset copy for next UTC day;
  - `Stage 1 / 5`;
  - Efficient copy containing current `parMoves`;
  - non-empty seeded bonus label.
- [ ] Campaign Start hides `#daily-meta`.
- [ ] After non-final Continue, HUD reflects the next stage before another accepted move.

### Step 4: Write non-final overlay/input-gate tests

- [ ] Clear a non-final Daily stage and assert stage overlay visible/populated.
- [ ] Keyboard move while overlay visible does nothing.
- [ ] Pointer/swipe while overlay visible does nothing.
- [ ] Reset while overlay visible does nothing.
- [ ] Continue hides overlay and unlocks movement.
- [ ] Cleanup/fail/start clears stale overlay/lock.

### Step 5: Write Daily End tests

- [ ] Immediately after a fresh zero-score Daily Start, `handle.stop()`:
  - stops the game;
  - shows `RUN ENDED` result overlay with score 0;
  - restores Start/End controls;
  - does **not** call `saveGameScore()`.
- [ ] End while a non-final stage-clear overlay is open clears that overlay and shows `RUN ENDED`, still without submission.
- [ ] Stored Daily retry identity survives End.
- [ ] Campaign partial stop retains current positive-score submission semantics and remains unscoped.

### Step 6: Write final-result/submission red tests

- [ ] Complete a Daily run and assert:
  - mid-run stage-clear overlay is not left visible for the final stage;
  - final result overlay appears immediately from `onWin`;
  - final Daily star rows are populated;
  - `saveGameScore()` is called exactly once without requiring a Continue click;
  - options contain exact Daily context.

```ts
expect(options.context).toEqual({
  mode: 'daily',
  competitionKey: gameData.runKey,
  rulesetVersion: gameData.rulesetVersion,
})
```

### Step 7: Add structured unauthenticated score result tests

- [ ] In `scoreService.test.ts`, mock a 401 response and assert:

```ts
expect(await submitScore(scoreData)).toMatchObject({
  success: false,
  code: 'UNAUTHENTICATED',
  error: 'You must be logged in to save scores',
})
```

- [ ] Add a `saveGameScore()` test proving the structured result is forwarded as the second error-callback argument.
- [ ] Existing one-argument error callbacks remain valid and existing `SCORE_CONTEXT_UNAVAILABLE` behavior remains covered.

### Step 8: Prove Task 4 red

- [ ] Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: FAIL on old lifecycle/error-channel behavior.

### Step 9: Extend `scoreService` additively

- [ ] Change:

```ts
export type ScoreSubmissionPublicErrorCode =
  | 'SCORE_CONTEXT_UNAVAILABLE'
  | 'UNAUTHENTICATED'
```

- [ ] For `response.status === 401`, return `code: 'UNAUTHENTICATED'` regardless of body.
- [ ] Change the optional callback type to:

```ts
onError?: (error: string, result?: ScoreSubmissionResult) => void
```

- [ ] For a completed unsuccessful response call:

```ts
onError?.(result.error || 'Failed to save score', result)
```

- [ ] Network/exception path still calls only the message; existing callers need no edits.

### Step 10: Refactor `init.ts` startup around materialized runs

- [ ] Add one internal `startRun(run?: IceSlideRunDefinition)` containing current teardown/game/renderer start logic.
- [ ] Fresh Daily captures key, materializes run, stores defensive retry copy/key, then starts it.
- [ ] Play Again starts cloned stored Daily or default Campaign.
- [ ] Clear non-final overlay/lock at every start.

### Step 11: Extend `syncHud()`

- [ ] Preserve existing common HUD writes.
- [ ] Campaign hides `#daily-meta`.
- [ ] Daily shows/fills date/reset/stage/Clear/Efficient/bonus using captured date key, `state.parMoves`, and `ICE_SLIDE_OBJECTIVE_LABELS`.
- [ ] Call after initial start, existing move/render paths, and Continue.

### Step 12: Add one shared interaction predicate

- [ ] Use:

```ts
const canAcceptMove = () =>
  !!game && game.getState().status === 'playing' && !inputLocked
```

Keyboard and swipe both call it; Reset also respects `inputLocked`.

### Step 13: Handle non-final vs final clear separately

- [ ] In Daily `onLevelClear(result)`:
  - always forward external callback;
  - if current state is `playing`, show/lock non-final stage overlay;
  - if current state is `won`, populate the hidden Daily final-stage result block and do **not** show the mid-run overlay.
- [ ] Campaign never shows Daily stage/result rows.

### Step 14: Keep final `onWin` immediate

- [ ] Daily final `onWin` follows the existing result path immediately:
  - external `callbacks.onWin`;
  - reset buttons;
  - `MISSION COMPLETE` overlay;
  - mode-aware score submission;
  - HUD sync.
- [ ] No `pendingDailyWinScore`, final Continue, or inert-End state.

### Step 15: Make submission mode-aware without auth preflight

- [ ] Campaign keeps the existing unscoped helper call.
- [ ] Daily completed run passes game data + exact contextual options.
- [ ] Daily error callback:

```ts
(error, result) => {
  if (result?.code === 'UNAUTHENTICATED') {
    return
  }
  callbacks.onError?.('Score not saved', error)
}
```

- [ ] Keep existing `isStale` run-guard option; do not add `authClient.getSession()` or a second staleness check.

### Step 16: Make `stop()` mode-aware

- [ ] Daily playing run: clear non-final overlay/lock, stop, reset buttons, show local `RUN ENDED` even at score 0, never submit.
- [ ] Campaign behavior remains current: positive-score playing stop submits and shows result; zero-score stop does not invent new Campaign behavior.

### Step 17: Verify Task 4

- [ ] Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS.

### Step 18: Commit

- [ ] Commit:

```bash
git add \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/services/scoreService.ts \
  src/lib/services/scoreService.test.ts
git commit -m "feat(ice-slide): integrate daily run lifecycle"
```

---

## Task 5: Add compact Daily page UX and stable markup contracts

**Files:**
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

### Step 1: Add failing stable markup assertions

- [ ] Load Ice Slide source once and assert only durable element contracts:

```ts
expect(iceSlideMarkup).toContain('id="ice-slide-mode-selector"')
expect(iceSlideMarkup).toContain('value="campaign"')
expect(iceSlideMarkup).toContain('value="daily"')
expect(iceSlideMarkup).not.toContain('value="expedition"')
expect(iceSlideMarkup).toContain('id="daily-meta"')
expect(iceSlideMarkup).toContain('id="daily-date"')
expect(iceSlideMarkup).toContain('id="daily-reset"')
expect(iceSlideMarkup).toContain('id="daily-stage-progress"')
expect(iceSlideMarkup).toContain('id="stage-clear-overlay"')
expect(iceSlideMarkup).toContain('id="stage-clear-continue-btn"')
expect(iceSlideMarkup).toContain('id="daily-final-stage-result"')
expect(iceSlideMarkup).toContain('id="change-mode-btn"')
```

Do **not** assert source-code text such as `gameHandle?.playAgain()` or exact explanatory copy. Playwright owns behavior; copy is not a contract.

### Step 2: Prove red

- [ ] Run:

```bash
bun run test:run -- src/pages/game-board-markup.test.ts
```

Expected: FAIL on missing Daily markup.

### Step 3: Add the page-local mode selector

- [ ] Add a semantic fieldset/radios above the game board:

```html
<fieldset id="ice-slide-mode-selector">
  <legend>Mode</legend>
  <label>
    <input type="radio" name="ice-slide-mode" value="campaign" checked />
    Campaign
  </label>
  <label>
    <input type="radio" name="ice-slide-mode" value="daily" />
    Daily
  </label>
</fieldset>
```

Use existing Tailwind/Cetus classes. Do not override GamePage's controls slot or create a shared mode component.

### Step 4: Add Daily HUD and non-final overlay markup

- [ ] Add hidden `#daily-meta` with the exact Task 4 IDs.
- [ ] Add opaque page-local `#stage-clear-overlay` with completed-stage title/score/star rows and a real Continue button.
- [ ] `init.ts` populates dynamic values; page script does not duplicate objective policy.

### Step 5: Reuse `final-stats` for final Daily stars + Change Mode

- [ ] Add hidden `#daily-final-stage-result` with Clear/Efficient/bonus rows.
- [ ] Add secondary `#change-mode-btn`.
- [ ] Do not modify shared `GameOverlay`/`GamePage` APIs.

### Step 6: Wire query preselection and Start

- [ ] Parse once:

```ts
const requestedMode = new URLSearchParams(window.location.search).get('mode')
const selectedMode: IceSlidePlayableMode =
  requestedMode === 'daily' ? 'daily' : 'campaign'
```

- [ ] Select the corresponding radio; no auto-start.
- [ ] Start reads checked mode and calls `gameHandle.start(mode)`.
- [ ] Disable mode controls while active.

### Step 7: Wire Play Again and Change Mode

- [ ] Play Again hides current result overlay and calls `gameHandle.playAgain()`.
- [ ] Change Mode:
  - hides result overlay;
  - shows pre-run status prompt;
  - restores Start visible / End hidden;
  - re-enables mode radios;
  - does not call `start()` or `playAgain()`.

### Step 8: Keep page End simple

- [ ] Existing End click still delegates to `gameHandle.stop()`; Daily-specific zero-score/result logic remains in `init.ts`.

### Step 9: Add concise Daily instructions

- [ ] Explain five UTC stages, Clear/Efficient/seeded bonus stars, +100 optional-star bonus, 5:00 completion budget, and Play Again retry identity.
- [ ] Do not add leaderboard UI/copy before HPA-488.

### Step 10: Verify Task 5

- [ ] Run:

```bash
bun run test:run -- \
  src/pages/game-board-markup.test.ts \
  src/lib/games/ice-slide/init.test.ts
```

Expected: PASS.

### Step 11: Commit

- [ ] Commit:

```bash
git add src/pages/ice-slide/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(ice-slide): add daily mode interface"
```

---

## Task 6: Lock real page retry behavior and run full verification

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify only tests required by final coverage/behavior; do not add production code for coverage convenience.

### Step 1: Preserve Campaign smoke

- [ ] Keep `/ice-slide` as Campaign default.
- [ ] Assert Campaign radio selected before Start.
- [ ] Preserve the existing `ArrowDown` First Frost flow to level 2 and positive score.
- [ ] End still shows Campaign result as today.

### Step 2: Add Daily query/HUD smoke

- [ ] Add:

```ts
test('preselects Daily and exposes objectives before the first move', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-12T20:00:00Z'))
  await page.goto('/ice-slide?mode=daily')

  await expect(page.locator('input[value="daily"]')).toBeChecked()
  await startGameWhenReady(page)
  await expect(page.locator('#daily-meta')).toBeVisible()
  await expect(page.locator('#daily-date')).toHaveText('2026-08-12')
  await expect(page.locator('#daily-stage-progress')).toHaveText(/1\s*\/\s*5/)
  await expect(page.locator('#daily-objective-clear')).toContainText('Clear')
  await expect(page.locator('#daily-objective-efficient')).toContainText('Efficient')
  await expect(page.locator('#daily-objective-bonus')).not.toHaveText('')
})
```

### Step 3: Add actual Play Again rollover + Change Mode path

Because Daily End always shows local results even at zero score, no transform-specific move is needed:

```ts
test('Play Again preserves Daily identity across rollover and Change Mode stays idle', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-12T23:59:59Z'))
  await page.goto('/ice-slide?mode=daily')
  await startGameWhenReady(page)
  await expect(page.locator('#daily-date')).toHaveText('2026-08-12')

  await page.locator('#end-btn').click()
  await expect(page.locator('#game-over-overlay')).not.toHaveClass(/hidden/)

  await page.clock.setFixedTime(new Date('2026-08-13T00:00:01Z'))
  await page.locator('#play-again-btn').click()
  await expect(page.locator('#daily-date')).toHaveText('2026-08-12')
  await expect(page.locator('#end-btn')).toBeVisible()

  await page.locator('#end-btn').click()
  await page.locator('#change-mode-btn').click()

  await expect(page.locator('#ice-slide-mode-selector input')).toBeEnabled()
  await expect(page.locator('#start-btn')).toBeVisible()
  await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
  await expect(page.locator('#game-status')).toBeVisible()
})
```

This is authoritative for the page glue; static markup tests do not assert the implementation expression used to call Play Again.

### Step 4: Add malformed/unavailable mode fallback

- [ ] Visit `/ice-slide?mode=expedition` and `/ice-slide?mode=not-a-mode`.
- [ ] Assert Campaign radio selected, Start visible, status prompt visible, and no auto-start.

### Step 5: Run focused E2E

- [ ] Run:

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: PASS.

### Step 6: Run complete Ice Slide/markup unit suites

- [ ] Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide \
  src/pages/game-board-markup.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS.

### Step 7: Run repository verification

- [ ] Run in order:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test:run
bun run test:coverage
bun run build
```

Expected:

- format: PASS;
- lint: no new errors;
- typecheck: no branch-introduced diagnostics;
- unit tests: PASS;
- coverage report generated successfully and PR satisfies the existing `codecov.yml` **95% project / 95% patch** status targets;
- build: PASS.

If typecheck output contains a diagnostic already present byte-for-byte on `main`, document the baseline rather than widening HPA-487. Any diagnostic in a touched file must be fixed.

### Step 8: Final scope diff

- [ ] Run:

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

- [ ] Confirm no DB/leaderboard server paths, HPA-488 admission logic, shared GamePage/GameOverlay APIs, Expedition/templates, snow/cracked ice, or platform Daily Challenge rotation changed.

### Step 9: Acceptance self-review

- [ ] Check each item explicitly:
  - golden 2026-08-12 output;
  - 365-date sweep;
  - pool/template/canonical uniqueness;
  - production quality/solver verification;
  - source-content generator-version rule;
  - stage-scoped fall/reset objective facts;
  - Campaign default scoring vs Daily config;
  - non-final Continue/input gate;
  - final stars in result overlay + immediate submit;
  - zero-score Daily End local overlay/no submit;
  - structured unauthenticated silence;
  - fresh vs retry UTC identity through actual page buttons;
  - HUD before each stage's first accepted move;
  - Campaign compatibility;
  - HPA-488/Expedition scope exclusion.

### Step 10: Commit E2E changes

- [ ] Commit:

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(ice-slide): cover daily challenge flows"
```

---

## Plan Self-Review

### Spec coverage

- Task 1: deterministic identity, shared UTC day validation, source metadata, golden contract, full-year validity, solver/quality verification.
- Task 2: stage-scoped objective facts and one configurable scoring shape.
- Task 3: live counters, star results, cross-stage isolation, callback order.
- Task 4: retry identity, HUD, non-final gating, zero-score Daily End, immediate final submission, anonymous structured result.
- Task 5: page-local selector/HUD/final stats/Change Mode and real Play Again wiring.
- Task 6: browser rollover proof, regressions, existing Codecov gate, full verification.

### YAGNI check

No generator framework, fallback engine, auth preflight, final pending-win state, final Continue state, mode registry, UTC countdown scheduler, shared overlay abstraction, or per-mode duplicate score function is planned.

### Deterministic contract check

A change to eligible Campaign level identity/name/rows/par, difficulty mapping, pools, fork labels, transform/objective selection, or other materialized output under the same date requires a generator-version decision. The golden test is a tripwire.

### Type/contract consistency

- `IceSlidePlayableMode` remains narrower than run-level `IceSlideMode`.
- Objective facts use `stageFalls`/`stageResets`; cumulative state stays `falls`/`resets`.
- `onLevelClear` has one result-object shape.
- Default `levelScore()` / `timeBonus()` keep Campaign behavior; Daily passes `DAILY_SCORING_CONFIG`.
- `saveGameScore` retains existing callers while optionally forwarding structured failure as a second callback argument.
- HPA-488 remains the sole owner of server admission/ranked presentation.
