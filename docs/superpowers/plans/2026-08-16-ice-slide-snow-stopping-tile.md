# Ice Slide Snow Stopping Tile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the static `N` / `snow` stopping tile so parser, runtime physics, production solver, resets/Undo, Pixi rendering, and existing browser input paths agree, while preserving all currently materialized Campaign/Daily/Expedition runs.

**Architecture:** Extend the existing closed cell/glyph contract and implement snow exactly once in `physics.slide()`. Runtime and BFS already share that transition; reset/Undo cloning already handles immutable cells generically. Add a static patterned renderer with compile-time cell exhaustiveness. Do not reauthor content or change generator/ruleset versions because no shipped run emits snow in HPA-492.

**Tech Stack:** TypeScript, Vitest, PixiJS 8, Astro browser integration tests, Bun, Playwright.

## Global Constraints

- Keep the implementation local to existing Ice Slide modules.
- Do not add a tile registry, behavior callbacks, a dynamic-state abstraction, or a solver-only snow transition.
- Do not change `ICE_SLIDE_LEVELS`, Daily pools, Expedition templates/fallbacks, RNG labels, scoring, objectives, route choices, or Undo semantics.
- Keep `ICE_SLIDE_RULESET_VERSION = 1` for Campaign/Daily.
- Keep `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`.
- Keep `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`.
- Snow is immutable: no new state field, bitset, snapshot payload, or reset hook.
- Keep the current Expedition template `baseRows` alphabet gate (`#`, `.`, `S`) unchanged; the first content slice that authors `N` there must widen that catalog check and bump the affected generator version.
- Reuse existing mainline deterministic freezes; do not add a post-change Expedition baseline or duplicate version assertions.
- Keep every commit type-checkable. Adding `'snow'` to `CellType` and `COLORS.snow` must happen in the same commit.

---

## Task 1: Add the snow contract and authoritative slide behavior

**Files:**

- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/physics.ts`
- Modify: `src/lib/games/ice-slide/physics.test.ts`
- Modify: `src/lib/games/ice-slide/renderer.ts` (`COLORS.snow` only in this task)

**Interfaces:**

- Produces: `CellType` includes `'snow'`.
- Produces: `GLYPH_TO_CELL.N === 'snow'`.
- Produces: `slide()` returns the existing `kind: 'moved'` outcome ending on the entered snow cell.
- Preserves: `isBlocking()` remains `undefined | wall | rock` only.

- [ ] **Step 1: Add parser coverage for `N`.**

```ts
const grid = parseGrid({
    id: 'snow-parse',
    rows: ['#####', '#SNG#', '#####'],
})
expect(grid[1][2]).toBe('snow')
```

- [ ] **Step 2: Add stop-on-entry coverage.**

Use:

```text
#######
#S.N..#
#######
```

After converting the start cell to ice and moving east, assert:

```ts
expect(outcome.kind).toBe('moved')
if (outcome.kind === 'moved') {
    expect(outcome.end).toEqual({ row: 1, col: 3 })
    expect(outcome.path.at(-1)).toEqual({ row: 1, col: 3 })
    expect(outcome.path).not.toContainEqual({ row: 1, col: 4 })
    expect(outcome.path).not.toContainEqual({ row: 1, col: 5 })
}
expect(grid[1][3]).toBe('snow')
```

- [ ] **Step 3: Add leave-from-snow coverage.**

```ts
const grid = parseGrid({
    id: 'leave-snow',
    rows: ['#######', '#..N..#', '#######'],
})

expect(slide(grid, { row: 1, col: 3 }, DIRECTION_DELTA.E)).toMatchObject({
    kind: 'moved',
    end: { row: 1, col: 5 },
})
expect(slide(grid, { row: 1, col: 3 }, DIRECTION_DELTA.W)).toMatchObject({
    kind: 'moved',
    end: { row: 1, col: 1 },
})
```

- [ ] **Step 4: Add the crystal-then-snow ordering regression.**

Use:

```text
#######
#S.CN.#
#######
```

Move east and assert:

```ts
expect(outcome.kind).toBe('moved')
if (outcome.kind === 'moved') {
    expect(outcome.crystals).toBe(1)
    expect(outcome.end).toEqual({ row: 1, col: 4 })
    expect(outcome.path).not.toContainEqual({ row: 1, col: 5 })
}
expect(grid[1][3]).toBe('ice')
expect(grid[1][4]).toBe('snow')
```

Do not add a snow-specific `cloneGrid()` test; cloning is glyph-agnostic and Task 3 covers the meaningful state-boundary restore paths.

- [ ] **Step 5: Run the focused test and confirm failure.**

```bash
bun run test:run -- src/lib/games/ice-slide/physics.test.ts
```

Expected before implementation: failure on unknown `N` and/or the slide continuing beyond snow.

- [ ] **Step 6: Extend the cell/glyph contract.**

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

export const GLYPH_TO_CELL: Record<string, CellType> = {
    '#': 'wall',
    '.': 'ice',
    S: 'start',
    G: 'goal',
    O: 'rock',
    H: 'hazard',
    C: 'crystal',
    N: 'snow',
}
```

Update the `IceSlideLevel.rows` contract comment to include `N`.

- [ ] **Step 7: Keep renderer typecheck green in the same commit.**

Add only the new color entry in `renderer.ts`:

```ts
const COLORS: Record<CellType, number> = {
    wall: 0x1e293b,
    ice: 0x0e7490,
    start: 0x0e7490,
    goal: 0x22c55e,
    rock: 0x64748b,
    hazard: 0x7f1d1d,
    crystal: 0x67e8f9,
    snow: 0xe0f2fe,
}
```

Do not add the visual snow branch yet. Task 4 will replace the implicit fallthrough with an exhaustive renderer switch.

- [ ] **Step 8: Implement stop-on-entry once in `slide()`.**

Keep `snow` out of `isBlocking()`. After the player enters the next cell and the path is updated, add:

```ts
if (next === 'snow') {
    return {
        kind: 'moved',
        path,
        end: { row, col },
        crystals,
        reachedGoal: false,
    }
}
```

Do not change `SlideOutcome`. Earlier loop iterations must continue collecting crystals before a later snow cell terminates the slide.

- [ ] **Step 9: Verify Task 1.**

```bash
bun run test:run -- src/lib/games/ice-slide/physics.test.ts
bun run typecheck
```

Expected: PASS and zero new type errors.

- [ ] **Step 10: Commit.**

```bash
git add \
  src/lib/games/ice-slide/types.ts \
  src/lib/games/ice-slide/physics.ts \
  src/lib/games/ice-slide/physics.test.ts \
  src/lib/games/ice-slide/renderer.ts
git commit -m "feat(ice-slide): add snow stopping physics"
```

---

## Task 2: Lock solver, quality, and run-validator parity

**Files:**

- Modify: `src/lib/games/ice-slide/solver.test.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/solver.ts`
- Verify unchanged: `src/lib/games/ice-slide/quality.ts`
- Verify unchanged: `src/lib/games/ice-slide/run.ts`

**Interfaces:**

- Consumes: snow-aware `slide()` from Task 1.
- Preserves: solver state remains `(position, crystalMask)`; no snow state key.
- Preserves: `GLYPH_TO_CELL` remains the shared parser/run-validator gate.

- [ ] **Step 1: Add a solver fixture whose minimum depends on snow.**

```ts
const result = solveIceSlideBoard(
    {
        id: 'snow-par',
        rows: ['######', '#S.NG#', '######'],
    },
    { maxStates: 32 }
)

expect(result.solvable).toBe(true)
expect(result.truncated).toBe(false)
expect(result.minMoves).toBe(2)
```

The first east move stops on `N`; the second reaches `G`.

- [ ] **Step 2: Add quality coverage using the same rows.**

The candidate must include the required `objectiveIds` field:

```ts
const result = validateIceSlideStageQuality(
    {
        id: 'snow-quality',
        rows: ['######', '#S.NG#', '######'],
        objectiveIds: [],
    },
    {
        parBand: { minMoves: 2, maxMoves: 2 },
        maxStates: 32,
    }
)

expect(result.accepted).toBe(true)
if (result.accepted) {
    expect(result.parMoves).toBe(2)
}
```

- [ ] **Step 3: Add run-validator acceptance for `N`.**

Reuse the existing `cloneRun()` helper, replace one stage's rows with a valid rectangular snow-bearing board, recompute its signature, and prove the run validator consumes the same glyph map as `parseGrid()`:

```ts
const run = cloneRun()
run.stages[0].rows = ['######', '#S.NG#', '######']
run.stages[0].parMoves = 2
run.stages[0].signature = createIceSlideStageSignature(run.stages[0])

expect(() => assertValidIceSlideRunDefinition(run)).not.toThrow()
```

Keep the existing unknown-`Z` rejection unchanged.

Do not add:

- a snow-specific transform test — transforms are glyph-agnostic and already covered;
- new Expedition version assertions — `expedition.test.ts` already freezes r1/r2/g2;
- a new post-change full-run signature baseline — `generator.test.ts` already contains the real pre-change generator-v2 goldens for all three tiers.

- [ ] **Step 4: Run the focused tests.**

```bash
bun run test:run -- \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/run.test.ts
bun run typecheck
```

Expected: PASS without production edits to `solver.ts`, `quality.ts`, or `run.ts`.

- [ ] **Step 5: Commit.**

```bash
git add \
  src/lib/games/ice-slide/solver.test.ts \
  src/lib/games/ice-slide/quality.test.ts \
  src/lib/games/ice-slide/run.test.ts
git commit -m "test(ice-slide): cover snow solver and run parity"
```

---

## Task 3: Prove runtime Reset, hazard reconstruction, state isolation, and Undo

**Files:**

- Modify: `src/lib/games/ice-slide/game.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/game.ts`

**Interfaces:**

- Consumes: `IceSlideGame.move()` -> snow-aware `slide()`.
- Preserves: `IceSlideUndoSnapshot` remains exactly `{ grid, player, crystalsCollected, levelCrystalsCollected }`.

- [ ] **Step 1: Build one reusable synthetic snow stage.**

Use `createTestStage()` / `createTestRun()` with:

```text
#######
#S.NH.#
#..G..#
#######
```

Set `parMoves: 2`. From start, `E` stops on snow; from snow, `S` reaches the goal and `E` enters the hazard.

- [ ] **Step 2: Add normal runtime stop coverage.**

```ts
game.move('E')
expect(game.getState().player).toEqual({ row: 1, col: 3 })
expect(game.getState().grid[1][3]).toBe('snow')
```

- [ ] **Step 3: Add manual Reset restoration.**

From the snow-stopped state:

```ts
game.resetLevel()
const state = game.getState()
expect(state.player).toEqual(state.start)
expect(state.grid[1][3]).toBe('snow')
expect(state.resets).toBe(1)
expect(state.levelResets).toBe(1)
```

- [ ] **Step 4: Add hazard reload restoration.**

Start fresh, move `E` onto snow, then `E` again into the hazard. Assert the normal hazard callback/counters, player reset, and:

```ts
expect(game.getState().grid[1][3]).toBe('snow')
```

- [ ] **Step 5: Add `getState()` output isolation.**

This is state-boundary coverage, not a snow-specific clone implementation:

```ts
const snapshot = game.getState()
snapshot.grid[1][3] = 'ice'
expect(game.getState().grid[1][3]).toBe('snow')
```

- [ ] **Step 6: Add the HPA-491 Undo round-trip.**

Reuse the existing `createRouteLifecycleRun()` / Safe-choice setup from the one-step Undo test. Make the charged target stage contain snow, then assert:

```ts
const before = game.getState()
game.move('E')
const afterMove = game.getState()

expect(afterMove.player).toEqual({ row: 1, col: 3 })
expect(afterMove.grid[1][3]).toBe('snow')
expect(game.canUndo()).toBe(true)

expect(game.undo()).toBe(true)
const afterUndo = game.getState()
expect(afterUndo.player).toEqual(before.player)
expect(afterUndo.grid[1][3]).toBe('snow')
expect(afterUndo.moves).toBe(afterMove.moves)
expect(afterUndo.levelMoves).toBe(afterMove.levelMoves)
```

Do not add snapshot fields.

- [ ] **Step 7: Verify Task 3.**

```bash
bun run test:run -- src/lib/games/ice-slide/game.test.ts
bun run typecheck
```

Expected: PASS with `game.ts` unchanged.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/games/ice-slide/game.test.ts
git commit -m "test(ice-slide): cover snow restore lifecycle"
```

---

## Task 4: Render snow distinctly and make cell rendering exhaustive

**Files:**

- Modify: `src/lib/games/ice-slide/renderer.ts`
- Modify: `src/lib/games/ice-slide/renderer.test.ts`

**Interfaces:**

- Consumes: `COLORS.snow` from Task 1.
- Produces: explicit rendering decision for every non-wall `CellType`.
- Produces: compile-time failure when a future cell type is added without updating `drawCell()`.

- [ ] **Step 1: Extend the renderer's all-cell exercise with `snow`.**

Add `'snow'` to the existing grid used by `renders every cell type, slide trail, and player without throwing` and adjust the column count from 7 to 8.

- [ ] **Step 2: Add a focused snow-pattern regression.**

Render a trivial grid containing one snow cell. Record `rect` / `roundRect` calls and assert the snow cell emits one inset field plus at least two offset band primitives. Do not snapshot Pixi internals.

- [ ] **Step 3: Run the focused test before the visual branch.**

```bash
bun run test:run -- src/lib/games/ice-slide/renderer.test.ts
bun run typecheck
```

Expected: renderer test fails on the snow-pattern assertion while typecheck remains green because Task 1 already added `COLORS.snow`.

- [ ] **Step 4: Replace the implicit ice fallthrough with explicit cases.**

Keep the early wall return. After drawing the common non-wall floor, use an explicit switch for every remaining `CellType`:

```ts
switch (cell) {
    case 'goal':
        g.roundRect(x + 8, y + 8, cellSize - 16, cellSize - 16, 6).fill(
            COLORS.goal
        )
        return

    case 'rock':
        g.roundRect(x + 10, y + 10, cellSize - 20, cellSize - 20, 4).fill(
            COLORS.rock
        )
        return

    case 'hazard':
        g.circle(cx, cy, cellSize * 0.28).fill(COLORS.hazard)
        g.circle(cx, cy, cellSize * 0.14).fill(0x450a0a)
        return

    case 'crystal':
        g.star(cx, cy, 4, cellSize * 0.28, cellSize * 0.12).fill(COLORS.crystal)
        return

    case 'snow':
        g.roundRect(x + 6, y + 6, cellSize - 12, cellSize - 12, 5).fill({
            color: COLORS.snow,
            alpha: 0.7,
        })
        g.roundRect(x + 10, y + 13, cellSize * 0.45, 4, 2).fill(COLORS.snow)
        g.roundRect(x + cellSize * 0.42, y + 24, cellSize * 0.38, 4, 2).fill(
            COLORS.snow
        )
        return

    case 'ice':
    case 'start':
        g.rect(x + 6, y + 6, cellSize - 12, cellSize - 12).fill({
            color: COLORS.ice,
            alpha: 0.18,
        })
        return
}

const _exhaustive: never = cell
return _exhaustive
```

The earlier `if (cell === 'wall') { ... return }` must remain before this switch so `wall` is narrowed out. Do not add a `default` case; the `never` assignment is the compile-time guard.

- [ ] **Step 5: Keep the snow visual static and non-color-only.**

Do not add filters, textures, sprites, animation, or reduced-motion code. The inset plus multiple offset bands are the shape/pattern cue.

- [ ] **Step 6: Run automated renderer verification.**

```bash
bun run test:run -- src/lib/games/ice-slide/renderer.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Perform one real 48px visual check.**

Start the dev server:

```bash
bun run web:dev
```

Open `/ice-slide`, start Campaign, then use browser DevTools to make one existing First Frost ice cell render as snow without editing source files:

```js
const handle = window.iceSlideGame
const game = handle.getGame()
game.state.grid[1][3] = 'snow'
window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true })
)
```

`ArrowUp` is blocked from the First Frost start, but the existing key handler still runs the render path after `game.move()`. At the shipped `CELL_SIZE = 48`, verify:

- the snow cell is visibly patterned rather than a hue-only variant of adjacent ice;
- the player remains clearly readable over the board;
- the pattern does not visually merge with the wall/goal shapes visible on the board.

Refresh the page afterward to discard the runtime-only mutation. Do not commit a snow fixture or Campaign content edit for this check.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/games/ice-slide/renderer.ts src/lib/games/ice-slide/renderer.test.ts
git commit -m "feat(ice-slide): render snow stopping tiles"
```

---

## Task 5: Add one browser-event lock without duplicating input semantics

**Files:**

- Modify: `src/lib/games/ice-slide/init.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/init.ts`
- Verify unchanged: `src/lib/games/ice-slide/renderer.ts` input mapping helpers

**Interfaces:**

- Consumes: existing keyboard mapping -> `game.move()`.
- Relies on: existing swipe integration coverage already proves swipe converges on the same movement entry point.

- [ ] **Step 1: Reuse the existing mocked Expedition run factory.**

Return a one-stage synthetic run containing:

```text
#######
#S.N.G#
#######
```

- [ ] **Step 2: Dispatch one real keyboard event.**

```ts
window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
)
```

Assert:

```ts
expect(keyToDirection).toHaveBeenCalledWith('ArrowRight')
expect(handle.getGame()?.getState().player).toEqual({ row: 1, col: 3 })
```

Do not add a second snow-specific swipe fixture. Keep the existing generic swipe wiring test green.

- [ ] **Step 3: Verify Task 5.**

```bash
bun run test:run -- src/lib/games/ice-slide/init.test.ts
bun run typecheck
```

Expected: PASS with `init.ts` unchanged.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/games/ice-slide/init.test.ts
git commit -m "test(ice-slide): cover snow keyboard wiring"
```

---

## Task 6: Run full regression and content gates

**Files:**

- No expected production changes.
- Fix only regressions caused by HPA-492.

- [ ] **Step 1: Run the complete Ice Slide unit suite.**

```bash
bun run test:run -- src/lib/games/ice-slide
```

This already executes the existing pre-change deterministic protections in `generator.test.ts` and `expedition.test.ts`; do not add duplicate freezes.

- [ ] **Step 2: Run the Expedition content validator.**

```bash
bun run validate:ice-slide-expedition
```

The catalog and versions are unchanged; this confirms the shared parser/physics extension did not perturb generator-v2 content.

- [ ] **Step 3: Run typecheck and lint.**

```bash
bun run typecheck
bun run lint
```

- [ ] **Step 4: Run the full unit suite.**

```bash
bun run test:run
```

- [ ] **Step 5: Run existing Ice Slide browser play coverage.**

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

- [ ] **Step 6: Review final production scope.**

The only expected production behavior changes are:

- `src/lib/games/ice-slide/types.ts`: add the closed snow cell/glyph contract;
- `src/lib/games/ice-slide/physics.ts`: add stop-on-entry;
- `src/lib/games/ice-slide/renderer.ts`: add color entry, patterned branch, and renderer exhaustiveness.

Explicitly verify these files did **not** change:

- `src/lib/games/ice-slide/levels.ts`
- `src/lib/games/ice-slide/templates.ts`
- `src/lib/games/ice-slide/generator.ts`
- `src/lib/games/ice-slide/daily.ts`
- `src/lib/games/ice-slide/expedition.ts`
- `src/lib/games/ice-slide/scoring.ts`
- `src/lib/games/ice-slide/game.ts`
- `src/lib/games/ice-slide/init.ts`
- database/API/leaderboard files

- [ ] **Step 7: Verify existing identity/content tests remain green, not rewritten.**

Confirm the normal suite still passes the existing mainline assertions for:

```text
Campaign/Daily ruleset = 1
Expedition ruleset = 2
Expedition generator = 2
generator-v2 easy/medium/hard literal goldens = unchanged
```

Do not update those expectations in HPA-492.

- [ ] **Step 8: Keep formatting narrow.**

If formatting is needed, run Prettier only on touched files. Do not run a repository-wide rewrite.

---

## Completion checklist

- [ ] `N` is accepted by parsing and run validation as `snow`.
- [ ] Entering snow ends a normal move exactly on that cell.
- [ ] Cells after snow are not traversed in the same move.
- [ ] Starting a move from snow follows normal adjacent-cell rules.
- [ ] A crystal encountered before snow is collected before the move stops.
- [ ] Snow never mutates during ordinary play.
- [ ] Manual Reset and hazard reset reconstruct snow from materialized stage rows.
- [ ] `getState()` cloning cannot mutate internal snow state.
- [ ] HPA-491 Undo restores the pre-move player/grid and keeps snow intact without new snapshot state.
- [ ] Solver and runtime share the same snow transition and the two-move fixture stays locked.
- [ ] Quality validation derives the same par with `objectiveIds: []` and no snow-specific branch.
- [ ] Run validation accepts `N` through the same `GLYPH_TO_CELL` map used by parsing.
- [ ] `drawCell()` is compile-time exhaustive for future `CellType` additions.
- [ ] Renderer has a static geometry/pattern cue and passes the 48px visual check.
- [ ] One snow-specific keyboard event reaches the existing movement entry point; existing swipe wiring remains green.
- [ ] Campaign levels/pars/scoring remain unchanged.
- [ ] Daily generator-v1 seed/output/key stay unchanged.
- [ ] Expedition generator stays v2 and ruleset stays v2; existing pre-change generator goldens remain unchanged.
- [ ] Expedition template catalog remains unchanged; later authored `N` content must widen its separate `baseRows` glyph gate and bump the affected generator version.
- [ ] No dynamic state or HPA-493 machinery was introduced early.
