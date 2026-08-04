# Ice Slide Production Solver and Stage Quality Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Ice Slide's test-only BFS into bounded deterministic production code and add a lean stage-quality validator for later Daily and Expedition generation.

**Architecture:** `solver.ts` owns complete BFS traversal over player position and a bounded numeric crystal mask. `quality.ts` owns ordered candidate acceptance policy. Campaign tests call the solver directly; runtime gameplay remains unchanged.

**Tech Stack:** TypeScript 6, Vitest 3, Bun 1.3, existing Ice Slide physics and transformation utilities.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-03-ice-slide-production-solver-design.md`.
- Reuse `parseGrid()`, `cloneGrid()`, `slide()`, `DIRECTION_DELTA`, and `serializeBoardRows()`.
- Require an explicit positive safe-integer `maxStates`.
- Use a `number` crystal mask with `MAX_SOLVER_CRYSTALS = 30`.
- A truncated result is never accepted as solvable, but preserves an already-proven
  shortest `minMoves`.
- Keep the HPA-486-required result fields: stop count, crystal IDs, objective
  feasibility, explored-state count, and truncation.
- Do not modify runtime gameplay, run contracts, score behavior, UI, generator loops,
  or future snow/cracked-ice mechanics.
- Do not add a generic search abstraction, path output, caching, or worker execution.
- Deliver the solver as one complete task; do not commit a half-populated public API.

---

## File Map

### Create

- `src/lib/games/ice-slide/solver.ts`
- `src/lib/games/ice-slide/solver.test.ts`
- `src/lib/games/ice-slide/quality.ts`
- `src/lib/games/ice-slide/quality.test.ts`

### Modify

- `src/lib/games/ice-slide/physics.test.ts`

### Must remain untouched

- `src/lib/games/ice-slide/types.ts`
- `src/lib/games/ice-slide/run.ts`
- `src/lib/games/ice-slide/game.ts`
- `src/lib/games/ice-slide/physics.ts`
- `src/lib/games/ice-slide/levels.ts`
- `src/lib/games/ice-slide/transforms.ts`
- `src/lib/games/ice-slide/init.ts`
- `src/lib/games/ice-slide/renderer.ts`

---

### Task 1: Deliver the complete bounded solver

**Files:**
- Create: `src/lib/games/ice-slide/solver.ts`
- Create: `src/lib/games/ice-slide/solver.test.ts`

**Produces:**

```ts
export const MAX_SOLVER_CRYSTALS = 30

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

- [ ] **Step 1: Write the failing solver tests**

Create `solver.test.ts` with these named cases:

| Test | Required assertion |
|---|---|
| `returns an exact one-move solution` | `minMoves === 1`, start+goal stop count, not truncated |
| `finds a multi-move Campaign minimum` | Campaign level 2 matches current par |
| `distinguishes the same stop with different crystal masks` | collect crystal, revisit a coordinate, then retain a valid goal route |
| `returns row-major reachable crystal IDs` | IDs use zero-based `"row,col"` strings |
| `excludes unreachable crystals` | isolated crystal is absent |
| `reports all three objective contracts` | collect-all search result plus derived no-falls/no-reset semantics |
| `counts explored states and unique stops` | state count distinguishes masks; stop count does not |
| `does not mutate caller rows` | repeated calls return equal results and original rows remain equal |
| `rejects invalid solver input` | empty/zero-column/jagged/unknown glyph, start/goal count, >30 crystals, invalid cap |
| `truncates before a goal` | `truncated`, `solvable: false`, `minMoves: null` |
| `preserves a proven minimum when later truncated` | `truncated`, `solvable: false`, non-null exact `minMoves` |

Use a crystal-state fixture where a correct result requires revisiting a previously seen
coordinate after collecting a crystal. This test must fail if the visited key contains
position only.

Use a separate branching fixture for post-goal truncation: direction order must reach a
short goal first, then encounter enough additional unseen states to hit the cap.

- [ ] **Step 2: Run tests and confirm the module is absent**

```bash
bun run test:run -- src/lib/games/ice-slide/solver.test.ts
```

Expected: FAIL because `./solver` does not exist.

- [ ] **Step 3: Implement input scanning and state encoding**

In `solver.ts`:

- validate `maxStates` with `Number.isSafeInteger(value) && value >= 1`;
- call `parseGrid(source)`;
- reject a zero-column board explicitly;
- scan once for exactly one start, exactly one goal, hazards, and row-major crystals;
- reject crystal count above `MAX_SOLVER_CRYSTALS`;
- map each crystal ID to bit `1 << index`;
- use the private state key:

```ts
function encodeStateKey(
    position: GridPosition,
    crystalMask: number
): string {
    return `${position.row},${position.col},${crystalMask}`
}
```

The direct solver throws for invalid content. Do not add an exported validation helper.

- [ ] **Step 4: Implement complete BFS traversal**

Use this exact traversal policy:

1. Clone the parsed grid and replace the start cell with ice.
2. Queue the start state with `moves: 0` and mask `0`.
3. Use an array plus queue cursor.
4. Try directions in `N`, `E`, `S`, `W` order.
5. Clone the current state's grid before each `slide()` call.
6. Skip `noop` and `hazard` outcomes.
7. Update the crystal mask from crystal coordinates in `outcome.path`.
8. Skip already-seen `(position, mask)` states.
9. Before admitting an unseen state, compare `seen.size` with `maxStates`.
10. Record goal states but do not enqueue them.
11. Continue after the first goal until the queue is exhausted or the cap truncates.

Track:

- `minMoves` from the first reached goal;
- unique stop-coordinate IDs in a `Set<string>`;
- reachable crystals in a `Set<string>`, returned by filtering the original row-major
  crystal list;
- whether any goal state consumed the complete crystal mask;
- whether the board contains at least one hazard.

- [ ] **Step 5: Implement result semantics**

For a complete search:

```ts
solvable = minMoves !== null
objectiveFeasibility = {
    collect_all_crystals:
        crystalCount > 0 && reachedGoalWithAllCrystals,
    no_falls: hasHazard && solvable,
    no_reset: solvable,
}
```

For truncation:

- return immediately before admitting the over-cap state;
- set `truncated: true` and `solvable: false`;
- keep the current `minMoves`, which may be `null`;
- keep already-observed stop/crystal counts and witnessed objective feasibility;
- set `exploredStates` to `seen.size`.

No result path or predecessor map is required.

- [ ] **Step 6: Run and format the solver suite**

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

- [ ] **Step 7: Commit the complete solver**

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

- [ ] **Step 1: Write the failing quality tests**

Create `quality.test.ts` with this matrix:

| Fixture | Expected reason |
|---|---|
| empty, zero-column, jagged, unknown glyph | `invalid_board` |
| missing/multiple start | `invalid_board`, count in message |
| missing/multiple goal | `invalid_board`, count in message |
| more than 30 crystals | `invalid_board` |
| existing exact canonical key | `duplicate_board` |
| state cap hit | `solver_truncated` even when `minMoves` is present |
| fully explored impossible goal | `unsolvable` |
| computed par below/above band | `par_out_of_band` |
| assigned collect-all with unreachable crystal | `objective_infeasible`, crystal detail in message |
| assigned collect-all without all-crystals goal route | `objective_infeasible` |
| assigned no-falls on no-hazard board | `objective_infeasible` |
| valid candidate | accepted with computed par, canonical key, and solver result |
| invalid constraints | throws `RangeError` |

- [ ] **Step 2: Run tests and confirm the module is absent**

```bash
bun run test:run -- src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because `./quality` does not exist.

- [ ] **Step 3: Implement configuration and structural validation**

In `quality.ts`:

- validate `maxStates`, `parBand.minMoves`, and `parBand.maxMoves` as positive safe
  integers;
- throw when `minMoves > maxMoves`;
- parse rows and scan crystal/start/goal counts;
- map parsing, zero-column, crystal-ceiling, and exact-count failures to
  `invalid_board` with concise diagnostic messages;
- compute `canonicalKey = serializeBoardRows(candidate.rows)`;
- reject an existing exact key as `duplicate_board` before calling the solver.

The quality scan intentionally duplicates the solver's cheap defensive scan so direct
solver calls still validate themselves. Do not add a third shared module.

- [ ] **Step 4: Implement ordered solver policy**

After structural and duplicate checks:

1. Call `solveIceSlideBoard(candidate, { maxStates })`.
2. Reject `solveResult.truncated` as `solver_truncated` before all other solver checks.
3. Reject a complete unreachable search as `unsolvable`.
4. Reject computed par outside the inclusive band as `par_out_of_band`.
5. Evaluate assigned objectives in input order:
   - for `collect_all_crystals`, use crystal counts and
     `solveResult.objectiveFeasibility.collect_all_crystals`; make the message identify
     unreachable crystals when the reachable count is lower;
   - use `solveResult.objectiveFeasibility` for all other objective IDs;
   - reject any failure as `objective_infeasible`.
6. Return accepted result with computed par, canonical key, and solver result.

Callers branch on `reason`, never on message text.

- [ ] **Step 5: Run and format quality tests**

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

- [ ] **Step 6: Commit quality validation**

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

- [ ] **Step 1: Replace Campaign minimum-move BFS**

Import `solveIceSlideBoard`, delete the local `minMoves()` helper, and for every
`ICE_SLIDE_LEVELS` entry assert:

```ts
const result = solveIceSlideBoard(level, { maxStates: 10_000 })
expect(result.truncated, `level ${level.id} truncated`).toBe(false)
expect(result.solvable, `level ${level.id} solvable`).toBe(true)
expect(result.minMoves, `level ${level.id} par`).toBe(level.parMoves)
```

- [ ] **Step 2: Replace Campaign crystal BFS**

Delete the second local queue traversal. Derive expected IDs from `C` glyphs in row-major
order and compare them with `result.reachableCrystalIds` from the same explicit cap.

Keep `cloneGrid` imported because earlier physics tests still use it.

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
requirement is no new diagnostics; do not assume the two errors reported by PR #53 still
form the current baseline.

- [ ] **Step 5: Verify implementation scope**

```bash
git diff --name-only origin/main...HEAD
```

Expected implementation files:

```text
src/lib/games/ice-slide/physics.test.ts
src/lib/games/ice-slide/quality.test.ts
src/lib/games/ice-slide/quality.ts
src/lib/games/ice-slide/solver.test.ts
src/lib/games/ice-slide/solver.ts
```

- [ ] **Step 6: Commit Campaign migration**

```bash
git add src/lib/games/ice-slide/physics.test.ts
git commit -m "test(ice-slide): use production solver for campaign content"
```

- [ ] **Step 7: Open a draft implementation PR**

The PR summary must state:

- complete bounded solver with numeric crystal masks;
- quality rejection policy and six reason codes;
- preserved Campaign pars and crystal reachability;
- truncation preserves proven `minMoves` but is always rejected;
- no runtime, generator-loop, UI, score, or future-mechanic changes;
- targeted/full test, lint, format, and baseline-aware typecheck results.

Do not enable auto-merge.

---

## Plan Self-Review

- **Spec coverage:** all HPA-486 required fields and rejection checks map to Tasks 1–3.
- **No partial API:** Task 1 delivers the complete solver in one commit.
- **YAGNI:** no full source dump, generic framework, solution path, generator
  orchestration, or future-state scaffolding.
- **Type consistency:** `number` mask ceiling, six reason codes, truncation semantics,
  and public interfaces match the design.
