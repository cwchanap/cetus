# Ice Slide Expedition Route Choices and Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Safe/Risky Expedition choices after stages 2 and 4 plus one-step charge-based Undo, while preserving Campaign/Daily behavior and the existing materialized-run architecture.

**Architecture:** Make stages 3 and 5 Risk-capable by default inside the existing bounded stage generator, then apply choices through one pure metadata-only `applyIceSlideExpeditionRouteChoice()` helper. `IceSlideGame` owns pending choice state, preserved run-scoped route/charge state, and one private pre-move Undo snapshot; `init.ts` and the Ice Slide page own only presentation and browser input gating.

**Tech Stack:** TypeScript, Astro, PixiJS, Vitest, Playwright, Bun.

## Global Constraints

- Choice checkpoints are exactly after Expedition stages 2 and 4; effects apply only to stages 3 and 5.
- Safe Cache grants one Undo charge and keeps the target stage at `10_000` basis points (`1.00×`).
- Risk Protocol grants no charge, adds exactly one additional seeded eligible objective, and sets the target stage to `12_500` basis points (`1.25×`).
- Apply the Risk multiplier after objective bonuses and floor exactly once.
- Stages 3 and 5 must require at least two eligible objectives by generator default; callers must not need to remember the invariant.
- Undo is available only after a non-hazard committed Expedition move, consumes one charge, and does not decrement total or stage move counters.
- `routeChoices`, `undoChargesAvailable`, and `undoChargesUsed` are run-scoped state and must survive hazard resets, manual Reset, and stage transitions.
- `starsPossible` is derived from `activeRun`; recompute it instead of preserving a stale value.
- Retry Seed starts from the captured base run; do not replay prior choices.
- Campaign and Daily never expose route choices or Undo.
- Keep generation bounded at 64 attempts per stage and the solver cap at 10,000 states.
- Every task that changes TypeScript contracts leaves the tree type-checkable at its commit boundary.
- Do not add DB/API/leaderboard work, a generic ability framework, permanent progression, alternate route layouts, snow, cracked ice, eligibility fields in the run schema, a second Undo snapshot type, or generator-v1 compatibility code.

---

### Task 1: Make stage 3/5 Risk capability a generator invariant

**Files:**
- Modify: `src/lib/games/ice-slide/objectives.ts`
- Create or modify: `src/lib/games/ice-slide/objectives.test.ts`
- Modify: `src/lib/games/ice-slide/quality.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`
- Modify: `src/lib/games/ice-slide/generator.ts`
- Modify: `src/lib/games/ice-slide/generator.test.ts`
- Modify: `src/lib/games/ice-slide/generator.validation.test.ts`
- Modify: `scripts/validate-ice-slide-expedition.ts`
- Modify: `src/lib/games/ice-slide/expedition.ts`
- Modify: `src/lib/games/ice-slide/expedition.test.ts`
- Modify only for catalog assertions if needed: `src/lib/games/ice-slide/templates.test.ts`

**Interfaces:**
- Produces: `ICE_SLIDE_OBJECTIVE_IDS: readonly IceSlideObjectiveId[]`
- Produces: `getIceSlideObjectiveFeasibility(rows, solveResult): Record<IceSlideObjectiveId, boolean>`
- Extends: `createIceSlideExpeditionStage({ ..., minEligibleObjectives?: number })`
- Default rule: stage numbers `3` and `5` require `2`; all other stage numbers require `1`
- Changes: `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION` from `1` to `2`
- Produces: `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`

- [ ] **Step 1: Lock the current feasibility policy in tests**

Create/extend `objectives.test.ts` with cases for:

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

Also cover:

- no crystal -> `collect_all_crystals: false`;
- no hazard -> `no_falls: false`;
- solvable board that cannot finish with all crystals -> collect false;
- solvable board -> `no_reset: true`.

- [ ] **Step 2: Run the helper tests and verify the helper is missing**

```bash
bun run test:run -- src/lib/games/ice-slide/objectives.test.ts src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because the shared helper/order does not exist.

- [ ] **Step 3: Extract objective order and feasibility without changing quality semantics**

In `objectives.ts` add:

```ts
export const ICE_SLIDE_OBJECTIVE_IDS = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
] as const satisfies readonly IceSlideObjectiveId[]
```

Add one pure `getIceSlideObjectiveFeasibility()` using the current crystal/hazard/solver facts. Import `IceSlideSolveResult` as a type only. Move only the policy calculation; keep `quality.ts` responsible for candidate acceptance and rejection messages.

Replace `quality.ts`'s local feasibility object with the helper.

- [ ] **Step 4: Verify the extraction is behavior-neutral**

```bash
bun run test:run -- src/lib/games/ice-slide/objectives.test.ts src/lib/games/ice-slide/quality.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write generator tests for the stage-number default**

Add tests that call the generator **without** `minEligibleObjectives`:

```ts
const stage3 = createIceSlideExpeditionStage({
    seed: 'risk-stage-3-default',
    stageNumber: 3,
    difficulty: 'medium',
})
const stage5 = createIceSlideExpeditionStage({
    seed: 'risk-stage-5-default',
    stageNumber: 5,
    difficulty: 'hard',
})
```

For each, independently solve and assert:

```ts
const feasibility = getIceSlideObjectiveFeasibility(stage.rows, solve)
expect(
    ICE_SLIDE_OBJECTIVE_IDS.filter(id => feasibility[id]).length
).toBeGreaterThanOrEqual(2)
```

Also prove stage 4/6 default to one objective option, and add an explicit override test such as `minEligibleObjectives: 1` so focused tests/direct callers can bypass the stage default intentionally.

Add validation tests for overrides outside `1..ICE_SLIDE_OBJECTIVE_IDS.length`.

- [ ] **Step 6: Add the closed rejection reason before implementation**

Extend the generator rejection union with:

```ts
'insufficient_objective_options'
```

Add a test fixture/mocked candidate path showing an otherwise accepted board is rejected when its feasible-objective count is below the effective minimum.

- [ ] **Step 7: Run generator tests and verify the new default fails**

```bash
bun run test:run -- src/lib/games/ice-slide/generator.test.ts
```

Expected: FAIL because stage 3/5 do not yet default to two eligible objectives.

- [ ] **Step 8: Implement the effective minimum in `generator.ts`**

Resolve the requirement once near input validation:

```ts
const minEligibleObjectives =
    input.minEligibleObjectives ??
    (input.stageNumber === 3 || input.stageNumber === 5 ? 2 : 1)

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

After candidate and fallback quality acceptance:

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

Do **not** put stage-3/stage-5 special arguments in `expedition.ts`; the invariant belongs in the generator.

- [ ] **Step 9: Bump Expedition generator/ruleset identity without touching Daily/Campaign**

Change:

```ts
ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2
```

Add in `expedition.ts`:

```ts
export const ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2
```

Use the Expedition-only constant for Expedition run construction/run-key formatting. Leave shared `ICE_SLIDE_RULESET_VERSION` untouched.

Replace frozen generator-v1 output expectations with v2; do not retain a v1 branch.

- [ ] **Step 10: Make the validation loop exercise the production invariant**

Keep `scripts/validate-ice-slide-expedition.ts` calling the generator with its existing real stage numbers:

```ts
const TIER_STAGES = {
    easy: [1, 2],
    medium: [3, 4],
    hard: [5, 6],
} as const
```

Do not pass a special `minEligibleObjectives` argument. That is the point of the generator default.

Update validation seed/version labels from `validate:v1` to `validate:v2` where frozen labels describe the generator contract.

In the independent assertion path, for stage `3`/`5`, derive feasibility from the independently solved board and require at least two eligible objectives.

- [ ] **Step 11: Lock fallback capability**

Add a catalog test that independently validates checked-in fallbacks and proves:

- at least one Medium fallback has two or more eligible objectives;
- at least one Hard fallback has two or more eligible objectives.

Do not require every fallback to be Risk-capable. A one-objective fallback such as a board with no `C` and no `H` remains valid for non-Risk target stages; it is simply skipped for stage 3/5.

- [ ] **Step 12: Run generation/content gates**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/generator.validation.test.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/templates.test.ts
bun run validate:ice-slide-expedition
bun run typecheck
```

Expected: PASS. The 1,000-seed validator now checks the same stage-3/stage-5 constraint production uses.

- [ ] **Step 13: Commit**

```bash
git add \
  src/lib/games/ice-slide/objectives.ts \
  src/lib/games/ice-slide/objectives.test.ts \
  src/lib/games/ice-slide/quality.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/generator.ts \
  src/lib/games/ice-slide/generator.test.ts \
  src/lib/games/ice-slide/generator.validation.test.ts \
  src/lib/games/ice-slide/expedition.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/templates.test.ts \
  scripts/validate-ice-slide-expedition.ts

git commit -m "feat(ice-slide): guarantee risk-capable expedition stages"
```

Omit `objectives.test.ts` or `templates.test.ts` from `git add` if the repository already locates those assertions in an existing file instead of creating/modifying them.

---

### Task 2: Add pure route effects and atomically adopt multi-objective results

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
- Modify any other direct TypeScript fixture discovered by `grep -R "stars\.bonus" src e2e`

**Interfaces:**
- Produces: `IceSlideExpeditionRouteChoice = 'safe' | 'risky'`
- Produces: `IceSlideExpeditionChoiceStage = 2 | 4`
- Produces: `applyIceSlideExpeditionRouteChoice(run, afterStageNumber, choice): IceSlideExpeditionRouteEffect`
- Changes atomically: `IceSlideStageClearResult.stars.bonus` -> `stars.bonuses`
- Extends: `levelScore()` params with optional `scoreMultiplierBps`, default `10_000`

- [ ] **Step 1: Write pure route-effect tests**

Use a deterministic Expedition v2 run:

```ts
const base = createIceSlideExpeditionRunDefinition('route-effect-seed')

const safe = applyIceSlideExpeditionRouteChoice(base, 2, 'safe')
expect(safe.undoChargesGranted).toBe(1)
expect(safe.run.stages[2]).toEqual(base.stages[2])

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

Repeat checkpoint 4 -> stage index 4. Assert invalid choice checkpoint, Campaign/Daily input, null seed, or malformed Expedition run fails without mutating the input.

- [ ] **Step 2: Run route tests and verify the helper is absent**

```bash
bun run test:run -- src/lib/games/ice-slide/expedition.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `applyIceSlideExpeditionRouteChoice()` using existing seams**

Use:

- `cloneIceSlideRunDefinition()`;
- `solveIceSlideBoard(..., { maxStates: ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES })`;
- `getIceSlideObjectiveFeasibility()`;
- a labeled `createSeededRng(run.seed)` fork;
- `createIceSlideStageSignature()`;
- `assertValidIceSlideRunDefinition()`.

Core Risk shape:

```ts
const targetIndex = afterStageNumber === 2 ? 2 : 4
const nextRun = cloneIceSlideRunDefinition(run)
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
```

Safe returns the cloned run unchanged plus `undoChargesGranted: 1`.

- [ ] **Step 4: Write multiplier tests before changing scoring**

Add an exact case:

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
).toBe(Math.floor((600 + 25 + 50 + 300) * 1.25))
```

Existing callers without the field must keep current Campaign/Daily outputs.

- [ ] **Step 5: Implement multiplier-at-end scoring**

In `levelScore()` compute the existing subtotal, then:

```ts
const multiplierBps = params.scoreMultiplierBps ?? 10_000
return Math.floor((subtotal * multiplierBps) / 10_000)
```

Do not add a second Expedition scoring function.

- [ ] **Step 6: Write game tests for two bonus objectives**

Use a stage with two objective IDs and `12_500` bps. Assert the result exposes both and `scoreGained` equals the floored multiplied subtotal.

Keep a Daily regression showing one bonus entry and unchanged Daily score.

- [ ] **Step 7: Change `stars.bonus` to `stars.bonuses` atomically across TypeScript consumers**

In `types.ts`:

```ts
stars: {
    clear: boolean
    efficient: boolean
    bonuses: Array<{ id: IceSlideObjectiveId; earned: boolean }>
    earnedCount: number
}
```

In `IceSlideGame.clearLevel()` evaluate every `state.objectiveIds` and build `bonuses` in stable array order. Count all earned bonus objectives and pass `stage.scoreMultiplierBps` to `levelScore()`.

In the **same task/commit**, update every current singular TypeScript call site. In `init.ts`, preserve the old single-bonus presentation for now:

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

Update `game.test.ts`, `init.test.ts`, and other fixtures from `result.stars.bonus` to `result.stars.bonuses[0]` or array assertions as appropriate.

Do **not** add Risk Bonus wording or multi-objective HUD joining yet; Task 5 owns presentation expansion.

- [ ] **Step 8: Prove this contract commit is green and type-checkable**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/scoring.test.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/expedition.test.ts \
  src/lib/games/ice-slide/init.test.ts
bun run typecheck
```

Expected: PASS. No intermediate tree may still reference `stars.bonus`.

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
- Modify: `src/lib/games/ice-slide/game.win.test.ts` only if direct fixtures require the additive fields

**Interfaces:**
- Adds state: `pendingRouteChoiceAfterStage`, `routeChoices`, `undoChargesAvailable`, `undoChargesUsed`, `starsPossible`
- Produces: `IceSlideGame.chooseExpeditionRoute(choice): boolean`
- Extends game data with route/charge/star/per-stage metadata
- Consumes: `applyIceSlideExpeditionRouteChoice()` from Task 2

- [ ] **Step 1: Write checkpoint/gating tests**

Build a deterministic six-stage Expedition fixture and assert:

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

Repeat at stage 4.

- [ ] **Step 2: Write choice/state tests**

Safe:

```ts
expect(game.chooseExpeditionRoute('safe')).toBe(true)
expect(game.getState().pendingRouteChoiceAfterStage).toBeNull()
expect(game.getState().undoChargesAvailable).toBe(1)
expect(game.getState().routeChoices).toEqual(['safe'])
expect(game.chooseExpeditionRoute('safe')).toBe(false)
```

Risk must update current `objectiveIds`, `stageSignatures`, `starsPossible`, and game-data multiplier before the first target-stage move.

- [ ] **Step 3: Write preserve-run regression tests before adding fields**

This test owns the `loadLevel()` reconstruction hazard:

1. clear stages 1/2;
2. choose Safe;
3. trigger a stage-3 hazard (or call the real hazard path through movement);
4. assert after reset:

```ts
expect(game.getState().undoChargesAvailable).toBe(1)
expect(game.getState().undoChargesUsed).toBe(0)
expect(game.getState().routeChoices).toEqual(['safe'])
```

Then clear stage 3 and assert on stage 4:

```ts
expect(game.getState().undoChargesAvailable).toBe(1)
expect(game.getState().routeChoices).toEqual(['safe'])
```

Finally clear stage 4 and prove the second route choice is accepted, demonstrating the prior choice was not wiped.

Add the same preservation assertion for manual `resetLevel()` if the hazard fixture does not already cover the shared reconstruct path.

- [ ] **Step 4: Run the focused game tests and verify state APIs are missing**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Add minimal state/game-data fields**

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

Idle/new runs initialize route/charge fields empty/zero. Clone arrays from `getState()` and `getGameData()`.

- [ ] **Step 6: Make `loadLevel()` preserve exactly the run-scoped fields**

Extend the existing `preserveRun` object alongside score/stars/falls/resets:

```ts
const preserved = options.preserveRun
    ? {
          // existing fields...
          routeChoices: [...this.state.routeChoices],
          undoChargesAvailable: this.state.undoChargesAvailable,
          undoChargesUsed: this.state.undoChargesUsed,
      }
    : null
```

When rebuilding state:

```ts
routeChoices: preserved?.routeChoices ?? [],
undoChargesAvailable: preserved?.undoChargesAvailable ?? 0,
undoChargesUsed: preserved?.undoChargesUsed ?? 0,
pendingRouteChoiceAfterStage: null,
starsPossible: this.starsPossibleForActiveRun(),
```

`starsPossible` is derived; recompute it instead of copying it through the preserve bag.

Do not attempt to preserve a pending checkpoint through a load. `clearLevel()` explicitly sets the correct pending token only **after** loading the target stage.

- [ ] **Step 7: Add the derived star-ceiling helper**

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

Use it when state is created/rebuilt and after Risk changes `activeRun`.

- [ ] **Step 8: Set pending checkpoints after reconstruction**

In `clearLevel()` remember the stage number being cleared, then keep the existing next-stage load. After:

```ts
this.loadLevel(this.state.levelIndex + 1, { preserveRun: true })
```

set pending only for Expedition stage 2/4 before `onLevelClear` fires.

Guard both `move()` and `resetLevel()` when a choice is pending.

- [ ] **Step 9: Implement fail-closed `chooseExpeditionRoute()`**

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

- [ ] **Step 10: Populate additive game data from active run/state**

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
  src/lib/games/ice-slide/game.hazard.test.ts \
  src/lib/games/ice-slide/game.win.test.ts
bun run typecheck
```

Expected: PASS, including Safe -> stage-3 hazard -> stage-3 clear preservation.

- [ ] **Step 12: Commit**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts \
  src/lib/games/ice-slide/game.win.test.ts

git commit -m "feat(ice-slide): add expedition route lifecycle"
```

Omit `game.win.test.ts` if unchanged.

---

### Task 4: Add one-step charge-based Undo at the committed-move boundary

**Files:**
- Modify: `src/lib/games/ice-slide/game.ts`
- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/game.crystal-farm.test.ts`
- Modify: `src/lib/games/ice-slide/game.hazard.test.ts`

**Interfaces:**
- Produces: `IceSlideGame.canUndo(): boolean`
- Produces: `IceSlideGame.undo(): boolean`
- Private only: one `IceSlideUndoSnapshot | null`
- Consumes preserved route/charge state from Task 3

- [ ] **Step 1: Write ordinary-move Undo tests**

Grant a Safe charge through the real stage-2 choice, then on stage 3:

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

- [ ] **Step 2: Write crystal restore and invalidation tests**

Cover:

- moving through a crystal then Undo restores the `C` cell and both crystal counters;
- noop after a valid move does not remove the prior Undo opportunity;
- hazard clears the snapshot, but **does not consume or wipe the Safe charge or route history** after `loadLevel()`;
- manual Reset clears the snapshot, but preserves route/charge state;
- stage clear clears the snapshot and preserves unused charges/history;
- pending choice, Campaign, Daily, zero charges, stopped, and won states cannot Undo.

- [ ] **Step 3: Run tests and verify Undo APIs are absent**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Add one private snapshot type**

Keep it in `game.ts`:

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

Do not create a second public snapshot contract.

- [ ] **Step 5: Capture at the committed-move boundary**

Before `slide()` mutates the grid:

```ts
const preMoveSnapshot = this.createUndoSnapshot()
const outcome = slide(this.state.grid, this.state.player, delta)
```

Then:

```ts
if (outcome.kind === 'noop') {
    this.state.lastSlidePath = []
    return
}

if (outcome.kind === 'hazard') {
    this.undoSnapshot = null
    // existing hazard/reset path
    return
}

this.undoSnapshot =
    this.state.mode === 'expedition' ? preMoveSnapshot : null
```

Do not overwrite the prior snapshot on noop.

Clear the snapshot on start, stop, destroy, manual Reset, hazard, and stage transition. The state-reconstruction path from Task 3 preserves run-scoped charges/history independently.

- [ ] **Step 6: Implement `canUndo()` / `undo()`**

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

On successful Undo restore only snapshot-owned fields:

```ts
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
```

Do not restore `moves`, `levelMoves`, elapsed time, score, route choices, active run metadata, or stage signatures.

- [ ] **Step 7: Run Undo/preservation/type tests**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add \
  src/lib/games/ice-slide/game.ts \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/game.hazard.test.ts \
  src/lib/games/ice-slide/game.crystal-farm.test.ts

git commit -m "feat(ice-slide): add expedition undo charges"
```

---

### Task 5: Expand UI to route choices, multiple bonus copy, and Undo control

**Files:**
- Modify: `src/lib/games/ice-slide/init.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Modify: `src/pages/ice-slide/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Extends `IceSlideHandle` with `chooseExpeditionRoute(choice): boolean` and `undo(): boolean`
- Consumes: `pendingRouteChoiceAfterStage`, `starsPossible`, charge fields, `game.canUndo()`
- Adds IDs: `expedition-route-choice-overlay`, `expedition-safe-btn`, `expedition-risk-btn`, `expedition-undo-btn`

- [ ] **Step 1: Lock the DOM contract**

In `game-board-markup.test.ts`, require the four IDs above. Assert Safe/Risk are buttons and the route overlay starts hidden. Keep existing stage-clear IDs.

- [ ] **Step 2: Write Continue -> route-choice sequencing tests**

Drive a synthetic stage-2 clear, then:

```ts
continueButton.click()
expect(stageClearOverlay.classList.contains('hidden')).toBe(true)
expect(routeChoiceOverlay.classList.contains('hidden')).toBe(false)
expect(document.activeElement).toBe(safeButton)
```

Assert keyboard/swipe movement remains locked until a valid choice. Double/stale choice must not unlock or mutate again. Failure/cleanup hides the overlay.

- [ ] **Step 3: Write UI tests for multiple bonus copy and dynamic stars**

Provide a Risk state/result with two bonus objectives and `starsPossible: 19`. Assert both labels/results are rendered in stable array order and no `/ 18` assumption remains.

Assert Undo button label/count and disabled state track `undoChargesAvailable` and `game.canUndo()`.

- [ ] **Step 4: Run markup/init tests and verify behavior is missing**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: FAIL.

- [ ] **Step 5: Expand the Task-2 mechanical bonus adapter into full multi-bonus copy**

Task 2 already changed the data contract to `stars.bonuses` while keeping old one-row presentation. Now replace that adapter with stable multi-bonus formatting:

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

For the HUD, join every current `objectiveIds` label in stable array order.

- [ ] **Step 6: Keep input locked between Continue and a choice**

Continue behavior:

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

Add one small helper that hides the route overlay during start/failure/stop/cleanup.

- [ ] **Step 7: Extend `IceSlideHandle` narrowly**

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

- [ ] **Step 8: Add page-local overlay and Undo button**

Place the route overlay inside the existing game-board surface with two `Button` components. Put Undo inside `#expedition-meta`:

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

Do not fork `GameControls`.

Wire native click handlers directly to the handle; no timer or auto-choice.

- [ ] **Step 9: Use state/game-data totals, not hard-coded Expedition assumptions**

Use `state.starsPossible`, `undoChargesAvailable`, and `undoChargesUsed`. Remove `state.stagesTotal * 3` from Expedition HUD/summary paths.

- [ ] **Step 10: Run UI/type tests**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add \
  src/lib/games/ice-slide/init.ts \
  src/lib/games/ice-slide/init.test.ts \
  src/pages/ice-slide/index.astro \
  src/pages/game-board-markup.test.ts

git commit -m "feat(ice-slide): add expedition route and undo UI"
```

---

### Task 6: Prove deterministic route/Undo behavior and run full gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify only if required by public fixture changes: `src/lib/games/ice-slide/test-fixtures.ts`

**Interfaces:**
- Reuses pinned Expedition Crypto seeds and existing `findExpeditionRoute()` helper
- Reads only public state/game data through `window.iceSlideGame.getGame()`

- [ ] **Step 1: Add Safe + Undo browser coverage**

With the existing pinned seed:

1. clear stages 1/2;
2. Continue;
3. assert route overlay visible;
4. press a move key and prove move count is unchanged while choice is pending;
5. choose Safe;
6. make one non-goal committed stage-3 move;
7. click `#expedition-undo-btn`;
8. assert position/grid return to pre-move state, total/stage move cost remains, and one charge is consumed.

- [ ] **Step 2: Add deterministic Risk coverage**

Retry the captured seed, choose Risk after stage 2, then inspect:

```ts
const routeData = await page.evaluate(() => {
    const game = window.iceSlideGame?.getGame()
    return game?.getGameData()
})

expect(routeData?.routeChoices).toEqual(['risky'])
expect(routeData?.stageObjectiveIds[2]).toHaveLength(2)
expect(routeData?.stageScoreMultipliersBps[2]).toBe(12_500)
```

Capture the target signature, Retry Seed again, repeat the Risk choice, and assert objectives/multiplier/signature are identical.

- [ ] **Step 3: Add browser preservation coverage for Safe state**

After Safe, force or navigate through a stage-3 hazard path when the pinned fixture provides one; otherwise keep this as unit coverage from Tasks 3/4. If exercised in browser, assert charge/history remain after the reset.

Do not add a test-only gameplay API solely to force a hazard.

- [ ] **Step 4: Add Campaign/Daily absence checks**

Assert the route overlay remains hidden and the Undo button is not visible because Expedition HUD is hidden.

- [ ] **Step 5: Run focused Ice Slide Playwright**

```bash
bunx playwright test e2e/games/play-coverage.spec.ts --grep "Ice Slide"
```

Expected: PASS.

- [ ] **Step 6: Run the complete Ice Slide unit/content suite**

```bash
bun run test:run -- \
  src/lib/games/ice-slide \
  src/pages/game-board-markup.test.ts
bun run validate:ice-slide-expedition
```

Expected: PASS. The 1,000-seed validator exercises stage-3/stage-5 Risk capability through the generator default.

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

Expected production scope: Ice Slide objective/quality/generator/expedition/types/scoring/game/init/page files plus focused tests, validation script, and E2E. No DB schema, API, leaderboard, score service, snow, or cracked-ice implementation.

- [ ] **Step 9: Commit browser coverage**

```bash
git add e2e/games/play-coverage.spec.ts src/lib/games/ice-slide/test-fixtures.ts
git commit -m "test(ice-slide): cover expedition route choices and undo"
```

If `test-fixtures.ts` is unchanged, omit it.

## Plan self-review

- **Spec coverage:** generator-owned Risk eligibility, Expedition-only versioning, pure metadata route effects, multi-objective scoring, route lifecycle, `loadLevel()` preservation, one-step Undo, UI input gating, cleanup, and browser determinism each have an owner.
- **Validation-path check:** there is no planned `validation.ts`; the plan names `generator.validation.test.ts` and `scripts/validate-ice-slide-expedition.ts`, which are the actual content-validation seams.
- **Preservation check:** route history and charge counters are explicitly copied through `loadLevel()`'s preserve-run bag; `starsPossible` is recomputed from `activeRun`.
- **Task-green check:** the `stars.bonus -> stars.bonuses` rename updates `game.ts`, `init.ts`, and tests in Task 2, followed by `bun run typecheck`; Task 5 only expands copy/wiring.
- **Placeholder scan:** no TBD/TODO or unowned “handle edge cases” step remains.
- **YAGNI check:** no framework, eligibility serialization, second snapshot type, platform persistence, alternate layouts, multi-step Undo, snow, cracked ice, or compatibility layer is planned.
