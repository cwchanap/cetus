# Ice Slide Expedition Route Choices and Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Safe/Risky Expedition choices after stages 2 and 4 plus one-step charge-based Undo, while preserving Campaign/Daily behavior and the existing materialized-run architecture.

**Architecture:** Extend the existing Expedition stage generator only enough to guarantee two eligible objectives on Risk-target stages, then apply choices through one pure `expedition.ts` route-effect function. `IceSlideGame` owns pending-choice/charge state and a single private pre-move snapshot; `init.ts` and the Ice Slide page own only overlay/HUD wiring and input presentation.

**Tech Stack:** TypeScript, Astro, PixiJS, Vitest, Playwright, Bun.

## Global Constraints

- Choice checkpoints are exactly after Expedition stages 2 and 4; effects apply only to stages 3 and 5.
- Safe Cache grants one Undo charge and keeps the target stage at `10_000` basis points (`1.00×`).
- Risk Protocol grants no charge, adds exactly one additional seeded eligible objective, and sets the target stage to `12_500` basis points (`1.25×`).
- Apply the Risk multiplier after objective bonuses and floor exactly once.
- Undo is available only after a non-hazard committed Expedition move, consumes one charge, and does not decrement total or stage move counters.
- Retry Seed starts from the captured base run; the same seed plus the same choices must reproduce objectives, multipliers, scores, and signatures.
- Campaign and Daily must never expose route choices or Undo.
- Keep generation bounded at 64 attempts per stage and the solver cap at 10,000 states.
- Do not add DB/API/leaderboard work, a generic ability framework, permanent progression, alternate choice layouts, snow, cracked ice, or generator-v1 compatibility code.

---

### Task 1: Make Risk-target stages deterministically capable of two objectives

**Files:**
- Modify: `src/lib/games/ice-slide/objectives.ts`
- Modify: `src/lib/games/ice-slide/quality.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`
- Modify: `src/lib/games/ice-slide/generator.ts`
- Modify: `src/lib/games/ice-slide/generator.test.ts`
- Modify: `src/lib/games/ice-slide/expedition.ts`
- Modify: `src/lib/games/ice-slide/expedition.test.ts`
- Modify as required by current frozen outputs: `src/lib/games/ice-slide/validation.ts` and its test, if the existing generator-v1 validation/golden lives there

**Interfaces:**
- Produces: `ICE_SLIDE_OBJECTIVE_IDS: readonly IceSlideObjectiveId[]`
- Produces: `getIceSlideObjectiveFeasibility(rows, solveResult): Record<IceSlideObjectiveId, boolean>`
- Extends: `createIceSlideExpeditionStage({ ..., minEligibleObjectives?: number })`
- Changes: `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION` from `1` to `2`
- Produces: `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2` in `expedition.ts`
- Preserves: default `minEligibleObjectives = 1` for non-target stages

- [ ] **Step 1: Write objective-feasibility helper tests before moving policy**

Add focused cases that lock the current feasibility semantics in `objectives.test.ts` (create this file if it does not exist; otherwise extend it):

```ts
const feasibility = getIceSlideObjectiveFeasibility(
    ['#####', '#S.C#', '#..G#', '#.H.#', '#####'],
    {
        solvable: true,
        minMoves: 2,
        reachableStopCount: 5,
        reachableCrystalIds: ['1,3'],
        reachedGoalWithAllCrystals: true,
        exploredStates: 8,
        truncated: false,
    }
)

expect(feasibility).toEqual({
    collect_all_crystals: true,
    no_falls: true,
    no_reset: true,
})
```

Also cover no crystals, no hazard, and a solve that cannot reach the goal with every crystal.

- [ ] **Step 2: Run the focused objective/quality tests and verify the new helper is missing**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/objectives.test.ts src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because `getIceSlideObjectiveFeasibility` / `ICE_SLIDE_OBJECTIVE_IDS` do not exist yet.

- [ ] **Step 3: Extract the existing objective ordering and feasibility calculation without changing behavior**

Implement in `objectives.ts`:

```ts
export const ICE_SLIDE_OBJECTIVE_IDS = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
] as const satisfies readonly IceSlideObjectiveId[]

export function getIceSlideObjectiveFeasibility(
    rows: readonly string[],
    solveResult: IceSlideSolveResult
): Record<IceSlideObjectiveId, boolean> {
    const crystalCount = countGlyph(rows, 'C')
    const hasHazard = countGlyph(rows, 'H') > 0
    return {
        collect_all_crystals:
            crystalCount > 0 && solveResult.reachedGoalWithAllCrystals,
        no_falls: hasHazard && solveResult.solvable,
        no_reset: solveResult.solvable,
    }
}
```

Use a type-only import for `IceSlideSolveResult`. Replace `quality.ts`'s local feasibility object with this helper so quality acceptance messages and ordering remain unchanged.

- [ ] **Step 4: Run objective/quality tests and verify the extraction is green**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/objectives.test.ts src/lib/games/ice-slide/quality.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write generator tests for the minimum eligible-objective contract**

Add tests for input validation, default compatibility, candidate rejection, and fallback behavior. The core assertion should inspect the accepted board with the production solver/helper rather than trusting `objectiveIds.length`:

```ts
const generated = createIceSlideExpeditionStage({
    seed: 'risk-capable-stage',
    stageNumber: 3,
    difficulty: 'medium',
    minEligibleObjectives: 2,
})
const solve = solveIceSlideBoard(generated.stage, { maxStates: 10_000 })
const feasibility = getIceSlideObjectiveFeasibility(
    generated.stage.rows,
    solve
)
expect(
    ICE_SLIDE_OBJECTIVE_IDS.filter(id => feasibility[id]).length
).toBeGreaterThanOrEqual(2)
```

Add a closed generator rejection reason `insufficient_objective_options` and assert it is counted when an otherwise valid candidate lacks enough options.

- [ ] **Step 6: Run generator tests and verify the new constraint is absent**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/generator.test.ts
```

Expected: FAIL on the new option/rejection assertions.

- [ ] **Step 7: Implement `minEligibleObjectives` inside the existing bounded flow**

In `generator.ts`:

```ts
const minEligibleObjectives = input.minEligibleObjectives ?? 1
if (
    !Number.isSafeInteger(minEligibleObjectives) ||
    minEligibleObjectives < 1 ||
    minEligibleObjectives > ICE_SLIDE_OBJECTIVE_IDS.length
) {
    throw new RangeError(
        `minEligibleObjectives must be an integer from 1 through ${ICE_SLIDE_OBJECTIVE_IDS.length}`
    )
}
```

After every candidate/fallback quality success:

```ts
const eligibleObjectives = ICE_SLIDE_OBJECTIVE_IDS.filter(
    id => quality.objectiveFeasibility[id]
)
if (eligibleObjectives.length < minEligibleObjectives) {
    increment('insufficient_objective_options')
    continue
}
```

Keep the current objective pick from this ordered eligible set.

- [ ] **Step 8: Make stages 3 and 5 request two eligible objectives and bump Expedition versions**

In `expedition.ts`, pass:

```ts
minEligibleObjectives: index === 2 || index === 4 ? 2 : 1
```

Change `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION` to `2`. Add:

```ts
export const ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2
```

Use the Expedition-specific ruleset constant in the Expedition run definition/run key; leave Campaign/Daily `ICE_SLIDE_RULESET_VERSION` untouched.

Update frozen Expedition generator/validation goldens to generator-v2 outputs. Do not keep v1 compatibility branches.

- [ ] **Step 9: Strengthen complete-run/fallback tests**

Extend the existing deterministic complete-run sweep so every generated stage 3 and 5 has at least two feasible objectives. Add catalog/fallback assertions proving at least one Medium fallback and one Hard fallback meet the two-objective condition under the existing quality constraints.

- [ ] **Step 10: Run focused generation/Expedition tests**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/objectives.test.ts src/lib/games/ice-slide/quality.test.ts src/lib/games/ice-slide/generator.test.ts src/lib/games/ice-slide/expedition.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/games/ice-slide

git commit -m "feat(ice-slide): guarantee risk-capable expedition stages"
```

---

### Task 2: Add pure route effects and multi-objective/multiplier scoring

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/expedition.ts`
- Modify: `src/lib/games/ice-slide/expedition.test.ts`
- Modify: `src/lib/games/ice-slide/scoring.ts`
- Modify: `src/lib/games/ice-slide/scoring.test.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`

**Interfaces:**
- Produces: `IceSlideExpeditionRouteChoice = 'safe' | 'risky'`
- Produces: `IceSlideExpeditionChoiceStage = 2 | 4`
- Produces: `applyIceSlideExpeditionRouteChoice(run, afterStageNumber, choice): IceSlideExpeditionRouteEffect`
- Changes: `IceSlideStageClearResult.stars.bonus` to `stars.bonuses`
- Extends: `levelScore(..., scoreMultiplierBps?: number)` with default `10_000`

- [ ] **Step 1: Write pure route-effect tests**

Add tests with one deterministic Expedition run:

```ts
const base = createIceSlideExpeditionRunDefinition('route-effect-seed')

const safe = applyIceSlideExpeditionRouteChoice(base, 2, 'safe')
expect(safe.undoChargesGranted).toBe(1)
expect(safe.run.stages[2]).toEqual(base.stages[2])
expect(base.stages[2].scoreMultiplierBps).toBe(10_000)

const riskyA = applyIceSlideExpeditionRouteChoice(base, 2, 'risky')
const riskyB = applyIceSlideExpeditionRouteChoice(base, 2, 'risky')
expect(riskyA).toEqual(riskyB)
expect(riskyA.undoChargesGranted).toBe(0)
expect(riskyA.run.stages[2].objectiveIds).toHaveLength(2)
expect(new Set(riskyA.run.stages[2].objectiveIds).size).toBe(2)
expect(riskyA.run.stages[2].scoreMultiplierBps).toBe(12_500)
expect(riskyA.run.stages[2].signature).not.toBe(base.stages[2].signature)
expect(base.stages[2].objectiveIds).toHaveLength(1)
```

Repeat the target mapping for stage 4 -> run stage 5. Assert Campaign/Daily or an invalid Expedition shape is rejected by the pure helper.

- [ ] **Step 2: Run the route-effect tests and verify failure**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/expedition.test.ts
```

Expected: FAIL because the route types/helper do not exist.

- [ ] **Step 3: Implement the pure route effect in `expedition.ts`**

Use the current run clone/signature/validation seams and a labeled seed fork:

```ts
const targetIndex = afterStageNumber === 2 ? 2 : 4
const nextRun = cloneIceSlideRunDefinition(run)

if (choice === 'safe') {
    return { run: nextRun, undoChargesGranted: 1 }
}

const target = nextRun.stages[targetIndex]
const solve = solveIceSlideBoard(target, {
    maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
})
if (solve.truncated || !solve.solvable) {
    throw new Error('Risk target stage is not solver-valid')
}

const feasibility = getIceSlideObjectiveFeasibility(target.rows, solve)
const remaining = ICE_SLIDE_OBJECTIVE_IDS.filter(
    id => feasibility[id] && !target.objectiveIds.includes(id)
)
if (remaining.length === 0) {
    throw new Error('Risk target stage has no additional eligible objective')
}

const extraObjective = createSeededRng(run.seed)
    .fork(`expedition:g${run.generatorVersion}`)
    .fork(`route:${afterStageNumber}`)
    .fork('risk-objective')
    .pick(remaining)

target.objectiveIds.push(extraObjective)
target.scoreMultiplierBps = 12_500
target.signature = createIceSlideStageSignature(target)
assertValidIceSlideRunDefinition(nextRun)
return { run: nextRun, undoChargesGranted: 0 }
```

Reject non-Expedition/null-seed input before using the RNG.

- [ ] **Step 4: Write scoring tests for multiple bonuses and multiplier rounding**

Add an exact raw-subtotal case where `1.25×` produces a fraction:

```ts
expect(
    levelScore(
        {
            levelNumber: 3,
            parMoves: 4,
            movesUsed: 4,
            crystalsCollected: 1,
            optionalStarsEarned: 3,
            scoreMultiplierBps: 12_500,
        },
        EXPEDITION_SCORING_CONFIG
    )
).toBe(
    Math.floor((600 + 25 + 50 + 300) * 1.25)
)
```

Keep existing Campaign/Daily expectations byte-for-byte where callers omit the multiplier.

- [ ] **Step 5: Run scoring tests and verify the multiplier case fails**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/scoring.test.ts
```

Expected: FAIL because `scoreMultiplierBps` is not consumed yet.

- [ ] **Step 6: Extend `levelScore()` with a default 1.00× multiplier**

Compute the current subtotal first and then:

```ts
const multiplierBps = params.scoreMultiplierBps ?? 10_000
return Math.floor((subtotal * multiplierBps) / 10_000)
```

Do not add another scoring function.

- [ ] **Step 7: Change the stage-clear result to support every bonus objective**

In `types.ts`:

```ts
stars: {
    clear: boolean
    efficient: boolean
    bonuses: Array<{ id: IceSlideObjectiveId; earned: boolean }>
    earnedCount: number
}
```

In `IceSlideGame.clearLevel()`, map every `state.objectiveIds` through `isIceSlideObjectiveComplete`, count every earned bonus, pass `stage.scoreMultiplierBps` to `levelScore()`, and preserve Campaign's non-star behavior.

- [ ] **Step 8: Write and pass game tests for two objectives**

Use an Expedition test run whose current stage has two objectives and `12_500` bps. Assert:

```ts
expect(result.stars.bonuses.map(item => item.id)).toEqual([
    'no_falls',
    'no_reset',
])
expect(result.scoreGained).toBe(expectedFlooredScore)
```

Also keep a Daily regression showing exactly one bonus entry and unchanged score.

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/scoring.test.ts src/lib/games/ice-slide/game.test.ts src/lib/games/ice-slide/expedition.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/games/ice-slide/types.ts src/lib/games/ice-slide/expedition.ts src/lib/games/ice-slide/expedition.test.ts src/lib/games/ice-slide/scoring.ts src/lib/games/ice-slide/scoring.test.ts src/lib/games/ice-slide/game.ts src/lib/games/ice-slide/game.test.ts

git commit -m "feat(ice-slide): apply expedition route effects"
```

---

### Task 3: Add authoritative route-choice lifecycle and game-data reporting

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.win.test.ts` if its fixtures construct `IceSlideGameData`/stage results directly

**Interfaces:**
- Adds state: `pendingRouteChoiceAfterStage`, `routeChoices`, `undoChargesAvailable`, `undoChargesUsed`, `starsPossible`
- Produces: `IceSlideGame.chooseExpeditionRoute(choice): boolean`
- Extends game data: route choices, available/used charges, star ceiling, per-stage objectives, per-stage multipliers
- Consumes: `applyIceSlideExpeditionRouteChoice()` from Task 2

- [ ] **Step 1: Write lifecycle tests around the two exact checkpoints**

Build a six-stage Expedition fixture with trivially solvable boards and assert:

```ts
clearCurrentStage(game) // stage 1
expect(game.getState().pendingRouteChoiceAfterStage).toBeNull()

clearCurrentStage(game) // stage 2
expect(game.getState().levelIndex).toBe(2)
expect(game.getState().pendingRouteChoiceAfterStage).toBe(2)

const beforeBlockedMove = game.getState()
game.move('E')
expect(game.getState().moves).toBe(beforeBlockedMove.moves)

game.resetLevel()
expect(game.getState().resets).toBe(beforeBlockedMove.resets)
```

Repeat for the stage-4 checkpoint.

- [ ] **Step 2: Write Safe/Risk state-application and stale-call tests**

Safe assertions:

```ts
expect(game.chooseExpeditionRoute('safe')).toBe(true)
expect(game.getState().pendingRouteChoiceAfterStage).toBeNull()
expect(game.getState().undoChargesAvailable).toBe(1)
expect(game.getState().routeChoices).toEqual(['safe'])
expect(game.chooseExpeditionRoute('safe')).toBe(false)
```

Risk assertions should prove the current loaded stage's `objectiveIds`, active `stageSignatures`, `starsPossible`, and game-data multiplier all reflect the route effect before the first move.

- [ ] **Step 3: Run focused game tests and verify failure**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/game.test.ts
```

Expected: FAIL because the pending-choice state/methods do not exist.

- [ ] **Step 4: Add the minimal state/game-data fields**

In `types.ts` add:

```ts
pendingRouteChoiceAfterStage: 2 | 4 | null
routeChoices: IceSlideExpeditionRouteChoice[]
undoChargesAvailable: number
undoChargesUsed: number
starsPossible: number
```

and to `IceSlideGameData`:

```ts
routeChoices: IceSlideExpeditionRouteChoice[]
undoChargesAvailable: number
undoChargesUsed: number
starsPossible: number
stageObjectiveIds: IceSlideObjectiveId[][]
stageScoreMultipliersBps: number[]
```

Initialize empty/zero values for every mode. Keep cloning in `getState()` / `getGameData()` deep for arrays.

- [ ] **Step 5: Derive the star ceiling from the active objective-mode run**

Add one private helper:

```ts
private starsPossibleForActiveRun(): number {
    if (!isIceSlideObjectiveMode(this.activeRun.mode)) {
        return 0
    }
    return this.activeRun.stages.reduce(
        (sum, stage) => sum + 2 + stage.objectiveIds.length,
        0
    )
}
```

Use it on start/load and after a Risk effect; do not duplicate this formula in `init.ts`.

- [ ] **Step 6: Set the pending checkpoint after the existing next-stage load**

In `clearLevel()`, after `loadLevel(this.state.levelIndex + 1, { preserveRun: true })`, inspect the stage number that just cleared and set pending only for Expedition `2`/`4` before calling `onLevelClear`.

Guard `move()` and `resetLevel()` with `pendingRouteChoiceAfterStage !== null`.

- [ ] **Step 7: Implement `chooseExpeditionRoute()`**

Use the current pending token as the only target selector; do not accept a caller-provided stage number:

```ts
chooseExpeditionRoute(choice: IceSlideExpeditionRouteChoice): boolean {
    const afterStageNumber = this.state.pendingRouteChoiceAfterStage
    if (
        this.state.mode !== 'expedition' ||
        this.state.status !== 'playing' ||
        afterStageNumber === null ||
        this.state.routeChoices.length !== (afterStageNumber === 2 ? 0 : 1)
    ) {
        return false
    }

    const effect = applyIceSlideExpeditionRouteChoice(
        this.activeRun,
        afterStageNumber,
        choice
    )
    this.activeRun = effect.run
    const stage = this.getStage(this.state.levelIndex)
    this.state.objectiveIds = [...stage.objectiveIds]
    this.state.stageSignatures = this.activeRun.stages.map(item => item.signature)
    this.state.starsPossible = this.starsPossibleForActiveRun()
    this.state.undoChargesAvailable += effect.undoChargesGranted
    this.state.routeChoices.push(choice)
    this.state.pendingRouteChoiceAfterStage = null
    return true
}
```

- [ ] **Step 8: Populate additive game data from the final active run/state**

Return cloned per-stage arrays:

```ts
stageObjectiveIds: this.activeRun.stages.map(stage => [...stage.objectiveIds]),
stageScoreMultipliersBps: this.activeRun.stages.map(
    stage => stage.scoreMultiplierBps
),
```

along with the route/charge/star fields.

- [ ] **Step 9: Run route lifecycle/game-data tests**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/game.test.ts src/lib/games/ice-slide/game.win.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/games/ice-slide/types.ts src/lib/games/ice-slide/game.ts src/lib/games/ice-slide/game.test.ts src/lib/games/ice-slide/game.win.test.ts

git commit -m "feat(ice-slide): add expedition route lifecycle"
```

---

### Task 4: Add one-step charge-based Undo inside `IceSlideGame`

**Files:**
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.crystal-farm.test.ts` if its crystal fixtures are the clearest reusable coverage seam
- Modify: `src/lib/games/ice-slide/game.hazard.test.ts`

**Interfaces:**
- Produces: `IceSlideGame.canUndo(): boolean`
- Produces: `IceSlideGame.undo(): boolean`
- Private only: one `IceSlideUndoSnapshot | null`
- Consumes: `undoChargesAvailable` / `undoChargesUsed` from Task 3

- [ ] **Step 1: Write ordinary-move Undo tests**

Start an Expedition fixture, grant a Safe charge through the real stage-2 choice, then on stage 3 capture state around one normal move:

```ts
const before = game.getState()
game.move('E')
const afterMove = game.getState()
expect(afterMove.moves).toBe(before.moves + 1)
expect(game.canUndo()).toBe(true)

expect(game.undo()).toBe(true)
const afterUndo = game.getState()
expect(afterUndo.player).toEqual(before.player)
expect(afterUndo.grid).toEqual(before.grid)
expect(afterUndo.moves).toBe(afterMove.moves)
expect(afterUndo.levelMoves).toBe(afterMove.levelMoves)
expect(afterUndo.undoChargesAvailable).toBe(0)
expect(afterUndo.undoChargesUsed).toBe(1)
expect(game.canUndo()).toBe(false)
```

- [ ] **Step 2: Write crystal restoration and invalidation tests**

Cover these exact contracts:

- moving through a crystal then Undo restores the `C` cell and both crystal counters;
- a no-op after a valid move does not remove the prior Undo opportunity;
- entering a hazard clears the snapshot and `undo()` returns `false`;
- manual Reset clears the snapshot;
- stage clear clears the snapshot;
- pending route choice, Campaign, Daily, zero charges, and stopped/won states return `false`.

- [ ] **Step 3: Run focused game tests and verify failure**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/game.test.ts src/lib/games/ice-slide/game.hazard.test.ts src/lib/games/ice-slide/game.crystal-farm.test.ts
```

Expected: FAIL because `canUndo()` / `undo()` are missing.

- [ ] **Step 4: Add the private snapshot type and storage**

Keep it local to `game.ts`:

```ts
interface IceSlideUndoSnapshot {
    grid: CellType[][]
    player: GridPosition
    crystalsCollected: number
    levelCrystalsCollected: number
    levelFalls: number
    levelResets: number
}

private undoSnapshot: IceSlideUndoSnapshot | null = null
```

Add one private clone method that creates the snapshot before `slide()` mutates the grid.

- [ ] **Step 5: Capture only committed non-hazard moves**

In `move()`:

```ts
const preMoveSnapshot = this.createUndoSnapshot()
const outcome = slide(this.state.grid, this.state.player, delta)

if (outcome.kind === 'noop') {
    this.state.lastSlidePath = []
    return
}

if (outcome.kind === 'hazard') {
    this.undoSnapshot = null
    // existing hazard path follows
    return
}

this.undoSnapshot =
    this.state.mode === 'expedition' ? preMoveSnapshot : null
```

Do not overwrite a prior snapshot on noop. Clear the snapshot from `start()`, `stop()`, `resetLevel()`, `loadLevel()` when crossing stages, and `destroy()`.

- [ ] **Step 6: Implement `canUndo()` and `undo()`**

```ts
canUndo(): boolean {
    return (
        this.state.mode === 'expedition' &&
        this.state.status === 'playing' &&
        this.state.pendingRouteChoiceAfterStage === null &&
        this.state.undoChargesAvailable > 0 &&
        this.undoSnapshot !== null
    )
}

undo(): boolean {
    if (!this.canUndo() || !this.undoSnapshot) {
        return false
    }
    const snapshot = this.undoSnapshot
    this.state.grid = cloneGrid(snapshot.grid)
    this.state.player = { ...snapshot.player }
    this.state.crystalsCollected = snapshot.crystalsCollected
    this.state.levelCrystalsCollected = snapshot.levelCrystalsCollected
    this.state.levelFalls = snapshot.levelFalls
    this.state.levelResets = snapshot.levelResets
    this.state.undoChargesAvailable -= 1
    this.state.undoChargesUsed += 1
    this.state.lastSlidePath = []
    this.undoSnapshot = null
    return true
}
```

Do not restore `moves`, `levelMoves`, elapsed time, score, route choices, or run metadata.

- [ ] **Step 7: Run Undo/game regressions**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/game.test.ts src/lib/games/ice-slide/game.hazard.test.ts src/lib/games/ice-slide/game.crystal-farm.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/games/ice-slide/game.ts src/lib/games/ice-slide/game.test.ts src/lib/games/ice-slide/game.hazard.test.ts src/lib/games/ice-slide/game.crystal-farm.test.ts

git commit -m "feat(ice-slide): add expedition undo charges"
```

---

### Task 5: Wire the route overlay, multi-objective copy, and Undo button

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Extends `IceSlideHandle` with `chooseExpeditionRoute(choice)` and `undo()`
- Consumes: `game.getState().pendingRouteChoiceAfterStage`
- Consumes: `game.canUndo()` / `game.undo()`
- Adds DOM IDs: `expedition-route-choice-overlay`, `expedition-safe-btn`, `expedition-risk-btn`, `expedition-undo-btn`

- [ ] **Step 1: Lock the new page DOM contract first**

In `game-board-markup.test.ts`, assert the Ice Slide page contains exactly the four new IDs plus existing stage-clear IDs. Also assert Safe/Risk are buttons and the route overlay starts hidden.

- [ ] **Step 2: Write `init.ts` tests for Continue -> choice sequencing and cleanup**

Using the existing DOM fixture, drive the game to a synthetic stage-2 clear and assert:

```ts
continueButton.click()
expect(stageClearOverlay.classList.contains('hidden')).toBe(true)
expect(routeChoiceOverlay.classList.contains('hidden')).toBe(false)
expect(document.activeElement).toBe(safeButton)
```

Then assert movement stays locked until a valid choice, double choice does nothing, and `failRun()`/cleanup hides the route overlay.

- [ ] **Step 3: Write HUD tests for multiple bonuses and dynamic star ceiling**

Provide an Expedition state with two current objectives and `starsPossible: 19`. Assert the HUD/result text contains both objective labels and does not render the old hard-coded `/ 18` maximum.

Also assert the Undo button text/count and disabled state track `game.canUndo()`.

- [ ] **Step 4: Run markup/init tests and verify failure**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/init.test.ts src/pages/game-board-markup.test.ts
```

Expected: FAIL on the new IDs/behavior.

- [ ] **Step 5: Refactor stage-clear helpers to render arrays of bonus results**

Replace the singular `formatBonusRow()`/`objectiveIds[0]` presentation with a deterministic joined representation. Keep one row container, for example:

```ts
function formatBonusRows(
    bonuses: IceSlideStageClearResult['stars']['bonuses']
): string {
    return bonuses.length === 0
        ? '— Bonus'
        : bonuses
              .map((bonus, index) =>
                  starCopy(
                      `${index === 0 ? 'Bonus' : 'Risk Bonus'}: ${ICE_SLIDE_OBJECTIVE_LABELS[bonus.id]}`,
                      bonus.earned
                  )
              )
              .join(' · ')
}
```

For the HUD, join every current `objectiveIds` label in the same stable array order.

- [ ] **Step 6: Change Continue behavior without introducing another overlay controller**

Keep `inputLocked = true` after stage 2/4. On Continue:

```ts
const pending = game?.getState().pendingRouteChoiceAfterStage
setVisible('stage-clear-overlay', false)
if (pending !== null) {
    setVisible('expedition-route-choice-overlay', true)
    document.getElementById('expedition-safe-btn')?.focus()
    return
}
inputLocked = false
render()
syncHud()
```

Add one helper to hide the route overlay during start/failure/stop/cleanup.

- [ ] **Step 7: Extend `IceSlideHandle` with narrow route/Undo actions**

```ts
chooseExpeditionRoute: choice => {
    if (!game || !inputLocked || !game.chooseExpeditionRoute(choice)) {
        return false
    }
    setVisible('expedition-route-choice-overlay', false)
    inputLocked = false
    render()
    syncHud()
    return true
},
undo: () => {
    if (!game || !game.undo()) {
        return false
    }
    render()
    syncHud()
    return true
},
```

Return booleans so stale page handlers cannot pretend an effect applied.

- [ ] **Step 8: Add page-local route and Undo controls**

Inside the game-board surface add the hidden route overlay with clear textual effects and two `Button` components. Inside `#expedition-meta`, add:

```astro
<Button
  id="expedition-undo-btn"
  type="button"
  variant="outline"
  size="sm"
  disabled
>
  Undo (0)
</Button>
```

Keep the shared default `GameControls`; do not replace it with an Ice Slide copy.

Wire page listeners directly to the handle:

```ts
safeBtn?.addEventListener('click', () => {
  gameHandle?.chooseExpeditionRoute('safe')
})
riskBtn?.addEventListener('click', () => {
  gameHandle?.chooseExpeditionRoute('risky')
})
undoBtn?.addEventListener('click', () => {
  gameHandle?.undo()
})
```

Do not add timed auto-choice behavior.

- [ ] **Step 9: Update Expedition summary/HUD to use state/game-data values**

Use `state.starsPossible`, `undoChargesAvailable`, and `undoChargesUsed`. Remove the old `state.stagesTotal * 3` assumption.

- [ ] **Step 10: Run UI/unit tests**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/init.test.ts src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/games/ice-slide/init.ts src/lib/games/ice-slide/init.test.ts src/pages/ice-slide/index.astro src/pages/game-board-markup.test.ts

git commit -m "feat(ice-slide): add expedition route and undo UI"
```

---

### Task 6: Prove deterministic choices/Undo in browser and run full regression gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify only if required by changed public fixtures: `src/lib/games/ice-slide/test-fixtures.ts`

**Interfaces:**
- Reuses the existing pinned Expedition Crypto seeds and `findExpeditionRoute()` browser-test helper
- Reads public state/game data through `window.iceSlideGame.getGame()` only; no test-only runtime API

- [ ] **Step 1: Add a Safe + Undo browser path with the existing pinned seed**

Use the existing deterministic stage routes to clear stages 1 and 2, click Continue, and assert the route overlay appears. Before choosing, press an arrow key and verify `#moves` does not change.

Choose Safe, then make one non-goal stage-3 move. Capture the public game state in the page:

```ts
const beforeUndo = await page.evaluate(() => {
    const game = window.iceSlideGame?.getGame()
    return game?.getState()
})
```

Click `#expedition-undo-btn` and assert the player's position/grid returns to the pre-move state while the displayed total moves stays at the post-move count and the charge becomes zero.

- [ ] **Step 2: Add a deterministic Risk route assertion**

Retry the pinned seed, clear through stage 2 again, choose Risk, then inspect public game data:

```ts
const routeData = await page.evaluate(() => {
    const game = window.iceSlideGame?.getGame()
    return game?.getGameData()
})

expect(routeData?.routeChoices).toEqual(['risky'])
expect(routeData?.stageObjectiveIds[2]).toHaveLength(2)
expect(routeData?.stageScoreMultipliersBps[2]).toBe(12_500)
```

Record the stage-3 signature, retry the same seed again, make the same Risk choice, and assert the objective IDs/multiplier/signature are identical.

- [ ] **Step 3: Add Campaign/Daily absence checks**

For Campaign and Daily mode, assert `#expedition-route-choice-overlay` remains hidden and `#expedition-undo-btn` is not visible because `#expedition-meta` is hidden.

- [ ] **Step 4: Run focused Ice Slide Playwright**

Run:

```bash
bunx playwright test e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: all Ice Slide browser cases PASS.

- [ ] **Step 5: Run the complete Ice Slide unit suite**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the existing Expedition content validation**

Run the repository's existing validation command:

```bash
bun run validate:ice-slide-expedition
```

Expected: the current 1,000-seed-per-tier validation completes without invalid accepted stages, and the updated generator-v2 goldens/stats are deterministic.

- [ ] **Step 7: Run repository gates**

Run:

```bash
bun run test:run
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all commands complete without new errors. Existing warning-only output may remain unchanged.

- [ ] **Step 8: Inspect the final diff for HPA-491 scope only**

Run:

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected production scope is limited to Ice Slide objective/quality/generator/expedition/types/scoring/game/init/page files plus their tests/E2E. There must be no DB schema, API, leaderboard, score-service, snow, or cracked-ice implementation.

- [ ] **Step 9: Commit E2E coverage**

```bash
git add e2e/games/play-coverage.spec.ts src/lib/games/ice-slide/test-fixtures.ts

git commit -m "test(ice-slide): cover expedition route choices and undo"
```

If `test-fixtures.ts` is unchanged, omit it from `git add`.

## Plan self-review

- **Spec coverage:** Risk-capable generation, deterministic route application, versioning, multi-objective scoring, exact checkpoint lifecycle, game-data reporting, one-step Undo, input gating, cleanup, keyboard/touch buttons, and browser determinism each have an owning task.
- **Placeholder scan:** no TBD/TODO, generic “handle edge cases,” or unowned implementation step remains.
- **Type consistency:** route-choice types originate in `types.ts`; Task 2 produces the pure route effect consumed by Task 3; Task 3 produces game APIs consumed by Task 5; Task 4 produces Undo APIs consumed by Task 5; Task 6 uses only those public seams.
- **YAGNI check:** no new framework, platform persistence, alternate layout generation, multi-level Undo stack, snow, cracked ice, or compatibility layer is planned.
