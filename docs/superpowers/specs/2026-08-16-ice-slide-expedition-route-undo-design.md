# Ice Slide Expedition Route Choices and Undo — Design

- **Date:** 2026-08-16
- **Status:** Proposed for HPA-491 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-491 — Add Expedition Safe/Risky choices and Undo charges
- **Foundation:** HPA-490 is complete on `main`

## 1. Summary

HPA-491 adds two Expedition-only decisions:

- after stage 2, choose **Safe Cache** or **Risk Protocol** for stage 3;
- after stage 4, choose the same two options for stage 5.

Safe grants one Undo charge and keeps the next stage at `1.00×`. Risk grants no charge, adds one additional seeded eligible bonus objective to the already-materialized next stage, and applies `1.25×` to that stage subtotal after objective bonuses, rounded down once.

Keep the implementation local to existing Ice Slide seams. Do not regenerate boards from the route overlay. `IceSlideGame` owns the pending-choice token, route history, charge counters, and one private pre-move Undo snapshot. `init.ts` owns overlay/HUD presentation. No ability registry, progression system, DB/API/leaderboard work, alternate route layouts, snow, cracked ice, or compatibility layer is needed.

## 2. Existing seams to reuse

Reuse directly:

- `src/lib/games/ice-slide/generator.ts`
  - `createIceSlideExpeditionStage()`;
  - 64 candidate attempts;
  - 10,000-state solver cap;
  - deterministic fallbacks and labeled seeded RNG.
- `src/lib/games/ice-slide/expedition.ts`
  - complete six-stage materialization;
  - fixed `easy, easy, medium, medium, hard, hard` sequence.
- `src/lib/games/ice-slide/run.ts`
  - `cloneIceSlideRunDefinition()`;
  - `createIceSlideStageSignature()`;
  - `assertValidIceSlideRunDefinition()`;
  - stage validation already accepts multiple unique `objectiveIds` and `scoreMultiplierBps` from `1000` through `50000`.
- `src/lib/games/ice-slide/game.ts`
  - authoritative committed-move boundary in `move()`;
  - `loadLevel()` as the state-reconstruction choke point;
  - `runMetadata()` as the run identity/signature synchronization helper;
  - stage progression, resets, counters, score, and game-data reporting.
- `src/lib/games/ice-slide/objectives.ts` / `quality.ts`
  - objective completion and current objective-feasibility policy.
- `src/lib/games/ice-slide/daily.ts`
  - the same objective selection order currently duplicated from Expedition generation.
- `src/lib/games/ice-slide/init.ts`
  - stage-clear overlay, input lock, retry run, renderer refresh, and cleanup.
- `src/pages/ice-slide/index.astro`
  - existing Expedition HUD/result surfaces and page-local action wiring.
- `scripts/validate-ice-slide-expedition.ts`
  - the 1,000-seed-per-tier content gate, already invoking real stage numbers `1..6`.
- `src/lib/games/ice-slide/generator.validation.test.ts`
  - the CI-sized wrapper over the same validation loop.
- `e2e/games/play-coverage.spec.ts`
  - pinned Expedition seeds and browser route helpers.

The stage model already has `objectiveIds: IceSlideObjectiveId[]` and `scoreMultiplierBps`; HPA-491 makes those existing fields fully meaningful rather than adding a run schema.

## 3. Approaches

### 3.1 Selected: metadata-only route effect + game-owned Undo

Generate Risk-capable stages up front, then apply a choice by cloning the base run and changing only target-stage metadata. Safe grants a charge. Risk adds one eligible objective, changes the multiplier, and resigns the stage.

Undo is one private pre-move snapshot in `IceSlideGame`. It is not a generic ability system or history stack.

### 3.2 Regenerate a route at choice time

Rejected. The route overlay must not choose another board, par, transform, or mutation. Generation remains complete before gameplay begins.

### 3.3 Serialize an objective-eligibility pool into the run

Rejected. There are only two Risk choices per run. Re-solving the already-materialized target board with the existing 10,000-state cap is simpler and avoids another serialized contract.

### 3.4 Generic ability/progression framework

Rejected. Two route choices and one consumable action do not justify inventory, effect registries, reducers, or cross-game machinery.

## 4. Fixed decisions

1. Route choices exist only in active Expedition gameplay.
2. Choices occur exactly after stages 2 and 4 and affect only stages 3 and 5.
3. Stage-clear feedback remains first; Continue then opens the route-choice overlay at those checkpoints.
4. Safe grants exactly one Undo charge and does not alter the target stage.
5. Risk grants zero charges, adds exactly one eligible objective, sets the exported `ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS = 12_500`, and recomputes the target signature.
6. Risk never changes rows, par, transform, mutation IDs, difficulty, stage ID, or stage order.
7. Risk scoring is `floor(rawStageSubtotal * ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS / 10_000)` after all objective bonuses.
8. Retry Seed starts from the captured base `retryRun`; it does not replay choices from the previous attempt.
9. The same seed plus the same choices reproduces objective arrays, multipliers, scores, and signatures.
10. Campaign and Daily expose neither route choices nor Undo.
11. `routeChoices` is chronological: index 0 is the stage-2 choice and index 1 is the stage-4 choice.
12. No separate persistence path is added; route/Undo data is additive to normal Expedition `gameData`.
13. Every implementation task that changes TypeScript contracts keeps the tree type-checkable before its commit.
14. The validation seed prefix `ice-slide:validate:v1:` is a stable corpus identifier, not the generator version; keep it unchanged while validating generator v2 against the same corpus.

## 5. Risk-capable generation

### 5.1 Stage number is the only knob

Risk requires a second eligible objective on stages 3 and 5. The invariant belongs inside `createIceSlideExpeditionStage()` because production run assembly, generator tests, and the content validator all call that seam.

Do not add `minEligibleObjectives` to the generator input. That input would exist only so tests could override behavior that production must never override.

Use the stage number directly:

```ts
const minEligibleObjectives =
    input.stageNumber === 3 || input.stageNumber === 5 ? 2 : 1
```

Candidate and fallback acceptance requires at least that many feasible objectives. An otherwise valid board with too few choices is rejected with the closed reason:

```ts
'insufficient_objective_options'
```

inside the existing 64-attempt/fallback flow.

A fallback with neither crystals nor hazards has only `no_reset` eligible. It remains valid for non-Risk stages but is skipped for stage 3/5. Keep a catalog assertion proving at least one Medium fallback and one Hard fallback is two-objective capable.

### 5.2 Objective order and feasibility reuse

Add one shared ordered constant in `objectives.ts`:

```ts
export const ICE_SLIDE_OBJECTIVE_IDS = [
    'collect_all_crystals',
    'no_falls',
    'no_reset',
] as const satisfies readonly IceSlideObjectiveId[]
```

Use it from both `generator.ts` and `daily.ts`. Their current arrays have identical values/order, so this extraction does not intentionally change Daily output or require a Daily generator-version bump.

Extract the feasibility calculation currently produced by `quality.ts` into a pure `getIceSlideObjectiveFeasibility()` helper. `quality.ts` still owns candidate acceptance and continues returning the complete `quality.objectiveFeasibility` record on accepted boards.

Keep `run.ts`'s `OBJECTIVE_RECORD`. It is not an RNG-order list: it provides exhaustive validator membership via `satisfies Record<IceSlideObjectiveId, true>`. Removing it just to share the selection array would weaken that compile-time check.

### 5.3 Validation path

There is no separate `validation.ts` module. Frozen/content validation is owned by:

- `src/lib/games/ice-slide/generator.test.ts`;
- `src/lib/games/ice-slide/generator.validation.test.ts`;
- `scripts/validate-ice-slide-expedition.ts`.

The validation script already uses Medium stage numbers `[3, 4]` and Hard `[5, 6]`, so it automatically exercises the stage-number invariant.

The script already calls `validateIceSlideStageQuality()` during its independent assertion path. For stage 3/5, count eligible IDs directly from the accepted `quality.objectiveFeasibility` record. Do not run a second solver/helper pass.

Keep the validation seed prefix `ice-slide:validate:v1:` unchanged. The corpus is the control; generator v2 is the variable being revalidated.

### 5.4 Versioning

HPA-491 deliberately changes Expedition output and Expedition scoring/rule meaning:

- bump `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION` from `1` to `2`;
- add `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2` for Expedition runs only;
- leave Campaign/Daily `ICE_SLIDE_RULESET_VERSION` unchanged.

The generator-version bump changes the existing generator RNG label and therefore can change all six generated stages for a seed, not only stages 3 and 5. That is acceptable. Replace generator-v1 frozen outputs with v2; do not add a compatibility branch.

## 6. Pure route effect

Add:

```ts
export type IceSlideExpeditionRouteChoice = 'safe' | 'risky'
export type IceSlideExpeditionChoiceStage = 2 | 4

export const ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS = 12_500

export interface IceSlideExpeditionRouteEffect {
    run: IceSlideRunDefinition
    undoChargesGranted: number
}

export function applyIceSlideExpeditionRouteChoice(
    run: IceSlideRunDefinition,
    afterStageNumber: IceSlideExpeditionChoiceStage,
    choice: IceSlideExpeditionRouteChoice
): IceSlideExpeditionRouteEffect
```

The helper:

1. requires a valid Expedition run with a non-null seed;
2. clones with `cloneIceSlideRunDefinition()` and never mutates the caller;
3. uses `const targetIndex = afterStageNumber`; because the choice is after one-based stage N, the next stage is zero-based array index N (`2 -> stage 3`, `4 -> stage 5`);
4. Safe returns the clone with one granted charge;
5. Risk solves the target board using `ICE_SLIDE_EXPEDITION_SOLVER_MAX_STATES`, derives eligible objectives, removes already-active objectives, and picks one remaining ID from a labeled RNG fork;
6. appends the objective, sets `ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS`, recomputes the signature with `createIceSlideStageSignature()`, and validates with `assertValidIceSlideRunDefinition()`;
7. returns zero granted charges for Risk.

Tests should address the target as `run.stages[afterStageNumber]` rather than duplicating a `2 ? 2 : 4` mapping.

The run key stays the base seed/version identity. Player choices and resulting stage signatures live in game data.

## 7. Multi-objective scoring and result contract

The current runtime consumes only the first objective. HPA-491 changes the existing array contract into real multi-objective behavior.

Change:

```ts
stars.bonus
```

to:

```ts
stars.bonuses: Array<{
    id: IceSlideObjectiveId
    earned: boolean
}>
```

This is an atomic contract rename: every TypeScript call site, including `init.ts`, tests, and direct fixtures, changes in the same implementation task. The first commit that introduces `bonuses` must still type-check. Rich “Risk Bonus” copy remains a later UI task; the contract task only preserves the existing one-bonus presentation while updating the data shape.

For objective modes:

- Clear contributes one star.
- Efficient contributes one star when earned.
- Every active bonus objective contributes one earned star when satisfied.
- Daily remains one-bonus behavior.
- A Risk target stage can have four possible stars.

Extend `levelScore()` with optional `scoreMultiplierBps`, defaulting to `10_000`; compute the current subtotal first, then multiply and floor once.

Derive `starsPossible` from the active objective-mode run:

```ts
sum(2 + stage.objectiveIds.length)
```

Do not hard-code `stagesTotal * 3` after Risk exists.

## 8. Game-owned route lifecycle

Add Expedition run state:

```ts
pendingRouteChoiceAfterStage: 2 | 4 | null
routeChoices: IceSlideExpeditionRouteChoice[]
undoChargesAvailable: number
undoChargesUsed: number
starsPossible: number
```

After clearing Expedition stage 2 or 4:

1. load the already-materialized next stage through `loadLevel()`;
2. only after that reconstruction, set `pendingRouteChoiceAfterStage` to the stage just cleared;
3. invoke the existing level-clear callback.

While a choice is pending, `move()` and `resetLevel()` are no-ops at the game layer.

### 8.1 Preserve-run contract

`loadLevel()` rebuilds `this.state` wholesale. Therefore route/charge state joins the existing preserve-run bag exactly like score/stars/falls/resets:

- clone/preserve `routeChoices`;
- preserve `undoChargesAvailable`;
- preserve `undoChargesUsed`.

Do not preserve `starsPossible` as a stored bag value; recompute it from `activeRun`. Do not preserve a pending choice through reconstruction; the checkpoint token is set explicitly after loading the target stage.

A Safe charge must survive a stage-3 hazard/reset and remain available when the player reaches stage 4 if unused. The stage-4 route gate must still see the prior `routeChoices` entry.

### 8.2 Choice application

Add:

```ts
chooseExpeditionRoute(choice: IceSlideExpeditionRouteChoice): boolean
```

It succeeds only when mode/status/pending token/prior-choice count match. On success it applies the pure route effect, replaces `activeRun`, synchronizes current `objectiveIds`, and refreshes all run metadata in one place:

```ts
Object.assign(this.state, this.runMetadata())
```

Then recompute `starsPossible`, grant any Safe charge, record the choice, clear the pending token, and return `true`. Stale/double calls return `false` with no mutation.

Using `runMetadata()` avoids a second hand-built `stageSignatures` synchronization path.

## 9. Undo

Keep exactly one private snapshot in `game.ts`:

```ts
interface IceSlideUndoSnapshot {
    grid: CellType[][]
    player: GridPosition
    crystalsCollected: number
    levelCrystalsCollected: number
}
```

`levelFalls` and `levelResets` are intentionally absent. A normal committed move cannot change them. The only paths that change them are hazard/reset paths, and those invalidate the snapshot before Undo can run. Undo therefore does not “un-fall” or “un-reset” a stage.

Before `slide()` mutates the grid, clone the four fields. Then:

- noop: keep the prior snapshot;
- committed non-hazard move: replace the snapshot with the pre-move values;
- any call to `loadLevel()`: invalidate the snapshot first;
- `stop()` and `destroy()`: invalidate it explicitly.

Put:

```ts
this.undoSnapshot = null
```

at the top of `loadLevel()`. This single choke point covers start, manual Reset, hazard reset, and non-final stage transition, plus any future path that rebuilds a level. Do not duplicate invalidation at each caller.

`canUndo()` is true only for active Expedition play with no pending route choice, at least one charge, and a current-stage snapshot.

A successful Undo restores grid/player/crystal state, consumes one charge, increments used charges, clears the snapshot and `lastSlidePath`, and deliberately leaves total/stage move counters, time, score, route choices, falls/resets, and run metadata untouched.

HPA-493 may later extend this same private snapshot with fragile/collapsed state. HPA-491 does not introduce a second snapshot type or dynamic-state abstraction.

## 10. Game data

Additive fields:

```ts
routeChoices: IceSlideExpeditionRouteChoice[]
undoChargesAvailable: number
undoChargesUsed: number
starsPossible: number
stageObjectiveIds: IceSlideObjectiveId[][]
stageScoreMultipliersBps: number[]
```

`stageSignatures` already reports resulting signatures and is refreshed through `runMetadata()` after Risk.

Campaign/Daily report empty/zero route/Undo values. Existing persistence and leaderboard behavior is unchanged.

## 11. Browser UI

### 11.1 Route choice

Add one page-local hidden overlay with native buttons:

- `#expedition-safe-btn` — Safe Cache — “Gain 1 Undo charge · next stage ×1.00”
- `#expedition-risk-btn` — Risk Protocol — extra bonus objective plus a multiplier label derived from `ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS`.

Do not hand-write a second `×1.25` source. `index.astro` may import the constant in frontmatter and derive the display value at build time.

Continue after stage 2/4 hides the stage-clear overlay but keeps input locked, shows the choice overlay, and focuses Safe. A valid choice hides the overlay, refreshes HUD/rendering, unlocks input, and does not regenerate the board.

Failure, cleanup, restart, End, and Change Mode hide the route overlay.

### 11.2 Undo button

Add `#expedition-undo-btn` inside `#expedition-meta`. It shows the available charge count and is disabled unless `game.canUndo()` is true. Do not fork `GameControls`.

### 11.3 Objective/result copy and star ceiling

The later UI task expands the mechanically-updated `stars.bonuses` contract into deterministic multi-objective copy: original Bonus plus Risk Bonus. HUD/current objectives use stable array order.

Both runtime HUD/summary code and static Astro markup stop assuming `18` stars. Use `starsPossible` at runtime and make the static `#expedition-stars` placeholder non-authoritative, e.g. `Stars 0 / —`, until `syncHud()` fills the real ceiling.

## 12. Error handling

- Too few eligible objectives rejects a stage 3/5 candidate/fallback inside the existing bounded generator.
- If all candidates/fallbacks fail, run materialization uses the existing failure path; there is no weaker Risk mode.
- Risk re-solves the target board and throws on solver truncation/unsolvable/no remaining eligible objective as an invariant failure.
- Stale/double choices return `false`.
- Invalid Undo returns `false`.
- Score-submission failure does not invalidate a local result.

## 13. Testing

### Generator/content

- stage 3/5 require two eligible objectives without a caller option;
- stage 4/6 exercise the ordinary one-objective path;
- insufficient candidate/fallback options are rejected deterministically;
- at least one Medium and Hard fallback is Risk-capable;
- `generator.validation.test.ts` and the 1,000-seed script exercise real stage numbers;
- the validator counts eligible objectives from `quality.objectiveFeasibility` and does not re-solve;
- the `ice-slide:validate:v1:` corpus prefix stays fixed;
- v2 deterministic outputs replace v1 with no compatibility path.

### Route/scoring

- Safe leaves target metadata unchanged and grants one charge;
- Risk adds one unique eligible objective, uses `ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS`, resigns, and is deterministic;
- route target indexing uses `afterStageNumber` directly;
- multiple bonus objectives are evaluated/scored;
- multiplier is applied after bonuses and floored once;
- Daily remains one-bonus/1.00× behavior;
- `stars.bonus -> stars.bonuses` updates all TypeScript consumers atomically.

### Lifecycle/Undo

- exact pending checkpoints after stage 2/4;
- movement/reset gating while pending;
- Safe -> stage-3 hazard/manual reset -> stage-3 clear preserves charge/history;
- second choice still succeeds after stage 4;
- `Object.assign(state, runMetadata())` refreshes resulting signatures after Risk;
- Undo restores ordinary/crystal moves while retaining move counters;
- noop preserves the prior snapshot;
- `loadLevel()` invalidates stale snapshots for reset/hazard/stage transition/start;
- stop/destroy invalidate explicitly;
- Campaign/Daily/zero-charge/pending/stopped/won states cannot Undo.

### Browser

- stage-clear Continue -> choice overlay sequencing;
- movement locked during choice;
- Safe -> move -> Undo retains move cost;
- Risk route metadata/signature reproduces on Retry Seed with the same choice;
- dynamic star ceiling replaces every runtime/static `/ 18` assumption;
- Campaign/Daily never expose route/Undo controls.

## 14. YAGNI boundaries

Do not add:

- `minEligibleObjectives` or another generator override whose only consumer is tests;
- an eligibility field/pool in the run schema;
- an ability/effect registry;
- multi-step Undo/history;
- a second Undo snapshot type;
- alternate generated layouts for route choices;
- DB/API/leaderboard changes;
- global Expedition ranking/history UI;
- snow/cracked-ice implementation;
- generator-v1 compatibility.

## 15. Review resolution

The latest review is incorporated with two intentional simplifications:

- F1–F6 and F8–F9 are accepted.
- F7 is accepted for the two true objective-order arrays (`generator.ts` and `daily.ts`). `run.ts::OBJECTIVE_RECORD` remains because its purpose is exhaustive membership validation, not seeded selection order.
- The requested checkpoint-to-target mapping centralization is satisfied without a new API: `targetIndex = afterStageNumber` is the mapping, and tests address `run.stages[afterStageNumber]` directly.
