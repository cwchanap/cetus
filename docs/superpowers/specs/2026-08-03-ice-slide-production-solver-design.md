# Ice Slide Production Solver and Stage Quality Validation — Design

- **Date:** 2026-08-03
- **Status:** Draft for review
- **Repository:** `cwchanap/cetus`
- **Linear issue:** [HPA-486 — Extract the Ice Slide production solver and generation quality validator](https://linear.app/cwchanap/issue/HPA-486/extract-the-ice-slide-production-solver-and-generation-quality)
- **Depends on:** HPA-485, completed in PR #53
- **Source roadmap:** `docs/superpowers/specs/2026-07-30-ice-slide-replayability-design.md`

## 1. Summary

Ice Slide currently proves Campaign solvability with two breadth-first searches embedded
inside `physics.test.ts`: one computes minimum moves and another checks authored crystal
reachability. Daily and Expedition generation need the same capability as reusable pure
production code with explicit exploration limits and deterministic rejection semantics.

HPA-486 adds two focused modules:

1. `solver.ts` performs bounded BFS over player position and consumed-crystal state.
2. `quality.ts` applies candidate acceptance policy around the solver.

The design intentionally avoids a generic graph framework, generation loop, runtime
solver hook, solution paths, and future tile-state abstractions.

## 2. Current Boundaries

The merged HPA-485 work already provides the boundaries this task should reuse:

- `IceSlideStageDefinition` contains final materialized rows and objective IDs.
- `parseGrid()`, `cloneGrid()`, and `slide()` own current parsing and movement physics.
- `serializeBoardRows()` provides the exact dimension-aware final-board key.
- `assertValidIceSlideRunDefinition()` validates serialized contracts but does not solve
  boards.
- `IceSlideGame` consumes materialized runs and must remain independent from generation.

The current test BFS is unsuitable for production because it is duplicated, uses an
arbitrary move-depth guard, and cannot distinguish a complete unsolvable search from an
incomplete capped search.

## 3. Goals

1. Provide a deterministic pure solver for current Ice Slide physics.
2. Return solvability, minimum moves, reachable stop count, reachable crystal IDs,
   objective feasibility, explored-state count, and truncation status as required by
   HPA-486.
3. Model player position and consumed-crystal state in the visited key.
4. Require an explicit caller-supplied state cap.
5. Reject every truncated result in quality validation.
6. Preserve all eight Campaign pars and authored crystal guarantees.
7. Provide bounded rejection types that later generators can consume.

## 4. Non-goals

This task does not include:

- Daily or Expedition generation loops, retries, fallbacks, or seed diagnostics;
- mutation templates or difficulty calibration;
- runtime solver calls from `game.ts`, `run.ts`, `init.ts`, or the renderer;
- objective progress tracking during gameplay;
- solution paths, hints, A*, or a reusable graph-search package;
- snow, cracked ice, collapsed-tile state, Undo, or abilities;
- persistent crystal IDs or changes to run/stage contracts;
- solver caching, workers, or cross-board memoization.

## 5. File Boundaries

### Create

- `src/lib/games/ice-slide/solver.ts`
- `src/lib/games/ice-slide/solver.test.ts`
- `src/lib/games/ice-slide/quality.ts`
- `src/lib/games/ice-slide/quality.test.ts`

### Modify

- `src/lib/games/ice-slide/physics.test.ts`

### Do not modify

- `types.ts`, `run.ts`, `game.ts`, `physics.ts`, `levels.ts`, `transforms.ts`,
  `renderer.ts`, `init.ts`, or score/database/UI code.

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
    objectiveFeasibility: Record<IceSlideObjectiveId, boolean>
    exploredStates: number
    truncated: boolean
}

export function solveIceSlideBoard(
    source: IceSlideGridSource,
    limits: IceSlideSolverLimits
): IceSlideSolveResult
```

`reachableCrystalIds` uses deterministic zero-based `"row,col"` coordinate IDs.

### 6.1 Preconditions

Direct solver calls require:

- a non-empty rectangular board with at least one column and known glyphs;
- exactly one start and one goal;
- at most `MAX_SOLVER_CRYSTALS = 30` crystals;
- `maxStates` as a positive safe integer.

Invalid direct calls throw. The quality validator converts candidate-content failures
into rejection results.

The 30-crystal ceiling keeps the state mask as a simple JavaScript `number` using safe
positive bit operations. Current Campaign content has at most two crystals; widening the
representation is deferred until real content requires it.

### 6.2 Search State

```ts
interface SolverState {
    position: GridPosition
    moves: number
    collectedCrystalMask: number
    grid: CellType[][]
}
```

Crystals receive row-major indexes during the initial scan. The visited key contains:

```text
player row + player column + collected-crystal mask
```

Move count is excluded because BFS reaches each state at minimum depth first. Current
mutable grid state is fully determined by consumed crystals.

A private `encodeStateKey()` function is sufficient for later cracked-ice work to extend
when collapsed-tile physics exists; HPA-486 adds no placeholder dynamic state.

### 6.3 Traversal

The solver:

1. parses rows and scans start, goal, hazards, and row-major crystals once;
2. converts the start cell in its working grid to ice;
3. explores directions in stable `N`, `E`, `S`, `W` order;
4. uses `slide()` as the only transition implementation;
5. ignores `noop` and `hazard` outcomes;
6. clones the current grid before each attempted transition;
7. updates the crystal mask from crystals crossed in `outcome.path`;
8. admits unseen states only while under `maxStates`;
9. records goal states but does not expand them;
10. continues after the first goal to complete stop, crystal, and objective analysis
    unless the state cap is reached.

Use an array plus queue cursor rather than repeated `shift()`.

### 6.4 Result Semantics

- `reachableStopCount` counts unique stop coordinates, including start and goal.
- `reachableCrystalIds` is row-major and includes crystals crossed on at least one
  accepted non-hazard slide.
- `exploredStates` is the number of unique states admitted to the visited set.
- The first goal depth is an exact `minMoves`, because BFS explores in nondecreasing
  depth.

Objective feasibility remains in the solver result because HPA-486 explicitly requires
a consolidated result for the three Daily contracts. Its implementation stays lean:

- `collect_all_crystals`: search-derived; true when a goal state is reached with every
  crystal consumed and the board has at least one crystal;
- `no_falls`: derived from board eligibility plus a normal goal path; true when the board
  has a hazard and the solver reaches the goal without taking a hazard transition;
- `no_reset`: derived from normal goal reachability.

The latter two are simple derived predicates, not additional search dimensions.

### 6.5 Truncation

When admission of another unseen state would exceed `maxStates`:

- `truncated` is `true`;
- `solvable` is `false`, so the result cannot be accepted as fully validated;
- `minMoves` retains an already-proven shortest goal depth, otherwise remains `null`;
- already-observed diagnostics and witnessed objective feasibility may be retained;
- `exploredStates` equals the admitted-state count and never exceeds the cap.

Quality validation always rejects `truncated: true` before considering par or
objectives. Preserving `minMoves` keeps proven information without weakening acceptance
semantics.

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

export type IceSlideStageQualityResult =
    | {
          accepted: true
          parMoves: number
          canonicalKey: string
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

The six reason codes are sufficient for the first generator diagnostics. Messages carry
specific details such as missing/multiple start or goal counts and unreachable required
crystals. New reason codes should be added only when a production consumer needs to
branch or aggregate them separately.

### 7.1 Configuration Errors

Invalid validator configuration throws `RangeError`:

- `maxStates`, `minMoves`, or `maxMoves` is not a positive safe integer;
- `minMoves > maxMoves`.

Candidate-content failures return `accepted: false`.

### 7.2 Deterministic Validation Order

1. Validate rows, glyphs, crystal ceiling, and exact start/goal counts; reject as
   `invalid_board` with a specific message.
2. Compute `canonicalKey = serializeBoardRows(candidate.rows)`.
3. Reject a key in `existingCanonicalKeys` as `duplicate_board` before BFS.
4. Run the solver with the supplied cap.
5. Reject truncation as `solver_truncated`.
6. Reject a fully explored unreachable goal as `unsolvable`.
7. Reject `minMoves` outside the inclusive band as `par_out_of_band`.
8. Reject the first assigned objective whose feasibility is false as
   `objective_infeasible`; for `collect_all_crystals`, the message distinguishes an
   unreachable required crystal from the absence of an all-crystals goal path.
9. Return the computed par, canonical key, and solver result.

The order is contractual so identical input yields identical rejection output.

### 7.3 Direct Solver Versus Quality Validation

The quality validator checks start/goal counts before calling the solver so it can return
a bounded rejection. The solver repeats those cheap checks because it is also a public
direct API used by Campaign tests. A shared exported validation helper would increase
surface area without eliminating meaningful work, so the small scan remains duplicated.

## 8. Data Flow

```text
materialized candidate
        |
        v
validateIceSlideStageQuality(candidate, constraints)
        |
        +-- rejected -> later generator retries or falls back
        |
        `-- accepted -> later generator stores returned par and canonical key
```

Campaign tests call `solveIceSlideBoard()` directly. The game engine receives only
materialized stages and never invokes either module during play.

## 9. Testing

### Solver tests

Cover:

- one-move and multi-move exact minimums;
- same stop reached with different crystal masks;
- row-major crystal reachability and all-crystals-at-goal feasibility;
- stop and explored-state counts;
- `collect_all_crystals`, `no_falls`, and `no_reset` semantics;
- deterministic repeated results and caller-row immutability;
- invalid boards, crystal ceiling, invalid cap;
- truncation before and after a goal, including preserved `minMoves`.

### Quality tests

Cover:

- empty, zero-column, jagged, and unknown-glyph boards;
- missing/multiple start or goal through `invalid_board` messages;
- duplicate final rows;
- impossible goal;
- below/above par bands;
- state-cap truncation;
- impossible assigned objectives, including unreachable required crystals;
- accepted result with computed par and canonical key;
- invalid constraint configuration.

### Campaign regressions

For every `ICE_SLIDE_LEVELS` entry:

- search is not truncated under a fixed test cap;
- the board is solvable;
- `minMoves === level.parMoves`;
- all authored crystal coordinate IDs appear in `reachableCrystalIds`.

The two local BFS implementations in `physics.test.ts` are then removed.

## 10. Performance and Determinism

Current boards are at most 9×9 with at most two crystals, so cloned small grids are
sufficient. HPA-486 does not add compact encodings, object pools, heuristics, or caches.

Determinism depends on row-major crystal indexing, stable direction order, exact state
keys, exact board serialization, and ordered quality checks. Returned crystal arrays are
filtered from the original row-major list rather than relying on `Set` iteration order.

`reachableStopCount` and `exploredStates` remain public because HPA-486 explicitly
requires them and HPA-489 can use them for bounded generation diagnostics and template
constraints. No additional diagnostics API is introduced.

## 11. Acceptance Criteria

HPA-486 is complete when:

1. all eight Campaign levels retain exact pars;
2. every authored Campaign crystal remains reachable;
3. solver output is deterministic and does not mutate caller rows;
4. state distinguishes identical positions with different crystal masks;
5. capped searches report truncation, are not accepted as solvable, and preserve a
   proven `minMoves` when available;
6. quality validation rejects invalid structure, duplicates, impossible goals,
   par-band violations, impossible objectives, and truncation;
7. all three initial objective contracts are supported;
8. gameplay, UI, generation loops, and future tile mechanics are unchanged;
9. tests run only under explicit deterministic limits.

## 12. YAGNI Check

The design keeps only the ticket-required result fields and the two justified modules.
It excludes generic search abstractions, path output, generator orchestration, dynamic
state plugins, new persisted IDs, runtime validation, optimization work, and a content
validation CLI.
