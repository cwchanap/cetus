# Ice Slide Snow Stopping Tile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the static `N` / `snow` stopping tile so runtime physics, production solver, resets, Pixi rendering, and browser inputs all agree, while preserving Campaign/Daily output and the existing Expedition generator.

**Architecture:** Extend the existing closed cell/glyph contract and implement snow exactly once in `physics.slide()`. Runtime and BFS already share that transition, while reset/Undo cloning already handles immutable cells generically. Add a static patterned renderer and bump only the Expedition ruleset from 2 to 3; do not add dynamic state or reauthor generator templates.

**Tech Stack:** TypeScript, Vitest, PixiJS 8, Astro browser integration tests, Bun, Playwright.

## Global Constraints

- Keep the implementation local to existing Ice Slide modules.
- Do not add a tile registry, behavior callbacks, a dynamic-state abstraction, or a solver-only snow transition.
- Do not change `ICE_SLIDE_LEVELS`, Daily pools, Expedition templates/fallbacks, RNG labels, scoring, objectives, route choices, or Undo semantics.
- Keep `ICE_SLIDE_RULESET_VERSION = 1` for Campaign/Daily.
- Keep `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`.
- Bump only `ICE_SLIDE_EXPEDITION_RULESET_VERSION` from `2` to `3`.
- Snow is immutable: no new state field, bitset, snapshot payload, or reset hook.
- Use tests before production edits for each behavior change.
- Keep every commit type-checkable; do not leave the exhaustive `Record<CellType, ...>` renderer map broken between commits.

---

## Task 1: Add the snow contract and authoritative slide behavior

**Files:**

- Modify: `src/lib/games/ice-slide/types.ts`
- Modify: `src/lib/games/ice-slide/physics.ts`
- Modify: `src/lib/games/ice-slide/physics.test.ts`

### Steps

- [ ] Add failing parser coverage in `physics.test.ts` using a compact row such as `#SNG#` and assert `N` maps to `snow`.
- [ ] Add a failing stop-on-entry test using:

  ```text
  ######
  #S.N.#
  ######
  ```

  After converting the start cell to ice and moving east, assert:
  - outcome is `moved`;
  - endpoint is the `N` coordinate;
  - the path ends on `N`;
  - the cell after `N` is not traversed;
  - the grid still contains `snow` at the endpoint.

- [ ] Add a failing start-on-snow test. Build/parse a row containing snow, call `slide()` with `from` equal to the snow coordinate, and prove the player can leave east/west under the same normal blocking rules.
- [ ] Extend the existing `cloneGrid is deep enough` test with a snow cell and prove mutating the clone does not alter the original snow cell.
- [ ] Run the focused test and confirm the new assertions fail for the expected unknown-glyph/overslide reasons:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/physics.test.ts
  ```

- [ ] In `types.ts`, add `'snow'` to `CellType`, add `N: 'snow'` to `GLYPH_TO_CELL`, and update the `IceSlideLevel.rows` glyph comment to include `N`.
- [ ] In `physics.ts`, keep `snow` out of `isBlocking()` and add the terminal `moved` return immediately after entering a snow cell. Do not change `SlideOutcome`.
- [ ] Re-run the focused test:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/physics.test.ts
  ```

- [ ] Commit:

  ```bash
  git add src/lib/games/ice-slide/types.ts src/lib/games/ice-slide/physics.ts src/lib/games/ice-slide/physics.test.ts
  git commit -m "feat(ice-slide): add snow stopping physics"
  ```

---

## Task 2: Lock solver, quality, transform, and run-contract parity

**Files:**

- Modify: `src/lib/games/ice-slide/solver.test.ts`
- Modify: `src/lib/games/ice-slide/quality.test.ts`
- Modify: `src/lib/games/ice-slide/transforms.test.ts`
- Modify: `src/lib/games/ice-slide/run.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/solver.ts`
- Verify unchanged: `src/lib/games/ice-slide/quality.ts`
- Verify unchanged: `src/lib/games/ice-slide/transforms.ts`
- Verify unchanged: `src/lib/games/ice-slide/run.ts`

### Steps

- [ ] Add a solver fixture whose minimum depends on snow:

  ```text
  ######
  #S.NG#
  ######
  ```

  Assert `solvable === true`, `truncated === false`, and `minMoves === 2` because the first east move stops on snow and the second reaches the goal.

- [ ] Add a `quality.test.ts` case for the same rows with `objectiveIds: []`, `maxStates` large enough for the tiny board, and `parBand: { minMoves: 2, maxMoves: 2 }`. Assert the candidate is accepted and reports `parMoves === 2`.
- [ ] Add a transform regression proving at least one non-identity `transformRows()` operation preserves the `N` glyph at the expected transformed coordinate. Do not add snow-specific production transform code.
- [ ] Add a run-validation test that clones/materializes a valid stage with `N`, recomputes its signature through `createIceSlideStageSignature()`, and confirms `assertValidIceSlideRunDefinition()` accepts the glyph. Keep the existing unknown-`Z` rejection test unchanged.
- [ ] Run:

  ```bash
  bun run test:run -- \
    src/lib/games/ice-slide/solver.test.ts \
    src/lib/games/ice-slide/quality.test.ts \
    src/lib/games/ice-slide/transforms.test.ts \
    src/lib/games/ice-slide/run.test.ts
  ```

- [ ] Inspect `solver.ts`, `quality.ts`, `transforms.ts`, and `run.ts`; do not edit them unless a test exposes a real missing generic seam. The intended result is test-only coverage because these modules already delegate to `slide()`, operate on glyph strings, or consume `GLYPH_TO_CELL`.
- [ ] Commit:

  ```bash
  git add src/lib/games/ice-slide/solver.test.ts src/lib/games/ice-slide/quality.test.ts src/lib/games/ice-slide/transforms.test.ts src/lib/games/ice-slide/run.test.ts
  git commit -m "test(ice-slide): cover snow solver and authoring seams"
  ```

---

## Task 3: Prove runtime Reset and hazard reconstruction preserve snow

**Files:**

- Modify: `src/lib/games/ice-slide/game.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/game.ts`

### Steps

- [ ] Build a synthetic stage with start, snow, a later hazard, and a reachable goal using `createTestStage()` / `createTestRun()` rather than changing Campaign or Expedition content.
- [ ] Add a runtime test that starts the run, moves onto snow, and asserts `IceSlideGame.getState().player` is the snow coordinate and `state.grid` still contains `'snow'` there.
- [ ] From the snow-stopped state, call `resetLevel()` and assert:
  - player returns to the authored start;
  - the `N` coordinate is still `'snow'`;
  - normal reset counters follow the existing contract.
- [ ] Add a hazard-reset path: move onto snow, then make the next committed move enter the authored hazard. Assert the normal fall/reset occurs and the reloaded grid restores the snow cell.
- [ ] Add one state-copy isolation assertion: mutate the `grid` returned by `getState()` and verify a second `getState()` still reports the internal snow cell. This locks the existing `cloneGrid()` state boundary.
- [ ] Run:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/game.test.ts
  ```

- [ ] Keep `game.ts` unchanged unless the tests prove a real regression. Do not add `snowPositions`, snow-specific reset code, or new Undo snapshot fields.
- [ ] Commit:

  ```bash
  git add src/lib/games/ice-slide/game.test.ts
  git commit -m "test(ice-slide): cover snow reset lifecycle"
  ```

---

## Task 4: Add a static non-color-only snow renderer

**Files:**

- Modify: `src/lib/games/ice-slide/renderer.ts`
- Modify: `src/lib/games/ice-slide/renderer.test.ts`

### Steps

- [ ] First extend the exhaustive renderer test grid with `'snow'`. Because `COLORS` is `Record<CellType, number>`, the production file should currently fail type-check until the renderer is updated.
- [ ] Add a focused renderer test with a snow-only/trivial grid that asserts the snow branch emits its dedicated patterned primitives. Prefer call-count/argument assertions around `roundRect`/`rect` rather than snapshots of Pixi internals.
- [ ] Run the focused tests/typecheck and confirm the missing exhaustive snow renderer is exposed:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/renderer.test.ts
  bun run typecheck
  ```

- [ ] Add `snow` to `COLORS`.
- [ ] In `drawCell()`, keep the common non-wall floor and add a dedicated snow branch consisting only of static Pixi primitives:
  - pale inset snow field;
  - two or three short/offset horizontal snow-bank bands using `rect`/`roundRect`;
  - `return` before the generic ice shimmer.
- [ ] Do not add filters, textures, sprites, animation, or reduced-motion code. The geometry/pattern is the non-color cue.
- [ ] Keep the player rendering unchanged; it remains drawn after the grid and overlays the snow field.
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

## Task 5: Cover keyboard and swipe movement through the real browser wiring

**Files:**

- Modify: `src/lib/games/ice-slide/init.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/init.ts`
- Verify unchanged: `src/lib/games/ice-slide/renderer.ts` input mapping helpers

### Steps

- [ ] In `init.test.ts`, reuse the existing mocked `createIceSlideExpeditionRunDefinition` and `createTestRun()` helpers to return a one-stage materialized run with rows where east movement encounters snow before additional traversable cells.
- [ ] Start `initializeIceSlide(...).start('expedition')` and dispatch a real `KeyboardEvent('keydown', { key: 'ArrowRight' })` on `window`. Assert the game player stops at the snow coordinate rather than sliding past it.
- [ ] Start the fixture again, set the existing `swipeToDirection` mock to return `'E'`, dispatch pointer down/up events on the mocked Pixi canvas, and assert the same endpoint.
- [ ] Assert each path still calls the existing input converter (`keyToDirection` / `swipeToDirection`) so the test covers browser wiring rather than calling `game.move()` directly.
- [ ] Run:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/init.test.ts
  ```

- [ ] Keep `init.ts` unchanged. Snow must not create an input special case.
- [ ] Commit:

  ```bash
  git add src/lib/games/ice-slide/init.test.ts
  git commit -m "test(ice-slide): cover snow keyboard and swipe input"
  ```

---

## Task 6: Advance the Expedition ruleset without changing generator output

**Files:**

- Modify: `src/lib/games/ice-slide/expedition.ts`
- Modify: `src/lib/games/ice-slide/expedition.test.ts`
- Verify unchanged: `src/lib/games/ice-slide/generator.ts`
- Verify unchanged: `src/lib/games/ice-slide/daily.ts`
- Verify unchanged: `src/lib/games/ice-slide/run.ts`

### Steps

- [ ] Update the frozen run-identity test in `expedition.test.ts` to expect:

  ```ts
  ICE_SLIDE_EXPEDITION_GENERATOR_VERSION === 2
  ICE_SLIDE_RULESET_VERSION === 1
  ICE_SLIDE_EXPEDITION_RULESET_VERSION === 3
  ```

  Keep the generated stage assertions unchanged.

- [ ] Before changing production, run the Expedition test and confirm the version assertion fails:

  ```bash
  bun run test:run -- src/lib/games/ice-slide/expedition.test.ts
  ```

- [ ] Change only:

  ```ts
  export const ICE_SLIDE_EXPEDITION_RULESET_VERSION = 3
  ```

  in `expedition.ts`.

- [ ] Do not bump `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION`. No template rows, fallbacks, mutation choices, or RNG labels changed.
- [ ] Do not bump Campaign/Daily `ICE_SLIDE_RULESET_VERSION`. Their shipped boards contain no snow, and bumping it would reseed Daily v1 because the ruleset is part of the Daily seed.
- [ ] Add/retain an assertion that the known Expedition seed still materializes the same stage rows/signatures before and after this task apart from run-level `rulesetVersion` / `runKey`. If the current test only checks deterministic equality, freeze `run.stages.map(stage => stage.signature)` once in the test so accidental generator churn is visible.
- [ ] Run:

  ```bash
  bun run test:run -- \
    src/lib/games/ice-slide/expedition.test.ts \
    src/lib/games/ice-slide/daily.test.ts \
    src/lib/games/ice-slide/run.test.ts
  ```

- [ ] Commit:

  ```bash
  git add src/lib/games/ice-slide/expedition.ts src/lib/games/ice-slide/expedition.test.ts
  git commit -m "chore(ice-slide): bump expedition snow ruleset"
  ```

---

## Task 7: Run the full regression and content gates

**Files:**

- No expected production changes
- Fix only regressions caused by HPA-492

### Steps

- [ ] Run the complete Ice Slide unit suite:

  ```bash
  bun run test:run -- src/lib/games/ice-slide
  ```

- [ ] Run the existing Expedition content validator. The catalog itself is unchanged; this verifies snow support/ruleset work did not perturb generator-v2 solvability:

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

- [ ] Run the existing Ice Slide browser play coverage to ensure Campaign/Daily/Expedition flows still complete under the version update:

  ```bash
  bun run test:e2e -- e2e/games/play-coverage.spec.ts
  ```

- [ ] Review the final diff and explicitly verify these files did **not** change:
  - `src/lib/games/ice-slide/levels.ts`
  - `src/lib/games/ice-slide/templates.ts`
  - `src/lib/games/ice-slide/generator.ts`
  - `src/lib/games/ice-slide/daily.ts`
  - `src/lib/games/ice-slide/scoring.ts`
  - database/API/leaderboard files

- [ ] If formatting-only edits are needed, run Prettier only on touched files; avoid repo-wide formatting churn.
- [ ] Commit any final regression-only adjustments separately with a narrow message.

---

## Completion checklist

- [ ] `N` is accepted by parsing and run validation as `snow`.
- [ ] Entering snow ends a normal move exactly on that cell.
- [ ] Starting a move from snow follows normal adjacent-cell rules.
- [ ] Snow never mutates during ordinary play.
- [ ] Manual Reset and hazard reset reconstruct snow from materialized stage rows.
- [ ] Solver and runtime share the same snow transition and the two-move fixture stays locked.
- [ ] Quality validation derives the same par with no snow-specific branch.
- [ ] Renderer has a static geometry/pattern cue, not color alone.
- [ ] Keyboard and swipe browser paths both stop on snow.
- [ ] Campaign levels/pars/scoring remain unchanged.
- [ ] Daily generator-v1 seed/output/key stay unchanged.
- [ ] Expedition generator stays v2 and current materialized boards stay deterministic.
- [ ] Expedition ruleset is v3.
- [ ] No dynamic state or HPA-493 machinery was introduced early.
