# Ice Slide Expedition Route Choices and Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Safe/Risky Expedition choices after stages 2 and 4 plus one-step charge-based Undo, while preserving Campaign/Daily behavior and the existing materialized-run architecture.

**Architecture:** Make stages 3 and 5 Risk-capable directly from their stage numbers inside the existing bounded generator, then apply choices through one pure metadata-only `applyIceSlideExpeditionRouteChoice()` helper. `IceSlideGame` owns the pending token, run-scoped route/charge state, and one four-field pre-move snapshot; `loadLevel()` is the single snapshot-invalidation choke point for level rebuilds. `init.ts` and the Ice Slide page own presentation and browser input gating only.

**Tech Stack:** TypeScript, Astro, PixiJS, Vitest, Playwright, Bun.

## Global Constraints

- Choice checkpoints are exactly after Expedition stages 2 and 4; effects apply only to stages 3 and 5.
- Safe Cache grants one Undo charge and leaves the target stage at `10_000` basis points (`1.00×`).
- Risk Protocol grants no charge, adds exactly one additional seeded eligible objective, and uses exported `ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS = 12_500` (`1.25×`).
- Apply the Risk multiplier after objective bonuses and floor exactly once.
- Stage numbers 3 and 5 require at least two eligible objectives inside `createIceSlideExpeditionStage()`; do not add a caller override.
- Keep the validator seed corpus prefix `ice-slide:validate:v1:` unchanged while re-validating the corpus with generator v2.
- Undo is available only after a non-hazard committed Expedition move, consumes one charge, and does not decrement total or stage move counters.
- `routeChoices`, `undoChargesAvailable`, and `undoChargesUsed` are run-scoped and survive hazard resets, manual Reset, and stage transitions.
- `starsPossible` is derived from `activeRun`; never preserve a stale copy through the `loadLevel()` bag.
- Retry Seed starts from the captured base run; do not replay prior choices.
- Campaign and Daily never expose route choices or Undo.
- Keep generation bounded at 64 attempts per stage and the solver cap at 10,000 states.
- Every task that changes TypeScript contracts must leave `bun run typecheck` green at its commit boundary.
- Do not add DB/API/leaderboard work, a generic ability framework, permanent progression, alternate route layouts, snow, cracked ice, eligibility fields in the run schema, a second Undo snapshot type, or generator-v1 compatibility code.

---

## File Structure

### Production files changed

- `src/lib/games/ice-slide/objectives.ts` — one shared objective selection order plus reusable feasibility policy.
- `src/lib/games/ice-slide/daily.ts` — reuse the shared objective order; no Daily behavior/version change.
- `src/lib/games/ice-slide/quality.ts` — reuse the feasibility helper while retaining quality acceptance/rejection ownership.
- `src/lib/games/ice-slide/generator.ts` — stage-number Risk capability, generator v2, closed rejection reason.
- `src/lib/games/ice-slide/expedition.ts` — Expedition ruleset v2, Risk multiplier constant, pure route effect.
- `src/lib/games/ice-slide/types.ts` — multi-bonus result plus route/charge/star game state/data.
- `src/lib/games/ice-slide/scoring.ts` — apply optional basis-point multiplier after subtotal.
- `src/lib/games/ice-slide/game.ts` — multi-objective scoring, route lifecycle, preservation, one-step Undo.
- `src/lib/games/ice-slide/init.ts` — browser route/Undo handle and HUD/overlay presentation.
- `src/pages/ice-slide/index.astro` — page-local route overlay, Undo button, derived Risk multiplier copy, non-authoritative star placeholder.
- `scripts/validate-ice-slide-expedition.ts` — assert stage-3/5 capability from existing `quality.objectiveFeasibility`; keep validation corpus stable.

### Tests changed

- `src/lib/games/ice-slide/objectives.test.ts`
- `src/lib/games/ice-slide/daily.test.ts`
- `src/lib/games/ice-slide/quality.test.ts`
- `src/lib/games/ice-slide/generator.test.ts`
- `src/lib/games/ice-slide/generator.validation.test.ts`
- `src/lib/games/ice-slide/templates.test.ts`
- `src/lib/games/ice-slide/expedition.test.ts`
- `src/lib/games/ice-slide/scoring.test.ts`
- `src/lib/games/ice-slide/game.test.ts`
- `src/lib/games/ice-slide/game.hazard.test.ts`
- `src/lib/games/ice-slide/game.crystal-farm.test.ts`
- `src/lib/games/ice-slide/init.test.ts`
- `src/pages/game-board-markup.test.ts`
- `e2e/games/play-coverage.spec.ts`

`run.ts::OBJECTIVE_RECORD` stays unchanged. It is the exhaustive validator membership record, not an RNG selection-order array.

---

### Task 1: Make stage 3/5 Risk capability a generator invariant

**Files:**
- Modify: `src/lib/games/ice-slide/objectives.ts`
- Modify: `src/lib/games/ice-slide/objectives.test.ts`
- Modify: `src/lib/games/ice-slide/daily.ts`
- Modify: `src/lib/games/ice-slide/daily.test.ts`
- Modify: `src/lib/games/ice-slide/quality.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`
- Modify: `src/lib/games/ice-slide/generator.ts`
- Modify: `src/lib/games/ice-slide/generator.test.ts`
- Modify: `src/lib/games/ice-slide/generator.validation.test.ts`
- Modify: `src/lib/games/ice-slide/templates.test.ts`
- Modify: `src/lib/games/ice-slide/expedition.ts`
- Modify: `src/lib/games/ice-slide/expedition.test.ts`
- Modify: `scripts/validate-ice-slide-expedition.ts`

**Interfaces:**
- Produces: `ICE_SLIDE_OBJECTIVE_IDS: readonly IceSlideObjectiveId[]`
- Produces: `getIceSlideObjectiveFeasibility(rows, solveResult): Record<IceSlideObjectiveId, boolean>`
- Changes: `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION` from `1` to `2`
- Produces: `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`
- Generator invariant: stage `3`/`5` requires two eligible objectives; all other stage numbers require one.
- Adds rejection reason: `insufficient_objective_options`

- [ ] **Step 1: Lock current feasibility semantics with focused tests**

In `objectives.test.ts`, add exact cases for crystals/hazards/solvability:

```ts
const allEligible = getIceSlideObjectiveFeasibility(
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

expect(allEligible).toEqual({
    collect_all_crystals: true,
    no_falls: true,
    no_reset: true,
})
```

Add three more fixtures:

```ts
expect(noCrystal.collect_all_crystals).toBe(false)
expect(noHazard.no_falls).toBe(false)
expect(cannotFinishWithAllCrystals.collect_all_crystals).toBe(false)
expect(solvable.no_reset).toBe(true)
```

- [ ] **Step 2: Run the focused tests and confirm the helper is missing**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because `ICE_SLIDE_OBJECTIVE_IDS` / `getIceSlideObjectiveFeasibility()` do not exist.

- [ ] **Step 3: Extract the shared objective order and feasibility calculation**

In `objectives.ts`:

```ts
import type { IceSlideSolveResult } from './solver'
import type { IceSlideObjectiveId } from './types'

export const ICE_SLIDE_OBJECTIVE_IDS = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
] as const satisfies readonly IceSlideObjectiveId[]

function countGlyph(rows: readonly string[], glyph: string): number {
    let count = 0
    for (const row of rows) {
        for (const cell of row) {
            if (cell === glyph) count += 1
        }
    }
    return count
}

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

Keep the existing completion-label/completion functions in the same module.

In `quality.ts`, replace the local feasibility object with:

```ts
const objectiveFeasibility = getIceSlideObjectiveFeasibility(
    candidate.rows,
    solveResult
)
```

Keep `quality.ts`'s rejection messages and accepted return shape unchanged.

- [ ] **Step 4: Remove the two true selection-order duplicates**

In `generator.ts`, delete `OBJECTIVE_ORDER` and use:

```ts
const eligibleObjectives = ICE_SLIDE_OBJECTIVE_IDS.filter(
    id => quality.objectiveFeasibility[id]
)
```

In `daily.ts`, delete `DAILY_OBJECTIVE_ORDER` and use the same constant:

```ts
const eligibleObjectives = ICE_SLIDE_OBJECTIVE_IDS.filter(
    objectiveId => quality.objectiveFeasibility[objectiveId]
)
```

Do not modify `run.ts::OBJECTIVE_RECORD`.

- [ ] **Step 5: Run objective/quality/Daily tests to prove the extraction is neutral**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/daily.test.ts
```

Expected: PASS, including existing frozen Daily output assertions.

- [ ] **Step 6: Add generator tests for stage-number Risk capability**

Add tests with no extra generator input:

```ts
const stage3 = createIceSlideExpeditionStage({
    seed: 'risk-stage-3',
    stageNumber: 3,
    difficulty: 'medium',
})
const stage5 = createIceSlideExpeditionStage({
    seed: 'risk-stage-5',
    stageNumber: 5,
    difficulty: 'hard',
})
```

For each, use the production solver/helper in the unit test and assert:

```ts
const solve = solveIceSlideBoard(stage.stage, {
    maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES,
})
const feasibility = getIceSlideObjectiveFeasibility(stage.stage.rows, solve)
expect(
    ICE_SLIDE_OBJECTIVE_IDS.filter(id => feasibility[id]).length
).toBeGreaterThanOrEqual(2)
```

Add a stage-4 fixture to exercise the ordinary path and prove a valid one-objective board can still be accepted when the stage number is not 3/5.

Add a mocked/controlled candidate path that produces an otherwise valid one-objective board for stage 3 and assert `rejectionCounts.insufficient_objective_options` increments.

- [ ] **Step 7: Run generator tests and verify stage 3/5 still accept one-option boards**

```bash
bun run test:run -- src/lib/games/ice-slide/generator.test.ts
```

Expected: FAIL on the new capability/rejection assertions.

- [ ] **Step 8: Implement the stage-number minimum in `generator.ts`**

Add the rejection union member:

```ts
| 'insufficient_objective_options'
```

Resolve the minimum with no caller override:

```ts
const minEligibleObjectives =
    input.stageNumber === 3 || input.stageNumber === 5 ? 2 : 1
```

After each candidate/fallback quality success:

```ts
const eligibleObjectives = ICE_SLIDE_OBJECTIVE_IDS.filter(
    id => quality.objectiveFeasibility[id]
)
if (eligibleObjectives.length < minEligibleObjectives) {
    increment('insufficient_objective_options')
    continue
}
```

Keep the existing seeded objective pick from this ordered list.

- [ ] **Step 9: Bump Expedition generator and ruleset identity**

In `generator.ts`:

```ts
export const ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2
```

In `expedition.ts`:

```ts
export const ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2
```

Use the Expedition-specific ruleset constant when constructing/formatting the Expedition run. Leave shared `ICE_SLIDE_RULESET_VERSION` unchanged for Campaign/Daily.

Update frozen Expedition generator/run expectations to v2. Do not retain generator-v1 branches.

- [ ] **Step 10: Keep the validation corpus fixed and reuse existing feasibility output**

In `scripts/validate-ice-slide-expedition.ts`, retain:

```ts
const TIER_STAGES = {
    easy: [1, 2],
    medium: [3, 4],
    hard: [5, 6],
} as const
```

Keep the seed prefix unchanged:

```ts
const seed =
    `ice-slide:validate:v1:${difficulty}:` +
    String(index).padStart(4, '0')
```

Add a comment immediately above it:

```ts
// Stable validation-corpus ID; intentionally independent of generator version.
```

After the existing `validateIceSlideStageQuality()` call succeeds, count directly from its returned feasibility record:

```ts
if (stageNumber === 3 || stageNumber === 5) {
    const eligibleCount = ICE_SLIDE_OBJECTIVE_IDS.filter(
        id => quality.objectiveFeasibility[id]
    ).length
    if (eligibleCount < 2) {
        throw new Error(`${context}: Risk target has only ${eligibleCount} eligible objectives`)
    }
}
```

Do not run another solver/helper call in the validator.

- [ ] **Step 11: Lock fallback capability without requiring every fallback to qualify**

In `templates.test.ts`, independently validate each Medium/Hard fallback with the existing quality helper and assert:

```ts
expect(mediumRiskCapableFallbacks.length).toBeGreaterThanOrEqual(1)
expect(hardRiskCapableFallbacks.length).toBeGreaterThanOrEqual(1)
```

A fallback with no `C`/`H` remains valid content; it simply cannot satisfy stage 3/5 and is skipped by the generator.

- [ ] **Step 12: Run generation/content/type gates**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/generator.validation.test.ts \
  src/lib/games/ice-slide/templates.test.ts \
  src/lib/games/ice-slide/expedition.test.ts
bun run validate:ice-slide-expedition
bun run typecheck
```

Expected: PASS. The same `validate:v1` corpus is now evaluated by generator v2 rules.

- [ ] **Step 13: Commit**

```bash
git add \
  src/lib/games/ice-slide/objectives.ts \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/daily.ts \
  src/lib/games/ice-slide/daily.test.ts \
  src/lib/games/ice-slide/quality.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/generator.ts \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/generator.validation.test.ts \
  src/lib/games/ice-slide/templates.test.ts \
  src/lib/games/ice-slide/expedition.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  scripts/validate-ice-slide-expedition.ts

git commit -m "feat(ice-slide): guarantee risk-capable expedition stages"
```

---

### Task 2: Add the pure route effect and atomically adopt multi-objective scoring

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/expedition.ts`
- Modify: `src/lib/games/ice-slide/expedition.test.ts`
- Modify: `src/lib/games/ice-slide/scoring.ts`
- Modify: `src/lib/games/ice-slide/scoring.test.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`

**Interfaces:**
- Produces: `IceSlideExpeditionRouteChoice = 'safe' | 'risky'`
- Produces: `IceSlideExpeditionChoiceStage = 2 | 4`
- Produces: `ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS = 12_500`
- Produces: `applyIceSlideExpeditionRouteChoice(run, afterStageNumber, choice): IceSlideExpeditionRouteEffect`
- Changes atomically: `IceSlideStageClearResult.stars.bonus` -> `stars.bonuses`
- Extends `levelScore()` params with optional `scoreMultiplierBps`, default `10_000`

- [ ] **Step 1: Write pure Safe/Risk route-effect tests**

In `expedition.test.ts`:

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
expect(riskyA.run.stages[2].scoreMultiplierBps).toBe(
    ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS
)
expect(riskyA.run.stages[2].signature).not.toBe(base.stages[2].signature)
expect(base.stages[2].objectiveIds).toHaveLength(1)
```

Repeat with `afterStageNumber = 4` and address the target as `run.stages[afterStageNumber]`. Do not duplicate a ternary checkpoint mapping in tests.

Assert Campaign/Daily input, invalid checkpoint shape, or null Expedition seed throws without mutating the caller.

- [ ] **Step 2: Run route tests and confirm the helper/constant are missing**

```bash
bun run test:run -- src/lib/games/ice-slide/expedition.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `applyIceSlideExpeditionRouteChoice()` using existing run seams**

In `expedition.ts`:

```ts
export const ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS = 12_500
```

Validate the supplied run first, then clone it:

```ts
assertValidIceSlideRunDefinition(run)
if (run.mode !== 'expedition' || run.seed === null) {
    throw new RangeError('route choices require a seeded Expedition run')
}
const nextRun = cloneIceSlideRunDefinition(run)
const targetIndex = afterStageNumber
```

Safe:

```ts
if (choice === 'safe') {
    assertValidIceSlideRunDefinition(nextRun)
    return { run: nextRun, undoChargesGranted: 1 }
}
```

Risk:

```ts
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
target.scoreMultiplierBps = ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS
target.signature = createIceSlideStageSignature(target)
assertValidIceSlideRunDefinition(nextRun)
return { run: nextRun, undoChargesGranted: 0 }
```

No board/par/mutation field changes.

- [ ] **Step 4: Write multiplier and multi-objective scoring tests**

In `scoring.test.ts`:

```ts
expect(
    levelScore(
        {
            levelNumber: 3,
            parMoves: 4,
            movesUsed: 4,
            crystalsCollected: 1,
            optionalStarsEarned: 3,
            scoreMultiplierBps: ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS,
        },
        EXPEDITION_SCORING_CONFIG
    )
).toBe(Math.floor((600 + 25 + 50 + 300) * 1.25))
```

Keep existing Campaign/Daily assertions where the multiplier is omitted.

- [ ] **Step 5: Extend `levelScore()` without creating another scoring function**

In `scoring.ts`:

```ts
const subtotal =
    levelClearPoints(params.levelNumber) +
    moveBonus(params.parMoves, params.movesUsed) +
    crystalBonus(params.crystalsCollected) +
    (params.optionalStarsEarned ?? 0) * config.objectiveStarBonus

const multiplierBps = params.scoreMultiplierBps ?? 10_000
return Math.floor((subtotal * multiplierBps) / 10_000)
```

- [ ] **Step 6: Atomically change the stage-clear result contract**

In `types.ts`:

```ts
stars: {
    clear: boolean
    efficient: boolean
    bonuses: Array<{ id: IceSlideObjectiveId; earned: boolean }>
    earnedCount: number
}
```

In `game.ts`, evaluate every current objective:

```ts
const bonuses = isObjectiveMode
    ? this.state.objectiveIds.map(id => ({
          id,
          earned: isIceSlideObjectiveComplete(id, {
              crystalsCollected: this.state.levelCrystalsCollected,
              totalCrystals,
              stageFalls: this.state.levelFalls,
              stageResets: this.state.levelResets,
          }),
      }))
    : []
const bonusStarsEarned = bonuses.filter(item => item.earned).length
const optionalStarsEarned = isObjectiveMode
    ? Number(efficient) + bonusStarsEarned
    : 0
```

Pass `stage.scoreMultiplierBps` into `levelScore()` and set:

```ts
stars: {
    clear: true,
    efficient,
    bonuses,
    earnedCount: isObjectiveMode ? 1 + optionalStarsEarned : 0,
}
```

- [ ] **Step 7: Update the single production result consumer in the same commit**

In `init.ts`, keep current one-row presentation until Task 5:

```ts
function formatBonusRow(result: IceSlideStageClearResult): string {
    const bonus = result.stars.bonuses[0]
    return bonus
        ? starCopy(
              `Bonus: ${ICE_SLIDE_OBJECTIVE_LABELS[bonus.id]}`,
              bonus.earned
          )
        : '— Bonus'
}
```

Update direct `stars.bonus` assertions/fixtures in `game.test.ts` and `init.test.ts` to use `stars.bonuses`.

- [ ] **Step 8: Run the contract/scoring/type gate**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/init.test.ts
bun run typecheck
```

Expected: PASS. No TypeScript consumer still references `stars.bonus`.

- [ ] **Step 9: Commit**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/expedition.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/scoring.ts \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/init.test.ts

git commit -m "feat(ice-slide): apply expedition route effects"
```

---

### Task 3: Add authoritative route lifecycle and preserve run-scoped charges/history

**Files:**
- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.hazard.test.ts`

**Interfaces:**
- Adds state: `pendingRouteChoiceAfterStage`, `routeChoices`, `undoChargesAvailable`, `undoChargesUsed`, `starsPossible`
- Produces: `IceSlideGame.chooseExpeditionRoute(choice): boolean`
- Extends game data with route/charge/star/per-stage metadata
- Reuses: `runMetadata()` for signature/run identity refresh

- [ ] **Step 1: Write checkpoint and authoritative gating tests**

Build a six-stage Expedition fixture and assert:

```ts
clearCurrentStage(game) // stage 1
expect(game.getState().pendingRouteChoiceAfterStage).toBeNull()

clearCurrentStage(game) // stage 2
expect(game.getState().levelIndex).toBe(2)
expect(game.getState().pendingRouteChoiceAfterStage).toBe(2)

const beforeBlocked = game.getState()
game.move('E')
game.resetLevel()
expect(game.getState().moves).toBe(beforeBlocked.moves)
expect(game.getState().resets).toBe(beforeBlocked.resets)
```

Repeat after stage 4.

- [ ] **Step 2: Write Safe/Risk/stale choice tests**

Safe:

```ts
expect(game.chooseExpeditionRoute('safe')).toBe(true)
expect(game.getState().pendingRouteChoiceAfterStage).toBeNull()
expect(game.getState().undoChargesAvailable).toBe(1)
expect(game.getState().routeChoices).toEqual(['safe'])
expect(game.chooseExpeditionRoute('safe')).toBe(false)
```

Risk must update current `objectiveIds`, `stageSignatures`, `starsPossible`, and game-data multiplier before the first target-stage move.

- [ ] **Step 3: Write preserve-run regression coverage before adding fields**

Drive the actual lifecycle:

1. clear stages 1 and 2;
2. choose Safe;
3. trigger a stage-3 hazard/reset;
4. assert:

```ts
expect(game.getState().undoChargesAvailable).toBe(1)
expect(game.getState().undoChargesUsed).toBe(0)
expect(game.getState().routeChoices).toEqual(['safe'])
```

5. call manual `resetLevel()` on stage 3 and assert the same three fields again;
6. clear stage 3 and assert the charge/history still exist on stage 4;
7. clear stage 4 and prove a second route choice succeeds.

This test owns the `loadLevel()` preserve-bag contract.

- [ ] **Step 4: Run focused game tests and confirm state APIs are absent**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Add the minimal state/game-data fields**

In `IceSlideState`:

```ts
pendingRouteChoiceAfterStage: 2 | 4 | null
routeChoices: IceSlideExpeditionRouteChoice[]
undoChargesAvailable: number
undoChargesUsed: number
starsPossible: number
```

In `IceSlideGameData`:

```ts
routeChoices: IceSlideExpeditionRouteChoice[]
undoChargesAvailable: number
undoChargesUsed: number
starsPossible: number
stageObjectiveIds: IceSlideObjectiveId[][]
stageScoreMultipliersBps: number[]
```

Initialize empty/zero route/charge fields for a new run and deep-clone arrays from `getState()` / `getGameData()`.

- [ ] **Step 6: Extend the existing `loadLevel()` preserve bag**

Alongside score/stars/falls/resets:

```ts
routeChoices: [...this.state.routeChoices],
undoChargesAvailable: this.state.undoChargesAvailable,
undoChargesUsed: this.state.undoChargesUsed,
```

When rebuilding state:

```ts
routeChoices: preserved?.routeChoices ?? [],
undoChargesAvailable: preserved?.undoChargesAvailable ?? 0,
undoChargesUsed: preserved?.undoChargesUsed ?? 0,
pendingRouteChoiceAfterStage: null,
starsPossible: this.starsPossibleForActiveRun(),
```

Do not preserve `starsPossible`; derive it. Do not preserve a pending token through the rebuild.

- [ ] **Step 7: Add the star-ceiling helper**

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

- [ ] **Step 8: Set the checkpoint only after the target stage is loaded**

Remember the one-based stage being cleared. Keep the existing next-stage reconstruction:

```ts
this.loadLevel(this.state.levelIndex + 1, { preserveRun: true })
```

Then, only for Expedition stage 2/4:

```ts
this.state.pendingRouteChoiceAfterStage = clearedStageNumber
```

Set this before `onLevelClear` fires. Guard both `move()` and `resetLevel()` when the pending token is non-null.

- [ ] **Step 9: Implement fail-closed `chooseExpeditionRoute()` and reuse `runMetadata()`**

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
    Object.assign(this.state, this.runMetadata())
    this.state.starsPossible = this.starsPossibleForActiveRun()
    this.state.undoChargesAvailable += effect.undoChargesGranted
    this.state.routeChoices.push(choice)
    this.state.pendingRouteChoiceAfterStage = null
    return true
}
```

Do not hand-build a second `stageSignatures = activeRun.stages.map(...)` path.

- [ ] **Step 10: Populate additive game data from the active run**

```ts
stageObjectiveIds: this.activeRun.stages.map(stage => [...stage.objectiveIds]),
stageScoreMultipliersBps: this.activeRun.stages.map(
    stage => stage.scoreMultiplierBps
),
```

Return cloned `routeChoices` plus charge/star fields.

- [ ] **Step 11: Run lifecycle/preservation/type gates**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
bun run typecheck
```

Expected: PASS, including Safe -> hazard -> manual Reset -> stage clear -> second checkpoint.

- [ ] **Step 12: Commit**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts

git commit -m "feat(ice-slide): add expedition route lifecycle"
```

---

### Task 4: Add one-step charge-based Undo through the `loadLevel()` choke point

**Files:**
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.crystal-farm.test.ts`
- Modify: `src/lib/games/ice-slide/game.hazard.test.ts`

**Interfaces:**
- Produces: `IceSlideGame.canUndo(): boolean`
- Produces: `IceSlideGame.undo(): boolean`
- Private only: one `IceSlideUndoSnapshot | null`
- Snapshot fields: grid, player, total crystals, stage crystals only

- [ ] **Step 1: Write ordinary-move Undo tests**

After choosing Safe for stage 3:

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

- [ ] **Step 2: Write crystal/noop/invalidation tests**

Cover exactly:

- a committed move collecting a crystal followed by Undo restores the `C` cell and both crystal counters;
- noop after a valid committed move keeps the prior Undo opportunity;
- hazard rebuild makes `undo()` return `false` while preserving the unused charge/history;
- manual Reset rebuild makes `undo()` return `false` while preserving the unused charge/history;
- non-final stage transition makes `undo()` return `false` and preserves unused charge/history;
- Campaign, Daily, pending route choice, zero charges, stopped state, and won state cannot Undo.

Do not assert restoration of `levelFalls` or `levelResets`; Undo cannot un-fall/un-reset.

- [ ] **Step 3: Run Undo tests and confirm APIs are absent**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Add the four-field private snapshot**

In `game.ts`:

```ts
interface IceSlideUndoSnapshot {
    grid: CellType[][]
    player: GridPosition
    crystalsCollected: number
    levelCrystalsCollected: number
}

private undoSnapshot: IceSlideUndoSnapshot | null = null
```

Add:

```ts
private createUndoSnapshot(): IceSlideUndoSnapshot {
    return {
        grid: cloneGrid(this.state.grid),
        player: { ...this.state.player },
        crystalsCollected: this.state.crystalsCollected,
        levelCrystalsCollected: this.state.levelCrystalsCollected,
    }
}
```

- [ ] **Step 5: Make `loadLevel()` the snapshot invalidation choke point**

At the first line of `loadLevel()`:

```ts
this.undoSnapshot = null
```

This covers:

- `start()` -> `loadLevel(0)`;
- manual `resetLevel()`;
- the hazard rebuild;
- non-final stage transitions;
- future level-rebuild callers.

Also clear explicitly in the two paths that do not need to rebuild a level:

```ts
stop(): void {
    this.undoSnapshot = null
    // existing stop behavior
}

destroy(): void {
    this.undoSnapshot = null
    // existing destroy behavior
}
```

Do not add separate snapshot clears to reset/hazard/stage-transition callers.

- [ ] **Step 6: Capture only a committed non-hazard move**

Before calling the mutating `slide()`:

```ts
const preMoveSnapshot = this.createUndoSnapshot()
const outcome = slide(this.state.grid, this.state.player, delta)
```

On noop:

```ts
if (outcome.kind === 'noop') {
    this.state.lastSlidePath = []
    return
}
```

Do not change `undoSnapshot` here.

The hazard branch continues into `loadLevel()`, which clears the snapshot through the choke point.

After confirming a normal moved outcome, before callbacks/clear handling:

```ts
this.undoSnapshot =
    this.state.mode === 'expedition' ? preMoveSnapshot : null
```

A non-final goal immediately calls `loadLevel()` from `clearLevel()` and therefore invalidates it. A final goal changes status to `won`, so `canUndo()` is false even if the private reference remains until stop/destroy.

- [ ] **Step 7: Implement `canUndo()` and `undo()`**

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
```

Successful Undo:

```ts
undo(): boolean {
    if (!this.canUndo() || !this.undoSnapshot) {
        return false
    }

    const snapshot = this.undoSnapshot
    this.state.grid = cloneGrid(snapshot.grid)
    this.state.player = { ...snapshot.player }
    this.state.crystalsCollected = snapshot.crystalsCollected
    this.state.levelCrystalsCollected = snapshot.levelCrystalsCollected
    this.state.undoChargesAvailable -= 1
    this.state.undoChargesUsed += 1
    this.state.lastSlidePath = []
    this.undoSnapshot = null
    return true
}
```

Do not restore `moves`, `levelMoves`, elapsed time, score, `levelFalls`, `levelResets`, route choices, active run metadata, or stage signatures.

- [ ] **Step 8: Run Undo/preservation/type gates**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts

git commit -m "feat(ice-slide): add expedition undo charges"
```

---

### Task 5: Wire the route overlay, dynamic star ceiling, and Undo control

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Extends `IceSlideHandle` with `chooseExpeditionRoute(choice): boolean` and `undo(): boolean`
- Adds IDs: `expedition-route-choice-overlay`, `expedition-safe-btn`, `expedition-risk-btn`, `expedition-undo-btn`
- Consumes: `pendingRouteChoiceAfterStage`, `starsPossible`, charge fields, `game.canUndo()`
- UI multiplier copy derives from `ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS`

- [ ] **Step 1: Lock the page DOM contract, including the static star placeholder**

In `game-board-markup.test.ts`, require:

```text
#expedition-route-choice-overlay
#expedition-safe-btn
#expedition-risk-btn
#expedition-undo-btn
```

Assert Safe/Risk are buttons and the route overlay starts hidden.

Change the static Expedition stars placeholder in `index.astro` from:

```text
Stars 0 / 18
```

to:

```text
Stars 0 / —
```

Add a markup assertion that `/ 18` is no longer present in `#expedition-stars`.

- [ ] **Step 2: Derive Risk copy from the exported basis-point constant**

In Astro frontmatter:

```ts
import { ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS } from '@/lib/games/ice-slide/expedition'

const expeditionRiskMultiplier = (
  ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS / 10_000
).toFixed(2)
```

Render the Risk button copy using that value rather than a second literal `1.25`:

```astro
<Button id="expedition-risk-btn" type="button">
  Risk Protocol — Extra bonus objective · next stage ×{expeditionRiskMultiplier}
</Button>
```

Safe copy remains `×1.00` because Safe is definitionally the unmodified baseline.

- [ ] **Step 3: Extend the `init.test.ts` DOM fixture and write sequencing tests**

Add the route overlay/buttons and Undo button to `mountDom()`.

Drive a stage-2 clear and assert:

```ts
continueButton.click()
expect(stageClearOverlay.classList.contains('hidden')).toBe(true)
expect(routeChoiceOverlay.classList.contains('hidden')).toBe(false)
expect(document.activeElement).toBe(safeButton)
```

While it is visible, keyboard/swipe movement and Reset remain blocked. A stale/double choice returns false and cannot unlock/mutate twice.

- [ ] **Step 4: Write dynamic star/multi-bonus/Undo HUD tests**

Provide an Expedition state/result with two bonus objectives and `starsPossible: 19`.

Assert:

```ts
expect(document.getElementById('expedition-stars')?.textContent).toBe(
    'Stars 0 / 19'
)
```

Assert stage/final bonus text contains both objective labels in stable order, with the second presented as `Risk Bonus`.

Assert `#expedition-undo-btn` shows the available charge count and is disabled exactly when `game.canUndo()` is false.

- [ ] **Step 5: Run UI tests and confirm new behavior is missing**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: FAIL.

- [ ] **Step 6: Expand singular bonus presentation to all results/objectives**

Replace the Task-2 adapter with:

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

For current objective HUD copy, map every `state.objectiveIds` in stable order instead of reading `[0]`.

- [ ] **Step 7: Keep browser input locked between Continue and the route choice**

Update Continue behavior:

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

Create one `hideRouteChoice()` helper and call it from start/fail/stop/cleanup paths that already own browser UI cleanup.

- [ ] **Step 8: Extend `IceSlideHandle` narrowly**

```ts
chooseExpeditionRoute: choice => {
    if (!game || !inputLocked || !game.chooseExpeditionRoute(choice)) {
        return false
    }
    hideRouteChoice()
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

- [ ] **Step 9: Add page-local route/Undo controls**

Place the hidden route overlay inside the current game-board surface. Put the Undo button inside `#expedition-meta`:

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

Keep the shared `GameControls` component unchanged.

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

- [ ] **Step 10: Replace every runtime Expedition star-ceiling assumption**

In `init.ts`, use:

```ts
setText(
    'expedition-stars',
    `Stars ${state.starsEarned} / ${state.starsPossible}`
)
```

In Expedition summary use `gameData.starsPossible`; remove `state.stagesTotal * 3` / `data.stagesTotal * 3`.

- [ ] **Step 11: Run UI/type gates**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/ice-slide/index.astro \
  src/pages/game-board-markup.test.ts

git commit -m "feat(ice-slide): add expedition route and undo UI"
```

---

### Task 6: Prove deterministic choices/Undo in browser and run regression gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`

**Interfaces:**
- Reuses existing pinned Expedition Crypto seeds.
- Reuses `findExpeditionRoute()` which materializes routes from the current generator at module load.
- Reads public game state/data through `window.iceSlideGame.getGame()` only.

- [ ] **Step 1: Extend the existing Ice Slide helper path through stage 2**

Use the current pinned seed and `findExpeditionRoute()` to compute stage-1/stage-2 routes from generator v2. Do not hard-code old v1 moves; changing the generator RNG label legitimately changes every stage.

- [ ] **Step 2: Add a Safe + Undo browser path**

Clear stages 1 and 2, click Continue, and assert the route overlay appears.

Before choosing, press an arrow key and assert the move count does not change.

Choose Safe. On stage 3 make one non-goal committed move and capture public state before/after the move. Click `#expedition-undo-btn` and assert:

- player/grid return to the pre-move values;
- displayed/internal total moves remain at the post-move count;
- the charge becomes zero;
- `undoChargesUsed` becomes one.

- [ ] **Step 3: Add deterministic Risk replay coverage**

Retry the same captured seed, clear stages 1/2, choose Risk, then inspect:

```ts
const data = await page.evaluate(() =>
    window.iceSlideGame?.getGame()?.getGameData()
)

expect(data?.routeChoices).toEqual(['risky'])
expect(data?.stageObjectiveIds[2]).toHaveLength(2)
expect(data?.stageScoreMultipliersBps[2]).toBe(
    ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS
)
```

Capture stage-3 signature/objective IDs. Retry the same seed again, make the same Risk choice, and assert both values reproduce exactly.

- [ ] **Step 4: Add Campaign/Daily absence checks**

For Campaign and Daily assert:

- `#expedition-route-choice-overlay` stays hidden;
- `#expedition-meta` stays hidden, so the Undo button is not exposed.

- [ ] **Step 5: Run focused Ice Slide Playwright**

```bash
bunx playwright test e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: all Ice Slide cases PASS.

- [ ] **Step 6: Run the complete Ice Slide/content gates**

```bash
bun run test:run -- src/lib/games/ice-slide src/pages/game-board-markup.test.ts
bun run validate:ice-slide-expedition
```

Expected: PASS. The validator keeps the stable `validate:v1` corpus prefix while exercising generator v2.

- [ ] **Step 7: Run repository gates**

```bash
bun run test:run
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: no new errors.

- [ ] **Step 8: Inspect final scope**

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected production scope is limited to the Ice Slide objective/Daily/quality/generator/expedition/types/scoring/game/init/page files and their tests/E2E plus the existing Expedition validation script. No DB schema, API, leaderboard, score-service, snow, cracked-ice, or shared ability framework files.

- [ ] **Step 9: Commit browser coverage**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(ice-slide): cover expedition route choices and undo"
```

---

## Plan Self-Review

- **Spec coverage:** generator stage-number invariant, stable validation corpus, feasibility reuse, versioning, pure route effect, centralized Risk multiplier, multi-objective scoring, exact route checkpoints, run-state preservation, `runMetadata()` reuse, four-field Undo, `loadLevel()` invalidation choke point, dynamic star ceiling, page-local controls, and browser determinism all have explicit owning tasks.
- **Placeholder scan:** no TBD/TODO, conditional file ownership, “implement similarly,” or unowned edge-case step remains.
- **Type consistency:** `ICE_SLIDE_OBJECTIVE_IDS` originates in `objectives.ts`; Expedition constants/effect originate in `expedition.ts`; Task 2 produces `stars.bonuses`; Task 3 produces route/charge state; Task 4 produces Undo APIs; Task 5 exposes only those public seams to browser code.
- **Reuse check:** Daily shares the objective selection order; `run.ts::OBJECTIVE_RECORD` remains the exhaustive membership validator; the content script counts existing `quality.objectiveFeasibility`; route state refresh uses `runMetadata()`; level rebuilds invalidate Undo in `loadLevel()`.
- **YAGNI check:** no `minEligibleObjectives` input, eligibility pool/schema field, mapping API, ability registry, multi-step Undo, second snapshot, DB/API work, snow/cracked ice, or compatibility layer.
