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

The key architectural choice is to teach the existing shared `slide()` transition about snow once. `IceSlideGame` already delegates committed movement to `slide()`, and the production BFS solver already delegates every transition to the same function on a cloned grid. That makes runtime/solver parity a consequence of the existing architecture instead of another abstraction.

HPA-492 does not add snow to checked-in Campaign boards or the current Expedition template catalog. Synthetic materialized stages cover the mechanic end to end. A later content slice can introduce `N` into selected templates and bump the generator version when actual seed output changes.

## 2. Existing seams to reuse

Reuse directly:

- `src/lib/games/ice-slide/types.ts`
  - `CellType` is the closed runtime cell union;
  - `GLYPH_TO_CELL` is the parser/run-validator glyph source of truth;
  - `IceSlideLevel.rows` documents the authoring alphabet.
- `src/lib/games/ice-slide/physics.ts`
  - `parseGrid()` maps authored/materialized rows into runtime cells;
  - `isBlocking()` already separates walls/rocks from traversable cells;
  - `slide()` is the authoritative movement transition used by both runtime and solver;
  - `cloneGrid()` already clones arbitrary `CellType` rows without tile-specific code.
- `src/lib/games/ice-slide/solver.ts`
  - BFS calls `slide()` for every direction on a cloned grid;
  - state is currently position + consumed-crystal state, which remains sufficient because snow is immutable.
- `src/lib/games/ice-slide/quality.ts`
  - stage quality uses the production solver and therefore should inherit snow-aware pars without a new branch.
- `src/lib/games/ice-slide/transforms.ts`
  - row transforms operate on glyph strings generically; no snow-specific transform implementation is needed.
- `src/lib/games/ice-slide/game.ts`
  - `loadLevel()` reparses the authored stage on start, manual Reset, and hazard reset;
  - `getState()`, Undo snapshots, and `loadLevel()` already use `cloneGrid()`;
  - `move()` delegates to `slide()` and consumes its endpoint/path.
- `src/lib/games/ice-slide/renderer.ts`
  - `drawCell()` is the single cell-visual switch;
  - existing tile visuals are static Pixi primitives, which is sufficient for snow.
- `src/lib/games/ice-slide/init.ts`
  - keyboard and swipe both resolve to a direction and call the same `game.move()` entry point.
- `src/lib/games/ice-slide/expedition.ts`
  - HPA-491 already separated Expedition ruleset versioning from Campaign/Daily.

## 3. Approaches considered

### 3.1 Selected: one static cell + shared `slide()` stop rule

Add `snow` to the closed cell contract and `N` to `GLYPH_TO_CELL`. In `slide()`, enter the cell, append it to the path, and immediately return a normal `moved` outcome ending on that snow cell.

The solver remains unchanged because it already calls `slide()`. Reset/Undo state shape remains unchanged because snow never mutates.

This is the smallest implementation and makes runtime/solver parity structural.

### 3.2 Separate solver handling for snow

Rejected. A solver-only transition branch would duplicate movement semantics and create exactly the drift HPA-486 removed when it extracted the production solver.

### 3.3 Generic tile behavior registry

Rejected. One immutable stop-on-entry tile does not justify callbacks such as `onEnter`, `onLeave`, `isBlocking`, or a tile-effect registry. HPA-493's fragile ice is stateful and has different needs; pre-generalizing HPA-492 would add indirection without reuse.

### 3.4 Reauthor Expedition templates in the same slice

Rejected for HPA-492. The ticket is the mechanic/support slice. Changing template `baseRows` or fallbacks would change deterministic generator-v2 output, force a generator-version bump, require new frozen seed expectations, and mix content calibration into a simple physics change.

The current template catalog stays byte-for-byte unchanged. A later content task can add snow deliberately after the mechanic is stable.

## 4. Fixed behavior

1. `N` parses to `snow`.
2. Snow is traversable. It is not included in `isBlocking()` and never produces a hazard outcome.
3. A slide that enters snow stops on the snow cell even when more traversable cells exist beyond it.
4. The snow cell is included as the final element of `SlideOutcome.path`.
5. A player already standing on snow may start a later move normally in any unblocked direction. The current cell does not constrain the next slide.
6. Snow is immutable. `slide()` never rewrites a snow cell.
7. A manual Reset or hazard reset reconstructs the original snow tile through the existing `loadLevel() -> parseGrid()` path.
8. Grid cloning/get-state/Undo snapshots preserve snow automatically through `cloneGrid()`; there is no extra snow state field.
9. Goal, hazard, crystal, wall, rock, and Campaign behavior stays unchanged.
10. Existing Campaign rows and pars remain unchanged.
11. Existing Daily generator-v1 output and competition keys remain unchanged.
12. Existing Expedition generator-v2 materialized rows remain unchanged.

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

Do not add a parallel allowed-glyph set. `parseGrid()` and `assertValidIceSlideRunDefinition()` already consume `GLYPH_TO_CELL`, so one mapping remains the source of truth.

`transforms.ts` needs no production change: it rearranges row characters without interpreting them. Add a focused test proving a transform preserves `N` so future template work does not need a snow-specific path.

## 6. Physics transition

Snow is a stop-on-entry traversable cell.

The existing transition order is:

1. reject an initially blocked direction as `noop`;
2. enter the next traversable cell and append it to the path;
3. resolve hazard/crystal/goal semantics;
4. otherwise continue sliding.

Add snow to the terminal-cell portion of that loop after entry. Conceptually:

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

## 7. Solver and quality validation

Do not change `solver.ts` production logic.

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

Also pass this fixture through `validateIceSlideStageQuality()` with an exact par band of 2. That proves generator quality/par calculation inherits the production transition without adding a `quality.ts` snow branch.

## 8. Runtime state, Reset, and cloning

No production `game.ts` state shape change is required.

### 8.1 Ordinary moves

`IceSlideGame.move()` already assigns `state.player = outcome.end`. A snow stop is therefore a normal committed move and participates in moves/time/objectives exactly like a wall-ended stop.

### 8.2 Manual Reset and hazard reset

Both paths eventually call `loadLevel()`, which reparses `stage.rows`. Since `N` remains in the immutable materialized rows, the reconstructed grid restores `snow` automatically.

Tests should cover:

- stop on snow;
- manual Reset returns the player to start and keeps the snow cell;
- moving from snow into a later hazard triggers the normal fall/reset and again restores the snow cell.

Do not add a `snowPositions` list or reset hook.

### 8.3 Cloning and Undo snapshots

`cloneGrid()` copies each `CellType[]`, so snow is already copied by value. `getState()` and the HPA-491 private Undo snapshot reuse that helper.

Add a clone/isolation assertion using snow, but do not extend `IceSlideUndoSnapshot`: unlike HPA-493 fragile ice, HPA-492 has no dynamic tile state to restore.

## 9. Renderer and accessibility

Add a `snow` entry to the exhaustive `COLORS: Record<CellType, number>` map and a dedicated `drawCell()` branch.

The snow treatment must be recognizable by shape/pattern, not hue alone. Keep it static and cheap:

- retain the common non-wall floor underneath;
- draw a pale inset snow field;
- overlay two or three short horizontal/offset snow-bank bands using existing `rect`/`roundRect` primitives.

This provides a texture cue distinct from:

- ice shimmer rectangle;
- goal block;
- rock block;
- hazard circles;
- crystal star;
- player circle.

Do not add animation, filters, textures, sprites, or reduced-motion branching. A static pattern satisfies reduced-motion automatically and remains distinguishable under color-vision deficiencies.

Renderer tests should include `snow` in the exhaustive cell grid and one focused snow-only assertion that verifies the patterned primitive path is exercised.

## 10. Keyboard and swipe integration

No production `init.ts` or input-mapping change is needed. Keyboard and swipe already converge on:

```ts
game.move(direction)
```

Add integration coverage in `init.test.ts` using the existing mocked Expedition factory:

1. return a one-stage synthetic run containing `N` with traversable cells beyond it;
2. start Expedition;
3. dispatch `ArrowRight` and assert the player stops on snow;
4. restart the fixture, make `swipeToDirection()` return `E`, dispatch pointer down/up, and assert the same endpoint.

This verifies the real browser-input wiring reaches the snow-aware physics path without introducing snow-specific input code.

## 11. Versioning

HPA-491 established mode-specific Expedition ruleset versioning:

- Campaign/Daily: `ICE_SLIDE_RULESET_VERSION = 1`;
- Expedition: `ICE_SLIDE_EXPEDITION_RULESET_VERSION = 2`;
- Expedition generator: `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`.

For HPA-492:

- bump `ICE_SLIDE_EXPEDITION_RULESET_VERSION` from `2` to `3`;
- keep `ICE_SLIDE_EXPEDITION_GENERATOR_VERSION = 2`;
- keep Campaign/Daily `ICE_SLIDE_RULESET_VERSION = 1`.

Rationale:

- Snow is part of the post-Expedition evolving-mechanics roadmap and changes physics interpretation for snow-aware materialized runs, so Expedition run identity must advertise the new ruleset.
- HPA-492 does not change template rows, mutation selection, RNG labels, or fallback content, so the same Expedition seed still materializes the same stage rows. A generator bump would be false versioning.
- No shipped Campaign or Daily source can contain `N`, so their actual run meaning is unchanged. Bumping the global Campaign/Daily ruleset would unnecessarily change Daily seeds and frozen daily output because the ruleset is part of the Daily seed string.

When a later content change introduces `N` into an Expedition template/fallback, that change must bump the Expedition generator version because the same seed can then materialize different rows. If Daily ever gains snow-bearing source content, that change must revisit the Campaign/Daily ruleset at that time.

## 12. Files expected to change in implementation

Production:

- `src/lib/games/ice-slide/types.ts`
- `src/lib/games/ice-slide/physics.ts`
- `src/lib/games/ice-slide/renderer.ts`
- `src/lib/games/ice-slide/expedition.ts`

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

No changes are planned for `levels.ts`, `templates.ts`, `generator.ts`, `daily.ts`, `scoring.ts`, database/API code, or page markup.

## 13. Testing strategy

Use focused tests first, then the full Ice Slide regression suite.

Required coverage:

- parser accepts `N` as `snow`;
- parser/run validator continue rejecting unknown glyphs;
- slide stops on snow and includes it in the path;
- a move starting on snow can leave normally;
- snow remains unchanged after movement/cloning;
- production solver computes the snow fixture minimum and remains runtime-consistent;
- quality validation accepts the same exact par;
- transforms preserve `N`;
- manual Reset and hazard reset restore snow;
- renderer uses a non-color-only snow pattern;
- keyboard and swipe wiring both stop on snow;
- Campaign levels remain exactly eight with existing rows and pars;
- Daily generator-v1 frozen output stays unchanged;
- Expedition generator-v2 rows remain deterministic while run identity advances to ruleset 3.

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
- new Undo behavior;
- route-choice changes;
- changes to scoring or objectives;
- Campaign level edits;
- Daily source/pool changes;
- Expedition template/fallback reauthoring;
- a generator-version bump;
- new database, persistence, leaderboard, or API work.

## 15. Acceptance mapping

- **Stop immediately on snow:** implemented once in `slide()` and covered by physics/runtime tests.
- **Leave snow normally:** covered by a start-on-snow physics test.
- **Snow persists/reset restores it:** immutable grid semantics plus game Reset/hazard tests.
- **Runtime and solver agree:** both consume `slide()`; shared fixture locks endpoint/minimum behavior.
- **Campaign unchanged:** no Campaign content/scoring files change; existing par regression remains green.
- **Accessible rendering:** static shape/pattern branch, no motion dependency or color-only cue.
- **Parser/physics/solver/renderer/reset/version/input coverage:** explicit focused tests listed above.

This keeps HPA-492 a small static-mechanic slice and leaves HPA-493 to introduce dynamic board history only when it is actually required.
