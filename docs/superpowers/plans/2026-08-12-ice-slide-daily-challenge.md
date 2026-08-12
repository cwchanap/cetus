# Ice Slide Daily Challenge MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-487 with a deterministic five-stage Ice Slide Daily mode, frozen generator-v1 outputs, objective stars/scoring, exact retry/overlay lifecycle, Daily HUD, and completed-run contextual submission while preserving Campaign behavior.

**Architecture:** Materialize a complete `IceSlideRunDefinition` from an explicit UTC date before gameplay. Reuse the existing RNG, transforms, run contract, production solver, and quality validator. Keep objective/scoring policy pure; keep clock capture, exact retry identity, Daily HUD synchronization, stage-clear gating, and submission ownership in `init.ts`/the page. Do not create a second Daily engine or a generic generator framework.

**Tech Stack:** Astro 5, TypeScript 6, PixiJS 8, Vitest 3, Playwright 1.54, Better Auth client, existing Cetus deterministic Ice Slide infrastructure.

## Global Constraints

- Campaign remains default and keeps existing scoring, achievements, unscoped submissions, and partial-End submission behavior.
- Daily is the only additional playable mode; `IceSlidePlayableMode = 'campaign' | 'daily'` while the run-level `IceSlideMode` continues to include `expedition`.
- `IceSlideGame` never reads the clock or makes random choices.
- Daily generation never uses `Math.random()` or `crypto.getRandomValues()`.
- Generator-v1 fork labels, stage metadata, and the literal `2026-08-12` output are compatibility contracts. A same-date materialization change requires a generator-version bump.
- `Play Again` retries the exact materialized Daily run; a fresh Daily Start captures the current UTC date.
- Daily has exactly five stages, unique source templates, unique final canonical boards, recomputed solver pars, and one feasible seeded bonus objective per stage.
- Daily partial End never submits. Only final-stage Continue may initiate Daily submission.
- HPA-488 owns server-side Daily semantic admission and leaderboard UI/query work.
- The finite authored Daily search throws when no valid candidate exists; do not add mutation-style retry/fallback orchestration.
- No mutation templates, Expedition UI, snow, cracked ice, abilities, persistence service, mode registry, generic generator framework, shared overlay framework, UTC countdown scheduler, or game-engine pause state.
- Stage-clear feedback uses explicit Continue; no auto-dismiss timer or forced reduced-motion delay.
- New/changed code must satisfy current format, lint, typecheck, unit/E2E, build, and 95% coverage gates.

---

## File Structure

### New files

- `src/lib/games/ice-slide/daily.ts` — shared UTC date conversion plus deterministic Daily materialization.
- `src/lib/games/ice-slide/daily.test.ts` — date validation, generator golden vector, year sweep, pools/transforms/quality/determinism.
- `src/lib/games/ice-slide/objectives.ts` — pure objective completion and labels.
- `src/lib/games/ice-slide/objectives.test.ts` — objective rules.
- `src/lib/games/ice-slide/scoring.test.ts` — Campaign regression plus Daily scoring.

### Existing files to modify

- `src/lib/games/ice-slide/types.ts` — active-stage facts, stage-clear payload, playable-mode type.
- `src/lib/games/ice-slide/run.ts` — extract one UTC date-key validator and export Campaign difficulty mapping.
- `src/lib/games/ice-slide/scoring.ts` — additive Daily score functions only.
- `src/lib/games/ice-slide/test-fixtures.ts` — valid Daily test run helper.
- `src/lib/games/ice-slide/game.ts` — reset/fall counters, Daily stars/scoring, richer clear callback while preserving callback order.
- `src/lib/games/ice-slide/game.test.ts` / `game.hazard.test.ts` — runtime/callback/counter regressions.
- `src/lib/games/ice-slide/init.ts` — fresh/retry lifecycle, Daily HUD, input/result gate, overlay-End semantics, scoped completed submission.
- `src/lib/games/ice-slide/init.test.ts` — rollover, HUD, overlay/End, anonymous/submission, cleanup tests.
- `src/pages/ice-slide/index.astro` — selector, Daily HUD markup, stage-clear markup, Play Again/Change Mode wiring.
- `src/pages/game-board-markup.test.ts` — Ice Slide page contract.
- `e2e/games/play-coverage.spec.ts` — Campaign smoke plus Daily query/retry/Change Mode flow.

---

## Task 1: Freeze and materialize deterministic five-stage Daily runs

**Files:**
- Create: `src/lib/games/ice-slide/daily.ts`
- Create: `src/lib/games/ice-slide/daily.test.ts`
- Modify: `src/lib/games/ice-slide/run.ts`

**Interfaces:**

```ts
// run.ts
export function assertValidIceSlideUtcDateKey(dateKey: string): void
export const CAMPAIGN_STAGE_DIFFICULTIES: readonly IceSlideDifficulty[]

// daily.ts
export const ICE_SLIDE_DAILY_GENERATOR_VERSION = 1
export const ICE_SLIDE_DAILY_SOLVER_MAX_STATES = 10_000
export const ICE_SLIDE_DAILY_STAGE_POOLS: readonly (readonly number[])[]
export function toIceSlideUtcDateKey(date: Date): string
export function createIceSlideDailyRunDefinition(
  dateKey: string
): IceSlideRunDefinition
```

### Frozen generator-v1 contract

For a selected source level, materialize exactly:

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

Pool IDs are resolved with `ICE_SLIDE_LEVELS.findIndex(level => level.id === levelId)`; never index by `levelId - 1`.

The exact RNG labels are:

```ts
const stageRng = rootRng.fork(`stage:${stageNumber}`)
const templateOrder = stageRng.fork('template').shuffle(pool)
const variantOrder = stageRng
  .fork(`transform:${source.id}`)
  .shuffle(getUniqueBoardTransforms(source.rows))
const bonusObjective = stageRng.fork('objective').pick(eligibleObjectives)
```

Eligible-objective ordering is exactly:

```ts
[
  'collect_all_crystals',
  'no_falls',
  'no_reset',
]
```

- [ ] **Step 1: Write failing date-contract and generator tests**

Create `daily.test.ts`. Start with the single shared calendar contract:

```ts
import { describe, expect, it } from 'vitest'
import {
  assertValidIceSlideRunDefinition,
  assertValidIceSlideUtcDateKey,
} from './run'
import {
  createIceSlideDailyRunDefinition,
  toIceSlideUtcDateKey,
} from './daily'

describe('Ice Slide UTC date keys', () => {
  it.each(['2026-01-01', '2026-02-28', '2028-02-29'])(
    'accepts %s',
    dateKey => expect(() => assertValidIceSlideUtcDateKey(dateKey)).not.toThrow()
  )

  it.each([
    '2026-2-01',
    '2026-02-30',
    '2026-13-01',
    'not-a-date',
  ])('rejects %s', dateKey => {
    expect(() => assertValidIceSlideUtcDateKey(dateKey)).toThrow(RangeError)
  })

  it('converts Date with the same shared validator', () => {
    expect(toIceSlideUtcDateKey(new Date('2026-08-12T23:59:59Z'))).toBe(
      '2026-08-12'
    )
    expect(() => toIceSlideUtcDateKey(new Date(Number.NaN))).toThrow(RangeError)
  })
})
```

Then lock identity:

```ts
it('builds the exact Daily identity', () => {
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
```

Lock the complete generator-v1 stage projection:

```ts
it('locks the generator-v1 2026-08-12 stage tuples', () => {
  const run = createIceSlideDailyRunDefinition('2026-08-12')
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
})
```

Add invariant tests:

- same date serializes byte-equivalently;
- every stage source ID belongs to its exact pool;
- five template IDs are unique;
- five `serializeBoardRows(stage.rows)` values are unique;
- every stage has one objective, no mutations, multiplier `10_000`;
- every stage par equals `solveIceSlideBoard(stage, { maxStates: 10_000 }).minMoves`;
- assigned objective is feasible under `validateIceSlideStageQuality()`.

Add the bounded v1 content sweep:

```ts
it('materializes every UTC date in calendar year 2026', () => {
  const start = Date.UTC(2026, 0, 1)
  for (let offset = 0; offset < 365; offset++) {
    const dateKey = toIceSlideUtcDateKey(
      new Date(start + offset * 24 * 60 * 60 * 1000)
    )
    expect(() => createIceSlideDailyRunDefinition(dateKey)).not.toThrow()
  }
})
```

Keep representative-date variation as a separate assertion; the year sweep is a no-throw content gate, not a requirement that every date be unique.

- [ ] **Step 2: Run the new suite to prove red**

```bash
bun run test:run -- src/lib/games/ice-slide/daily.test.ts
```

Expected: FAIL because the new exports/materializer do not exist.

- [ ] **Step 3: Extract the shared date validator and Campaign difficulty mapping**

In `run.ts`:

1. export the current Campaign difficulty array as `CAMPAIGN_STAGE_DIFFICULTIES` and keep Campaign output unchanged;
2. move the existing Daily run-key date round-trip into `assertValidIceSlideUtcDateKey(dateKey)`;
3. have the Daily branch of `assertValidIceSlideRunDefinition()` call that helper instead of keeping private duplicate calendar logic.

The helper performs exact regex plus calendar round-trip. Do not add a second parser in `daily.ts`.

- [ ] **Step 4: Implement `toIceSlideUtcDateKey()` and strict Daily input validation**

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

`createIceSlideDailyRunDefinition(dateKey)` begins with `assertValidIceSlideUtcDateKey(dateKey)`.

- [ ] **Step 5: Implement the exact Daily materializer**

Use:

```ts
export const ICE_SLIDE_DAILY_STAGE_POOLS = [
  [1, 2],
  [2, 3],
  [3, 4, 5],
  [5, 6, 7],
  [7, 8],
] as const
```

For each stage:

1. shuffle the pool with the frozen `stage:N` / `template` forks;
2. resolve source via `.findIndex(level => level.id === levelId)` and throw if missing;
3. skip a source whose `campaign:<id>` template ID is already used;
4. shuffle `getUniqueBoardTransforms(source.rows)` with `transform:${source.id}`;
5. validate candidates with empty objectives, exact source-par band, solver cap, and prior canonical keys;
6. select the first accepted candidate;
7. filter feasible objectives using the frozen order and pick using the `objective` fork;
8. materialize the frozen stage fields, compute signature, and record template/canonical identity.

Throw a descriptive error if the finite set has no valid candidate. Do not add a fallback table or a 64-attempt loop.

Validate the complete run before returning.

- [ ] **Step 6: Run deterministic prerequisites and Daily tests**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/run.test.ts \
  src/lib/games/ice-slide/transforms.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/shared/seeded-rng.test.ts
```

Expected: PASS including the literal golden vector and full 2026 sweep.

- [ ] **Step 7: Commit**

```bash
git add \
  src/lib/games/ice-slide/daily.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/run.ts
git commit -m "feat(ice-slide): materialize deterministic daily runs"
```

---

## Task 2: Add pure objective/star rules and Daily scoring

**Files:**
- Create: `src/lib/games/ice-slide/objectives.ts`
- Create: `src/lib/games/ice-slide/objectives.test.ts`
- Create: `src/lib/games/ice-slide/scoring.test.ts`
- Modify: `src/lib/games/ice-slide/scoring.ts`
- Modify: `src/lib/games/ice-slide/types.ts`

**Interfaces:**

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

Add active-stage state fields:

```ts
parMoves: number
objectiveIds: IceSlideObjectiveId[]
levelFalls: number
levelResets: number
```

Change local `IceSlideCallbacks.onLevelClear` to `(result: IceSlideStageClearResult) => void`.

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

- [ ] **Step 1: Write failing objective tests**

Cover:

```ts
expect(complete('collect_all_crystals', { totalCrystals: 2, crystalsCollected: 2 })).toBe(true)
expect(complete('collect_all_crystals', { totalCrystals: 2, crystalsCollected: 1 })).toBe(false)
expect(complete('collect_all_crystals', { totalCrystals: 0, crystalsCollected: 0 })).toBe(false)
expect(complete('no_falls', { falls: 0 })).toBe(true)
expect(complete('no_falls', { falls: 1 })).toBe(false)
expect(complete('no_reset', { resets: 0 })).toBe(true)
expect(complete('no_reset', { resets: 1 })).toBe(false)
```

The helper used by these examples fills the remaining fact fields with valid zero/default values; do not special-case tests inside production code.

- [ ] **Step 2: Write failing scoring tests**

```ts
expect(dailyStageScore({
  stageNumber: 2,
  parMoves: 4,
  movesUsed: 4,
  crystalsCollected: 1,
  optionalStarsEarned: 2,
})).toBe(675)

expect(dailyTimeBonus(0)).toBe(1500)
expect(dailyTimeBonus(299)).toBe(5)
expect(dailyTimeBonus(300)).toBe(0)
expect(dailyTimeBonus(301)).toBe(0)
```

Also copy the current Campaign expectations for `levelScore()` and `timeBonus()` into `scoring.test.ts`, including the 360-second Campaign budget.

- [ ] **Step 3: Run tests to prove red**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/scoring.test.ts
```

Expected: FAIL because the new modules/functions do not exist.

- [ ] **Step 4: Implement pure objective rules and labels**

`objectives.ts` stays free of DOM, Pixi, timers, and game state. The completion switch is:

```ts
case 'collect_all_crystals':
  return facts.totalCrystals > 0 &&
    facts.crystalsCollected === facts.totalCrystals
case 'no_falls':
  return facts.falls === 0
case 'no_reset':
  return facts.resets === 0
```

Export labels once:

```ts
export const ICE_SLIDE_OBJECTIVE_LABELS = {
  collect_all_crystals: 'Collect all crystals',
  no_falls: 'No falls',
  no_reset: 'No resets',
} as const satisfies Record<IceSlideObjectiveId, string>
```

- [ ] **Step 5: Add Daily scoring additively**

Do not modify existing Campaign constants/functions. `dailyStageScore()` reuses `levelClearPoints()`, `moveBonus()`, and `crystalBonus()` and adds `optionalStarsEarned * 100`. `dailyTimeBonus()` mirrors Campaign time-bonus shape with a 300-second budget.

- [ ] **Step 6: Extend local Ice Slide types only**

Add the active-stage fields, `IceSlidePlayableMode`, and `IceSlideStageClearResult`. `IceSlideMode` remains `'campaign' | 'daily' | 'expedition'` for the materialized-run contract.

- [ ] **Step 7: Run objective/scoring/Daily suites**

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

## Task 3: Track attempts and apply Daily stars/scoring in `IceSlideGame`

**Files:**
- Modify: `src/lib/games/ice-slide/test-fixtures.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.hazard.test.ts`
- Update only other Ice Slide tests that compile against the changed `onLevelClear` payload.

**Consumes:** `dailyStageScore()`, `dailyTimeBonus()`, `isIceSlideObjectiveComplete()`, `IceSlideStageClearResult`.

- [ ] **Step 1: Add a valid Daily test-run fixture**

Add:

```ts
export function createTestDailyRun(
  stages: IceSlideStageDefinition[] = fiveSimpleStages(),
  dateKey = '2026-08-12'
): IceSlideRunDefinition
```

Use `ICE_SLIDE_DAILY_GENERATOR_VERSION`, `ICE_SLIDE_RULESET_VERSION`, valid Daily seed/key shape, and `createIceSlideStageSignature()`; do not hand-copy version numbers.

- [ ] **Step 2: Write failing manual/hazard counter tests**

Manual Reset:

```ts
expect(after.resets).toBe(before.resets + 1)
expect(after.levelResets).toBe(1)
expect(after.levelFalls).toBe(0)
expect(after.levelMoves).toBe(0)
```

Hazard:

```ts
expect(after.falls).toBe(before.falls + 1)
expect(after.resets).toBe(before.resets + 1)
expect(after.levelFalls).toBe(1)
expect(after.levelResets).toBe(1)
expect(after.levelMoves).toBe(1)
```

After a normal stage advance, assert per-stage counters reset to zero while cumulative counters remain.

- [ ] **Step 3: Write failing Daily clear-result/star tests**

Use explicit Daily stages to cover:

- exact-par + `no_reset` => Clear/Efficient/bonus all true, `earnedCount === 3`;
- over-par => Efficient false;
- manual Reset before clear => `no_reset` false;
- hazard before later clear => `no_falls` false;
- collect-all true/false;
- cumulative `state.starsEarned` equals Daily result earned counts.

Assert `scoreGained` from callback result rather than private state.

- [ ] **Step 4: Lock final callback order and completion bonus**

Add a regression test:

```ts
const events: string[] = []
const game = new IceSlideGame({
  onLevelClear: () => events.push('level-clear'),
  onWin: () => events.push('win'),
})
```

Complete the final stage and assert the final entries are:

```ts
expect(events.slice(-2)).toEqual(['level-clear', 'win'])
```

With fake timers, complete a five-stage Daily run and assert final score includes `dailyTimeBonus(elapsedSeconds)`. Preserve existing Campaign tests and assert Campaign `starsEarned === 0`.

- [ ] **Step 5: Run focused tests to prove red**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

Expected: FAIL on missing counter/result behavior.

- [ ] **Step 6: Populate active-stage metadata in idle/load paths**

Idle:

```ts
parMoves: 0,
objectiveIds: [],
levelFalls: 0,
levelResets: 0,
```

Loaded stage:

```ts
parMoves: stage.parMoves,
objectiveIds: [...stage.objectiveIds],
```

`getState()` clones `objectiveIds`.

Add `preserveLevelAttemptStats` to `loadLevel()` options. Manual Reset and hazard reload preserve these counters; normal advance resets them. Keep `preserveLevelMoves` independent so manual Reset clears level moves and hazard keeps its committed hazard move.

- [ ] **Step 7: Increment event counters exactly once**

Before manual reload:

```ts
this.state.resets += 1
this.state.levelResets += 1
```

Before hazard reload:

```ts
this.state.falls += 1
this.state.resets += 1
this.state.levelFalls += 1
this.state.levelResets += 1
```

Do not infer counters from callbacks/rendering.

- [ ] **Step 8: Build one completed-stage result in `clearLevel()`**

Count total `C` glyphs from the materialized stage rows. For Daily, calculate:

```ts
const efficient = this.state.levelMoves <= stage.parMoves
const bonusId = stage.objectiveIds[0]
const bonusEarned = isIceSlideObjectiveComplete(bonusId, facts)
const optionalStarsEarned = Number(efficient) + Number(bonusEarned)
const earnedCount = 1 + optionalStarsEarned
```

Use `dailyStageScore()` only for Daily, otherwise existing `levelScore()`. Increment cumulative `starsEarned` only for Daily.

Preserve current progression/callback order:

- non-final: prepare next stage, then `onLevelClear(result)`;
- final: apply mode-specific time bonus, set won/stop timer, then `onLevelClear(result)`, then `onWin(finalScore)`.

Do not add a paused-stage engine state.

- [ ] **Step 9: Run complete Ice Slide unit suite**

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS.

- [ ] **Step 10: Commit**

Stage explicit changed paths only after inspecting `git diff --name-only`:

```bash
git add \
  src/lib/games/ice-slide/test-fixtures.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
git commit -m "feat(ice-slide): track daily stage results"
```

If another Ice Slide test required the callback signature migration, add that exact path to the commit instead of globbing every test.

---

## Task 4: Integrate fresh/retry lifecycle, Daily HUD, overlay gating, and completed submission

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`

**Interfaces:**

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

Consumes `createIceSlideDailyRunDefinition()`, `toIceSlideUtcDateKey()`, `cloneIceSlideRunDefinition()`, `ICE_SLIDE_OBJECTIVE_LABELS`, Better Auth client, and existing contextual `saveGameScore()` options.

- [ ] **Step 1: Extend the JSDOM fixture and mocks**

Add exact IDs:

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

Retain `#start-btn`, `#end-btn`, shared result overlay IDs, and score/HUD IDs.

Mock `@/lib/auth-client` with `authClient.getSession = vi.fn()` and default existing score tests to an authenticated session.

Reuse/adapt the existing test-only BFS path helper from `init.test.ts` so it accepts a materialized `{ id, rows }` stage. Do not add a production path-returning solver API solely for tests.

- [ ] **Step 2: Write failing fresh/retry/UTC rollover tests**

```ts
vi.useFakeTimers()
vi.setSystemTime(new Date('2026-08-12T23:59:59Z'))
await handle.start('daily')
const first = handle.getGame()!.getState()

vi.setSystemTime(new Date('2026-08-13T00:00:01Z'))
await handle.playAgain()
const retry = handle.getGame()!.getState()
expect(retry.runKey).toBe(first.runKey)
expect(retry.stageSignatures).toEqual(first.stageSignatures)

await handle.start('daily')
expect(handle.getGame()!.getState().runKey).toContain('2026-08-13')
```

Also assert `start()` without mode starts Campaign.

- [ ] **Step 3: Write failing Daily HUD tests**

With fixed time `2026-08-12T23:59:59Z`, after fresh Daily Start assert:

```ts
expect(document.querySelector('#daily-meta')).not.toHaveClass('hidden')
expect(document.querySelector('#daily-date')).toHaveTextContent('2026-08-12')
expect(document.querySelector('#daily-reset')).toHaveTextContent('00:00 UTC')
expect(document.querySelector('#daily-reset')).toHaveTextContent('2026-08-13')
expect(document.querySelector('#daily-stage-progress')).toHaveTextContent('Stage 1 / 5')
expect(document.querySelector('#daily-objective-clear')).toHaveTextContent('Clear')
expect(document.querySelector('#daily-objective-efficient')).toHaveTextContent('≤')
expect(document.querySelector('#daily-objective-bonus')?.textContent).not.toBe('')
```

Start Campaign and assert `#daily-meta` is hidden.

Clear the first Daily stage with the test-only path helper, click Continue, and assert stage progress becomes `Stage 2 / 5` and Efficient/bonus text is re-derived from the new `getState()` before further movement.

- [ ] **Step 4: Write failing submission-boundary tests**

Cover:

- Campaign partial stop still calls `saveGameScore()` unscoped.
- Daily partial stop never calls it.
- Completed Daily calls it exactly once only after final Continue with:

```ts
expect(options.context).toEqual({
  mode: 'daily',
  competitionKey: gameData.runKey,
  rulesetVersion: gameData.rulesetVersion,
})
```

- confirmed anonymous `{ data: null, error: null }` completion stays local;
- auth-check error does not silently discard the completed result; the score endpoint path remains authoritative.

Capture the run guard before the auth await and test stale completion suppression.

- [ ] **Step 5: Write failing overlay/input/End lifecycle tests**

For a non-final Daily clear:

- stage overlay visible;
- result text populated;
- keyboard and swipe do not move while locked;
- Reset no-ops while locked;
- Continue hides overlay, re-syncs HUD, and permits movement;
- calling `handle.stop()` while that non-final overlay is open hides it, stops locally, shows `RUN ENDED`, and never saves a Daily score.

For the final Daily clear:

- `onLevelClear` overlay remains visible after the engine's immediately following `onWin` callback;
- mission-complete overlay is still hidden;
- `saveGameScore()` has not run;
- End control is hidden/disabled while final Continue is pending;
- programmatic `handle.stop()` is a no-op and leaves final stage overlay visible;
- final Continue hides stage overlay, shows mission-complete, invokes external `onWin`, and initiates submission exactly once.

Add fail/start/cleanup cases proving locks, overlays, and `pendingDailyWinScore` cannot leak into a newer run.

- [ ] **Step 6: Run `init.test.ts` to prove red**

```bash
bun run test:run -- src/lib/games/ice-slide/init.test.ts
```

Expected: FAIL on old handle/HUD/submission/overlay behavior.

- [ ] **Step 7: Refactor startup around one `startRun()` closure**

Keep the existing teardown/game construction/renderer sequence in one local helper.

Fresh start:

```ts
start: async (mode = 'campaign') => {
  if (mode === 'daily') {
    const dateKey = toIceSlideUtcDateKey(new Date())
    const run = createIceSlideDailyRunDefinition(dateKey)
    lastStartedMode = 'daily'
    lastDailyDateKey = dateKey
    lastDailyRun = cloneIceSlideRunDefinition(run)
    await startRun(run)
    return
  }

  lastStartedMode = 'campaign'
  lastDailyDateKey = null
  lastDailyRun = null
  await startRun()
}
```

Retry:

```ts
playAgain: async () => {
  if (lastStartedMode === 'daily' && lastDailyRun && lastDailyDateKey) {
    await startRun(cloneIceSlideRunDefinition(lastDailyRun))
    return
  }
  await startRun()
}
```

`startRun()` clears input locks, stage overlay, pending win, and stale result state before starting.

- [ ] **Step 8: Extend `syncHud()` with mode-specific Daily synchronization**

Keep current generic score/level/moves/crystals/time/name updates.

Then:

```ts
if (state.mode !== 'daily' || !lastDailyDateKey) {
  dailyMeta?.classList.add('hidden')
  return
}

dailyMeta?.classList.remove('hidden')
setText('daily-date', lastDailyDateKey)
setText('daily-stage-progress', `Stage ${state.levelIndex + 1} / ${state.stagesTotal}`)
setText('daily-objective-clear', 'Clear — reach the goal')
setText('daily-objective-efficient', `Efficient — ≤ ${state.parMoves} moves`)
setText(
  'daily-objective-bonus',
  state.objectiveIds[0]
    ? ICE_SLIDE_OBJECTIVE_LABELS[state.objectiveIds[0]]
    : 'Bonus objective unavailable'
)
```

Derive the next UTC date from the already validated captured key and format `#daily-reset` as `Resets at 00:00 UTC · Next: YYYY-MM-DD`. Do not create a live countdown.

Call `syncHud()` during initial start, normal move paths, and again on Continue after the next stage was already loaded.

- [ ] **Step 9: Add one shared movement gate**

```ts
const canAcceptMove = () =>
  !!game && game.getState().status === 'playing' && !inputLocked
```

Keyboard and pointer/swipe both use it. `resetLevel()` no-ops while `inputLocked`.

- [ ] **Step 10: Preserve engine callback order but defer Daily final side effects**

Daily `onLevelClear(result)`:

- set lock;
- populate/show stage overlay;
- focus Continue;
- if game is already `won`, hide/disable End while final Continue is pending.

Daily `onWin(finalScore)`:

```ts
pendingDailyWinScore = finalScore
return
```

It does not show mission-complete, reset controls, invoke external `callbacks.onWin`, authenticate, or submit.

Final Continue performs those actions once. Campaign `onWin` keeps existing immediate behavior.

- [ ] **Step 11: Make `stop()` overlay-aware**

Before ordinary stop logic:

```ts
if (pendingDailyWinScore !== null) {
  return
}
```

When a non-final Daily stage overlay is active:

- hide it;
- clear lock/result state;
- stop the playing game;
- reset controls;
- show local `RUN ENDED` using current score;
- do not call Daily `submitScore()`.

Ordinary Campaign stop keeps its current positive-score partial submission behavior. Ordinary Daily stop never submits.

- [ ] **Step 12: Make Daily submission async/auth-aware**

Only final Continue calls the Daily submission helper. Require `gameData.solved === true`, capture run guard before `authClient.getSession()`, re-check staleness afterward, skip confirmed anonymous, and otherwise call existing `saveGameScore()` with exact contextual options.

Do not add HPA-488 server validation.

- [ ] **Step 13: Run integration tests**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/services/scoreService.test.ts
```

Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/lib/games/ice-slide/init.ts src/lib/games/ice-slide/init.test.ts
git commit -m "feat(ice-slide): integrate daily run lifecycle"
```

---

## Task 5: Add compact Daily page UX and freeze page glue

**Files:**
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Consumes:** `IceSlideHandle.start(mode)` and `IceSlideHandle.playAgain()`.

- [ ] **Step 1: Add failing markup/wiring assertions**

Load Ice Slide markup in `game-board-markup.test.ts` and assert:

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
expect(iceSlideMarkup).toContain('id="change-mode-btn"')
expect(iceSlideMarkup).toContain('gameHandle?.playAgain()')
expect(iceSlideMarkup).toContain('Daily adds +100')
```

The Playwright test in Task 6 is still authoritative for user behavior; this static check makes accidental reversion to `start()` obvious during page editing.

- [ ] **Step 2: Run markup test to prove red**

```bash
bun run test:run -- src/pages/game-board-markup.test.ts
```

Expected: FAIL on missing Daily markup/wiring.

- [ ] **Step 3: Add semantic two-option selector**

Use a page-local fieldset/radios:

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

Style with existing Tailwind/Cetus classes; do not create a reusable mode component.

- [ ] **Step 4: Add Daily HUD and stage-clear markup**

Add hidden `#daily-meta` with exact Task 4 IDs. Add an opaque page-local `#stage-clear-overlay` inside the board wrapper with result rows and a real Continue button.

Use text/symbol state in addition to color. `init.ts`, not page script, populates the live Daily values.

- [ ] **Step 5: Add Change Mode through existing `final-stats` slot**

Add a secondary `#change-mode-btn`. Do not modify shared `GameOverlay` or `GamePage` APIs.

- [ ] **Step 6: Wire URL preselection and fresh Start**

```ts
const requestedMode = new URLSearchParams(window.location.search).get('mode')
const selectedMode = requestedMode === 'daily' ? 'daily' : 'campaign'
```

Set the radio only; do not auto-start.

Start reads the checked radio and calls `gameHandle.start(mode)`. Disable mode radios while active.

- [ ] **Step 7: Wire Play Again to retry and Change Mode to idle**

Replace the current Play Again call to `start()` with:

```ts
playAgainBtn.addEventListener('click', async () => {
  overlay.classList.add('hidden')
  await gameHandle?.playAgain()
})
```

Change Mode:

- hides result overlay;
- shows pre-run status prompt;
- re-enables mode radios;
- restores Start visible / End hidden;
- does not call `start()` or `playAgain()`.

The next Start is fresh and can therefore capture a post-rollover Daily date.

- [ ] **Step 8: Keep End behavior compatible with Task 4**

The normal End click still calls `gameHandle.stop()`. Final-stage Continue hides/disables End through `init.ts`, preventing a user click while completion is pending. The page does not duplicate overlay-state logic.

- [ ] **Step 9: Add concise Daily instructions/scoring copy**

Add only:

- five stages shared per UTC date;
- Clear/Efficient/seeded bonus stars;
- +100 for Efficient/bonus star;
- 5:00 Daily completion budget;
- Play Again retries the same Daily run.

No leaderboard copy before HPA-488.

- [ ] **Step 10: Run page + init tests**

```bash
bun run test:run -- \
  src/pages/game-board-markup.test.ts \
  src/lib/games/ice-slide/init.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/pages/ice-slide/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(ice-slide): add daily mode interface"
```

---

## Task 6: Lock page-level rollover/retry behavior and run full verification

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify only tests needed for final coverage; do not add production code solely to make coverage easier.

- [ ] **Step 1: Preserve the Campaign smoke**

Keep `/ice-slide` as Campaign default. Assert Campaign radio selected, Start works, `ArrowDown` still clears First Frost to level 2, and End keeps current result behavior.

- [ ] **Step 2: Add Daily query/HUD smoke**

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

- [ ] **Step 3: Add the page-glue UTC rollover / Play Again / Change Mode path**

This test must catch the existing bug where page Play Again calls fresh `start()`:

```ts
test('Play Again preserves Daily identity across UTC rollover and Change Mode stays idle', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-12T23:59:59Z'))
  await page.goto('/ice-slide?mode=daily')
  await startGameWhenReady(page)
  await expect(page.locator('#daily-date')).toHaveText('2026-08-12')

  // Partial Daily End is local but keeps the retry snapshot.
  await page.locator('#end-btn').click()
  await expect(page.locator('#game-over-overlay')).not.toHaveClass(/hidden/)

  await page.clock.setFixedTime(new Date('2026-08-13T00:00:01Z'))
  await page.locator('#play-again-btn').click()
  await expect(page.locator('#daily-date')).toHaveText('2026-08-12')
  await expect(page.locator('#end-btn')).toBeVisible()

  await page.locator('#end-btn').click()
  await expect(page.locator('#game-over-overlay')).not.toHaveClass(/hidden/)
  await page.locator('#change-mode-btn').click()

  await expect(page.locator('#ice-slide-mode-selector input')).toBeEnabled()
  await expect(page.locator('#start-btn')).toBeVisible()
  await expect(page.locator('#end-btn')).toHaveCSS('display', 'none')
  await expect(page.locator('#game-status')).toBeVisible()
})
```

`page.clock.setFixedTime()` is called before navigation and changed after the first End so browser `new Date()` crosses UTC midnight without coupling the test to real wall time.

- [ ] **Step 4: Add malformed/unavailable mode fallback coverage**

Navigate to both `/ice-slide?mode=expedition` and `/ice-slide?mode=not-a-mode`. Assert Campaign selected, Start visible, and no run auto-started.

- [ ] **Step 5: Run focused Ice Slide E2E**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: PASS.

- [ ] **Step 6: Run complete Ice Slide/markup unit suites**

```bash
bun run test:run -- src/lib/games/ice-slide src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run repository verification**

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
- tests: PASS;
- coverage: current 95% gate satisfied;
- build: PASS.

If typecheck shows a byte-identical `main` baseline diagnostic outside touched scope, document it rather than expanding HPA-487. Any diagnostic in a touched file must be fixed.

- [ ] **Step 8: Verify final diff scope**

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Confirm no database/leaderboard-server paths, Expedition/template code, snow/cracked-ice work, shared GamePage/GameOverlay APIs, or platform Daily rotation changes.

- [ ] **Step 9: Self-review every HPA-487 contract**

Explicitly check:

- literal `2026-08-12` generator-v1 tuple;
- 2026 full-date no-throw sweep;
- same-date byte equivalence and representative variation;
- exact fork labels/source-by-ID/stage metadata;
- five unique templates/canonical boards;
- solver par/objective feasibility;
- manual/hazard star facts;
- Daily formula/300-second completion bonus;
- engine final callback order `level-clear` then `win`;
- non-final overlay End local/no-submit;
- final overlay End inert and final Continue is the only submission transition;
- HUD populated before each stage's first accepted move;
- handle-level rollover retry plus page-level Play Again rollover E2E;
- Change Mode idle/no-auto-start;
- completed-only contextual submission and anonymous local result;
- Campaign compatibility and HPA-488 boundary.

Fix any gap before the final commit.

- [ ] **Step 10: Commit E2E changes**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(ice-slide): cover daily challenge flows"
```

---

## Plan Self-Review

### Spec coverage

- **Task 1:** shared UTC calendar contract, exact RNG labels, source-by-ID mapping, frozen stage metadata, literal generator-v1 output, year sweep, solver/quality validation.
- **Task 2:** objective semantics and additive Daily scoring.
- **Task 3:** reset/fall counters, stars, score application, final engine callback order.
- **Task 4:** fresh/retry UTC identity, Daily HUD, overlay/End semantics, final-Continue submission, auth/stale handling, input parity.
- **Task 5:** selector/HUD/result markup, page `playAgain()` wiring, Change Mode, no shared overlay changes.
- **Task 6:** browser-level UTC rollover retry, Change Mode no-auto-start, malformed-mode fallback, full regression/coverage gates.

No HPA-487 acceptance criterion is intentionally deferred.

### Placeholder scan

No `TBD`, `TODO`, generic “add tests”, or unspecified lifecycle branch remains. Exact interfaces, fork labels, generator tuple, DOM IDs, test paths, commands, and expected outcomes are named.

### Type/contract consistency

- `IceSlidePlayableMode` is exactly `'campaign' | 'daily'`; `IceSlideMode` remains broader.
- UTC date calendar validation has one source in `run.ts`; `daily.ts` reuses it.
- Daily generator version is defined once in `daily.ts` and reused by fixtures/tests.
- Existing ruleset/schema constants remain in `run.ts`.
- `onLevelClear` has one result-object signature and engine callback order stays unchanged.
- Daily final browser/network side effects move to Continue without changing engine sequencing.
- `IceSlideGameData` keeps existing run/counter metadata; active-stage HUD facts remain state/callback data.
- HPA-488 remains the sole owner of server Daily admission and ranked presentation.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-08-12-ice-slide-daily-challenge.md`.

Recommended execution is **subagent-driven development**, one fresh implementation/review gate per task. Inline execution is also valid if the six task and commit boundaries are preserved.