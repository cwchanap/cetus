# HPA-121 Bubble Shooter Mechanics Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Bubble Shooter hex geometry, projectile simulation, legal attachment, match resolution, run lifecycle, statistics, and rules in one implementation PR.

**Architecture:** Keep the current `BaseGame` + Pixi renderer + initializer boundaries. Put phase-aware pure geometry in `utils.ts`, board and projectile mechanics in `BubbleShooterGame.ts`, and browser lifecycle/preview behavior in `initFramework.ts`. Do not add a production file, dependency, physics engine, or cross-game abstraction.

**Tech Stack:** Astro 5, TypeScript, PixiJS 8, Vitest/jsdom, Playwright, Bun 1.3.1.

## Global Constraints

- Deliver every task on branch `agent/hpa-121-bubble-shooter-mechanics` in the same draft PR.
- Track the work under Linear issue `HPA-121`.
- Do not change `BaseGame` or unrelated games.
- Set default `projectileSpeed` to exactly `720` pixels per second.
- Clamp a projectile update to exactly `50ms`.
- Limit a projectile substep to at most `bubbleRadius / 2` travel.
- Keep `MATCH_THRESHOLD = 3`, `POINTS_PER_BUBBLE = 10`, and `ALL_CLEAR_BONUS = 1000`.
- Count direct matches and ceiling-disconnected drops in score, `bubblesPopped`, and `largestCombo`.
- Increment `successfulShots` once only when the attached bubble creates a direct same-color group of at least three.
- Preserve the already-previewed current bubble. Reconcile only the future `nextBubble` after board resolution.
- Initial-grid generation samples a snapshot of `config.colors`.
- Added-row generation samples one snapshot of currently active board colors before mutating the row.
- Tests must use deterministic state or a stubbed `Math.random`.
- Remove `rowOffset`; no compatibility layer is required for internal state or helper signatures.

---

## File map

### Production

- `src/lib/games/bubble-shooter/types.ts`
  - Add `RowPhase` and `successfulShots`; remove `rowOffset`; document speed units.
- `src/lib/games/bubble-shooter/utils.ts`
  - Calculate physical parity, row width, centered coordinates, and neighbors.
- `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
  - Synchronize board state, simulate projectiles, attach legally, resolve matches/drops, choose colors, and calculate stats.
- `src/lib/games/bubble-shooter/initFramework.ts`
  - Reset ended runs and clear preview canvases.
- `src/pages/bubble-shooter/index.astro`
  - Render rules that match configured behavior.

### Tests

- `src/lib/games/bubble-shooter/utils.test.ts`
- `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`
- `src/lib/games/bubble-shooter/initFramework.test.ts`
- `src/pages/game-board-markup.test.ts`

`BubbleShooterRenderer.ts` remains unchanged; it continues drawing coordinates supplied by game state.

---

### Task 1: Add phase-aware centered hex geometry

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts:1-75`
- Modify: `src/lib/games/bubble-shooter/utils.ts:1-75`
- Modify: `src/lib/games/bubble-shooter/utils.test.ts:1-160`

**Interfaces:**
- Produces: `RowPhase = 0 | 1`
- Produces: `getRowParity(row, rowPhase)`
- Produces: `getRowColumnCount(row, rowPhase, constants)`
- Produces: `getBubbleX(col, row, rowPhase, constants)`
- Produces: `getBubbleY(row, constants)`
- Produces: `getNeighbors(row, col, rowPhase, constants)`

- [ ] **Step 1: Write failing geometry tests**

Add imports for `getRowParity` and `getRowColumnCount`, then add:

```ts
describe('phase-aware hex geometry', () => {
    it('derives row parity and width from rowPhase', () => {
        expect(getRowParity(0, 0)).toBe(0)
        expect(getRowParity(1, 0)).toBe(1)
        expect(getRowParity(0, 1)).toBe(1)
        expect(getRowParity(1, 1)).toBe(0)
        expect(getRowColumnCount(0, 0, constants)).toBe(14)
        expect(getRowColumnCount(0, 1, constants)).toBe(13)
    })

    it('centers both row shapes in the 600px canvas', () => {
        expect(getBubbleX(0, 0, 0, constants)).toBe(40)
        expect(getBubbleX(13, 0, 0, constants)).toBe(560)
        expect(getBubbleX(0, 0, 1, constants)).toBe(60)
        expect(getBubbleX(12, 0, 1, constants)).toBe(540)
    })

    it('keeps each interior neighbor one diameter away', () => {
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
            const point = {
                x: getBubbleX(neighbor.col, neighbor.row, 1, constants),
                y: getBubbleY(neighbor.row, constants),
            }
            expect(
                Math.hypot(
                    point.x - originPoint.x,
                    point.y - originPoint.y
                )
            ).toBeCloseTo(constants.BUBBLE_RADIUS * 2)
        }
    })
})
```

Keep the existing color-conversion and canvas-drawing tests.

- [ ] **Step 2: Verify the test fails**

```bash
bun run test:run src/lib/games/bubble-shooter/utils.test.ts
```

Expected: FAIL because phase helpers and signatures do not exist.

- [ ] **Step 3: Implement the geometry API**

In `types.ts`:

```ts
export type RowPhase = 0 | 1
```

In `utils.ts`:

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
    const offsets =
        getRowParity(row, rowPhase) === 0
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
        const inBounds =
            neighborRow >= 0 &&
            neighborRow < constants.GRID_HEIGHT &&
            neighborCol >= 0 &&
            neighborCol <
                getRowColumnCount(neighborRow, rowPhase, constants)

        return inBounds
            ? [{ row: neighborRow, col: neighborCol }]
            : []
    })
}
```

- [ ] **Step 4: Verify geometry tests pass**

```bash
bun run test:run src/lib/games/bubble-shooter/utils.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/utils.ts \
  src/lib/games/bubble-shooter/utils.test.ts
git commit -m "fix: make bubble shooter grid phase aware"
```

---

### Task 2: Enforce dense grid rows, coordinates, counts, and row phase

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts:30-75`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts:1-620`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts:1-700`

**Interfaces:**
- Consumes: Task 1 geometry helpers.
- Produces: `BubbleShooterState.rowPhase`.
- Produces: `refreshBubbleCoordinates(constants)`.
- Produces: `syncBubbleCount()`.
- Produces: `randomColor(colors)`.

- [ ] **Step 1: Add test wrappers and a grid invariant assertion**

Import `RowPhase`, `GridPosition`, and `getRowColumnCount`. Add:

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

const countGrid = (grid: BubbleShooterState['grid']): number =>
    grid.reduce((total, row) => total + row.filter(Boolean).length, 0)

function expectGridInvariant(game: BubbleShooterGame): void {
    const state = stateOf(game)
    const constants = game.getConstantsView()

    state.grid.forEach((row, rowIndex) => {
        expect(row).toHaveLength(
            getRowColumnCount(rowIndex, state.rowPhase, constants)
        )
        expect(row.every(cell => cell === null || cell !== undefined)).toBe(true)

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

    expect(state.bubblesRemaining).toBe(countGrid(state.grid))
}
```

Replace old utility call sites in this test file with the wrappers.

- [ ] **Step 2: Add a failing two-row insertion test**

```ts
it('preserves the physical grid through two inserted rows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const game = makeGame({ newRowFillChance: 1 })
    game.start()

    const internal = game as unknown as {
        addRowAtTop: (constants: GameConstants) => void
    }
    const constants = game.getConstantsView()

    expect(stateOf(game).rowPhase).toBe(0)
    expectGridInvariant(game)

    internal.addRowAtTop(constants)
    expect(stateOf(game).rowPhase).toBe(1)
    expectGridInvariant(game)

    internal.addRowAtTop(constants)
    expect(stateOf(game).rowPhase).toBe(0)
    expectGridInvariant(game)
})
```

- [ ] **Step 3: Verify the game test fails**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: FAIL because state lacks `rowPhase`, rows can be sparse, and insertion does not recompute `x`.

- [ ] **Step 4: Add dense-row and count helpers**

Replace `rowOffset` with `rowPhase: RowPhase` in state and initialize `rowPhase: 0`.

Add:

```ts
private createEmptyRow(
    row: number,
    constants: GameConstants
): (Bubble | null)[] {
    return Array.from(
        {
            length: getRowColumnCount(
                row,
                this.state.rowPhase,
                constants
            ),
        },
        () => null
    )
}

private refreshBubbleCoordinates(constants: GameConstants): void {
    for (let row = 0; row < constants.GRID_HEIGHT; row++) {
        const columnCount = getRowColumnCount(
            row,
            this.state.rowPhase,
            constants
        )
        const previousRow = this.state.grid[row] ?? []
        const normalizedRow = Array.from(
            { length: columnCount },
            (_, col) => previousRow[col] ?? null
        )
        this.state.grid[row] = normalizedRow

        normalizedRow.forEach((bubble, col) => {
            if (!bubble) {
                return
            }
            bubble.x = getBubbleX(
                col,
                row,
                this.state.rowPhase,
                constants
            )
            bubble.y = getBubbleY(row, constants)
        })
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

private randomColor(colors: number[]): number {
    return colors[Math.floor(Math.random() * colors.length)]
}
```

- [ ] **Step 5: Make initialization use a configured-color snapshot**

At the beginning of `initializeGrid()`:

```ts
const generationColors = [...constants.COLORS]
this.state.grid = []
```

Create every row with `createEmptyRow`, fill initial rows with `randomColor(generationColors)`, then finish with:

```ts
this.refreshBubbleCoordinates(constants)
this.syncBubbleCount()
this.state.needsRedraw = true
```

Update every production geometry call to pass `this.state.rowPhase`.

- [ ] **Step 6: Make row insertion toggle phase and use an active-color snapshot**

Use this structure:

```ts
private addRowAtTop(constants: GameConstants): void {
    const generationColors = this.getAvailableBubbleColors()

    for (let row = constants.GRID_HEIGHT - 1; row > 0; row--) {
        this.state.grid[row] = [...(this.state.grid[row - 1] ?? [])]
    }

    this.state.rowPhase = this.state.rowPhase === 0 ? 1 : 0
    const topRow = this.createEmptyRow(0, constants)
    for (let col = 0; col < topRow.length; col++) {
        if (Math.random() < this.config.newRowFillChance) {
            topRow[col] = {
                color: this.randomColor(generationColors),
                x: 0,
                y: 0,
            }
        }
    }
    this.state.grid[0] = topRow

    this.refreshBubbleCoordinates(constants)
    this.syncBubbleCount()
    this.state.needsRedraw = true
}
```

For this task, define `getAvailableBubbleColors()` to return `[...config.colors]`; Task 5 replaces it with the active-board scan.

- [ ] **Step 7: Verify geometry and game tests**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: PASS after updating old coordinate expectations to the centered layout.

- [ ] **Step 8: Commit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: preserve bubble shooter row geometry"
```

---

### Task 3: Make projectile movement elapsed-time based

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts:55-75`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts:20-400`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts:220-400`

**Interfaces:**
- Produces: `updateProjectile(deltaTimeMs: number)`.
- Produces: `reflectProjectileOffWalls(constants)`.
- Changes: `projectileSpeed` and projectile velocity are pixels per second.

- [ ] **Step 1: Write a failing refresh-rate test**

```ts
function simulateProjectile(frameCount: number): number {
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
        grid: Array.from(
            { length: CONSTANTS.GRID_HEIGHT },
            (_, row) =>
                Array.from(
                    {
                        length: getRowColumnCount(row, 0, CONSTANTS),
                    },
                    () => null
                )
        ),
        rowPhase: 0,
    })

    for (let frame = 0; frame < frameCount; frame++) {
        game.updateProjectile(1_000 / frameCount)
    }
    return stateOf(game).projectile?.y ?? Number.NaN
}

it('moves equally at 30Hz, 60Hz, and 120Hz', () => {
    const at30Hz = simulateProjectile(30)
    const at60Hz = simulateProjectile(60)
    const at120Hz = simulateProjectile(120)

    expect(at30Hz).toBeCloseTo(4_280, 5)
    expect(at60Hz).toBeCloseTo(at30Hz, 5)
    expect(at120Hz).toBeCloseTo(at30Hz, 5)
})
```

- [ ] **Step 2: Write a failing reflected-position test**

```ts
it('keeps the projectile inside the right wall after reflection', () => {
    const game = makeGame({ projectileSpeed: 720 })
    setState(game, {
        projectile: {
            x: CONSTANTS.GAME_WIDTH - CONSTANTS.BUBBLE_RADIUS - 2,
            y: 400,
            vx: 720,
            vy: 0,
            color: 0xff0000,
        },
        grid: [],
    })

    game.updateProjectile(16)

    expect(stateOf(game).projectile?.x).toBeLessThanOrEqual(
        CONSTANTS.GAME_WIDTH - CONSTANTS.BUBBLE_RADIUS
    )
    expect(stateOf(game).projectile?.vx).toBeLessThan(0)
})
```

- [ ] **Step 3: Verify the tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "30Hz|right wall"
```

Expected: FAIL because frame time is ignored and position is not reflected inside bounds.

- [ ] **Step 4: Convert speed and add bounded substeps**

Set the default to `720` and document `projectileSpeed: number // pixels per second`.

Add:

```ts
const MAX_PROJECTILE_FRAME_MS = 50
const MAX_PROJECTILE_SUBSTEP_RATIO = 0.5

type ProjectileImpact =
    | { kind: 'ceiling' }
    | { kind: 'bubble'; anchor: GridPosition }
```

Pass `deltaTime` from `update` to `updateProjectile`.

Implement:

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
    const maxDistance =
        constants.BUBBLE_RADIUS * MAX_PROJECTILE_SUBSTEP_RATIO
    const stepCount = Math.max(
        1,
        Math.ceil((speed * elapsedSeconds) / maxDistance)
    )
    const stepSeconds = elapsedSeconds / stepCount

    for (let step = 0; step < stepCount; step++) {
        projectile.x += projectile.vx * stepSeconds
        projectile.y += projectile.vy * stepSeconds
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

Add:

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

Temporarily adapt `attachBubble` to the `ProjectileImpact` signature while retaining its current candidate logic; Task 4 replaces that logic.

- [ ] **Step 5: Update existing direct calls**

Pass `16` to ordinary one-frame `updateProjectile` tests and update movement expectations to velocity multiplied by `0.016`.

- [ ] **Step 6: Verify game tests**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: make bubble shooter physics time based"
```

---

### Task 4: Restrict attachment to impact-local empty cells

**Files:**
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts:300-510`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts:350-560`

**Interfaces:**
- Consumes: `ProjectileImpact` from Task 3.
- Produces: `findAttachPosition(constants, impact)`.
- Produces: `findClosestEmptyPosition(constants, candidates)`.
- Removes: global candidate search, `isValidAttachPosition`, and occupied top-center fallback.

- [ ] **Step 1: Write a failing anchor-local attachment test**

```ts
it('attaches a bubble impact only beside the collided anchor', () => {
    const game = makeGame()
    const anchor = { row: 4, col: 4 }
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array.from(
                {
                    length: getRowColumnCount(row, 0, CONSTANTS),
                },
                () => null
            )
    )
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

    expect(
        neighbors(anchor.row, anchor.col).filter(
            ({ row, col }) =>
                stateOf(game).grid[row][col]?.color === 0xff0000
        )
    ).toHaveLength(1)
})
```

- [ ] **Step 2: Write a failing full-board no-overwrite test**

```ts
it('ends without overwriting when no legal attachment exists', () => {
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
        bubblesRemaining: countGrid(grid),
    })

    expect(game.attachBubble({ kind: 'ceiling' })).toBe(true)
    expect(JSON.stringify(stateOf(game).grid)).toBe(before)
    expect(stateOf(game).bubblesRemaining).toBe(countGrid(grid))
    expect(stateOf(game).projectile).toBeNull()
    expect(endSpy).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 3: Verify the tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "collided anchor|without overwriting"
```

Expected: FAIL because the current fallback can search elsewhere or replace row-zero center.

- [ ] **Step 4: Implement impact-specific candidates**

```ts
private findAttachPosition(
    constants: GameConstants,
    impact: ProjectileImpact
): GridPosition | null {
    if (!this.state.projectile) {
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

    let result: GridPosition | null = null
    let resultDistance = Number.POSITIVE_INFINITY

    for (const candidate of candidates) {
        if (this.state.grid[candidate.row]?.[candidate.col]) {
            continue
        }
        const candidateDistance = distance(projectile, {
            x: getBubbleX(
                candidate.col,
                candidate.row,
                this.state.rowPhase,
                constants
            ),
            y: getBubbleY(candidate.row, constants),
        })
        if (candidateDistance < resultDistance) {
            result = candidate
            resultDistance = candidateDistance
        }
    }

    return result
}
```

In `attachBubble(impact)`, if no empty position exists:

```ts
this.state.projectile = null
this.state.needsRedraw = true
this.end().catch(error =>
    console.error('BubbleShooter end failed', error)
)
return true
```

Otherwise, verify the cell is still empty, insert the bubble using phase-aware coordinates, and call `syncBubbleCount()` before match resolution. Remove `isValidAttachPosition` and all whole-board fallback code.

- [ ] **Step 5: Add delayed-frame tunneling coverage**

Place one occupied bubble 60px above a projectile moving at `-720px/s`, call `updateProjectile(500)`, and assert the projectile attaches to an anchor neighbor. The 500ms input is clamped to 50ms and split into at least four substeps.

- [ ] **Step 6: Verify game tests**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: restrict bubble shooter attachment cells"
```

---

### Task 5: Drop unsupported clusters, use active colors, and calculate true accuracy

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts:20-80`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts:80-650`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts:70-750`

**Interfaces:**
- Produces: `successfulShots` in state, end stats, and game data.
- Produces: `ShotResolution`.
- Produces: `collectColorCluster`, `collectCeilingConnected`, `removeUnsupportedBubbles`, `resolveMatches`, `getAvailableBubbleColors`, and `reconcileNextBubbleColor`.

- [ ] **Step 1: Write a failing direct-match-plus-drop test**

```ts
it('scores a direct match and bubbles disconnected from the ceiling', () => {
    const game = makeGame({ rowAddInterval: 99 })
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array.from(
                {
                    length: getRowColumnCount(row, 0, CONSTANTS),
                },
                () => null
            )
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

    expect(countGrid(stateOf(game).grid)).toBe(0)
    expect(stateOf(game).bubblesPopped).toBe(4)
    expect(stateOf(game).largestCombo).toBe(4)
    expect(stateOf(game).successfulShots).toBe(1)
    expect(stateOf(game).score).toBe(1_040)
})
```

- [ ] **Step 2: Write failing active-color and accuracy tests**

```ts
it('reports accuracy from successful shots rather than popped bubbles', () => {
    const game = makeGame()
    setState(game, {
        shotsFired: 10,
        successfulShots: 6,
        bubblesPopped: 18,
    })
    expect(game.getGameStats().accuracy).toBe(60)
})

it('returns active colors and falls back after an all-clear', () => {
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

- [ ] **Step 3: Verify the tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "disconnected|successful shots|active colors"
```

Expected: FAIL because unsupported bubbles remain, accuracy uses pop count, and available colors are not scanned.

- [ ] **Step 4: Add state and stat contracts**

Add `successfulShots: number` to `BubbleShooterState`, `BubbleShooterEndGameStats`, and `BubbleShooterStats`. Initialize it to zero and include it in `getGameData()`.

Use:

```ts
const accuracy =
    shotsFired > 0
        ? (this.state.successfulShots / shotsFired) * 100
        : 0
```

Return `successfulShots` and `accuracy` from `getGameStats()`.

- [ ] **Step 5: Implement direct-cluster and ceiling-connectivity traversal**

Use iterative DFS/BFS and phase-aware `getNeighbors`.

```ts
private collectColorCluster(
    start: GridPosition,
    constants: GameConstants
): GridPosition[] {
    const startBubble = this.state.grid[start.row]?.[start.col]
    if (!startBubble) {
        return []
    }

    const visited = new Set<string>()
    const pending: GridPosition[] = [start]
    const result: GridPosition[] = []

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

Implement `collectCeilingConnected(constants)` with the same traversal, seeded by every occupied row-zero cell and without a color predicate. Implement `removeUnsupportedBubbles(constants)` by nulling each occupied cell not present in the connected-key set and then calling `syncBubbleCount()`.

- [ ] **Step 6: Replace `checkMatches` with one shot resolution**

```ts
interface ShotResolution {
    directMatches: GridPosition[]
    dropped: GridPosition[]
    removedCount: number
}

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

Call this after attachment. After initialization and after row insertion, call `removeUnsupportedBubbles(constants)` without score/stat changes so retained bubbles always connect to row zero.

- [ ] **Step 7: Implement active-color selection without generation feedback**

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

private reconcileNextBubbleColor(): void {
    const colors = this.getAvailableBubbleColors()
    if (
        !this.state.nextBubble ||
        !colors.includes(this.state.nextBubble.color)
    ) {
        this.state.nextBubble = {
            color: this.randomColor(colors),
        }
    }
}
```

Use `randomColor(this.getAvailableBubbleColors())` in `generateBubble()` and `generateNextBubble()`.

Keep these separate generation snapshots:

- `initializeGrid`: `const generationColors = [...config.colors]` before filling any cell.
- `addRowAtTop`: `const generationColors = getAvailableBubbleColors()` before shifting or creating row zero.

After shot resolution and any interval row insertion, call `reconcileNextBubbleColor()`. Never reroll `currentBubble`.

- [ ] **Step 8: Verify game tests**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: PASS, including revised all-clear and accuracy cases.

- [ ] **Step 9: Commit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: resolve bubble shooter clusters and stats"
```

---

### Task 6: Reset ended runs, clear previews, and align rules

**Files:**
- Modify: `src/lib/games/bubble-shooter/initFramework.ts:70-550`
- Modify: `src/lib/games/bubble-shooter/initFramework.test.ts:1-700`
- Modify: `src/pages/bubble-shooter/index.astro:1-140`
- Modify: `src/pages/game-board-markup.test.ts:1-70`

**Interfaces:**
- Consumes: `rowPhase` and `successfulShots` in initializer state.
- Produces: `drawBubblePreview(...)` and `resetPreviewState()` local helpers.
- Changes: ended-run Start calls `reset()` before `start()`.

- [ ] **Step 1: Extend the initializer mock state**

Add:

```ts
rowPhase: 0,
successfulShots: 0,
```

Keep all existing pointer and RAF mock behavior.

- [ ] **Step 2: Write a failing ended-run Start test**

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
```

- [ ] **Step 3: Write a failing null-preview test**

Invoke the captured `onStateChange` first with current/next colors and then with both values null. Assert each preview context's `fillRect` runs twice while `drawBubbleOnCanvas` runs only for the colored state.

- [ ] **Step 4: Verify the initializer tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/initFramework.test.ts -t "ended run|preview"
```

Expected: FAIL because Start does not reset and undefined colors return before clearing.

- [ ] **Step 5: Consolidate preview drawing**

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

Track `number | undefined` colors. Add:

```ts
const resetPreviewState = (): void => {
    lastCurrentColor = undefined
    lastNextColor = undefined
    drawBubblePreview(currentBubbleCanvas, currentBubbleCtx, undefined)
    drawBubblePreview(nextBubbleCanvas, nextBubbleCtx, undefined)
}
```

Call `drawBubblePreview` whenever a defined or undefined color differs from its cached value. Call `resetPreviewState()` from reset, restart, returned `restart()`, and ended-run Start.

- [ ] **Step 6: Reset before starting a previous run**

Pass `resetPreviewState` into `setupButtonHandlers`:

```ts
function setupButtonHandlers(
    game: BubbleShooterGame,
    resetPreviews: () => void
): () => void
```

Use:

```ts
const startHandler = (): void => {
    const state = game.getState()
    if (state.gameStarted && !state.isActive) {
        game.reset()
        resetPreviews()
        resetButtonVisibility()
    }
    game.start()
}
```

Reset and restart handlers call `game.reset()`, `resetPreviews()`, and `resetButtonVisibility()` in that order.

- [ ] **Step 7: Update and test rules copy**

In Astro frontmatter:

```astro
import { DEFAULT_BUBBLE_SHOOTER_CONFIG } from '@/lib/games/bubble-shooter/BubbleShooterGame'

const rowAddInterval = DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval
```

Use:

```astro
<p>• Match 3+ bubbles of the same color</p>
<p>• Disconnected bubbles fall after a match</p>
<p>• New row appears every {rowAddInterval} shots</p>
<p>• Game ends when bubbles reach the danger zone</p>
<p>• Accuracy counts shots that clear bubbles</p>
```

In `game-board-markup.test.ts`, load the Bubble Shooter page and assert those source strings plus absence of `New row appears after each shot`.

- [ ] **Step 8: Verify initializer and page tests**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS with existing pointerdown-before-shoot and RAF tests still green.

- [ ] **Step 9: Commit**

```bash
git add src/lib/games/bubble-shooter/initFramework.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "fix: reset bubble shooter runs and rules"
```

---

### Task 7: Verify the complete single-PR change

**Files:**
- Review: every file in the file map.
- Modify only when a command exposes a concrete defect.

**Interfaces:**
- Verifies: `docs/superpowers/specs/2026-08-10-bubble-shooter-mechanics-correction-design.md`.
- Produces: no new scope.

- [ ] **Step 1: Run focused tests**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterRenderer.test.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 2: Search for stale state and signatures**

```bash
rg -n "rowOffset" src/lib/games/bubble-shooter
rg -n "getBubbleX|getBubbleY|getNeighbors" src/lib/games/bubble-shooter
```

Expected: no `rowOffset`; manually confirm every geometry call has the Task 1 signature.

- [ ] **Step 3: Run the full unit suite**

```bash
bun run test:run
```

Expected: PASS.

- [ ] **Step 4: Run type, lint, format, and diff checks**

```bash
bun run typecheck
bun run lint
bun run format:check
git diff --check
```

Expected: all commands exit successfully with no new errors.

- [ ] **Step 5: Run the production build**

```bash
bun run build
```

Expected: successful Astro production build.

- [ ] **Step 6: Run existing game E2E coverage**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: Bubble Shooter start, interaction, end, and restart path passes. If the browser or local database service is unavailable, record the exact command and error in the PR body rather than claiming success.

- [ ] **Step 7: Review the diff against invariants**

```bash
git diff main...HEAD -- \
  src/lib/games/bubble-shooter \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
```

Confirm:

- row phase toggles on insertion,
- rows contain explicit `null` cells rather than sparse holes,
- initial and added rows use fixed color snapshots,
- all geometry calls use row phase,
- projectile movement uses elapsed time and bounded substeps,
- reflected positions remain inside walls,
- impact candidates are local and empty,
- blocked attachment cannot mutate the grid,
- `bubblesRemaining` equals occupied cells,
- successful direct matches drop unsupported bubbles,
- maintenance connectivity cleanup does not score,
- future colors come from active board colors,
- accuracy uses successful shots,
- ended runs reset before Start,
- previews clear when colors become null,
- rules match configured behavior.

- [ ] **Step 8: Commit only verification fixes**

If verification changed files:

```bash
git add src/lib/games/bubble-shooter \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "chore: finalize bubble shooter mechanics fix"
```

Do not create an empty commit.

- [ ] **Step 9: Update tracking state**

Add command results to the PR body. Keep `HPA-121` in `In Progress` while implementation is underway, move it to `In Review` only after required checks pass and the PR is marked ready, and move it to `Done` only after merge.