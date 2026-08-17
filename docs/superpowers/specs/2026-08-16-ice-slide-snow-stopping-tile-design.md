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

HPA-492 does not add snow to checked-in Campaign boards, Daily source content, or the current Expedition template catalog. Synthetic materialized stages cover the mechanic. Because no shipped materialized run gains `N` in this slice, current Campaign/Daily/Expedition run meaning and score identity remain unchanged; version bumps are deferred until content actually emits snow.

## 2. Existing seams to reuse

Reuse directly:

- `src/lib/games/ice-slide/types.ts`
  - `CellType` is the closed runtime cell union;
  - `GLYPH_TO_CELL` is the parser/run-validator glyph source of truth;
  - `IceSlideLevel.rows` documents the general authored/materialized glyph alphabet.
- `src/lib/games/ice-slide/physics.ts`
  - `parseGrid()` maps authored/materialized rows into runtime cells;
  - `isBlocking()` already separates walls/rocks from traversable cells;
  - `slide()` is the authoritative movement transition used by both runtime and solver;
  - `cloneGrid()` already clones arbitrary `CellType` rows without tile-specific code.
- `src/lib/games/ice-slide/solver.ts`
  - BFS calls `slide()` for every direction on a cloned grid;
  - state is currently position + consumed-crystal state, which remains sufficient because snow is immutable.
- `src/lib/games/ice-slide/quality.ts`
  - stage quality uses the production solver and therefore inherits snow-aware pars without a new branch.
- `src/lib/games/ice-slide/transforms.ts`
  - row transforms operate on glyph strings generically; no snow-specific transform implementation is needed.
- `src/lib/games/ice-slide/game.ts`
  - `loadLevel()` reparses the authored stage on start, manual Reset, and hazard reset;
  - `getState()` and HPA-491 Undo snapshots already use `cloneGrid()`;
  - `move()` delegates to `slide()` and consumes its endpoint/path.
- `src/lib/games/ice-slide/renderer.ts`
  - `COLORS` is exhaustive over `CellType`;
  - `drawCell()` is the single cell-visual switch;
  - existing tile visuals are static Pixi primitives, which is sufficient for snow.
- `src/lib/games/ice-slide/init.ts`
  - keyboard and swipe both resolve to a direction and call the same `game.move()` entry point.
- `src/lib/games/ice-slide/templates.ts`
  - template `baseRows` currently have their own stricter catalog gate allowing only `#`, `.`, and `S`;
  - this gate is intentionally not widened in HPA-492 because no template authors snow yet.

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

Rejected for HPA-492. The ticket is the mechanic/support slice. Changing template `baseRows` or fallbacks would change deterministic generator-v2 output, require a generator-version bump, require new frozen seed expectations, and mix content calibration into a simple physics change.

The current template catalog stays byte-for-byte unchanged. A later content task that first authors `N` in template `baseRows` must both extend `assertValidIceSlideTemplateCatalog()`'s `#, ., S` alphabet gate and make the appropriate Expedition generator-version bump. `GLYPH_TO_CELL` is the general parser/run-validator source of truth, but it is not the only authoring gate for Expedition templates.

## 4. Fixed behavior

1. `N` parses to `snow`.
2. Snow is traversable. It is not included in `isBlocking()` and never produces a hazard outcome.
3. A slide that enters snow stops on the snow cell even when more traversable cells exist beyond it.
4. The snow cell is included as the final element of `SlideOutcome.path`.
5. A player already standing on snow may start a later move normally in any unblocked direction. The current cell does not constrain the next slide.
6. Snow is immutable. `slide()` never rewrites a snow cell.
7. Crystals encountered before snow in the same slide are collected normally before the move terminates on snow.
8. A manual Reset or hazard reset reconstructs the original snow tile through the existing `loadLevel() -> parseGrid()` path.
9. Grid cloning, `getState()`, and HPA-491 Undo snapshots preserve snow automatically through `cloneGrid()`; there is no extra snow state field.
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

Extend the authoring mapping:

```ts
export const GLYPH_TO_CELL: Record<string, CellType> = {
    // existing glyphs
    N: 'snow',
}
```

Update the `IceSlideLevel.rows` comment from `# . S G O H C` to `# . S G O H C N`.

Do not add a parallel general allowed-glyph set. `parseGrid()` and `assertValidIceSlideRunDefinition()` already consume `GLYPH_TO_CELL`.

Because `renderer.ts` declares `COLORS: Record<CellType, number>`, the same contract commit must also add `COLORS.snow` so the tree remains type-checkable. The full patterned snow branch can land in the later renderer task; before that branch exists, snow may temporarily fall through to the generic ice shimmer while preserving compile correctness.

`transforms.ts` needs no production change: it rearranges row characters without interpreting them. Add a focused test proving a transform preserves `N` so future content work does not need a snow-specific path.

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

No `SlideOutcome` shape change is needed. Snow is neither success nor failure; it only changes the endpoint of a normal move.

Starting on snow requires no special branch. `slide()` evaluates the adjacent cell, not the semantic type under `from`, so the next move naturally uses normal rules.

A dedicated `#S.CN.#`-style regression must prove crystals before snow are still collected and that the cell after snow is not traversed. This catches accidental stop-before-entry handling or incorrect terminal ordering without adding a combined-cell special case.

## 7. Solver and quality validation

Do not change `solver.ts` or `quality.ts` production logic.

The BFS already performs:

```ts
const grid = cloneGrid(current.grid)
const outcome = slide(grid, current.position, DIRECTION_DELTA[direction])
```

Once `slide()` stops on snow, snow becomes a reachable BFS stop automatically. The solver state key remains `(position, crystalMask)` because snow never changes state.

Use a compact fixture where snow visibly changes the minimum:

```text
######
#S.NG#
######
```

Expected result:

- first `E` stops on `N`;
- second `E` reaches `G`;
- solver `minMoves === 2`;
- runtime endpoint for the first move is the same snow coordinate.

Pass the same fixture through `validateIceSlideStageQuality()` with an exact par band of 2. That proves quality/par calculation inherits the production transition without a `quality.ts` snow branch.

## 8. Runtime state, Reset, cloning, and Undo

No production `game.ts` state shape change is required.

### 8.1 Ordinary moves

`IceSlideGame.move()` already assigns `state.player = outcome.end`. A snow stop is therefore a normal committed move and participates in moves/time/objectives exactly like another non-hazard committed move.

### 8.2 Manual Reset and hazard reset

Both paths eventually call `loadLevel()`, which reparses `stage.rows`. Since `N` remains in the immutable materialized rows, the reconstructed grid restores `snow` automatically.

Tests cover:

- stop on snow;
- manual Reset returns the player to start and keeps the snow cell;
- moving from snow into a later hazard triggers the normal fall/reset and again restores the snow cell.

Do not add a `snowPositions` list or reset hook.

### 8.3 Cloning and Undo snapshots

`cloneGrid()` copies each `CellType[]`, so snow is copied by value. `getState()` and the HPA-491 private Undo snapshot reuse that helper.

Add both:

- a state-copy isolation assertion using snow;
- an Expedition Undo round-trip: grant/reuse the existing test helper for one Undo charge, move onto `N`, call `undo()`, assert the player returns to the pre-move position and the tile remains `snow`.

Do not extend `IceSlideUndoSnapshot`: unlike HPA-493 fragile ice, HPA-492 has no dynamic tile state to restore.

## 9. Renderer and accessibility

Task 1 adds the exhaustive `COLORS.snow` entry for type safety. The renderer task adds a dedicated `drawCell()` branch.

The snow treatment must be recognizable by shape/pattern, not hue alone. Keep it static and cheap:

- retain the common non-wall floor underneath;
- draw a pale inset snow field;
- overlay two or three short horizontal/offset snow-bank bands using existing `rect`/`roundRect` primitives.

This provides a texture cue distinct from ice shimmer, goal/rock blocks, hazard circles, crystal star, and player circle.

Do not add animation, filters, textures, sprites, or reduced-motion branching. A static pattern satisfies reduced-motion automatically and remains distinguishable without relying on color alone.

Renderer tests include `snow` in the exhaustive cell grid and one focused snow-only assertion that verifies the patterned primitive path is exercised.

## 10. Keyboard and swipe integration

No production `init.ts` or input-mapping change is needed. Keyboard and swipe already converge on `game.move(direction)`, and existing `init.test.ts` coverage separately proves both browser paths call that movement boundary.

Do not duplicate the same snow fixture through both event paths. Add one snow-specific keyboard integration test that dispatches `ArrowRight` into a synthetic `N` stage and asserts the player stops on snow. Keep the existing swipe integration test unchanged as the structural proof that swipe reaches the same `game.move()` path.

Snow must not add an input special case.

## 11. Versioning

HPA-485 defines:

- `generatorVersion` changes when the same mode-specific seed/inputs can materialize a different run;
- `rulesetVersion` changes when physics, objective interpretation, or scoring changes competitive meaning.

Current identities remain:

- Campaign/Daily: `ICE_SLIDE_RULESET_VERSION = 1`;
- Expedition: `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`;
- Expedition generator: `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`.

HPA-492 changes parser/physics capability, but no shipped Campaign, Daily, or Expedition materialized stage contains `N`. Therefore the same current run rows have identical endpoints, objectives, scores, and signatures before and after HPA-492. Bumping Expedition from `r2` to `r3` here would create run-key churn without a competitive-meaning change.

For HPA-492:

- keep `ICE_SLIDE_RULESET_VERSION = 1`;
- keep `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`;
- keep `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`.

Add a frozen Expedition signature list for a known seed so HPA-492 cannot accidentally perturb generator-v2 output while touching shared contracts.

When a later content change first causes a versioned run to emit `N`, that slice must make the version decision against the affected mode. For Expedition template/fallback changes, the same seed can materialize different rows, so at minimum the Expedition generator version must bump; if the new snow-bearing content also changes competitive rule meaning beyond the materialized-row identity, revisit the ruleset then. Daily/Campaign versioning is likewise deferred until their actual source content can contain snow.

## 12. Files expected to change in implementation

Production:

- `src/lib/games/ice-slide/types.ts`
- `src/lib/games/ice-slide/physics.ts`
- `src/lib/games/ice-slide/renderer.ts`

Tests only:

- `src/lib/games/ice-slide/physics.test.ts`
- `src/lib/games/ice-slide/solver.test.ts`
- `src/lib/games/ice-slide/quality.test.ts`
- `src/lib/games/ice-slide/transforms.test.ts`
- `src/lib/games/ice-slide/run.test.ts`
- `src/lib/games/ice-slide/expedition.test.ts`
- `src/lib/games/ice-slide/game.test.ts`
- `src/lib/games/ice-slide/renderer.test.ts`
- `src/lib/games/ice-slide/init.test.ts`

No changes are planned for `levels.ts`, `templates.ts`, `generator.ts`, `daily.ts`, `expedition.ts`, `scoring.ts`, database/API code, or page markup.

## 13. Testing strategy

Required new/adjusted coverage:

- parser accepts `N` as `snow`;
- parser/run validator continue rejecting unknown glyphs;
- slide stops on snow and includes it in the path;
- the cell after snow is not traversed;
- a move starting on snow can leave normally;
- crystal-then-snow collects the crystal and terminates on snow;
- snow remains unchanged after movement/cloning;
- production solver computes the snow fixture minimum and remains runtime-consistent;
- quality validation accepts the same exact par;
- transforms preserve `N`;
- manual Reset and hazard reset restore snow;
- `getState()` isolation preserves internal snow;
- HPA-491 Undo round-trips a snow-stopped move without any snapshot extension;
- renderer uses a non-color-only snow pattern;
- one keyboard browser event reaches snow-aware movement; existing swipe wiring remains green;
- Campaign levels remain exactly eight with existing rows and pars;
- Daily generator-v1 frozen output stays unchanged;
- Expedition generator-v2 ruleset stays `2` and a known seed's stage signatures stay frozen.

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
- a generator-version or ruleset-version bump;
- new database, persistence, leaderboard, or API work.

## 15. Acceptance mapping

- **Stop immediately on snow:** implemented once in `slide()` and covered by physics/runtime tests.
- **Leave snow normally:** covered by a start-on-snow physics test.
- **Crystal before snow:** same transition collects earlier crystals and stops after entering `N`.
- **Snow persists/reset restores it:** immutable grid semantics plus game Reset/hazard/Undo tests.
- **Runtime and solver agree:** both consume `slide()`; shared fixture locks endpoint/minimum behavior.
- **Campaign unchanged:** no Campaign content/scoring files change; existing par regression remains green.
- **Accessible rendering:** static shape/pattern branch, no motion dependency or color-only cue.
- **Input coverage:** one snow-specific keyboard event plus existing keyboard/swipe convergence tests; no snow input branch.
- **Version coverage:** explicit freeze at Campaign/Daily r1, Expedition r2/g2, plus frozen Expedition stage signatures.

This keeps HPA-492 a small static-mechanic slice and leaves HPA-493 to introduce dynamic board history only when it is actually required.
