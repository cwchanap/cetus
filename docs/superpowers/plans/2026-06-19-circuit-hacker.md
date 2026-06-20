# Circuit Hacker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Circuit Hacker", a PixiJS tile-rotation puzzle (13th Cetus game) where the player rotates circuit tiles to power a path from a source node to one or more cores before a countdown expires.

**Architecture:** Follows the self-contained PixiJS game pattern used by Evader (`types.ts` → `utils.ts` → `generator.ts` → `game.ts` → `renderer.ts` → `init.ts`), not the optional `BaseGame` framework. Pure logic (connector math, power flood-fill, scoring, puzzle generation) lives in `utils.ts`/`generator.ts` and is unit-tested in isolation. The `CircuitHackerGame` class owns state and rules; the functional renderer draws to a PixiJS canvas and maps pointer coordinates to grid cells; `init.ts` wires game + renderer + DOM + score submission. Puzzles are solvable by construction (carve solution → scramble).

**Tech Stack:** Astro 5 (SSR), TypeScript, PixiJS 8, Vitest + jsdom, Tailwind CSS 4, Bun.

## Global Constraints

- Package manager / runner: **Bun**. Run tests with `bun run test:run <path>`.
- Import alias: `@/` maps to `src/` (e.g. `@/lib/games`). Use it for cross-module imports.
- All game HTML structure lives in the Astro page; TypeScript only manipulates dynamic content and the canvas (project Astro–TS rule). Never build structure with `innerHTML` except the documented error-fallback block.
- Game IDs are the single source of truth in `src/lib/games.ts` (`GameID` enum). Validation (`validations.ts`) and `formatGameName` auto-derive from it — do not touch them.
- Tests must pass with PixiJS mocked (`vi.mock('pixi.js', …)`); never rely on a real WebGL context in unit tests.
- Score submission goes through `saveGameScore(gameId, score, onSuccess, onError, gameData)` from `@/lib/services/scoreService`. It already no-ops when `score <= 0`.
- New game id string: `circuit_hacker`. Enum member: `GameID.CIRCUIT_HACKER`. Route: `/circuit-hacker`. Icon: `🔌`. Display name: `Circuit Hacker`.
- Difficulty tiers and constants (verbatim):
  - easy: 5×5, 1 core, 0 blockers, 120s, ×1
  - medium: 7×7, 1 core, 3 blockers, 180s, ×2
  - hard: 9×9, 2 cores, 6 blockers, 240s, ×3.5
  - expert: 11×11, 3 cores, 10 blockers, 300s, ×5
- Scoring (verbatim): `finalScore = round((1000 + secondsRemaining*15 + max(0, rotatableTileCount*2 - rotationsUsed)*25) * multiplier)`.

---

### Task 1: Types & connector math

**Files:**
- Create: `src/lib/games/circuit-hacker/types.ts`
- Create: `src/lib/games/circuit-hacker/utils.ts`
- Test: `src/lib/games/circuit-hacker/utils.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `types.ts`: `Direction = 'N'|'E'|'S'|'W'`; `Difficulty = 'easy'|'medium'|'hard'|'expert'`; `TileType = 'straight'|'elbow'|'t-junction'|'cross'|'source'|'core'|'blocker'`; `Tile = { type: TileType; orientation: number; locked: boolean; powered: boolean }`; `GridPosition = { row: number; col: number }`; `DifficultyConfig = { difficulty: Difficulty; rows: number; cols: number; cores: number; blockers: number; duration: number; multiplier: number }`; `CircuitHackerConfig = { difficulty: Difficulty; cellSize: number }`; `CircuitHackerGameData = { difficulty: Difficulty; secondsRemaining: number; rotationsUsed: number; solved: boolean }`; `CircuitHackerStats = { finalScore: number; difficulty: Difficulty; secondsRemaining: number; rotationsUsed: number; solved: boolean }`; `CircuitHackerState = { grid: Tile[][]; sourcePos: GridPosition; corePositions: GridPosition[]; rows: number; cols: number; score: number; timeRemaining: number; rotationsUsed: number; isGameActive: boolean; isGameOver: boolean; solved: boolean }`; `CircuitHackerCallbacks = { onTimeUpdate: (t: number) => void; onRotation: (rotationsUsed: number) => void; onSolved: (finalScore: number, stats: CircuitHackerStats) => void; onFail: (stats: CircuitHackerStats) => void; onGameStart: () => void }`.
  - `utils.ts`: `oppositeDirection(dir: Direction): Direction`; `rotateConnectors(connectors: Direction[], times: number): Direction[]`; `getBaseConnectors(type: TileType): Direction[]`; `getConnectors(tile: Tile): Direction[]`; `cellsConnect(from: Tile, dir: Direction, to: Tile): boolean`.

- [ ] **Step 1: Write `types.ts`** (types only, no logic)

```typescript
// src/lib/games/circuit-hacker/types.ts

// Edge direction of a tile connector
export type Direction = 'N' | 'E' | 'S' | 'W'

// Difficulty tiers (chosen up front)
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'

// Shapes a tile can take
export type TileType =
    | 'straight'
    | 'elbow'
    | 't-junction'
    | 'cross'
    | 'source'
    | 'core'
    | 'blocker'

// A single grid cell
export interface Tile {
    type: TileType
    // number of 90° clockwise rotations from the base orientation (0..3)
    orientation: number
    // locked tiles (source, core, blocker) cannot be rotated by the player
    locked: boolean
    // currently reachable from the source through matching connectors
    powered: boolean
}

export interface GridPosition {
    row: number
    col: number
}

// Per-difficulty configuration
export interface DifficultyConfig {
    difficulty: Difficulty
    rows: number
    cols: number
    cores: number
    blockers: number
    duration: number // seconds
    multiplier: number
}

// Runtime game configuration
export interface CircuitHackerConfig {
    difficulty: Difficulty
    cellSize: number // pixels per tile on the canvas
}

// Submitted with the score and used for achievement checks
export interface CircuitHackerGameData {
    difficulty: Difficulty
    secondsRemaining: number
    rotationsUsed: number
    solved: boolean
}

// Returned at game end
export interface CircuitHackerStats {
    finalScore: number
    difficulty: Difficulty
    secondsRemaining: number
    rotationsUsed: number
    solved: boolean
}

export interface CircuitHackerState {
    grid: Tile[][]
    sourcePos: GridPosition
    corePositions: GridPosition[]
    rows: number
    cols: number
    score: number
    timeRemaining: number
    rotationsUsed: number
    isGameActive: boolean
    isGameOver: boolean
    solved: boolean
}

export interface CircuitHackerCallbacks {
    onTimeUpdate: (timeRemaining: number) => void
    onRotation: (rotationsUsed: number) => void
    onSolved: (finalScore: number, stats: CircuitHackerStats) => void
    onFail: (stats: CircuitHackerStats) => void
    onGameStart: () => void
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/games/circuit-hacker/utils.test.ts
import { describe, it, expect } from 'vitest'
import {
    oppositeDirection,
    rotateConnectors,
    getBaseConnectors,
    getConnectors,
    cellsConnect,
} from './utils'
import type { Tile } from './types'

const tile = (type: Tile['type'], orientation = 0): Tile => ({
    type,
    orientation,
    locked: false,
    powered: false,
})

describe('connector math', () => {
    it('returns opposite directions', () => {
        expect(oppositeDirection('N')).toBe('S')
        expect(oppositeDirection('S')).toBe('N')
        expect(oppositeDirection('E')).toBe('W')
        expect(oppositeDirection('W')).toBe('E')
    })

    it('rotates connectors clockwise', () => {
        expect(rotateConnectors(['N'], 1)).toEqual(['E'])
        expect(rotateConnectors(['N'], 2)).toEqual(['S'])
        expect(rotateConnectors(['N', 'E'], 1).sort()).toEqual(['E', 'S'])
        expect(rotateConnectors(['N'], 4)).toEqual(['N'])
    })

    it('defines base connectors per tile type', () => {
        expect(getBaseConnectors('straight').sort()).toEqual(['N', 'S'])
        expect(getBaseConnectors('elbow').sort()).toEqual(['E', 'N'])
        expect(getBaseConnectors('t-junction').sort()).toEqual(['E', 'N', 'S'])
        expect(getBaseConnectors('cross').sort()).toEqual(['E', 'N', 'S', 'W'])
        expect(getBaseConnectors('source')).toEqual(['N'])
        expect(getBaseConnectors('core')).toEqual(['N'])
        expect(getBaseConnectors('blocker')).toEqual([])
    })

    it('applies orientation to connectors', () => {
        expect(getConnectors(tile('straight', 1)).sort()).toEqual(['E', 'W'])
        expect(getConnectors(tile('source', 1))).toEqual(['E'])
    })

    it('connects two tiles only when both face each other', () => {
        // straight vertical (N,S) above a straight vertical: A's S meets B's N
        expect(cellsConnect(tile('straight', 0), 'S', tile('straight', 0))).toBe(
            true
        )
        // straight horizontal has no S connector
        expect(cellsConnect(tile('straight', 1), 'S', tile('straight', 0))).toBe(
            false
        )
        // blocker never connects
        expect(cellsConnect(tile('cross'), 'E', tile('blocker'))).toBe(false)
    })
})
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `bun run test:run src/lib/games/circuit-hacker/utils.test.ts`
Expected: FAIL — `Failed to resolve import "./utils"` / functions not defined.

- [ ] **Step 4: Write `utils.ts` connector functions**

```typescript
// src/lib/games/circuit-hacker/utils.ts
import type { Direction, Tile, TileType } from './types'

const CLOCKWISE: Direction[] = ['N', 'E', 'S', 'W']

export function oppositeDirection(dir: Direction): Direction {
    switch (dir) {
        case 'N':
            return 'S'
        case 'S':
            return 'N'
        case 'E':
            return 'W'
        case 'W':
            return 'E'
    }
}

export function rotateConnectors(
    connectors: Direction[],
    times: number
): Direction[] {
    const steps = ((times % 4) + 4) % 4
    return connectors.map(dir => {
        const idx = CLOCKWISE.indexOf(dir)
        return CLOCKWISE[(idx + steps) % 4]
    })
}

export function getBaseConnectors(type: TileType): Direction[] {
    switch (type) {
        case 'straight':
            return ['N', 'S']
        case 'elbow':
            return ['N', 'E']
        case 't-junction':
            return ['N', 'E', 'S']
        case 'cross':
            return ['N', 'E', 'S', 'W']
        case 'source':
            return ['N']
        case 'core':
            return ['N']
        case 'blocker':
            return []
    }
}

export function getConnectors(tile: Tile): Direction[] {
    return rotateConnectors(getBaseConnectors(tile.type), tile.orientation)
}

export function cellsConnect(from: Tile, dir: Direction, to: Tile): boolean {
    return (
        getConnectors(from).includes(dir) &&
        getConnectors(to).includes(oppositeDirection(dir))
    )
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `bun run test:run src/lib/games/circuit-hacker/utils.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/games/circuit-hacker/types.ts src/lib/games/circuit-hacker/utils.ts src/lib/games/circuit-hacker/utils.test.ts
git commit -m "feat(circuit-hacker): add types and connector math"
```

---

### Task 2: Power flood-fill & win check

**Files:**
- Modify: `src/lib/games/circuit-hacker/utils.ts`
- Test: `src/lib/games/circuit-hacker/utils.test.ts`

**Interfaces:**
- Consumes: `cellsConnect`, `Tile`, `GridPosition` from Task 1.
- Produces: `computePoweredCells(grid: Tile[][], source: GridPosition): boolean[][]`; `isSolved(grid: Tile[][], source: GridPosition, cores: GridPosition[]): boolean`.

- [ ] **Step 1: Add the failing test** (append inside `utils.test.ts`)

```typescript
import { computePoweredCells, isSolved } from './utils'
import type { GridPosition } from './types'

const t = (type: Tile['type'], orientation = 0, locked = false): Tile => ({
    type,
    orientation,
    locked,
    powered: false,
})

describe('power flood-fill', () => {
    // 1x3 row: source(→E) — straight(horizontal) — core(←W)
    // source base 'N' rotated to 'E' = orientation 1
    // core base 'N' rotated to 'W' = orientation 3
    const source: GridPosition = { row: 0, col: 0 }
    const cores: GridPosition[] = [{ row: 0, col: 2 }]

    it('powers a fully connected line', () => {
        const grid: Tile[][] = [
            [t('source', 1, true), t('straight', 1), t('core', 3, true)],
        ]
        const powered = computePoweredCells(grid, source)
        expect(powered[0][0]).toBe(true)
        expect(powered[0][1]).toBe(true)
        expect(powered[0][2]).toBe(true)
        expect(isSolved(grid, source, cores)).toBe(true)
    })

    it('does not power past a broken connection', () => {
        // middle straight left vertical (orientation 0 -> N,S) breaks the row
        const grid: Tile[][] = [
            [t('source', 1, true), t('straight', 0), t('core', 3, true)],
        ]
        const powered = computePoweredCells(grid, source)
        expect(powered[0][0]).toBe(true)
        expect(powered[0][1]).toBe(false)
        expect(powered[0][2]).toBe(false)
        expect(isSolved(grid, source, cores)).toBe(false)
    })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test:run src/lib/games/circuit-hacker/utils.test.ts`
Expected: FAIL — `computePoweredCells`/`isSolved` not exported.

- [ ] **Step 3: Implement power flood-fill in `utils.ts`** (append)

```typescript
import type { Direction, GridPosition } from './types'

// (Direction already imported in Task 1; keep a single import line at top.)

const DELTA: Record<Direction, { dr: number; dc: number }> = {
    N: { dr: -1, dc: 0 },
    E: { dr: 0, dc: 1 },
    S: { dr: 1, dc: 0 },
    W: { dr: 0, dc: -1 },
}

export function computePoweredCells(
    grid: Tile[][],
    source: GridPosition
): boolean[][] {
    const rows = grid.length
    const cols = rows > 0 ? grid[0].length : 0
    const powered: boolean[][] = grid.map(row => row.map(() => false))

    const queue: GridPosition[] = [source]
    powered[source.row][source.col] = true

    while (queue.length > 0) {
        const { row, col } = queue.shift() as GridPosition
        const from = grid[row][col]
        for (const dir of ['N', 'E', 'S', 'W'] as Direction[]) {
            const nr = row + DELTA[dir].dr
            const nc = col + DELTA[dir].dc
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
                continue
            }
            if (powered[nr][nc]) {
                continue
            }
            if (cellsConnect(from, dir, grid[nr][nc])) {
                powered[nr][nc] = true
                queue.push({ row: nr, col: nc })
            }
        }
    }

    return powered
}

export function isSolved(
    grid: Tile[][],
    source: GridPosition,
    cores: GridPosition[]
): boolean {
    const powered = computePoweredCells(grid, source)
    return cores.every(core => powered[core.row][core.col])
}
```

> Note: merge the `Direction`/`GridPosition` import with the existing top-of-file import from Task 1 rather than adding a duplicate `import` line.

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test:run src/lib/games/circuit-hacker/utils.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/circuit-hacker/utils.ts src/lib/games/circuit-hacker/utils.test.ts
git commit -m "feat(circuit-hacker): add power flood-fill and win check"
```

---

### Task 3: Difficulty configs & scoring

**Files:**
- Modify: `src/lib/games/circuit-hacker/utils.ts`
- Test: `src/lib/games/circuit-hacker/utils.test.ts`

**Interfaces:**
- Consumes: `Tile`, `Difficulty`, `DifficultyConfig` from Task 1.
- Produces: `DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig>`; `countRotatableTiles(grid: Tile[][]): number`; `computeFinalScore(params: { secondsRemaining: number; rotationsUsed: number; rotatableTileCount: number; multiplier: number }): number`.

- [ ] **Step 1: Add the failing test** (append inside `utils.test.ts`)

```typescript
import {
    DIFFICULTY_CONFIGS,
    countRotatableTiles,
    computeFinalScore,
} from './utils'

describe('difficulty configs & scoring', () => {
    it('defines all four tiers with the agreed constants', () => {
        expect(DIFFICULTY_CONFIGS.easy).toMatchObject({
            rows: 5,
            cols: 5,
            cores: 1,
            blockers: 0,
            duration: 120,
            multiplier: 1,
        })
        expect(DIFFICULTY_CONFIGS.expert).toMatchObject({
            rows: 11,
            cols: 11,
            cores: 3,
            blockers: 10,
            duration: 300,
            multiplier: 5,
        })
    })

    it('counts only unlocked tiles as rotatable', () => {
        const grid: Tile[][] = [
            [t('source', 0, true), t('straight'), t('blocker', 0, true)],
            [t('elbow'), t('core', 0, true), t('cross')],
        ]
        expect(countRotatableTiles(grid)).toBe(3)
    })

    it('computes final score with the agreed formula', () => {
        // base 1000 + time 30*15=450 + rotationBonus max(0, 10*2 - 8)*25 = 300
        // sum 1750 * multiplier 2 = 3500
        expect(
            computeFinalScore({
                secondsRemaining: 30,
                rotationsUsed: 8,
                rotatableTileCount: 10,
                multiplier: 2,
            })
        ).toBe(3500)
    })

    it('floors rotation bonus at zero when over budget', () => {
        // base 1000 + 0 time + max(0, 2*2 - 99)*25 = 0 -> 1000 * 1
        expect(
            computeFinalScore({
                secondsRemaining: 0,
                rotationsUsed: 99,
                rotatableTileCount: 2,
                multiplier: 1,
            })
        ).toBe(1000)
    })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test:run src/lib/games/circuit-hacker/utils.test.ts`
Expected: FAIL — new exports undefined.

- [ ] **Step 3: Implement configs & scoring in `utils.ts`** (append)

```typescript
import type { Difficulty, DifficultyConfig } from './types'
// (merge with existing top-of-file type import)

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
    easy: {
        difficulty: 'easy',
        rows: 5,
        cols: 5,
        cores: 1,
        blockers: 0,
        duration: 120,
        multiplier: 1,
    },
    medium: {
        difficulty: 'medium',
        rows: 7,
        cols: 7,
        cores: 1,
        blockers: 3,
        duration: 180,
        multiplier: 2,
    },
    hard: {
        difficulty: 'hard',
        rows: 9,
        cols: 9,
        cores: 2,
        blockers: 6,
        duration: 240,
        multiplier: 3.5,
    },
    expert: {
        difficulty: 'expert',
        rows: 11,
        cols: 11,
        cores: 3,
        blockers: 10,
        duration: 300,
        multiplier: 5,
    },
}

export function countRotatableTiles(grid: Tile[][]): number {
    let count = 0
    for (const row of grid) {
        for (const tile of row) {
            if (!tile.locked) {
                count++
            }
        }
    }
    return count
}

export function computeFinalScore(params: {
    secondsRemaining: number
    rotationsUsed: number
    rotatableTileCount: number
    multiplier: number
}): number {
    const base = 1000
    const timeBonus = params.secondsRemaining * 15
    const rotationBudget = params.rotatableTileCount * 2
    const rotationBonus =
        Math.max(0, rotationBudget - params.rotationsUsed) * 25
    return Math.round(
        (base + timeBonus + rotationBonus) * params.multiplier
    )
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test:run src/lib/games/circuit-hacker/utils.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/circuit-hacker/utils.ts src/lib/games/circuit-hacker/utils.test.ts
git commit -m "feat(circuit-hacker): add difficulty configs and scoring"
```

---

### Task 4: Puzzle generator

**Files:**
- Create: `src/lib/games/circuit-hacker/generator.ts`
- Test: `src/lib/games/circuit-hacker/generator.test.ts`

**Interfaces:**
- Consumes: `DifficultyConfig`, `Tile`, `GridPosition`, `Direction` from Task 1; `getBaseConnectors`, `rotateConnectors`, `isSolved`, `computePoweredCells` from Tasks 1–2.
- Produces: `GeneratedPuzzle = { grid: Tile[][]; sourcePos: GridPosition; corePositions: GridPosition[]; solutionOrientations: number[][] }`; `generatePuzzle(config: DifficultyConfig, rng?: () => number): GeneratedPuzzle`.

The generator builds a *solved* board, records each cell's solved orientation, then scrambles rotatable tiles. Solvability is guaranteed because applying `solutionOrientations` reconnects the source to every core.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/games/circuit-hacker/generator.test.ts
import { describe, it, expect } from 'vitest'
import { generatePuzzle } from './generator'
import { DIFFICULTY_CONFIGS, computePoweredCells } from './utils'
import type { Difficulty, Tile } from './types'

// Deterministic LCG so tests are reproducible
function seededRng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0xffffffff
    }
}

const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'expert']

describe('generatePuzzle', () => {
    it.each(difficulties)(
        'produces a grid of the right shape and counts for %s',
        difficulty => {
            const config = DIFFICULTY_CONFIGS[difficulty]
            const puzzle = generatePuzzle(config, seededRng(42))

            expect(puzzle.grid).toHaveLength(config.rows)
            for (const row of puzzle.grid) {
                expect(row).toHaveLength(config.cols)
            }

            const flat = puzzle.grid.flat()
            expect(flat.filter(t => t.type === 'source')).toHaveLength(1)
            expect(flat.filter(t => t.type === 'core')).toHaveLength(
                config.cores
            )
            expect(flat.filter(t => t.type === 'blocker')).toHaveLength(
                config.blockers
            )
            expect(puzzle.corePositions).toHaveLength(config.cores)
        }
    )

    it.each(difficulties)(
        'is solvable by construction for %s',
        difficulty => {
            const config = DIFFICULTY_CONFIGS[difficulty]
            const puzzle = generatePuzzle(config, seededRng(7))

            // Apply the recorded solution orientations
            const solved: Tile[][] = puzzle.grid.map((row, r) =>
                row.map((tile, c) => ({
                    ...tile,
                    orientation: puzzle.solutionOrientations[r][c],
                }))
            )
            const powered = computePoweredCells(solved, puzzle.sourcePos)
            for (const core of puzzle.corePositions) {
                expect(powered[core.row][core.col]).toBe(true)
            }
        }
    )

    it('marks source, core and blocker tiles as locked', () => {
        const puzzle = generatePuzzle(DIFFICULTY_CONFIGS.hard, seededRng(3))
        for (const row of puzzle.grid) {
            for (const tile of row) {
                if (
                    tile.type === 'source' ||
                    tile.type === 'core' ||
                    tile.type === 'blocker'
                ) {
                    expect(tile.locked).toBe(true)
                } else {
                    expect(tile.locked).toBe(false)
                }
            }
        }
    })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test:run src/lib/games/circuit-hacker/generator.test.ts`
Expected: FAIL — `Failed to resolve import "./generator"`.

- [ ] **Step 3: Implement `generator.ts`**

```typescript
// src/lib/games/circuit-hacker/generator.ts
import type {
    DifficultyConfig,
    Direction,
    GridPosition,
    Tile,
    TileType,
} from './types'
import { getBaseConnectors, rotateConnectors } from './utils'

export interface GeneratedPuzzle {
    grid: Tile[][]
    sourcePos: GridPosition
    corePositions: GridPosition[]
    solutionOrientations: number[][]
}

const ALL_DIRS: Direction[] = ['N', 'E', 'S', 'W']
const DELTA: Record<Direction, { dr: number; dc: number }> = {
    N: { dr: -1, dc: 0 },
    E: { dr: 0, dc: 1 },
    S: { dr: 1, dc: 0 },
    W: { dr: 0, dc: -1 },
}

function key(pos: GridPosition): string {
    return `${pos.row},${pos.col}`
}

function inBounds(pos: GridPosition, rows: number, cols: number): boolean {
    return pos.row >= 0 && pos.row < rows && pos.col >= 0 && pos.col < cols
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
    const copy = [...arr]
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
}

// Random simple path from start to goal via randomized DFS over a fresh grid.
function findPath(
    start: GridPosition,
    goal: GridPosition,
    rows: number,
    cols: number,
    rng: () => number
): GridPosition[] | null {
    const visited = new Set<string>([key(start)])
    const stack: GridPosition[][] = [[start]]

    while (stack.length > 0) {
        const path = stack.pop() as GridPosition[]
        const head = path[path.length - 1]
        if (head.row === goal.row && head.col === goal.col) {
            return path
        }
        for (const dir of shuffle(ALL_DIRS, rng)) {
            const next = {
                row: head.row + DELTA[dir].dr,
                col: head.col + DELTA[dir].dc,
            }
            if (!inBounds(next, rows, cols) || visited.has(key(next))) {
                continue
            }
            visited.add(key(next))
            stack.push([...path, next])
        }
    }
    return null
}

// Pick the tile type + orientation whose connectors equal a required dir set.
function tileForDirections(dirs: Set<Direction>): {
    type: TileType
    orientation: number
} {
    const required = ALL_DIRS.filter(d => dirs.has(d))
    const candidates: TileType[] =
        required.length === 1
            ? [] // handled by source/core elsewhere
            : ['straight', 'elbow', 't-junction', 'cross']

    for (const type of candidates) {
        for (let orientation = 0; orientation < 4; orientation++) {
            const conn = rotateConnectors(
                getBaseConnectors(type),
                orientation
            )
            if (
                conn.length === required.length &&
                required.every(d => conn.includes(d))
            ) {
                return { type, orientation }
            }
        }
    }
    // Fallback (should not happen for size 2..4): a cross covers any set
    return { type: 'cross', orientation: 0 }
}

function orientationForSingle(dir: Direction): number {
    for (let orientation = 0; orientation < 4; orientation++) {
        if (rotateConnectors(['N'], orientation)[0] === dir) {
            return orientation
        }
    }
    return 0
}

export function generatePuzzle(
    config: DifficultyConfig,
    rng: () => number = Math.random
): GeneratedPuzzle {
    const { rows, cols, cores, blockers } = config

    const allCells: GridPosition[] = []
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            allCells.push({ row: r, col: c })
        }
    }

    const shuffled = shuffle(allCells, rng)
    const sourcePos = shuffled[0]
    const corePositions = shuffled.slice(1, 1 + cores)

    // Accumulate the directions each cell needs in the solved state.
    const required: Map<string, Set<Direction>> = new Map()
    const addDir = (pos: GridPosition, dir: Direction) => {
        const k = key(pos)
        if (!required.has(k)) {
            required.set(k, new Set())
        }
        required.get(k)!.add(dir)
    }
    const dirBetween = (a: GridPosition, b: GridPosition): Direction => {
        if (b.row === a.row - 1) return 'N'
        if (b.row === a.row + 1) return 'S'
        if (b.col === a.col + 1) return 'E'
        return 'W'
    }

    const pathCells = new Set<string>([key(sourcePos)])
    for (const core of corePositions) {
        const path = findPath(sourcePos, core, rows, cols, rng)
        if (!path) {
            continue
        }
        for (let i = 0; i < path.length; i++) {
            pathCells.add(key(path[i]))
            if (i > 0) {
                addDir(path[i], dirBetween(path[i], path[i - 1]))
            }
            if (i < path.length - 1) {
                addDir(path[i], dirBetween(path[i], path[i + 1]))
            }
        }
        pathCells.add(key(core))
    }

    // Build the solved grid.
    const grid: Tile[][] = []
    const solutionOrientations: number[][] = []
    for (let r = 0; r < rows; r++) {
        const gridRow: Tile[] = []
        const solRow: number[] = []
        for (let c = 0; c < cols; c++) {
            const pos = { row: r, col: c }
            const k = key(pos)
            const dirs = required.get(k) ?? new Set<Direction>()

            let type: TileType
            let orientation: number
            let locked = false

            if (pos.row === sourcePos.row && pos.col === sourcePos.col) {
                type = 'source'
                orientation = orientationForSingle([...dirs][0] ?? 'N')
                locked = true
            } else if (corePositions.some(p => key(p) === k)) {
                type = 'core'
                orientation = orientationForSingle([...dirs][0] ?? 'N')
                locked = true
            } else if (pathCells.has(k)) {
                const t = tileForDirections(dirs)
                type = t.type
                orientation = t.orientation
            } else {
                // Decoy cell: random pipe tile (loose ends are allowed).
                const decoys: TileType[] = [
                    'straight',
                    'elbow',
                    't-junction',
                    'cross',
                ]
                type = decoys[Math.floor(rng() * decoys.length)]
                orientation = Math.floor(rng() * 4)
            }

            gridRow.push({ type, orientation, locked, powered: false })
            solRow.push(orientation)
        }
        grid.push(gridRow)
        solutionOrientations.push(solRow)
    }

    // Place blockers on non-path, non-source/core cells.
    const blockerCandidates = shuffle(
        allCells.filter(p => !pathCells.has(key(p))),
        rng
    ).slice(0, blockers)
    for (const pos of blockerCandidates) {
        grid[pos.row][pos.col] = {
            type: 'blocker',
            orientation: 0,
            locked: true,
            powered: false,
        }
        solutionOrientations[pos.row][pos.col] = 0
    }

    // Scramble every rotatable tile to a random orientation.
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!grid[r][c].locked) {
                grid[r][c].orientation = Math.floor(rng() * 4)
            }
        }
    }

    return { grid, sourcePos, corePositions, solutionOrientations }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test:run src/lib/games/circuit-hacker/generator.test.ts`
Expected: PASS. If any "solvable" case fails for a seed, it indicates a path/tile-assignment bug — fix `tileForDirections`/path accumulation, do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/circuit-hacker/generator.ts src/lib/games/circuit-hacker/generator.test.ts
git commit -m "feat(circuit-hacker): add solvable puzzle generator"
```

---

### Task 5: Game class

**Files:**
- Create: `src/lib/games/circuit-hacker/game.ts`
- Test: `src/lib/games/circuit-hacker/game.test.ts`

**Interfaces:**
- Consumes: types from Task 1; `DIFFICULTY_CONFIGS`, `computePoweredCells`, `isSolved`, `countRotatableTiles`, `computeFinalScore` from Tasks 2–3; `generatePuzzle` from Task 4.
- Produces: class `CircuitHackerGame` with `constructor(config: CircuitHackerConfig, callbacks: CircuitHackerCallbacks, rng?: () => number)`; methods `startGame(): void`, `rotateTile(row: number, col: number): void`, `stopGame(): void`, `getState(): CircuitHackerState`, `getStats(): CircuitHackerStats`, `cleanup(): void`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/games/circuit-hacker/game.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitHackerGame } from './game'
import type { CircuitHackerCallbacks, CircuitHackerConfig } from './types'

function seededRng(seed: number): () => number {
    let s = seed >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0xffffffff
    }
}

const config: CircuitHackerConfig = { difficulty: 'easy', cellSize: 48 }

function makeCallbacks(): CircuitHackerCallbacks {
    return {
        onTimeUpdate: vi.fn(),
        onRotation: vi.fn(),
        onSolved: vi.fn(),
        onFail: vi.fn(),
        onGameStart: vi.fn(),
    }
}

describe('CircuitHackerGame', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('starts a game and builds a grid', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        const state = game.getState()
        expect(state.isGameActive).toBe(true)
        expect(state.grid).toHaveLength(5)
        expect(cb.onGameStart).toHaveBeenCalled()
        game.cleanup()
    })

    it('rotates an unlocked tile and counts the rotation', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        // find first unlocked tile
        const state = game.getState()
        let target = { row: 0, col: 0 }
        outer: for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                if (!state.grid[r][c].locked) {
                    target = { row: r, col: c }
                    break outer
                }
            }
        }
        const before = game.getState().grid[target.row][target.col].orientation
        game.rotateTile(target.row, target.col)
        const after = game.getState().grid[target.row][target.col].orientation
        expect(after).toBe((before + 1) % 4)
        expect(game.getState().rotationsUsed).toBe(1)
        expect(cb.onRotation).toHaveBeenCalledWith(1)
        game.cleanup()
    })

    it('does not rotate a locked tile', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        const { sourcePos } = game.getState()
        const before =
            game.getState().grid[sourcePos.row][sourcePos.col].orientation
        game.rotateTile(sourcePos.row, sourcePos.col)
        const after =
            game.getState().grid[sourcePos.row][sourcePos.col].orientation
        expect(after).toBe(before)
        expect(game.getState().rotationsUsed).toBe(0)
        game.cleanup()
    })

    it('solves when the board is rotated into the solution', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        game.solveForTest() // test helper applies solution orientations
        expect(cb.onSolved).toHaveBeenCalledTimes(1)
        const [score, stats] = (cb.onSolved as ReturnType<typeof vi.fn>).mock
            .calls[0]
        expect(score).toBeGreaterThan(0)
        expect(stats.solved).toBe(true)
        expect(game.getState().isGameActive).toBe(false)
        game.cleanup()
    })

    it('fails when the timer runs out', () => {
        const cb = makeCallbacks()
        const game = new CircuitHackerGame(config, cb, seededRng(1))
        game.startGame()
        vi.advanceTimersByTime(121_000) // past the 120s easy timer
        expect(cb.onFail).toHaveBeenCalledTimes(1)
        expect(game.getState().isGameOver).toBe(true)
        game.cleanup()
    })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test:run src/lib/games/circuit-hacker/game.test.ts`
Expected: FAIL — `Failed to resolve import "./game"`.

- [ ] **Step 3: Implement `game.ts`**

```typescript
// src/lib/games/circuit-hacker/game.ts
import type {
    CircuitHackerCallbacks,
    CircuitHackerConfig,
    CircuitHackerState,
    CircuitHackerStats,
} from './types'
import {
    DIFFICULTY_CONFIGS,
    computePoweredCells,
    countRotatableTiles,
    computeFinalScore,
    isSolved,
} from './utils'
import { generatePuzzle, type GeneratedPuzzle } from './generator'

export class CircuitHackerGame {
    private config: CircuitHackerConfig
    private callbacks: CircuitHackerCallbacks
    private rng: () => number
    private state: CircuitHackerState
    private puzzle: GeneratedPuzzle
    private timer: number | null = null

    constructor(
        config: CircuitHackerConfig,
        callbacks: CircuitHackerCallbacks,
        rng: () => number = Math.random
    ) {
        this.config = config
        this.callbacks = callbacks
        this.rng = rng
        this.puzzle = this.buildPuzzle()
        this.state = this.buildInitialState()
    }

    private buildPuzzle(): GeneratedPuzzle {
        return generatePuzzle(DIFFICULTY_CONFIGS[this.config.difficulty], this.rng)
    }

    private buildInitialState(): CircuitHackerState {
        const tier = DIFFICULTY_CONFIGS[this.config.difficulty]
        const state: CircuitHackerState = {
            grid: this.puzzle.grid,
            sourcePos: this.puzzle.sourcePos,
            corePositions: this.puzzle.corePositions,
            rows: tier.rows,
            cols: tier.cols,
            score: 0,
            timeRemaining: tier.duration,
            rotationsUsed: 0,
            isGameActive: false,
            isGameOver: false,
            solved: false,
        }
        this.applyPower(state)
        return state
    }

    private applyPower(state: CircuitHackerState): void {
        const powered = computePoweredCells(state.grid, state.sourcePos)
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                state.grid[r][c].powered = powered[r][c]
            }
        }
    }

    startGame(): void {
        if (this.state.isGameActive) {
            return
        }
        // Fresh puzzle each run at the configured difficulty.
        this.puzzle = this.buildPuzzle()
        this.state = this.buildInitialState()
        this.state.isGameActive = true

        this.callbacks.onGameStart()
        this.callbacks.onTimeUpdate(this.state.timeRemaining)

        this.timer = window.setInterval(() => {
            if (!this.state.isGameActive) {
                return
            }
            this.state.timeRemaining--
            this.callbacks.onTimeUpdate(this.state.timeRemaining)
            if (this.state.timeRemaining <= 0) {
                this.fail()
            }
        }, 1000)
    }

    rotateTile(row: number, col: number): void {
        if (!this.state.isGameActive) {
            return
        }
        if (
            row < 0 ||
            row >= this.state.rows ||
            col < 0 ||
            col >= this.state.cols
        ) {
            return
        }
        const tile = this.state.grid[row][col]
        if (tile.locked) {
            return
        }

        tile.orientation = (tile.orientation + 1) % 4
        this.state.rotationsUsed++
        this.applyPower(this.state)
        this.callbacks.onRotation(this.state.rotationsUsed)

        if (
            isSolved(
                this.state.grid,
                this.state.sourcePos,
                this.state.corePositions
            )
        ) {
            this.solve()
        }
    }

    private solve(): void {
        this.clearTimer()
        this.state.isGameActive = false
        this.state.isGameOver = true
        this.state.solved = true
        this.state.score = computeFinalScore({
            secondsRemaining: this.state.timeRemaining,
            rotationsUsed: this.state.rotationsUsed,
            rotatableTileCount: countRotatableTiles(this.state.grid),
            multiplier: DIFFICULTY_CONFIGS[this.config.difficulty].multiplier,
        })
        this.callbacks.onSolved(this.state.score, this.getStats())
    }

    private fail(): void {
        this.clearTimer()
        this.state.isGameActive = false
        this.state.isGameOver = true
        this.state.solved = false
        this.state.timeRemaining = Math.max(0, this.state.timeRemaining)
        this.callbacks.onFail(this.getStats())
    }

    stopGame(): void {
        if (!this.state.isGameActive) {
            return
        }
        this.fail()
    }

    getState(): CircuitHackerState {
        return this.state
    }

    getStats(): CircuitHackerStats {
        return {
            finalScore: this.state.score,
            difficulty: this.config.difficulty,
            secondsRemaining: this.state.timeRemaining,
            rotationsUsed: this.state.rotationsUsed,
            solved: this.state.solved,
        }
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    cleanup(): void {
        this.clearTimer()
    }

    /** Test-only helper: rotate every tile into the known solution. */
    solveForTest(): void {
        for (let r = 0; r < this.state.rows; r++) {
            for (let c = 0; c < this.state.cols; c++) {
                this.state.grid[r][c].orientation =
                    this.puzzle.solutionOrientations[r][c]
            }
        }
        this.applyPower(this.state)
        if (
            isSolved(
                this.state.grid,
                this.state.sourcePos,
                this.state.corePositions
            )
        ) {
            this.solve()
        }
    }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test:run src/lib/games/circuit-hacker/game.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/circuit-hacker/game.ts src/lib/games/circuit-hacker/game.test.ts
git commit -m "feat(circuit-hacker): add game state machine"
```

---

### Task 6: PixiJS renderer

**Files:**
- Create: `src/lib/games/circuit-hacker/renderer.ts`
- Test: `src/lib/games/circuit-hacker/renderer.test.ts`

**Interfaces:**
- Consumes: `CircuitHackerState`, `GridPosition`, `Tile`, `Direction` from Task 1; `getConnectors` from Task 1.
- Produces: `RendererState = { app: Application; tileGraphic: Graphics }`; `setupPixiJS(container: HTMLElement, rows: number, cols: number, cellSize: number): Promise<RendererState>`; `renderGrid(rendererState: RendererState, state: CircuitHackerState, cellSize: number): void`; `pointerToCell(x: number, y: number, cellSize: number, rows: number, cols: number): GridPosition | null`; `cleanup(rendererState: RendererState): void`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/games/circuit-hacker/renderer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1, x: 0, y: 0 }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'roundRect',
        ]) {
            g[m] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }
    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', boxShadow: '' },
            writable: true,
        })
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: { addChild: vi.fn() },
            destroy: vi.fn(),
        }
    }
    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(() => ({ addChild: vi.fn(), destroy: vi.fn() })),
        Graphics: vi.fn(makeGraphics),
    }
})

import { setupPixiJS, renderGrid, pointerToCell, cleanup } from './renderer'
import type { CircuitHackerState, Tile } from './types'

const tile = (over: Partial<Tile> = {}): Tile => ({
    type: 'straight',
    orientation: 0,
    locked: false,
    powered: false,
    ...over,
})

describe('circuit-hacker renderer', () => {
    let container: HTMLElement
    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
    })

    it('initializes a PixiJS app sized to the grid', async () => {
        const rs = await setupPixiJS(container, 5, 5, 48)
        expect(rs.app.init).toHaveBeenCalledWith(
            expect.objectContaining({ width: 240, height: 240 })
        )
        expect(container.contains(rs.app.canvas)).toBe(true)
    })

    it('maps pointer coordinates to a cell', () => {
        expect(pointerToCell(10, 10, 48, 5, 5)).toEqual({ row: 0, col: 0 })
        expect(pointerToCell(100, 50, 48, 5, 5)).toEqual({ row: 1, col: 2 })
        expect(pointerToCell(-5, 10, 48, 5, 5)).toBeNull()
        expect(pointerToCell(10, 9999, 48, 5, 5)).toBeNull()
    })

    it('renders without throwing', async () => {
        const rs = await setupPixiJS(container, 1, 2, 48)
        const state = {
            grid: [[tile({ type: 'source', locked: true }), tile()]],
            sourcePos: { row: 0, col: 0 },
            corePositions: [],
            rows: 1,
            cols: 2,
            score: 0,
            timeRemaining: 10,
            rotationsUsed: 0,
            isGameActive: true,
            isGameOver: false,
            solved: false,
        } as CircuitHackerState
        expect(() => renderGrid(rs, state, 48)).not.toThrow()
        expect(rs.tileGraphic.clear).toHaveBeenCalled()
        cleanup(rs)
        expect(rs.app.destroy).toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test:run src/lib/games/circuit-hacker/renderer.test.ts`
Expected: FAIL — `Failed to resolve import "./renderer"`.

- [ ] **Step 3: Implement `renderer.ts`**

```typescript
// src/lib/games/circuit-hacker/renderer.ts
import { Application, Graphics } from 'pixi.js'
import type { CircuitHackerState, Direction, GridPosition, Tile } from './types'
import { getConnectors } from './utils'

export interface RendererState {
    app: Application
    tileGraphic: Graphics
}

const BACKGROUND = '#000a14'
const COLOR_WIRE_OFF = 0x335577
const COLOR_WIRE_ON = 0x22d3ee
const COLOR_SOURCE = 0x22c55e
const COLOR_CORE_OFF = 0x9333ea
const COLOR_CORE_ON = 0xf472b6
const COLOR_BLOCKER = 0x1e293b

export async function setupPixiJS(
    container: HTMLElement,
    rows: number,
    cols: number,
    cellSize: number
): Promise<RendererState> {
    try {
        const app = new Application()
        await app.init({
            width: cols * cellSize,
            height: rows * cellSize,
            backgroundColor: BACKGROUND,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        })

        container.appendChild(app.canvas)
        app.canvas.style.border = '2px solid rgba(6, 182, 212, 0.3)'
        app.canvas.style.borderRadius = '12px'
        app.canvas.style.boxShadow = '0 0 30px rgba(6, 182, 212, 0.3)'

        const tileGraphic = new Graphics()
        app.stage.addChild(tileGraphic)

        return { app, tileGraphic }
    } catch (error) {
        container.innerHTML = ''
        throw new Error(`Failed to initialize PixiJS: ${error}`)
    }
}

function dirOffset(dir: Direction): { dx: number; dy: number } {
    switch (dir) {
        case 'N':
            return { dx: 0, dy: -1 }
        case 'S':
            return { dx: 0, dy: 1 }
        case 'E':
            return { dx: 1, dy: 0 }
        case 'W':
            return { dx: -1, dy: 0 }
    }
}

function drawTile(
    g: Graphics,
    tile: Tile,
    x: number,
    y: number,
    cellSize: number
): void {
    const cx = x + cellSize / 2
    const cy = y + cellSize / 2
    const half = cellSize / 2

    // Cell background
    g.rect(x + 1, y + 1, cellSize - 2, cellSize - 2).fill({
        color: 0x001122,
        alpha: 0.5,
    })
    g.rect(x + 1, y + 1, cellSize - 2, cellSize - 2).stroke({
        color: 0x0ea5e9,
        width: 1,
        alpha: 0.15,
    })

    if (tile.type === 'blocker') {
        g.rect(x + 6, y + 6, cellSize - 12, cellSize - 12).fill(COLOR_BLOCKER)
        return
    }

    const wireColor = tile.powered ? COLOR_WIRE_ON : COLOR_WIRE_OFF
    const wireWidth = tile.powered ? 6 : 4

    // Draw a wire segment from the centre out to each connector edge.
    for (const dir of getConnectors(tile)) {
        const { dx, dy } = dirOffset(dir)
        g.moveTo(cx, cy)
            .lineTo(cx + dx * half, cy + dy * half)
            .stroke({ color: wireColor, width: wireWidth })
    }

    // Centre hub / node
    if (tile.type === 'source') {
        g.circle(cx, cy, half * 0.35).fill(COLOR_SOURCE)
    } else if (tile.type === 'core') {
        g.circle(cx, cy, half * 0.35).fill(
            tile.powered ? COLOR_CORE_ON : COLOR_CORE_OFF
        )
    } else {
        g.circle(cx, cy, wireWidth * 0.9).fill(wireColor)
    }
}

export function renderGrid(
    rendererState: RendererState,
    state: CircuitHackerState,
    cellSize: number
): void {
    const g = rendererState.tileGraphic
    g.clear()
    for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
            drawTile(g, state.grid[r][c], c * cellSize, r * cellSize, cellSize)
        }
    }
}

export function pointerToCell(
    x: number,
    y: number,
    cellSize: number,
    rows: number,
    cols: number
): GridPosition | null {
    const col = Math.floor(x / cellSize)
    const row = Math.floor(y / cellSize)
    if (row < 0 || row >= rows || col < 0 || col >= cols) {
        return null
    }
    return { row, col }
}

export function cleanup(rendererState: RendererState): void {
    rendererState.app.destroy(true, { children: true, texture: true })
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test:run src/lib/games/circuit-hacker/renderer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/circuit-hacker/renderer.ts src/lib/games/circuit-hacker/renderer.test.ts
git commit -m "feat(circuit-hacker): add PixiJS renderer"
```

---

### Task 7: Init wiring & score submission

**Files:**
- Create: `src/lib/games/circuit-hacker/init.ts`
- Test: `src/lib/games/circuit-hacker/init.test.ts`

**Interfaces:**
- Consumes: `CircuitHackerGame` (Task 5); renderer functions (Task 6); `DIFFICULTY_CONFIGS` (Task 3); `Difficulty`, `CircuitHackerStats` (Task 1); `saveGameScore` from `@/lib/services/scoreService`; `GameID` from `@/lib/games`.
- Produces: `initializeCircuitHackerGame(container: HTMLElement, callbacks: CircuitHackerUICallbacks): Promise<CircuitHackerHandle>` where `CircuitHackerUICallbacks = { onTimeUpdate: (t: number) => void; onRotation: (n: number) => void; onStart: () => void; onEnd: (stats: CircuitHackerStats) => void }` and `CircuitHackerHandle = { start: (difficulty: Difficulty) => Promise<void>; stop: () => void; cleanup: () => void; getGame: () => CircuitHackerGame | null }`. Also re-exports `GameID` usage internally; default cell size constant `CELL_SIZE = 48`.

`init.ts` owns: building the game/renderer for the chosen difficulty, wiring canvas pointer events to `rotateTile`, re-rendering on change, submitting the score on solve, and updating the game-over overlay DOM (mirroring Evader's `handleGameOver`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/games/circuit-hacker/init.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1, x: 0, y: 0 }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'roundRect',
        ]) {
            g[m] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }
    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', boxShadow: '' },
            writable: true,
        })
        // getBoundingClientRect is used to translate pointer coords
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 240, height: 240 }) as DOMRect
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: { addChild: vi.fn() },
            destroy: vi.fn(),
        }
    }
    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(() => ({ addChild: vi.fn(), destroy: vi.fn() })),
        Graphics: vi.fn(makeGraphics),
    }
})

const saveGameScore = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: (...args: unknown[]) => saveGameScore(...args),
}))

import { initializeCircuitHackerGame } from './init'
import { GameID } from '@/lib/games'

function setupDom(): HTMLElement {
    document.body.innerHTML = `
        <div id="game-canvas-container"></div>
        <span id="final-score">0</span>
        <span id="final-time">0</span>
        <span id="final-rotations">0</span>
        <span id="game-over-title"></span>
        <div id="game-over-overlay" class="hidden"></div>
        <button id="start-btn"></button>
        <button id="stop-btn" style="display:none"></button>
    `
    return document.getElementById('game-canvas-container') as HTMLElement
}

describe('initializeCircuitHackerGame', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        saveGameScore.mockClear()
    })
    afterEach(() => vi.useRealTimers())

    it('starts a game of the chosen difficulty', async () => {
        const container = setupDom()
        const onStart = vi.fn()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart,
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        expect(onStart).toHaveBeenCalled()
        expect(handle.getGame()?.getState().rows).toBe(5)
        handle.cleanup()
    })

    it('submits the score with gameData when solved', async () => {
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        // Force a solve via the game's test helper
        ;(
            handle.getGame() as unknown as { solveForTest: () => void }
        ).solveForTest()
        await vi.runAllTimersAsync()
        expect(saveGameScore).toHaveBeenCalledTimes(1)
        const [gameId, score, , , gameData] = saveGameScore.mock.calls[0]
        expect(gameId).toBe(GameID.CIRCUIT_HACKER)
        expect(score).toBeGreaterThan(0)
        expect(gameData).toMatchObject({ difficulty: 'easy', solved: true })
        handle.cleanup()
    })

    it('does not submit a score when the run fails', async () => {
        const container = setupDom()
        const handle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: vi.fn(),
            onRotation: vi.fn(),
            onStart: vi.fn(),
            onEnd: vi.fn(),
        })
        await handle.start('easy')
        vi.advanceTimersByTime(121_000)
        await vi.runAllTimersAsync()
        expect(saveGameScore).not.toHaveBeenCalled()
        handle.cleanup()
    })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test:run src/lib/games/circuit-hacker/init.test.ts`
Expected: FAIL — `Failed to resolve import "./init"`.

- [ ] **Step 3: Implement `init.ts`**

```typescript
// src/lib/games/circuit-hacker/init.ts
import { CircuitHackerGame } from './game'
import {
    setupPixiJS,
    renderGrid,
    pointerToCell,
    cleanup as rendererCleanup,
    type RendererState,
} from './renderer'
import { DIFFICULTY_CONFIGS } from './utils'
import type { Difficulty, CircuitHackerStats } from './types'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'

export const CELL_SIZE = 48

export interface CircuitHackerUICallbacks {
    onTimeUpdate: (timeRemaining: number) => void
    onRotation: (rotationsUsed: number) => void
    onStart: () => void
    onEnd: (stats: CircuitHackerStats) => void
}

export interface CircuitHackerHandle {
    start: (difficulty: Difficulty) => Promise<void>
    stop: () => void
    cleanup: () => void
    getGame: () => CircuitHackerGame | null
}

function setText(id: string, value: string): void {
    const el = document.getElementById(id)
    if (el) {
        el.textContent = value
    }
}

function resetButtons(): void {
    const startBtn = document.getElementById('start-btn')
    const stopBtn = document.getElementById('stop-btn')
    if (startBtn) {
        startBtn.style.display = 'inline-flex'
    }
    if (stopBtn) {
        stopBtn.style.display = 'none'
    }
}

function showOverlay(title: string, stats: CircuitHackerStats): void {
    setText('game-over-title', title)
    setText('final-score', stats.finalScore.toString())
    setText('final-time', `${stats.secondsRemaining}s`)
    setText('final-rotations', stats.rotationsUsed.toString())
    const overlay = document.getElementById('game-over-overlay')
    if (overlay) {
        overlay.classList.remove('hidden')
    }
}

export async function initializeCircuitHackerGame(
    container: HTMLElement,
    callbacks: CircuitHackerUICallbacks
): Promise<CircuitHackerHandle> {
    let game: CircuitHackerGame | null = null
    let renderer: RendererState | null = null
    let pointerHandler: ((event: PointerEvent) => void) | null = null

    const teardownRenderer = () => {
        if (renderer && pointerHandler) {
            renderer.app.canvas.removeEventListener('pointerdown', pointerHandler)
        }
        if (renderer) {
            rendererCleanup(renderer)
            renderer = null
        }
        pointerHandler = null
        container.innerHTML = ''
    }

    const render = () => {
        if (renderer && game) {
            renderGrid(renderer, game.getState(), CELL_SIZE)
        }
    }

    const start = async (difficulty: Difficulty): Promise<void> => {
        if (game) {
            game.cleanup()
        }
        teardownRenderer()

        const tier = DIFFICULTY_CONFIGS[difficulty]
        renderer = await setupPixiJS(container, tier.rows, tier.cols, CELL_SIZE)

        game = new CircuitHackerGame(
            { difficulty, cellSize: CELL_SIZE },
            {
                onGameStart: () => {
                    callbacks.onStart()
                    render()
                },
                onTimeUpdate: t => callbacks.onTimeUpdate(t),
                onRotation: n => {
                    callbacks.onRotation(n)
                    render()
                },
                onSolved: async (finalScore, stats) => {
                    render()
                    resetButtons()
                    showOverlay('CIRCUIT POWERED!', stats)
                    callbacks.onEnd(stats)
                    await saveGameScore(
                        GameID.CIRCUIT_HACKER,
                        finalScore,
                        result => {
                            if (result.newAchievements?.length) {
                                window.dispatchEvent(
                                    new CustomEvent('achievementsEarned', {
                                        detail: {
                                            achievementIds:
                                                result.newAchievements,
                                        },
                                    })
                                )
                            }
                        },
                        error => {
                            // eslint-disable-next-line no-console
                            console.error('Failed to submit score:', error)
                        },
                        {
                            difficulty: stats.difficulty,
                            secondsRemaining: stats.secondsRemaining,
                            rotationsUsed: stats.rotationsUsed,
                            solved: stats.solved,
                        }
                    )
                },
                onFail: stats => {
                    render()
                    resetButtons()
                    showOverlay("TIME'S UP!", stats)
                    callbacks.onEnd(stats)
                },
            }
        )

        pointerHandler = (event: PointerEvent) => {
            if (!renderer || !game) {
                return
            }
            const rect = renderer.app.canvas.getBoundingClientRect()
            const scaleX = rect.width / (tier.cols * CELL_SIZE)
            const scaleY = rect.height / (tier.rows * CELL_SIZE)
            const x = (event.clientX - rect.left) / scaleX
            const y = (event.clientY - rect.top) / scaleY
            const cell = pointerToCell(x, y, CELL_SIZE, tier.rows, tier.cols)
            if (cell) {
                game.rotateTile(cell.row, cell.col)
            }
        }
        renderer.app.canvas.addEventListener('pointerdown', pointerHandler)

        game.startGame()
        render()
    }

    const stop = () => {
        game?.stopGame()
    }

    const cleanup = () => {
        game?.cleanup()
        game = null
        teardownRenderer()
    }

    return { start, stop, cleanup, getGame: () => game }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `bun run test:run src/lib/games/circuit-hacker/init.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/circuit-hacker/init.ts src/lib/games/circuit-hacker/init.test.ts
git commit -m "feat(circuit-hacker): wire game, renderer, and score submission"
```

---

### Task 8: Registry integration (home page + routing)

**Files:**
- Modify: `src/lib/games.ts` (enum ~line 14, `GAMES` array end ~line 173, `GAME_ICONS` ~line 233)
- Modify: `src/components/ui/GameCard.astro:38-69` (`getGameUrl`)
- Modify: `src/pages/index.astro:21-33` (`idMapping`)
- Test: `src/lib/games.test.ts`

**Interfaces:**
- Consumes: existing `GameID` enum, `GAMES`, `getGameIcon`.
- Produces: `GameID.CIRCUIT_HACKER = 'circuit_hacker'`; a `GAMES` entry named `'Circuit Hacker'`; icon `🔌`; route `/circuit-hacker`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/games.test.ts`)

```typescript
import { GameID, GAMES, getGameById, getGameIcon } from './games'

describe('Circuit Hacker registration', () => {
    it('has a GameID and registry entry', () => {
        expect(GameID.CIRCUIT_HACKER).toBe('circuit_hacker')
        const game = getGameById(GameID.CIRCUIT_HACKER)
        expect(game).toBeDefined()
        expect(game?.name).toBe('Circuit Hacker')
        expect(game?.category).toBe('puzzle')
        expect(game?.isActive).toBe(true)
    })

    it('has an icon', () => {
        expect(getGameIcon(GameID.CIRCUIT_HACKER)).toBe('🔌')
    })

    it('is included in the GAMES list exactly once', () => {
        expect(
            GAMES.filter(g => g.id === GameID.CIRCUIT_HACKER)
        ).toHaveLength(1)
    })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test:run src/lib/games.test.ts`
Expected: FAIL — `GameID.CIRCUIT_HACKER` is undefined / `getGameById` returns undefined.

- [ ] **Step 3: Add the enum member** in `src/lib/games.ts` (inside `enum GameID`, after `GAME_2048`)

```typescript
    GAME_2048 = '2048',
    CIRCUIT_HACKER = 'circuit_hacker',
}
```

- [ ] **Step 4: Add the `GAMES` entry** in `src/lib/games.ts` (append as the last element of the `GAMES` array, after the 2048 entry)

```typescript
    {
        id: GameID.CIRCUIT_HACKER,
        name: 'Circuit Hacker',
        description:
            'Rotate circuit tiles to power a path from the source to the core before time runs out',
        category: 'puzzle',
        maxPlayers: 1,
        estimatedDuration: '2-5 minutes',
        difficulty: 'medium',
        tags: ['puzzle', 'logic', 'circuit', 'single-player', 'rotation'],
        isActive: true,
    },
```

- [ ] **Step 5: Add the icon** in `src/lib/games.ts` (inside `GAME_ICONS`, after the `GAME_2048` line)

```typescript
    [GameID.GAME_2048]: '🎯',
    [GameID.CIRCUIT_HACKER]: '🔌',
}
```

- [ ] **Step 6: Add the route** in `src/components/ui/GameCard.astro` (inside `getGameUrl`, before `default:`)

```typescript
    case 'Circuit Hacker':
      return '/circuit-hacker'
    default:
      return '#'
```

- [ ] **Step 7: Add the home-page id mapping** in `src/pages/index.astro` (inside `idMapping`, after `snake: 11,`)

```typescript
  snake: 11,
  circuit_hacker: 12,
}
```

- [ ] **Step 8: Run the test, verify it passes**

Run: `bun run test:run src/lib/games.test.ts`
Expected: PASS (including the 3 new tests).

- [ ] **Step 9: Commit**

```bash
git add src/lib/games.ts src/components/ui/GameCard.astro src/pages/index.astro src/lib/games.test.ts
git commit -m "feat(circuit-hacker): register game on home page and routing"
```

---

### Task 9: Astro game page

**Files:**
- Create: `src/pages/circuit-hacker/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Consumes: `initializeCircuitHackerGame` (Task 7); `AppLayout`, `Button`, `Card`, `Badge`, `GameOverlay`, `AchievementAward` components.
- Produces: the page route `/circuit-hacker`, with element IDs: `game-canvas-container`, `difficulty-select`, `time-remaining`, `rotation-count`, `start-btn`, `stop-btn`, `game-status`, `game-error`/`game-error-title`/`game-error-message`, and (via `GameOverlay`) `game-over-overlay`, `game-over-title`, `final-score`, plus custom `final-time`, `final-rotations`, and `play-again-btn`.

- [ ] **Step 1: Create the page**

```astro
---
import AppLayout from '@/layouts/AppLayout.astro'
import Button from '@/components/ui/Button.astro'
import Card from '@/components/ui/Card.astro'
import Badge from '@/components/ui/Badge.astro'
import GameOverlay from '@/components/GameOverlay.astro'
import AchievementAward from '@/components/AchievementAward.astro'

const gameNavigation = [
  { href: '/', label: 'Home' },
  { href: '#', label: 'Circuit Hacker' },
]
---

<AppLayout
  title="Circuit Hacker - Cetus Minigames"
  description="Rotate circuit tiles to power a path from the source to the core before time runs out"
  includeFooter={false}
  navigation={gameNavigation}
>
  <div class="px-6 py-4 border-b border-slate-700/50">
    <div class="max-w-7xl mx-auto">
      <div class="flex items-center space-x-3">
        <div class="text-cyan-400 text-sm">🔌 Circuit Hacker</div>
      </div>
    </div>
  </div>

  <div class="px-6 py-8">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-8">
        <h2 class="text-5xl font-orbitron font-bold text-holographic mb-4">
          CIRCUIT HACKER
        </h2>
        <p class="text-gray-400 text-lg">
          Rotate the tiles to connect the source to every core before the timer
          expires!
        </p>
      </div>

      <div class="flex flex-col lg:flex-row gap-8 items-start justify-center">
        <Card variant="glass" class="p-6 flex-shrink-0">
          <div class="flex flex-col items-center space-y-4">
            <div class="flex space-x-4 mb-2">
              <Badge variant="outline" class="px-4 py-2">
                <span class="font-mono"
                  >Time: <span id="time-remaining" class="text-cyan-400"
                    >--</span
                  >s</span
                >
              </Badge>
              <Badge variant="outline" class="px-4 py-2">
                <span class="font-mono"
                  >Rotations: <span id="rotation-count" class="text-cyan-400"
                    >0</span
                  ></span
                >
              </Badge>
            </div>

            <div class="flex items-center space-x-2">
              <span class="text-gray-400 text-sm">Difficulty:</span>
              <select
                id="difficulty-select"
                class="bg-slate-800 border border-cyan-400/40 rounded-md px-3 py-1 text-sm text-white"
              >
                <option value="easy">Easy (5×5)</option>
                <option value="medium" selected>Medium (7×7)</option>
                <option value="hard">Hard (9×9)</option>
                <option value="expert">Expert (11×11)</option>
              </select>
            </div>

            <div class="relative">
              <div
                id="game-canvas-container"
                class="bg-black/30 rounded-lg min-w-[240px] min-h-[240px]"
              >
              </div>

              <div
                id="game-status"
                class="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg hidden"
              >
                <div class="text-center">
                  <div class="text-6xl mb-4">🔌</div>
                  <div class="text-xl text-cyan-400 font-orbitron font-bold mb-2">
                    CIRCUIT HACKER
                  </div>
                  <div class="text-gray-400">Pick a difficulty and start!</div>
                </div>
              </div>

              <div
                id="game-error"
                class="hidden absolute inset-0 items-center justify-center bg-black/70 rounded-lg"
              >
                <div class="text-center">
                  <div id="game-error-title" class="text-red-400 text-xl mb-2">
                  </div>
                  <div id="game-error-message" class="text-gray-400 text-sm">
                  </div>
                </div>
              </div>
            </div>

            <div class="flex space-x-3">
              <Button id="start-btn" variant="primary">Start Game</Button>
              <Button id="stop-btn" variant="outline" style="display: none;"
                >End Game</Button
              >
            </div>

            <GameOverlay defaultTitle="CIRCUIT POWERED!" buttonText="Play Again">
              <div class="text-lg text-gray-300">
                Time Left: <span id="final-time" class="text-cyan-400">0s</span>
              </div>
              <div class="text-lg text-gray-300">
                Rotations: <span id="final-rotations" class="text-purple-400"
                  >0</span
                >
              </div>
            </GameOverlay>
          </div>
        </Card>

        <div class="flex flex-col space-y-6">
          <Card variant="glass" class="p-6">
            <h3 class="text-lg font-orbitron font-bold text-cyan-400 mb-4">
              HOW TO PLAY
            </h3>
            <ul class="space-y-2 text-sm text-gray-400">
              <li>• Tap/click a tile to rotate it 90° clockwise</li>
              <li>• Connect the source node to every core</li>
              <li>• Powered wires glow cyan</li>
              <li>• Solve before the timer runs out</li>
              <li>• Fewer rotations and more time left = higher score</li>
            </ul>
          </Card>

          <Card variant="glass" class="p-6">
            <h3 class="text-lg font-orbitron font-bold text-cyan-400 mb-4">
              SCORING
            </h3>
            <div class="space-y-2 text-sm text-gray-300">
              <div class="flex justify-between">
                <span class="text-gray-400">Base:</span><span>1000</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Time bonus:</span
                ><span>×15 / sec left</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Harder tier:</span
                ><span>bigger multiplier</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>

    <script>
      import { initializeCircuitHackerGame } from '@/lib/games/circuit-hacker/init'
      import type { Difficulty } from '@/lib/games/circuit-hacker/types'

      let gameHandle: Awaited<
        ReturnType<typeof initializeCircuitHackerGame>
      > | null = null

      const init = async () => {
        const container = document.getElementById('game-canvas-container')!
        const timeEl = document.getElementById('time-remaining')!
        const rotationEl = document.getElementById('rotation-count')!
        const statusEl = document.getElementById('game-status')!
        const overlay = document.getElementById('game-over-overlay')!
        const startBtn = document.getElementById('start-btn')!
        const stopBtn = document.getElementById('stop-btn')!
        const playAgainBtn = document.getElementById('play-again-btn')!
        const difficultySelect = document.getElementById(
          'difficulty-select'
        ) as HTMLSelectElement

        try {
          gameHandle = await initializeCircuitHackerGame(container, {
            onTimeUpdate: (t: number) => {
              timeEl.textContent = t.toString()
            },
            onRotation: (n: number) => {
              rotationEl.textContent = n.toString()
            },
            onStart: () => {
              statusEl.classList.add('hidden')
              overlay.classList.add('hidden')
              startBtn.style.display = 'none'
              stopBtn.style.display = 'inline-flex'
            },
            onEnd: () => {
              difficultySelect.disabled = false
            },
          })

          startBtn.addEventListener('click', async () => {
            difficultySelect.disabled = true
            rotationEl.textContent = '0'
            await gameHandle!.start(difficultySelect.value as Difficulty)
          })

          stopBtn.addEventListener('click', () => {
            gameHandle!.stop()
          })

          playAgainBtn.addEventListener('click', () => {
            overlay.classList.add('hidden')
            statusEl.classList.remove('hidden')
            startBtn.style.display = 'inline-flex'
            stopBtn.style.display = 'none'
            difficultySelect.disabled = false
          })
        } catch (error) {
          const errorContainer = document.getElementById('game-error')!
          const errorTitle = document.getElementById('game-error-title')!
          const errorMessage = document.getElementById('game-error-message')!
          statusEl.classList.add('hidden')
          errorTitle.textContent = 'Failed to Load Game'
          errorMessage.textContent = String(error)
          errorContainer.style.display = 'flex'
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
      } else {
        init()
      }

      window.addEventListener('beforeunload', () => {
        gameHandle?.cleanup()
      })
    </script>
  </div>
  <AchievementAward />
</AppLayout>
```

- [ ] **Step 2: Add a markup assertion** in `src/pages/game-board-markup.test.ts`

Replace the file body with the version below (adds Circuit Hacker alongside the existing checks):

```typescript
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const reflexMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/reflex/index.astro'),
    'utf-8'
)
const evaderMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/evader/index.astro'),
    'utf-8'
)
const circuitHackerMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/circuit-hacker/index.astro'),
    'utf-8'
)

describe('Game board page markup', () => {
    it('keeps Reflex and Evader default boards visible before start', () => {
        expect(reflexMarkup).toMatch(/id="game-status"[^>]*class="[^"]*hidden/)
        expect(evaderMarkup).toMatch(/id="game-status"[^>]*class="[^"]*hidden/)
    })

    it('exposes the Circuit Hacker canvas container and difficulty select', () => {
        expect(circuitHackerMarkup).toContain('id="game-canvas-container"')
        expect(circuitHackerMarkup).toContain('id="difficulty-select"')
    })
})
```

- [ ] **Step 3: Run the markup test, verify it passes**

Run: `bun run test:run src/pages/game-board-markup.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Type-check the page wiring**

Run: `bun run astro check 2>&1 | tail -20`
Expected: No new errors referencing `src/pages/circuit-hacker/index.astro` or `src/lib/games/circuit-hacker/*`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/circuit-hacker/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(circuit-hacker): add game page"
```

---

### Task 10: Achievements

**Files:**
- Modify: `src/lib/games/shared/types.ts` (add `CircuitHackerGameData`, add to `GameData` union ~line 104)
- Modify: `src/lib/achievements.ts` (import type ~line 3, extend `AchievementCheckData` ~line 23, append achievement entries to `ACHIEVEMENTS`)
- Test: `src/lib/achievements.test.ts`

**Interfaces:**
- Consumes: `GameID.CIRCUIT_HACKER` (Task 8); `Achievement`, `AchievementRarity`, `getAchievementsByGame` from `achievements.ts`.
- Produces: achievements `circuit_hacker_welcome`, `circuit_hacker_hard`, `circuit_hacker_expert`, `circuit_hacker_speed`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/achievements.test.ts`)

```typescript
import { ACHIEVEMENTS, getAchievementsByGame } from './achievements'
import { GameID } from './games'

describe('Circuit Hacker achievements', () => {
    it('registers achievements for circuit hacker', () => {
        const list = getAchievementsByGame(GameID.CIRCUIT_HACKER)
        expect(list.map(a => a.id)).toEqual(
            expect.arrayContaining([
                'circuit_hacker_welcome',
                'circuit_hacker_hard',
                'circuit_hacker_expert',
                'circuit_hacker_speed',
            ])
        )
    })

    it('awards the hard achievement only for a solved hard run', () => {
        const hard = ACHIEVEMENTS.find(a => a.id === 'circuit_hacker_hard')!
        expect(hard.condition.check).toBeDefined()
        expect(
            hard.condition.check!(
                { difficulty: 'hard', secondsRemaining: 5, rotationsUsed: 3, solved: true },
                1000
            )
        ).toBe(true)
        expect(
            hard.condition.check!(
                { difficulty: 'easy', secondsRemaining: 5, rotationsUsed: 3, solved: true },
                1000
            )
        ).toBe(false)
    })
})
```

> If `getAchievementsByGame` is not already imported in this test file, add it to the existing import from `./achievements`.

- [ ] **Step 2: Run the test, verify it fails**

Run: `bun run test:run src/lib/achievements.test.ts`
Expected: FAIL — the four ids are not found.

- [ ] **Step 3: Add `CircuitHackerGameData`** in `src/lib/games/shared/types.ts` (after the `SnakeGameData` interface, then add to the `GameData` union)

```typescript
// Snake-specific game data
export interface SnakeGameData {
    applesEaten: number
    maxLength: number
}

// Circuit Hacker-specific game data
export interface CircuitHackerGameData {
    difficulty: 'easy' | 'medium' | 'hard' | 'expert'
    secondsRemaining: number
    rotationsUsed: number
    solved: boolean
}
```

Then extend the union:

```typescript
export type GameData =
    | TetrisGameData
    | BubbleShooterGameData
    | BejeweledGameData
    | MemoryMatrixGameData
    | WordScrambleGameData
    | ReflexGameData
    | QuickMathGameData
    | SudokuGameData
    | PathNavigatorGameData
    | EvaderGameData
    | Game2048Data
    | SnakeGameData
    | CircuitHackerGameData
```

- [ ] **Step 4: Wire the type into `achievements.ts`**

Add to the type import block (near line 3-12):

```typescript
import type {
    TetrisGameData,
    BejeweledGameData,
    ReflexGameData,
    QuickMathGameData,
    Game2048Data,
    SnakeGameData,
    WordScrambleGameData,
    CircuitHackerGameData,
    GameHistoryEntry,
} from './games/shared/types'
```

Extend `AchievementCheckData` (near line 23):

```typescript
export type AchievementCheckData =
    | TetrisGameData
    | BejeweledGameData
    | ReflexGameData
    | QuickMathGameData
    | Game2048Data
    | SnakeGameData
    | WordScrambleGameData
    | CircuitHackerGameData
    | Record<string, unknown>
```

- [ ] **Step 5: Append the achievement entries** to the `ACHIEVEMENTS` array in `src/lib/achievements.ts` (before the closing `]`)

```typescript
    {
        id: 'circuit_hacker_welcome',
        name: 'First Connection',
        description: 'Welcome to Circuit Hacker! You powered your first circuit.',
        logo: '🔌',
        gameId: GameID.CIRCUIT_HACKER,
        condition: {
            type: 'score_threshold',
            threshold: 1,
        },
        rarity: AchievementRarity.COMMON,
    },
    {
        id: 'circuit_hacker_hard',
        name: 'Hard Wired',
        description: 'Solve a Circuit Hacker puzzle on Hard difficulty.',
        logo: '⚡',
        gameId: GameID.CIRCUIT_HACKER,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as CircuitHackerGameData
                return data.difficulty === 'hard' && data.solved === true
            },
        },
        rarity: AchievementRarity.EPIC,
    },
    {
        id: 'circuit_hacker_expert',
        name: 'Master Hacker',
        description: 'Solve a Circuit Hacker puzzle on Expert difficulty.',
        logo: '🧠',
        gameId: GameID.CIRCUIT_HACKER,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as CircuitHackerGameData
                return data.difficulty === 'expert' && data.solved === true
            },
        },
        rarity: AchievementRarity.LEGENDARY,
    },
    {
        id: 'circuit_hacker_speed',
        name: 'Quick Hack',
        description:
            'Solve a Circuit Hacker puzzle with at least 60 seconds left.',
        logo: '⏱️',
        gameId: GameID.CIRCUIT_HACKER,
        condition: {
            type: 'in_game',
            check: gameData => {
                const data = gameData as CircuitHackerGameData
                return data.solved === true && data.secondsRemaining >= 60
            },
        },
        rarity: AchievementRarity.RARE,
    },
]
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `bun run test:run src/lib/achievements.test.ts`
Expected: PASS (including the 2 new tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts
git commit -m "feat(circuit-hacker): add achievements"
```

---

### Task 11: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full circuit-hacker test suite**

Run: `bun run test:run src/lib/games/circuit-hacker/`
Expected: PASS (all files: utils, generator, game, renderer, init).

- [ ] **Step 2: Run the full test suite**

Run: `bun run test:run`
Expected: PASS, no regressions in `games.test.ts`, `achievements.test.ts`, `game-board-markup.test.ts`.

- [ ] **Step 3: Lint & format**

Run: `bun run lint && bun run format:check`
Expected: No errors. If `format:check` fails, run `bun run format` and re-commit.

- [ ] **Step 4: Type-check**

Run: `bun run astro check 2>&1 | tail -20`
Expected: No new errors in circuit-hacker files.

- [ ] **Step 5: Manual smoke test (optional but recommended)**

Run: `bun run dev`, open `http://localhost:4325/`, confirm the Circuit Hacker card appears with the 🔌 icon and Play Now link, then play a full Easy puzzle: rotate tiles, watch wires glow, solve it, and confirm the win overlay shows score/time/rotations.

- [ ] **Step 6: Commit any formatting fixes**

```bash
git add -A
git commit -m "chore(circuit-hacker): lint and format fixes" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Gameplay/flow → Tasks 5, 7, 9
- Difficulty tiers → Task 3 (`DIFFICULTY_CONFIGS`) + Task 9 (selector)
- Circuit model (connectors, power, win) → Tasks 1, 2
- Puzzle generation (solvable by construction) → Task 4
- Scoring (formula + multiplier + gameData) → Tasks 3, 5, 7
- Architecture/file structure → Tasks 1–7 (matches spec's file list)
- Registry/integration → Task 8
- Data flow / errors → Tasks 5, 7, 9 (generation always solvable; `saveGameScore` 401/error handled; taps on locked/blocker/out-of-bounds ignored)
- Testing strategy → every task is TDD; Task 11 runs the full suite
- Acceptance criteria → home page (Task 8), start/solve/fail/restart (Tasks 5,7,9), score submission (Task 7,10), desktop+mobile via pointer events (Task 7)

**2. Placeholder scan** — no "TBD/TODO/handle edge cases"; every code step contains complete code.

**3. Type consistency** — names verified across tasks: `CircuitHackerGame`, `CircuitHackerState`, `CircuitHackerStats`, `CircuitHackerConfig`, `CircuitHackerCallbacks`, `CircuitHackerGameData`; utils exports (`getConnectors`, `cellsConnect`, `computePoweredCells`, `isSolved`, `DIFFICULTY_CONFIGS`, `countRotatableTiles`, `computeFinalScore`); generator `generatePuzzle`/`GeneratedPuzzle`/`solutionOrientations`; renderer `setupPixiJS`/`renderGrid`/`pointerToCell`/`cleanup`/`RendererState`; init `initializeCircuitHackerGame`/`CircuitHackerHandle`/`CircuitHackerUICallbacks`/`CELL_SIZE`. `solveForTest` is defined in Task 5 and used in Tasks 5 & 7. DOM ids in `init.ts` (`final-score`, `final-time`, `final-rotations`, `game-over-title`, `game-over-overlay`, `start-btn`, `stop-btn`) match the page (Task 9) and the init test (Task 7).
