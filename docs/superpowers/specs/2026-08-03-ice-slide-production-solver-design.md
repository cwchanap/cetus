# Ice Slide Production Solver and Stage Quality Validation — Design

- **Date:** 2026-08-03
- **Status:** Draft for review
- **Repository:** `cwchanap/cetus`
- **Linear issue:** [HPA-486 — Extract the Ice Slide production solver and generation quality validator](https://linear.app/cwchanap/issue/HPA-486/extract-the-ice-slide-production-solver-and-generation-quality)
- **Depends on:** HPA-485, completed in PR #53
- **Source roadmap:** `docs/superpowers/specs/2026-07-30-ice-slide-replayability-design.md`

## 1. Summary

Ice Slide currently proves Campaign solvability with two breadth-first searches embedded
inside `physics.test.ts`: one computes each level's minimum move count and another checks
that every authored crystal is collectable. Daily and Expedition generation need the
same reasoning as reusable production code, with explicit exploration limits and
deterministic rejection semantics.

This design extracts that behavior into two focused pure modules:

1. `solver.ts` performs bounded breadth-first search over player position and consumed
   crystal state.
2. `quality.ts` validates a materialized candidate board against structural, duplicate,
   par-band, crystal, and objective requirements.

The design deliberately does not create a generic graph-search framework, generator
loop, dynamic-tile plugin system, or runtime validation hook. It implements only the
capability required by HPA-486 and leaves later mechanics to their owning tickets.

## 2. Current State

The merged HPA-485 work provides the boundaries HPA-486 should reuse:

- `IceSlideStageDefinition` contains final materialized rows, objective IDs, par,
  transform, mutation IDs, and a stable stage signature.
- `parseGrid()`, `cloneGrid()`, and `slide()` implement pure grid parsing and current
  movement physics.
- `serializeBoardRows()` provides an exact dimension-aware canonical key for final rows.
- `assertValidIceSlideRunDefinition()` validates run and stage structure but intentionally
  does not solve boards.
- `IceSlideGame.start(run?)` consumes an already-materialized run and should not perform
  generation or expensive content validation.

The existing test BFS has four limitations:

1. It is unavailable to production generators.
2. It uses an arbitrary move-depth guard instead of a state-space cap.
3. Minimum-move and crystal-reachability searches duplicate traversal logic.
4. Truncation is not represented explicitly, so future callers could confuse an
   incomplete search with an unsolvable board.

## 3. Goals

1. Provide a deterministic pure solver for current Ice Slide physics.
2. Return exact minimum clear moves, reachable stop positions, reachable crystals,
   objective feasibility, explored-state count, and truncation status.
3. Model consumed crystals in the visited-state key.
4. Bound all exploration with an explicit caller-supplied state cap.
5. Reject truncated searches rather than treating partial results as valid.
6. Provide a pure candidate-quality validator that future Daily and Expedition
   generators can call.
7. Preserve all eight Campaign levels, their exact `parMoves`, and current crystal
   reachability guarantees.
8. Leave one clear internal point where collapsed-tile state can later join the search
   key, without implementing cracked ice now.

## 4. Non-goals

HPA-486 does not include:

- Daily or Expedition generation loops.
- Candidate retry counts, fallback selection, or diagnostics across seeds.
- Mutation templates or difficulty calibration.
- Runtime solver calls from `IceSlideGame`, `init.ts`, or the renderer.
- Objective progress tracking during gameplay.
- Snow, cracked ice, collapsed-tile state, Undo, or abilities.
- Solution-path reconstruction or hint generation.
- A reusable graph-search or A* package.
- Persistent crystal IDs or changes to `IceSlideStageDefinition`.
- Solver caching, worker threads, or cross-board memoization.

## 5. Fixed Design Decisions

### 5.1 Two focused modules

`solver.ts` owns state-space traversal and solver result semantics.

`quality.ts` owns candidate acceptance policy and deterministic rejection reasons.

The modules remain separate because a caller may need raw solver diagnostics without
applying a generator tier's par band or duplicate set.

### 5.2 Existing physics is the transition function

The solver calls `slide()` for each cardinal direction. It does not duplicate movement
rules. Every transition operates on a clone of the current state's grid so crystal
consumption remains isolated.

### 5.3 The state cap is explicit

`solveIceSlideBoard()` requires `maxStates`; there is no hidden unbounded mode and no
speculative global production default in this ticket. Campaign tests use a fixed local
cap. HPA-489 may select a generator-specific cap after representative templates exist.

### 5.4 Exact board serialization is the duplicate key

The quality validator uses `serializeBoardRows(finalRows)`. It compares complete final
materialized boards, not template IDs, hashes alone, or symmetry classes. Symmetry
deduplication remains the responsibility of HPA-485 transformation utilities before a
candidate reaches quality validation.

### 5.5 Structural run validation remains cheap

`assertValidIceSlideRunDefinition()` continues to validate serialized contracts only.
It does not call the solver. Checked-in content tests and generation code explicitly call
the quality validator.

## 6. Solver Contract

Create `src/lib/games/ice-slide/solver.ts`.

```ts
import type { IceSlideGridSource } from './physics'
import type { GridPosition, IceSlideObjectiveId } from './types'

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

`reachableCrystalIds` uses deterministic zero-based row/column IDs:

```text
<row>,<column>
```

Examples are `3,2` and `5,6`. This reuses the coordinate identity already present in the
authored-level tests and avoids adding a new persisted content identifier.

### 6.1 Input preconditions

The solver requires:

- a non-empty rectangular board with at least one column and known glyphs;
- exactly one start tile;
- exactly one goal tile;
- `maxStates` as a positive safe integer.

Invalid solver inputs are programmer/content errors and throw `RangeError` or the
existing parser error. Generated candidates use `validateIceSlideStageQuality()`, which
converts candidate failures into bounded rejection results.

### 6.2 Search state

The internal state is:

```ts
interface SolverState {
    position: GridPosition
    moves: number
    collectedCrystalMask: bigint
    grid: CellType[][]
}
```

Crystals receive row-major indexes during the initial board scan. `bigint` avoids an
undocumented 31-crystal ceiling while remaining internal to the solver.

The visited key contains:

```text
player row + player column + collected-crystal mask
```

Move count is not part of the key because breadth-first search reaches a state at its
minimum depth first. The grid is not separately encoded because current mutable board
state is fully determined by consumed crystals.

A private `encodeStateKey()` function is the intentional cracked-ice extension point.
HPA-493 can add collapsed-tile state to `SolverState` and that key when the physics
exists. HPA-486 does not add placeholder masks or generic state plugins.

### 6.3 Breadth-first traversal

The solver:

1. Parses the source and records start, goal, and row-major crystal positions.
2. Converts the start cell in the working grid to ice, matching runtime setup.
3. Adds the start state to the queue and visited set.
4. Uses an array plus queue cursor instead of repeated `shift()`.
5. Tries directions in stable `N`, `E`, `S`, `W` order.
6. Ignores `noop` and `hazard` outcomes.
7. Derives the next crystal mask from crystal coordinates crossed in `outcome.path`.
8. Adds each unseen `(position, crystalMask)` state subject to `maxStates`.
9. Records goal states but does not expand them.
10. Continues after finding the first goal so crystal and objective feasibility remain
    complete.

The first reached goal depth is `minMoves`.

### 6.4 Reachability semantics

`reachableStopCount` counts unique stop coordinates, including:

- the start;
- ordinary reachable endpoints;
- the goal.

Different crystal masks at the same coordinate count as one reachable stop but remain
distinct search states.

`reachableCrystalIds` is the row-major ordered subset of authored crystal coordinates
that occurs on at least one accepted non-hazard slide from a reachable state. Crystals
crossed on a slide that ends in a hazard do not count because hazard resolution resets
the attempt.

### 6.5 Objective feasibility

The result always contains all three initial objective IDs:

- `collect_all_crystals` is feasible only when the board contains at least one crystal
  and some goal state has consumed every crystal.
- `no_falls` is feasible only when the board contains at least one hazard and a goal is
  reachable without taking a hazard transition.
- `no_reset` is feasible whenever a goal is reachable through normal slides.

The first two rules include the objective eligibility requirements from the replayability
roadmap. A no-hazard board cannot be assigned `no_falls`; a no-crystal board cannot be
assigned `collect_all_crystals`.

### 6.6 State-cap semantics

`exploredStates` is the number of unique search states admitted to the visited set,
including start and terminal goal states.

Before admitting a new unseen state, the solver checks the cap. When admission would
exceed `maxStates`, it returns:

```ts
{
    solvable: false,
    minMoves: null,
    truncated: true,
    exploredStates: maxStates,
    // partial stop and crystal diagnostics may remain populated
    objectiveFeasibility: {
        collect_all_crystals: false,
        no_falls: false,
        no_reset: false,
    },
}
```

Truncation dominates any goal found earlier. This prevents callers from accepting a
candidate when exploration was insufficient to establish all required guarantees.

## 7. Stage Quality Contract

Create `src/lib/games/ice-slide/quality.ts`.

```ts
import type { IceSlideGridSource } from './physics'
import type { IceSlideObjectiveId } from './types'
import type { IceSlideSolveResult } from './solver'

export interface IceSlideStageQualityCandidate
    extends IceSlideGridSource {
    objectiveIds: readonly IceSlideObjectiveId[]
}

export interface IceSlideParBand {
    minMoves: number
    maxMoves: number
}

export interface IceSlideStageQualityConstraints {
    parBand: IceSlideParBand
    maxStates: number
    existingCanonicalKeys?: ReadonlySet<string>
}

export type IceSlideStageRejectionReason =
    | 'invalid_board'
    | 'invalid_start_count'
    | 'invalid_goal_count'
    | 'duplicate_board'
    | 'solver_truncated'
    | 'unsolvable'
    | 'par_out_of_band'
    | 'required_crystal_unreachable'
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

### 7.1 Configuration errors versus candidate rejection

Invalid validator configuration throws `RangeError`:

- `maxStates` is not a positive safe integer;
- `minMoves` or `maxMoves` is not a positive safe integer;
- `minMoves > maxMoves`.

Candidate failures return `accepted: false`. This distinction prevents generator bugs
from being silently treated as ordinary rejected content.

### 7.2 Deterministic validation order

The validator evaluates rules in this order:

1. Parse rows; map empty, jagged, zero-column, or unknown-glyph failures to
   `invalid_board`.
2. Count starts; require exactly one or return `invalid_start_count`.
3. Count goals; require exactly one or return `invalid_goal_count`.
4. Compute `canonicalKey = serializeBoardRows(candidate.rows)`.
5. Reject a key present in `existingCanonicalKeys` as `duplicate_board`.
6. Run `solveIceSlideBoard()` with the supplied cap.
7. Reject `truncated` as `solver_truncated`.
8. Reject `solvable === false` as `unsolvable`.
9. Reject `minMoves` outside the inclusive par band as `par_out_of_band`.
10. When `collect_all_crystals` is assigned, reject if any authored crystal is absent
    from `reachableCrystalIds` as `required_crystal_unreachable`.
11. Reject the first assigned objective whose feasibility is false as
    `objective_infeasible`.
12. Return the computed par, canonical key, and complete solver result.

The order is part of the contract so the same candidate and constraints always produce
the same rejection reason.

### 7.3 Rejection messages

Messages are concise developer diagnostics and include stable facts such as observed
counts or the computed par. Callers must branch on `reason`, not parse message text.

Examples:

```text
expected exactly one start tile, found 0
computed par 6 is outside inclusive band 2..5
objective no_falls is not feasible for this board
```

Player-facing copy and cross-attempt generation diagnostics remain out of scope.

## 8. Data Flow

Future generator use is intentionally simple:

```text
materialized candidate rows
        |
        v
validateIceSlideStageQuality(candidate, constraints)
        |
        +-- rejected result -> generator records reason and tries another candidate
        |
        `-- accepted result -> generator stores returned parMoves and canonicalKey
```

The game engine receives only accepted materialized stage definitions. It never invokes
the solver during play.

Campaign content tests call `solveIceSlideBoard()` directly because they verify known
checked-in boards rather than applying generator quality bands.

## 9. File Boundaries

### Create

- `src/lib/games/ice-slide/solver.ts`
  - bounded BFS;
  - solver-specific contracts;
  - crystal/objective diagnostics.

- `src/lib/games/ice-slide/solver.test.ts`
  - BFS, state-key, objective, determinism, immutability, and cap behavior.

- `src/lib/games/ice-slide/quality.ts`
  - candidate policy and bounded rejection union.

- `src/lib/games/ice-slide/quality.test.ts`
  - structural and quality rejection fixtures.

### Modify

- `src/lib/games/ice-slide/physics.test.ts`
  - remove embedded BFS helpers;
  - assert Campaign pars and crystal reachability through the production solver.

### Do not modify

- `types.ts`
- `run.ts`
- `game.ts`
- `physics.ts`
- `levels.ts`
- `transforms.ts`
- `renderer.ts`
- `init.ts`
- score, database, or leaderboard code.

A small test-only import reordering caused by formatter output is acceptable.

## 10. Error Handling

- Direct solver misuse throws before exploration.
- Candidate parsing failures become `invalid_board`.
- Missing or multiple start/goal tiles receive dedicated rejection reasons.
- Truncation always rejects and is distinguishable from a fully explored unsolvable
  board.
- Duplicate detection occurs before BFS to avoid wasted solver work.
- No module logs, touches browser APIs, reads time, reads randomness, or mutates caller
  row strings.
- No partial result is converted into a stage definition by these modules.

## 11. Testing Strategy

### 11.1 Solver unit tests

Cover:

- one-move solvable board and exact minimum moves;
- a multi-move Campaign board;
- unique reachable stop counting;
- same stop revisited with a different crystal mask;
- row-major reachable crystal IDs;
- unreachable crystal exclusion;
- `collect_all_crystals`, `no_falls`, and `no_reset` feasibility;
- deterministic repeated results;
- caller rows unchanged;
- `maxStates: 1` truncation;
- invalid cap rejection.

The crystal-mask fixture must require returning to the start after collecting a crystal
before taking the goal direction. A position-only visited key would fail this test.

### 11.2 Quality unit tests

Cover:

- empty, jagged, zero-column, and unknown-glyph boards;
- missing and multiple start;
- missing and multiple goal;
- duplicate canonical rows;
- impossible goal;
- par below and above the allowed band;
- state-cap truncation;
- assigned `collect_all_crystals` with an unreachable crystal;
- assigned `collect_all_crystals` on a no-crystal board;
- assigned `no_falls` on a no-hazard board;
- successful validation returning computed par and canonical key;
- invalid validator constraints throwing `RangeError`.

### 11.3 Campaign regression tests

For every entry in `ICE_SLIDE_LEVELS`:

- the solver is not truncated under a fixed test cap;
- the board is solvable;
- `minMoves === level.parMoves`;
- every authored crystal coordinate appears in `reachableCrystalIds`.

The duplicated local BFS implementations are removed after these assertions pass.

## 12. Performance and Determinism

Current Campaign boards are at most 9×9 with at most two crystals, so a queue of cloned
small grids is sufficient. HPA-486 does not add compact board encodings, object pools,
heuristics, or path compression.

Determinism depends on:

- stable row-major crystal indexing;
- stable `N`, `E`, `S`, `W` transition order;
- exact state-key encoding;
- exact canonical row serialization;
- ordered rejection checks.

The result does not depend on `Set` iteration order for arrays returned to callers;
reachable crystal IDs are filtered from the original row-major crystal list.

## 13. Acceptance Criteria

HPA-486 is complete when:

1. All eight Campaign levels solve with their current exact `parMoves`.
2. Every existing Campaign crystal is reported reachable.
3. Solver output is deterministic and does not mutate caller rows.
4. Search state distinguishes identical positions with different consumed-crystal
   masks.
5. State-cap exhaustion returns `truncated: true`, `solvable: false`, and `minMoves:
   null`.
6. Quality validation rejects missing/multiple start or goal, invalid rows, duplicate
   boards, impossible goals, par-band violations, required unreachable crystals,
   infeasible assigned objectives, and truncation.
7. Initial objective contracts are supported for `collect_all_crystals`, `no_falls`,
   and `no_reset`.
8. Production gameplay, UI, generation loops, and future tile mechanics are unchanged.
9. Unit tests and the full repository suite complete under deterministic explicit
   limits.

## 14. YAGNI Review

The design removes the following tempting but unnecessary work:

- no generic search abstraction;
- no path output;
- no generator retry/fallback code;
- no dynamic-tile interface;
- no new persisted IDs;
- no solver invocation from run validation;
- no optimization beyond a queue cursor and bounded visited set;
- no content-validation CLI.

Each excluded feature has a later owner or lacks a current consumer.

## 15. Spec Self-Review

- **Placeholder scan:** no unresolved placeholder or incomplete decision remains.
- **Consistency:** solver preconditions, validator rejection order, objective
  eligibility, and truncation semantics agree throughout.
- **Scope:** the work is limited to four new focused files and one test migration.
- **Ambiguity resolution:** stop count includes start and goal; crystal IDs are
  zero-based coordinates; truncation overrides partial solvability; exact final-row
  serialization defines duplicates.
