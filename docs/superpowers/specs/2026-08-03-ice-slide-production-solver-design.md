# Ice Slide Production Solver and Stage Quality Validation — Design

- **Date:** 2026-08-03
- **Status:** Draft for review
- **Repository:** `cwchanap/cetus`
- **Linear issue:** [HPA-486 — Extract the Ice Slide production solver and generation quality validator](https://linear.app/cwchanap/issue/HPA-486/extract-the-ice-slide-production-solver-and-generation-quality)
- **Depends on:** HPA-485, completed in PR #53

## 1. Summary

Ice Slide currently proves Campaign solvability with two breadth-first searches embedded
inside `physics.test.ts`: one computes minimum moves and another checks authored crystal
reachability. HPA-486 extracts that traversal into pure bounded production code and adds
the stage-quality validator explicitly required by the ticket.

The implementation remains limited to two modules:

1. `solver.ts` performs bounded BFS over player position and consumed-crystal state.
2. `quality.ts` converts solver facts plus board policy into deterministic candidate
   acceptance or rejection.

No generation loop, retry policy, runtime solver hook, path output, or future tile-state
framework is included.

## 2. Why `quality.ts` Remains in Scope

`quality.ts` has no current runtime caller, but it is not an anticipatory extra: HPA-486
explicitly requires a pure stage-quality validator covering exact start/goal structure,
goal reachability, par bands, objective feasibility, required-crystal reachability, and
canonical duplicate detection. HPA-486 also blocks the Daily and Expedition work that
will consume it.

Removing the validator would change the approved ticket rather than simplify its
implementation. The API is therefore kept narrow and policy-focused, with six rejection
codes and no generator-specific retry or aggregation behavior.

## 3. Goals

1. Provide deterministic bounded BFS for current Ice Slide physics.
2. Return the ticket-required search facts: solvability, minimum moves, reachable stop
   count, reachable crystal IDs, explored-state count, and truncation.
3. Distinguish states by player position and consumed-crystal mask.
4. Preserve all eight Campaign pars and authored crystal guarantees.
5. Provide a pure quality gate for later generated candidates.
6. Keep gameplay, run contracts, renderer, score, database, and UI unchanged.

## 4. Non-goals

- Daily or Expedition generation loops, retries, fallbacks, or diagnostics aggregation.
- Mutation templates or difficulty calibration.
- Runtime solver calls from `game.ts`, `run.ts`, `init.ts`, or the renderer.
- Objective progress tracking during gameplay.
- Solution paths, hints, A*, or a reusable graph-search package.
- Snow, cracked ice, collapsed-tile state, Undo, or abilities.
- Solver caching, workers, compact encodings, or cross-board memoization.

## 5. File Scope

Create:

- `src/lib/games/ice-slide/solver.ts`
- `src/lib/games/ice-slide/solver.test.ts`
- `src/lib/games/ice-slide/quality.ts`
- `src/lib/games/ice-slide/quality.test.ts`

Modify:

- `src/lib/games/ice-slide/physics.test.ts`

No production gameplay or platform file changes are part of HPA-486.

## 6. Solver Contract

```ts
export interface IceSlideSolverLimits {
    maxStates: number
}

export interface IceSlideSolveResult {
    solvable: boolean
    minMoves: number | null
    reachableStopCount: number
    reachableCrystalIds: string[]
    reachedGoalWithAllCrystals: boolean
    exploredStates: number
    truncated: boolean
}

export function solveIceSlideBoard(
    source: IceSlideGridSource,
    limits: IceSlideSolverLimits
): IceSlideSolveResult
```

The solver returns search facts only. It does not import or return
`IceSlideObjectiveId`, so adding future gameplay objectives does not change the search
API.

`reachableCrystalIds` uses deterministic zero-based `"row,col"` coordinate IDs.

### 6.1 Preconditions

Direct calls require:

- a non-empty rectangular board with at least one column and known glyphs;
- exactly one start and one goal;
- no more than 30 crystals;
- `maxStates` as a positive safe integer.

Invalid input throws. The 30-crystal limit is an internal implementation invariant for a
positive JavaScript `number` bitmask; it is not exported as product API. Current Campaign
content has at most two crystals.

### 6.2 Search State

```ts
interface SolverState {
    position: GridPosition
    moves: number
    crystalMask: number
    grid: CellType[][]
}
```

Crystals receive row-major indexes. The visited key is:

```text
player row + player column + consumed-crystal mask
```

The grid remains in each queued state because `slide()` mutates collected crystal cells.
Reconstructing a grid from the base board and mask would add conversion logic without a
current performance need. The mask is still the canonical mutable-state component of the
visited key.

A private `encodeStateKey()` is sufficient for later dynamic-tile work to extend when
that physics exists.

### 6.3 Traversal

The solver:

1. parses and scans the board once;
2. converts the start cell in its working grid to ice;
3. explores directions in stable `N`, `E`, `S`, `W` order;
4. uses `slide()` as the only movement transition;
5. skips `noop` and `hazard` outcomes;
6. clones the current state's grid before each attempted slide;
7. updates the mask from crystals crossed in `outcome.path`;
8. admits unseen `(position, mask)` states while below `maxStates`;
9. records goal states but does not expand them;
10. continues after the first goal so crystal and stop analysis is complete unless the
    cap truncates the search.

Use an array plus queue cursor rather than repeated `shift()`.

### 6.4 Complete Result Semantics

For a fully explored search:

- `solvable` is true exactly when a goal was reached;
- `minMoves` is the first goal depth or `null`;
- `reachableStopCount` counts unique stop coordinates, including start and goal;
- `reachableCrystalIds` is row-major and includes crystals crossed on accepted
  non-hazard slides;
- `reachedGoalWithAllCrystals` is true when any goal state consumed every authored
  crystal; it is false for a board with no crystals;
- `exploredStates` is the number of unique `(position, mask)` states admitted;
- `truncated` is false.

`reachedGoalWithAllCrystals` is the only objective-related search fact. All assignment
and eligibility policy stays in `quality.ts`.

### 6.5 Truncation

When admitting another unseen state would exceed `maxStates`, return:

```ts
{
    solvable: false,
    minMoves: null,
    truncated: true,
    // already observed stop/crystal diagnostics retained
}
```

A truncated result makes no solvability or par claim, even if a goal was encountered
before the cap. This avoids contradictory partial results and keeps the only supported
consumer behavior simple: quality validation rejects every truncated result first.

`exploredStates` never exceeds `maxStates`.

## 7. Quality Contract

```ts
export interface IceSlideStageQualityCandidate
    extends IceSlideGridSource {
    objectiveIds: readonly IceSlideObjectiveId[]
}

export interface IceSlideStageQualityConstraints {
    parBand: {
        minMoves: number
        maxMoves: number
    }
    maxStates: number
    existingCanonicalKeys?: ReadonlySet<string>
}

export type IceSlideStageRejectionReason =
    | 'invalid_board'
    | 'duplicate_board'
    | 'solver_truncated'
    | 'unsolvable'
    | 'par_out_of_band'
    | 'objective_infeasible'

export type IceSlideObjectiveFeasibility = Record<
    IceSlideObjectiveId,
    boolean
>

export type IceSlideStageQualityResult =
    | {
          accepted: true
          parMoves: number
          canonicalKey: string
          objectiveFeasibility: IceSlideObjectiveFeasibility
          solveResult: IceSlideSolveResult
      }
    | {
          accepted: false
          reason: IceSlideStageRejectionReason
          message: string
          canonicalKey?: string
          solveResult?: IceSlideSolveResult
      }

export function validateIceSlideStageQuality(
    candidate: IceSlideStageQualityCandidate,
    constraints: IceSlideStageQualityConstraints
): IceSlideStageQualityResult
```

`existingCanonicalKeys` remains because canonical duplicate detection is an explicit
HPA-486 requirement. The validator only checks membership; run-local set ownership and
retry behavior stay with the future generator.

### 7.1 Configuration Errors

Invalid validator configuration throws `RangeError`:

- `maxStates`, `minMoves`, or `maxMoves` is not a positive safe integer;
- `minMoves > maxMoves`.

Candidate-content failures return `accepted: false`.

### 7.2 Validation Order

1. Validate constraints.
2. Call `serializeBoardRows(candidate.rows)` inside a try/catch; invalid shape returns
   `invalid_board`.
3. Reject an exact canonical key present in `existingCanonicalKeys` as
   `duplicate_board` before BFS.
4. Call `solveIceSlideBoard()` inside a try/catch; parser, glyph, crystal-ceiling, and
   exact start/goal errors map to `invalid_board`.
5. Reject `truncated` as `solver_truncated`.
6. Reject `solvable === false` as `unsolvable`.
7. Reject `minMoves` outside the inclusive band as `par_out_of_band`.
8. Derive objective feasibility and reject the first assigned false objective as
   `objective_infeasible`.
9. Return the computed par, canonical key, feasibility record, and solver result.

This removes duplicate start/goal parsing and message maintenance from `quality.ts`.
Shape-valid duplicate boards are rejected before exact start/goal validation, which is an
intentional cheap-first ordering for generated candidates.

### 7.3 Objective Policy

The quality layer derives the three initial contracts from solver facts and final-board
content:

```ts
{
    collect_all_crystals:
        crystalCount > 0 && solveResult.reachedGoalWithAllCrystals,
    no_falls: hasHazard && solveResult.solvable,
    no_reset: solveResult.solvable,
}
```

These booleans represent **objective assignment feasibility**, not additional search
modes:

- a crystal-free board is not eligible for `collect_all_crystals`;
- a hazard-free board is not eligible for `no_falls`;
- `no_reset` is feasible when the board has a normal solution.

The solver never takes hazard transitions; `no_falls` is therefore plain content-policy
plus normal reachability, not a separate BFS property.

## 8. Testing

### Solver

Cover:

- one-move and multi-move exact minimums;
- the same stop reached with different crystal masks;
- row-major reachable and unreachable crystals;
- `reachedGoalWithAllCrystals`;
- deterministic repeated results and caller-row immutability;
- invalid rows, exact start/goal counts, crystal ceiling, and invalid cap;
- truncation with `solvable: false` and `minMoves: null`;
- explored states exceeding unique stops when masks distinguish states, rather than
  asserting fragile exact traversal counts.

### Quality

Cover:

- invalid shape and solver-input failures mapped to `invalid_board`;
- duplicate exact rows;
- truncation, impossible goal, and par-band violations;
- objective assignment feasibility for crystals, hazards, and reset;
- accepted result with computed par, canonical key, feasibility, and solver result;
- invalid constraint configuration.

### Campaign Regression

For every `ICE_SLIDE_LEVELS` entry:

- search is not truncated under a fixed cap;
- the board is solvable;
- `minMoves === level.parMoves`;
- all authored crystal IDs appear in `reachableCrystalIds`.

Then remove the two local BFS traversals from `physics.test.ts`.

## 9. Performance and Determinism

Current boards are at most 9×9 with at most two crystals, so cloned small grids and a
numeric mask are sufficient. No optimization work is included.

Determinism depends on row-major crystal indexing, stable direction order, exact state
keys, exact board serialization, and ordered quality checks. Returned crystal arrays are
filtered from the original row-major list rather than relying on `Set` iteration order.

`reachableStopCount` and `exploredStates` remain because HPA-486 explicitly requires
them. Tests avoid hard-coding exact counts except where enforcing the cap itself.

## 10. Acceptance Criteria

HPA-486 is complete when:

1. all eight Campaign levels retain exact pars;
2. every authored Campaign crystal remains reachable;
3. solver output is deterministic and does not mutate caller rows;
4. state distinguishes identical positions with different crystal masks;
5. capped searches return `truncated: true`, `solvable: false`, and `minMoves: null`;
6. quality validation rejects invalid structure, duplicates, impossible goals,
   par-band violations, impossible assigned objectives, and truncation;
7. all three initial objective contracts are evaluated in the quality layer;
8. gameplay, UI, generation loops, and future tile mechanics are unchanged.

## 11. YAGNI Decisions

Kept because the ticket explicitly requires them:

- `quality.ts`;
- canonical duplicate detection;
- reachable-stop and explored-state diagnostics;
- objective feasibility for the initial Daily contracts.

Removed or deferred:

- objective-enum coupling in the solver;
- partial par preservation after truncation;
- exported crystal-limit constants;
- duplicated start/goal validation in `quality.ts`;
- exact explored-state assertions;
- generator orchestration, path output, generic search abstractions, and dynamic-state
  frameworks.
