# HPA-121 Bubble Shooter Mechanics Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Bubble Shooter hex geometry, projectile simulation, legal attachment, match resolution, run lifecycle, statistics, and rules in one implementation PR.

**Architecture:** Keep the current `BaseGame` + Pixi renderer + initializer boundaries. Add phase-aware pure geometry helpers in `utils.ts`; keep state transitions and board algorithms in `BubbleShooterGame.ts`; keep DOM lifecycle and preview behavior in `initFramework.ts`. No new production module or dependency is required.

**Tech Stack:** Astro 5, TypeScript, PixiJS 8, Vitest/jsdom, Playwright, Bun 1.3.1.

## Global Constraints

- Deliver every task on branch `agent/hpa-121-bubble-shooter-mechanics` in the same draft PR.
- Track the work under Linear issue `HPA-121`.
- Do not modify `BaseGame` behavior or unrelated games.
- Do not add a physics engine, grid dependency, source abstraction, animation, asset, sound, power-up, level, or difficulty feature.
- Treat `projectileSpeed` as pixels per second and set the default to exactly `720`.
- Clamp one projectile update to exactly `50ms` and limit one collision substep to at most `bubbleRadius / 2` travel.
- Keep `MATCH_THRESHOLD = 3`, `POINTS_PER_BUBBLE = 10`, and `ALL_CLEAR_BONUS = 1000`.
- Count both direct matches and ceiling-disconnected drops in shot score, `bubblesPopped`, and `largestCombo`.
- Count one `successfulShot` only when the newly attached bubble creates a direct same-color match of at least three.
- Preserve the already-previewed current bubble; only reconcile future `nextBubble` colors after board resolution.
- Use deterministic grids or stubbed `Math.random` in tests.
- Do not preserve backward compatibility for the internal `rowOffset` state field or old utility signatures.

---

## File map

### Production files

- `src/lib/games/bubble-shooter/types.ts`
  - Add `RowPhase` and `successfulShots`.
  - Remove `rowOffset`.
  - Clarify that `projectileSpeed` is pixels per second.
- `src/lib/games/bubble-shooter/utils.ts`
  - Own physical row parity, row width, centered coordinates, and phase-aware neighbors.
- `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
  - Own coordinate synchronization, projectile substeps, legal attachment, board counts, ceiling connectivity, match resolution, active colors, score, and statistics.
- `src/lib/games/bubble-shooter/initFramework.ts`
  - Own clean ended-run start behavior and null-aware preview clearing.
- `src/pages/bubble-shooter/index.astro`
  - Render the configured row interval and corrected rules.

### Test files

- `src/lib/games/bubble-shooter/utils.test.ts`
  - Cover phase-aware geometry and neighbor invariants.
- `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`
  - Cover row insertion, physics, legal attachment, match/drop behavior, colors, counts, and statistics.
- `src/lib/games/bubble-shooter/initFramework.test.ts`
  - Cover ended-run reset and preview clearing while retaining pointer/RAF tests.
- `src/pages/game-board-markup.test.ts`
  - Pin Bubble Shooter rule-copy wiring.

No change is planned for `BubbleShooterRenderer.ts`; it should continue rendering state coordinates without calculating grid geometry.

---

### Task 1: Introduce phase-aware centered hex geometry

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts:1-75`
- Modify: `src/lib/games/bubble-shooter/utils.ts:1-75`
- Modify: `src/lib/games/bubble-shooter/utils.test.ts:1-150`

**Interfaces:**
- Produces: `RowPhase = 0 | 1`
- Produces: `getRowParity(row: number, rowPhase: RowPhase): RowPhase`
- Produces: `getRowColumnCount(row: number, rowPhase: RowPhase, constants: GameConstants): number`
- Produces: `getBubbleX(col: number, row: number, rowPhase: RowPhase, constants: GameConstants): number`
- Produces: `getBubbleY(row: number, constants: GameConstants): number`
- Produces: `getNeighbors(row: number, col: number, rowPhase: RowPhase, constants: GameConstants): GridPosition[]`

- [ ] **Step 1: Write failing geometry tests**

Update imports in `utils.test.ts` to include `getRowParity` and `getRowColumnCount`, then replace the old coordinate/neighbor cases with phase-aware assertions. Keep the existing color and canvas-drawing tests.

```ts
import {
    pixiColorToHex,
    getRowParity,
    getRowColumnCount,
    getBubbleX,
    getBubbleY,
    getNeighbors,
    drawBubbleOnCanvas,
} from './utils'

describe('phase-aware hex geometry', () => {
    it('alternates physical parity from the top-row phase', () => {
        expect(getRowParity(0, 0)).toBe(0)
        expect(getRowParity(1, 0)).toBe(1)
        expect(getRowParity(0, 1)).toBe(1)
        expect(getRowParity(1, 1)).toBe(0)
    })

    it('uses fourteen cells for full rows and thirteen for offset rows', () => {
        expect(getRowColumnCount(0, 0, constants)).toBe(14)
        expect(getRowColumnCount(1, 0, constants)).toBe(13)
        expect(getRowColumnCount(0, 1, constants)).toBe(13)
        expect(getRowColumnCount(1, 1, constants)).toBe(14)
    })

    it('centers both row shapes in the 600px board', () => {
        expect(getBubbleX(0, 0, 0, constants)).toBe(40)
        expect(getBubbleX(13, 0, 0, constants)).toBe(560)
        expect(getBubbleX(0, 0, 1, constants)).toBe(60)
        expect(getBubbleX(12, 0, 1, constants)).toBe(540)
    })

    it('keeps every neighbor exactly one diameter away', () => {
        const origin = { row: 5, col: 5 }
        const originPoint = {
            x: getBubbleX(origin.col, origin.row, 1, constants),
            y: getBubbleY(origin.row, constants),
        }

        for (const neighbor of getNeighbors(
            origin.row,
            origin.col,
            1,
            constants
        )) {
            const neighborPoint = {
                x: getBubbleX(neighbor.col, neighbor.row, 1, constants),
                y: getBubbleY(neighbor.row, constants),
            }
            expect(
                Math.hypot(
                    neighborPoint.x - originPoint.x,
                    neighborPoint.y - originPoint.y
                )
            ).toBeCloseTo(constants.BUBBLE_RADIUS * 2)
        }
    })
})
```

- [ ] **Step 2: Run the geometry test and verify it fails**

Run:

```bash
bun run test:run src/lib/games/bubble-shooter/utils.test.ts
```

Expected: FAIL because `getRowParity` and `getRowColumnCount` do not exist and the old helper signatures do not accept `rowPhase`.

- [ ] **Step 3: Add `RowPhase` and replace geometry helpers**

In `types.ts`, add:

```ts
export type RowPhase = 0 | 1
```

In `utils.ts`, import `RowPhase` and implement:

```ts
import type { GameConstants, GridPosition, RowPhase } from './types'

export function getRowParity(
    row: number,
    rowPhase: RowPhase
): RowPhase {
    return ((row + rowPhase) % 2) as RowPhase
}

export function getRowColumnCount(
    row: number,
    rowPhase: RowPhase,
    constants: GameConstants
): number {
    return constants.GRID_WIDTH - getRowParity(row, rowPhase)
}

export function getBubbleX(
    col: number,
    row: number,
    rowPhase: RowPhase,
    constants: GameConstants
): number {
    const diameter = constants.BUBBLE_RADIUS * 2
    const boardWidth = constants.GRID_WIDTH * diameter
    const boardLeft = (constants.GAME_WIDTH - boardWidth) / 2
    const parity = getRowParity(row, rowPhase)

    return (
        boardLeft +
        constants.BUBBLE_RADIUS +
        parity * constants.BUBBLE_RADIUS +
        col * diameter
    )
}

export function getBubbleY(
    row: number,
    constants: GameConstants
): number {
    return (
        constants.BUBBLE_RADIUS +
        row * constants.BUBBLE_RADIUS * Math.sqrt(3)
    )
}

export function getNeighbors(
    row: number,
    col: number,
    rowPhase: RowPhase,
    constants: GameConstants
): GridPosition[] {
    const parity = getRowParity(row, rowPhase)
    const offsets =
        parity === 0
            ? [
                  [-1, -1],
                  [-1, 0],
                  [0, -1],
                  [0, 1],
                  [1, -1],
                  [1, 0],
              ]
            : [
                  [-1, 0],
                  [-1, 1],
                  [0, -1],
                  [0, 1],
                  [1, 0],
                  [1, 1],
              ]

    return offsets.flatMap(([rowDelta, colDelta]) => {
        const neighborRow = row + rowDelta
        const neighborCol = col + colDelta
        if (
            neighborRow < 0 ||
            neighborRow >= constants.GRID_HEIGHT ||
            neighborCol < 0 ||
            neighborCol >=
                getRowColumnCount(neighborRow, rowPhase, constants)
        ) {
            return []
        }
        return [{ row: neighborRow, col: neighborCol }]
    })
}
```

Keep `pixiColorToHex` and `drawBubbleOnCanvas` unchanged.

- [ ] **Step 4: Run the geometry test and verify it passes**

Run:

```bash
bun run test:run src/lib/games/bubble-shooter/utils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the geometry unit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/utils.ts \
  src/lib/games/bubble-shooter/utils.test.ts
git commit -m "fix: make bubble shooter grid phase aware"
```

---

### Task 2: Make grid state and row insertion obey geometry invariants

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts:35-70`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts:1-610`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts:1-650`

**Interfaces:**
- Consumes: all Task 1 geometry helpers.
- Produces: `BubbleShooterState.rowPhase: RowPhase`.
- Produces: `refreshBubbleCoordinates(constants: GameConstants): void`.
- Produces: `syncBubbleCount(): number`.
- Preserves: `grid` as the authoritative board representation.

- [ ] **Step 1: Add failing row-insertion and count-invariant tests**

Add test helpers near `stateOf` in `BubbleShooterGame.test.ts`:

```ts
function expectedOccupiedCount(state: BubbleShooterState): number {
    return state.grid.reduce(
        (total, row) => total + row.filter(Boolean).length,
        0
    )
}

function expectGridCoordinatesToMatchState(
    game: BubbleShooterGame
): void {
    const state = stateOf(game)
    const constants = game.getConstantsView()

    state.grid.forEach((row, rowIndex) => {
        expect(row).toHaveLength(
            getRowColumnCount(rowIndex, state.rowPhase, constants)
        )
        row.forEach((bubble, colIndex) => {
            if (!bubble) {
                return
            }
            expect(bubble.x).toBe(
                getBubbleX(
                    colIndex,
                    rowIndex,
                    state.rowPhase,
                    constants
                )
            )
            expect(bubble.y).toBeCloseTo(
                getBubbleY(rowIndex, constants)
            )
        })
    })
    expect(state.bubblesRemaining).toBe(expectedOccupiedCount(state))
}
```

Add deterministic insertion coverage:

```ts
it('preserves physical layout through two inserted rows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const game = makeGame({ newRowFillChance: 1 })
    game.start()

    const internal = game as unknown as {
        addRowAtTop: (constants: GameConstants) => void
    }
    const constants = game.getConstantsView()

    expect(stateOf(game).rowPhase).toBe(0)
    expectGridCoordinatesToMatchState(game)

    internal.addRowAtTop(constants)
    expect(stateOf(game).rowPhase).toBe(1)
    expectGridCoordinatesToMatchState(game)

    internal.addRowAtTop(constants)
    expect(stateOf(game).rowPhase).toBe(0)
    expectGridCoordinatesToMatchState(game)
})
```

- [ ] **Step 2: Update test call sites to the Task 1 signatures**

Add local wrappers to reduce repeated phase arguments:

```ts
const bubbleX = (
    col: number,
    row: number,
    rowPhase: RowPhase = 0
): number => getBubbleX(col, row, rowPhase, CONSTANTS)

const bubbleY = (row: number): number => getBubbleY(row, CONSTANTS)

const neighbors = (
    row: number,
    col: number,
    rowPhase: RowPhase = 0
): GridPosition[] => getNeighbors(row, col, rowPhase, CONSTANTS)
```

Replace all old direct calls in `BubbleShooterGame.test.ts` with these wrappers. Verify no stale signatures remain:

```bash
rg -n "getBubbleX\([^,]+,[^,]+, CONSTANTS|getBubbleY\([^,]+, 0, CONSTANTS|getNeighbors\([^,]+,[^,]+, CONSTANTS" src/lib/games/bubble-shooter
```

Expected: no matches.

- [ ] **Step 3: Run the game tests and verify the new invariant test fails**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: FAIL because state lacks `rowPhase`, coordinates still use logical `row % 2`, and row lengths are not normalized after insertion.

- [ ] **Step 4: Add row phase and authoritative synchronization**

In `types.ts`, replace `rowOffset` with:

```ts
rowPhase: RowPhase
```

In `createInitialState()` initialize:

```ts
rowPhase: 0,
```

Add these private methods in `BubbleShooterGame.ts`:

```ts
private refreshBubbleCoordinates(constants: GameConstants): void {
    for (let row = 0; row < constants.GRID_HEIGHT; row++) {
        const columnCount = getRowColumnCount(
            row,
            this.state.rowPhase,
            constants
        )
        const gridRow = this.state.grid[row] ?? []
        gridRow.length = columnCount
        this.state.grid[row] = gridRow

        for (let col = 0; col < columnCount; col++) {
            const bubble = gridRow[col]
            if (!bubble) {
                continue
            }
            bubble.x = getBubbleX(
                col,
                row,
                this.state.rowPhase,
                constants
            )
            bubble.y = getBubbleY(row, constants)
        }
    }
}

private syncBubbleCount(): number {
    const count = this.state.grid.reduce(
        (total, row) => total + row.filter(Boolean).length,
        0
    )
    this.state.bubblesRemaining = count
    return count
}
```

Update `initializeGrid()` to use `getRowColumnCount`, the new coordinate signatures, and finish with:

```ts
this.refreshBubbleCoordinates(constants)
this.syncBubbleCount()
this.state.needsRedraw = true
```

Update every production call to `getBubbleX`, `getBubbleY`, and `getNeighbors` to pass `this.state.rowPhase`.

Replace `addRowAtTop()` with phase-aware shifting:

```ts
private addRowAtTop(constants: GameConstants): void {
    for (let row = constants.GRID_HEIGHT - 1; row > 0; row--) {
        this.state.grid[row] = this.state.grid[row - 1]
            ? [...this.state.grid[row - 1]]
            : []
    }

    this.state.rowPhase = this.state.rowPhase === 0 ? 1 : 0
    const columnCount = getRowColumnCount(
        0,
        this.state.rowPhase,
        constants
    )
    this.state.grid[0] = Array.from({ length: columnCount }, () => {
        if (Math.random() >= this.config.newRowFillChance) {
            return null
        }
        return {
            color: this.randomAvailableColor(),
            x: 0,
            y: 0,
        }
    })

    this.refreshBubbleCoordinates(constants)
    this.syncBubbleCount()
    this.state.needsRedraw = true
}
```

At this task, implement `randomAvailableColor()` as a private helper that chooses from `config.colors`; Task 5 will change its source to active board colors:

```ts
private randomAvailableColor(): number {
    const colors = this.config.colors
    return colors[Math.floor(Math.random() * colors.length)]
}
```

- [ ] **Step 5: Run geometry and game tests**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: PASS after updating existing expectations for centered coordinates and `rowPhase`.

- [ ] **Step 6: Commit the board invariant unit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: preserve bubble shooter row geometry"
```

---

### Task 3: Make projectile movement elapsed-time based and collision safe

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts:55-70`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts:20-380`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts:220-360`

**Interfaces:**
- Produces: `updateProjectile(deltaTimeMs: number): boolean`.
- Produces: `reflectProjectileOffWalls(constants: GameConstants): void`.
- Changes: `BubbleShooterConfig.projectileSpeed` is pixels per second.
- Keeps: projectile `vx` and `vy` in pixels per second.

- [ ] **Step 1: Write failing refresh-rate and wall-bound tests**

Add a deterministic simulation helper:

```ts
function simulateProjectileForOneSecond(frameCount: number): number {
    const game = makeGame({
        gameHeight: 12_000,
        shooterY: 10_000,
        projectileSpeed: 720,
    })
    setState(game, {
        projectile: {
            x: 300,
            y: 5_000,
            vx: 0,
            vy: -720,
            color: 0xff0000,
        },
        grid: Array.from({ length: CONSTANTS.GRID_HEIGHT }, () => []),
    })

    for (let frame = 0; frame < frameCount; frame++) {
        game.updateProjectile(1_000 / frameCount)
    }
    return stateOf(game).projectile?.y ?? Number.NaN
}

it('moves the same distance at 30Hz, 60Hz, and 120Hz', () => {
    const at30Hz = simulateProjectileForOneSecond(30)
    const at60Hz = simulateProjectileForOneSecond(60)
    const at120Hz = simulateProjectileForOneSecond(120)

    expect(at30Hz).toBeCloseTo(4_280, 5)
    expect(at60Hz).toBeCloseTo(at30Hz, 5)
    expect(at120Hz).toBeCloseTo(at30Hz, 5)
})

it('reflects position and velocity inside the right wall', () => {
    const game = makeGame({ projectileSpeed: 720 })
    setState(game, {
        projectile: {
            x: CONSTANTS.GAME_WIDTH - CONSTANTS.BUBBLE_RADIUS - 2,
            y: 400,
            vx: 720,
            vy: 0,
            color: 0xff0000,
        },
        grid: Array.from({ length: CONSTANTS.GRID_HEIGHT }, () => []),
    })

    game.updateProjectile(16)

    const projectile = stateOf(game).projectile
    expect(projectile?.x).toBeLessThanOrEqual(
        CONSTANTS.GAME_WIDTH - CONSTANTS.BUBBLE_RADIUS
    )
    expect(projectile?.vx).toBeLessThan(0)
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "30Hz|right wall"
```

Expected: FAIL because `updateProjectile` ignores elapsed time and can leave `x` outside the legal range.

- [ ] **Step 3: Convert speed and implement bounded substeps**

Update the default:

```ts
projectileSpeed: 720,
```

Update the config comment in `types.ts`:

```ts
projectileSpeed: number // pixels per second
```

Add constants near the scoring constants:

```ts
const MAX_PROJECTILE_FRAME_MS = 50
const MAX_PROJECTILE_SUBSTEP_RATIO = 0.5
```

Pass RAF time through `update`:

```ts
update(deltaTime: number): void {
    if (
        !this.state.isActive ||
        this.state.isPaused ||
        this.state.isGameOver
    ) {
        return
    }

    this.updateProjectile(deltaTime)

    if (this.state.needsRedraw) {
        this.emitStateChange()
    }
}
```

Implement substeps:

```ts
updateProjectile(deltaTimeMs: number): boolean {
    const projectile = this.state.projectile
    if (!projectile) {
        return false
    }

    const constants = this.getConstantsView()
    const clampedMs = Math.min(
        Math.max(deltaTimeMs, 0),
        MAX_PROJECTILE_FRAME_MS
    )
    const elapsedSeconds = clampedMs / 1_000
    const speed = Math.hypot(projectile.vx, projectile.vy)
    const maxSubstepDistance =
        constants.BUBBLE_RADIUS * MAX_PROJECTILE_SUBSTEP_RATIO
    const substepCount = Math.max(
        1,
        Math.ceil((speed * elapsedSeconds) / maxSubstepDistance)
    )
    const substepSeconds = elapsedSeconds / substepCount

    for (let step = 0; step < substepCount; step++) {
        projectile.x += projectile.vx * substepSeconds
        projectile.y += projectile.vy * substepSeconds
        this.reflectProjectileOffWalls(constants)

        const anchor = this.checkBubbleCollision()
        if (anchor) {
            return this.attachBubble({ kind: 'bubble', anchor })
        }
        if (projectile.y <= constants.BUBBLE_RADIUS) {
            return this.attachBubble({ kind: 'ceiling' })
        }
    }

    if (clampedMs > 0) {
        this.state.needsRedraw = true
    }
    return false
}
```

Task 4 defines the final `ProjectileImpact` type and `attachBubble` signature. During this task, add the union type and adapt the existing attachment function without changing candidate behavior yet so the physics commit compiles.

Add wall reflection:

```ts
private reflectProjectileOffWalls(constants: GameConstants): void {
    const projectile = this.state.projectile
    if (!projectile) {
        return
    }

    const minX = constants.BUBBLE_RADIUS
    const maxX = constants.GAME_WIDTH - constants.BUBBLE_RADIUS

    if (projectile.x < minX) {
        projectile.x = minX + (minX - projectile.x)
        projectile.vx = Math.abs(projectile.vx)
    } else if (projectile.x > maxX) {
        projectile.x = maxX - (projectile.x - maxX)
        projectile.vx = -Math.abs(projectile.vx)
    }

    projectile.x = Math.min(maxX, Math.max(minX, projectile.x))
}
```

- [ ] **Step 4: Update existing projectile tests to pass milliseconds**

Every direct call must pass an elapsed time. Use `16` for one nominal frame unless a test explicitly exercises another rate:

```ts
game.updateProjectile(16)
```

Update expected one-frame travel from raw velocity to velocity multiplied by `0.016`.

- [ ] **Step 5: Run Bubble Shooter game tests**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the physics unit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: make bubble shooter physics time based"
```

---

### Task 4: Restrict attachment to legal impact-local cells

**Files:**
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts:300-500`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts:360-520`

**Interfaces:**
- Consumes: `ProjectileImpact` introduced in Task 3.
- Produces: `attachBubble(impact: ProjectileImpact): boolean`.
- Produces: `findAttachPosition(constants: GameConstants, impact: ProjectileImpact): GridPosition | null`.
- Produces: `findClosestEmptyPosition(constants: GameConstants, candidates: GridPosition[]): GridPosition | null`.
- Removes: whole-board candidate search, `isValidAttachPosition`, and occupied top-center fallback.

- [ ] **Step 1: Write failing legal-attachment tests**

Add these cases:

```ts
it('attaches a bubble impact only beside its anchor', () => {
    const game = makeGame()
    const anchor = { row: 4, col: 4 }
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        () => [] as BubbleShooterState['grid'][number]
    )
    grid[anchor.row] = Array(
        getRowColumnCount(anchor.row, 0, CONSTANTS)
    ).fill(null)
    grid[anchor.row][anchor.col] = {
        color: 0x00ff00,
        x: bubbleX(anchor.col, anchor.row),
        y: bubbleY(anchor.row),
    }

    setState(game, {
        grid,
        rowPhase: 0,
        projectile: {
            x: bubbleX(anchor.col, anchor.row) + 5,
            y: bubbleY(anchor.row) + 30,
            vx: 0,
            vy: -720,
            color: 0xff0000,
        },
        bubblesRemaining: 1,
    })

    game.attachBubble({ kind: 'bubble', anchor })

    const redCells = neighbors(anchor.row, anchor.col).filter(
        ({ row, col }) => stateOf(game).grid[row]?.[col]?.color === 0xff0000
    )
    expect(redCells).toHaveLength(1)
})

it('never overwrites a full board when no legal cell exists', () => {
    const game = makeGame()
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array.from(
                {
                    length: getRowColumnCount(row, 0, CONSTANTS),
                },
                (_, col) => ({
                    color: 0xff0000,
                    x: bubbleX(col, row),
                    y: bubbleY(row),
                })
            )
    )
    const before = JSON.stringify(grid)
    const endSpy = vi.spyOn(game, 'end').mockResolvedValue(undefined)

    setState(game, {
        isActive: true,
        grid,
        rowPhase: 0,
        projectile: {
            x: 300,
            y: CONSTANTS.BUBBLE_RADIUS,
            vx: 0,
            vy: -720,
            color: 0x00ff00,
        },
        bubblesRemaining: expectedOccupiedCount({
            ...stateOf(game),
            grid,
        }),
    })

    expect(game.attachBubble({ kind: 'ceiling' })).toBe(true)
    expect(JSON.stringify(stateOf(game).grid)).toBe(before)
    expect(endSpy).toHaveBeenCalledTimes(1)
    expect(stateOf(game).projectile).toBeNull()
})
```

Use a local `countGrid(grid)` helper rather than constructing a synthetic state if TypeScript rejects the second `expectedOccupiedCount` call:

```ts
const countGrid = (grid: BubbleShooterState['grid']): number =>
    grid.reduce((total, row) => total + row.filter(Boolean).length, 0)
```

- [ ] **Step 2: Run the attachment tests and verify they fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "only beside|never overwrites"
```

Expected: FAIL because the current fallback searches unrelated cells and can replace row-zero center.

- [ ] **Step 3: Replace global attachment search**

Define the private union near the top of `BubbleShooterGame.ts`:

```ts
type ProjectileImpact =
    | { kind: 'ceiling' }
    | { kind: 'bubble'; anchor: GridPosition }
```

Implement candidate selection:

```ts
private findAttachPosition(
    constants: GameConstants,
    impact: ProjectileImpact
): GridPosition | null {
    const projectile = this.state.projectile
    if (!projectile) {
        return null
    }

    const candidates =
        impact.kind === 'bubble'
            ? getNeighbors(
                  impact.anchor.row,
                  impact.anchor.col,
                  this.state.rowPhase,
                  constants
              )
            : Array.from(
                  {
                      length: getRowColumnCount(
                          0,
                          this.state.rowPhase,
                          constants
                      ),
                  },
                  (_, col) => ({ row: 0, col })
              )

    return this.findClosestEmptyPosition(constants, candidates)
}

private findClosestEmptyPosition(
    constants: GameConstants,
    candidates: GridPosition[]
): GridPosition | null {
    const projectile = this.state.projectile
    if (!projectile) {
        return null
    }

    let closest: GridPosition | null = null
    let closestDistance = Number.POSITIVE_INFINITY

    for (const candidate of candidates) {
        if (this.state.grid[candidate.row]?.[candidate.col]) {
            continue
        }
        const candidatePoint = {
            x: getBubbleX(
                candidate.col,
                candidate.row,
                this.state.rowPhase,
                constants
            ),
            y: getBubbleY(candidate.row, constants),
        }
        const candidateDistance = distance(projectile, candidatePoint)
        if (candidateDistance < closestDistance) {
            closest = candidate
            closestDistance = candidateDistance
        }
    }

    return closest
}
```

Update `attachBubble`:

```ts
attachBubble(impact: ProjectileImpact): boolean {
    const projectile = this.state.projectile
    if (!projectile) {
        return false
    }

    const constants = this.getConstantsView()
    const attachPosition = this.findAttachPosition(constants, impact)
    if (
        !attachPosition ||
        this.state.grid[attachPosition.row]?.[attachPosition.col]
    ) {
        this.state.projectile = null
        this.state.needsRedraw = true
        this.end().catch(error =>
            console.error('BubbleShooter end failed', error)
        )
        return true
    }

    const row =
        this.state.grid[attachPosition.row] ??
        Array(
            getRowColumnCount(
                attachPosition.row,
                this.state.rowPhase,
                constants
            )
        ).fill(null)
    this.state.grid[attachPosition.row] = row
    row[attachPosition.col] = {
        color: projectile.color,
        x: getBubbleX(
            attachPosition.col,
            attachPosition.row,
            this.state.rowPhase,
            constants
        ),
        y: getBubbleY(attachPosition.row, constants),
    }
    this.syncBubbleCount()

    // Keep the existing match, interval-row, game-over, and projectile-clear
    // flow here. Task 5 replaces its match-resolution portion.
}
```

Remove the old whole-board candidate construction, `isValidAttachPosition`, and fallback object.

- [ ] **Step 4: Add a delayed-frame collision regression**

Create an occupied anchor directly in the projectile path, call `updateProjectile(500)`, and assert that the clamped/substepped update attaches beside that anchor rather than passing through it:

```ts
it('does not tunnel through a bubble on a delayed frame', () => {
    const game = makeGame({ projectileSpeed: 720 })
    const anchor = { row: 8, col: 6 }
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        () => [] as BubbleShooterState['grid'][number]
    )
    grid[anchor.row] = Array(
        getRowColumnCount(anchor.row, 0, CONSTANTS)
    ).fill(null)
    grid[anchor.row][anchor.col] = {
        color: 0x00ff00,
        x: bubbleX(anchor.col, anchor.row),
        y: bubbleY(anchor.row),
    }

    setState(game, {
        grid,
        rowPhase: 0,
        projectile: {
            x: bubbleX(anchor.col, anchor.row),
            y: bubbleY(anchor.row) + 60,
            vx: 0,
            vy: -720,
            color: 0xff0000,
        },
        bubblesRemaining: 1,
    })

    game.updateProjectile(500)

    expect(stateOf(game).projectile).toBeNull()
    expect(
        neighbors(anchor.row, anchor.col).some(
            ({ row, col }) =>
                stateOf(game).grid[row]?.[col]?.color === 0xff0000
        )
    ).toBe(true)
})
```

- [ ] **Step 5: Run Bubble Shooter game tests**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the attachment unit**

```bash
git add src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: restrict bubble shooter attachment cells"
```

---

### Task 5: Resolve direct matches, dropped clusters, active colors, and true accuracy

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts:25-75`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts:80-620`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts:80-650`

**Interfaces:**
- Produces: `ShotResolution` inside `BubbleShooterGame.ts`.
- Produces: `successfulShots` in state, stats, and game data.
- Produces: `collectColorCluster`, `collectCeilingConnected`, `removeUnsupportedBubbles`, `resolveMatches`, `getAvailableBubbleColors`, and `reconcileNextBubbleColor` private methods.
- Changes: `randomAvailableColor()` chooses from active board colors with the configured palette as fallback.

- [ ] **Step 1: Write failing drop, accuracy, and active-color tests**

Add a direct-match-plus-drop case:

```ts
it('scores direct matches and bubbles disconnected from the ceiling', () => {
    const game = makeGame({ rowAddInterval: 99 })
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array(
                getRowColumnCount(row, 0, CONSTANTS)
            ).fill(null) as BubbleShooterState['grid'][number]
    )

    grid[0][0] = { color: 0xff0000, x: bubbleX(0, 0), y: bubbleY(0) }
    grid[0][1] = { color: 0xff0000, x: bubbleX(1, 0), y: bubbleY(0) }
    grid[1][0] = { color: 0x0000ff, x: bubbleX(0, 1), y: bubbleY(1) }

    setState(game, {
        grid,
        rowPhase: 0,
        projectile: {
            x: bubbleX(2, 0),
            y: bubbleY(0),
            vx: 0,
            vy: -720,
            color: 0xff0000,
        },
        bubblesRemaining: 3,
        shotsFired: 1,
        successfulShots: 0,
        score: 0,
    })

    game.attachBubble({ kind: 'ceiling' })

    const state = stateOf(game)
    expect(countGrid(state.grid)).toBe(0)
    expect(state.bubblesPopped).toBe(4)
    expect(state.largestCombo).toBe(4)
    expect(state.successfulShots).toBe(1)
    expect(state.score).toBe(1_040)
    expect(game.getGameStats().accuracy).toBe(100)
})
```

Add active-color coverage through the private helper:

```ts
it('uses active grid colors and configured colors after an all-clear', () => {
    const game = makeGame()
    const internal = game as unknown as {
        getAvailableBubbleColors: () => number[]
    }

    setState(game, {
        grid: [[
            { color: 0xff0000, x: bubbleX(0, 0), y: bubbleY(0) },
            { color: 0x00ff00, x: bubbleX(1, 0), y: bubbleY(0) },
        ]],
    })
    expect(internal.getAvailableBubbleColors().sort()).toEqual(
        [0xff0000, 0x00ff00].sort()
    )

    setState(game, { grid: [] })
    expect(internal.getAvailableBubbleColors()).toEqual(CONSTANTS.COLORS)
})
```

Update existing accuracy tests to set `successfulShots`, and assert that eight popped bubbles across ten shots does not define accuracy:

```ts
setState(game, {
    shotsFired: 10,
    successfulShots: 6,
    bubblesPopped: 18,
})
expect(game.getGameStats().accuracy).toBe(60)
```

- [ ] **Step 2: Run focused tests and verify they fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "disconnected|active grid colors|accuracy"
```

Expected: FAIL because unsupported bubbles remain, active colors are not scanned, and accuracy still uses popped bubbles.

- [ ] **Step 3: Add state/stat contracts**

In `types.ts`, add `successfulShots: number` to:

- `BubbleShooterState`,
- `BubbleShooterEndGameStats`,
- `BubbleShooterStats`.

Initialize it to zero in `createInitialState()` and include it in `getGameData()`.

Replace accuracy calculation with:

```ts
const accuracy =
    shotsFired > 0
        ? (this.state.successfulShots / shotsFired) * 100
        : 0
```

Return `accuracy` and `successfulShots` from `getGameStats()`.

- [ ] **Step 4: Implement graph helpers and shot resolution**

Add key serialization helpers inside the class methods using `${row},${col}`. Implement same-color collection:

```ts
private collectColorCluster(
    start: GridPosition,
    constants: GameConstants
): GridPosition[] {
    const startBubble = this.state.grid[start.row]?.[start.col]
    if (!startBubble) {
        return []
    }

    const result: GridPosition[] = []
    const visited = new Set<string>()
    const pending: GridPosition[] = [start]

    while (pending.length > 0) {
        const current = pending.pop()!
        const key = `${current.row},${current.col}`
        if (visited.has(key)) {
            continue
        }
        visited.add(key)

        const bubble = this.state.grid[current.row]?.[current.col]
        if (!bubble || bubble.color !== startBubble.color) {
            continue
        }
        result.push(current)
        pending.push(
            ...getNeighbors(
                current.row,
                current.col,
                this.state.rowPhase,
                constants
            )
        )
    }

    return result
}
```

Implement ceiling reachability:

```ts
private collectCeilingConnected(
    constants: GameConstants
): Set<string> {
    const connected = new Set<string>()
    const pending: GridPosition[] = []
    const topColumnCount = getRowColumnCount(
        0,
        this.state.rowPhase,
        constants
    )

    for (let col = 0; col < topColumnCount; col++) {
        if (this.state.grid[0]?.[col]) {
            pending.push({ row: 0, col })
        }
    }

    while (pending.length > 0) {
        const current = pending.pop()!
        const key = `${current.row},${current.col}`
        if (connected.has(key) || !this.state.grid[current.row]?.[current.col]) {
            continue
        }
        connected.add(key)
        pending.push(
            ...getNeighbors(
                current.row,
                current.col,
                this.state.rowPhase,
                constants
            )
        )
    }

    return connected
}
```

Implement unsupported removal:

```ts
private removeUnsupportedBubbles(
    constants: GameConstants
): GridPosition[] {
    const connected = this.collectCeilingConnected(constants)
    const removed: GridPosition[] = []

    for (let row = 0; row < this.state.grid.length; row++) {
        for (let col = 0; col < this.state.grid[row].length; col++) {
            if (
                this.state.grid[row][col] &&
                !connected.has(`${row},${col}`)
            ) {
                this.state.grid[row][col] = null
                removed.push({ row, col })
            }
        }
    }

    this.syncBubbleCount()
    return removed
}
```

Replace `checkMatches` with:

```ts
private resolveMatches(
    attached: GridPosition,
    constants: GameConstants
): ShotResolution {
    const directMatches = this.collectColorCluster(attached, constants)
    if (directMatches.length < MATCH_THRESHOLD) {
        return { directMatches: [], dropped: [], removedCount: 0 }
    }

    this.removeBubbles(directMatches)
    const dropped = this.removeUnsupportedBubbles(constants)
    const removedCount = directMatches.length + dropped.length

    this.addScore(removedCount * POINTS_PER_BUBBLE, 'bubble_pop')
    this.state.successfulShots++
    this.state.bubblesPopped += removedCount
    this.state.largestCombo = Math.max(
        this.state.largestCombo,
        removedCount
    )
    this.syncBubbleCount()

    if (this.state.bubblesRemaining === 0) {
        this.addScore(ALL_CLEAR_BONUS, 'all_clear')
    }
    this.state.needsRedraw = true

    return { directMatches, dropped, removedCount }
}
```

Call `resolveMatches(attachPosition, constants)` immediately after attachment. Call `removeUnsupportedBubbles(constants)` without score/stat updates after `initializeGrid()` and after `addRowAtTop()` so retained state always satisfies ceiling connectivity.

- [ ] **Step 5: Implement active-color queue reconciliation**

Add:

```ts
private getAvailableBubbleColors(): number[] {
    const colors = new Set<number>()
    for (const row of this.state.grid) {
        for (const bubble of row) {
            if (bubble) {
                colors.add(bubble.color)
            }
        }
    }
    return colors.size > 0 ? [...colors] : [...this.config.colors]
}

private randomAvailableColor(): number {
    const colors = this.getAvailableBubbleColors()
    return colors[Math.floor(Math.random() * colors.length)]
}

private reconcileNextBubbleColor(): void {
    const colors = this.getAvailableBubbleColors()
    if (
        !this.state.nextBubble ||
        !colors.includes(this.state.nextBubble.color)
    ) {
        this.state.nextBubble = {
            color: colors[Math.floor(Math.random() * colors.length)],
        }
    }
}
```

Use `randomAvailableColor()` in `generateBubble`, `generateNextBubble`, initial row creation, and new row creation. After match resolution and interval-row insertion, call:

```ts
this.reconcileNextBubbleColor()
```

Do not reroll `currentBubble`; it was already previewed to the player.

- [ ] **Step 6: Run game tests**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: PASS, including updated all-clear expectations and `successfulShots` fields.

- [ ] **Step 7: Commit the resolution/stat unit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: resolve bubble shooter clusters and stats"
```

---

### Task 6: Reset ended runs, clear previews, and align rules copy

**Files:**
- Modify: `src/lib/games/bubble-shooter/initFramework.ts:70-540`
- Modify: `src/lib/games/bubble-shooter/initFramework.test.ts:1-650`
- Modify: `src/pages/bubble-shooter/index.astro:1-135`
- Modify: `src/pages/game-board-markup.test.ts:1-60`

**Interfaces:**
- Consumes: `BubbleShooterState.successfulShots` and `rowPhase` in initializer mocks.
- Produces: null-aware preview drawing and `resetPreviewState()` local helper.
- Changes: Start after an ended run calls `reset()` before `start()`.
- Changes: rules copy reads `DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval`.

- [ ] **Step 1: Extend initializer mock state**

In `initFramework.test.ts`, add to the mocked `getState()` result:

```ts
rowPhase: 0,
successfulShots: 0,
```

Add `beginPath`, `arc`, `fill`, `stroke`, `strokeStyle`, and `lineWidth` to the canvas context mock so preview drawing can be asserted without replacing `drawBubbleOnCanvas` behavior if the existing utility mock is later narrowed.

- [ ] **Step 2: Write failing ended-run start and preview-clear tests**

Add:

```ts
it('resets an ended run before starting again', async () => {
    const { BubbleShooterGame } = await import('./BubbleShooterGame')
    result = await initBubbleShooterGameFramework()
    const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value

    vi.mocked(gameMock.getState).mockReturnValue({
        ...gameMock.getState(),
        isActive: false,
        isGameOver: true,
        gameStarted: true,
        score: 500,
        shotsFired: 8,
        successfulShots: 4,
    } as never)

    document.getElementById('start-btn')!.click()

    expect(gameMock.reset).toHaveBeenCalledBefore(gameMock.start)
    expect(gameMock.start).toHaveBeenCalledTimes(1)
})

it('clears current and next previews when state resets to null', async () => {
    const { BubbleShooterGame } = await import('./BubbleShooterGame')
    const { drawBubbleOnCanvas } = await import('./utils')
    result = await initBubbleShooterGameFramework()
    const callbacks = vi.mocked(BubbleShooterGame).mock.calls[0][1] as {
        onStateChange: (state: unknown) => void
    }

    callbacks.onStateChange({
        bubblesRemaining: 2,
        currentBubble: { color: 0xff0000 },
        nextBubble: { color: 0x00ff00 },
    })
    callbacks.onStateChange({
        bubblesRemaining: 0,
        currentBubble: null,
        nextBubble: null,
    })

    expect(vi.mocked(drawBubbleOnCanvas)).toHaveBeenCalledTimes(2)
    const currentContext = (
        document.getElementById('current-bubble') as HTMLCanvasElement
    ).getContext('2d')
    const nextContext = (
        document.getElementById('next-bubble') as HTMLCanvasElement
    ).getContext('2d')
    expect(currentContext?.fillRect).toHaveBeenCalledTimes(2)
    expect(nextContext?.fillRect).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 3: Run initializer tests and verify they fail**

```bash
bun run test:run src/lib/games/bubble-shooter/initFramework.test.ts -t "ended run|previews"
```

Expected: FAIL because Start does not reset and undefined preview colors return before clearing.

- [ ] **Step 4: Make preview drawing null-aware**

Replace the duplicated preview functions with one local helper:

```ts
const drawBubblePreview = (
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D | null,
    color: number | undefined
): void => {
    if (!context) {
        return
    }

    context.fillStyle = 'rgba(0, 0, 0, 0.1)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    if (color === undefined) {
        return
    }

    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const radius = Math.min(centerX, centerY) - 4
    drawBubbleOnCanvas(
        context,
        centerX,
        centerY,
        radius,
        pixiColorToHex(color)
    )
}
```

Use `number | undefined` caches:

```ts
let lastCurrentColor: number | undefined
let lastNextColor: number | undefined

const resetPreviewState = (): void => {
    lastCurrentColor = undefined
    lastNextColor = undefined
    drawBubblePreview(currentBubbleCanvas, currentBubbleCtx, undefined)
    drawBubblePreview(nextBubbleCanvas, nextBubbleCtx, undefined)
}
```

In `onStateChange`, compare both defined and undefined colors and always call `drawBubblePreview` when the value changes.

Call `resetPreviewState()` from reset, restart, the returned `restart()` method, and before resetting an ended run.

- [ ] **Step 5: Reset before starting an ended run**

Replace the Start handler:

```ts
const startHandler = (): void => {
    const state = game.getState()
    if (state.gameStarted && !state.isActive) {
        game.reset()
        resetPreviewState()
        resetButtonVisibility()
    }
    game.start()
}
```

Pass `resetPreviewState` into `setupButtonHandlers` or define the button setup closure where the helper is in scope. Prefer adding a callback parameter rather than moving unrelated initializer code:

```ts
function setupButtonHandlers(
    game: BubbleShooterGame,
    resetPreviews: () => void
): () => void
```

- [ ] **Step 6: Update rules copy and pin it in the page test**

In Astro frontmatter:

```astro
import { DEFAULT_BUBBLE_SHOOTER_CONFIG } from '@/lib/games/bubble-shooter/BubbleShooterGame'

const rowAddInterval = DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval
```

Replace the rules with:

```astro
<p>• Match 3+ bubbles of the same color</p>
<p>• Disconnected bubbles fall after a match</p>
<p>• New row appears every {rowAddInterval} shots</p>
<p>• Game ends when bubbles reach the danger zone</p>
<p>• Accuracy counts shots that clear bubbles</p>
```

In `game-board-markup.test.ts`, load the page once near the other markup constants:

```ts
const bubbleShooterMarkup = readFileSync(
    resolve(process.cwd(), 'src/pages/bubble-shooter/index.astro'),
    'utf-8'
)
```

Add:

```ts
it('keeps Bubble Shooter rules aligned with configured mechanics', () => {
    expect(bubbleShooterMarkup).toContain(
        'DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval'
    )
    expect(bubbleShooterMarkup).toContain(
        'New row appears every {rowAddInterval} shots'
    )
    expect(bubbleShooterMarkup).toContain(
        'Disconnected bubbles fall after a match'
    )
    expect(bubbleShooterMarkup).toContain(
        'Accuracy counts shots that clear bubbles'
    )
    expect(bubbleShooterMarkup).not.toContain(
        'New row appears after each shot'
    )
})
```

- [ ] **Step 7: Run initializer and page tests**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS while the existing pointerdown-before-shooting and RAF tests remain green.

- [ ] **Step 8: Commit the lifecycle/UI unit**

```bash
git add src/lib/games/bubble-shooter/initFramework.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "fix: reset bubble shooter runs and rules"
```

---

### Task 7: Verify the complete single-PR story

**Files:**
- Review: all production and test files listed in the file map.
- Update only when a verification command reveals a concrete issue.

**Interfaces:**
- Verifies every acceptance criterion from `docs/superpowers/specs/2026-08-10-bubble-shooter-mechanics-correction-design.md`.
- Produces no new architecture or feature scope.

- [ ] **Step 1: Run all focused Bubble Shooter and page tests**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterRenderer.test.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 2: Search for stale state fields and old helper signatures**

```bash
rg -n "rowOffset|getBubbleY\([^,]+,[^,]+,[^,]+\)|getBubbleX\([^,]+,[^,]+,[^,]+\)|getNeighbors\([^,]+,[^,]+,[^,]+\)" \
  src/lib/games/bubble-shooter src/pages/bubble-shooter
```

Expected:

- no `rowOffset`,
- no old three-argument `getBubbleX`,
- no old three-argument `getNeighbors`,
- no old row-offset `getBubbleY`.

Inspect any matches manually because multiline calls can make regex results approximate; every production/test call must use the Task 1 signatures.

- [ ] **Step 3: Run the full unit suite**

```bash
bun run test:run
```

Expected: PASS.

- [ ] **Step 4: Run type and code-quality checks**

```bash
bun run typecheck
bun run lint
bun run format:check
git diff --check
```

Expected: all commands exit successfully with no new lint errors, formatting differences, or whitespace errors.

- [ ] **Step 5: Run the production build**

```bash
bun run build
```

Expected: successful Astro production build.

- [ ] **Step 6: Run the existing game happy-path E2E coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: PASS for the Bubble Shooter start, play interaction, end, and restart path. If the suite cannot run because the required browser or local database service is unavailable, record the exact command and error in the PR body rather than claiming it passed.

- [ ] **Step 7: Review the diff against the design acceptance criteria**

Use:

```bash
git diff main...HEAD -- \
  src/lib/games/bubble-shooter \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
```

Confirm explicitly:

- phase toggles on each inserted row,
- every geometry call receives `rowPhase`,
- movement uses elapsed seconds and bounded substeps,
- attachment candidates are local to the impact,
- blocked attachment cannot mutate the grid,
- counts are scanned after board mutations,
- direct matches drop unsupported bubbles,
- maintenance connectivity cleanup does not score,
- next colors use active board colors,
- successful-shot accuracy is used,
- ended runs reset before Start,
- previews clear on null/reset,
- page copy matches configuration.

- [ ] **Step 8: Commit only concrete verification fixes**

If formatting or verification required file changes:

```bash
git add src/lib/games/bubble-shooter \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "chore: finalize bubble shooter mechanics fix"
```

If no files changed, do not create an empty commit.

- [ ] **Step 9: Update the draft PR body and Linear issue**

Add the final command results to the PR test plan. Link the PR on `HPA-121`, retain the issue in `In Progress` during implementation, move it to `In Review` only after all required checks pass and the PR is marked ready, and move it to `Done` only after merge.