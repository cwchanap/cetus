# Ice Slide Production Solver and Stage Quality Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Ice Slide's duplicated test BFS into a bounded production solver, then add the ticket-required lean quality validator for future generated candidates.

**Architecture:** `solver.ts` returns search facts only: reachability, exact par, crystal facts, stop count, explored states, and truncation. `quality.ts` catches invalid solver input, applies duplicate/par/objective policy, and returns bounded rejection results. Campaign tests consume the solver directly; runtime gameplay remains unchanged.

**Tech Stack:** TypeScript 6, Vitest 3, Bun 1.3, existing Ice Slide physics and transformation utilities.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-03-ice-slide-production-solver-design.md`.
- Reuse `parseGrid()`, `cloneGrid()`, `slide()`, `DIRECTION_DELTA`, and `serializeBoardRows()`.
- Require an explicit positive safe-integer `maxStates`.
- Use an internal 30-crystal `number`-mask ceiling; do not export it.
- A truncated result returns `solvable: false` and `minMoves: null`.
- Keep objective policy out of `solver.ts`.
- Do not change runtime gameplay, run contracts, generator loops, score, database, UI,
  or future snow/cracked-ice mechanics.
- Do not add path output, a generic search abstraction, caching, or worker execution.

Implementation is limited to:

```text
src/lib/games/ice-slide/solver.ts
src/lib/games/ice-slide/solver.test.ts
src/lib/games/ice-slide/quality.ts
src/lib/games/ice-slide/quality.test.ts
src/lib/games/ice-slide/physics.test.ts
```

---

### Task 1: Deliver the complete bounded solver

**Files:**
- Create: `src/lib/games/ice-slide/solver.ts`
- Create: `src/lib/games/ice-slide/solver.test.ts`

**Produces:**

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

- [ ] **Step 1: Write failing solver tests**

Create `solver.test.ts` with these cases:

| Test | Required behavior |
|---|---|
| one-move board | exact `minMoves`, start+goal stops, not truncated |
| Campaign level 2 | computed minimum matches current par |
| crystal-mask state | revisiting one coordinate after collection is explored as a new state |
| crystal IDs | reachable IDs are zero-based row-major `"row,col"` strings |
| unreachable crystal | isolated crystal is absent |
| all-crystals goal | `reachedGoalWithAllCrystals` reflects an actual goal state |
| stop/state relationship | mask-distinguished `exploredStates` exceeds `reachableStopCount`; avoid an exact count |
| immutability/determinism | repeated results match and caller rows remain unchanged |
| invalid input | rows, glyphs, exact start/goal counts, >30 crystals, and invalid cap throw |
| truncation | `truncated: true`, `solvable: false`, `minMoves: null`, states do not exceed cap |

The crystal fixture must fail if the visited key uses player position only.

- [ ] **Step 2: Verify the red test state**

```bash
bun run test:run -- src/lib/games/ice-slide/solver.test.ts
```

Expected: FAIL because `./solver` does not exist.

- [ ] **Step 3: Implement board scanning and state encoding**

In `solver.ts`:

- validate `maxStates` with `Number.isSafeInteger(value) && value >= 1`;
- call `parseGrid(source)` and explicitly reject zero-column rows;
- scan once for exactly one start, exactly one goal, hazards, and row-major crystals;
- throw when crystal count exceeds the internal limit of 30;
- map each crystal index to `1 << index`;
- encode visited state as `row,col,mask`;
- do not import `IceSlideObjectiveId`.

Use this internal state:

```ts
interface SolverState {
    position: GridPosition
    moves: number
    crystalMask: number
    grid: CellType[][]
}
```

Keep the grid in the state because `slide()` mutates collected crystals. Do not add
base-grid reconstruction logic in this task.

- [ ] **Step 4: Implement complete BFS traversal**

Use this traversal policy:

1. Clone the parsed grid and replace the start with ice.
2. Queue the start state with mask `0` and moves `0`.
3. Use an array plus queue cursor.
4. Try directions in `N`, `E`, `S`, `W` order.
5. Clone the current grid before each `slide()` call.
6. Skip `noop` and `hazard` outcomes.
7. Update the mask from crystal coordinates in `outcome.path`.
8. Skip seen `(position, mask)` states.
9. Before admitting an unseen state, enforce `maxStates`.
10. Record goal states but do not enqueue them.
11. Continue after the first goal unless the cap truncates the search.

Track:

- first goal depth;
- unique stop coordinates;
- reachable crystals, returned by filtering the original row-major list;
- whether any goal consumed the full crystal mask;
- admitted-state count.

On truncation, return `solvable: false`, `minMoves: null`, and already observed
stop/crystal diagnostics. Do not preserve a partial par.

- [ ] **Step 5: Run, format, and lint the solver**

```bash
bun run test:run -- src/lib/games/ice-slide/solver.test.ts
bunx prettier --write \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
bunx eslint \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
```

Expected: solver tests pass; formatter and lint exit successfully.

- [ ] **Step 6: Commit the complete solver**

```bash
git add \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
git commit -m "feat(ice-slide): add bounded production solver"
```

---

### Task 2: Add lean stage-quality validation

**Files:**
- Create: `src/lib/games/ice-slide/quality.ts`
- Create: `src/lib/games/ice-slide/quality.test.ts`

**Why this task exists:** HPA-486 explicitly requires a pure stage-quality validator and
canonical duplicate detection. Do not add generator retries, mutation advice, aggregate
counters, or fallback selection.

**Produces:**

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
          objectiveFeasibility: Record<IceSlideObjectiveId, boolean>
          solveResult: IceSlideSolveResult
      }
    | {
          accepted: false
          reason: IceSlideStageRejectionReason
          message: string
          canonicalKey?: string
          solveResult?: IceSlideSolveResult
      }
```

- [ ] **Step 1: Write failing quality tests**

Create `quality.test.ts` with this matrix:

| Fixture | Expected result |
|---|---|
| empty, zero-column, jagged rows | `invalid_board` |
| unknown glyph, missing/multiple start or goal, >30 crystals | solver error mapped to `invalid_board` |
| existing exact canonical key | `duplicate_board` before BFS |
| state cap hit | `solver_truncated` |
| fully explored impossible goal | `unsolvable` |
| computed par outside band | `par_out_of_band` |
| crystal-free collect-all | `objective_infeasible` |
| unreachable/all-crystals-impossible collect-all | `objective_infeasible` with crystal detail |
| hazard-free no-falls | `objective_infeasible` |
| valid candidate | accepted with par, canonical key, objective feasibility, and solver result |
| invalid constraints | throws `RangeError` |

- [ ] **Step 2: Verify the red test state**

```bash
bun run test:run -- src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because `./quality` does not exist.

- [ ] **Step 3: Implement constraint, shape, and duplicate checks**

In `quality.ts`:

- validate `maxStates`, `parBand.minMoves`, and `parBand.maxMoves` as positive safe
  integers;
- throw when `minMoves > maxMoves`;
- call `serializeBoardRows(candidate.rows)` inside a try/catch and map invalid shape to
  `invalid_board`;
- reject membership in `existingCanonicalKeys` as `duplicate_board` before BFS.

Do not parse or count start/goal tiles in `quality.ts`.

- [ ] **Step 4: Call the solver and map invalid content once**

Call `solveIceSlideBoard(candidate, { maxStates })` inside a try/catch. Map parser,
glyph, crystal-ceiling, and exact start/goal errors to `invalid_board` using the solver's
message. This keeps validation wording in one place.

Then apply checks in order:

1. `truncated` → `solver_truncated`;
2. `!solvable` → `unsolvable`;
3. par outside the inclusive band → `par_out_of_band`.

- [ ] **Step 5: Derive objective assignment feasibility**

Count `C` and `H` glyphs from the final candidate rows and derive:

```ts
const objectiveFeasibility = {
    collect_all_crystals:
        crystalCount > 0 && solveResult.reachedGoalWithAllCrystals,
    no_falls: hasHazard && solveResult.solvable,
    no_reset: solveResult.solvable,
}
```

These are policy/eligibility results, not solver search modes. Evaluate assigned
`objectiveIds` in input order and reject the first false value as
`objective_infeasible`. For collect-all failures, distinguish unreachable crystals in
the diagnostic message when `reachableCrystalIds.length < crystalCount`.

- [ ] **Step 6: Run, format, and lint quality validation**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts
bunx prettier --write \
  src/lib/games/ice-slide/quality.ts \
  src/lib/games/ice-slide/quality.test.ts
bunx eslint \
  src/lib/games/ice-slide/quality.ts \
  src/lib/games/ice-slide/quality.test.ts
```

Expected: both suites pass; formatter and lint exit successfully.

- [ ] **Step 7: Commit quality validation**

```bash
git add \
  src/lib/games/ice-slide/quality.ts \
  src/lib/games/ice-slide/quality.test.ts
git commit -m "feat(ice-slide): validate generated stage quality"
```

---

### Task 3: Replace test-only BFS and verify the repository

**Files:**
- Modify: `src/lib/games/ice-slide/physics.test.ts`

- [ ] **Step 1: Replace the Campaign minimum-move BFS**

Import `solveIceSlideBoard`, delete the local `minMoves()` helper, and for every
`ICE_SLIDE_LEVELS` entry assert:

```ts
const result = solveIceSlideBoard(level, { maxStates: 10_000 })
expect(result.truncated, `level ${level.id} truncated`).toBe(false)
expect(result.solvable, `level ${level.id} solvable`).toBe(true)
expect(result.minMoves, `level ${level.id} par`).toBe(level.parMoves)
```

- [ ] **Step 2: Replace the Campaign crystal BFS**

Delete the second local traversal. Derive expected IDs from `C` glyphs in row-major order
and compare them with `result.reachableCrystalIds` under the same explicit cap.

- [ ] **Step 3: Run targeted and full tests**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/physics.test.ts
bun run test:run -- src/lib/games/ice-slide
bun run test:run
```

Expected: all commands pass.

- [ ] **Step 4: Run static checks**

```bash
bun run lint
bun run format:check
bun run typecheck 2>&1 | tee /tmp/hpa-486-typecheck.txt
```

Compare typecheck output with a clean worktree at the implementation base commit. The
bar is no new diagnostics because `astro check` reports across the whole repository.

- [ ] **Step 5: Commit the Campaign migration**

```bash
git add src/lib/games/ice-slide/physics.test.ts
git commit -m "test(ice-slide): use production solver for campaign content"
```

- [ ] **Step 6: Open a draft implementation PR**

Summarize the solver, quality gate, Campaign regression replacement, YAGNI boundaries,
and actual verification results. Do not enable auto-merge.

---

## Plan Self-Review

- **Coverage:** solver extraction, ticket-required quality validation, Campaign migration,
  truncation, objective policy, and verification each have an owning task.
- **API consistency:** objective IDs appear only in `quality.ts`; solver results contain
  search facts only.
- **YAGNI:** no partial par after truncation, exported crystal-limit constant, duplicate
  start/goal scan, exact traversal-count assertions, generator behavior, path output, or
  generic framework remains.
