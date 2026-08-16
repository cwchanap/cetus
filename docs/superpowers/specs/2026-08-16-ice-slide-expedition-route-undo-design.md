# Ice Slide Expedition Route Choices and Undo — Design

- **Date:** 2026-08-16
- **Status:** Proposed for HPA-491 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-491 — Add Expedition Safe/Risky choices and Undo charges
- **Foundation:** HPA-490 is complete on `main`

## 1. Summary

HPA-491 is the next actionable Ice Slide replayability task. HPA-490 now ships a complete six-stage seeded Expedition and HPA-491 is blocked only by that completed work. HPA-491 also establishes the Undo snapshot contract required by HPA-493, while HPA-492 can proceed independently.

Add two run decisions to Expedition only:

- after stage 2, choose **Safe Cache** or **Risk Protocol** for stage 3;
- after stage 4, choose the same two options for stage 5.

Safe Cache grants one Undo charge and leaves the next stage at `1.00×`. Risk Protocol grants no charge, adds one additional seeded eligible bonus objective to the next stage, and applies `1.25×` to that complete stage subtotal, rounded down.

Keep the implementation local to the current Ice Slide seams. Generation remains bounded and deterministic; route effects mutate only the already-materialized next-stage metadata, not its board or par. `IceSlideGame` owns pending choices, charges, and the one-move Undo snapshot. `init.ts` owns the route-choice overlay and input locking. No ability framework, progression system, database/API change, or new renderer subsystem is needed.

## 2. Existing seams to reuse

Reuse directly:

- `src/lib/games/ice-slide/expedition.ts`
  - pure six-stage run materialization;
  - fixed `easy, easy, medium, medium, hard, hard` sequence;
  - Expedition run-key construction.
- `src/lib/games/ice-slide/generator.ts`
  - bounded 64-attempt stage generation;
  - production quality/solver validation;
  - deterministic fallbacks and labeled seeded RNG.
- `src/lib/games/ice-slide/run.ts`
  - deep run cloning;
  - run validation;
  - stage signature creation already including sorted objectives and `scoreMultiplierBps`.
- `src/lib/games/ice-slide/game.ts`
  - authoritative committed-move boundary;
  - stage progression, counters, scoring, resets, and game-data reporting.
- `src/lib/games/ice-slide/objectives.ts` and `quality.ts`
  - existing objective completion and feasibility facts.
- `src/lib/games/ice-slide/init.ts`
  - stage-clear overlay, input lock, retry identity, renderer refresh, and cleanup.
- `src/pages/ice-slide/index.astro`
  - existing Expedition HUD/result surface and page-local action wiring.
- `e2e/games/play-coverage.spec.ts`
  - deterministic Expedition seeds and generated-stage route helper already used by browser coverage.

The stage contract already has `objectiveIds: IceSlideObjectiveId[]` and `scoreMultiplierBps`, so HPA-491 does not need a new run schema.

## 3. Approaches considered

### 3.1 Recommended: pure route effect + game-owned Undo

Extend the current stage generator with one optional minimum-eligible-objective constraint, then add a pure Expedition route-effect function. The game records the player's choice and applies the returned stage metadata before the first move of the target stage. Undo snapshots live inside `IceSlideGame` at the same boundary that currently decides whether a slide is a noop, hazard, or committed move.

This keeps deterministic content, gameplay state, and browser UI separate while adding only the APIs HPA-491 needs.

### 3.2 Re-run or mutate generation from the route overlay

Rejected. `init.ts` should not know generator internals, and a route choice must never branch to a different board. The route effect is metadata-only.

### 3.3 Generic ability/progression framework

Rejected. Two route decisions and one consumable action do not justify inventory, effect registries, reducers, or a cross-game ability system. HPA-493 can extend the private Undo snapshot when cracked-ice state arrives.

## 4. Fixed product and architecture decisions

1. Route choices exist only in active Expedition gameplay.
2. Choices occur exactly after stages 2 and 4 and affect only stages 3 and 5 respectively.
3. Stage-clear feedback remains first. Pressing **Continue** after stage 2 or 4 opens the route-choice overlay instead of immediately unlocking movement.
4. **Safe Cache** grants exactly one Undo charge and does not otherwise mutate the target stage.
5. **Risk Protocol** grants zero charges, adds exactly one additional eligible objective, sets the target stage multiplier to `12_500` basis points, and recomputes that stage signature.
6. Risk never changes rows, par, transform, mutation IDs, difficulty, or stage identity.
7. The Risk multiplier applies after all stage objective bonuses: `floor(rawStageSubtotal * 12_500 / 10_000)`.
8. A route choice is represented by `IceSlideExpeditionRouteChoice = 'safe' | 'risky'`.
9. `routeChoices` in game data is chronological: index 0 is the stage-2 decision and index 1 is the stage-4 decision. Partial runs may contain zero or one entries.
10. The same seed plus the same choices reproduces the same final objective arrays, multipliers, scores, and stage signatures.
11. Retry Seed starts from the captured base run again; it does not pre-apply the previous attempt's choices.
12. Campaign and Daily expose neither route choices nor Undo.
13. No route choice is persisted separately from normal Expedition `gameData`; current contextual score persistence remains sufficient.
14. There is no cross-seed Expedition ranking or balance calibration in this task.

## 5. Risk-capable deterministic generation

### 5.1 Why generation needs one small extension

Risk Protocol requires a second **eligible** objective. HPA-489 currently guarantees only that an accepted stage has at least one eligible objective. Discovering after stage 2 or 4 that the already-materialized next stage has no second objective would make the route overlay impossible to satisfy.

Extend `createIceSlideExpeditionStage()` with:

```ts
minEligibleObjectives?: number
```

Behavior:

- default remains `1`;
- valid values are integers from `1` through the current objective count;
- candidate and fallback acceptance requires at least that many feasible objectives;
- insufficient candidates use a closed rejection reason such as `insufficient_objective_options` and remain inside the existing 64-attempt/fallback flow.

`createIceSlideExpeditionRunDefinition()` passes `minEligibleObjectives: 2` only for stage numbers 3 and 5. Other stages use the current default.

At least one checked-in Medium fallback and one checked-in Hard fallback must satisfy the two-objective requirement. Catalog/content tests prove this rather than adding another fallback subsystem.

### 5.2 Objective feasibility reuse

Move the existing objective-order/feasibility calculation behind one pure reusable helper in `objectives.ts`. `quality.ts` continues to own stage acceptance; `expedition.ts` may solve the already-materialized target stage at route-choice application time and reuse the same feasibility helper to select the extra objective.

There are only two route choices per run, so a bounded 10,000-state solve at choice application is simpler than serializing an additional hidden eligibility pool into the run contract.

### 5.3 Versioning

HPA-491 intentionally breaks previous Expedition seed output and Expedition score/rule meaning without compatibility machinery:

- increment `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION` from `1` to `2`, because stages 3 and 5 now have an additional generation acceptance constraint;
- add `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2` for Expedition runs, because route multipliers and Undo change Expedition rules;
- keep the shared Campaign/Daily `ICE_SLIDE_RULESET_VERSION` unchanged so HPA-491 does not rotate Daily competition keys or Campaign identity.

The Expedition run key therefore becomes `g2:r2` for newly materialized runs. Existing generator-v1 test goldens are replaced; no compatibility adapter is retained.

## 6. Pure route-effect contract

Add to `expedition.ts`:

```ts
export type IceSlideExpeditionRouteChoice = 'safe' | 'risky'
export type IceSlideExpeditionChoiceStage = 2 | 4

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
2. clones the input run and never mutates the caller's object;
3. maps `2 -> stage index 2` and `4 -> stage index 4`;
4. for Safe, returns the cloned run unchanged with `undoChargesGranted: 1`;
5. for Risk, solves the target board with the existing Expedition solver cap, derives the shared eligible-objective list, removes already-active objectives, and deterministically picks one remaining ID from a labeled RNG fork using the run seed/version and cleared-stage number;
6. appends that objective, sets `scoreMultiplierBps = 12_500`, recomputes `signature`, and validates the resulting run;
7. returns `undoChargesGranted: 0`.

The choice does not alter `runKey`: the key identifies the base seed plus generator/ruleset versions, while player choices and resulting stage signatures live in game data.

## 7. Multi-objective scoring and stars

The current runtime only evaluates `objectiveIds[0]`. HPA-491 makes the existing array contract real.

Change the stage-clear result to expose all bonus results:

```ts
bonuses: Array<{
    id: IceSlideObjectiveId
    earned: boolean
}>
```

For objective modes:

- Clear contributes one star.
- Efficient contributes one star when earned.
- Every active bonus objective contributes one star when earned.
- Daily still has one bonus objective, so its visible behavior remains equivalent.
- A Risk target stage can have four possible stars: Clear, Efficient, original Bonus, Risk Bonus.

Extend `levelScore()` with optional `scoreMultiplierBps`, defaulting to `10_000`. Compute the existing raw subtotal first, then apply and floor the multiplier once.

Add `starsPossible` to state/game data and derive it from the active run as:

```ts
sum(2 + stage.objectiveIds.length)
```

for Daily/Expedition. Campaign can remain `0` because it does not use the star model. Recompute it after a Risk route effect changes the active run.

## 8. Game-owned route lifecycle

Add Expedition-only state:

```ts
pendingRouteChoiceAfterStage: 2 | 4 | null
routeChoices: IceSlideExpeditionRouteChoice[]
undoChargesAvailable: number
undoChargesUsed: number
starsPossible: number
```

After clearing Expedition stage 2 or 4:

1. load the already-materialized next stage through the existing `loadLevel()` path;
2. set `pendingRouteChoiceAfterStage` to the stage just cleared;
3. invoke the existing level-clear callback.

While a route choice is pending, `move()` and `resetLevel()` are no-ops at the game layer, even if a stale browser handler fires.

Add:

```ts
chooseExpeditionRoute(choice: IceSlideExpeditionRouteChoice): boolean
```

It succeeds only when all are true:

- mode is Expedition;
- status is `playing`;
- `pendingRouteChoiceAfterStage` is `2` or `4`;
- the number of prior choices matches that checkpoint.

On success it applies the pure route effect to `activeRun`, synchronizes the current state's objective IDs/stage signatures/star ceiling, grants any Safe charge, records the choice, clears the pending token, and returns `true`. A stale/double call returns `false` and changes nothing.

## 9. Undo contract

Keep a single private snapshot in `IceSlideGame`; do not add an inventory or history stack.

```ts
interface IceSlideUndoSnapshot {
    grid: CellType[][]
    player: GridPosition
    crystalsCollected: number
    levelCrystalsCollected: number
    levelFalls: number
    levelResets: number
}
```

Before resolving a direction, clone these pre-move values. Then:

- noop: keep the previous eligible snapshot unchanged because no move committed;
- normal non-hazard move: replace the snapshot with the pre-move snapshot;
- hazard: discard the snapshot;
- stage transition, manual Reset, start, stop, and cleanup: discard the snapshot.

Add:

```ts
canUndo(): boolean
undo(): boolean
```

Undo is allowed only when:

- mode is Expedition;
- status is `playing`;
- no route choice is pending;
- at least one charge is available;
- a snapshot from the current stage exists.

A successful Undo:

1. restores the cloned grid, player, crystal totals, and objective-relevant attempt fields;
2. consumes one available charge and increments `undoChargesUsed`;
3. clears the snapshot so another Undo requires another committed move;
4. clears `lastSlidePath`;
5. deliberately leaves total/stage move counters, elapsed time, route choices, and score untouched.

Restoring the grid also restores crystals consumed by the undone move. HPA-493 will extend this private snapshot with fragile/collapsed state; HPA-491 does not create a generic dynamic-state abstraction in advance.

## 10. Game data

Make the following additive fields explicit on `IceSlideGameData`:

```ts
routeChoices: IceSlideExpeditionRouteChoice[]
undoChargesAvailable: number
undoChargesUsed: number
starsPossible: number
stageObjectiveIds: IceSlideObjectiveId[][]
stageScoreMultipliersBps: number[]
```

`stageSignatures` already reports the resulting signatures and is refreshed after a Risk choice.

Campaign and Daily report empty/zero route/Undo values; their current score submission paths remain unchanged. Expedition completion and positive-score partial End continue through the existing contextual submission path.

## 11. Browser UI and accessibility

### 11.1 Route-choice overlay

Add a page-local `#expedition-route-choice-overlay` inside the game-board surface with two native buttons:

- `#expedition-safe-btn` — **Safe Cache** — “Gain 1 Undo charge · next stage ×1.00”
- `#expedition-risk-btn` — **Risk Protocol** — “Extra bonus objective · next stage ×1.25”

The stage-clear overlay remains first. `Continue` behaves as follows:

- normal non-final objective stage: hide stage clear and unlock input;
- Expedition stage 2/4: hide stage clear, keep input locked, show route choice, focus Safe Cache.

Choosing a valid route hides the overlay, refreshes HUD/board state, unlocks input, and focuses the game surface when appropriate. Choice buttons are real buttons and therefore keyboard/touch accessible. No timed auto-selection or animation delay is added; reduced-motion behavior is naturally unchanged.

`failRun()`, `cleanup()`, run restart, End, and Change Mode hide the route overlay and clear its UI lock.

### 11.2 Undo control

Keep Undo local to the Expedition HUD instead of replacing the shared `GameControls` component. Add:

```text
#expedition-undo-btn
```

The button displays the current charge count and is disabled unless `game.canUndo()` is true. Clicking it calls the handle's `undo()`, then re-renders and syncs HUD. Campaign/Daily never show the Expedition HUD and therefore never expose the control.

### 11.3 Objective/result copy

The HUD and stage-clear/final result surfaces render every bonus objective/result, not only `objectiveIds[0]`. Daily still renders one Bonus row. Risk stages render the original Bonus plus one Risk Bonus row. Expedition star totals use `starsPossible` rather than `stagesTotal * 3`.

## 12. Error handling

- A generated stage that cannot satisfy its configured minimum eligible-objective count is rejected inside the existing bounded attempt flow.
- If every candidate and checked-in fallback fails, run materialization throws through the existing `failRun()` path; there is no weaker Risk mode.
- A Risk route effect unexpectedly finding no remaining eligible objective throws as an invariant violation and ends through the existing player-safe failure path.
- Stale or double route-button handlers return `false` and do not apply effects twice.
- Undo with no charge/snapshot, after a hazard/reset, outside Expedition, or during a choice returns `false` and changes nothing.
- Score-submission failure does not invalidate the local run, unchanged from HPA-490.

## 13. Testing strategy

### 13.1 Generator and route-effect tests

Cover:

- `minEligibleObjectives` validation/default behavior;
- candidate and fallback rejection for insufficient objective options;
- route-target stages 3 and 5 always expose at least two eligible objectives over the deterministic complete-run sweep;
- Medium and Hard fallback pools contain at least one route-capable fallback;
- generator-v2 deterministic goldens;
- Safe leaves stage metadata at `1.00×` and grants one charge;
- Risk adds one non-duplicate eligible objective, uses `12_500`, changes the stage signature, and grants no charge;
- same seed + same route calls deep-equal;
- source run is never mutated.

### 13.2 Scoring/game tests

Cover:

- multiple bonus objectives are evaluated independently;
- multiplier is applied after objective bonuses and floored once;
- Daily one-bonus scoring remains unchanged;
- stage 2/4 sets the exact pending token;
- move/reset cannot pass a pending choice;
- stale/double choices are rejected;
- Safe charge accumulation and Risk metadata synchronization;
- game data records choices, charges, objective arrays, multipliers, stars possible, and resulting signatures.

### 13.3 Undo tests

Cover:

- ordinary move restoration;
- crystal collection restores both grid and crystal counters;
- move counters do not decrement;
- no-op does not destroy the previous eligible snapshot;
- hazard/manual Reset clears Undo eligibility;
- zero-charge, Campaign, Daily, pending-choice, and ended-run calls fail closed;
- Undo consumes one charge and cannot be chained without another committed move;
- stage clear cannot be undone across the transition.

### 13.4 UI/E2E

Extend existing Ice Slide browser coverage with the pinned Expedition seed:

1. clear stages 1 and 2;
2. verify stage-clear Continue opens the route choice and movement remains blocked;
3. select Safe with the button/keyboard path;
4. make one normal stage-3 move, use Undo, and verify position/grid restoration while move count stays charged;
5. verify button charge/disabled state;
6. separately prove Risk adds a second objective and `1.25×` metadata for the deterministic target stage;
7. retry the seed, make the same choice, and compare resulting stage objective IDs/multiplier/signature;
8. verify Campaign/Daily have no visible route choice or Undo control.

Keep static DOM-ID coverage in `src/pages/game-board-markup.test.ts`.

## 14. YAGNI boundaries

Do not add:

- a generic ability/effect/inventory framework;
- permanent progression or saved consumables;
- branching/generated alternate layouts after a choice;
- more than one-step Undo history;
- DB schema, API, score-service, or leaderboard changes;
- seed sharing/input/history UI;
- global Expedition ranking;
- snow or cracked-ice behavior;
- a generalized dynamic-tile snapshot abstraction before HPA-493;
- compatibility code for generator-v1 Expedition seeds.

## 15. Spec self-review

- **Placeholder scan:** no TBD/TODO or deferred requirement remains inside HPA-491 scope.
- **Consistency:** route choices affect only stages 3/5; Safe only grants Undo; Risk only adds one objective plus the documented multiplier; Retry starts from the base materialized run again.
- **Determinism:** Risk target stages are generated with two eligible objectives up front, and the second objective is selected from the final board using a labeled seed fork.
- **Scope:** no HPA-492/HPA-493 mechanic or platform persistence change is pulled forward.
- **Future seam:** HPA-493 can extend the private Undo snapshot directly without replacing HPA-491 architecture.
