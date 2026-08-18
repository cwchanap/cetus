# Ice Slide Cracked Ice and Stateful Solver — Design

- **Date:** 2026-08-17
- **Issue:** HPA-493 — Add cracked-ice dynamic state and stateful solver support
- **Status:** Draft for review

## 1. Summary

HPA-493 adds authored `F` / `fragile` ice. Entering intact fragile ice is safe; the cell collapses only after the player leaves it, and later entry into the collapsed location behaves like the existing hazard/fall path.

The change stays inside existing Ice Slide seams:

- `physics.slide()` owns the transition;
- `IceSlideState.grid` remains the live dynamic-board authority;
- HPA-491's full-grid Undo snapshot restores fragile state without new fields;
- `loadLevel()` restores authored `F` for manual/hazard reset;
- the production BFS keeps shared `slide()` and adds collapsed state to visited identity.

No dynamic-tile framework, second physics path, or parallel runtime state is needed.

## 2. Fixed Semantics

Extend `CellType` with:

```ts
| 'fragile'
| 'collapsed'
```

and add only this authored mapping:

```text
F -> fragile
```

`collapsed` is runtime-only and has no glyph. Update the `IceSlideLevel.rows` alphabet comment to include `F`.

### Leave-then-enter rule

Preserve the current `slide()` control flow:

1. Run the existing initial blocked/no-op check before any mutation.
2. In the loop, compute the next position.
3. If the next step is out of bounds or blocking, stop normally; do not collapse the current cell.
4. If the next step is valid and the current cell is `fragile`, mutate the current cell to `collapsed`.
5. Enter the next cell and append it to the path.
6. Apply the current terminal order, with collapsed sharing the hazard branch:
   - snow stop;
   - hazard or collapsed fall;
   - crystal consume;
   - goal clear.

Consequences:

- stopping on fragile leaves it intact;
- a blocked/no-op input while standing on fragile leaves it intact;
- a later valid move collapses the fragile cell as it is exited;
- pass-through fragile cells collapse during the same slide;
- entering collapsed returns the existing hazard outcome.

`SlideOutcome` stays unchanged. Tests and solver observe the mutated cloned grid directly.

### Hazard commit rule

`slide()` may mutate fragile/crystal cells before a later hazard is reached in the same attempted move. Existing callers already discard that attempted grid:

- runtime hazard handling calls `loadLevel()` and reparses authored rows;
- solver hazard transitions are not queued.

Therefore same-slide collapse followed by a fall does not permanently spend the fragile tile, matching current crystal rollback behavior.

## 3. Runtime, Reset, and Undo

`IceSlideState.grid` remains the only live dynamic state.

No new field is added to `IceSlideUndoSnapshot`. Its existing full-grid clone already captures intact/collapsed cells along with consumed crystals and player position.

Existing lifecycle behavior remains authoritative:

- manual Reset -> `loadLevel()` -> authored `F` restored;
- hazard -> existing counters/callback -> `loadLevel()` -> authored `F` restored;
- Undo -> pre-move grid restored, charge consumed, move counters retained;
- fresh Start / Retry Seed / stage change -> authored rows reparsed.

`getState()` continues to clone the grid, so no fragile-specific clone path is required.

## 4. Stateful Solver

### 4.1 State identity

During the solver's existing initial scan, collect authored fragile positions in row-major order alongside start/goal/crystals.

Extend queued state with:

```ts
collapsedMask: bigint
```

and extend the visited key from:

```text
row,col,crystalMask
```

to:

```text
row,col,crystalMask,collapsedMask
```

The initial mask is `0n`.

Keep `bigint`; do not add a `MAX_FRAGILE_BITS = 30` representation cap. The existing 30-bit crystal limit comes from that mask's number/bitwise representation, not from the BFS state cap. More than 30 fragile cells does not imply more than 10,000 reachable states—a constrained board can traverse many fragile cells while exposing only a small reachable subset. An arbitrary fragile-count rejection would therefore reject valid boards for implementation convenience.

The extra BigInt work is bounded by the existing solver state cap and sits beside per-transition grid cloning/scanning; there is no profile justifying a narrower representation.

### 4.2 Derive mask from the grid

After each successful `slide()` on a cloned grid, rebuild collapsed identity from the known fragile positions, matching the existing crystal-mask pattern:

```ts
let collapsedMask = 0n
for (let i = 0; i < fragilePositions.length; i++) {
    const pos = fragilePositions[i]
    if (grid[pos.row][pos.col] === 'collapsed') {
        collapsedMask |= 1n << BigInt(i)
    }
}
```

Do not add a collapsed-position delta to `SlideOutcome`.

The load-bearing solver test must reach the same player position with the same crystal mask but different collapsed masks and prove both states are explored independently.

### 4.3 State budget

Keep the current fixed state cap and fail-closed truncation. Do not add adaptive limits, A*, caching, or another solver.

The review correctly identifies one missing feasibility signal: future content needs evidence that representative fragile density fits the existing budget. Add characterization fixtures in `solver.test.ts` around roughly **4** and **8** fragile cells. They should:

- solve under the existing cap without truncation;
- record `exploredStates` as diagnostic evidence during implementation;
- avoid freezing an exact explored-state count as a compatibility contract.

Exact counts are fixture- and solver-order-dependent, so they should inform the later content slice rather than become a brittle engine invariant.

Hazard, Reset, and Undo remain absent from solver transitions. A candidate requiring deliberate recovery actions remains invalid.

## 5. Content, Objectives, Signatures, and Versions

HPA-493 adds engine support only. Existing materialized content remains unchanged.

Keep these gates closed:

- Expedition `template.baseRows` remains restricted to `#`, `.`, `S`;
- generator placement remains `G` / `O` / `H` / `C` onto `.`;
- Campaign/Daily/Expedition rows and fallbacks remain unchanged;
- current deterministic generator goldens remain unchanged;
- `no_falls` feasibility remains keyed to authored `H` only.

Run validation automatically accepts `F` through `GLYPH_TO_CELL`; no `run.ts` production change is required for that acceptance.

Stage signatures continue to hash authored rows. Authored `F` therefore affects a signature normally, while runtime `collapsed` never resigns a stage.

Do not bump generator/ruleset versions in HPA-493 because no currently versioned materialized row contains `F`. The future content slice that first emits `F` owns any required generator/ruleset bump and golden updates.

## 6. Renderer and Input

### Renderer

Land the final renderer once, in the same slice as the `CellType` extension so every commit typechecks:

- add `COLORS.fragile` / `COLORS.collapsed`;
- add final exhaustive `drawCell()` cases immediately;
- `fragile`: ice-like base plus visible crack geometry;
- `collapsed`: broken/hollow geometry distinct from ice and the circular hazard marker.

Do not add placeholder cases that are replaced in a later slice. Add focused primitive assertions in `renderer.test.ts` and one manual check at the existing `CELL_SIZE = 48`.

No animation, texture, filter, sprite, or reduced-motion branch is needed.

### Keyboard integration

There is no fragile-specific input code. Reuse the existing snow-sized `init.test.ts` seam:

1. inject a signed synthetic Expedition run containing `F`;
2. start Expedition;
3. dispatch one real keyboard event;
4. assert the player reaches/stops on fragile.

Do not repeat collapse/hazard/reset state-machine assertions through the DOM; those belong in `game.test.ts` where they are faster and clearer.

Keep existing `e2e/games/play-coverage.spec.ts` unchanged as the Campaign/Daily/Expedition regression gate. Do not add a fixture query, debug mode, or new handle API.

## 7. Tests

### Contracts / physics / renderer

Cover:

- `F` parses to `fragile`;
- entering/stopping on fragile is safe;
- valid leave and pass-through collapse the exited cell;
- no-op/blocked leave does not collapse;
- collapsed entry returns hazard;
- terminal ordering remains snow -> hazard/collapsed -> crystal -> goal;
- same-slide collapse + later hazard is discarded by normal caller reset behavior;
- renderer distinguishes fragile/collapsed without color alone;
- renderer switch remains compile-time exhaustive.

### Solver / quality / run

Cover:

- same-position/same-crystal/different-collapsed states are distinct;
- collapsed mask is rebuilt from the post-slide grid;
- representative fragile pars are correct;
- fall/reset-required puzzles are rejected;
- truncation remains fail-closed;
- 4- and 8-fragile characterization fixtures complete under the current cap;
- quality consumes the stateful solver result;
- run validation accepts authored `F`;
- boards without `F` preserve existing pars/results/goldens.

### Game / input

Cover:

- manual Reset restores authored `F`;
- collapsed entry uses existing hazard counters/callback/reload;
- Undo restores exact pre-move grid while retaining move cost;
- `getState()` remains isolated;
- runtime collapse does not mutate run rows/signatures;
- one keyboard event reaches/stops on `F` through the existing `init.test.ts` seam.

## 8. Implementation Shape

Use three reviewable TDD slices:

1. **Contracts + physics + final renderer**
   - `types.ts`
   - `physics.ts` / `physics.test.ts`
   - `renderer.ts` / `renderer.test.ts`
   - final crack/hollow geometry and single 48px manual check

2. **Stateful solver + quality/run parity**
   - `solver.ts` / `solver.test.ts`
   - `quality.test.ts`
   - `run.test.ts`
   - same-position/different-mask regression
   - 4/8-fragile state-budget characterization

3. **Runtime restoration + keyboard wiring**
   - `game.test.ts` with existing `game.ts` state machinery unchanged
   - one compact `init.test.ts` keyboard proof
   - full regression gates

The detailed implementation plan follows only after this revised design is approved.

## 9. Scope Boundaries

Do not add a tile registry, parallel dynamic-state field, collapsed outcome delta, new Undo field/history, fragile-specific reset hook, new ability, content rebalance, template-gate widening, objective framework, browser fixture API, solver architecture, database/API change, or schema migration.

## 10. Acceptance Criteria

HPA-493 is complete when:

- authored `F` and runtime-only `collapsed` follow the leave-then-enter semantics above;
- Reset, hazard reload, and Undo restore the correct fragile state using existing grid reconstruction/snapshots;
- solver visited identity includes collapsed state derived from the post-slide grid;
- same-position/different-collapse states are not merged;
- representative fragile boards fit the current solver budget and deliberate-reset solutions remain rejected;
- signatures/versions/content without `F` remain unchanged;
- final fragile/collapsed visuals are non-color-only and exhaustive;
- focused Ice Slide tests, typecheck, lint, and existing Ice Slide Playwright regression coverage pass.
