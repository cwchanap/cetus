# HPA-121 Bubble Shooter Mechanics Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Bubble Shooter hex geometry, projectile simulation, legal attachment, match resolution, run lifecycle, statistics, and rules in one implementation PR.

**Architecture:** Keep the existing `BaseGame` + Pixi renderer + initializer boundaries. Extend the Bubble Shooter-specific hex helpers in `utils.ts`, keep state transitions and board algorithms in `BubbleShooterGame.ts`, and keep browser lifecycle/preview behavior in `initFramework.ts`. Do not add a production module, dependency, physics engine, shared grid package, or `BaseGame` lifecycle change.

**Tech Stack:** Astro 5, TypeScript, PixiJS 8, Vitest/jsdom, Playwright, Bun 1.3.1.

## Global Constraints

- Deliver every task on branch `agent/hpa-121-bubble-shooter-mechanics` in the same draft PR.
- Track the work under Linear issue `HPA-121`.
- Do not change `BaseGame` or unrelated games.
- Reuse `distance` from `src/lib/games/shared/geometry.ts`; do not reuse the rectangular Bejeweled helpers in `src/lib/games/shared/match3.ts`.
- Set default `projectileSpeed` to exactly `720` pixels per second.
- Clamp one projectile update to exactly `50ms`.
- Limit one projectile collision substep to at most `bubbleRadius / 2` travel.
- Keep `MATCH_THRESHOLD = 3`, `POINTS_PER_BUBBLE = 10`, and `ALL_CLEAR_BONUS = 1000`.
- Count direct matches and ceiling-disconnected drops in score, `bubblesPopped`, and `largestCombo`.
- Increment `successfulShots` once only when the newly attached bubble creates a direct same-color group of at least three.
- Preserve the already-previewed current bubble. Reconcile only the future `nextBubble` after board resolution.
- Initial-grid generation samples one snapshot of `config.colors`.
- Added-row generation samples one snapshot of currently active board colors before mutating the board.
- Board mutation order is explicit: mutate grid → refresh coordinates if row geometry changed → remove unsupported bubbles when required → synchronize `bubblesRemaining` → only then generate or reconcile queue bubbles.
- `removeUnsupportedBubbles(constants)` returns `GridPosition[]` and never synchronizes counts itself. Callers own the single `syncBubbleCount()` after the mutation sequence.
- Every planned commit must compile with its production callers; do not commit an intermediate helper-signature change that knowingly leaves `BubbleShooterGame.ts` broken.
- Tests must use deterministic state or a stubbed `Math.random`.
- Remove `rowOffset`; no compatibility layer is required for internal state or helper signatures.

---

## File Map

### Production

- `src/lib/games/bubble-shooter/types.ts`
  - Add `RowPhase` and `successfulShots`; remove `rowOffset`; document speed units.
- `src/lib/games/bubble-shooter/utils.ts`
  - Calculate physical parity, row width, centered coordinates, and phase-aware neighbors.
- `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
  - Synchronize board state, simulate projectiles, attach legally, resolve matches/drops, choose colors, and calculate statistics.
- `src/lib/games/bubble-shooter/initFramework.ts`
  - Reset ended runs and clear preview canvases.
- `src/pages/bubble-shooter/index.astro`
  - Render rules that match configured behavior.

### Tests

- `src/lib/games/bubble-shooter/utils.test.ts`
- `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`
- `src/lib/games/bubble-shooter/initFramework.test.ts`
- `src/pages/game-board-markup.test.ts`

`BubbleShooterRenderer.ts` remains unchanged; it continues drawing the coordinates supplied by game state.

---

### Task 1: Make hex geometry and board state phase-aware in one atomic commit

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/utils.ts`
- Modify: `src/lib/games/bubble-shooter/utils.test.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Interfaces:**
- Produces: `RowPhase = 0 | 1`.
- Produces: `getRowParity(row, rowPhase)`.
- Produces: `getRowColumnCount(row, rowPhase, constants)`.
- Produces: `getBubbleX(col, row, rowPhase, constants)`.
- Produces: `getBubbleY(row, constants)`.
- Produces: `getNeighbors(row, col, rowPhase, constants)`.
- Produces: `BubbleShooterState.rowPhase`.
- Produces: `createEmptyRow(row, constants)`, `refreshBubbleCoordinates(constants)`, and `syncBubbleCount()` private helpers.

- [ ] **Step 1: Rewrite the existing geometry tests for the new API**

Do not only add a new suite. Delete or rewrite the existing `getBubbleX`, `getBubbleY`, and `getNeighbors` suites that still call the old 3-argument helpers and assert the old left-aligned coordinates.

Use the phase-aware API:

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
    it('derives physical parity and row width from rowPhase', () => {
        expect(getRowParity(0, 0)).toBe(0)
        expect(getRowParity(1, 0)).toBe(1)
        expect(getRowParity(0, 1)).toBe(1)
        expect(getRowParity(1, 1)).toBe(0)

        expect(getRowColumnCount(0, 0, constants)).toBe(14)
        expect(getRowColumnCount(1, 0, constants)).toBe(13)
        expect(getRowColumnCount(0, 1, constants)).toBe(13)
        expect(getRowColumnCount(1, 1, constants)).toBe(14)
    })

    it('centers full and offset rows in the 600px canvas', () => {
        expect(getBubbleX(0, 0, 0, constants)).toBe(40)
        expect(getBubbleX(13, 0, 0, constants)).toBe(560)
        expect(getBubbleX(0, 0, 1, constants)).toBe(60)
        expect(getBubbleX(12, 0, 1, constants)).toBe(540)
    })

    it('uses row-only vertical geometry', () => {
        expect(getBubbleY(0, constants)).toBe(20)
        expect(getBubbleY(1, constants)).toBeCloseTo(
            20 + 20 * Math.sqrt(3)
        )
    })

    it('keeps every interior neighbor one diameter away', () => {
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

Keep the existing color-conversion and canvas-drawing suites unchanged.

- [ ] **Step 2: Add a dense-grid invariant assertion before changing production code**

In `BubbleShooterGame.test.ts`, import `RowPhase`, `GridPosition`, and `getRowColumnCount`, and add wrappers:

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

function countGrid(grid: BubbleShooterState['grid']): number {
    let count = 0
    for (const row of grid) {
        for (let col = 0; col < row.length; col++) {
            if (row[col]) {
                count++
            }
        }
    }
    return count
}

function expectGridInvariant(game: BubbleShooterGame): void {
    const state = stateOf(game)
    const constants = game.getConstantsView()

    for (let rowIndex = 0; rowIndex < state.grid.length; rowIndex++) {
        const row = state.grid[rowIndex]
        expect(row).toHaveLength(
            getRowColumnCount(rowIndex, state.rowPhase, constants)
        )

        for (let col = 0; col < row.length; col++) {
            expect(col in row).toBe(true)
            expect(row[col]).not.toBeUndefined()

            const bubble = row[col]
            if (!bubble) {
                continue
            }

            expect(bubble.x).toBe(
                getBubbleX(
                    col,
                    rowIndex,
                    state.rowPhase,
                    constants
                )
            )
            expect(bubble.y).toBeCloseTo(
                getBubbleY(rowIndex, constants)
            )
        }
    }

    expect(state.bubblesRemaining).toBe(countGrid(state.grid))
}
```

The indexed `col in row` and `row[col] !== undefined` checks are required; `forEach`/`every` alone skip sparse holes and do not prove dense rows.

- [ ] **Step 3: Add a failing two-row insertion regression**

```ts
it('preserves dense phase-aware geometry through two inserted rows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const game = makeGame({ newRowFillChance: 1 })
    game.start()

    const internal = game as unknown as {
        addNewRow: (constants: GameConstants) => void
    }
    const constants = game.getConstantsView()

    expect(stateOf(game).rowPhase).toBe(0)
    expectGridInvariant(game)

    internal.addNewRow(constants)
    expect(stateOf(game).rowPhase).toBe(1)
    expectGridInvariant(game)

    internal.addNewRow(constants)
    expect(stateOf(game).rowPhase).toBe(0)
    expectGridInvariant(game)
})
```

- [ ] **Step 4: Run both test files and verify the migration fails before implementation**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: FAIL because the new helpers/signatures and `rowPhase` do not exist and row insertion still leaves stale horizontal geometry.

- [ ] **Step 5: Replace the pure geometry API**

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

Remove the old `rowOffset` parameter and left-aligned coordinate behavior.

- [ ] **Step 6: Add dense-row and count helpers to `BubbleShooterGame`**

Replace `rowOffset` with `rowPhase: RowPhase` in state and initialize it to `0`.

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
        const previous = this.state.grid[row] ?? []
        const normalized = Array.from(
            { length: columnCount },
            (_, col) => previous[col] ?? null
        )
        this.state.grid[row] = normalized

        for (let col = 0; col < normalized.length; col++) {
            const bubble = normalized[col]
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
    let count = 0
    for (const row of this.state.grid) {
        for (let col = 0; col < row.length; col++) {
            if (row[col]) {
                count++
            }
        }
    }
    this.state.bubblesRemaining = count
    return count
}
```

- [ ] **Step 7: Migrate every production caller in the same task**

Do not commit after only editing `utils.ts`. In the same working change:

- update `initializeGrid` to build every row with `createEmptyRow`, use the new coordinate signatures, then call `refreshBubbleCoordinates(constants)` and `syncBubbleCount()`;
- update `findAttachPosition`/`findClosestPosition` candidate geometry to `getRowColumnCount` and phase-aware coordinates;
- update `isValidAttachPosition` and the current match DFS to phase-aware `getNeighbors`;
- update all `getBubbleY` calls to the new row-only signature;
- update all `getBubbleX` calls to pass `this.state.rowPhase`;
- update all tests in `BubbleShooterGame.test.ts` to use the new wrappers.

Verify no old signatures remain:

```bash
rg -n "rowOffset|getBubbleX\([^\n]*CONSTANTS\)|getBubbleY\([^\n]*, 0, CONSTANTS\)|getNeighbors\([^\n]*CONSTANTS\)" \
  src/lib/games/bubble-shooter
```

Expected: no `rowOffset`; manually inspect any geometry matches to confirm they use the new signatures.

- [ ] **Step 8: Make row insertion preserve physical parity**

Keep `addRowAtTop` focused on the board mutation and coordinate refresh:

```ts
private addRowAtTop(constants: GameConstants): void {
    for (let row = constants.GRID_HEIGHT - 1; row > 0; row--) {
        this.state.grid[row] = [...(this.state.grid[row - 1] ?? [])]
    }

    this.state.rowPhase = this.state.rowPhase === 0 ? 1 : 0
    const topRow = this.createEmptyRow(0, constants)
    for (let col = 0; col < topRow.length; col++) {
        if (Math.random() < this.config.newRowFillChance) {
            topRow[col] = {
                color: this.config.colors[
                    Math.floor(Math.random() * this.config.colors.length)
                ],
                x: 0,
                y: 0,
            }
        }
    }
    this.state.grid[0] = topRow
    this.refreshBubbleCoordinates(constants)
}
```

For this intermediate task, `addNewRow` calls `addRowAtTop(constants)`, then `syncBubbleCount()`, then the existing game-over check. Task 4 changes row-color selection and inserts connectivity normalization before that count sync.

- [ ] **Step 9: Verify the atomic geometry + caller migration**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
```

Expected: both test files PASS and typecheck exits successfully. This is the first commit boundary; there is no intentionally broken helper-signature commit.

- [ ] **Step 10: Commit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/utils.ts \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: make bubble shooter grid phase aware"
```

---

### Task 2: Make projectile movement elapsed-time based

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Interfaces:**
- Produces: `updateProjectile(deltaTimeMs: number): boolean`.
- Produces: `reflectProjectileOffWalls(constants)`.
- Produces internally: `ProjectileImpact = { kind: 'ceiling' } | { kind: 'bubble'; anchor: GridPosition }`.
- Changes: projectile velocity is pixels per second.

- [ ] **Step 1: Add a failing refresh-rate regression**

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

it('moves equally over one second at 30Hz, 60Hz, and 120Hz', () => {
    const at30Hz = simulateProjectile(30)
    const at60Hz = simulateProjectile(60)
    const at120Hz = simulateProjectile(120)

    expect(at30Hz).toBeCloseTo(4_280, 5)
    expect(at60Hz).toBeCloseTo(at30Hz, 5)
    expect(at120Hz).toBeCloseTo(at30Hz, 5)
})
```

- [ ] **Step 2: Add a failing reflected-position regression**

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

- [ ] **Step 3: Verify the physics tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "30Hz|right wall"
```

Expected: FAIL because frame time is ignored and wall handling reverses velocity without reflecting position inside bounds.

- [ ] **Step 4: Convert speed and add bounded substeps**

Set:

```ts
projectileSpeed: 720,
```

and document `projectileSpeed: number // pixels per second` in the config type.

Add:

```ts
const MAX_PROJECTILE_FRAME_MS = 50
const MAX_PROJECTILE_SUBSTEP_RATIO = 0.5

type ProjectileImpact =
    | { kind: 'ceiling' }
    | { kind: 'bubble'; anchor: GridPosition }
```

Pass the RAF milliseconds already supplied to `update(deltaTime)` into `updateProjectile(deltaTime)`.

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

Adapt `attachBubble` to accept `ProjectileImpact` while retaining its existing candidate selection until Task 3.

- [ ] **Step 5: Update existing direct update tests**

Pass `16` to ordinary one-frame `updateProjectile` tests and change position expectations to velocity multiplied by `0.016`.

- [ ] **Step 6: Verify and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: make bubble shooter physics time based"
```

Expected: game tests PASS and typecheck exits successfully before the commit.

---

### Task 3: Restrict attachment to impact-local empty cells

**Files:**
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Interfaces:**
- Consumes: `ProjectileImpact` from Task 2.
- Produces: `findAttachPosition(constants, impact)`.
- Produces: `findClosestEmptyPosition(constants, candidates)`.
- Removes: global candidate search, `isValidAttachPosition`, and occupied top-center fallback.

- [ ] **Step 1: Add a failing anchor-local attachment regression**

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

- [ ] **Step 2: Add a failing full-board no-overwrite regression**

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

- [ ] **Step 3: Verify the attachment tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "collided anchor|without overwriting"
```

Expected: FAIL because the current fallback searches unrelated cells and can replace row-zero center.

- [ ] **Step 4: Implement impact-specific candidates using the existing shared `distance` helper**

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

If no legal position exists, clear the projectile, mark redraw, invoke the existing caught `end()` path, and return `true` without touching grid cells or counts.

For a successful insert, synchronize the count immediately after the cell write and again after the current legacy match function until Task 4 replaces match bookkeeping completely.

- [ ] **Step 5: Add delayed-frame tunneling coverage**

Place one occupied bubble 60px above a projectile moving at `-720px/s`, call `updateProjectile(500)`, and assert the projectile attaches to an anchor neighbor rather than passing through it. The input is clamped to 50ms and split into substeps no longer than 10px for the default radius.

- [ ] **Step 6: Verify and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: restrict bubble shooter attachment cells"
```

Expected: game tests PASS and typecheck exits successfully.

---

### Task 4: Normalize connectivity before queue generation, drop clusters, use active colors, and calculate true accuracy

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Interfaces:**
- Produces: `successfulShots` in state, end stats, and game data.
- Produces: `ShotResolution`.
- Produces: `collectColorCluster(start, constants): GridPosition[]`.
- Produces: `collectCeilingConnected(constants): Set<string>`.
- Produces: `removeUnsupportedBubbles(constants): GridPosition[]` with no count synchronization side effect.
- Produces: `resolveMatches(attached, constants): ShotResolution`.
- Produces: `getAvailableBubbleColors(): number[]` and `reconcileNextBubbleColor(): void`.
- Changes startup order to `initializeGrid → removeUnsupportedBubbles → syncBubbleCount → generateBubble → generateNextBubble`.
- Changes added-row order to `snapshot active colors → addRowAtTop → removeUnsupportedBubbles → syncBubbleCount → later reconcile nextBubble`.

- [ ] **Step 1: Add a failing direct-match-plus-drop regression**

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

- [ ] **Step 2: Add a failing opening-queue ordering regression**

This test pins the high-cost sequencing contract: a color present only on a floating startup bubble must be removed before current/next generation samples active colors.

```ts
it('removes floating-only colors before generating the opening queue', () => {
    const game = makeGame({ colors: [0xff0000, 0x0000ff] })
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

    grid[0][0] = {
        color: 0xff0000,
        x: bubbleX(0, 0),
        y: bubbleY(0),
    }
    grid[1][2] = {
        color: 0x0000ff,
        x: bubbleX(2, 1),
        y: bubbleY(1),
    }

    const internal = game as unknown as {
        initializeGrid: () => void
        onGameStart: () => void
    }
    vi.spyOn(internal, 'initializeGrid').mockImplementation(() => {
        setState(game, {
            grid,
            rowPhase: 0,
            bubblesRemaining: 2,
            currentBubble: null,
            nextBubble: null,
        })
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    internal.onGameStart()

    expect(stateOf(game).grid[1][2]).toBeNull()
    expect(stateOf(game).bubblesRemaining).toBe(1)
    expect(stateOf(game).currentBubble?.color).toBe(0xff0000)
    expect(stateOf(game).nextBubble?.color).toBe(0xff0000)
})
```

- [ ] **Step 3: Add failing active-color and successful-shot accuracy regressions**

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

- [ ] **Step 4: Verify the new mechanics tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "disconnected|opening queue|successful shots|active colors"
```

Expected: FAIL because unsupported bubbles are not removed, startup queue generation happens before maintenance cleanup, and accuracy/colors still use the old behavior.

- [ ] **Step 5: Add successful-shot state and stats**

Add `successfulShots: number` to `BubbleShooterState`, `BubbleShooterEndGameStats`, and `BubbleShooterStats`; initialize it to zero and include it in `getGameData()`.

Use:

```ts
const accuracy =
    this.state.shotsFired > 0
        ? (this.state.successfulShots / this.state.shotsFired) * 100
        : 0
```

Return `successfulShots` and `accuracy` from `getGameStats()`.

- [ ] **Step 6: Implement the traversal contracts with one owner for count synchronization**

Reuse the existing hex-neighbor logic; do not use `shared/match3.ts`.

```ts
interface ShotResolution {
    directMatches: GridPosition[]
    dropped: GridPosition[]
    removedCount: number
}

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

Implement `collectCeilingConnected(constants): Set<string>` with the same iterative traversal, seeded by every occupied row-zero cell and without a color predicate.

Implement `removeUnsupportedBubbles` with this exact contract:

```ts
private removeUnsupportedBubbles(
    constants: GameConstants
): GridPosition[] {
    const connected = this.collectCeilingConnected(constants)
    const dropped: GridPosition[] = []

    for (let row = 0; row < this.state.grid.length; row++) {
        for (let col = 0; col < this.state.grid[row].length; col++) {
            if (
                this.state.grid[row][col] &&
                !connected.has(`${row},${col}`)
            ) {
                dropped.push({ row, col })
                this.state.grid[row][col] = null
            }
        }
    }

    return dropped
}
```

It does **not** call `syncBubbleCount()`. That side effect belongs to the caller after the complete mutation sequence.

- [ ] **Step 7: Replace `checkMatches` with a single shot resolution**

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
    this.syncBubbleCount()

    const removedCount = directMatches.length + dropped.length
    this.addScore(removedCount * POINTS_PER_BUBBLE, 'bubble_pop')
    this.state.successfulShots++
    this.state.bubblesPopped += removedCount
    this.state.largestCombo = Math.max(
        this.state.largestCombo,
        removedCount
    )

    if (this.state.bubblesRemaining === 0) {
        this.addScore(ALL_CLEAR_BONUS, 'all_clear')
    }
    this.state.needsRedraw = true

    return { directMatches, dropped, removedCount }
}
```

`resolveMatches` owns exactly one `syncBubbleCount()` after direct and unsupported removals.

- [ ] **Step 8: Make startup normalize the board before queue generation**

Rewrite the existing start hook explicitly:

```ts
protected onGameStart(): void {
    const constants = this.getConstantsView()
    this.initializeGrid()
    this.removeUnsupportedBubbles(constants)
    this.syncBubbleCount()
    this.generateBubble()
    this.generateNextBubble()
}
```

This order is required. `generateBubble()` and `generateNextBubble()` must never sample colors from bubbles that the startup connectivity pass is about to remove.

- [ ] **Step 9: Implement active-color selection and row-generation snapshotting**

```ts
private getAvailableBubbleColors(): number[] {
    const colors = new Set<number>()
    for (const row of this.state.grid) {
        for (let col = 0; col < row.length; col++) {
            const bubble = row[col]
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
            color: colors[Math.floor(Math.random() * colors.length)],
        }
    }
}
```

Use active colors in `generateBubble()` and `generateNextBubble()`.

Keep initial-grid generation independent of its own partially generated board:

```ts
const generationColors = [...this.config.colors]
```

before filling the initial grid.

For an added row, snapshot active colors **before** row mutation. Change the row insertion API to accept that snapshot:

```ts
private addRowAtTop(
    constants: GameConstants,
    generationColors: number[]
): void {
    // shift rows, toggle rowPhase, fill row zero from generationColors,
    // then refreshBubbleCoordinates(constants)
}
```

Use this final ordering in `addNewRow`:

```ts
private addNewRow(constants: GameConstants): void {
    const generationColors = this.getAvailableBubbleColors()
    this.addRowAtTop(constants, generationColors)
    this.removeUnsupportedBubbles(constants)
    this.syncBubbleCount()

    if (this.checkGameOverCondition(constants)) {
        this.state.needsRedraw = true
    }
}
```

Do not touch `currentBubble` or `nextBubble` inside `addRowAtTop`/`addNewRow`. In `attachBubble`, after match resolution and any interval row insertion have completed, call `reconcileNextBubbleColor()` exactly once. That guarantees row mutation and maintenance normalization finish before queue reconciliation.

- [ ] **Step 10: Verify board-mutation ordering explicitly**

Add one row-insertion test where a color exists only on a cluster that becomes unsupported after the new row. Stub the generated top row so that cluster is disconnected, fire the interval attachment path, and assert:

```ts
expect(stateOf(game).grid.flat().some(
    bubble => bubble?.color === isolatedColor
)).toBe(false)
expect(stateOf(game).bubblesRemaining).toBe(countGrid(stateOf(game).grid))
expect(stateOf(game).nextBubble?.color).not.toBe(isolatedColor)
```

This pins `addRowAtTop → connectivity cleanup → count sync → nextBubble reconciliation`.

- [ ] **Step 11: Verify and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: resolve bubble shooter clusters and stats"
```

Expected: game tests PASS and typecheck exits successfully.

---

### Task 5: Reset ended runs, clear previews, and align rules

**Files:**
- Modify: `src/lib/games/bubble-shooter/initFramework.ts`
- Modify: `src/lib/games/bubble-shooter/initFramework.test.ts`
- Modify: `src/pages/bubble-shooter/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

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

- [ ] **Step 2: Add a failing ended-run Start regression**

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

- [ ] **Step 3: Add a failing null-preview regression**

Invoke the captured `onStateChange` once with current/next colors and then once with both values null. Assert each preview context's `fillRect` runs for both states while `drawBubbleOnCanvas` runs only for the colored state.

- [ ] **Step 4: Verify the initializer tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/initFramework.test.ts -t "ended run|preview"
```

Expected: FAIL because Start does not reset and undefined colors return before clearing the preview canvas.

- [ ] **Step 5: Consolidate preview drawing and reset cached colors**

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

Track cached colors as `number | undefined` and add:

```ts
const resetPreviewState = (): void => {
    lastCurrentColor = undefined
    lastNextColor = undefined
    drawBubblePreview(currentBubbleCanvas, currentBubbleCtx, undefined)
    drawBubblePreview(nextBubbleCanvas, nextBubbleCtx, undefined)
}
```

Call `drawBubblePreview` whenever a defined or undefined color differs from its cached value. Call `resetPreviewState()` from reset, restart, returned `restart()`, and ended-run Start.

- [ ] **Step 6: Reset locally before restarting an ended run**

Pass `resetPreviewState` into `setupButtonHandlers` and use:

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

Reset and restart handlers call `game.reset()`, `resetPreviews()`, and `resetButtonVisibility()` in that order. Do not change `BaseGame.start()`.

- [ ] **Step 7: Update rules from the configured interval**

In Astro frontmatter:

```astro
import { DEFAULT_BUBBLE_SHOOTER_CONFIG } from '@/lib/games/bubble-shooter/BubbleShooterGame'

const rowAddInterval = DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval
```

Render:

```astro
<p>• Match 3+ bubbles of the same color</p>
<p>• Disconnected bubbles fall after a match</p>
<p>• New row appears every {rowAddInterval} shots</p>
<p>• Game ends when bubbles reach the danger zone</p>
<p>• Accuracy counts shots that clear bubbles</p>
```

In `game-board-markup.test.ts`, load the Bubble Shooter source and assert the configured interpolation plus absence of the stale text `New row appears after each shot`.

- [ ] **Step 8: Verify and commit**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/initFramework.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "fix: reset bubble shooter runs and rules"
```

Expected: initializer/page tests PASS and typecheck exits successfully.

---

### Task 6: Verify the complete single-PR implementation

**Files:**
- Review every production and test file in the file map.
- Modify only when a verification command exposes a concrete defect.

**Interfaces:**
- Verifies: `docs/superpowers/specs/2026-08-10-bubble-shooter-mechanics-correction-design.md`.
- Produces: no new feature scope.

- [ ] **Step 1: Run focused Bubble Shooter tests**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterRenderer.test.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 2: Search for stale state, signatures, and obsolete fallbacks**

```bash
rg -n "rowOffset|isValidAttachPosition" src/lib/games/bubble-shooter
rg -n "getBubbleX|getBubbleY|getNeighbors" src/lib/games/bubble-shooter
```

Expected: no `rowOffset` or `isValidAttachPosition`; manually confirm every geometry call uses the phase-aware signatures.

- [ ] **Step 3: Re-check the critical ordering contracts in code**

Confirm `onGameStart` is exactly:

```text
initialize grid
→ remove unsupported bubbles
→ sync bubble count
→ generate current bubble
→ generate next bubble
```

Confirm the interval-row path is exactly:

```text
snapshot active colors
→ shift/toggle/fill row
→ refresh coordinates
→ remove unsupported bubbles
→ sync bubble count
→ reconcile next bubble after row handling returns
```

Confirm `removeUnsupportedBubbles` returns dropped positions and does not call `syncBubbleCount`.

- [ ] **Step 4: Run the full unit suite**

```bash
bun run test:run
```

Expected: PASS with zero failed tests.

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

Expected: exit code 0.

- [ ] **Step 6: Run lint**

```bash
bun run lint
```

Expected: zero lint errors.

- [ ] **Step 7: Run formatting check**

```bash
bun run format:check
```

Expected: exit code 0.

- [ ] **Step 8: Run the production build**

```bash
bun run build
```

Expected: exit code 0.

- [ ] **Step 9: Run existing game happy-path E2E coverage**

```bash
bun run test:e2e e2e/games/play-coverage.spec.ts
```

Expected: the play-coverage spec passes, including Bubble Shooter start/play/end/restart behavior.

- [ ] **Step 10: Review the final diff against HPA-121 acceptance criteria**

Check that the PR contains only the planned Bubble Shooter production/test changes plus the two planning documents. Confirm there is no `BaseGame`, shared `match3`, renderer-architecture, dependency, or unrelated-game change.

- [ ] **Step 11: Commit only verification-driven fixes, if any**

If Steps 1-10 required a concrete correction, stage only those files and use:

```bash
git commit -m "test: finish bubble shooter mechanics correction"
```

If no verification-driven code change exists, do not create an empty commit.

---

## Review Checklist

Before marking PR #57 ready for review:

- [ ] Existing `utils.test.ts` geometry suites use only the phase-aware centered API.
- [ ] No commit leaves changed helper signatures with broken production callers.
- [ ] Grid rows are dense arrays with explicit `null` empty cells; indexed tests prove no sparse holes.
- [ ] `rowPhase` preserves physical parity through repeated row insertion.
- [ ] Projectile motion is elapsed-time based, 50ms-clamped, and substepped at `radius / 2` maximum travel.
- [ ] Attachment is impact-local and never overwrites an occupied cell.
- [ ] `removeUnsupportedBubbles(constants): GridPosition[]` has no hidden count-sync side effect.
- [ ] `resolveMatches` synchronizes count once after direct and unsupported removal.
- [ ] Startup removes unsupported bubbles before current/next colors are generated.
- [ ] Added-row mutation and maintenance cleanup complete before `nextBubble` reconciliation.
- [ ] `bubblesRemaining` equals occupied grid cells after every completed board mutation.
- [ ] Opening and future queue colors cannot depend on colors that maintenance cleanup removes.
- [ ] Accuracy is `successfulShots / shotsFired`.
- [ ] Ended-run Start uses local `reset()` before `start()` without modifying `BaseGame`.
- [ ] Preview canvases clear when colors become null/undefined.
- [ ] Rules copy reflects the configured row interval and implemented drop/accuracy behavior.
- [ ] Focused tests, full unit suite, typecheck, lint, format check, build, and play-coverage E2E have fresh passing evidence.
