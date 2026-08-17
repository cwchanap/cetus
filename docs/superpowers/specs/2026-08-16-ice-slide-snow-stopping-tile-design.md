# Ice Slide Snow Stopping Tile — Design

- **Date:** 2026-08-16
- **Status:** Proposed for HPA-492 implementation
- **Repository:** `cwchanap/cetus`
- **Linear issue:** HPA-492 — Add snow stopping tiles with solver and renderer support
- **Foundation:** HPA-491 is complete on `main`; HPA-492 blocks HPA-493

## 1. Summary

HPA-492 adds one static Ice Slide mechanic:

- glyph `N`;
- runtime cell type `snow`;
- entering snow stops the current slide immediately on that cell;
- snow remains present and may be left normally on a later move.

Keep this as a static-cell extension to the existing parser/physics boundary. Do not introduce a dynamic-tile state model, a second solver transition implementation, a generic tile-behavior registry, or an Expedition template rewrite.

The authoritative change belongs in the existing shared `slide()` transition. `IceSlideGame` already delegates committed movement to `slide()`, and the production BFS solver already delegates every transition to the same function on a cloned grid. Runtime/solver parity therefore stays structural rather than becoming a second implementation.

HPA-492 does not add snow to checked-in Campaign boards, Daily source content, or the current Expedition template catalog. Synthetic materialized stages cover the mechanic. Because no shipped materialized run gains `N` in this slice, current Campaign/Daily/Expedition run meaning and score identity remain unchanged; no generator or ruleset version changes are required.

## 2. Existing seams to reuse

Reuse directly:

- `src/lib/games/ice-slide/types.ts`
  - `CellType` is the closed runtime cell union;
  - `GLYPH_TO_CELL` is the parser/run-validator glyph source of truth;
  - `IceSlideLevel.rows` documents the general materialized glyph alphabet.
- `src/lib/games/ice-slide/physics.ts`
  - `parseGrid()` maps authored/materialized rows into runtime cells;
  - `isBlocking()` already separates walls/rocks from traversable cells;
  - `slide()` is the authoritative movement transition used by both runtime and solver;
  - `cloneGrid()` already clones arbitrary `CellType` rows without tile-specific code.
- `src/lib/games/ice-slide/solver.ts`
  - BFS calls `slide()` for every direction on a cloned grid;
  - state is position + consumed-crystal state, which remains sufficient because snow is immutable.
- `src/lib/games/ice-slide/quality.ts`
  - stage quality already uses the production solver and therefore inherits snow-aware pars without a new branch.
- `src/lib/games/ice-slide/transforms.ts`
  - row transforms validate shape and rearrange characters without interpreting glyphs; no snow-specific production or test path is needed.
- `src/lib/games/ice-slide/game.ts`
  - `loadLevel()` reparses the authored stage on start, manual Reset, and hazard reset;
  - `getState()` and HPA-491 Undo snapshots already use `cloneGrid()`;
  - `move()` delegates to `slide()` and consumes its endpoint/path.
- `src/lib/games/ice-slide/renderer.ts`
  - `COLORS` is exhaustive over `CellType`;
  - `drawCell()` owns cell visuals and currently ends in an implicit ice-shimmer fallthrough;
  - existing tile visuals use static Pixi primitives.
- `src/lib/games/ice-slide/init.ts`
  - keyboard and swipe both resolve to a direction and call the same `game.move()` entry point.
- `src/lib/games/ice-slide/templates.ts`
  - template `baseRows` have their own stricter catalog gate allowing only `#`, `.`, and `S`;
  - this gate remains unchanged because HPA-492 does not author snow into templates.
- Existing regressions already protect deterministic identities:
  - `generator.test.ts` locks literal generator-v2 rows, transform, mutation IDs, par, and signature for one easy, medium, and hard seed;
  - `expedition.test.ts` already asserts Campaign/Daily ruleset `1`, Expedition ruleset `2`, and Expedition generator `2`.

Do not duplicate those existing freezes in HPA-492.

## 3. Approaches considered

### 3.1 Selected: one static cell + shared `slide()` stop rule

Add `snow` to the closed cell contract and `N` to `GLYPH_TO_CELL`. In `slide()`, enter the cell, append it to the path, and immediately return a normal `moved` outcome ending on that snow cell.

The solver remains unchanged because it already calls `slide()`. Reset/Undo state shape remains unchanged because snow never mutates.

This is the smallest implementation and makes runtime/solver parity structural.

### 3.2 Separate solver handling for snow

Rejected. A solver-only transition branch would duplicate movement semantics and recreate the drift HPA-486 removed when it extracted the production solver.

### 3.3 Generic tile behavior registry

Rejected. One immutable stop-on-entry tile does not justify callbacks such as `onEnter`, `onLeave`, `isBlocking`, or a tile-effect registry. HPA-493 fragile ice is the first stateful tile and should drive any additional state model only when needed.

### 3.4 Reauthor Expedition templates in the same slice

Rejected for HPA-492. Changing template `baseRows` or fallbacks would alter deterministic generator-v2 output, require a generator-version decision, and mix content calibration into a simple physics change.

The current template catalog stays byte-for-byte unchanged. A later content task that first authors `N` in template `baseRows` must both extend `assertValidIceSlideTemplateCatalog()`'s `#, ., S` alphabet gate and bump the affected generator version because the same seed can then materialize different rows. `GLYPH_TO_CELL` is the general parser/run-validator source of truth, but it is not the only authoring gate for Expedition templates.

## 4. Fixed behavior

1. `N` parses to `snow`.
2. Snow is traversable. It is not included in `isBlocking()` and never produces a hazard outcome.
3. A slide that enters snow stops on the snow cell even when more traversable cells exist beyond it.
4. The snow cell is included as the final element of `SlideOutcome.path`.
5. A player already standing on snow may start a later move normally in any unblocked direction.
6. Snow is immutable. `slide()` never rewrites a snow cell.
7. Crystals encountered before snow in the same slide are collected normally before the move terminates on snow.
8. A manual Reset or hazard reset reconstructs the original snow tile through the existing `loadLevel() -> parseGrid()` path.
9. Grid cloning, `getState()`, and HPA-491 Undo snapshots preserve snow through the existing grid value; there is no extra snow state field.
10. Goal, hazard, crystal, wall, rock, and Campaign behavior stays unchanged.
11. Existing Campaign rows and pars remain unchanged.
12. Existing Daily generator-v1 output and competition keys remain unchanged.
13. Existing Expedition generator-v2 materialized rows, signatures, and ruleset identity remain unchanged.

## 5. Contracts and parsing

Extend the runtime union:

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
```

Extend the glyph mapping:

```ts
export const GLYPH_TO_CELL: Record<string, CellType> = {
    // existing glyphs
    N: 'snow',
}
```

Update the `IceSlideLevel.rows` contract comment from `# . S G O H C` to `# . S G O H C N`.

Do not add a parallel general allowed-glyph set. `parseGrid()` and `assertValidIceSlideRunDefinition()` already consume `GLYPH_TO_CELL`; the run-validation test for `N` is load-bearing because it proves those two consumers stay aligned.

Because `renderer.ts` declares `COLORS: Record<CellType, number>`, the same contract commit must also add `COLORS.snow` so the tree remains type-checkable. The full patterned snow branch lands later.

No snow-specific transform test is required. `transforms.ts` is glyph-agnostic and existing transform coverage already proves that path for other non-structural glyphs.

## 6. Physics transition

Snow is a stop-on-entry traversable cell.

The existing transition order is:

1. reject an initially blocked direction as `noop`;
2. enter the next traversable cell and append it to the path;
3. resolve terminal/mutating cell semantics;
4. otherwise continue sliding.

Add snow after entry as a normal terminal move:

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

No `SlideOutcome` shape change is needed. Starting on snow requires no special branch because `slide()` evaluates the adjacent cell, not the cell under `from`.

A dedicated `#S.CN.#` regression proves two ordering facts in one cheap fixture: an earlier crystal is collected, then entry into `N` terminates the slide before the following ice cell.

Do not add a snow-specific `cloneGrid()` test. Grid cloning is already glyph-agnostic; the more useful restore/isolation coverage lives at the game boundary where HPA-493 will later extend state.

## 7. Solver and quality validation

Do not change `solver.ts` or `quality.ts` production logic.

The BFS already performs:

```ts
const grid = cloneGrid(current.grid)
const outcome = slide(grid, current.position, DIRECTION_DELTA[direction])
```

Once `slide()` stops on snow, snow becomes a reachable BFS stop automatically. The solver state key remains `(position, crystalMask)` because snow never changes state.

Use a compact fixture where snow changes the minimum:

```text
######
#S.NG#
######
```

Expected result:

- first `E` stops on `N`;
- second `E` reaches `G`;
- solver `minMoves === 2`.

Pass the same rows through `validateIceSlideStageQuality()` with `objectiveIds: []` and an exact par band of 2. That proves quality/par calculation inherits the production transition without a `quality.ts` snow branch.

## 8. Runtime state, Reset, cloning, and Undo

No production `game.ts` state change is required.

### 8.1 Ordinary moves

`IceSlideGame.move()` already assigns `state.player = outcome.end`. A snow stop is a normal committed move and participates in move/time/objective accounting like any other non-hazard move.

### 8.2 Manual Reset and hazard reset

Both paths call `loadLevel()`, which reparses `stage.rows`. Since `N` remains in immutable materialized rows, the reconstructed grid restores `snow` automatically.

Tests cover stop-on-snow, manual Reset, and a later hazard entered from snow. Do not add `snowPositions` or a reset hook.

### 8.3 `getState()` isolation and HPA-491 Undo

`getState()` returns a cloned grid, but main has no output-grid isolation regression. Add one using a snow-bearing synthetic stage: mutate the returned grid and confirm a second `getState()` still reports the internal snow cell. This is state-boundary coverage, not snow-specific cloning machinery.

HPA-491's one-step Undo snapshot already stores the entire grid plus player/crystal totals. Add one round-trip with an existing Safe charge: move onto `N`, Undo, assert the player returns and the snow tile remains `snow`, while move counters retain their existing cost semantics.

Do not extend `IceSlideUndoSnapshot`.

## 9. Renderer and accessibility

Task 1 adds `COLORS.snow` for compile correctness. Task 4 adds the visible snow branch and closes the renderer's current implicit-fallthrough gap.

Refactor `drawCell()` so every non-wall `CellType` is explicit:

- `goal`, `rock`, `hazard`, `crystal`, and `snow` have dedicated branches;
- `ice` and `start` share the existing shimmer branch;
- after the switch, assign `cell` to `never` so a future `CellType` addition fails typecheck until its rendering decision is explicit.

Conceptually:

```ts
switch (cell) {
    case 'goal':
        // existing goal drawing
        return
    case 'rock':
        // existing rock drawing
        return
    case 'hazard':
        // existing hazard drawing
        return
    case 'crystal':
        // existing crystal drawing
        return
    case 'snow':
        // static inset + offset snow-bank bands
        return
    case 'ice':
    case 'start':
        // existing ice shimmer
        return
}

const _exhaustive: never = cell
return _exhaustive
```

The earlier `wall` branch remains an early return, so TypeScript narrows it out before this switch. Do not add a `default` case: the `never` tail is intentionally the compile-time guard for HPA-493 and any later tile additions.

The snow treatment must be recognizable by geometry/pattern, not hue alone: retain the common floor, draw a pale inset field, then overlay multiple short offset bands using existing `rect`/`roundRect` primitives. Do not add animation, filters, textures, sprites, or reduced-motion branching.

Automated renderer tests lock the unique primitive path, but mocked calls alone do not prove legibility. Also perform one manual check at the only shipped cell size (`CELL_SIZE = 48`): run `bun run web:dev`, render one snow cell in the existing Ice Slide board via a dev-only runtime state mutation, and verify it is visually distinct from adjacent ice while the player remains readable. Do not commit any fixture/content change for this check.

## 10. Keyboard and swipe integration

No production `init.ts` or input-mapping change is needed. Keyboard and swipe already converge on `game.move(direction)`, and existing tests separately cover both browser paths.

Do not duplicate the same snow fixture through both event paths. Add one snow-specific keyboard integration test that dispatches `ArrowRight` into a synthetic `N` stage and asserts the player stops on snow. Keep the existing swipe integration test unchanged as the proof that swipe reaches the same movement boundary.

Snow must not add an input special case.

## 11. Versioning and existing deterministic freezes

HPA-485 defines:

- `generatorVersion` changes when the same mode-specific seed/inputs can materialize a different run;
- `rulesetVersion` changes when physics, objective interpretation, or scoring changes competitive meaning.

Current identities remain:

- Campaign/Daily: `ICE_SLIDE_RULESET_VERSION = 1`;
- Expedition: `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`;
- Expedition generator: `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`.

HPA-492 changes parser/physics capability, but no shipped materialized stage contains `N`. The same current rows therefore retain identical endpoints, objectives, scores, signatures, and run identity. Do not bump any version.

Do not add new version/signature freeze tests in HPA-492. Main already has the correct pre-change baselines:

- `expedition.test.ts` asserts the three current version constants;
- `generator.test.ts` locks full generator-v2 goldens for easy, medium, and hard, including literal rows and signatures.

Those existing tests run in the normal Ice Slide suite and will fail if HPA-492 accidentally perturbs deterministic content.

When a later content change first causes a versioned run to emit `N`, that slice owns the affected version decision. Expedition template/fallback changes at minimum bump the Expedition generator because the same seed can materialize different rows; Daily/Campaign versioning remains deferred until their actual source content can contain snow.

## 12. Files expected to change in implementation

Production behavior:

- `src/lib/games/ice-slide/types.ts`
- `src/lib/games/ice-slide/physics.ts`
- `src/lib/games/ice-slide/renderer.ts`

Tests:

- `src/lib/games/ice-slide/physics.test.ts`
- `src/lib/games/ice-slide/solver.test.ts`
- `src/lib/games/ice-slide/quality.test.ts`
- `src/lib/games/ice-slide/run.test.ts`
- `src/lib/games/ice-slide/game.test.ts`
- `src/lib/games/ice-slide/renderer.test.ts`
- `src/lib/games/ice-slide/init.test.ts`

No changes are planned for `transforms.ts`/`transforms.test.ts`, `levels.ts`, `templates.ts`, `generator.ts`, `generator.test.ts`, `daily.ts`, `expedition.ts`, `expedition.test.ts`, `scoring.ts`, database/API code, or page markup.

## 13. Testing strategy

Required new coverage:

- parser accepts `N` as `snow`;
- run validator accepts the same `N` glyph through `GLYPH_TO_CELL` and still rejects unknown glyphs;
- slide stops on snow and includes it in the path;
- cells after snow are not traversed;
- a move starting on snow leaves normally;
- crystal-then-snow collects before stopping;
- production solver computes the snow fixture minimum;
- quality accepts the same fixture with `objectiveIds: []` and exact par 2;
- manual Reset and hazard reset restore snow;
- `getState()` output-grid isolation protects internal snow;
- HPA-491 Undo round-trips a snow-stopped move without snapshot changes;
- renderer has an explicit snow branch plus compile-time exhaustiveness guard;
- one keyboard event reaches snow-aware movement; existing swipe wiring remains green;
- manual 48px renderer check confirms the static pattern is readable and non-color-only.

Existing tests continue to prove:

- Campaign rows/pars/scoring unchanged;
- Daily generator-v1 output/key unchanged;
- Expedition generator-v2 content/signatures and r2/g2 identity unchanged;
- transforms remain glyph-agnostic.

Full verification:

```bash
bun run test:run -- src/lib/games/ice-slide
bun run validate:ice-slide-expedition
bun run typecheck
bun run lint
bun run test:run
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

## 14. Non-goals

HPA-492 does not include:

- fragile/cracked/collapsed ice;
- dynamic tile bitsets or solver state expansion;
- a tile behavior framework;
- new Undo semantics or snapshot fields;
- route-choice changes;
- changes to scoring or objectives;
- Campaign level edits;
- Daily source/pool changes;
- Expedition template/fallback reauthoring;
- widening the Expedition template `baseRows` alphabet gate;
- new transform logic/tests for `N`;
- new version/signature golden tests;
- a generator-version or ruleset-version bump;
- new database, persistence, leaderboard, or API work.

## 15. Acceptance mapping

- **Stop immediately on snow:** one `slide()` terminal plus physics/runtime coverage.
- **Leave snow normally:** start-on-snow physics fixture.
- **Crystal before snow:** combined transition fixture locks collection then terminal ordering.
- **Snow persists/reset restores it:** immutable rows plus game Reset/hazard/Undo tests.
- **Runtime and solver agree:** both consume `slide()`; solver fixture locks minimum behavior.
- **Campaign/Daily/Expedition identity unchanged:** existing mainline generator/version goldens remain green; no new baseline is captured after the change.
- **Accessible rendering:** explicit patterned branch, compile-time future-tile guard, primitive regression, and manual 48px visual check.
- **Input coverage:** one snow-specific keyboard event plus existing keyboard/swipe convergence tests.

This keeps HPA-492 a small static-mechanic slice and leaves HPA-493 to introduce dynamic board history only when it is actually required.
