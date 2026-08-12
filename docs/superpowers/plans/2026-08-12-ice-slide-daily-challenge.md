# Ice Slide Daily Challenge MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-487 by adding a deterministic five-stage Ice Slide Daily mode with seeded objectives/stars, Daily scoring, mode/retry UX, and completed-run contextual submission while preserving Campaign behavior.

**Architecture:** Materialize a complete Daily `IceSlideRunDefinition` from an explicit UTC date before gameplay starts. Keep generation, objectives, and scoring pure; extend `IceSlideGame` only with active-stage attempt facts and Daily score/star application; keep clock capture, exact retry identity, overlays, input gating, and submission ownership in `init.ts`/the page.

**Tech Stack:** Astro 5, TypeScript 6, PixiJS 8, Vitest 3, Playwright, Better Auth client, existing Cetus seeded RNG/run/solver/quality infrastructure.

## Global Constraints

- Campaign remains the default mode and keeps existing scoring, achievements, unscoped submissions, and partial-End submission behavior.
- Daily is the only additional selectable mode; do not expose Expedition.
- Daily run identity is UTC-based and versioned exactly as specified by the parent replayability design.
- `IceSlideGame` must not read the clock or make random choices.
- Daily generation must not use `Math.random()` or `crypto.getRandomValues()`.
- `Play Again` retries the exact previously materialized Daily run; a fresh Daily Start captures the current UTC date.
- Daily has exactly five stages, unique source templates, unique final canonical boards, and one feasible seeded bonus objective per stage.
- Daily partial End never submits. Only a fully completed Daily run may attempt contextual submission.
- HPA-488 owns server-side Daily semantic admission and leaderboard UI/query work; do not implement it here.
- No mutation templates, Expedition, snow, cracked ice, abilities, new persistence layer, mode registry, generic generator framework, or shared overlay abstraction.
- Stage-clear feedback uses an explicit Continue button; no auto-dismiss timer or forced reduced-motion delay.
- New/changed code must satisfy the repository's current lint, format, test, build, and 95% coverage gates.

---

## File Structure

### New files

- `src/lib/games/ice-slide/daily.ts` — UTC-keyed deterministic Daily run materialization.
- `src/lib/games/ice-slide/daily.test.ts` — Daily identity, selection, transforms, quality, determinism tests.
- `src/lib/games/ice-slide/objectives.ts` — pure objective completion rules and labels.
- `src/lib/games/ice-slide/objectives.test.ts` — objective-rule tests.
- `src/lib/games/ice-slide/scoring.test.ts` — Campaign regression plus Daily scoring tests.

### Existing files to modify

- `src/lib/games/ice-slide/types.ts` — active-stage facts, stage-clear payload, playable-mode type.
- `src/lib/games/ice-slide/run.ts` — export the existing Campaign difficulty mapping for Daily reuse.
- `src/lib/games/ice-slide/scoring.ts` — additive Daily score functions; Campaign functions unchanged.
- `src/lib/games/ice-slide/test-fixtures.ts` — valid Daily test-run helper.
- `src/lib/games/ice-slide/game.ts` — reset/fall counters, Daily stars/scoring, richer clear callback.
- `src/lib/games/ice-slide/game.test.ts` — Daily runtime/star/scoring tests and callback migration.
- `src/lib/games/ice-slide/game.hazard.test.ts` — exact hazard counter regression.
- `src/lib/games/ice-slide/init.ts` — mode-specific fresh/retry lifecycle, input gate, stage-result UI, scoped Daily submission.
- `src/lib/games/ice-slide/init.test.ts` — lifecycle/rollover/submission/overlay/anonymous tests.
- `src/pages/ice-slide/index.astro` — selector, Daily HUD, stage-clear markup, Change Mode flow.
- `src/pages/game-board-markup.test.ts` — Ice Slide markup contract.
- `e2e/games/play-coverage.spec.ts` — preserve Campaign smoke and add focused Daily/query smoke.

---

### Task 1: Materialize deterministic five-stage Daily runs

**Files:**
- Create: `src/lib/games/ice-slide/daily.ts`
- Create: `src/lib/games/ice-slide/daily.test.ts`
- Modify: `src/lib/games/ice-slide/run.ts`

**Interfaces:**
- Consumes: `ICE_SLIDE_LEVELS`, `ICE_SLIDE_RULESET_VERSION`, `createIceSlideStageSignature()`, `assertValidIceSlideRunDefinition()`, `createSeededRng()`, `getUniqueBoardTransforms()`, `validateIceSlideStageQuality()`.
- Produces:

```ts
export const ICE_SLIDE_DAILY_GENERATOR_VERSION = 1
export const ICE_SLIDE_DAILY_SOLVER_MAX_STATES = 10_000
export const ICE_SLIDE_DAILY_STAGE_POOLS: readonly (readonly number[])[]

export function toIceSlideUtcDateKey(date: Date): string
export function createIceSlideDailyRunDefinition(
  dateKey: string
): IceSlideRunDefinition
```

- Also export the already-existing Campaign level difficulty mapping from `run.ts` as:

```ts
export const CAMPAIGN_STAGE_DIFFICULTIES: readonly IceSlideDifficulty[]
```

- [ ] **Step 1: Write failing deterministic-run tests**

Create `daily.test.ts` with tests that lock identity and invariants without hard-coding random internal call counts:

```ts
import { describe, expect, it } from 'vitest'
import { serializeBoardRows } from './transforms'
import { assertValidIceSlideRunDefinition } from './run'
import {
  createIceSlideDailyRunDefinition,
  toIceSlideUtcDateKey,
} from './daily'

describe('Ice Slide Daily materialization', () => {
  it('formats UTC date keys and rejects invalid dates', () => {
    expect(toIceSlideUtcDateKey(new Date('2026-08-12T23:59:59Z'))).toBe(
      '2026-08-12'
    )
    expect(() => toIceSlideUtcDateKey(new Date(Number.NaN))).toThrow(RangeError)
  })

  it('builds the exact versioned Daily identity', () => {
    const run = createIceSlideDailyRunDefinition('2026-08-12')
    expect(run).toMatchObject({
      schemaVersion: 1,
      generatorVersion: 1,
      rulesetVersion: 1,
      mode: 'daily',
      seed: 'ice-slide:daily:1:1:2026-08-12',
      runKey: 'ice-slide:daily:2026-08-12:g1:r1',
    })
    expect(run.stages).toHaveLength(5)
    expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
  })

  it('is byte-equivalent for the same date and versions', () => {
    const first = createIceSlideDailyRunDefinition('2026-08-12')
    const second = createIceSlideDailyRunDefinition('2026-08-12')
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('never repeats a source template or final canonical board', () => {
    const run = createIceSlideDailyRunDefinition('2026-08-12')
    expect(new Set(run.stages.map(stage => stage.templateId)).size).toBe(5)
    expect(
      new Set(run.stages.map(stage => serializeBoardRows(stage.rows))).size
    ).toBe(5)
  })

  it('assigns exactly one feasible bonus objective and recomputed par', () => {
    const run = createIceSlideDailyRunDefinition('2026-08-12')
    for (const stage of run.stages) {
      expect(stage.objectiveIds).toHaveLength(1)
      expect(stage.scoreMultiplierBps).toBe(10_000)
      expect(stage.mutationIds).toEqual([])
      expect(stage.parMoves).toBeGreaterThan(0)
    }
  })

  it('varies deterministically across representative dates', () => {
    const signatures = ['2026-08-12', '2026-08-13', '2026-09-01'].map(date =>
      createIceSlideDailyRunDefinition(date).stages.map(stage => stage.signature)
    )
    expect(new Set(signatures.map(value => value.join(','))).size).toBeGreaterThan(1)
  })
})
```

Add a table test proving each stage's template ID is inside its exact required pool and all five source template IDs are unique.

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/daily.test.ts
```

Expected: FAIL because `daily.ts`/exports do not exist yet.

- [ ] **Step 3: Export Campaign difficulty metadata instead of duplicating it**

In `run.ts`, rename the private constant and reuse the exported name inside `createCampaignRunDefinition()`:

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

Keep the existing length assertion and Campaign stage output unchanged.

- [ ] **Step 4: Implement the minimal pure Daily materializer**

Use the exact pools:

```ts
export const ICE_SLIDE_DAILY_STAGE_POOLS = [
  [1, 2],
  [2, 3],
  [3, 4, 5],
  [5, 6, 7],
  [7, 8],
] as const
```

Implement strict date parsing by requiring `YYYY-MM-DD`, constructing UTC midnight, and round-tripping year/month/day. Do not rely on permissive `Date.parse()` alone.

The stage loop must use these exact labeled streams:

```ts
const stageRng = rootRng.fork(`stage:${stageNumber}`)
const templateOrder = stageRng.fork('template').shuffle(pool)
const variantOrder = stageRng
  .fork(`transform:${source.id}`)
  .shuffle(getUniqueBoardTransforms(source.rows))
```

For each candidate variant, validate it with:

```ts
const quality = validateIceSlideStageQuality(
  { id: `daily:${dateKey}:${stageNumber}`, rows: variant.rows, objectiveIds: [] },
  {
    parBand: { minMoves: source.parMoves, maxMoves: source.parMoves },
    maxStates: ICE_SLIDE_DAILY_SOLVER_MAX_STATES,
    existingCanonicalKeys: usedCanonicalKeys,
  }
)
```

On the first accepted candidate:

```ts
const eligibleObjectives = DAILY_BONUS_OBJECTIVE_ORDER.filter(
  objectiveId => quality.objectiveFeasibility[objectiveId]
)
const bonusObjective = stageRng.fork('objective').pick(eligibleObjectives)
```

Create the final stage, compute its signature, add template/canonical identities to their used sets, and break. Throw a descriptive `Error` if the finite authored candidate set produces no accepted candidate.

Finish by validating the full run with `assertValidIceSlideRunDefinition(run)` before returning it.

- [ ] **Step 5: Run Daily + prerequisite deterministic tests**

Run:

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

- [ ] **Step 6: Commit**

```bash
git add \
  src/lib/games/ice-slide/daily.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/run.ts
git commit -m "feat(ice-slide): materialize deterministic daily runs"
```

---

### Task 2: Add pure objective/star rules and Daily scoring

**Files:**
- Create: `src/lib/games/ice-slide/objectives.ts`
- Create: `src/lib/games/ice-slide/objectives.test.ts`
- Create: `src/lib/games/ice-slide/scoring.test.ts`
- Modify: `src/lib/games/ice-slide/scoring.ts`
- Modify: `src/lib/games/ice-slide/types.ts`

**Interfaces:**
- Produces:

```ts
export type IceSlidePlayableMode = 'campaign' | 'daily'

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

- Add active-stage state fields:

```ts
parMoves: number
objectiveIds: IceSlideObjectiveId[]
levelFalls: number
levelResets: number
```

- Change `IceSlideCallbacks.onLevelClear` to `(result: IceSlideStageClearResult) => void`.
- Produces scoring helpers:

```ts
export function dailyStageScore(params: {
  stageNumber: number
  parMoves: number
  movesUsed: number
  crystalsCollected: number
  optionalStarsEarned: number
}): number

export function dailyTimeBonus(elapsedSeconds: number): number
```

- [ ] **Step 1: Write failing objective tests**

Cover every rule directly:

```ts
it('requires all crystals for collect_all_crystals', () => {
  expect(isIceSlideObjectiveComplete('collect_all_crystals', {
    parMoves: 4,
    movesUsed: 4,
    crystalsCollected: 2,
    totalCrystals: 2,
    falls: 0,
    resets: 0,
  })).toBe(true)

  expect(isIceSlideObjectiveComplete('collect_all_crystals', {
    parMoves: 4,
    movesUsed: 4,
    crystalsCollected: 1,
    totalCrystals: 2,
    falls: 0,
    resets: 0,
  })).toBe(false)
})

it('requires no falls for no_falls', () => {
  expect(base({ falls: 0 }, 'no_falls')).toBe(true)
  expect(base({ falls: 1 }, 'no_falls')).toBe(false)
})

it('requires no manual or hazard reset for no_reset', () => {
  expect(base({ resets: 0 }, 'no_reset')).toBe(true)
  expect(base({ resets: 1 }, 'no_reset')).toBe(false)
})
```

Also assert `collect_all_crystals` is false when `totalCrystals === 0`; the generator should not assign it in that case, but runtime policy remains explicit.

- [ ] **Step 2: Write failing Daily scoring tests**

Lock exact boundaries:

```ts
expect(dailyStageScore({
  stageNumber: 2,
  parMoves: 4,
  movesUsed: 4,
  crystalsCollected: 1,
  optionalStarsEarned: 2,
})).toBe(400 + 25 + 50 + 200)

expect(dailyTimeBonus(0)).toBe(1500)
expect(dailyTimeBonus(299)).toBe(5)
expect(dailyTimeBonus(300)).toBe(0)
expect(dailyTimeBonus(301)).toBe(0)
```

Copy the current Campaign expectations into this test file for `levelScore()`/`timeBonus()` so additive Daily work cannot silently alter the 360-second Campaign contract.

- [ ] **Step 3: Run tests to verify failure**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/scoring.test.ts
```

Expected: FAIL because the new interfaces/functions do not exist.

- [ ] **Step 4: Implement objective rules and labels**

Keep `objectives.ts` free of DOM/Pixi/game state. Implement with a switch over the existing objective union:

```ts
case 'collect_all_crystals':
  return facts.totalCrystals > 0 &&
    facts.crystalsCollected === facts.totalCrystals
case 'no_falls':
  return facts.falls === 0
case 'no_reset':
  return facts.resets === 0
```

Use concise display labels such as `Collect all crystals`, `No falls`, and `No resets` from the exported record instead of duplicating copy in `init.ts`/Astro.

- [ ] **Step 5: Add Daily scoring without changing Campaign functions**

Add:

```ts
export const DAILY_SCORING_CONFIG = {
  objectiveStarBonus: 100,
  timeBudgetSeconds: 300,
  timeBonusPerSec: 5,
} as const
```

Validate `optionalStarsEarned` as a simple numeric input from game policy and compute:

```ts
return (
  levelClearPoints(params.stageNumber) +
  moveBonus(params.parMoves, params.movesUsed) +
  crystalBonus(params.crystalsCollected) +
  params.optionalStarsEarned * DAILY_SCORING_CONFIG.objectiveStarBonus
)
```

`dailyTimeBonus()` mirrors the existing `timeBonus()` shape with the 300-second budget.

- [ ] **Step 6: Extend local Ice Slide types**

Add the four active-stage fields and clear-result/playable-mode types. Change only Ice Slide's local callback payload. Do not modify shared platform game types or introduce a generic stage-result abstraction.

- [ ] **Step 7: Run tests and type-focused suite**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/objectives.ts \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/scoring.ts \
  src/lib/games/ice-slide/scoring.test.ts
git commit -m "feat(ice-slide): add daily objectives and scoring"
```

---

### Task 3: Track stage attempts and apply Daily stars/scoring in `IceSlideGame`

**Files:**
- Modify: `src/lib/games/ice-slide/test-fixtures.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.hazard.test.ts`
- Update any Ice Slide tests that compile against the old numeric `onLevelClear` callback.

**Interfaces:**
- Consumes: `dailyStageScore()`, `dailyTimeBonus()`, `isIceSlideObjectiveComplete()`, `IceSlideStageClearResult`.
- Produces: exact run/stage counters and clear-result payload for `init.ts`.

- [ ] **Step 1: Add a valid Daily test-run fixture**

In `test-fixtures.ts`, add a helper that derives valid key/seed/version metadata from `dateKey` and calls `createIceSlideStageSignature()` for every override stage. Default it to five one-move stages so Daily completion tests remain short.

```ts
export function createTestDailyRun(
  stages: IceSlideStageDefinition[] = fiveSimpleStages(),
  dateKey = '2026-08-12'
): IceSlideRunDefinition
```

Use `ICE_SLIDE_DAILY_GENERATOR_VERSION` and `ICE_SLIDE_RULESET_VERSION`; do not hand-copy version numbers.

- [ ] **Step 2: Write failing counter tests**

Add tests proving:

```ts
// manual Reset
expect(after.resets).toBe(before.resets + 1)
expect(after.levelResets).toBe(1)
expect(after.levelFalls).toBe(0)
expect(after.levelMoves).toBe(0)

// hazard entry
expect(after.falls).toBe(before.falls + 1)
expect(after.resets).toBe(before.resets + 1)
expect(after.levelFalls).toBe(1)
expect(after.levelResets).toBe(1)
expect(after.levelMoves).toBe(1)
```

Then clear/advance a test stage and assert `levelFalls`/`levelResets` reset to zero on the next stage while cumulative `falls`/`resets` remain.

- [ ] **Step 3: Write failing Daily clear-result/star tests**

Use small explicit Daily stages to exercise each outcome:

- exact-par + no reset => Clear/Efficient/bonus all earned, `earnedCount === 3`;
- over-par => Efficient false;
- manual reset before clear => `no_reset` false;
- hazard before a later clear => `no_falls` false;
- collect all vs not all crystals;
- cumulative `state.starsEarned` equals the sum of Daily stage results.

Assert the callback payload shape, including `scoreGained`, rather than reading private state.

- [ ] **Step 4: Write failing Daily completion-bonus and Campaign regression tests**

With fake timers, complete a five-stage Daily test run and verify the final score adds `dailyTimeBonus(elapsedSeconds)`. Separately retain existing Campaign assertions and add:

```ts
expect(game.getState().starsEarned).toBe(0)
```

for Campaign clears.

- [ ] **Step 5: Run focused tests to verify failure**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

Expected: FAIL on missing counters/result behavior.

- [ ] **Step 6: Populate active-stage metadata in `createIdleState()`/`loadLevel()`**

Idle values:

```ts
parMoves: 0,
objectiveIds: [],
levelFalls: 0,
levelResets: 0,
```

Loaded values come from the materialized stage:

```ts
parMoves: stage.parMoves,
objectiveIds: [...stage.objectiveIds],
```

`getState()` must clone `objectiveIds`.

Add one `preserveLevelAttemptStats` load option. Manual Reset and hazard reload pass it; normal stage advance does not. Keep the current independent `preserveLevelMoves` behavior so manual Reset still clears `levelMoves` while hazard keeps the hazard move.

- [ ] **Step 7: Increment reset/fall counters exactly once at their event sites**

Before same-stage reload:

```ts
// manual Reset
this.state.resets += 1
this.state.levelResets += 1

// hazard
this.state.falls += 1
this.state.resets += 1
this.state.levelFalls += 1
this.state.levelResets += 1
```

Do not derive these values from callbacks or renderer events.

- [ ] **Step 8: Build one clear-result object inside `clearLevel()`**

Count `C` glyphs from `stage.rows` at clear time. For Daily, evaluate exactly one bonus objective and Efficient, then derive:

```ts
const optionalStarsEarned = Number(efficient) + Number(bonusEarned)
const earnedCount = 1 + optionalStarsEarned
```

Use `dailyStageScore()` only when `this.state.mode === 'daily'`; otherwise use the existing `levelScore()` path. Add cumulative stars only for Daily.

Fire `onLevelClear(result)` with the completed stage's facts before the next-stage interaction can occur.

For the final stage, use `dailyTimeBonus()` only for Daily; keep `timeBonus()` for Campaign/non-Daily explicit runs.

- [ ] **Step 9: Run all Ice Slide unit tests**

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add \
  src/lib/games/ice-slide/test-fixtures.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game*.test.ts \
  src/lib/games/ice-slide/*.test.ts
git commit -m "feat(ice-slide): track daily stage results"
```

Before committing, inspect `git diff --cached --name-only` and unstage any test file not actually changed by this task; do not use the glob to sweep unrelated edits.

---

### Task 4: Add fresh-vs-retry Daily lifecycle, input gating, and scoped completed submission

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`

**Interfaces:**
- Consumes: `createIceSlideDailyRunDefinition()`, `toIceSlideUtcDateKey()`, `cloneIceSlideRunDefinition()`, `IceSlidePlayableMode`, `IceSlideStageClearResult`, `ICE_SLIDE_OBJECTIVE_LABELS`, `authClient.getSession()`, existing `saveGameScore()` context option.
- Produces:

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

- [ ] **Step 1: Extend the JSDOM fixture and auth mock**

Add the Daily/stage-clear element IDs that `init.ts` will own, including:

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
```

Mock `@/lib/auth-client` with `authClient.getSession = vi.fn()` and default it to an authenticated session for existing score tests.

- [ ] **Step 2: Write failing fresh/retry/rollover tests**

Use fake system time:

```ts
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-08-12T23:59:59Z'))
await handle.start('daily')
const firstKey = handle.getGame()!.getState().runKey
const firstSignatures = handle.getGame()!.getState().stageSignatures

vi.setSystemTime(new Date('2026-08-13T00:00:01Z'))
await handle.playAgain()
expect(handle.getGame()!.getState().runKey).toBe(firstKey)
expect(handle.getGame()!.getState().stageSignatures).toEqual(firstSignatures)

await handle.start('daily')
expect(handle.getGame()!.getState().runKey).toContain('2026-08-13')
```

Also assert `start()` without a mode still starts Campaign.

- [ ] **Step 3: Write failing submission-boundary tests**

Add tests for:

- Campaign partial stop still calls `saveGameScore()` with no context.
- Daily partial stop never calls it.
- completed Daily calls it exactly once with:

```ts
expect(options.context).toEqual({
  mode: 'daily',
  competitionKey: gameData.runKey,
  rulesetVersion: gameData.rulesetVersion,
})
```

- `authClient.getSession()` returning `{ data: null, error: null }` makes a completed Daily run local-only.
- a session-check error does not silently discard an otherwise completed run; the normal score path remains authoritative.

Use the production solver or the deterministic Daily run data to drive completion in the test helper; do not hard-code transform-dependent arrow sequences.

- [ ] **Step 4: Write failing stage-clear/input-gate tests**

Drive a Daily stage clear, then assert:

- stage-clear overlay is visible;
- objective/score text is populated from the clear result;
- a keyboard direction while the overlay is open does not change moves/stage;
- pointer/swipe direction is also ignored;
- Continue hides the overlay and allows input again;
- final-stage Continue transitions to the mission-complete overlay and only then triggers Daily submission.

Add cleanup/failure assertions that no stale overlay/lock remains.

- [ ] **Step 5: Run `init.test.ts` to verify failure**

```bash
bun run test:run -- src/lib/games/ice-slide/init.test.ts
```

Expected: FAIL on the old handle/submission/overlay behavior.

- [ ] **Step 6: Refactor start internals around a materialized run**

Create one private local `startRun(run?: IceSlideRunDefinition)` closure that contains the existing game/renderer teardown and startup sequence.

Fresh start:

```ts
start: async (mode = 'campaign') => {
  if (mode === 'daily') {
    const dateKey = toIceSlideUtcDateKey(new Date())
    const run = createIceSlideDailyRunDefinition(dateKey)
    lastStartedMode = 'daily'
    lastDailyRun = cloneIceSlideRunDefinition(run)
    await startRun(run)
    return
  }
  lastStartedMode = 'campaign'
  lastDailyRun = null
  await startRun()
}
```

Retry:

```ts
playAgain: async () => {
  if (lastStartedMode === 'daily' && lastDailyRun) {
    await startRun(cloneIceSlideRunDefinition(lastDailyRun))
    return
  }
  await startRun()
}
```

Clear overlays/input locks at the beginning of every start.

- [ ] **Step 7: Make score submission mode-aware and asynchronous**

Capture the run guard before any auth/session await. For Daily:

1. require `gameData.solved === true`;
2. call `authClient.getSession()`;
3. if the run became stale, return;
4. if no session and no auth error, return without calling `saveGameScore()`;
5. otherwise call existing `saveGameScore()` with game data and the exact Daily context.

For Campaign, preserve the existing unscoped helper call and partial-stop behavior.

Do not add server validation in this task.

- [ ] **Step 8: Add one shared input gate to keyboard and swipe paths**

Use one predicate such as:

```ts
const canAcceptMove = () =>
  !!game && game.getState().status === 'playing' && !inputLocked
```

Both input handlers call it. `resetLevel()` also no-ops while the stage-clear overlay is locking interaction.

- [ ] **Step 9: Implement stage-clear Continue behavior**

For Daily `onLevelClear(result)`, set the lock, populate/show the page-local overlay, and focus Continue. Campaign forwards the callback without showing the Daily stage overlay.

For a final Daily win, store `pendingDailyWinScore` instead of immediately replacing the stage overlay. Continue finalizes the shared result overlay, invokes external `onWin`, and starts the scoped submission.

- [ ] **Step 10: Run integration tests**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/games/ice-slide/init.ts src/lib/games/ice-slide/init.test.ts
git commit -m "feat(ice-slide): integrate daily run lifecycle"
```

---

### Task 5: Add the compact Daily page UX and markup contracts

**Files:**
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Consumes: `IceSlideHandle.start(mode)`, `IceSlideHandle.playAgain()`.
- Produces DOM IDs consumed by Task 4; page-level URL/mode selection and Change Mode behavior.

- [ ] **Step 1: Add failing markup-contract assertions**

Extend `game-board-markup.test.ts` to load Ice Slide markup once and assert the required surfaces:

```ts
expect(iceSlideMarkup).toContain('id="ice-slide-mode-selector"')
expect(iceSlideMarkup).toContain('value="campaign"')
expect(iceSlideMarkup).toContain('value="daily"')
expect(iceSlideMarkup).not.toContain('value="expedition"')
expect(iceSlideMarkup).toContain('id="daily-meta"')
expect(iceSlideMarkup).toContain('id="stage-clear-overlay"')
expect(iceSlideMarkup).toContain('id="stage-clear-continue-btn"')
expect(iceSlideMarkup).toContain('id="change-mode-btn"')
expect(iceSlideMarkup).toContain('Daily adds +100')
```

- [ ] **Step 2: Run the markup test and verify it fails**

```bash
bun run test:run -- src/pages/game-board-markup.test.ts
```

Expected: FAIL on missing Daily markup.

- [ ] **Step 3: Add a semantic two-option selector above the board**

Use a `fieldset`/radio pair rather than a custom mode component:

```html
<fieldset id="ice-slide-mode-selector">
  <legend>Mode</legend>
  <label><input type="radio" name="ice-slide-mode" value="campaign" checked /> Campaign</label>
  <label><input type="radio" name="ice-slide-mode" value="daily" /> Daily</label>
</fieldset>
```

Style locally with existing Tailwind/Cetus classes. Do not create a reusable selector component for one page.

- [ ] **Step 4: Add Daily metadata/objective and stage-clear markup**

The Daily HUD is hidden by default and contains the exact IDs from Task 4. Its copy includes UTC date/reset context without a countdown scheduler.

Add an absolutely positioned opaque stage-clear overlay inside the board wrapper, hidden by default, with text/symbol objective states and a real button for Continue.

- [ ] **Step 5: Add Change Mode to the existing final-stats slot**

Use the GamePage `final-stats` slot to render a small secondary `#change-mode-btn`. It only returns the page to pre-run state; do not alter the shared `GameOverlay` API.

- [ ] **Step 6: Wire URL selection and lifecycle**

At page init:

```ts
const requestedMode = new URLSearchParams(window.location.search).get('mode')
const selectedMode = requestedMode === 'daily' ? 'daily' : 'campaign'
```

Set the corresponding radio. Do not auto-start.

On Start, read the checked radio and call `gameHandle.start(mode)`.

On Play Again, call `gameHandle.playAgain()` rather than `start()`.

Disable mode radios while a run is active. Change Mode hides the result overlay, re-enables the selector, and leaves the game idle; the next Start is fresh and therefore may capture a new UTC date.

Update local callback signatures for `onLevelClear(result)`.

- [ ] **Step 7: Add concise Daily instructions/scoring copy**

Keep Campaign copy. Add only what a Daily player needs:

- one five-stage run per UTC day;
- three stars: Clear, Efficient, seeded bonus;
- +100 for Efficient/bonus star;
- 5:00 Daily completion budget;
- Play Again retries the same Daily.

Do not add leaderboard copy until HPA-488.

- [ ] **Step 8: Run page and Ice Slide integration tests**

```bash
bun run test:run -- \
  src/pages/game-board-markup.test.ts \
  src/lib/games/ice-slide/init.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/pages/ice-slide/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(ice-slide): add daily mode interface"
```

---

### Task 6: Lock E2E/regression behavior and run full verification

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify only tests required to satisfy the final coverage gate; do not add production code solely to make coverage easier.

**Interfaces:**
- Verifies all HPA-487 user-visible behavior; produces no new production API.

- [ ] **Step 1: Preserve the existing Campaign smoke test**

Keep `/ice-slide` as Campaign default. Extend the existing test only enough to assert the Campaign radio is selected before Start and that the existing first-level `ArrowDown` flow still reaches level 2.

- [ ] **Step 2: Add a Daily query/interaction smoke test**

Add a focused test:

```ts
test('preselects Daily, starts the UTC run, and can end locally', async ({ page }) => {
  await page.goto('/ice-slide?mode=daily')
  await expect(page.locator('input[value="daily"]')).toBeChecked()
  await startGameWhenReady(page)
  await expect(page.locator('#daily-meta')).toBeVisible()
  await expect(page.locator('#daily-stage-progress')).toHaveText(/1\s*\/\s*5/)
  await expect(page.locator('#daily-objective-clear')).toContainText('Clear')
  await page.locator('#end-btn').click()
  await expect(page.locator('#game-over-overlay')).not.toHaveClass(/hidden/)
})
```

The test does not depend on the first Daily transform's solution path.

- [ ] **Step 3: Add malformed/unavailable mode fallback coverage**

Navigate to `/ice-slide?mode=expedition` and `/ice-slide?mode=not-a-mode`; assert Campaign is selected and no run auto-starts.

- [ ] **Step 4: Run focused E2E**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: PASS.

- [ ] **Step 5: Run the complete Ice Slide unit suite**

```bash
bun run test:run -- src/lib/games/ice-slide src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run repository verification**

Run, in order:

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
- typecheck: no diagnostics introduced by this branch;
- test suite: PASS;
- coverage: satisfies the repository's current 95% Codecov gate;
- build: PASS.

If `typecheck` exposes a diagnostic already present byte-for-byte on `main`, document that baseline in the implementation PR rather than expanding HPA-487 into an unrelated fix. Any diagnostic in an HPA-487-touched file must be fixed before completion.

- [ ] **Step 7: Run a final scope diff**

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Verify there are no changes to database/leaderboard server paths, Expedition/template code, snow/cracked-ice work, shared GamePage/GameOverlay APIs, or platform Daily Challenge rotation.

- [ ] **Step 8: Self-review the implementation against HPA-487**

Check each acceptance condition explicitly:

- same date/version exact deterministic run;
- representative date variation;
- five unique templates/canonical boards;
- solver recomputed par/objective feasibility;
- reset/hazard star facts;
- Daily formula/300-second bonus;
- completed-only contextual submission;
- anonymous local result;
- Campaign compatibility;
- mode/query/retry/overlay/keyboard/swipe/reduced-motion/error cleanup.

Fix any gap before the final commit.

- [ ] **Step 9: Commit E2E/verification test changes**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(ice-slide): cover daily challenge flows"
```

---

## Plan Self-Review

### Spec coverage

- Deterministic Daily identity, tier pools, transforms, canonical uniqueness, solver par verification, and seeded objective selection: Task 1.
- Objective semantics and exact Daily score formula: Task 2.
- Falls/resets/stars/stage results and game-data counters: Task 3.
- UTC capture vs retry, completed-only submission, anonymous behavior, input/overlay lifecycle: Task 4.
- Compact selector, URL preselection, date/reset/stage/objective UI, Continue, Change Mode, copy: Task 5.
- Campaign regression, E2E, full gates, and final scope check: Task 6.

No HPA-487 acceptance criterion is intentionally deferred.

### Placeholder scan

No `TBD`, `TODO`, generic “add tests”, or unspecified error-handling step remains. Each task names exact files, interfaces, commands, and expected outcomes.

### Type/contract consistency

- `IceSlidePlayableMode` is exactly `'campaign' | 'daily'` at the browser boundary; `IceSlideMode` remains broader for future Expedition materialized runs.
- Daily generator version is defined once in `daily.ts` and reused by tests/fixtures.
- Existing ruleset/schema constants remain in `run.ts`.
- `onLevelClear` has one result-object signature everywhere after Task 2/3 migration.
- `IceSlideGameData` keeps the existing persisted metadata shape; new per-stage facts live only in state/callback results.
- HPA-488 remains the sole owner of server Daily semantic admission and ranked presentation.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-12-ice-slide-daily-challenge.md`.

Recommended execution is **subagent-driven development** with a fresh implementation/review gate for each of the six tasks above. Inline execution is also valid if the task sequence and commit boundaries are preserved.