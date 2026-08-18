# Ice Slide Cracked Ice and Stateful Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authored `F` / fragile ice whose exited cells collapse into runtime hazards, while keeping runtime/Undo/reset state on the existing grid and extending the production solver so collapsed-board history participates in BFS identity.

**Architecture:** Extend the existing closed cell/glyph contract and implement fragile behavior exactly once in `physics.slide()`. `IceSlideState.grid` remains the live board; HPA-491's full-grid Undo snapshot and `loadLevel()` reconstruction stay unchanged. The solver continues to call shared `slide()` on cloned grids, but enumerates authored fragile positions and adds a BigInt collapsed mask derived from each post-slide grid to the visited key. Renderer support lands fully with the cell contract so every commit is type-checkable. No shipped/generated content emits `F` in this task.

**Tech Stack:** TypeScript, Vitest, PixiJS 8.10, Astro, Bun, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-17-ice-slide-cracked-ice-design.md`

## Global Constraints

- Keep production changes limited to `types.ts`, `physics.ts`, `renderer.ts`, and `solver.ts` unless a test exposes a real missing generic seam.
- Keep `SlideOutcome` unchanged. Dynamic state is read from the mutated cloned grid, not a second transition-delta channel.
- Keep `IceSlideState.grid` as the only live dynamic-board authority.
- Do not extend `IceSlideUndoSnapshot`; its existing full-grid clone is sufficient.
- Keep hazard, Reset, and Undo out of solver transitions; solver truncation stays fail-closed.
- Keep `bigint` for the collapsed mask. Do not add `MAX_FRAGILE_BITS` or copy the crystal mask's 30-bit representation limit.
- Keep `ICE_SLIDE_RULESET_VERSION = 1`, `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`, `ICE_SLIDE_DAILY_GENERATOR_VERSION = 1`, and `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`.
- Do not change Campaign rows, Daily pools, Expedition templates/fallbacks, generator RNG labels/goldens, scoring, objective semantics, route choices, or persistence.
- Keep the Expedition template `baseRows` alphabet gate at `#`, `.`, `S`; keep generator placement at `G` / `O` / `H` / `C` onto `.`; keep `no_falls` eligibility keyed to authored `H`.
- Do not add a Playwright fixture API, query parameter, debug mode, or `IceSlideHandle.start(run)` overload.
- Keep `e2e/games/play-coverage.spec.ts` unchanged; it is the existing browser regression gate.
- Do not add a second renderer pass. Final fragile/collapsed geometry lands in Task 1.

---

## Task 1: Add the fragile contract, leave-collapse physics, and final renderer

**Files:**

- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/physics.ts`
- Modify: `src/lib/games/ice-slide/physics.test.ts`
- Modify: `src/lib/games/ice-slide/renderer.ts`
- Modify: `src/lib/games/ice-slide/renderer.test.ts`

**Interfaces:**

- Produces: `CellType` includes `'fragile' | 'collapsed'`.
- Produces: `GLYPH_TO_CELL.F === 'fragile'`; `collapsed` remains glyph-less.
- Preserves: `SlideOutcome` shape.
- Preserves: `isBlocking()` remains `undefined | wall | rock`; `fragile` is traversable and `collapsed` is handled as an entered hazard.
- Produces: compile-time-exhaustive final Pixi rendering for both new runtime cells.

- [ ] **Step 1: Add parser and stepwise fragile physics tests before implementation.**

In `physics.test.ts`, add parser coverage:

```ts
it('parses the fragile glyph', () => {
    const grid = parseGrid({
        id: 'fragile-parse',
        rows: ['#####', '#SFG#', '#####'],
    })
    expect(grid[1][2]).toBe('fragile')
})
```

Add the load-bearing stop-then-leave sequence:

```ts
it('keeps fragile intact while occupied and collapses it on a valid leave', () => {
    const grid = parseGrid({
        id: 'fragile-stop-leave',
        rows: ['#####', '#S.F#', '#...#', '#####'],
    })
    const start = findStart(grid)
    grid[start.row][start.col] = 'ice'

    const enter = slide(grid, start, DIRECTION_DELTA.E)
    expect(enter).toMatchObject({
        kind: 'moved',
        end: { row: 1, col: 3 },
    })
    expect(grid[1][3]).toBe('fragile')

    const leave = slide(grid, { row: 1, col: 3 }, DIRECTION_DELTA.S)
    expect(leave).toMatchObject({
        kind: 'moved',
        end: { row: 2, col: 3 },
    })
    expect(grid[1][3]).toBe('collapsed')
})
```

Add pass-through, blocked/no-op, and collapsed re-entry coverage:

```ts
it('collapses fragile tiles traversed in the middle of a slide', () => {
    const grid = parseGrid({
        id: 'fragile-pass-through',
        rows: ['######', '#S.F.#', '######'],
    })
    const start = findStart(grid)
    grid[start.row][start.col] = 'ice'

    expect(slide(grid, start, DIRECTION_DELTA.E)).toMatchObject({
        kind: 'moved',
        end: { row: 1, col: 4 },
    })
    expect(grid[1][3]).toBe('collapsed')
})

it('does not collapse fragile on a blocked noop', () => {
    const grid = parseGrid({
        id: 'fragile-noop',
        rows: ['#####', '#..F#', '#...#', '#####'],
    })

    expect(
        slide(grid, { row: 1, col: 3 }, DIRECTION_DELTA.E)
    ).toMatchObject({ kind: 'noop' })
    expect(grid[1][3]).toBe('fragile')
})

it('treats an already collapsed tile as a hazard on entry', () => {
    const grid = parseGrid({
        id: 'collapsed-entry',
        rows: ['#####', '#..F#', '#...#', '#####'],
    })

    expect(
        slide(grid, { row: 1, col: 3 }, DIRECTION_DELTA.S)
    ).toMatchObject({ kind: 'moved' })
    expect(grid[1][3]).toBe('collapsed')
    expect(
        slide(grid, { row: 2, col: 3 }, DIRECTION_DELTA.N)
    ).toMatchObject({ kind: 'hazard' })
})
```

Keep the existing crystal-then-snow test unchanged; it already freezes the snow/crystal ordering that fragile must not disturb.

- [ ] **Step 2: Add renderer tests for the final treatments before implementation.**

Extend the all-cell renderer fixture from 8 to 10 columns and include both new types:

```ts
const rs = await setupPixiJS(container, 2, 10, 48)
const grid: CellType[][] = [
    [
        'wall',
        'ice',
        'goal',
        'rock',
        'hazard',
        'crystal',
        'snow',
        'fragile',
        'collapsed',
        'start',
    ],
    ['wall', 'ice', 'ice', 'ice', 'ice', 'ice', 'ice', 'ice', 'ice', 'wall'],
]
```

Add focused primitive tests at the shipped 48px cell size. Keep the player on a different cell so player circles do not obscure collapsed-shape assertions:

```ts
it('renders fragile with a visible segmented crack', async () => {
    const rs = await setupPixiJS(container, 1, 2, 48)
    renderGrid(
        rs,
        makeState([['fragile', 'ice']], { player: { row: 0, col: 1 } })
    )

    const calls = vi.mocked(rs.gridGraphic.roundRect).mock.calls
    expect(calls).toContainEqual([13, 9, 3, 14, 1])
    expect(calls).toContainEqual([15, 20, 13, 3, 1])
    expect(calls).toContainEqual([25, 20, 3, 15, 1])
})

it('renders collapsed as a hollow broken surface', async () => {
    const rs = await setupPixiJS(container, 1, 2, 48)
    renderGrid(
        rs,
        makeState([['collapsed', 'ice']], { player: { row: 0, col: 1 } })
    )

    const calls = vi.mocked(rs.gridGraphic.roundRect).mock.calls
    expect(calls).toContainEqual([7, 7, 34, 34, 5])
    expect(calls).toContainEqual([14, 14, 20, 20, 4])
})
```

These exact primitive coordinates make shape treatment intentional without snapshotting Pixi internals.

- [ ] **Step 3: Run the focused tests and confirm the pre-implementation failure.**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/physics.test.ts \
  src/lib/games/ice-slide/renderer.test.ts
```

Expected before implementation: `F` is unknown and the renderer has no `fragile` / `collapsed` branches.

- [ ] **Step 4: Extend the cell/glyph contract and authoring comment.**

In `types.ts`:

```ts
export type CellType =
    | 'wall'
    | 'ice'
    | 'start'
    | 'goal'
    | 'rock'
    | 'hazard'
    | 'crystal'
    | 'snow'
    | 'fragile'
    | 'collapsed'
```

Update the level contract comment to:

```ts
/** Row-major string rows using # . S G O H C N F glyphs */
```

Add only the authored glyph mapping:

```ts
export const GLYPH_TO_CELL: Record<string, CellType> = {
    '#': 'wall',
    '.': 'ice',
    S: 'start',
    G: 'goal',
    O: 'rock',
    H: 'hazard',
    C: 'crystal',
    N: 'snow',
    F: 'fragile',
}
```

Do not add an authored representation for `collapsed`.

- [ ] **Step 5: Implement leave-then-enter once in `slide()`.**

Preserve the initial adjacent-cell noop guard. Inside the loop, keep the out-of-bounds/blocking return before mutation, then collapse the current cell immediately before entering a valid next cell:

```ts
const next = grid[nr][nc]
if (isBlocking(next)) {
    return {
        kind: 'moved',
        path,
        end: { row, col },
        crystals,
        reachedGoal: grid[row][col] === 'goal',
    }
}

if (grid[row][col] === 'fragile') {
    grid[row][col] = 'collapsed'
}

row = nr
col = nc
path.push({ row, col })

if (next === 'snow') {
    // existing moved-on-snow return
}

if (next === 'hazard' || next === 'collapsed') {
    return { kind: 'hazard', path }
}
```

Keep crystal consumption and goal handling after that branch exactly where they are today. Do not modify `SlideOutcome`.

Update the `slide()` doc comment so it no longer claims crystals are the only grid mutation:

```ts
/**
 * Simulate a slide from `from` in `direction` on `grid`.
 * Mutates the supplied grid for in-slide state transitions such as crystal
 * consumption and fragile-to-collapsed exits.
 */
```

- [ ] **Step 6: Add final renderer cases in the same commit.**

Add color-map keys so `Record<CellType, number>` remains complete:

```ts
fragile: 0x67e8f9,
collapsed: 0x94a3b8,
```

Add the final non-color-only branches directly; do not add temporary placeholders:

```ts
case 'fragile':
    g.rect(x + 6, y + 6, cellSize - 12, cellSize - 12).fill({
        color: COLORS.ice,
        alpha: 0.18,
    })
    g.roundRect(x + 13, y + 9, 3, 14, 1).fill(COLORS.fragile)
    g.roundRect(x + 15, y + 20, 13, 3, 1).fill(COLORS.fragile)
    g.roundRect(x + 25, y + 20, 3, 15, 1).fill(COLORS.fragile)
    return

case 'collapsed':
    g.roundRect(x + 7, y + 7, cellSize - 14, cellSize - 14, 5).stroke({
        color: COLORS.collapsed,
        width: 3,
        alpha: 0.9,
    })
    g.roundRect(x + 14, y + 14, cellSize - 28, cellSize - 28, 4).stroke({
        color: COLORS.collapsed,
        width: 2,
        alpha: 0.7,
    })
    return
```

Keep the existing `_exhaustive: never` tail. No animation, texture, sprite, filter, or reduced-motion branch.

- [ ] **Step 7: Verify Task 1 automatically.**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/physics.test.ts \
  src/lib/games/ice-slide/renderer.test.ts
bun run typecheck
```

Expected: PASS and zero type errors.

- [ ] **Step 8: Do the single 48px visual check without adding a fixture API.**

Start the Astro dev server:

```bash
bun run web:dev
```

Open `/ice-slide`, start any run so `window.iceSlideGame.getGame()` exists, then use the browser console to render one temporary four-cell strip through the real renderer:

```js
const { setupPixiJS, renderGrid } = await import(
    '/src/lib/games/ice-slide/renderer.ts'
)
const host = document.createElement('div')
document.body.append(host)
const base = window.iceSlideGame.getGame().getState()
const rs = await setupPixiJS(host, 1, 4, 48)
renderGrid(rs, {
    ...base,
    rows: 1,
    cols: 4,
    grid: [['ice', 'fragile', 'collapsed', 'hazard']],
    player: { row: 0, col: 0 },
    start: { row: 0, col: 0 },
    lastSlidePath: [],
})
```

Confirm at 48px that intact ice, cracked fragile ice, hollow collapsed ice, the circular hazard, and the player are distinguishable by shape/pattern rather than color alone. Remove the temporary host and stop the dev server after the check. Do not commit a debug route or fixture surface.

- [ ] **Step 9: Commit Task 1.**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/physics.ts \
  src/lib/games/ice-slide/physics.test.ts \
  src/lib/games/ice-slide/renderer.ts \
  src/lib/games/ice-slide/renderer.test.ts
git commit -m "feat(ice-slide): add cracked ice physics"
```

---

## Task 2: Make solver identity stateful and lock quality/run parity

**Files:**

- Modify: `src/lib/games/ice-slide/solver.ts`
- Modify: `src/lib/games/ice-slide/solver.test.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/quality.ts`
- Verify unchanged: `src/lib/games/ice-slide/run.ts`
- Verify unchanged: `src/lib/games/ice-slide/objectives.ts`
- Verify unchanged: `src/lib/games/ice-slide/templates.ts`
- Verify unchanged: `src/lib/games/ice-slide/generator.ts`
- Verify unchanged: `src/lib/games/ice-slide/daily.ts`
- Verify unchanged: `src/lib/games/ice-slide/expedition.ts`

**Interfaces:**

- Produces: solver visited identity `(position, crystalMask, collapsedMask)`.
- Produces: deterministic row-major fragile indexing and `bigint` collapsed mask derived from post-`slide()` grids.
- Preserves: existing `IceSlideSolveResult` shape.
- Preserves: quality/run/objective APIs and deterministic version constants.

- [ ] **Step 1: Add the load-bearing same-position/different-collapse solver regression.**

In `solver.test.ts`, add this four-fragile fixture:

```ts
const FRAGILE_MASK_BOARD = [
    '#######',
    '#F....#',
    '#.F.G.#',
    '##..F.#',
    '#.....#',
    '#S.##F#',
    '#######',
]
```

Then add:

```ts
it('distinguishes the same stop under different collapsed-fragile histories', () => {
    const result = solveIceSlideBoard(
        { id: 'fragile-mask-state', rows: FRAGILE_MASK_BOARD },
        { maxStates: 10_000 }
    )

    expect(result.solvable).toBe(true)
    expect(result.truncated).toBe(false)
    expect(result.minMoves).toBe(6)
    expect(result.exploredStates).toBeGreaterThan(result.reachableStopCount)
})
```

This fixture is deliberately load-bearing: a visited key containing only position/crystal state merges a necessary alternate collapse history and reports the board unsolvable.

- [ ] **Step 2: Add the eight-fragile budget characterization and no-30-bit-cap regression.**

Add:

```ts
const EIGHT_FRAGILE_BOARD = [
    '#########',
    '#F...#.##',
    '#..F....#',
    '#...S...#',
    '#..FF..F#',
    '#.G##..##',
    '#F....F.#',
    '##.F....#',
    '#########',
]
```

Test both representative densities against the existing 10,000-state cap without freezing exact state counts:

```ts
it.each([
    ['four fragile', FRAGILE_MASK_BOARD, 6],
    ['eight fragile', EIGHT_FRAGILE_BOARD, 6],
])('keeps %s within the existing solver budget', (_name, rows, minMoves) => {
    const result = solveIceSlideBoard(
        { id: `budget:${_name}`, rows },
        { maxStates: 10_000 }
    )

    expect(result.solvable).toBe(true)
    expect(result.truncated).toBe(false)
    expect(result.minMoves).toBe(minMoves)
    expect(result.exploredStates).toBeLessThan(10_000)
})
```

Also prove the solver does not acquire a copied crystal-mask ceiling:

```ts
it('does not impose a 30-fragile representation limit', () => {
    const rows = [
        '#########',
        '#S.....G#',
        '#########',
        '#FFFFFFF#',
        '#FFFFFFF#',
        '#FFFFFFF#',
        '#FFFFFFF#',
        '#FFF....#',
        '#########',
    ]

    const result = solveIceSlideBoard(
        { id: 'many-fragile', rows },
        { maxStates: 32 }
    )
    expect(result.solvable).toBe(true)
    expect(result.minMoves).toBe(1)
    expect(result.truncated).toBe(false)
})
```

The lower fragile region is unreachable by design; this test isolates representation capacity from reachable-state budget.

- [ ] **Step 3: Add quality/run tests that should consume the same new contract without production changes.**

In `quality.test.ts`, use the four-fragile fixture and assert the quality gate consumes the stateful solver result and fails closed with a small cap:

```ts
it('accepts a fragile board using the stateful solver result', () => {
    const result = validateIceSlideStageQuality(
        {
            id: 'fragile-quality',
            rows: FRAGILE_MASK_BOARD,
            objectiveIds: [],
        },
        {
            parBand: { minMoves: 6, maxMoves: 6 },
            maxStates: 10_000,
        }
    )

    expect(result.accepted).toBe(true)
    if (result.accepted) {
        expect(result.parMoves).toBe(6)
        expect(result.solveResult.truncated).toBe(false)
    }
})

it('fails closed when fragile state exhausts the solver cap', () => {
    const result = validateIceSlideStageQuality(
        {
            id: 'fragile-truncated',
            rows: FRAGILE_MASK_BOARD,
            objectiveIds: [],
        },
        {
            parBand: { minMoves: 1, maxMoves: 20 },
            maxStates: 10,
        }
    )

    expect(result).toMatchObject({
        accepted: false,
        reason: 'solver_truncated',
    })
})
```

In `run.test.ts`, mirror the existing snow-bearing run acceptance:

```ts
it('accepts a Campaign run with a fragile-bearing stage', () => {
    const run = cloneRun()
    run.stages[0].rows = ['######', '#S.FG#', '######']
    run.stages[0].parMoves = 1
    run.stages[0].signature = createIceSlideStageSignature(run.stages[0])

    expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
})
```

And pin authored-state signature semantics:

```ts
it('includes authored fragile rows in stage signatures', () => {
    const run = cloneRun()
    const stage = run.stages[0]
    const ice = createIceSlideStageSignature({
        ...stage,
        rows: ['######', '#S..G#', '######'],
    })
    const fragile = createIceSlideStageSignature({
        ...stage,
        rows: ['######', '#S.FG#', '######'],
    })

    expect(fragile).not.toBe(ice)
})
```

Do not modify `run.ts`; its existing `GLYPH_TO_CELL` validation consumes `F` after Task 1.

- [ ] **Step 4: Run the focused tests and confirm the state-key failure before editing `solver.ts`.**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/run.test.ts
```

Expected before the state-key implementation: the four-fragile solver/quality fixture is not accepted correctly because position/crystal-only identity merges distinct collapsed histories.

- [ ] **Step 5: Extend the solver scan and queued state.**

In `solver.ts`, add a row-major fragile-position collection next to crystals:

```ts
const crystalPositions: GridPosition[] = []
const fragilePositions: GridPosition[] = []
```

Inside the existing row-major scan:

```ts
} else if (cell === 'crystal') {
    crystalPositions.push({ row, col })
} else if (cell === 'fragile') {
    fragilePositions.push({ row, col })
}
```

Extend `SolverState`:

```ts
interface SolverState {
    position: GridPosition
    moves: number
    crystalMask: number
    collapsedMask: bigint
    grid: CellType[][]
}
```

Do not add a fragile-count guard.

- [ ] **Step 6: Extend visited identity and rebuild collapsed state from the cloned grid.**

Replace the key helper with:

```ts
const stateKey = (
    position: GridPosition,
    crystalMask: number,
    collapsedMask: bigint
) =>
    `${position.row},${position.col},${crystalMask},${collapsedMask.toString(16)}`
```

Seed the queue/seen set with `0n`:

```ts
const queue: SolverState[] = [
    {
        position: start,
        moves: 0,
        crystalMask: 0,
        collapsedMask: 0n,
        grid: startGrid,
    },
]
const seen = new Set<string>([stateKey(start, 0, 0n)])
```

After each successful `slide()` and the current crystal-mask rebuild, derive collapsed identity from the same post-slide grid:

```ts
let collapsedMask = 0n
for (let i = 0; i < fragilePositions.length; i++) {
    const fragile = fragilePositions[i]
    if (grid[fragile.row][fragile.col] === 'collapsed') {
        collapsedMask |= 1n << BigInt(i)
    }
}
```

Use that mask in both key creation and the queued state:

```ts
const key = stateKey(outcome.end, crystalMask, collapsedMask)
```

```ts
queue.push({
    position: outcome.end,
    moves,
    crystalMask,
    collapsedMask,
    grid,
})
```

The stored mask is identity metadata; transition behavior continues to come from the cloned grid and shared `slide()`.

Update the solver doc comment to describe `(position, crystal mask, collapsed mask)` state.

- [ ] **Step 7: Verify solver/quality/run parity.**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/run.test.ts
bun run typecheck
```

Expected: PASS. `quality.ts`, `run.ts`, objectives, templates, Daily/Expedition generation, and version constants remain production-unchanged.

- [ ] **Step 8: Record state-budget evidence without freezing it in tests.**

Run a one-off diagnostic against the implemented solver:

```bash
bun -e "
import { solveIceSlideBoard as solve } from './src/lib/games/ice-slide/solver.ts';
const fixtures = {
  four: ['#######','#F....#','#.F.G.#','##..F.#','#.....#','#S.##F#','#######'],
  eight: ['#########','#F...#.##','#..F....#','#...S...#','#..FF..F#','#.G##..##','#F....F.#','##.F....#','#########'],
};
for (const [id, rows] of Object.entries(fixtures)) {
  const result = solve({ id, rows }, { maxStates: 10_000 });
  console.log(id, { exploredStates: result.exploredStates, minMoves: result.minMoves, truncated: result.truncated });
}
"
```

Record the observed values in the PR description under a short “solver budget characterization” note. Do not add `console.log` to production/tests and do not assert exact `exploredStates` counts.

- [ ] **Step 9: Commit Task 2.**

```bash
git add \
  src/lib/games/ice-slide/solver.ts \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/run.test.ts
git commit -m "feat(ice-slide): make cracked ice solver-stateful"
```

---

## Task 3: Prove runtime restoration and keyboard wiring, then run full gates

**Files:**

- Modify: `src/lib/games/ice-slide/game.test.ts`
- Modify: `src/lib/games/ice-slide/init.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/game.ts`
- Verify unchanged: `src/lib/games/ice-slide/init.ts`
- Verify unchanged: `src/lib/games/ice-slide/test-fixtures.ts`
- Verify unchanged: `e2e/games/play-coverage.spec.ts`

**Interfaces:**

- Consumes: Task 1 grid mutation through existing `IceSlideGame.move()`.
- Preserves: `IceSlideUndoSnapshot` remains `{ grid, player, crystalsCollected, levelCrystalsCollected }`.
- Preserves: `IceSlideHandle.start(mode?)` and existing input wiring.

- [ ] **Step 1: Add a reusable fragile runtime fixture.**

Near the existing snow helpers in `game.test.ts`, add:

```ts
const FRAGILE_STAGE = createTestStage({
    id: 'test:fragile',
    rows: ['#####', '#S.F#', '#...#', '#G..#', '#####'],
    parMoves: 1,
})

function createFragileRun(): IceSlideRunDefinition {
    return createTestRun([FRAGILE_STAGE])
}
```

For this fixture:

- `E` stops on intact `F` at `(1, 3)`;
- `S` leaves it, producing `collapsed` at `(1, 3)` and stopping at `(3, 3)`;
- `N` re-enters the collapsed cell and takes the normal hazard/reload path.

- [ ] **Step 2: Prove manual Reset and `getState()` isolation on collapsed state.**

Add:

```ts
it('restores fragile state after manual reset', () => {
    const game = new IceSlideGame()
    game.start(createFragileRun())
    game.move('E')
    game.move('S')

    expect(game.getState().grid[1][3]).toBe('collapsed')

    const snapshot = game.getState()
    snapshot.grid[1][3] = 'ice'
    expect(game.getState().grid[1][3]).toBe('collapsed')

    game.resetLevel()
    const state = game.getState()
    expect(state.player).toEqual(state.start)
    expect(state.grid[1][3]).toBe('fragile')
    expect(state.resets).toBe(1)
    expect(state.levelResets).toBe(1)
    game.destroy()
})
```

This should pass without modifying `game.ts`; if it does not, fix the generic lifecycle seam rather than adding fragile-specific state.

- [ ] **Step 3: Prove collapsed re-entry uses the existing hazard reload and same-slide collapse rolls back.**

Add the normal re-entry case:

```ts
it('restores fragile state after entering a collapsed tile', () => {
    const onHazard = vi.fn()
    const game = new IceSlideGame({ onHazard })
    game.start(createFragileRun())

    game.move('E')
    game.move('S')
    game.move('N')

    const state = game.getState()
    expect(onHazard).toHaveBeenCalledTimes(1)
    expect(state.player).toEqual(state.start)
    expect(state.grid[1][3]).toBe('fragile')
    expect(state.falls).toBe(1)
    expect(state.resets).toBe(1)
    expect(state.levelFalls).toBe(1)
    expect(state.levelResets).toBe(1)
    game.destroy()
})
```

Add the same-slide collapse-then-hazard rollback using an authored hazard immediately beyond `F`:

```ts
it('discards same-slide fragile collapse when that move later falls', () => {
    const game = new IceSlideGame()
    game.start(
        createTestRun([
            createTestStage({
                id: 'test:fragile-hazard-rollback',
                rows: ['#######', '#S.FH.#', '#..G..#', '#######'],
            }),
        ])
    )

    game.move('E')
    const state = game.getState()
    expect(state.falls).toBe(1)
    expect(state.player).toEqual(state.start)
    expect(state.grid[1][3]).toBe('fragile')
    game.destroy()
})
```

No fragile-specific hazard branch belongs in `game.ts`.

- [ ] **Step 4: Prove HPA-491 Undo restores intact/collapsed state without refunding moves.**

Reuse the existing `createRouteLifecycleRun()` and Safe-choice setup. Put `FRAGILE_STAGE.rows` on stage 3:

```ts
it('restores fragile state through an Expedition Undo round-trip', () => {
    const game = new IceSlideGame()
    game.start(createRouteLifecycleRun(FRAGILE_STAGE.rows))
    clearCurrentStage(game)
    clearCurrentStage(game)
    expect(game.chooseExpeditionRoute('safe')).toBe(true)

    game.move('E')
    const beforeLeave = game.getState()
    expect(beforeLeave.grid[1][3]).toBe('fragile')
    const signaturesBefore = [...beforeLeave.stageSignatures]

    game.move('S')
    const afterMove = game.getState()
    expect(afterMove.grid[1][3]).toBe('collapsed')
    expect(afterMove.stageSignatures).toEqual(signaturesBefore)
    expect(game.canUndo()).toBe(true)

    expect(game.undo()).toBe(true)
    const afterUndo = game.getState()
    expect(afterUndo.player).toEqual(beforeLeave.player)
    expect(afterUndo.grid[1][3]).toBe('fragile')
    expect(afterUndo.moves).toBe(afterMove.moves)
    expect(afterUndo.levelMoves).toBe(afterMove.levelMoves)
    expect(afterUndo.undoChargesAvailable).toBe(0)
    expect(afterUndo.undoChargesUsed).toBe(1)
    expect(afterUndo.stageSignatures).toEqual(signaturesBefore)
    game.destroy()
})
```

Do not add fields to the Undo snapshot or resign the live stage.

- [ ] **Step 5: Add one snow-sized keyboard integration test only.**

In `init.test.ts`, next to the current snow keyboard test:

```ts
it('routes keyboard input through the mapper and stops on fragile', async () => {
    const run = createTestRun([
        createTestStage({
            rows: ['#####', '#S.F#', '#G..#', '#####'],
        }),
    ])
    vi.mocked(createIceSlideExpeditionRunDefinition).mockReturnValueOnce(run)

    const container = mountDom()
    const handle = await initializeIceSlide(container, baseCallbacks())
    try {
        await handle.start('expedition')

        window.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'ArrowRight',
                cancelable: true,
            })
        )

        expect(keyToDirection).toHaveBeenCalledWith('ArrowRight')
        expect(handle.getGame()?.getState().player).toEqual({ row: 1, col: 3 })
        expect(handle.getGame()?.getState().grid[1][3]).toBe('fragile')
    } finally {
        handle.cleanup()
    }
})
```

Stop there. Do not repeat leave/collapse/hazard/reset/Undo behavior through mounted DOM tests; `game.test.ts` owns those contracts.

- [ ] **Step 6: Run the focused lifecycle/input tests.**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/init.test.ts
bun run typecheck
```

Expected: PASS with `game.ts`, `init.ts`, and `test-fixtures.ts` unchanged.

- [ ] **Step 7: Commit Task 3 test coverage.**

```bash
git add \
  src/lib/games/ice-slide/game.test.ts \
  src/lib/games/ice-slide/init.test.ts
git commit -m "test(ice-slide): cover cracked ice lifecycle"
```

- [ ] **Step 8: Run the complete Ice Slide regression suite.**

```bash
bun run test:run -- src/lib/games/ice-slide
```

This reuses the existing Campaign/Daily/Expedition deterministic tests. Do not add a new generator baseline or a fragile content-validation command because generated content still emits no `F`.

- [ ] **Step 9: Run repository type/lint gates.**

```bash
bun run typecheck
bun run lint
```

Fix only regressions caused by HPA-493.

- [ ] **Step 10: Run the existing browser regression gate unchanged.**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Do not edit `play-coverage.spec.ts` to inject fragile content. Its job in HPA-493 is regression coverage for shipped Campaign/Daily/Expedition, route/Undo, snow, and score/UI lifecycles.

- [ ] **Step 11: Review the final diff against the approved scope.**

Expected production files:

```text
src/lib/games/ice-slide/types.ts
src/lib/games/ice-slide/physics.ts
src/lib/games/ice-slide/renderer.ts
src/lib/games/ice-slide/solver.ts
```

Expected test files:

```text
src/lib/games/ice-slide/physics.test.ts
src/lib/games/ice-slide/renderer.test.ts
src/lib/games/ice-slide/solver.test.ts
src/lib/games/ice-slide/quality.test.ts
src/lib/games/ice-slide/run.test.ts
src/lib/games/ice-slide/game.test.ts
src/lib/games/ice-slide/init.test.ts
```

Verify there are no production changes in `game.ts`, `init.ts`, `run.ts`, `quality.ts`, `objectives.ts`, `templates.ts`, `generator.ts`, `daily.ts`, `expedition.ts`, Campaign content, APIs/database, or E2E fixtures.

---

## Final Acceptance Checklist

- [ ] Authored `F` parses as `fragile`; `collapsed` has no glyph.
- [ ] Stop/no-op on fragile leaves it intact; a valid exit collapses it.
- [ ] Entering collapsed produces the existing hazard outcome.
- [ ] `SlideOutcome` is unchanged and grid mutation remains the single state channel.
- [ ] Fragile/collapsed have final static, non-color-only Pixi treatments at the first implementation commit.
- [ ] Solver derives a row-major BigInt collapsed mask from the post-slide grid and includes it in visited identity.
- [ ] The four-fragile state-key fixture solves in 6 moves; the eight-fragile characterization completes below the existing cap.
- [ ] Solver accepts a constrained board with more than 30 authored fragile cells; no arbitrary fragile bit ceiling exists.
- [ ] Quality consumes the stateful solver and rejects truncation; `quality.ts` stays unchanged.
- [ ] Run validation accepts `F` via the shared glyph map; `run.ts` stays unchanged.
- [ ] Manual Reset, hazard reload, same-slide fall rollback, and Undo restore authored/pre-move fragile state through existing grid reconstruction/snapshots.
- [ ] Runtime collapse never mutates stage signatures or materialized run rows.
- [ ] One `init.test.ts` keyboard event proves the existing input seam reaches `F`; no new browser/test API exists.
- [ ] Templates, generator placement, objectives, versions, deterministic goldens, and shipped content remain unchanged.
- [ ] `bun run test:run -- src/lib/games/ice-slide` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run lint` passes.
- [ ] `bun run test:e2e -- e2e/games/play-coverage.spec.ts` passes unchanged.
