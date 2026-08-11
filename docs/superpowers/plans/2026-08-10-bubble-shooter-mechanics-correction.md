# HPA-121 Bubble Shooter Mechanics Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Bubble Shooter hex geometry, projectile simulation, legal attachment, cluster removal, queue/stat semantics, restart behavior, previews, and rules in one implementation PR.

**Architecture:** Keep Bubble Shooter geometry and mechanics local to its existing module, reuse the shared `distance` helper, and leave the Pixi renderer coordinate-driven. Make two narrowly shared framework corrections in `BaseGame`: an ended-run `start()` resets before starting the next run, and `update(deltaTime)` is explicitly measured in seconds. No physics engine, shared hex-grid package, renderer rewrite, persistence migration, or compatibility layer is added.

**Tech Stack:** Astro 5, TypeScript, PixiJS 8, Vitest/jsdom, Playwright, Bun 1.3.1.

## Global Constraints

- Deliver all tasks on branch `agent/hpa-121-bubble-shooter-mechanics` in draft PR #57.
- Track the work under Linear issue `HPA-121`.
- Reuse `distance` from `src/lib/games/shared/geometry.ts`.
- Do not reuse `src/lib/games/shared/match3.ts`; it models rectangular run matching/gravity, not hex connectivity.
- Do not add a physics engine, shared grid/graph package, new production module, animation, sound, asset, power-up, level, or difficulty feature.
- `BaseGame.update(deltaTime)` uses elapsed **seconds**.
- Set Bubble Shooter default `projectileSpeed` to exactly `720` pixels per second.
- Clamp one Bubble Shooter projectile update to exactly `0.05` seconds.
- Limit one Bubble Shooter projectile substep to at most `bubbleRadius / 2` travel.
- Keep `MATCH_THRESHOLD = 3`, `POINTS_PER_BUBBLE = 10`, and `ALL_CLEAR_BONUS = 1000`.
- Bubble collision is evaluated before ceiling collision on every projectile substep.
- A blocked impact consumes the projectile but is not a game-over condition by itself; `checkGameOverCondition()` remains the gameplay game-over authority.
- Count direct matches and ceiling-disconnected drops in score, `bubblesPopped`, and `largestCombo`.
- Increment `successfulShots` once only when the newly attached bubble creates a direct same-color cluster of at least three.
- Preserve the already-previewed current bubble; only reconcile future `nextBubble` after all board mutation/cleanup for the shot.
- Initial-grid generation samples one snapshot of `config.colors`.
- Added-row generation samples one snapshot of currently active board colors before mutating the board.
- Board mutation ordering is explicit: mutate grid → refresh coordinates if row geometry changed → remove unsupported bubbles when required → synchronize `bubblesRemaining` → reconcile future queue.
- `removeUnsupportedBubbles(constants)` returns `GridPosition[]` and does not call `syncBubbleCount()`.
- Every planned commit must compile with all production callers; no intentionally broken signature-migration commit is allowed.
- Tests use deterministic board state or stubbed `Math.random`.
- Remove `rowOffset`; no compatibility layer is required for internal state/helper signatures.
- Do not remove existing initializer-level restart guards from other games in this PR; the shared BaseGame fix makes them redundant but harmless.

---

## File Map

### Shared framework

- `src/lib/games/core/BaseGame.ts`
  - Reset a completed run inside `start()` before beginning the next run.
  - Document `update(deltaTime)` as elapsed seconds.
- `src/lib/games/core/core.test.ts`
  - Regression coverage for ended-run restart and active-start no-op.

### Bubble Shooter production

- `src/lib/games/bubble-shooter/types.ts`
  - Add `RowPhase` and `successfulShots`; remove `rowOffset`; document speed units.
- `src/lib/games/bubble-shooter/utils.ts`
  - Physical parity, row width, centered coordinates, and phase-aware neighbors.
- `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
  - Dense board normalization, projectile substeps, wall reflection, impact-local attachment, count sync, cluster/drop resolution, active colors, scoring/statistics.
- `src/lib/games/bubble-shooter/initFramework.ts`
  - Convert RAF milliseconds to seconds; clear preview canvases on null/reset.
- `src/pages/bubble-shooter/index.astro`
  - Render configured row interval and corrected rules.

### Bubble Shooter tests

- `src/lib/games/bubble-shooter/utils.test.ts`
- `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`
- `src/lib/games/bubble-shooter/initFramework.test.ts`
- `src/pages/game-board-markup.test.ts`

`src/lib/games/bubble-shooter/BubbleShooterRenderer.ts` remains unchanged.

---

### Task 1: Fix shared ended-run restart semantics and define delta-time units

**Files:**
- Modify: `src/lib/games/core/BaseGame.ts`
- Modify: `src/lib/games/core/core.test.ts`

**Interfaces:**
- Produces: `BaseGame.start()` resets when `state.gameStarted && state.isGameOver` before setting new-run flags.
- Produces: `BaseGame.update(deltaTime)` contract = elapsed seconds.
- Preserves: calling `start()` while already active is a no-op.

- [ ] **Step 1: Add a failing ended-run restart regression**

Inside the existing `BaseGame default hooks` suite, add:

```ts
it('resets state and score before starting after game over', async () => {
    const game = new MinimalGame(
        GameID.QUICK_MATH,
        {
            duration: 60,
            achievementIntegration: false,
            pausable: true,
            resettable: true,
        },
        {}
    )

    game.start()
    game.addScore(75, 'first-run')
    expect(game.getState().score).toBe(75)

    await game.end()
    expect(game.getState().isGameOver).toBe(true)

    game.start()

    expect(game.getState()).toMatchObject({
        score: 0,
        isActive: true,
        isGameOver: false,
        gameStarted: true,
    })
    expect(game.getScoreManager().getScore()).toBe(0)
})
```

- [ ] **Step 2: Add/retain active-start no-op coverage**

Add a focused assertion if the existing test does not already pin `reset()`:

```ts
it('does not reset when start is called while already active', () => {
    const game = new MinimalGame(
        GameID.QUICK_MATH,
        {
            duration: 60,
            achievementIntegration: false,
            pausable: true,
            resettable: true,
        },
        {}
    )
    const resetSpy = vi.spyOn(game, 'reset')

    game.start()
    game.start()

    expect(resetSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Verify the ended-run test fails**

```bash
bun run test:run src/lib/games/core/core.test.ts -t "resets state and score|already active"
```

Expected: ended-run test FAILS because `start()` currently flips flags without resetting `ScoreManager`/state; active-start test passes.

- [ ] **Step 4: Implement the minimal shared restart fix**

In `BaseGame.start()` keep the active guard first, then reset completed runs:

```ts
start(): void {
    if (this.state.isActive) {
        return
    }

    if (this.state.gameStarted && this.state.isGameOver) {
        this.reset()
    }

    this.runGuard.next()
    this.state.isActive = true
    this.state.gameStarted = true
    this.state.isGameOver = false
    this.state.isPaused = false

    this.timer.start()
    this.emit('start')

    if (this.callbacks.onStart) {
        this.callbacks.onStart()
    }

    this.onGameStart()
}
```

Do not remove the existing reset-before-start guards from 2048/Evader/Reflex/Sudoku in this PR. Their explicit `reset()` changes `gameStarted` back to false, so the BaseGame guard is a no-op when `start()` follows.

- [ ] **Step 5: Document seconds on the abstract update contract**

Replace the bare abstract declaration with:

```ts
/**
 * Advance game logic by elapsed time in seconds.
 */
abstract update(deltaTime: number): void
```

- [ ] **Step 6: Verify core tests and typecheck**

```bash
bun run test:run src/lib/games/core/core.test.ts
bun run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/core/BaseGame.ts src/lib/games/core/core.test.ts
git commit -m "fix: reset completed BaseGame runs on start"
```

---

### Task 2: Make hex geometry and board state phase-aware in one atomic commit

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/utils.ts`
- Modify: `src/lib/games/bubble-shooter/utils.test.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Interfaces:**
- Produces: `RowPhase = 0 | 1`.
- Produces: `getRowParity(row, rowPhase): RowPhase`.
- Produces: `getRowColumnCount(row, rowPhase, constants): number`.
- Produces: `getBubbleX(col, row, rowPhase, constants): number`.
- Produces: `getBubbleY(row, constants): number`.
- Produces: `getNeighbors(row, col, rowPhase, constants): GridPosition[]`.
- Produces: `BubbleShooterState.rowPhase`.
- Produces private `createEmptyRow`, `refreshBubbleCoordinates`, `syncBubbleCount`.

- [ ] **Step 1: Rewrite the existing geometry suites, not just add new tests**

Replace the current `getBubbleX`, `getBubbleY`, and `getNeighbors` suites that call the old API. Keep color conversion and canvas-drawing tests.

Use:

```ts
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

    it('centers full and offset rows inside projectile wall bounds', () => {
        expect(getBubbleX(0, 0, 0, constants)).toBe(40)
        expect(getBubbleX(13, 0, 0, constants)).toBe(560)
        expect(getBubbleX(0, 0, 1, constants)).toBe(60)
        expect(getBubbleX(12, 0, 1, constants)).toBe(540)

        expect(getBubbleX(0, 0, 0, constants) - constants.BUBBLE_RADIUS).toBe(20)
        expect(getBubbleX(13, 0, 0, constants) + constants.BUBBLE_RADIUS).toBe(580)
    })

    it('uses row-only vertical spacing', () => {
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

- [ ] **Step 2: Add test wrappers and a dense-grid invariant**

In `BubbleShooterGame.test.ts` add:

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

Indexed checks are required because `Array.forEach`/`every` skip sparse holes.

- [ ] **Step 3: Add a failing two-row insertion regression**

```ts
it('preserves dense phase-aware geometry through two inserted rows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const game = makeGame({ newRowFillChance: 1 })
    game.start()

    const internal = game as unknown as {
        addRowAtTop: (constants: GameConstants, colors: number[]) => void
    }
    const constants = game.getConstantsView()

    expect(stateOf(game).rowPhase).toBe(0)
    expectGridInvariant(game)

    internal.addRowAtTop(constants, CONSTANTS.COLORS)
    expect(stateOf(game).rowPhase).toBe(1)
    expectGridInvariant(game)

    internal.addRowAtTop(constants, CONSTANTS.COLORS)
    expect(stateOf(game).rowPhase).toBe(0)
    expectGridInvariant(game)
})
```

- [ ] **Step 4: Verify migration tests fail before production changes**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: FAIL because phase helpers/signatures/state do not exist and current insertion leaves stale x/parity.

- [ ] **Step 5: Add RowPhase and replace geometry helpers**

In `types.ts`:

```ts
export type RowPhase = 0 | 1
```

Replace geometry functions in `utils.ts` with:

```ts
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

- [ ] **Step 6: Replace `rowOffset` with dense phase-aware state**

In `BubbleShooterState` replace `rowOffset` with:

```ts
rowPhase: RowPhase
```

Initialize:

```ts
rowPhase: 0,
```

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
        const count = getRowColumnCount(
            row,
            this.state.rowPhase,
            constants
        )
        const previous = this.state.grid[row] ?? []
        const dense = Array.from(
            { length: count },
            (_, col) => previous[col] ?? null
        )
        this.state.grid[row] = dense

        for (let col = 0; col < dense.length; col++) {
            const bubble = dense[col]
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

- [ ] **Step 7: Migrate all production callers in the same commit**

`initializeGrid()` creates every row with `createEmptyRow()`, fills the first `initialRows` from a fixed `const generationColors = [...this.config.colors]`, then calls:

```ts
this.refreshBubbleCoordinates(constants)
this.syncBubbleCount()
this.state.needsRedraw = true
```

Change every `getBubbleX/getBubbleY/getNeighbors` call in `BubbleShooterGame.ts` to the new signatures.

Change row insertion to accept a color snapshot and preserve physical parity:

```ts
private addRowAtTop(
    constants: GameConstants,
    generationColors: number[]
): void {
    for (let row = constants.GRID_HEIGHT - 1; row > 0; row--) {
        this.state.grid[row] = [...(this.state.grid[row - 1] ?? [])]
    }

    this.state.rowPhase = this.state.rowPhase === 0 ? 1 : 0
    const topRow = this.createEmptyRow(0, constants)
    for (let col = 0; col < topRow.length; col++) {
        if (Math.random() < this.config.newRowFillChance) {
            topRow[col] = {
                color: generationColors[
                    Math.floor(Math.random() * generationColors.length)
                ],
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

For this task, `addNewRow()` may pass `[...this.config.colors]`; active-color snapshotting replaces that in Task 6.

- [ ] **Step 8: Verify no old signatures remain and commit**

```bash
rg -n "rowOffset" src/lib/games/bubble-shooter
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
```

Expected: no `rowOffset`, both test files PASS, typecheck exits 0.

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/utils.ts \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: make bubble shooter grid phase aware"
```

---

### Task 3: Standardize Bubble Shooter on seconds and add collision-safe projectile substeps

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`
- Modify: `src/lib/games/bubble-shooter/initFramework.ts`
- Modify: `src/lib/games/bubble-shooter/initFramework.test.ts`

**Interfaces:**
- Produces: `updateProjectile(deltaTimeSeconds: number): boolean`.
- Produces: `reflectProjectileOffWalls(constants): void`.
- Produces: `ProjectileImpact` union used by Task 4.
- Changes Bubble Shooter RAF call to pass elapsed seconds.

- [ ] **Step 1: Add a failing refresh-rate independence test**

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
        game.updateProjectile(1 / frameCount)
    }
    return stateOf(game).projectile?.y ?? Number.NaN
}

it('moves equally for one second at 30Hz 60Hz and 120Hz', () => {
    const at30Hz = simulateProjectile(30)
    const at60Hz = simulateProjectile(60)
    const at120Hz = simulateProjectile(120)

    expect(at30Hz).toBeCloseTo(4_280, 5)
    expect(at60Hz).toBeCloseTo(at30Hz, 5)
    expect(at120Hz).toBeCloseTo(at30Hz, 5)
})
```

- [ ] **Step 2: Add a failing high-speed tunneling test that requires substeps**

Use a speed where one clamped frame can cross multiple bubble diameters:

```ts
it('does not tunnel through a bubble at high configured speed', () => {
    const game = makeGame({ projectileSpeed: 4_000 })
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
    grid[8][6] = {
        color: 0x00ff00,
        x: 300,
        y: 300,
    }

    setState(game, {
        grid,
        rowPhase: 0,
        projectile: {
            x: 300,
            y: 400,
            vx: 0,
            vy: -4_000,
            color: 0xff0000,
        },
    })

    game.updateProjectile(0.05)

    expect(stateOf(game).projectile).toBeNull()
})
```

The projectile travels 200px in 50ms. Without substeps it ends 100px beyond the bubble and misses the 40px collision diameter; with 10px-or-smaller substeps it resolves the collision.

- [ ] **Step 3: Add a wall-reflection test**

```ts
it('reflects position back inside the right wall', () => {
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

    game.updateProjectile(0.016)

    expect(stateOf(game).projectile?.x).toBeLessThanOrEqual(
        CONSTANTS.GAME_WIDTH - CONSTANTS.BUBBLE_RADIUS
    )
    expect(stateOf(game).projectile?.vx).toBeLessThan(0)
})
```

- [ ] **Step 4: Add a failing initializer delta-unit test**

In the RAF test, invoke the loop once to establish time and once 16ms later; assert:

```ts
expect(gameMock.update).toHaveBeenLastCalledWith(0.016)
```

Use `performance.now` stubbing consistent with the existing test setup so the assertion is deterministic.

- [ ] **Step 5: Verify the new tests fail**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  -t "one second|tunnel|right wall|delta"
```

Expected: FAIL because Bubble Shooter ignores delta, uses per-frame velocity, and the initializer passes milliseconds.

- [ ] **Step 6: Convert speed and implement bounded substeps**

In config/types:

```ts
projectileSpeed: 720, // pixels per second
```

In `BubbleShooterGame.ts`:

```ts
const MAX_PROJECTILE_FRAME_SECONDS = 0.05
const MAX_PROJECTILE_SUBSTEP_RATIO = 0.5

type ProjectileImpact =
    | { kind: 'ceiling' }
    | { kind: 'bubble'; anchor: GridPosition }
```

Change `update(deltaTime)` to call `updateProjectile(deltaTime)`.

Implement:

```ts
updateProjectile(deltaTimeSeconds: number): boolean {
    const projectile = this.state.projectile
    if (!projectile) {
        return false
    }

    const constants = this.getConstantsView()
    const elapsed = Math.min(
        Math.max(deltaTimeSeconds, 0),
        MAX_PROJECTILE_FRAME_SECONDS
    )
    const speed = Math.hypot(projectile.vx, projectile.vy)
    const maxStepDistance =
        constants.BUBBLE_RADIUS * MAX_PROJECTILE_SUBSTEP_RATIO
    const stepCount = Math.max(
        1,
        Math.ceil((speed * elapsed) / maxStepDistance)
    )
    const stepSeconds = elapsed / stepCount

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

    if (elapsed > 0) {
        this.state.needsRedraw = true
    }
    return false
}
```

Bubble collision stays before ceiling collision.

Implement wall reflection:

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

Temporarily adapt `attachBubble` to accept `ProjectileImpact` while retaining its current candidate behavior; Task 4 removes the global fallback.

- [ ] **Step 7: Convert the RAF loop from milliseconds to seconds**

In `initFramework.ts`:

```ts
const now = performance.now()
if (lastFrame === 0) {
    lastFrame = now
}
const deltaTimeSeconds = (now - lastFrame) / 1_000
lastFrame = now

game.update(deltaTimeSeconds)
```

Do not clamp here; the game owns its 0.05s clamp.

- [ ] **Step 8: Update old projectile test call sites and verify**

Replace old one-frame test calls with values such as `0.016`, and update expectations to `velocity * 0.016` where applicable.

```bash
bun run test:run \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts
bun run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/initFramework.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts
git commit -m "fix: make bubble shooter physics time based"
```

---

### Task 4: Restrict attachment to impact-local cells without spurious game over

**Files:**
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Interfaces:**
- Consumes: `ProjectileImpact` from Task 3.
- Produces: `findAttachPosition(constants, impact): GridPosition | null`.
- Produces: `findClosestEmptyPosition(constants, candidates): GridPosition | null`.
- Removes: whole-board candidate search, `isValidAttachPosition`, and forced row-zero fallback.

- [ ] **Step 1: Add an anchor-local attachment regression**

```ts
it('attaches a bubble impact only beside the collided anchor', () => {
    const game = makeGame({ rowAddInterval: 99 })
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

- [ ] **Step 2: Add the partial-block regression that distinguishes blocked impact from loss**

Construct one reachable impact with every legal candidate filled but no bubble near the danger zone:

```ts
it('consumes a locally blocked shot without ending the run', () => {
    const game = makeGame({ rowAddInterval: 99 })
    const anchor = { row: 2, col: 5 }
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

    const occupied = [anchor, ...neighbors(anchor.row, anchor.col)]
    for (const position of occupied) {
        grid[position.row][position.col] = {
            color: 0x00ff00,
            x: bubbleX(position.col, position.row),
            y: bubbleY(position.row),
        }
    }
    const before = JSON.stringify(grid)
    const endSpy = vi.spyOn(game, 'end').mockResolvedValue(undefined)

    setState(game, {
        isActive: true,
        grid,
        rowPhase: 0,
        projectile: {
            x: bubbleX(anchor.col, anchor.row),
            y: bubbleY(anchor.row) + 30,
            vx: 0,
            vy: -720,
            color: 0xff0000,
        },
        bubblesRemaining: countGrid(grid),
    })

    expect(game.attachBubble({ kind: 'bubble', anchor })).toBe(false)
    expect(JSON.stringify(stateOf(game).grid)).toBe(before)
    expect(stateOf(game).projectile).toBeNull()
    expect(stateOf(game).isActive).toBe(true)
    expect(endSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Verify the attachment regressions fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "collided anchor|locally blocked"
```

Expected: FAIL because current fallback searches the whole board and the previous plan's blocked behavior would end the run.

- [ ] **Step 4: Implement impact-specific candidates using shared `distance`**

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

    let best: GridPosition | null = null
    let bestDistance = Number.POSITIVE_INFINITY

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
        if (candidateDistance < bestDistance) {
            best = candidate
            bestDistance = candidateDistance
        }
    }

    return best
}
```

Delete `isValidAttachPosition` and the whole-board/fixed-cell fallback.

- [ ] **Step 5: Make blocked impact a consumed normal shot**

Structure `attachBubble` so row-interval bookkeeping and danger-zone checking run for both attached and blocked resolved projectiles:

```ts
const attachPos = this.findAttachPosition(constants, impact)

if (attachPos) {
    if (this.state.grid[attachPos.row]?.[attachPos.col]) {
        throw new Error('Bubble Shooter attach target must be empty')
    }

    this.state.grid[attachPos.row][attachPos.col] = {
        color: this.state.projectile.color,
        x: getBubbleX(
            attachPos.col,
            attachPos.row,
            this.state.rowPhase,
            constants
        ),
        y: getBubbleY(attachPos.row, constants),
    }
    this.syncBubbleCount()
    this.checkMatches(attachPos.row, attachPos.col)
    this.syncBubbleCount()
}

this.state.shotCount++
if (
    this.state.bubblesRemaining > 0 &&
    this.state.shotCount % this.config.rowAddInterval === 0
) {
    this.addNewRow(constants)
}

this.state.projectile = null
this.state.needsRedraw = true

if (this.checkGameOverCondition(constants)) {
    this.end().catch(error =>
        console.error('BubbleShooter end failed', error)
    )
    return true
}
return false
```

The blocked path writes no cell and creates no successful match. It still consumes a row-interval shot, and only the danger-zone check can end the run.

- [ ] **Step 6: Pin bubble-before-ceiling impact priority**

Add a test with a row-zero bubble and a projectile substep that crosses both the bubble collision threshold and ceiling threshold. Spy on `attachBubble` and assert the impact is:

```ts
expect(attachSpy).toHaveBeenCalledWith({
    kind: 'bubble',
    anchor: { row: 0, col: targetCol },
})
```

- [ ] **Step 7: Verify and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
```

Expected: PASS and typecheck exits 0.

```bash
git add src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: restrict bubble shooter attachment cells"
```

---

### Task 5: Add ceiling-connectivity drops and one authoritative match resolution

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Interfaces:**
- Produces: `successfulShots` state/stat field for Task 6 accuracy.
- Produces: `ShotResolution`.
- Produces: `collectColorCluster(start, constants): GridPosition[]`.
- Produces: `collectCeilingConnected(constants): Set<string>`.
- Produces: `removeUnsupportedBubbles(constants): GridPosition[]` with no count-sync side effect.
- Produces: `resolveMatches(attached, constants): ShotResolution`.

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

- [ ] **Step 2: Add a failing contract test for maintenance cleanup**

```ts
it('returns unsupported positions without changing score or successfulShots', () => {
    const game = makeGame()
    // Build one top-connected red bubble and one isolated blue bubble.
    // Use a dense grid and sync bubblesRemaining before invoking the helper.
    const internal = game as unknown as {
        removeUnsupportedBubbles: (
            constants: GameConstants
        ) => GridPosition[]
    }
    const beforeScore = stateOf(game).score
    const beforeSuccessfulShots = stateOf(game).successfulShots

    const dropped = internal.removeUnsupportedBubbles(
        game.getConstantsView()
    )

    expect(dropped).toEqual([{ row: isolatedRow, col: isolatedCol }])
    expect(stateOf(game).score).toBe(beforeScore)
    expect(stateOf(game).successfulShots).toBe(beforeSuccessfulShots)
})
```

Use concrete `isolatedRow`/`isolatedCol` constants in the actual test setup; do not leave symbolic placeholders in committed code.

- [ ] **Step 3: Verify tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "disconnected from the ceiling|unsupported positions"
```

Expected: FAIL because unsupported bubbles are not removed and the helper contracts do not exist.

- [ ] **Step 4: Add successful-shot state contracts**

Add `successfulShots: number` to `BubbleShooterState`, `BubbleShooterEndGameStats`, and `BubbleShooterStats`. Initialize:

```ts
successfulShots: 0,
```

Do not switch accuracy yet; Task 6 does that with the queue/stat semantics commit.

- [ ] **Step 5: Implement local iterative hex traversals**

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

Implement ceiling traversal seeded by every occupied row-zero cell:

```ts
private collectCeilingConnected(
    constants: GameConstants
): Set<string> {
    const connected = new Set<string>()
    const pending: GridPosition[] = []

    for (let col = 0; col < this.state.grid[0].length; col++) {
        if (this.state.grid[0][col]) {
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

Implement the exact drop contract:

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

It must not call `syncBubbleCount()`.

- [ ] **Step 6: Replace `checkMatches` with one resolution owner**

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

`resolveMatches` owns exactly one count sync after direct + unsupported removals.

- [ ] **Step 7: Normalize connectivity after startup and row insertion**

Rewrite startup maintenance before queue generation:

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

Change `addNewRow()` to clean unsupported cells after the row mutation and then sync once:

```ts
private addNewRow(constants: GameConstants): void {
    this.addRowAtTop(constants, [...this.config.colors])
    this.removeUnsupportedBubbles(constants)
    this.syncBubbleCount()

    if (this.checkGameOverCondition(constants)) {
        this.state.needsRedraw = true
    }
}
```

Task 6 replaces the row-generation palette with an active-color snapshot and adds queue reconciliation.

- [ ] **Step 8: Verify and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
```

Expected: PASS and typecheck exits 0.

```bash
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: drop unsupported bubble clusters"
```

---

### Task 6: Generate playable future colors and switch to successful-shot accuracy

**Files:**
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Interfaces:**
- Consumes: `successfulShots` and connectivity cleanup from Task 5.
- Produces: `getAvailableBubbleColors(): number[]`.
- Produces: `reconcileNextBubbleColor(): void`.
- Changes: opening/current/next generation samples active board colors after maintenance cleanup.
- Changes: accuracy = `successfulShots / shotsFired`.

- [ ] **Step 1: Add the floating-only opening-color regression**

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
    grid[2][5] = {
        color: 0x0000ff,
        x: bubbleX(5, 2),
        y: bubbleY(2),
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

    expect(stateOf(game).grid[2][5]).toBeNull()
    expect(stateOf(game).bubblesRemaining).toBe(1)
    expect(stateOf(game).currentBubble?.color).toBe(0xff0000)
    expect(stateOf(game).nextBubble?.color).toBe(0xff0000)
})
```

- [ ] **Step 2: Add active-color and accuracy regressions**

```ts
it('returns active colors and falls back to config on an empty board', () => {
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

it('reports accuracy from successful shots', () => {
    const game = makeGame()
    setState(game, {
        shotsFired: 10,
        successfulShots: 6,
        bubblesPopped: 18,
    })

    expect(game.getGameStats().accuracy).toBe(60)
})
```

- [ ] **Step 3: Add the post-row cleanup/reconcile ordering regression**

Create a deterministic interval-shot board where a color becomes unsupported after row mutation/cleanup. Assert after resolution:

```ts
expect(
    stateOf(game).grid.flat().some(
        bubble => bubble?.color === isolatedColor
    )
).toBe(false)
expect(stateOf(game).bubblesRemaining).toBe(
    countGrid(stateOf(game).grid)
)
expect(stateOf(game).nextBubble?.color).not.toBe(isolatedColor)
```

Use a concrete `const isolatedColor = 0x0000ff` in the committed test.

- [ ] **Step 4: Verify tests fail**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "opening queue|active colors|accuracy|reconcile"
```

Expected: FAIL because generation still uses the full configured palette and accuracy still uses popped bubbles.

- [ ] **Step 5: Implement active-board color selection**

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

private randomColor(colors: number[]): number {
    return colors[Math.floor(Math.random() * colors.length)]
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

`initializeGrid()` continues using `const generationColors = [...this.config.colors]` so partially generated cells do not feed back into initial generation.

- [ ] **Step 6: Snapshot active colors before added-row mutation**

Change `addNewRow()` to:

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

Do not reconcile queue state inside `addRowAtTop()` or `addNewRow()`.

At the end of `attachBubble`, after direct/drop resolution and any interval row insertion, call:

```ts
this.reconcileNextBubbleColor()
```

exactly once before final redraw/game-over completion. Never reroll `currentBubble`.

- [ ] **Step 7: Switch statistics to successful-shot accuracy**

In `getGameStats()`:

```ts
const accuracy =
    this.state.shotsFired > 0
        ? (this.state.successfulShots / this.state.shotsFired) * 100
        : 0
```

Return `successfulShots` and include it in `getGameData()`.

- [ ] **Step 8: Verify and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
```

Expected: PASS and typecheck exits 0.

```bash
git add src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: keep bubble shooter colors and stats playable"
```

---

### Task 7: Clear previews and align Bubble Shooter rules

**Files:**
- Modify: `src/lib/games/bubble-shooter/initFramework.ts`
- Modify: `src/lib/games/bubble-shooter/initFramework.test.ts`
- Modify: `src/pages/bubble-shooter/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Consumes: BaseGame restart behavior from Task 1; no Bubble Shooter start-handler reset workaround is added.
- Produces: null-aware preview drawing and `resetPreviewState()`.
- Changes: page rules use configured `rowAddInterval`.

- [ ] **Step 1: Extend initializer mock state**

Add:

```ts
rowPhase: 0,
successfulShots: 0,
```

Keep existing pointer/RAF mock behavior.

- [ ] **Step 2: Add a failing null-preview regression**

Capture `onStateChange`, invoke it once with colors and once with both colors null. Assert each preview canvas is cleared for both states while bubble drawing only occurs for the colored state.

A concrete assertion pattern:

```ts
callbacksArg.onStateChange({
    ...baseState,
    currentBubble: { x: 300, y: 700, color: 0xff0000 },
    nextBubble: { color: 0x00ff00 },
})
callbacksArg.onStateChange({
    ...baseState,
    currentBubble: null,
    nextBubble: null,
})

expect(currentContext.fillRect).toHaveBeenCalledTimes(2)
expect(nextContext.fillRect).toHaveBeenCalledTimes(2)
```

Use separate mocked contexts for current/next canvases so the assertions are not ambiguous.

- [ ] **Step 3: Verify preview test fails**

```bash
bun run test:run src/lib/games/bubble-shooter/initFramework.test.ts -t "preview"
```

Expected: FAIL because undefined colors currently return before clearing the canvas.

- [ ] **Step 4: Consolidate preview drawing**

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

Track cached colors as `number | undefined`. Add:

```ts
const resetPreviewState = (): void => {
    lastCurrentColor = undefined
    lastNextColor = undefined
    drawBubblePreview(currentBubbleCanvas, currentBubbleCtx, undefined)
    drawBubblePreview(nextBubbleCanvas, nextBubbleCtx, undefined)
}
```

Call it from explicit reset/restart handlers and the returned `restart()` function. Do not add reset logic to `startHandler`; Task 1 makes `BaseGame.start()` own ended-run reset.

- [ ] **Step 5: Update rules from the configured interval**

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

- [ ] **Step 6: Pin rule-source markup**

In `game-board-markup.test.ts`, load `src/pages/bubble-shooter/index.astro` and assert:

```ts
expect(bubbleShooterMarkup).toContain(
    'DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval'
)
expect(bubbleShooterMarkup).toContain(
    'Disconnected bubbles fall after a match'
)
expect(bubbleShooterMarkup).not.toContain(
    'New row appears after each shot'
)
```

- [ ] **Step 7: Verify and commit**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS and typecheck exits 0.

```bash
git add src/lib/games/bubble-shooter/initFramework.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "fix: align bubble shooter previews and rules"
```

---

### Task 8: Verify the complete single-PR implementation

**Files:**
- Review every file in the File Map.
- Modify only when a verification command exposes a concrete defect.

**Interfaces:**
- Verifies: `docs/superpowers/specs/2026-08-10-bubble-shooter-mechanics-correction-design.md`.
- Produces: no new feature scope.

- [ ] **Step 1: Run focused Bubble Shooter and core tests**

```bash
bun run test:run \
  src/lib/games/core/core.test.ts \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterRenderer.test.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
```

Expected: PASS.

- [ ] **Step 2: Search for stale state/signatures/fallbacks**

```bash
rg -n "rowOffset|isValidAttachPosition" src/lib/games/bubble-shooter
rg -n "getBubbleX|getBubbleY|getNeighbors" src/lib/games/bubble-shooter
```

Expected: no `rowOffset` or `isValidAttachPosition`; manually confirm every geometry call uses the phase-aware signatures.

- [ ] **Step 3: Verify the critical lifecycle and unit contracts**

```bash
rg -n "gameStarted && this.state.isGameOver|elapsed time in seconds" \
  src/lib/games/core/BaseGame.ts
rg -n "deltaTimeSeconds|/ 1_000" \
  src/lib/games/bubble-shooter/initFramework.ts
```

Expected: BaseGame contains the ended-run reset guard and seconds documentation; Bubble Shooter RAF converts milliseconds to seconds.

- [ ] **Step 4: Run full unit suite**

```bash
bun run test:run
```

Expected: PASS with zero failed tests.

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Run lint**

```bash
bun run lint
```

Expected: zero lint errors.

- [ ] **Step 7: Run format check**

```bash
bun run format:check
```

Expected: exit 0.

- [ ] **Step 8: Run production build**

```bash
bun run build
```

Expected: exit 0.

- [ ] **Step 9: Run existing Bubble Shooter happy-path E2E coverage**

```bash
bunx playwright test e2e/games/play-coverage.spec.ts --grep "bubble-shooter|Bubble Shooter"
```

If the shared play-coverage suite does not expose a title matching that grep, run the complete file instead:

```bash
bunx playwright test e2e/games/play-coverage.spec.ts
```

Expected: Bubble Shooter start → play → end/restart path passes.

- [ ] **Step 10: Review score-era impact without adding migration scope**

Confirm the PR description notes:

```text
Bubble Shooter now awards points for dropped unsupported bubbles and reports
successful-shot accuracy, so historical and new leaderboard rows may represent
different scoring/stat semantics. No score migration/versioning is included.
```

- [ ] **Step 11: Inspect final diff against scope**

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected production changes are limited to:

```text
src/lib/games/core/BaseGame.ts
src/lib/games/core/core.test.ts
src/lib/games/bubble-shooter/types.ts
src/lib/games/bubble-shooter/utils.ts
src/lib/games/bubble-shooter/utils.test.ts
src/lib/games/bubble-shooter/BubbleShooterGame.ts
src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
src/lib/games/bubble-shooter/initFramework.ts
src/lib/games/bubble-shooter/initFramework.test.ts
src/pages/bubble-shooter/index.astro
src/pages/game-board-markup.test.ts
```

plus the existing design/plan documents.

- [ ] **Step 12: Update the draft PR validation checklist**

Mark checks complete only from the fresh outputs above. Keep the PR draft until every required check passes.

---

## Plan Self-Review

- Every design requirement maps to a task: core restart/time units (Task 1), geometry/counts (Task 2), physics (Task 3), attachment (Task 4), connectivity/drops (Task 5), colors/accuracy (Task 6), previews/rules (Task 7), full verification (Task 8).
- Existing geometry tests are explicitly rewritten in Task 2; no obsolete helper signatures survive that commit.
- The phase-aware helper migration and all production callers are one atomic commit, so per-commit CI is compile-safe.
- `removeUnsupportedBubbles(constants): GridPosition[]` has one unambiguous contract and no count-sync side effect.
- Dense-array invariants use indexed checks rather than callbacks that skip holes.
- Opening queue generation occurs only after startup connectivity cleanup.
- Added-row queue reconciliation occurs only after row mutation, connectivity cleanup, and count sync.
- Blocked attachment consumes a shot but cannot trigger game over except through the existing danger-zone condition.
- The substep regression uses 4000px/s so it fails without substeps; it does not merely test the 50ms clamp.
- Bubble Shooter uses seconds, matching the shared `BaseGame.update` contract and Evader precedent.
- Connectivity/drop work is separate from active-color/accuracy work for cleaner review boundaries.
- Scoring-era comparability is documented as a risk; no migration scope is added.
- No `TBD`, `TODO`, compatibility shim, shared hex abstraction, or unrelated refactor is planned.