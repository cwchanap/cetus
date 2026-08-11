# HPA-121 Bubble Shooter Mechanics Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Bubble Shooter hex geometry, projectile simulation, legal attachment, cluster removal, queue/stat semantics, restart behavior, previews, and rules in one implementation PR.

**Architecture:** Keep hex geometry and game rules local to Bubble Shooter, reuse the existing shared `distance` helper, and leave the Pixi renderer coordinate-driven. Make only two narrow framework changes: `BaseGame.start()` resets a completed run before starting the next one, and `BaseGame.update(deltaTime)` explicitly uses elapsed seconds.

**Tech Stack:** Astro 5, TypeScript, PixiJS 8, Vitest/jsdom, Playwright, Bun 1.3.1.

## Global Constraints

- Use branch `agent/hpa-121-bubble-shooter-mechanics` and draft PR #57.
- Track under Linear `HPA-121`.
- Reuse `distance` from `src/lib/games/shared/geometry.ts`.
- Do not reuse rectangular `src/lib/games/shared/match3.ts`.
- Do not add a physics engine, shared hex/grid package, renderer refactor, new production module, asset, animation, sound, power-up, level, or difficulty feature.
- `BaseGame.update(deltaTime)` means elapsed **seconds**.
- Bubble Shooter `projectileSpeed` default becomes exactly `720` pixels/second.
- Clamp one Bubble Shooter physics update to exactly `0.05` seconds.
- Each collision substep travels at most `bubbleRadius / 2`.
- Keep `MATCH_THRESHOLD = 3`, `POINTS_PER_BUBBLE = 10`, `ALL_CLEAR_BONUS = 1000`.
- Check bubble collision before ceiling collision on every substep.
- A locally blocked impact consumes the shot but cannot end the run by itself; danger-zone detection remains the game-over authority.
- Score direct matches and ceiling-disconnected drops; one direct match increments `successfulShots` once.
- Preserve `currentBubble`; only reconcile future `nextBubble` after board mutation/cleanup.
- `removeUnsupportedBubbles(constants): GridPosition[]` removes cells and returns positions but never synchronizes `bubblesRemaining`.
- Every commit must typecheck; do not commit a helper-signature migration with broken callers.
- Use deterministic board state or stubbed `Math.random` in tests.
- Remove `rowOffset` without a compatibility shim.
- Leave existing 2048/Evader/Reflex/Sudoku initializer restart guards in place; they become redundant but harmless.

---

## File Map

**Shared framework**
- Modify `src/lib/games/core/BaseGame.ts`
- Modify `src/lib/games/core/core.test.ts`

**Bubble Shooter production**
- Modify `src/lib/games/bubble-shooter/types.ts`
- Modify `src/lib/games/bubble-shooter/utils.ts`
- Modify `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify `src/lib/games/bubble-shooter/initFramework.ts`
- Modify `src/pages/bubble-shooter/index.astro`

**Tests**
- Modify `src/lib/games/bubble-shooter/utils.test.ts`
- Modify `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`
- Modify `src/lib/games/bubble-shooter/initFramework.test.ts`
- Modify `src/pages/game-board-markup.test.ts`

`BubbleShooterRenderer.ts` remains unchanged.

---

### Task 1: Fix completed-run restart semantics and define `deltaTime`

**Files:**
- Modify: `src/lib/games/core/BaseGame.ts`
- Test: `src/lib/games/core/core.test.ts`

**Produces:**
- `start()` resets an ended run before new-run flags/hooks.
- `update(deltaTime)` is documented as elapsed seconds.

- [ ] **Step 1: Add the failing restart regression**

Inside the existing `BaseGame default hooks` suite:

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

- [ ] **Step 2: Pin the active-start guard**

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

- [ ] **Step 3: Verify red**

```bash
bun run test:run src/lib/games/core/core.test.ts -t "resets state and score|already active"
```

Expected: ended-run test fails because current `start()` preserves prior score/state.

- [ ] **Step 4: Implement the shared restart guard**

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

- [ ] **Step 5: Document the update unit**

```ts
/**
 * Advance game logic by elapsed time in seconds.
 */
abstract update(deltaTime: number): void
```

- [ ] **Step 6: Verify green and commit**

```bash
bun run test:run src/lib/games/core/core.test.ts
bun run typecheck
git add src/lib/games/core/BaseGame.ts src/lib/games/core/core.test.ts
git commit -m "fix: reset completed BaseGame runs on start"
```

Expected: test file passes and typecheck exits 0.

---

### Task 2: Make geometry and board state phase-aware atomically

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/utils.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Test: `src/lib/games/bubble-shooter/utils.test.ts`
- Test: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Produces:**
- `RowPhase = 0 | 1`
- `getRowParity(row, rowPhase)`
- `getRowColumnCount(row, rowPhase, constants)`
- `getBubbleX(col, row, rowPhase, constants)`
- `getBubbleY(row, constants)`
- `getNeighbors(row, col, rowPhase, constants)`
- dense rows, `rowPhase`, coordinate refresh, authoritative count sync.

- [ ] **Step 1: Rewrite the existing geometry suites**

Delete/rewrite the old 3-argument/`rowOffset` geometry tests; keep color/canvas tests.

```ts
describe('phase-aware hex geometry', () => {
    it('derives row parity and row width', () => {
        expect(getRowParity(0, 0)).toBe(0)
        expect(getRowParity(1, 0)).toBe(1)
        expect(getRowParity(0, 1)).toBe(1)
        expect(getRowColumnCount(0, 0, constants)).toBe(14)
        expect(getRowColumnCount(0, 1, constants)).toBe(13)
    })

    it('centers the full row exactly inside wall bounds', () => {
        expect(getBubbleX(0, 0, 0, constants)).toBe(40)
        expect(getBubbleX(13, 0, 0, constants)).toBe(560)
        expect(getBubbleX(0, 0, 0, constants) - 20).toBe(20)
        expect(getBubbleX(13, 0, 0, constants) + 20).toBe(580)
    })

    it('uses row-only vertical spacing', () => {
        expect(getBubbleY(0, constants)).toBe(20)
        expect(getBubbleY(1, constants)).toBeCloseTo(
            20 + 20 * Math.sqrt(3)
        )
    })

    it('keeps each interior neighbor one bubble diameter away', () => {
        const origin = { row: 5, col: 5 }
        const originX = getBubbleX(5, 5, 1, constants)
        const originY = getBubbleY(5, constants)

        for (const neighbor of getNeighbors(5, 5, 1, constants)) {
            const x = getBubbleX(
                neighbor.col,
                neighbor.row,
                1,
                constants
            )
            const y = getBubbleY(neighbor.row, constants)
            expect(Math.hypot(x - originX, y - originY)).toBeCloseTo(40)
        }
    })
})
```

- [ ] **Step 2: Add dense-grid test helpers**

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
            if (row[col]) count++
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
            if (!bubble) continue

            expect(bubble.x).toBe(
                getBubbleX(col, rowIndex, state.rowPhase, constants)
            )
            expect(bubble.y).toBeCloseTo(getBubbleY(rowIndex, constants))
        }
    }

    expect(state.bubblesRemaining).toBe(countGrid(state.grid))
}
```

- [ ] **Step 3: Add the two-row insertion regression**

```ts
it('preserves dense geometry through two inserted rows', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const game = makeGame({ newRowFillChance: 1 })
    game.start()

    const internal = game as unknown as {
        addRowAtTop: (constants: GameConstants, colors: number[]) => void
    }
    const constants = game.getConstantsView()

    expectGridInvariant(game)
    internal.addRowAtTop(constants, CONSTANTS.COLORS)
    expect(stateOf(game).rowPhase).toBe(1)
    expectGridInvariant(game)
    internal.addRowAtTop(constants, CONSTANTS.COLORS)
    expect(stateOf(game).rowPhase).toBe(0)
    expectGridInvariant(game)
})
```

- [ ] **Step 4: Verify red**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
```

Expected: helper signatures/state are missing and current insertion leaves stale x/parity.

- [ ] **Step 5: Implement phase-aware helpers**

```ts
export type RowPhase = 0 | 1

export function getRowParity(row: number, rowPhase: RowPhase): RowPhase {
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
    const boardLeft =
        (constants.GAME_WIDTH - constants.GRID_WIDTH * diameter) / 2
    return (
        boardLeft +
        constants.BUBBLE_RADIUS +
        getRowParity(row, rowPhase) * constants.BUBBLE_RADIUS +
        col * diameter
    )
}

export function getBubbleY(row: number, constants: GameConstants): number {
    return (
        constants.BUBBLE_RADIUS +
        row * constants.BUBBLE_RADIUS * Math.sqrt(3)
    )
}
```

Implement `getNeighbors` with the existing even/odd offset sets, but derive parity with `getRowParity()` and bounds with `getRowColumnCount()`.

- [ ] **Step 6: Replace `rowOffset` and make rows dense**

State:

```ts
rowPhase: RowPhase
```

Initial value:

```ts
rowPhase: 0,
```

Helpers:

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
        const width = getRowColumnCount(row, this.state.rowPhase, constants)
        const oldRow = this.state.grid[row] ?? []
        this.state.grid[row] = Array.from(
            { length: width },
            (_, col) => oldRow[col] ?? null
        )

        for (let col = 0; col < width; col++) {
            const bubble = this.state.grid[row][col]
            if (!bubble) continue
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
            if (row[col]) count++
        }
    }
    this.state.bubblesRemaining = count
    return count
}
```

- [ ] **Step 7: Migrate all callers in the same commit**

`initializeGrid()` uses dense rows and `const generationColors = [...this.config.colors]`, then calls `refreshBubbleCoordinates()` and `syncBubbleCount()`.

`addRowAtTop()` becomes:

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

For this commit only, `addNewRow()` passes `[...this.config.colors]`; Task 6 replaces it with active colors.

- [ ] **Step 8: Verify green and commit**

```bash
rg -n "rowOffset" src/lib/games/bubble-shooter
bun run test:run \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/utils.ts \
  src/lib/games/bubble-shooter/utils.test.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: make bubble shooter grid phase aware"
```

Expected: no `rowOffset`, focused tests pass, typecheck exits 0.

---

### Task 3: Use elapsed seconds and collision-safe projectile substeps

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Modify: `src/lib/games/bubble-shooter/initFramework.ts`
- Test: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`
- Test: `src/lib/games/bubble-shooter/initFramework.test.ts`

**Produces:**
- `updateProjectile(deltaTimeSeconds)`
- wall-position reflection
- `ProjectileImpact`
- RAF milliseconds → seconds conversion.

- [ ] **Step 1: Add refresh-rate regression**

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
                    { length: getRowColumnCount(row, 0, CONSTANTS) },
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
    const at30 = simulateProjectile(30)
    const at60 = simulateProjectile(60)
    const at120 = simulateProjectile(120)
    expect(at30).toBeCloseTo(4_280, 5)
    expect(at60).toBeCloseTo(at30, 5)
    expect(at120).toBeCloseTo(at30, 5)
})
```

- [ ] **Step 2: Add a substep-sensitive tunneling regression**

```ts
it('does not tunnel at 4000 pixels per second', () => {
    const game = makeGame({ projectileSpeed: 4_000 })
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array.from(
                { length: getRowColumnCount(row, 0, CONSTANTS) },
                () => null
            )
    )
    grid[8][6] = { color: 0x00ff00, x: 300, y: 300 }

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

A single unsplit 50ms step travels 200px and misses the bubble after crossing it; the substep loop must catch it.

- [ ] **Step 3: Add wall and RAF-unit regressions**

```ts
it('reflects back inside the right wall', () => {
    const game = makeGame({ projectileSpeed: 720 })
    setState(game, {
        projectile: {
            x: 578,
            y: 400,
            vx: 720,
            vy: 0,
            color: 0xff0000,
        },
        grid: [],
    })
    game.updateProjectile(0.016)
    expect(stateOf(game).projectile?.x).toBeLessThanOrEqual(580)
    expect(stateOf(game).projectile?.vx).toBeLessThan(0)
})
```

In `initFramework.test.ts`, stub two RAF timestamps 16ms apart and assert the second update receives:

```ts
expect(gameMock.update).toHaveBeenLastCalledWith(0.016)
```

- [ ] **Step 4: Verify red**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  -t "one second|4000|right wall|delta"
```

Expected: failures because delta is ignored/passed as milliseconds.

- [ ] **Step 5: Implement seconds, clamp, and substeps**

```ts
const MAX_PROJECTILE_FRAME_SECONDS = 0.05
const MAX_PROJECTILE_SUBSTEP_RATIO = 0.5

type ProjectileImpact =
    | { kind: 'ceiling' }
    | { kind: 'bubble'; anchor: GridPosition }
```

Set default `projectileSpeed: 720`.

Core loop:

```ts
updateProjectile(deltaTimeSeconds: number): boolean {
    const projectile = this.state.projectile
    if (!projectile) return false

    const constants = this.getConstantsView()
    const elapsed = Math.min(
        Math.max(deltaTimeSeconds, 0),
        MAX_PROJECTILE_FRAME_SECONDS
    )
    const speed = Math.hypot(projectile.vx, projectile.vy)
    const maxStepDistance = constants.BUBBLE_RADIUS / 2
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
        if (anchor) return this.attachBubble({ kind: 'bubble', anchor })
        if (projectile.y <= constants.BUBBLE_RADIUS) {
            return this.attachBubble({ kind: 'ceiling' })
        }
    }

    if (elapsed > 0) this.state.needsRedraw = true
    return false
}
```

Wall reflection mirrors overshoot back inside `[radius, gameWidth-radius]` and flips `vx` toward the board.

- [ ] **Step 6: Convert RAF delta to seconds**

```ts
const now = performance.now()
if (lastFrame === 0) lastFrame = now
const deltaTimeSeconds = (now - lastFrame) / 1_000
lastFrame = now
game.update(deltaTimeSeconds)
```

The game, not the initializer, owns the 0.05s clamp.

- [ ] **Step 7: Verify green and commit**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts \
  src/lib/games/bubble-shooter/initFramework.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts
git commit -m "fix: make bubble shooter physics time based"
```

---

### Task 4: Restrict attachment locally; blocked impact is not loss

**Files:**
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Test: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Produces:** impact-local candidate selection, no whole-board fallback, no occupied overwrite.

- [ ] **Step 1: Add blocked/local regressions**

```ts
it('consumes a locally blocked impact without ending the run', () => {
    const game = makeGame({ rowAddInterval: 99 })
    const anchor = { row: 2, col: 5 }
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array.from(
                { length: getRowColumnCount(row, 0, CONSTANTS) },
                () => null
            )
    )

    for (const position of [anchor, ...neighbors(2, 5)]) {
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
            x: bubbleX(5, 2),
            y: bubbleY(2) + 30,
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

Also retain/add the anchor-neighbor test asserting a normal bubble impact inserts only within `getNeighbors(anchor...)`.

- [ ] **Step 2: Pin bubble-before-ceiling priority with defined values**

```ts
it('prefers bubble collision when the projectile is also at the ceiling', () => {
    const game = makeGame()
    const targetCol = 6
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array.from(
                { length: getRowColumnCount(row, 0, CONSTANTS) },
                () => null
            )
    )
    grid[0][targetCol] = {
        color: 0x00ff00,
        x: bubbleX(targetCol, 0),
        y: bubbleY(0),
    }
    setState(game, {
        grid,
        rowPhase: 0,
        projectile: {
            x: bubbleX(targetCol, 0),
            y: CONSTANTS.BUBBLE_RADIUS,
            vx: 0,
            vy: -720,
            color: 0xff0000,
        },
    })
    const attachSpy = vi
        .spyOn(game, 'attachBubble')
        .mockReturnValue(false)

    game.updateProjectile(0)

    expect(attachSpy).toHaveBeenCalledWith({
        kind: 'bubble',
        anchor: { row: 0, col: targetCol },
    })
})
```

- [ ] **Step 3: Verify red**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "locally blocked|also at the ceiling"
```

- [ ] **Step 4: Implement candidate selection**

For bubble impact candidates use only `getNeighbors(anchor...)`; for ceiling use only row-zero cells. Filter occupied cells and choose the nearest center with shared `distance`. Delete global candidate search, `isValidAttachPosition`, and fixed fallback.

- [ ] **Step 5: Finalize every resolved projectile without forced loss**

After optional insertion/matching:

```ts
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

If `findAttachPosition()` returns null, skip grid write/match entirely and proceed through this same finalization. The shot is consumed, `successfulShots` does not change, and only danger-zone checking can end the run.

- [ ] **Step 6: Verify green and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: restrict bubble shooter attachment cells"
```

---

### Task 5: Add ceiling-connectivity drops

**Files:**
- Modify: `src/lib/games/bubble-shooter/types.ts`
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Test: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Produces:** `successfulShots`, `ShotResolution`, direct hex cluster traversal, ceiling connectivity, exact drop contract.

- [ ] **Step 1: Add direct-match/drop regression**

Use a dense grid with two top red bubbles, one blue supported only by the red cluster, and a red projectile attaching as the third red. Assert after attachment:

```ts
expect(countGrid(stateOf(game).grid)).toBe(0)
expect(stateOf(game).bubblesPopped).toBe(4)
expect(stateOf(game).largestCombo).toBe(4)
expect(stateOf(game).successfulShots).toBe(1)
expect(stateOf(game).score).toBe(1_040)
```

The committed test must build the exact positions with `bubbleX/bubbleY`, as in the current match tests.

- [ ] **Step 2: Add exact maintenance-drop contract regression**

```ts
it('returns dropped positions without score or count side effects', () => {
    const game = makeGame()
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array.from(
                { length: getRowColumnCount(row, 0, CONSTANTS) },
                () => null
            )
    )
    const isolated = { row: 3, col: 5 }
    grid[0][0] = {
        color: 0xff0000,
        x: bubbleX(0, 0),
        y: bubbleY(0),
    }
    grid[isolated.row][isolated.col] = {
        color: 0x0000ff,
        x: bubbleX(isolated.col, isolated.row),
        y: bubbleY(isolated.row),
    }
    setState(game, {
        grid,
        rowPhase: 0,
        bubblesRemaining: 2,
        score: 0,
        successfulShots: 0,
    })

    const internal = game as unknown as {
        removeUnsupportedBubbles: (
            constants: GameConstants
        ) => GridPosition[]
    }
    const dropped = internal.removeUnsupportedBubbles(
        game.getConstantsView()
    )

    expect(dropped).toEqual([isolated])
    expect(stateOf(game).grid[3][5]).toBeNull()
    expect(stateOf(game).bubblesRemaining).toBe(2)
    expect(stateOf(game).score).toBe(0)
    expect(stateOf(game).successfulShots).toBe(0)
})
```

`bubblesRemaining` intentionally remains 2 here, proving the helper does not sync counts.

- [ ] **Step 3: Verify red**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "disconnected|dropped positions"
```

- [ ] **Step 4: Add state and traversal contracts**

Add `successfulShots: number` to state/end stats/runtime stats; initialize to zero.

Implement iterative `collectColorCluster()` using phase-aware `getNeighbors()`.

Implement `collectCeilingConnected()` seeded by every occupied row-zero cell, ignoring color.

Implement exactly:

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

- [ ] **Step 5: Replace match bookkeeping with one resolution**

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

    return { directMatches, dropped, removedCount }
}
```

- [ ] **Step 6: Normalize maintenance boards before queue work**

Startup:

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

After row insertion, remove unsupported bubbles and call `syncBubbleCount()` once. Task 6 changes the row color snapshot and next-bubble reconciliation.

- [ ] **Step 7: Verify green and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/types.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: drop unsupported bubble clusters"
```

---

### Task 6: Use active colors and successful-shot accuracy

**Files:**
- Modify: `src/lib/games/bubble-shooter/BubbleShooterGame.ts`
- Test: `src/lib/games/bubble-shooter/BubbleShooterGame.test.ts`

**Produces:** playable opening/future colors, post-row ordering, true hit-rate accuracy.

- [ ] **Step 1: Add floating-only opening-color regression**

Use config colors red/blue. Stub `initializeGrid()` to produce a top-connected red bubble and isolated blue bubble, then call `onGameStart()` with `Math.random=0`. Assert cleanup removes blue before queue generation and both current/next are red.

Concrete final assertions:

```ts
expect(stateOf(game).grid[2][5]).toBeNull()
expect(stateOf(game).bubblesRemaining).toBe(1)
expect(stateOf(game).currentBubble?.color).toBe(0xff0000)
expect(stateOf(game).nextBubble?.color).toBe(0xff0000)
```

- [ ] **Step 2: Add exact post-row cleanup/reconcile regression**

```ts
it('drops an unsupported color before reconciling nextBubble', () => {
    const game = makeGame({
        colors: [0xff0000, 0x0000ff],
        rowAddInterval: 5,
        newRowFillChance: 0.5,
    })
    const grid = Array.from(
        { length: CONSTANTS.GRID_HEIGHT },
        (_, row) =>
            Array.from(
                { length: getRowColumnCount(row, 0, CONSTANTS) },
                () => null
            )
    )
    grid[0][0] = { color: 0xff0000, x: bubbleX(0, 0), y: bubbleY(0) }
    grid[0][12] = { color: 0x0000ff, x: bubbleX(12, 0), y: bubbleY(0) }

    setState(game, {
        grid,
        rowPhase: 0,
        bubblesRemaining: 2,
        shotCount: 4,
        projectile: {
            x: bubbleX(1, 0),
            y: bubbleY(0),
            vx: 0,
            vy: -720,
            color: 0xff0000,
        },
        nextBubble: { color: 0x0000ff },
    })

    let randomCall = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
        randomCall++
        if (randomCall === 1 || randomCall === 2 || randomCall === 15) {
            return 0
        }
        return 1
    })

    game.attachBubble({ kind: 'ceiling' })

    expect(
        stateOf(game).grid.flat().some(
            bubble => bubble?.color === 0x0000ff
        )
    ).toBe(false)
    expect(stateOf(game).bubblesRemaining).toBe(
        countGrid(stateOf(game).grid)
    )
    expect(stateOf(game).nextBubble?.color).toBe(0xff0000)
})
```

The random sequence fills only new top-row col 0 red, leaves all other new top cells empty, then selects red when nextBubble is rerolled.

- [ ] **Step 3: Add active-color and accuracy regressions**

```ts
it('reports successful-shot accuracy', () => {
    const game = makeGame()
    setState(game, {
        shotsFired: 10,
        successfulShots: 6,
        bubblesPopped: 18,
    })
    expect(game.getGameStats().accuracy).toBe(60)
})
```

Also assert `getAvailableBubbleColors()` returns unique board colors and falls back to `config.colors` on an empty grid.

- [ ] **Step 4: Verify red**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts -t "opening|reconciling|successful-shot"
```

- [ ] **Step 5: Implement active colors**

```ts
private getAvailableBubbleColors(): number[] {
    const colors = new Set<number>()
    for (const row of this.state.grid) {
        for (let col = 0; col < row.length; col++) {
            const bubble = row[col]
            if (bubble) colors.add(bubble.color)
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
        this.state.nextBubble = { color: this.randomColor(colors) }
    }
}
```

`generateBubble()`/`generateNextBubble()` use active colors. `initializeGrid()` still uses one fixed `config.colors` snapshot.

`addNewRow()` snapshots `getAvailableBubbleColors()` before calling `addRowAtTop()`, then performs connectivity cleanup/count sync. `attachBubble()` calls `reconcileNextBubbleColor()` exactly once after match resolution and any row insertion.

- [ ] **Step 6: Switch accuracy and game data**

```ts
const accuracy =
    this.state.shotsFired > 0
        ? (this.state.successfulShots / this.state.shotsFired) * 100
        : 0
```

Include `successfulShots` in returned stats and `getGameData()`.

- [ ] **Step 7: Verify green and commit**

```bash
bun run test:run src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/BubbleShooterGame.ts \
  src/lib/games/bubble-shooter/BubbleShooterGame.test.ts
git commit -m "fix: keep bubble shooter colors and stats playable"
```

---

### Task 7: Clear previews and align rules

**Files:**
- Modify: `src/lib/games/bubble-shooter/initFramework.ts`
- Modify: `src/pages/bubble-shooter/index.astro`
- Test: `src/lib/games/bubble-shooter/initFramework.test.ts`
- Test: `src/pages/game-board-markup.test.ts`

**Produces:** null-safe preview canvases and accurate rules copy. No Bubble Shooter-local ended-run start workaround.

- [ ] **Step 1: Give preview canvases separate test contexts**

In `initFramework.test.ts`, replace the shared context with:

```ts
const currentBubbleCtx = {
    fillRect: vi.fn(),
    fillStyle: '',
}
const nextBubbleCtx = {
    fillRect: vi.fn(),
    fillStyle: '',
}

Object.defineProperty(currentBubble, 'getContext', {
    value: vi.fn(() => currentBubbleCtx),
    writable: true,
})
Object.defineProperty(nextBubble, 'getContext', {
    value: vi.fn(() => nextBubbleCtx),
    writable: true,
})
```

Expose/store those two objects in the test setup scope so assertions can reference them directly.

- [ ] **Step 2: Add null-preview regression**

After initialization, capture the constructor callbacks and call:

```ts
const baseState = gameMock.getState()
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

expect(currentBubbleCtx.fillRect).toHaveBeenCalledTimes(2)
expect(nextBubbleCtx.fillRect).toHaveBeenCalledTimes(2)
```

- [ ] **Step 3: Verify red**

```bash
bun run test:run src/lib/games/bubble-shooter/initFramework.test.ts -t "preview"
```

- [ ] **Step 4: Consolidate null-aware preview drawing**

```ts
const drawBubblePreview = (
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D | null,
    color: number | undefined
): void => {
    if (!context) return

    context.fillStyle = 'rgba(0, 0, 0, 0.1)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    if (color === undefined) return

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

Cache colors as `number | undefined`; clear/redraw when defined or undefined changes. Explicit reset/restart handlers clear both preview caches/canvases. Do not alter `startHandler` for ended runs; Task 1 owns that behavior.

- [ ] **Step 5: Render rules from configuration**

Astro frontmatter:

```astro
import { DEFAULT_BUBBLE_SHOOTER_CONFIG } from '@/lib/games/bubble-shooter/BubbleShooterGame'
const rowAddInterval = DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval
```

Rules:

```astro
<p>• Match 3+ bubbles of the same color</p>
<p>• Disconnected bubbles fall after a match</p>
<p>• New row appears every {rowAddInterval} shots</p>
<p>• Game ends when bubbles reach the danger zone</p>
<p>• Accuracy counts shots that clear bubbles</p>
```

- [ ] **Step 6: Pin rule source**

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

- [ ] **Step 7: Verify green and commit**

```bash
bun run test:run \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
git add src/lib/games/bubble-shooter/initFramework.ts \
  src/lib/games/bubble-shooter/initFramework.test.ts \
  src/pages/bubble-shooter/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "fix: align bubble shooter previews and rules"
```

---

### Task 8: Verify the complete PR

**Files:** Review every file in the File Map; change only concrete defects found by verification.

- [ ] **Step 1: Focused tests**

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

- [ ] **Step 2: Stale-contract search**

```bash
rg -n "rowOffset|isValidAttachPosition" src/lib/games/bubble-shooter
rg -n "getBubbleX|getBubbleY|getNeighbors" src/lib/games/bubble-shooter
```

Expected: first command returns no matches; every helper call uses the new signatures.

- [ ] **Step 3: Framework/unit contract search**

```bash
rg -n "gameStarted && this.state.isGameOver|elapsed time in seconds" \
  src/lib/games/core/BaseGame.ts
rg -n "deltaTimeSeconds|/ 1_000" \
  src/lib/games/bubble-shooter/initFramework.ts
```

Expected: restart guard + seconds documentation exist; Bubble Shooter RAF converts milliseconds to seconds.

- [ ] **Step 4: Full unit suite**

```bash
bun run test:run
```

Expected: zero failed tests.

- [ ] **Step 5: Static validation**

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all commands exit 0; lint has zero errors.

- [ ] **Step 6: Existing game E2E coverage**

```bash
bunx playwright test e2e/games/play-coverage.spec.ts
```

Expected: shared game happy-path suite passes, including Bubble Shooter.

- [ ] **Step 7: Confirm score-era disclosure in PR body**

Add/retain this note:

```text
Bubble Shooter now awards points for dropped unsupported bubbles and reports
successful-shot accuracy, so historical and new leaderboard rows may represent
different scoring/stat semantics. No score migration/versioning is included.
```

- [ ] **Step 8: Final scope diff**

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected production/test files are exactly the File Map plus the existing design/plan documents. `BubbleShooterRenderer.ts` should not appear.

- [ ] **Step 9: Update draft PR validation**

Mark checklist items complete only from the fresh command outputs above. Keep the PR draft until all required checks pass.

---

## Plan Self-Review

- F1: restart behavior is owned by `BaseGame.start()`; no fifth Bubble Shooter initializer workaround.
- F2: blocked impact consumes the projectile and interval shot but only danger-zone detection can end the run.
- F3: tunneling test uses 4000px/s × 0.05s = 200px, so it fails without substeps.
- F4: shared `deltaTime` unit is seconds; Bubble Shooter converts RAF milliseconds to seconds and clamps inside game logic.
- Existing geometry suites are rewritten in the same atomic commit as helper/caller migration.
- Dense rows are checked by index, so sparse holes cannot silently pass.
- `removeUnsupportedBubbles()` has one exact return contract and no count-sync side effect.
- Startup cleanup precedes active-color opening queue generation.
- Added-row cleanup/count sync precedes next-bubble reconciliation.
- Connectivity/drops are a separate commit from colors/accuracy.
- Board centering is explicitly tested against projectile wall bounds.
- Score-era comparability is disclosed without adding migration scope.
- No `TBD`, `TODO`, undefined symbolic test variables, compatibility shim, shared hex abstraction, or unrelated refactor remains in the plan.