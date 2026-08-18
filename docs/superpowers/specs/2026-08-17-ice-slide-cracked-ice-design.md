# Ice Slide Cracked Ice and Stateful Solver — Design

- **Date:** 2026-08-17
- **Issue:** HPA-493 — Add cracked-ice dynamic state and stateful solver support
- **Status:** Draft for review

## 1. Summary

HPA-493 adds Ice Slide's first board mechanic whose future behavior depends on earlier movement. Authored `F` cells are fragile ice: entering them is safe, they collapse only after the player leaves them, and a later entry into the collapsed location causes the same fall/reset outcome as a hazard.

The implementation stays local to existing Ice Slide seams:

- `physics.slide()` remains the only movement-transition authority;
- `IceSlideState.grid` remains the only live dynamic-board authority;
- the existing HPA-491 full-grid Undo snapshot restores dynamic state without new fields;
- `loadLevel()` restores authored `F` state for Reset and hazard reload;
- the production solver still calls shared `slide()`, but its visited identity gains a collapsed-fragile mask derived from the post-slide cloned grid.

No tile registry, second solver transition, game-level post-move patch, parallel dynamic-state field, or generic fragile-quality framework is introduced.

## 2. Current Baseline

HPA-493 starts from current `main` after HPA-491 and HPA-492:

- `types.ts` owns the closed cell/glyph contract, including immutable `snow`.
- `physics.ts::slide()` is shared by runtime and solver.
- `game.ts` owns the mutable runtime grid, reconstructs authored stages through `loadLevel()`, and stores one full-grid Expedition Undo snapshot.
- `solver.ts` performs bounded BFS while carrying a cloned mutable grid per queued state. It already rebuilds crystal identity by scanning known authored crystal positions after each successful slide.
- hazard outcomes are not queued by the solver, so deliberate falls/resets are already excluded from solver-valid solutions.
- `renderer.ts` has `COLORS: Record<CellType, number>` and a compile-time-exhaustive `drawCell()` switch.
- `init.test.ts` already injects a synthetic Expedition run and dispatches real keyboard events for snow integration coverage.
- stage signatures hash final authored rows plus par/objective/scoring metadata; runtime board mutations are not stage identity.
- Expedition generator/ruleset v2 materialized content contains no fragile ice.

These boundaries are retained.

## 3. Product Semantics

### 3.1 Authored and runtime states

Extend `CellType` with:

```ts
| 'fragile'
| 'collapsed'
```

and add the authored mapping:

```text
F -> fragile
```

`collapsed` is runtime-only. It has no glyph in `GLYPH_TO_CELL`, checked-in rows, templates, fallbacks, run definitions, or stage signatures.

Update the `IceSlideLevel.rows` alphabet comment to include `F` alongside the existing `# . S G O H C N` glyphs.

### 3.2 Collapse timing

Fragile ice follows one precise leave-then-enter rule:

1. Keep the existing initial blocked/no-op return before any mutation.
2. During the slide loop, calculate the next position.
3. If the next position is out of bounds or blocking, stop normally without mutating the current fragile cell.
4. Only when the next step is in bounds and non-blocking, if the **current** runtime cell is `fragile`, mutate that current cell to `collapsed`.
5. Enter the next cell and append it to the path.
6. Apply the existing terminal ordering: snow stop -> hazard fall -> crystal consume -> goal clear, treating `collapsed` with the same hazard return as `hazard`.

Consequences:

- Entering intact fragile ice is safe.
- Stopping on fragile because the next step is blocked/out of bounds leaves the occupied cell intact.
- A blocked/no-op input while standing on fragile leaves it intact.
- A later committed move that successfully exits the occupied fragile cell collapses it before entering the next cell.
- A fragile cell traversed in the middle of a longer slide collapses when the following valid step exits it.
- A later entry into `collapsed` returns the existing hazard outcome.

Collapse is therefore part of `slide()` only. There is no `game.ts` post-move patch and no solver-only fragile transition.

### 3.3 Commit and hazard discard semantics

`slide()` mutates the cloned grid while resolving one attempted move, just as crystal collection already does.

For `kind: 'moved'`, that mutated grid remains the caller's new runtime/solver state.

For `kind: 'hazard'`:

- `IceSlideGame.move()` follows the existing hazard path and calls `loadLevel()`, discarding the attempted grid and reconstructing the authored stage;
- the solver continues to discard the cloned hazard-transition grid rather than queueing it.

Therefore a move that collapses fragile ice and then falls later in the same slide does **not** permanently spend that fragile tile. The stage reload restores it, matching the existing crystal-on-the-way-to-hazard rollback behavior.

Manual Reset likewise reconstructs the authored grid and restores every fragile cell intact.

## 4. Physics Contract

`physics.slide()` remains the single transition authority and **keeps its existing `SlideOutcome` shape**.

Do not add `collapsed: GridPosition[]` or another transition-delta channel. The live cloned grid is already the authoritative result of a successful slide, and callers that need dynamic identity must derive it from that grid.

The implementation rule is equivalent to:

```ts
// Existing initial noop check runs before this loop.
while (true) {
    const nr = row + direction.row
    const nc = col + direction.col

    if (outOfBounds(nr, nc) || isBlocking(grid[nr][nc])) {
        return movedAtCurrentPosition()
    }

    if (grid[row][col] === 'fragile') {
        grid[row][col] = 'collapsed'
    }

    row = nr
    col = nc
    path.push({ row, col })

    const next = grid[row][col]
    if (next === 'snow') return movedOnSnow()
    if (next === 'hazard' || next === 'collapsed') return hazard()
    if (next === 'crystal') consumeCrystal()
    if (next === 'goal') return reachedGoal()
}
```

The exact production code should preserve the current helper/return structure rather than introduce new abstractions solely to resemble this pseudocode.

Physics tests assert the mutated grid directly, including the load-bearing sequence "stop on `F`, then leave it." No full-board outcome delta is introduced for test observability.

## 5. Runtime State, Reset, and Undo

### 5.1 Live state

`IceSlideState.grid` remains the authoritative live board. Dynamic state is represented by in-grid `fragile -> collapsed` mutation, the same broad model already used for `crystal -> ice` consumption.

Do not add a separate collapsed-position collection, bitset, or dynamic-state property to `IceSlideState`.

`getState()` already clones the grid, so callers receive an isolated snapshot of the exact fragile/collapsed state.

### 5.2 Undo

Do not extend `IceSlideUndoSnapshot`.

The HPA-491 snapshot already contains the complete pre-move grid plus player/crystal counters. Restoring that grid restores:

- consumed crystals;
- intact fragile cells;
- collapsed fragile cells;
- player position.

Existing HPA-491 accounting remains unchanged:

- Undo consumes one charge;
- total/stage move counters are not decremented;
- Undo is unavailable after a hazard/reset because `loadLevel()` clears the snapshot.

Tests prove exact grid restoration, not a new dynamic-state API.

### 5.3 Stage reload

`loadLevel()` continues to parse immutable authored rows for every fresh attempt. No fragile-specific reset hook or bookkeeping is required.

The same reconstruction covers manual Reset, hazard reset, fresh Start, Retry Seed, and stage changes.

## 6. Stateful Solver

### 6.1 Deterministic fragile indexing

During the solver's existing initial board scan, collect authored `fragile` positions in deterministic row-major order, alongside the current start/goal/crystal discovery.

Do not impose the crystal mask's 30-bit ceiling on fragile tiles. Fragile state uses `bigint`.

### 6.2 State identity

Two solver states may share player position and crystal mask while having different future routes because different fragile cells have collapsed.

Extend `SolverState` with:

```ts
collapsedMask: bigint
```

and extend visited identity from:

```text
row,col,crystalMask
```

to:

```text
row,col,crystalMask,collapsedMask
```

using a stable BigInt string representation such as hexadecimal.

The initial mask is `0n` because authored `F` parses as intact `fragile`.

### 6.3 Derive state from the cloned grid

After every `kind: 'moved'` transition, rebuild `collapsedMask` by scanning the known authored fragile positions on the **post-`slide()` cloned grid**, mirroring the solver's existing crystal-mask reconstruction pattern.

Conceptually:

```ts
let collapsedMask = 0n
for (let i = 0; i < fragilePositions.length; i++) {
    const fragile = fragilePositions[i]
    if (grid[fragile.row][fragile.col] === 'collapsed') {
        collapsedMask |= 1n << BigInt(i)
    }
}
```

Do not derive visited identity from a new `SlideOutcome` delta. The mutated grid is the physics result and therefore the source of truth for both crystal and fragile state.

### 6.4 Solver transitions

The solver continues to:

- clone the queued state's grid;
- call shared `slide()`;
- ignore `noop`;
- discard `hazard` outcomes without queueing a reset state;
- rebuild crystal state from the post-slide grid;
- rebuild collapsed state from the post-slide grid;
- key/enqueue successful states by position + crystal mask + collapsed mask.

Reset and Undo remain absent from solver transitions. A board that reaches the goal only through deliberate fall/reset cycles or Undo therefore remains solver-invalid.

### 6.5 State-cap behavior

The existing bounded BFS cap remains authoritative. HPA-493 does not add adaptive limits, heuristics, caching, A*, a second solver, or a worker.

If the cap is reached, the solver continues to fail closed:

- `truncated = true`;
- no solvability/par claim;
- existing quality/generator validation rejects the candidate.

## 7. Quality, Objectives, and Closed Content Gates

`validateIceSlideStageQuality()` continues to rely on the production solver. No fragile-specific quality layer is added.

A direct test candidate containing `F` is acceptable only when the normal quality checks pass under the stateful solver.

HPA-493 deliberately leaves the existing content gates closed:

- run validation accepts authored `F` through the shared `GLYPH_TO_CELL` contract;
- `templates.ts` keeps the Expedition `baseRows` alphabet restricted to `#`, `.`, and `S`;
- `generator.ts` continues to place only `G`, `O`, `H`, and `C` onto authored `.` slots;
- Campaign levels, Daily pools, Expedition templates, and deterministic fallbacks remain unchanged;
- current generator goldens remain unchanged.

`getIceSlideObjectiveFeasibility()` also remains unchanged. In particular, `no_falls` eligibility continues to key off authored `H`, not `F`. Because HPA-493 does not generate fragile content, broadening objective eligibility now would be speculative. The future content slice that actually introduces generated `F` can decide whether fragile hazards should influence objective eligibility.

## 8. Signatures and Versions

### 8.1 Stage signatures

No signature schema change is needed.

`createIceSlideStageSignature()` already hashes authored final rows. Therefore:

- authored `F` naturally changes a stage signature versus `.`;
- runtime `collapsed` state never changes a stage signature;
- Undo/reset never resigns the stage;
- route-choice signature behavior remains unchanged.

### 8.2 Generator and ruleset versions

HPA-493 adds engine support without changing any currently materialized Campaign, Daily, or Expedition row to contain fragile ice.

Therefore this slice does not bump existing generator/ruleset constants. Current seeds still materialize the same rows and those rows still behave identically.

The first future content slice that widens an authored/template gate and causes versioned generated rows to contain `F` owns:

- the affected generator-version bump and deterministic golden updates; and
- any ruleset-version bump required once a shipped/versioned run can actually exercise fragile physics.

Do not create a version bump merely because the engine can parse `F`.

## 9. Renderer and Accessibility

Keep rendering local to `renderer.ts` and retain compile-time exhaustiveness.

Final visual treatments are static and non-color-only:

- `fragile`: normal ice base plus visible crack strokes/segments;
- `collapsed`: a broken/hollow surface distinct from ice and the circular hazard marker.

No animation, sprite, texture, filter, or reduced-motion subsystem is added.

### 9.1 Type-checkable commit boundary

Adding `'fragile' | 'collapsed'` to `CellType` makes both `COLORS: Record<CellType, number>` and the exhaustive `drawCell()` switch incomplete.

Therefore the contracts/physics commit must also add:

- `COLORS.fragile` and `COLORS.collapsed` keys; and
- explicit `fragile` / `collapsed` `drawCell()` cases sufficient to keep the switch exhaustive and typecheck green.

Those first cases may reuse the existing ice/base primitive path. The later renderer slice replaces them with the final crack/hollow geometry and its focused primitive assertions.

One manual check at the existing `CELL_SIZE = 48` confirms fragile/collapsed/ice/hazard/player remain distinguishable.

## 10. Input Integration and Browser Regression

There is no fragile-specific keyboard or swipe production code. Both continue through the existing input mapper into `IceSlideGame.move()`.

Do **not** add a Playwright-only fixture surface, query parameter, debug mode, fixture registry, or new `IceSlideHandle.start(run)` API.

Use the existing `init.test.ts` synthetic Expedition-run seam already used by the snow keyboard test:

1. create a tiny signed test run containing `F`;
2. mock `createIceSlideExpeditionRunDefinition()` to return it;
3. `handle.start('expedition')`;
4. dispatch real `KeyboardEvent` direction input;
5. prove stop-on-fragile, committed leave/collapse, collapsed re-entry hazard/reset, and authored `F` restoration through `handle.getGame()` state.

A compact fixture can force the sequence `E -> S -> N`: east stops on `F`, south exits and collapses it, north re-enters the collapsed location and triggers the existing hazard/reset path.

Keep `e2e/games/play-coverage.spec.ts` unchanged as the browser regression gate for existing Campaign/Daily/Expedition, HPA-491 Undo/route-choice, and HPA-492 snow behavior. HPA-493 does not create a new production/test-only surface solely to inject fragile content into Playwright.

## 11. Testing Strategy

### 11.1 Contracts and physics

Cover:

- parser accepts `F` as `fragile`;
- `IceSlideLevel.rows` authoring contract documents `F`;
- entering fragile is safe;
- stop on fragile leaves it intact;
- a later valid leave mutates that cell to `collapsed`;
- pass-through fragile collapses after exit;
- blocked/no-op from fragile leaves it intact;
- entering `collapsed` returns hazard;
- snow -> hazard/collapsed -> crystal -> goal terminal ordering remains unchanged;
- same-slide collapse followed by hazard is discarded by the caller's normal reload path;
- tests assert the grid directly; `SlideOutcome` remains unchanged.

### 11.2 Solver and quality

The load-bearing solver regression constructs two reachable states with:

- the same player position;
- the same crystal mask;
- different collapsed-fragile masks.

The solver must explore them independently. This is the primary proof that the state-key bug is closed.

Also cover:

- collapsedMask is rebuilt from the post-slide cloned grid;
- representative fragile boards have correct minimum pars;
- a puzzle solvable only by deliberate fall/reset is rejected;
- truncation remains fail-closed;
- direct quality validation consumes the stateful solver result;
- boards without `F` preserve existing solver results and Campaign pars.

### 11.3 Game lifecycle

Cover without adding `game.ts` state machinery:

- `getState()` isolates fragile/collapsed grids;
- manual Reset reconstructs authored `F`;
- collapsed entry uses existing hazard counters/callback/reload behavior;
- HPA-491 Undo restores exact pre-move grid state while retaining move cost and consuming one charge;
- active run rows/signatures are not mutated by runtime collapse.

### 11.4 Run/content boundaries

Cover:

- run validation accepts authored `F`;
- `collapsed` remains unrepresentable in authored rows because it has no glyph;
- authored row changes to/from `F` change stage signatures normally;
- Expedition template `# . S` gate remains unchanged;
- generator placement behavior/goldens remain unchanged;
- `no_falls` objective feasibility remains H-based in this slice;
- deterministic Campaign/Daily/Expedition version freezes remain unchanged.

### 11.5 Renderer and input integration

Cover:

- `COLORS` and exhaustive `drawCell()` stay type-complete from the first contract commit;
- final `fragile` crack primitives are distinct;
- final `collapsed` hollow/broken primitives are distinct;
- manual 48px visual check;
- synthetic-run keyboard scenario in `init.test.ts` proves live movement/collapse/hazard/reset wiring;
- existing Playwright Ice Slide coverage remains green without a new fragile fixture API.

## 12. Implementation Shape

The detailed TDD plan should follow HPA-492's existing file/verification style and keep every commit type-checkable.

Expected slices:

1. **Contracts + shared physics**
   - `types.ts`
   - `physics.ts`
   - `physics.test.ts`
   - `renderer.ts` for `COLORS` and exhaustive temporary cases
   - outcome shape unchanged

2. **Stateful solver + quality/run parity**
   - `solver.ts`
   - `solver.test.ts`
   - `quality.test.ts`
   - `run.test.ts`
   - same-position/different-collapsed-mask fixture is the load-bearing check

3. **Runtime restoration + Undo proof**
   - `game.test.ts`
   - verify `game.ts` and `IceSlideUndoSnapshot` need no new dynamic-state fields

4. **Final renderer treatment**
   - `renderer.ts`
   - `renderer.test.ts`
   - static crack/hollow geometry plus 48px manual check

5. **Keyboard integration + regression gates**
   - `init.test.ts`
   - verify `init.ts` API remains unchanged
   - no fragile-specific Playwright fixture

The later implementation plan must use the same verification command family as HPA-492, including:

```bash
bun run test:run -- src/lib/games/ice-slide
bun run typecheck
bun run lint
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

It may add focused per-slice Vitest commands before these final gates. Existing deterministic/content validation commands remain part of the final regression pass where HPA-492 already uses them; do not invent duplicate version/golden checks.

## 13. Scope Boundaries

Do not add:

- a dynamic-tile registry or generic tile state machine;
- a second solver transition implementation;
- `game.ts` post-move fragile mutation;
- a parallel mutable dynamic-state field outside `IceSlideState.grid`;
- a collapsed-position delta on `SlideOutcome`;
- new fields on `IceSlideUndoSnapshot`;
- reset/Undo transitions in the solver;
- multi-step Undo history;
- new abilities or recovery actions;
- Campaign/Daily/Expedition content reauthoring;
- widening of Expedition template `# . S` base-row gates;
- changes to `no_falls` eligibility for fragile ice;
- a new generator family or new fallbacks;
- generator/ruleset bumps before materialized content contains `F`;
- adaptive solver limits, A*, memoization service, worker, or cache;
- a production/test-only browser fixture API;
- database/API/leaderboard changes;
- run resume after refresh;
- a schema-version bump;
- backward-compatibility handling for unreleased fragile content.

## 14. Risks and Mitigations

### State-key mismatch

**Risk:** Physics mutates one grid state while solver identity is advanced from a separate delta, allowing visited identity to disagree with the queued grid.

**Mitigation:** Derive both crystal and collapsed masks from the post-`slide()` cloned grid. The same-position/different-mask fixture locks the visited-key behavior.

### Leave/enter ordering error

**Risk:** Fragile collapses on landing, on a no-op, or after the terminal cell has already been processed.

**Mitigation:** Preserve the existing initial noop guard, collapse only the current cell immediately before an in-bounds non-blocking leave, then run the existing terminal ordering on the entered cell.

### Runtime/solver drift

**Risk:** Fragile transition logic is implemented twice.

**Mitigation:** Only `physics.slide()` mutates fragile state. Solver logic only derives compact identity from the grid that shared physics produced.

### Accidental reset-solvable acceptance

**Risk:** A board appears solvable only by resetting consumed fragile state.

**Mitigation:** Hazard grids remain unqueued and solver transitions contain neither Reset nor Undo.

### Type-broken commit

**Risk:** Extending `CellType` alone breaks the closed renderer color map/exhaustive switch.

**Mitigation:** Add color keys and exhaustive renderer cases in the same first commit; defer only the final decorative geometry.

### Accidental content/version expansion

**Risk:** Adding `F` to the shared glyph map causes unrelated template/objective/version work to be pulled in.

**Mitigation:** Explicitly keep the Expedition base-row gate, generator placements, current content, `no_falls` feasibility, and version/golden constants unchanged.

## 15. Acceptance Criteria

HPA-493 is complete when:

- authored `F` parses as intact fragile ice and runtime-only `collapsed` cannot be authored;
- fragile collapse follows the leave-then-enter order exactly and no-op inputs never spend the occupied tile;
- `SlideOutcome` remains unchanged and physics tests assert the resulting grid;
- entering collapsed ice follows the existing hazard/reset path;
- a same-slide collapse followed by hazard is discarded by normal reload rather than persisted;
- manual Reset and hazard reset restore all authored fragile tiles intact;
- Expedition Undo restores exact pre-move fragile/collapsed grid state without refunding move cost;
- solver identity includes a deterministic BigInt collapsed mask derived from the post-slide cloned grid;
- same-position/same-crystal/different-collapsed states are explored independently;
- solver/runtime agree on representative endpoints, solvability, and minimum pars;
- candidates requiring deliberate fall/reset or Undo remain rejected and truncation remains fail-closed;
- stage signatures describe authored runs, not live collapsed state;
- renderer contracts remain type-complete from the first commit and final visuals distinguish fragile/collapsed without color alone;
- Expedition template/generator/objective gates stay closed and current deterministic versions/goldens remain unchanged;
- keyboard integration is proven through the existing synthetic-run `init.test.ts` seam without a new browser fixture API;
- the full Ice Slide unit suite, typecheck, lint, and existing Playwright Ice Slide regression coverage pass.

## 16. Spec Self-Review

- **Placeholder scan:** no TBD/TODO or unresolved implementation choice remains.
- **Consistency:** runtime grid is the sole live board authority; solver identity is derived from that grid rather than from a separate physics delta.
- **Ordering:** no-op, leave-collapse, entered-cell terminal handling, and hazard-grid discard semantics are explicit.
- **Scope:** one new mechanic plus the minimum solver identity necessary to validate it; no content/objective/version/browser-fixture expansion is pulled forward.
- **Commitability:** the first contract slice explicitly keeps renderer color/exhaustiveness type-complete.
