# Ice Slide Production Solver and Stage Quality Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Ice Slide's test-only BFS into bounded deterministic production code and add a pure stage-quality validator for future Daily and Expedition generation.

**Architecture:** `solver.ts` owns breadth-first traversal over player position and consumed-crystal state while reusing `slide()` as the only movement transition. `quality.ts` applies ordered candidate acceptance rules around the solver and returns a discriminated rejection union. Runtime gameplay remains unchanged.

**Tech Stack:** TypeScript 6, Vitest 3, Bun 1.3, existing Ice Slide physics and transformation utilities.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-03-ice-slide-production-solver-design.md`.
- Keep solver and quality modules pure: no DOM, Pixi, storage, network, time, randomness, or logging.
- Reuse `parseGrid()`, `cloneGrid()`, `slide()`, `DIRECTION_DELTA`, and `serializeBoardRows()`.
- Require an explicit positive safe-integer `maxStates`; do not add an unbounded or hidden-default mode.
- Treat truncation as rejection: `truncated: true`, `solvable: false`, and `minMoves: null`.
- Do not modify runtime gameplay, generation loops, score behavior, or future snow/cracked-ice mechanics.
- Do not create a generic graph-search abstraction or return solution paths.
- Use TDD and commit each independently reviewable task.

---

## File Map

### Create

- `src/lib/games/ice-slide/solver.ts`
  - solver contracts;
  - bounded BFS;
  - crystal-mask state;
  - objective feasibility.

- `src/lib/games/ice-slide/solver.test.ts`
  - traversal, state-key, objective, cap, determinism, and immutability tests.

- `src/lib/games/ice-slide/quality.ts`
  - quality contracts;
  - constraint validation;
  - ordered candidate rejection.

- `src/lib/games/ice-slide/quality.test.ts`
  - invalid fixture and accepted-candidate tests.

### Modify

- `src/lib/games/ice-slide/physics.test.ts`
  - replace both embedded BFS helpers with production solver assertions.

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

### Task 1: Add bounded minimum-move BFS

**Files:**
- Create: `src/lib/games/ice-slide/solver.test.ts`
- Create: `src/lib/games/ice-slide/solver.ts`

**Interfaces:**
- Consumes:
  - `IceSlideGridSource`, `parseGrid`, `cloneGrid`, and `slide` from `./physics`
  - `DIRECTION_DELTA`, `GridPosition`, `CellType`, and `IceSlideObjectiveId` from `./types`
- Produces:
  - `IceSlideSolverLimits`
  - `IceSlideSolveResult`
  - `solveIceSlideBoard(source, limits)`

- [ ] **Step 1: Write failing tests for basic traversal and bounds**

Create `src/lib/games/ice-slide/solver.test.ts` with the initial tests:

```ts
import { describe, expect, it } from 'vitest'
import { ICE_SLIDE_LEVELS } from './levels'
import { solveIceSlideBoard } from './solver'

describe('solveIceSlideBoard', () => {
    it('returns the exact minimum moves and unique reachable stops', () => {
        const result = solveIceSlideBoard(
            {
                id: 'one-move',
                rows: ['#####', '#S.G#', '#####'],
            },
            { maxStates: 100 }
        )

        expect(result).toMatchObject({
            solvable: true,
            minMoves: 1,
            reachableStopCount: 2,
            exploredStates: 2,
            truncated: false,
        })
    })

    it('finds a multi-move Campaign minimum', () => {
        const level = ICE_SLIDE_LEVELS[1]
        const result = solveIceSlideBoard(level, { maxStates: 10_000 })

        expect(result.truncated).toBe(false)
        expect(result.solvable).toBe(true)
        expect(result.minMoves).toBe(level.parMoves)
    })

    it('rejects a non-positive or unsafe state cap', () => {
        const source = {
            id: 'invalid-cap',
            rows: ['#####', '#S.G#', '#####'],
        }

        expect(() =>
            solveIceSlideBoard(source, { maxStates: 0 })
        ).toThrow(/maxStates/)
        expect(() =>
            solveIceSlideBoard(source, {
                maxStates: Number.MAX_SAFE_INTEGER + 1,
            })
        ).toThrow(/maxStates/)
    })

    it.each([
        [
            'zero-column',
            [''],
            /at least one column/,
        ],
        [
            'multiple starts',
            ['######', '#SS.G#', '######'],
            /exactly one start/,
        ],
        [
            'multiple goals',
            ['######', '#S.GG#', '######'],
            /exactly one goal/,
        ],
    ] as const)('rejects invalid solver input: %s', (_name, rows, error) => {
        expect(() =>
            solveIceSlideBoard(
                { id: 'invalid-board', rows },
                { maxStates: 100 }
            )
        ).toThrow(error)
    })

    it('reports truncation before admitting a state beyond the cap', () => {
        const result = solveIceSlideBoard(
            {
                id: 'truncated',
                rows: ['#####', '#S.G#', '#####'],
            },
            { maxStates: 1 }
        )

        expect(result).toMatchObject({
            solvable: false,
            minMoves: null,
            exploredStates: 1,
            truncated: true,
        })
        expect(result.objectiveFeasibility).toEqual({
            collect_all_crystals: false,
            no_falls: false,
            no_reset: false,
        })
    })
})
```

- [ ] **Step 2: Run the new tests and confirm the module is missing**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/solver.test.ts
```

Expected: FAIL because `./solver` does not exist.

- [ ] **Step 3: Add the solver contracts and basic BFS**

Create `src/lib/games/ice-slide/solver.ts` with these exported contracts:

```ts
import {
    cloneGrid,
    parseGrid,
    slide,
    type IceSlideGridSource,
} from './physics'
import {
    DIRECTION_DELTA,
    type CellType,
    type GridPosition,
    type IceSlideObjectiveId,
} from './types'

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

interface SolverState {
    position: GridPosition
    moves: number
    collectedCrystalMask: bigint
    grid: CellType[][]
}

const DIRECTIONS = [
    DIRECTION_DELTA.N,
    DIRECTION_DELTA.E,
    DIRECTION_DELTA.S,
    DIRECTION_DELTA.W,
] as const

function assertValidMaxStates(maxStates: number): void {
    if (!Number.isSafeInteger(maxStates) || maxStates < 1) {
        throw new RangeError('maxStates must be a positive safe integer')
    }
}

function findUniqueStartAndGoal(grid: readonly (readonly CellType[])[]): {
    start: GridPosition
} {
    if ((grid[0]?.length ?? 0) === 0) {
        throw new RangeError('board must have at least one column')
    }

    let start: GridPosition | null = null
    let startCount = 0
    let goalCount = 0

    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            if (grid[row][col] === 'start') {
                start = { row, col }
                startCount++
            }
            if (grid[row][col] === 'goal') {
                goalCount++
            }
        }
    }

    if (startCount !== 1 || start === null) {
        throw new RangeError(
            `board must contain exactly one start tile; found ${startCount}`
        )
    }
    if (goalCount !== 1) {
        throw new RangeError(
            `board must contain exactly one goal tile; found ${goalCount}`
        )
    }

    return { start }
}

function encodeStateKey(
    position: GridPosition,
    collectedCrystalMask: bigint
): string {
    return `${position.row},${position.col},${collectedCrystalMask.toString(16)}`
}

function truncatedResult(input: {
    reachableStopCount: number
    reachableCrystalIds: string[]
    exploredStates: number
}): IceSlideSolveResult {
    return {
        solvable: false,
        minMoves: null,
        reachableStopCount: input.reachableStopCount,
        reachableCrystalIds: input.reachableCrystalIds,
        objectiveFeasibility: {
            collect_all_crystals: false,
            no_falls: false,
            no_reset: false,
        },
        exploredStates: input.exploredStates,
        truncated: true,
    }
}
```

Implement the first traversal version:

```ts
export function solveIceSlideBoard(
    source: IceSlideGridSource,
    limits: IceSlideSolverLimits
): IceSlideSolveResult {
    assertValidMaxStates(limits.maxStates)

    const baseGrid = parseGrid(source)
    const { start } = findUniqueStartAndGoal(baseGrid)
    const initialGrid = cloneGrid(baseGrid)
    initialGrid[start.row][start.col] = 'ice'

    const initialState: SolverState = {
        position: start,
        moves: 0,
        collectedCrystalMask: 0n,
        grid: initialGrid,
    }
    const queue: SolverState[] = [initialState]
    let queueIndex = 0
    const seen = new Set([
        encodeStateKey(start, initialState.collectedCrystalMask),
    ])
    const reachableStops = new Set([`${start.row},${start.col}`])
    let minMoves: number | null = null

    while (queueIndex < queue.length) {
        const current = queue[queueIndex++]

        for (const direction of DIRECTIONS) {
            const nextGrid = cloneGrid(current.grid)
            const outcome = slide(nextGrid, current.position, direction)
            if (outcome.kind !== 'moved') {
                continue
            }

            const nextMoves = current.moves + 1
            const nextKey = encodeStateKey(
                outcome.end,
                current.collectedCrystalMask
            )
            if (seen.has(nextKey)) {
                continue
            }
            if (seen.size >= limits.maxStates) {
                return truncatedResult({
                    reachableStopCount: reachableStops.size,
                    reachableCrystalIds: [],
                    exploredStates: seen.size,
                })
            }

            seen.add(nextKey)
            reachableStops.add(`${outcome.end.row},${outcome.end.col}`)

            if (outcome.reachedGoal) {
                minMoves ??= nextMoves
                continue
            }

            queue.push({
                position: outcome.end,
                moves: nextMoves,
                collectedCrystalMask: current.collectedCrystalMask,
                grid: nextGrid,
            })
        }
    }

    const solvable = minMoves !== null
    return {
        solvable,
        minMoves,
        reachableStopCount: reachableStops.size,
        reachableCrystalIds: [],
        objectiveFeasibility: {
            collect_all_crystals: false,
            no_falls: false,
            no_reset: solvable,
        },
        exploredStates: seen.size,
        truncated: false,
    }
}
```

This step intentionally leaves crystal-aware state and full objective feasibility for
Task 2 while establishing the bounded BFS and result shape.

- [ ] **Step 4: Run the solver tests**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/solver.test.ts
```

Expected: PASS for all initial traversal, input, and cap tests.

- [ ] **Step 5: Run formatter and lint on the new files**

Run:

```bash
bunx prettier --write \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
bunx eslint \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
```

Expected: both commands exit successfully.

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
git commit -m "feat(ice-slide): add bounded production solver"
```

---

### Task 2: Add crystal-state search and objective feasibility

**Files:**
- Modify: `src/lib/games/ice-slide/solver.test.ts`
- Modify: `src/lib/games/ice-slide/solver.ts`

**Interfaces:**
- Consumes: the Task 1 solver contracts.
- Produces: complete `reachableCrystalIds` and `objectiveFeasibility` semantics without
  changing the exported API.

- [ ] **Step 1: Add the crystal-mask fixture and objective tests**

Append to the existing `describe('solveIceSlideBoard', ...)` block:

```ts
it('revisits the same stop after collecting a crystal', () => {
    const result = solveIceSlideBoard(
        {
            id: 'crystal-mask',
            rows: [
                '#######',
                '#.O.O.#',
                '#..C..#',
                '#G.S..#',
                '#..O..#',
                '#.....#',
                '#######',
            ],
        },
        { maxStates: 1_000 }
    )

    expect(result.truncated).toBe(false)
    expect(result.solvable).toBe(true)
    expect(result.minMoves).toBe(1)
    expect(result.reachableCrystalIds).toEqual(['2,3'])
    expect(result.objectiveFeasibility).toEqual({
        collect_all_crystals: true,
        no_falls: false,
        no_reset: true,
    })
})

it('reports only crystals reachable on non-hazard slides', () => {
    const result = solveIceSlideBoard(
        {
            id: 'isolated-crystal',
            rows: [
                '#######',
                '#S...G#',
                '#######',
                '###C###',
                '#######',
            ],
        },
        { maxStates: 1_000 }
    )

    expect(result.solvable).toBe(true)
    expect(result.reachableCrystalIds).toEqual([])
    expect(result.objectiveFeasibility.collect_all_crystals).toBe(false)
})

it('requires board content for optional-objective eligibility', () => {
    const noHazard = solveIceSlideBoard(
        {
            id: 'no-hazard',
            rows: ['#####', '#S.G#', '#####'],
        },
        { maxStates: 100 }
    )
    const withHazard = solveIceSlideBoard(
        ICE_SLIDE_LEVELS[3],
        { maxStates: 10_000 }
    )

    expect(noHazard.objectiveFeasibility.no_falls).toBe(false)
    expect(noHazard.objectiveFeasibility.collect_all_crystals).toBe(false)
    expect(noHazard.objectiveFeasibility.no_reset).toBe(true)

    expect(withHazard.solvable).toBe(true)
    expect(withHazard.objectiveFeasibility.no_falls).toBe(true)
    expect(withHazard.objectiveFeasibility.no_reset).toBe(true)
})

it('is deterministic and leaves caller rows unchanged', () => {
    const rows = [
        '#######',
        '#.O.O.#',
        '#..C..#',
        '#G.S..#',
        '#..O..#',
        '#.....#',
        '#######',
    ] as const
    const before = [...rows]

    const first = solveIceSlideBoard(
        { id: 'deterministic', rows },
        { maxStates: 1_000 }
    )
    const second = solveIceSlideBoard(
        { id: 'deterministic', rows },
        { maxStates: 1_000 }
    )

    expect(second).toEqual(first)
    expect(rows).toEqual(before)
})
```

- [ ] **Step 2: Run the new tests and confirm crystal behavior fails**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/solver.test.ts
```

Expected: FAIL because `reachableCrystalIds` is empty and the current visited key does
not advance the crystal mask.

- [ ] **Step 3: Scan and index crystals once**

Add these helpers to `solver.ts`:

```ts
interface CrystalIndex {
    ids: string[]
    indexById: Map<string, number>
}

function positionId(position: GridPosition): string {
    return `${position.row},${position.col}`
}

function indexCrystals(grid: readonly (readonly CellType[])[]): CrystalIndex {
    const ids: string[] = []
    const indexById = new Map<string, number>()

    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            if (grid[row][col] !== 'crystal') {
                continue
            }
            const id = positionId({ row, col })
            indexById.set(id, ids.length)
            ids.push(id)
        }
    }

    return { ids, indexById }
}

function maskForSlidePath(
    currentMask: bigint,
    path: readonly GridPosition[],
    crystalIndexById: ReadonlyMap<string, number>
): bigint {
    let mask = currentMask

    for (const position of path) {
        const crystalIndex = crystalIndexById.get(positionId(position))
        if (crystalIndex !== undefined) {
            mask |= 1n << BigInt(crystalIndex)
        }
    }

    return mask
}
```

At the start of `solveIceSlideBoard()`, after parsing:

```ts
const crystalIndex = indexCrystals(baseGrid)
const allCrystalsMask =
    crystalIndex.ids.length === 0
        ? 0n
        : (1n << BigInt(crystalIndex.ids.length)) - 1n
const hasHazard = baseGrid.some(row => row.includes('hazard'))
const reachableCrystalIds = new Set<string>()
let reachedGoalWithAllCrystals = false
```

- [ ] **Step 4: Include the crystal mask in each transition**

Replace the Task 1 `nextKey` construction with:

```ts
const nextCrystalMask = maskForSlidePath(
    current.collectedCrystalMask,
    outcome.path,
    crystalIndex.indexById
)

for (const position of outcome.path) {
    const id = positionId(position)
    if (crystalIndex.indexById.has(id)) {
        reachableCrystalIds.add(id)
    }
}

const nextKey = encodeStateKey(outcome.end, nextCrystalMask)
```

When returning a truncated result, pass row-major reachable IDs:

```ts
reachableCrystalIds: crystalIndex.ids.filter(id =>
    reachableCrystalIds.has(id)
),
```

When a goal is reached:

```ts
minMoves ??= nextMoves
if (
    crystalIndex.ids.length > 0 &&
    nextCrystalMask === allCrystalsMask
) {
    reachedGoalWithAllCrystals = true
}
continue
```

When enqueuing:

```ts
queue.push({
    position: outcome.end,
    moves: nextMoves,
    collectedCrystalMask: nextCrystalMask,
    grid: nextGrid,
})
```

- [ ] **Step 5: Complete objective feasibility and deterministic arrays**

Replace the successful final return with:

```ts
const solvable = minMoves !== null
return {
    solvable,
    minMoves,
    reachableStopCount: reachableStops.size,
    reachableCrystalIds: crystalIndex.ids.filter(id =>
        reachableCrystalIds.has(id)
    ),
    objectiveFeasibility: {
        collect_all_crystals:
            crystalIndex.ids.length > 0 && reachedGoalWithAllCrystals,
        no_falls: hasHazard && solvable,
        no_reset: solvable,
    },
    exploredStates: seen.size,
    truncated: false,
}
```

- [ ] **Step 6: Run the complete solver suite**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/solver.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run format and lint**

Run:

```bash
bunx prettier --write \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
bunx eslint \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
```

Expected: both commands exit successfully.

- [ ] **Step 8: Commit Task 2**

```bash
git add \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts
git commit -m "feat(ice-slide): report crystal and objective feasibility"
```

---

### Task 3: Add deterministic stage-quality validation

**Files:**
- Create: `src/lib/games/ice-slide/quality.test.ts`
- Create: `src/lib/games/ice-slide/quality.ts`

**Interfaces:**
- Consumes:
  - `solveIceSlideBoard()` and `IceSlideSolveResult` from `./solver`
  - `parseGrid()` and `IceSlideGridSource` from `./physics`
  - `serializeBoardRows()` from `./transforms`
  - `IceSlideObjectiveId` from `./types`
- Produces:
  - `IceSlideStageQualityCandidate`
  - `IceSlideParBand`
  - `IceSlideStageQualityConstraints`
  - `IceSlideStageRejectionReason`
  - `IceSlideStageQualityResult`
  - `validateIceSlideStageQuality(candidate, constraints)`

- [ ] **Step 1: Write structural and duplicate rejection tests**

Create `src/lib/games/ice-slide/quality.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { serializeBoardRows } from './transforms'
import {
    validateIceSlideStageQuality,
    type IceSlideStageQualityCandidate,
} from './quality'

const BASIC_ROWS = ['#####', '#S.G#', '#####'] as const

function candidate(
    rows: readonly string[] = BASIC_ROWS,
    objectiveIds: IceSlideStageQualityCandidate['objectiveIds'] = []
): IceSlideStageQualityCandidate {
    return {
        id: 'candidate',
        rows,
        objectiveIds,
    }
}

const ACCEPTING_CONSTRAINTS = {
    parBand: { minMoves: 1, maxMoves: 10 },
    maxStates: 10_000,
} as const

describe('validateIceSlideStageQuality', () => {
    it.each([
        ['empty', []],
        ['zero-column', ['']],
        ['jagged', ['#####', '#S.G#', '####']],
        ['unknown glyph', ['#####', '#SXG#', '#####']],
    ])('rejects an invalid %s board', (_name, rows) => {
        const result = validateIceSlideStageQuality(
            candidate(rows),
            ACCEPTING_CONSTRAINTS
        )

        expect(result).toMatchObject({
            accepted: false,
            reason: 'invalid_board',
        })
    })

    it.each([
        [
            'missing start',
            ['#####', '#..G#', '#####'],
            'invalid_start_count',
        ],
        [
            'multiple starts',
            ['######', '#SS.G#', '######'],
            'invalid_start_count',
        ],
        [
            'missing goal',
            ['#####', '#S..#', '#####'],
            'invalid_goal_count',
        ],
        [
            'multiple goals',
            ['######', '#S.GG#', '######'],
            'invalid_goal_count',
        ],
    ] as const)('rejects %s', (_name, rows, reason) => {
        const result = validateIceSlideStageQuality(
            candidate(rows),
            ACCEPTING_CONSTRAINTS
        )

        expect(result).toMatchObject({
            accepted: false,
            reason,
        })
    })

    it('rejects a duplicate before solving', () => {
        const canonicalKey = serializeBoardRows(BASIC_ROWS)
        const result = validateIceSlideStageQuality(candidate(), {
            ...ACCEPTING_CONSTRAINTS,
            existingCanonicalKeys: new Set([canonicalKey]),
        })

        expect(result).toEqual({
            accepted: false,
            reason: 'duplicate_board',
            message: 'board duplicates an existing canonical key',
            canonicalKey,
        })
    })
})
```

- [ ] **Step 2: Run the quality tests and confirm the module is missing**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL because `./quality` does not exist.

- [ ] **Step 3: Add quality contracts and configuration validation**

Create `src/lib/games/ice-slide/quality.ts`:

```ts
import { parseGrid, type IceSlideGridSource } from './physics'
import {
    solveIceSlideBoard,
    type IceSlideSolveResult,
} from './solver'
import { serializeBoardRows } from './transforms'
import type { IceSlideObjectiveId } from './types'

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

function assertPositiveSafeInteger(value: number, field: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError(`${field} must be a positive safe integer`)
    }
}

function assertValidConstraints(
    constraints: IceSlideStageQualityConstraints
): void {
    assertPositiveSafeInteger(constraints.maxStates, 'maxStates')
    assertPositiveSafeInteger(
        constraints.parBand.minMoves,
        'parBand.minMoves'
    )
    assertPositiveSafeInteger(
        constraints.parBand.maxMoves,
        'parBand.maxMoves'
    )
    if (
        constraints.parBand.minMoves >
        constraints.parBand.maxMoves
    ) {
        throw new RangeError(
            'parBand.minMoves must not exceed parBand.maxMoves'
        )
    }
}
```

- [ ] **Step 4: Implement structural validation and duplicate detection**

Add:

```ts
function rejection(
    reason: IceSlideStageRejectionReason,
    message: string,
    extras: {
        canonicalKey?: string
        solveResult?: IceSlideSolveResult
    } = {}
): IceSlideStageQualityResult {
    return {
        accepted: false,
        reason,
        message,
        ...extras,
    }
}

export function validateIceSlideStageQuality(
    candidate: IceSlideStageQualityCandidate,
    constraints: IceSlideStageQualityConstraints
): IceSlideStageQualityResult {
    assertValidConstraints(constraints)

    if (candidate.rows[0]?.length === 0) {
        return rejection(
            'invalid_board',
            'board must have at least one column'
        )
    }

    let grid: ReturnType<typeof parseGrid>
    try {
        grid = parseGrid(candidate)
    } catch (error) {
        return rejection(
            'invalid_board',
            error instanceof Error
                ? error.message
                : 'board parsing failed'
        )
    }

    let startCount = 0
    let goalCount = 0
    let crystalCount = 0
    for (const row of grid) {
        for (const cell of row) {
            if (cell === 'start') startCount++
            if (cell === 'goal') goalCount++
            if (cell === 'crystal') crystalCount++
        }
    }

    if (startCount !== 1) {
        return rejection(
            'invalid_start_count',
            `expected exactly one start tile, found ${startCount}`
        )
    }
    if (goalCount !== 1) {
        return rejection(
            'invalid_goal_count',
            `expected exactly one goal tile, found ${goalCount}`
        )
    }

    const canonicalKey = serializeBoardRows(candidate.rows)
    if (constraints.existingCanonicalKeys?.has(canonicalKey)) {
        return rejection(
            'duplicate_board',
            'board duplicates an existing canonical key',
            { canonicalKey }
        )
    }

    // Solver and policy checks are added in the next step.
    throw new Error(
        `quality policy not implemented for ${canonicalKey} with ${crystalCount} crystals`
    )
}
```

- [ ] **Step 5: Run only the structural tests**

Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/quality.test.ts \
  -t "invalid|missing|multiple|duplicate"
```

Expected: PASS for structural and duplicate cases.

- [ ] **Step 6: Add solver-policy failing tests**

Append to `quality.test.ts`:

```ts
it('rejects a fully explored unsolvable board', () => {
    const result = validateIceSlideStageQuality(
        candidate(['#####', '#S#G#', '#####']),
        ACCEPTING_CONSTRAINTS
    )

    expect(result).toMatchObject({
        accepted: false,
        reason: 'unsolvable',
        solveResult: {
            solvable: false,
            truncated: false,
        },
    })
})

it('rejects state-cap truncation before solvability', () => {
    const result = validateIceSlideStageQuality(candidate(), {
        ...ACCEPTING_CONSTRAINTS,
        maxStates: 1,
    })

    expect(result).toMatchObject({
        accepted: false,
        reason: 'solver_truncated',
        solveResult: {
            solvable: false,
            truncated: true,
        },
    })
})

it.each([
    [{ minMoves: 2, maxMoves: 3 }, 1],
    [{ minMoves: 1, maxMoves: 1 }, 3],
] as const)(
    'rejects computed par outside %o',
    (parBand, expectedPar) => {
        const rows =
            expectedPar === 1
                ? BASIC_ROWS
                : ['######', '#S#..#', '#....#', '##.#.#', '#...G#', '######']
        const result = validateIceSlideStageQuality(candidate(rows), {
            ...ACCEPTING_CONSTRAINTS,
            parBand,
        })

        expect(result).toMatchObject({
            accepted: false,
            reason: 'par_out_of_band',
            solveResult: {
                minMoves: expectedPar,
            },
        })
    }
)

it('rejects an unreachable required crystal', () => {
    const result = validateIceSlideStageQuality(
        candidate(
            [
                '#######',
                '#S...G#',
                '#######',
                '###C###',
                '#######',
            ],
            ['collect_all_crystals']
        ),
        ACCEPTING_CONSTRAINTS
    )

    expect(result).toMatchObject({
        accepted: false,
        reason: 'required_crystal_unreachable',
    })
})

it.each([
    ['collect_all_crystals', 'objective collect_all_crystals'],
    ['no_falls', 'objective no_falls'],
] as const)(
    'rejects ineligible %s',
    (objectiveId, message) => {
        const result = validateIceSlideStageQuality(
            candidate(BASIC_ROWS, [objectiveId]),
            ACCEPTING_CONSTRAINTS
        )

        expect(result).toMatchObject({
            accepted: false,
            reason: 'objective_infeasible',
        })
        if (!result.accepted) {
            expect(result.message).toContain(message)
        }
    }
)

it('returns computed par and canonical rows for an accepted candidate', () => {
    const rows = [
        '#######',
        '#.O.O.#',
        '#..C..#',
        '#G.S..#',
        '#..O..#',
        '#.....#',
        '#######',
    ] as const
    const result = validateIceSlideStageQuality(
        candidate(rows, ['collect_all_crystals', 'no_reset']),
        ACCEPTING_CONSTRAINTS
    )

    expect(result).toEqual({
        accepted: true,
        parMoves: 1,
        canonicalKey: serializeBoardRows(rows),
        solveResult: expect.objectContaining({
            solvable: true,
            minMoves: 1,
            truncated: false,
            reachableCrystalIds: ['2,3'],
        }),
    })
})

it('throws for invalid validator constraints', () => {
    expect(() =>
        validateIceSlideStageQuality(candidate(), {
            parBand: { minMoves: 2, maxMoves: 1 },
            maxStates: 100,
        })
    ).toThrow(/minMoves/)
})
```

- [ ] **Step 7: Run the policy tests and confirm the temporary throw fails**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide/quality.test.ts
```

Expected: FAIL at the temporary `quality policy not implemented` error.

- [ ] **Step 8: Implement the ordered solver policy**

Replace the temporary throw in `validateIceSlideStageQuality()` with:

```ts
const solveResult = solveIceSlideBoard(candidate, {
    maxStates: constraints.maxStates,
})

if (solveResult.truncated) {
    return rejection(
        'solver_truncated',
        `solver reached the ${constraints.maxStates}-state cap`,
        { canonicalKey, solveResult }
    )
}

if (!solveResult.solvable || solveResult.minMoves === null) {
    return rejection(
        'unsolvable',
        'goal is unreachable under current Ice Slide physics',
        { canonicalKey, solveResult }
    )
}

if (
    solveResult.minMoves < constraints.parBand.minMoves ||
    solveResult.minMoves > constraints.parBand.maxMoves
) {
    return rejection(
        'par_out_of_band',
        `computed par ${solveResult.minMoves} is outside inclusive band ` +
            `${constraints.parBand.minMoves}..${constraints.parBand.maxMoves}`,
        { canonicalKey, solveResult }
    )
}

if (
    candidate.objectiveIds.includes('collect_all_crystals') &&
    solveResult.reachableCrystalIds.length < crystalCount
) {
    return rejection(
        'required_crystal_unreachable',
        `only ${solveResult.reachableCrystalIds.length} of ` +
            `${crystalCount} required crystals are reachable`,
        { canonicalKey, solveResult }
    )
}

for (const objectiveId of candidate.objectiveIds) {
    if (!solveResult.objectiveFeasibility[objectiveId]) {
        return rejection(
            'objective_infeasible',
            `objective ${objectiveId} is not feasible for this board`,
            { canonicalKey, solveResult }
        )
    }
}

return {
    accepted: true,
    parMoves: solveResult.minMoves,
    canonicalKey,
    solveResult,
}
```

- [ ] **Step 9: Run the complete quality and solver suites**

Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts
```

Expected: PASS.

- [ ] **Step 10: Run format and lint**

Run:

```bash
bunx prettier --write \
  src/lib/games/ice-slide/quality.ts \
  src/lib/games/ice-slide/quality.test.ts
bunx eslint \
  src/lib/games/ice-slide/quality.ts \
  src/lib/games/ice-slide/quality.test.ts
```

Expected: both commands exit successfully.

- [ ] **Step 11: Commit Task 3**

```bash
git add \
  src/lib/games/ice-slide/quality.ts \
  src/lib/games/ice-slide/quality.test.ts
git commit -m "feat(ice-slide): validate generated stage quality"
```

---

### Task 4: Replace test-only BFS and verify the repository

**Files:**
- Modify: `src/lib/games/ice-slide/physics.test.ts`
- Test: all Ice Slide tests and full repository verification.

**Interfaces:**
- Consumes: `solveIceSlideBoard()` from Task 1 and complete crystal reporting from Task 2.
- Produces: Campaign regression coverage with no duplicated local BFS.

- [ ] **Step 1: Replace the minimum-move helper**

In `physics.test.ts`:

1. Add:

```ts
import { solveIceSlideBoard } from './solver'
```

2. Delete the local `minMoves()` function inside `describe('ice-slide levels', ...)`.
3. Replace the Campaign solvability test body with:

```ts
it('ships exactly 8 solvable levels with matching parMoves', () => {
    expect(ICE_SLIDE_LEVELS).toHaveLength(8)

    for (const level of ICE_SLIDE_LEVELS) {
        const result = solveIceSlideBoard(level, {
            maxStates: 10_000,
        })

        expect(result.truncated, `level ${level.id} truncated`).toBe(false)
        expect(result.solvable, `level ${level.id} solvable`).toBe(true)
        expect(result.minMoves, `level ${level.id} par`).toBe(
            level.parMoves
        )
    }
})
```

- [ ] **Step 2: Replace the crystal-reachability BFS**

Delete the second queue/`Set` traversal from
`it('makes every authored crystal collectable on a reachable slide', ...)`.

Use:

```ts
it('makes every authored crystal collectable on a reachable slide', () => {
    for (const level of ICE_SLIDE_LEVELS) {
        const expectedCrystalIds: string[] = []

        for (let row = 0; row < level.rows.length; row++) {
            for (let col = 0; col < level.rows[row].length; col++) {
                if (level.rows[row][col] === 'C') {
                    expectedCrystalIds.push(`${row},${col}`)
                }
            }
        }

        const result = solveIceSlideBoard(level, {
            maxStates: 10_000,
        })

        expect(result.truncated, `level ${level.id} truncated`).toBe(false)
        expect(
            result.reachableCrystalIds,
            `level ${level.id} reachable crystals`
        ).toEqual(expectedCrystalIds)
    }
})
```

Remove imports that were used only by the deleted BFS. Keep `cloneGrid` because the
earlier deep-clone test still uses it.

- [ ] **Step 3: Run targeted Ice Slide tests**

Run:

```bash
bun run test:run -- \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/physics.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run all Ice Slide tests**

Run:

```bash
bun run test:run -- src/lib/games/ice-slide
```

Expected: PASS.

- [ ] **Step 5: Run repository tests**

Run:

```bash
bun run test:run
```

Expected: PASS with no new failures.

- [ ] **Step 6: Run lint and format checks**

Run:

```bash
bun run lint
bun run format:check
```

Expected: both commands exit successfully.

- [ ] **Step 7: Run typecheck and compare against `main`**

Run on the implementation branch:

```bash
bun run typecheck 2>&1 | tee /tmp/hpa-486-typecheck.txt
```

Run the same command on a clean `main` worktree or the implementation base commit:

```bash
bun run typecheck 2>&1 | tee /tmp/hpa-486-main-typecheck.txt
diff -u /tmp/hpa-486-main-typecheck.txt /tmp/hpa-486-typecheck.txt
```

Expected: no new diagnostic introduced by HPA-486. PR #53 reported two pre-existing
diagnostics in `init.ts` and `init.test.ts`; use the current base output as the source of
truth rather than assuming that baseline is unchanged.

- [ ] **Step 8: Verify the changed-file boundary**

Run:

```bash
git diff --name-only origin/main...HEAD
```

Expected implementation paths:

```text
src/lib/games/ice-slide/physics.test.ts
src/lib/games/ice-slide/quality.test.ts
src/lib/games/ice-slide/quality.ts
src/lib/games/ice-slide/solver.test.ts
src/lib/games/ice-slide/solver.ts
```

Documentation from the planning PR is not part of the implementation branch unless the
implementation intentionally branches from the merged planning commit.

- [ ] **Step 9: Commit Task 4**

```bash
git add src/lib/games/ice-slide/physics.test.ts
git commit -m "test(ice-slide): use production solver for campaign content"
```

- [ ] **Step 10: Prepare the implementation PR summary**

Use this PR scope:

```markdown
## Summary

Implements HPA-486 by extracting the Ice Slide Campaign BFS into a bounded pure
production solver and adding deterministic stage-quality validation for later Daily and
Expedition generation.

## Changes

- add player-position + consumed-crystal BFS state;
- report exact par, stops, crystals, objective feasibility, explored states, and
  truncation;
- add ordered structural, duplicate, par-band, objective, and cap rejection results;
- replace duplicated Campaign BFS assertions with production-solver tests.

## YAGNI boundaries

- no generator loop or fallback selection;
- no runtime solver integration;
- no generic graph-search framework;
- no snow, cracked ice, Undo, or solution paths.

## Verification

- targeted Ice Slide suites;
- full test suite;
- lint and format checks;
- typecheck compared with the current `main` baseline.
```

Create the implementation PR as a draft and link HPA-486. Do not enable auto-merge.

---

## Plan Self-Review

### Spec coverage

- Bounded BFS and exact minimum: Task 1.
- Consumed-crystal state and objective feasibility: Task 2.
- Structural, duplicate, par, objective, and truncation rejection: Task 3.
- Campaign compatibility and removal of duplicate BFS: Task 4.
- Determinism, immutability, explicit caps, and no runtime integration: Tasks 1–4 and
  Global Constraints.
- Cracked-ice extension point: private `encodeStateKey()` in Task 1, with no unused
  dynamic state added.

### Placeholder scan

The plan contains no unresolved placeholder or unspecified error-handling step. The
deliberate temporary throw in Task 3 is a TDD checkpoint and is explicitly removed
within the same task.

### Type consistency

- `maxStates`, `parBand.minMoves`, and `parBand.maxMoves` are consistent across the
  design, tests, and implementation.
- `reachableCrystalIds` uses zero-based `"row,col"` strings everywhere.
- `validateIceSlideStageQuality()` returns the same discriminated union consumed by all
  tests.
- Truncation semantics are identical in solver and quality policy.
