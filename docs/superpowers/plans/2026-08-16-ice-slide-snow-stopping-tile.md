# Ice Slide Snow Stopping Tile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the static `N` / `snow` stopping tile so parser, runtime physics, production solver, resets/Undo, Pixi rendering, and existing browser input paths agree, while preserving all currently materialized Campaign/Daily/Expedition runs.

**Architecture:** Extend the existing closed cell/glyph contract and implement snow exactly once in `physics.slide()`. Runtime and BFS already share that transition, while reset/Undo cloning already handles immutable cells generically. Add only a static patterned renderer; keep Campaign/Daily ruleset 1, Expedition ruleset 2, and Expedition generator 2 because no shipped content emits snow in HPA-492.

**Tech Stack:** TypeScript, Vitest, PixiJS 8, Astro browser integration tests, Bun, Playwright.

## Global Constraints

- Keep the implementation local to existing Ice Slide modules.
- Do not add a tile registry, behavior callbacks, a dynamic-state abstraction, or a solver-only snow transition.
- Do not change `ICE_SLIDE_LEVELS`, Daily pools, Expedition templates/fallbacks, RNG labels, scoring, objectives, route choices, or Undo semantics.
- Keep `ICE_SLIDE_RULESET_VERSION = 1` for Campaign/Daily.
- Keep `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`.
- Keep `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`.
- Snow is immutable: no new state field, bitset, snapshot payload, or reset hook.
- Keep the current Expedition template `baseRows` alphabet gate (`#`, `.`, `S`) unchanged; the first content slice that authors `N` there must widen that catalog check and make the generator-version decision.
- Use tests before production edits for each behavior change.
- Keep every commit type-checkable. Adding `'snow'` to `CellType` and `COLORS.snow` must happen in the same commit.

---

## Task 1: Add the snow contract and authoritative slide behavior

**Files:**

- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/physics.ts`
- Modify: `src/lib/games/ice-slide/physics.test.ts`
- Modify: `src/lib/games/ice-slide/renderer.ts` (`COLORS.snow` stub only)

**Interfaces:**

- Produces: `CellType` includes `'snow'`; `GLYPH_TO_CELL.N === 'snow'`.
- Produces: `slide()` returns the existing `kind: 'moved'` shape with `end` on the entered snow cell.
- Preserves: `isBlocking()` remains `undefined | wall | rock` only.

### Steps

- [ ] Add failing parser coverage in `physics.test.ts`:

  ```ts
  const grid = parseGrid({
      id: 'snow-parse',
      rows: ['#####', '#SNG#', '#####'],
  })
  expect(grid[1][2]).toBe('snow')
  ```

- [ ] Add a failing stop-on-entry test using:

  ```text
  #######
  #S.N..#
  #######
  ```

  After converting the start cell to ice and moving east, assert:
  - outcome is `moved`;
  - endpoint is `{ row: 1, col: 3 }`;
  - the path's final entry is `{ row: 1, col: 3 }`;
  - `{ row: 1, col: 4 }` and `{ row: 1, col: 5 }` are absent from the path;
  - `grid[1][3] === 'snow'`.

- [ ] Add a failing start-on-snow test without any special start semantics:

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

- [ ] Add the combined crystal-then-snow regression:

  ```text
  #######
  #S.CN.#
  #######
  ```

  Move east and assert `crystals === 1`, `end === { row: 1, col: 4 }`, the crystal cell became `ice`, the snow cell stayed `snow`, and the path never enters column 5.

- [ ] Extend the existing `cloneGrid is deep enough` coverage with a snow cell and prove mutating the clone does not alter the original snow cell.

- [ ] Run the focused test and confirm the new assertions fail for the expected unknown-glyph/overslide reasons:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/physics.test.ts
  ```

- [ ] In `types.ts`, make the minimal contract edit:

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

  Update the `IceSlideLevel.rows` comment to `# . S G O H C N`.

- [ ] In the same commit, extend the exhaustive renderer color map so `CellType` does not break typecheck before the visual task:

  ```ts
  const COLORS: Record<CellType, number> = {
      // existing entries
      snow: 0xe0f2fe,
  }
  ```

  Do **not** add the snow `drawCell()` branch yet; until Task 4, snow may fall through to the generic ice shimmer.

- [ ] In `physics.ts`, keep `snow` out of `isBlocking()` and return after entering it:

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

  Keep existing hazard/crystal/goal behavior unchanged. Earlier loop iterations must still collect crystals before a later `snow` iteration terminates the move.

- [ ] Run the focused test and typecheck:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/physics.test.ts
  bun run typecheck
  ```

- [ ] Commit:

  ```bash
  git add \
    src/lib/games/ice-slide/types.ts \
    src/lib/games/ice-slide/physics.ts \
    src/lib/games/ice-slide/physics.test.ts \
    src/lib/games/ice-slide/renderer.ts
  git commit -m "feat(ice-slide): add snow stopping physics"
  ```

---

## Task 2: Lock solver, quality, transform, run, and version parity

**Files:**

- Modify: `src/lib/games/ice-slide/solver.test.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`
- Modify: `src/lib/games/ice-slide/transforms.test.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`
- Modify: `src/lib/games/ice-slide/expedition.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/solver.ts`
- Verify unchanged: `src/lib/games/ice-slide/quality.ts`
- Verify unchanged: `src/lib/games/ice-slide/transforms.ts`
- Verify unchanged: `src/lib/games/ice-slide/run.ts`
- Verify unchanged: `src/lib/games/ice-slide/expedition.ts`

**Interfaces:**

- Consumes: snow-aware `slide()` from Task 1.
- Preserves: solver state remains `(position, crystalMask)`; no snow state key.
- Preserves: Campaign/Daily ruleset `1`, Expedition ruleset `2`, Expedition generator `2`.

### Steps

- [ ] Add a solver fixture whose minimum depends on snow:

  ```text
  ######
  #S.NG#
  ######
  ```

  Assert `solvable === true`, `truncated === false`, and `minMoves === 2` because the first east move stops on snow and the second reaches the goal.

- [ ] Add a `quality.test.ts` case for the same rows with:

  ```ts
  {
      parBand: { minMoves: 2, maxMoves: 2 },
      maxStates: 32,
  }
  ```

  Assert the candidate is accepted and reports `parMoves === 2`.

- [ ] Add a non-identity transform regression proving `transformRows()` preserves `N` at the expected transformed coordinate. Do not add snow-specific production transform code.

- [ ] Add a run-validation test that uses the existing `cloneRun()` helper, replaces one stage with valid rectangular rows containing `N`, recomputes the signature with `createIceSlideStageSignature()`, and confirms `assertValidIceSlideRunDefinition()` accepts it. Keep the existing unknown-`Z` rejection unchanged.

- [ ] Freeze the existing version identities in `expedition.test.ts`:

  ```ts
  expect(ICE_SLIDE_EXPEDITION_GENERATOR_VERSION).toBe(2)
  expect(ICE_SLIDE_RULESET_VERSION).toBe(1)
  expect(ICE_SLIDE_EXPEDITION_RULESET_VERSION).toBe(2)
  ```

- [ ] Add a literal full-run stage-signature golden for the existing `SEED = '00112233445566778899aabbccddeeff'`. Before editing the assertion, print the current mainline values with exactly:

  ```bash
  bun -e "import { createIceSlideExpeditionRunDefinition } from './src/lib/games/ice-slide/expedition.ts'; console.log(JSON.stringify(createIceSlideExpeditionRunDefinition('00112233445566778899aabbccddeeff').stages.map(stage => stage.signature)))"
  ```

  Copy that exact six-element JSON array into:

  ```ts
  expect(run.stages.map(stage => stage.signature)).toEqual([
      // paste the six values printed by the command above verbatim
  ])
  ```

  This is a baseline-capture step, not a new generated expectation: Task 1 must not change it because no generator-v2 board contains `N`.

- [ ] Run:

  ```bash
  bun run test:run -- \
    src/lib/games/ice-slide/solver.test.ts \
    src/lib/games/ice-slide/quality.test.ts \
    src/lib/games/ice-slide/transforms.test.ts \
    src/lib/games/ice-slide/run.test.ts \
    src/lib/games/ice-slide/expedition.test.ts
  bun run typecheck
  ```

- [ ] Inspect `solver.ts`, `quality.ts`, `transforms.ts`, `run.ts`, and `expedition.ts`; do not edit them unless a test exposes a real missing generic seam. The intended production diff for this task is empty.

- [ ] Commit:

  ```bash
  git add \
    src/lib/games/ice-slide/solver.test.ts \
    src/lib/games/ice-slide/quality.test.ts \
    src/lib/games/ice-slide/transforms.test.ts \
    src/lib/games/ice-slide/run.test.ts \
    src/lib/games/ice-slide/expedition.test.ts
  git commit -m "test(ice-slide): lock snow solver and run parity"
  ```

---

## Task 3: Prove runtime Reset, hazard reconstruction, state isolation, and Undo

**Files:**

- Modify: `src/lib/games/ice-slide/game.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/game.ts`

**Interfaces:**

- Consumes: `IceSlideGame.move()` -> snow-aware `slide()`.
- Preserves: `IceSlideUndoSnapshot` remains exactly `{ grid, player, crystalsCollected, levelCrystalsCollected }`.

### Steps

- [ ] Build a synthetic stage with this exact board using `createTestStage()` / `createTestRun()`:

  ```text
  #######
  #S.NH.#
  #..G..#
  #######
  ```

  Use `parMoves: 2`. From start, `E` stops on snow; from snow, `S` reaches the goal and `E` enters the hazard.

- [ ] Add a runtime stop test: start the synthetic run, call `game.move('E')`, and assert:

  ```ts
  expect(game.getState().player).toEqual({ row: 1, col: 3 })
  expect(game.getState().grid[1][3]).toBe('snow')
  ```

- [ ] From the snow-stopped state, call `resetLevel()` and assert player returns to start, `grid[1][3]` is still `snow`, and the existing reset counters increment normally.

- [ ] Add the hazard reconstruction path: start fresh, move `E` onto snow, then `E` again into the hazard. Assert the normal fall/reset callback/counters occur, player returns to start, and `grid[1][3] === 'snow'` after `loadLevel()` reparses the stage.

- [ ] Add state-copy isolation: mutate `game.getState().grid[1][3]` on the returned snapshot and verify a second `game.getState()` still reports internal `snow`.

- [ ] Add the HPA-491 Undo round-trip using the existing `createRouteLifecycleRun()` / Safe-choice setup already used by the one-step Undo test. Make the charged target stage contain snow, then:

  ```ts
  const before = game.getState()
  game.move('E')
  expect(game.getState().player).toEqual({ row: 1, col: 3 })
  expect(game.getState().grid[1][3]).toBe('snow')
  expect(game.canUndo()).toBe(true)

  expect(game.undo()).toBe(true)
  expect(game.getState().player).toEqual(before.player)
  expect(game.getState().grid[1][3]).toBe('snow')
  ```

  Also keep the existing move-cost assertions: Undo does not decrement total/stage move counters.

- [ ] Run:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/game.test.ts
  bun run typecheck
  ```

- [ ] Keep `game.ts` unchanged unless the tests expose a real regression. Do not add `snowPositions`, snow-specific reset code, or any Undo snapshot field.

- [ ] Commit:

  ```bash
  git add src/lib/games/ice-slide/game.test.ts
  git commit -m "test(ice-slide): cover snow restore lifecycle"
  ```

---

## Task 4: Add the static non-color-only snow renderer

**Files:**

- Modify: `src/lib/games/ice-slide/renderer.ts`
- Modify: `src/lib/games/ice-slide/renderer.test.ts`

**Interfaces:**

- Consumes: `COLORS.snow` already exists from Task 1.
- Produces: dedicated static `drawCell()` snow branch; no new renderer state.

### Steps

- [ ] Extend the exhaustive renderer test grid with `'snow'` so every `CellType` is exercised.

- [ ] Add a focused snow renderer test that records the primitive calls before and after rendering a snow-only/trivial grid. Assert the snow path emits a dedicated inset plus at least two additional band primitives; do not snapshot Pixi internals.

- [ ] Run the focused test and confirm the pattern assertion fails while typecheck remains green:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/renderer.test.ts
  bun run typecheck
  ```

- [ ] In `drawCell()`, keep the common non-wall floor and add a dedicated static snow branch before the generic ice shimmer. Use only existing primitives, for example:

  ```ts
  if (cell === 'snow') {
      g.roundRect(x + 6, y + 6, cellSize - 12, cellSize - 12, 5).fill({
          color: COLORS.snow,
          alpha: 0.7,
      })
      g.roundRect(x + 10, y + 13, cellSize * 0.45, 4, 2).fill(COLORS.snow)
      g.roundRect(x + cellSize * 0.42, y + 24, cellSize * 0.38, 4, 2).fill(
          COLORS.snow
      )
      return
  }
  ```

  Exact dimensions may be adjusted to remain legible at the existing supported cell sizes, but preserve multiple offset geometry cues rather than a hue-only fill.

- [ ] Do not add filters, textures, sprites, animation, or reduced-motion code. The static geometry is the accessibility cue.

- [ ] Keep player rendering unchanged; it is drawn after cells and remains visible over snow.

- [ ] Run:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/renderer.test.ts
  bun run typecheck
  ```

- [ ] Commit:

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
- Relies on: existing swipe integration coverage already proves swipe converges on the same `game.move()` entry point.

### Steps

- [ ] Reuse the existing mocked `createIceSlideExpeditionRunDefinition` and `createTestRun()` helpers to return a one-stage synthetic run containing:

  ```text
  #######
  #S.N.G#
  #######
  ```

- [ ] Start `initializeIceSlide(...).start('expedition')`, dispatch:

  ```ts
  window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
  )
  ```

  Assert `keyToDirection` received `ArrowRight` and the game player stops at `{ row: 1, col: 3 }`, not beyond snow.

- [ ] Do **not** add a second snow-specific swipe fixture. Keep the existing generic swipe wiring test green; together with Task 3's `game.move()` snow test, that structurally covers swipe without duplicating the same mechanic assertion through another event harness.

- [ ] Run:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/init.test.ts
  bun run typecheck
  ```

- [ ] Keep `init.ts` unchanged. Snow must not create an input special case.

- [ ] Commit:

  ```bash
  git add src/lib/games/ice-slide/init.test.ts
  git commit -m "test(ice-slide): cover snow keyboard wiring"
  ```

---

## Task 6: Run the full regression and content gates

**Files:**

- No expected production changes
- Fix only regressions caused by HPA-492

### Steps

- [ ] Run the complete Ice Slide unit suite:

  ```bash
  bun run test:run -- src/lib/games/ice-slide
  ```

- [ ] Run the existing Expedition content validator. The catalog and version identities are unchanged; this verifies the shared parser/physics extension did not perturb generator-v2 content:

  ```bash
  bun run validate:ice-slide-expedition
  ```

- [ ] Run typecheck and lint:

  ```bash
  bun run typecheck
  bun run lint
  ```

- [ ] Run the full unit suite:

  ```bash
  bun run test:run
  ```

- [ ] Run the existing Ice Slide browser play coverage:

  ```bash
  bun run test:e2e -- e2e/games/play-coverage.spec.ts
  ```

- [ ] Review the final diff and explicitly verify these production files did **not** change:
  - `src/lib/games/ice-slide/levels.ts`
  - `src/lib/games/ice-slide/templates.ts`
  - `src/lib/games/ice-slide/generator.ts`
  - `src/lib/games/ice-slide/daily.ts`
  - `src/lib/games/ice-slide/expedition.ts`
  - `src/lib/games/ice-slide/scoring.ts`
  - `src/lib/games/ice-slide/game.ts`
  - `src/lib/games/ice-slide/init.ts`
  - database/API/leaderboard files

- [ ] Verify the only expected production changes are:
  - `types.ts`: closed cell/glyph contract;
  - `physics.ts`: stop-on-entry transition;
  - `renderer.ts`: Task 1 color entry + Task 4 static pattern.

- [ ] Re-run the frozen identity assertions and confirm:

  ```text
  Campaign/Daily ruleset = 1
  Expedition ruleset = 2
  Expedition generator = 2
  known Expedition stage-signature array = unchanged
  ```

- [ ] If formatting-only edits are needed, run Prettier only on touched files; avoid repo-wide formatting churn.
- [ ] Commit any final regression-only adjustment separately with a narrow message.

---

## Completion checklist

- [ ] `N` is accepted by parsing and run validation as `snow`.
- [ ] Entering snow ends a normal move exactly on that cell.
- [ ] Cells after snow are not traversed in the same move.
- [ ] Starting a move from snow follows normal adjacent-cell rules.
- [ ] A crystal encountered before snow is collected before the move stops.
- [ ] Snow never mutates during ordinary play.
- [ ] Manual Reset and hazard reset reconstruct snow from materialized stage rows.
- [ ] `getState()` cloning cannot mutate internal snow.
- [ ] HPA-491 Undo restores the pre-move player/grid and keeps snow intact without new snapshot state.
- [ ] Solver and runtime share the same snow transition and the two-move fixture stays locked.
- [ ] Quality validation derives the same par with no snow-specific branch.
- [ ] Renderer has a static geometry/pattern cue, not color alone.
- [ ] One snow-specific keyboard event reaches the existing movement entry point; existing swipe wiring remains green.
- [ ] Campaign levels/pars/scoring remain unchanged.
- [ ] Daily generator-v1 seed/output/key stay unchanged.
- [ ] Expedition generator stays v2, ruleset stays v2, and the frozen current stage signatures stay unchanged.
- [ ] Expedition template catalog remains unchanged; later authored `N` content must widen its separate `baseRows` glyph gate.
- [ ] No dynamic state or HPA-493 machinery was introduced early.
