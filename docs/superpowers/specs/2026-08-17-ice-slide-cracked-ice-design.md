# Ice Slide Cracked Ice and Stateful Solver — Design

- **Date:** 2026-08-17
- **Issue:** HPA-493 — Add cracked-ice dynamic state and stateful solver support
- **Status:** Draft for review

## 1. Summary

HPA-493 adds Ice Slide's first board mechanic whose future behavior depends on earlier movement. Authored `F` cells are fragile ice: the first traversal is safe, the tile collapses only after the player leaves it, and later entry into that collapsed location causes the same fall/reset outcome as a hazard.

The implementation should stay local to the existing Ice Slide seams. Runtime grid state remains authoritative; the existing full-grid Undo snapshot and `loadLevel()` reconstruction already provide the right restoration boundaries. The production solver gains only the missing dynamic-state identity needed to distinguish otherwise identical player/crystal states with different collapsed fragile cells.

No generic dynamic-tile framework, ability system, immutable-board rewrite, or new persistence contract is introduced.

## 2. Current Baseline

HPA-493 starts from current `main` after HPA-491 and HPA-492:

- `types.ts` already has the versioned run/stage contracts and immutable `snow` cell type.
- `physics.ts::slide()` is the single movement transition shared by runtime and solver.
- `game.ts` owns the live mutable grid, reconstructs an authored stage through `loadLevel()`, and stores one full-grid Expedition Undo snapshot.
- `solver.ts` performs bounded BFS over player position and crystal consumption while carrying a cloned mutable grid per queued state.
- hazard outcomes are not queued by the solver, so deliberate falls/resets are already excluded from solver-valid solutions.
- `renderer.ts::drawCell()` is compile-time exhaustive over `CellType`.
- stage signatures hash final authored rows plus par/objective/scoring metadata; runtime board mutations are not part of stage identity.
- Expedition generator/ruleset v2 content currently contains no fragile ice.

These boundaries are retained.

## 3. Product Semantics

### 3.1 Authored and runtime states

Add:

```ts
CellType = ... | 'fragile' | 'collapsed'
```

and authored glyph:

```text
F -> fragile
```

`collapsed` is runtime-only. It has no glyph in `GLYPH_TO_CELL`, checked-in stage rows, templates, fallbacks, run definitions, or stage signatures.

### 3.2 Collapse timing

Fragile ice follows one precise transition rule:

1. Entering intact `fragile` is safe.
2. A fragile cell collapses only when a committed slide step leaves that cell.
3. If a slide ends on fragile ice, the occupied tile remains intact.
4. A later committed move that successfully leaves the occupied fragile tile collapses it.
5. A blocked/no-op input while standing on fragile ice does not collapse it because the player did not leave.
6. A fragile cell traversed in the middle of a longer slide collapses as soon as the next step exits it.
7. Entering `collapsed` returns the existing hazard/fall outcome.

Collapse is therefore part of movement physics, not a post-move `IceSlideGame` patch.

### 3.3 Hazard and reset behavior

When a move enters `collapsed`:

- the move counts as a committed hazard move under the existing runtime rules;
- existing fall/reset counters and callbacks apply unchanged;
- `loadLevel()` reconstructs the stage from authored rows, so every `F` returns intact;
- crystals and other attempt-local grid mutations reset through the same path.

Manual Reset uses the same authored reconstruction and therefore restores all fragile cells to intact state.

## 4. Physics Contract

`physics.slide()` remains the single transition authority.

Extend successful and hazard outcomes with the fragile cells collapsed during that attempted move, for example:

```ts
collapsed: GridPosition[]
```

This keeps the dynamic transition observable to tests and lets the solver update its compact collapsed-state identity without rescanning the full board after every transition.

The movement loop applies collapse immediately before leaving the current cell for a valid next step:

- if the current runtime cell is `fragile`, mutate it to `collapsed` and record its position;
- then enter the next cell and apply its normal behavior;
- if the next cell is `collapsed`, return the hazard outcome;
- snow still stops on entry;
- crystals still become ice on collection;
- goals still end the slide.

The initial blocked/no-op check happens before any collapse mutation. This preserves intact fragile ice on failed inputs.

No separate fragile transition is implemented in `game.ts` or `solver.ts`.

## 5. Runtime State, Reset, and Undo

### 5.1 Live state

`IceSlideState.grid` continues to be the authoritative runtime board. Dynamic state is represented explicitly by `fragile -> collapsed` mutations in this cloned runtime grid rather than by rewriting immutable `IceSlideStageDefinition.rows`.

`getState()` already clones the grid, so callers receive an isolated snapshot containing exact fragile/collapsed state.

### 5.2 Undo

Do not add a new dynamic-state field to `IceSlideUndoSnapshot`.

The HPA-491 snapshot already contains the complete pre-move grid. Restoring that grid restores:

- consumed crystals;
- intact fragile tiles;
- collapsed fragile tiles;
- player position.

Existing HPA-491 accounting remains unchanged:

- Undo consumes one charge;
- total/stage move counters are not decremented;
- Undo is unavailable after a hazard/reset because `loadLevel()` clears the snapshot.

Tests must prove an Expedition Undo restores the exact pre-move fragile/collapsed grid, not merely the player position.

### 5.3 Stage reload

`loadLevel()` continues to parse immutable authored rows for every fresh stage attempt. No reset-specific fragile bookkeeping is required.

This is the only restoration mechanism needed for manual Reset, hazard reset, fresh Start, Retry Seed, and stage changes.

## 6. Stateful Solver

### 6.1 State identity

The current solver key is insufficient once board traversal can change future hazards. Two states may have the same player position and crystal mask but different future movement because different fragile cells have collapsed.

At solve start:

- enumerate authored fragile positions in deterministic row-major order;
- assign each position a bit index;
- initialize `collapsedMask = 0n`.

Extend `SolverState` with:

```ts
collapsedMask: bigint
```

and key states by:

```text
row,col,crystalMask,collapsedMask
```

using a stable string representation such as hexadecimal for the BigInt mask.

BigInt avoids adding an arbitrary fragile-tile count ceiling solely for representation convenience.

### 6.2 Solver transitions

The solver still calls shared `slide()` on a cloned grid.

For every `moved` outcome:

- update `collapsedMask` from `outcome.collapsed` using the deterministic fragile-position index;
- derive crystal state as today;
- use player position + crystal mask + collapsed mask for visited-state identity;
- queue the resulting cloned grid and mask.

For `hazard` outcomes:

- do not queue a reset state;
- discard the mutated transition grid exactly as existing hazard transitions are discarded.

This deliberately means the solver cannot solve a puzzle by falling onto a hazard/collapsed cell to reset the board. Manual Reset and Undo are likewise absent from solver transitions. A generated candidate requiring any of those recovery actions remains invalid.

### 6.3 State-cap behavior

The existing bounded BFS limit remains authoritative. A stateful board may increase explored states, but HPA-493 does not add adaptive caps, caching, heuristics, or a second solver.

If the cap is reached:

- return `truncated=true`;
- do not claim solvability or a valid par;
- let the existing quality/generator rejection path reject the candidate.

## 7. Quality and Generation

`validateIceSlideStageQuality()` continues to rely on the production solver. No fragile-specific quality framework is added.

A candidate containing `F` is acceptable only when the normal quality checks pass with the stateful solver, including a fall/reset/Undo-free route to the goal and assigned objectives.

HPA-493 does **not** add `F` to existing Campaign levels, Daily generation, Expedition templates, or deterministic fallbacks. That keeps the mechanic implementation independent from content/balance work.

A future content slice that first changes seeded generated rows to include `F` must own the corresponding generator-version bump and new deterministic goldens.

## 8. Signatures and Versions

### 8.1 Stage signatures

No signature schema change is needed.

`createIceSlideStageSignature()` already hashes authored final row strings. Therefore:

- authored `F` naturally changes the signature versus `.`;
- runtime `collapsed` state never changes a stage signature;
- Undo/reset does not resign a stage;
- route-choice signature behavior remains unchanged.

### 8.2 Ruleset and generator versions

HPA-493 adds physics support without reauthoring any currently materialized Campaign, Daily, or Expedition board to contain fragile ice.

Therefore this slice does not bump existing generator or ruleset constants merely because the engine can parse `F`. Current seeds and currently materialized rows retain identical behavior because they contain no fragile cells.

The first later slice that places `F` into a versioned generated content set must bump that content's generator version. A ruleset bump is required when a shipped/competitive versioned run can actually contain fragile ice and the new physics changes that run's meaning.

This follows HPA-492's narrow content/version boundary rather than producing a version change with no changed materialized content.

## 9. Renderer and Accessibility

Keep rendering local to `renderer.ts` and preserve the exhaustive `CellType` switch.

Add two static, non-color-only treatments:

- `fragile`: normal ice base plus obvious crack strokes/segments;
- `collapsed`: a broken/hollow surface treatment distinct from intact ice and from the existing circular hazard marker.

The player remains visible while standing on intact fragile ice. Because collapse occurs only after exit, the renderer never needs a special "occupied collapsed" state.

No animation subsystem is added. Static geometry is sufficient and avoids reduced-motion branching.

A focused renderer test should lock the distinct primitive paths, plus one manual supported-cell-size visual check should confirm fragile/collapsed/ice/hazard/player remain distinguishable.

## 10. Browser Integration

Keyboard and swipe input continue through the existing `IceSlideGame.move()` entry point, so there is no fragile-specific input code.

Browser coverage should exercise the mechanic through a small deterministic fixture run using the existing Ice Slide browser/game handle rather than reauthoring production Expedition templates solely for E2E setup.

The browser scenario should prove at least:

1. a keyboard move traverses or stops on intact fragile ice;
2. a later committed exit exposes collapsed runtime state;
3. later entry causes the existing fall/reset path;
4. reset returns the authored fragile cell to intact state.

If direct fixture injection through the current browser handle cannot keep renderer/HUD lifecycle authoritative, prefer the smallest test-only existing seam available in the current test harness; do not add a production query parameter, debug mode, or generic fixture registry for HPA-493.

## 11. Testing Strategy

### 11.1 Physics

Add focused fixtures for:

- entering fragile ice safely;
- stopping on fragile leaves the occupied tile intact;
- leaving a previously occupied fragile tile collapses it;
- passing through fragile collapses it after exit;
- no-op from fragile does not collapse it;
- entering collapsed returns hazard;
- crystal/snow/goal ordering remains correct when fragile tiles appear on the same route;
- collapse positions in move outcomes are deterministic and ordered by traversal.

### 11.2 Solver

Add fixtures proving:

- runtime physics and solver agree on endpoints and collapse transitions;
- two states with identical position/crystal mask but different collapsed masks are explored independently;
- the stateful solver finds the true minimum par for representative fragile puzzles;
- a puzzle solvable only by deliberate fall/reset is rejected;
- truncation remains fail-closed;
- boards without `F` preserve existing solver results and Campaign pars.

### 11.3 Game lifecycle

Add tests proving:

- `getState()` isolates fragile/collapsed grids;
- manual Reset restores authored `F` state;
- collapsed entry uses the existing hazard counters/callback/reset behavior;
- Undo restores the exact pre-move dynamic grid while retaining move cost and consuming one charge;
- Campaign/Daily and existing Expedition fixtures without `F` remain behavior-compatible.

### 11.4 Run and validation

Add tests proving:

- run validation accepts authored `F`;
- `collapsed` cannot be authored because it has no glyph;
- stage signatures change when authored rows change to/from `F`;
- runtime collapse never mutates active-run rows or signatures;
- current deterministic Campaign/Daily/Expedition version/golden tests remain unchanged.

### 11.5 Renderer and E2E

Add:

- renderer primitive assertions for `fragile` and `collapsed`;
- compile-time exhaustiveness remains intact;
- one browser mechanic/reset scenario through real keyboard/game lifecycle;
- full existing Ice Slide browser coverage to catch HPA-491/HPA-492 regressions.

## 12. Implementation Shape

The expected implementation is five reviewable TDD slices:

1. **Contracts + shared physics** — add `F`, runtime `collapsed`, collapse-aware slide outcomes, and focused physics tests.
2. **Stateful solver + quality** — add deterministic fragile indexing/BigInt collapsed mask, state-key regression fixtures, deliberate-reset rejection, and quality coverage.
3. **Runtime restoration** — lock `getState()`, hazard/manual Reset, Undo, immutable run/signature behavior, and no-fragile compatibility.
4. **Renderer** — add static cracked/collapsed visuals and exhaustive renderer tests/manual size check.
5. **Browser + full regression gates** — exercise the mechanic through the real input/runtime lifecycle and run existing content/type/lint/unit/E2E validation.

The detailed command-by-command implementation plan is intentionally written only after this design is reviewed.

## 13. Scope Boundaries

Do not add:

- a dynamic-tile registry or generic tile state machine;
- separate mutable board-history storage outside the runtime grid;
- multi-step Undo history;
- new abilities or recovery actions;
- Campaign/Daily/Expedition content reauthoring;
- a new generator family or new fallbacks;
- adaptive solver limits, A*, memoization service, worker, or cache;
- database/API/leaderboard changes;
- run resume after refresh;
- a schema-version bump;
- backward-compatibility handling for unreleased fragile content.

## 14. Risks and Mitigations

### State-key omission

**Risk:** Solver merges states that look position-equivalent but have different collapsed paths.

**Mitigation:** Explicit `collapsedMask` is part of every visited key, with a regression fixture constructed around same-position/different-mask states.

### Runtime/solver drift

**Risk:** Fragile transition logic is implemented twice.

**Mitigation:** Only `physics.slide()` mutates fragile state; both runtime and solver consume that function.

### Accidental reset-solvable acceptance

**Risk:** A board appears solvable only because fall/reset behavior is modeled as progress.

**Mitigation:** Hazard outcomes remain unqueued, and solver transitions contain neither Reset nor Undo.

### Version churn without content change

**Risk:** Generator/ruleset versions change even though existing deterministic rows do not.

**Mitigation:** No version bump until versioned materialized content actually contains `F` or its interpretation changes.

## 15. Acceptance Criteria

HPA-493 is complete when:

- authored `F` parses as intact fragile ice and runtime-only `collapsed` cannot be authored;
- fragile traversal and collapse timing match Section 3.2 exactly;
- entering collapsed ice follows the normal hazard/reset path;
- manual Reset and hazard reset restore all authored fragile tiles intact;
- Expedition Undo restores exact pre-move fragile/collapsed state without refunding move cost;
- solver state identity includes a deterministic collapsed-tile mask and distinguishes same-position/different-mask states;
- solver and runtime agree on representative endpoints, collapse transitions, solvability, and minimum pars;
- candidates requiring deliberate fall/reset or Undo remain rejected;
- stage signatures describe authored runs, not live collapsed state;
- existing content without `F` remains behavior-compatible and deterministic version constants/goldens stay unchanged;
- fragile and collapsed visuals are distinguishable without relying on color alone;
- focused physics, solver, quality, lifecycle, renderer, validation, and browser tests pass along with the existing Ice Slide regression suite.

## 16. Spec Self-Review

- **Placeholder scan:** no TBD/TODO or unresolved product decision remains.
- **Consistency:** runtime grid is the sole mutable dynamic-state authority; solver carries an equivalent compact identity but still uses shared physics transitions.
- **Scope:** one new mechanic plus the solver state necessary to validate it; no content/balance work is pulled forward.
- **Ambiguity:** collapse timing, no-op behavior, resets, Undo, hazard semantics, signatures, and version ownership are explicit.
