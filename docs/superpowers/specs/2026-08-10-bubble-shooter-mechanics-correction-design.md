# HPA-121 Bubble Shooter Mechanics Correction Design

**Issue:** HPA-121  
**Date:** 2026-08-10  
**Status:** Approved for a single implementation PR

## Summary

Bubble Shooter currently lets its logical hex grid, stored bubble coordinates, projectile simulation, and attachment rules drift apart. That explains the reported bubbles overlapping and visually valid groups sometimes failing to clear.

This design corrects the game in one PR without introducing a physics engine or a reusable cross-game grid framework. The implementation stays inside the existing Bubble Shooter module and its page:

- phase-aware hex-grid geometry,
- elapsed-time projectile movement with collision-safe substeps,
- impact-specific legal attachment,
- authoritative bubble-count synchronization,
- classic removal of ceiling-disconnected clusters,
- active-board color selection,
- clean run restart and preview behavior,
- true successful-shot accuracy,
- matching rules copy and regression coverage.

The existing `BaseGame`, Pixi renderer, initializer, and page boundaries remain intact.

## User-visible problems

The current code can produce several related failures:

1. After a new row is inserted, bubbles can overlap because row arrays move to the opposite logical parity while their horizontal coordinates remain unchanged.
2. Matching uses logical neighbors derived from the new row number, while rendering and collision use the old stored coordinates. A group that looks connected can therefore be disconnected in the match graph.
3. Projectile speed and collision reliability depend on display refresh rate because velocity is applied once per animation frame and `deltaTime` is ignored.
4. A blocked collision can attach to an unrelated cell elsewhere on the board, and a completely full grid can overwrite an occupied top-row cell.
5. A new run started from the game-over Start button can inherit score and Bubble Shooter statistics from the previous run.
6. Direct matches leave unsupported bubbles floating instead of dropping.
7. The queue can keep producing colors that no longer exist on the board.
8. The page says a row is added after every shot even though the configured interval is five shots.

## Goals

- Keep rendered coordinates and logical hex neighbors consistent after any number of inserted rows.
- Make projectile travel deterministic for elapsed time rather than frame count.
- Prevent tunneling through walls or bubbles under normal and delayed animation frames.
- Allow attachment only where the impact physically permits it.
- Make the grid the source of truth for `bubblesRemaining`.
- Remove all bubbles disconnected from the ceiling after board mutations, while awarding shot score only for removals caused by a successful shot.
- Preserve the already-previewed current bubble while ensuring future queue colors remain playable.
- Start every new run with clean game, score, stat, and preview state.
- Keep the change local, testable, and maintainable.

## Non-goals

- New Pixi assets, animations, sound effects, particles, power-ups, levels, or difficulty modes.
- A general-purpose physics engine.
- A reusable grid package shared by unrelated games.
- Refactoring `BaseGame` lifecycle semantics for all games.
- Persistence or database schema changes.
- Backward compatibility for the current internal Bubble Shooter state shape.

## Existing boundaries

The implementation already has useful responsibility boundaries:

- `types.ts` defines Bubble Shooter state and configuration.
- `utils.ts` contains pure hex-grid coordinate and neighbor helpers.
- `BubbleShooterGame.ts` owns state transitions, projectile movement, attachment, matching, scoring, and row insertion.
- `BubbleShooterRenderer.ts` draws the coordinates supplied by game state and should not calculate game geometry.
- `initFramework.ts` owns RAF timing, pointer input, button lifecycle, preview canvases, and DOM synchronization.
- `src/pages/bubble-shooter/index.astro` owns static structure and rules copy.

The PR preserves these boundaries. No new production source file is required.

## Design

### 1. Phase-aware hex-grid geometry

Add a `RowPhase` type and `rowPhase` field to `BubbleShooterState`:

```ts
export type RowPhase = 0 | 1

interface BubbleShooterState {
    rowPhase: RowPhase
    // existing fields...
}
```

`rowPhase` describes the physical parity of logical row zero. The physical parity of any row is:

```ts
const parity = ((row + rowPhase) % 2) as RowPhase
```

All geometry and bounds checks must use this parity through pure helpers:

```ts
getRowParity(row: number, rowPhase: RowPhase): RowPhase
getRowColumnCount(
    row: number,
    rowPhase: RowPhase,
    constants: GameConstants
): number
getBubbleX(
    col: number,
    row: number,
    rowPhase: RowPhase,
    constants: GameConstants
): number
getBubbleY(row: number, constants: GameConstants): number
getNeighbors(
    row: number,
    col: number,
    rowPhase: RowPhase,
    constants: GameConstants
): GridPosition[]
```

The board is centered horizontally. With `diameter = radius * 2`:

```ts
const boardWidth = constants.GRID_WIDTH * diameter
const boardLeft = (constants.GAME_WIDTH - boardWidth) / 2
const x =
    boardLeft +
    constants.BUBBLE_RADIUS +
    parity * constants.BUBBLE_RADIUS +
    col * diameter
```

For the default 600px canvas and fourteen 40px cells, full rows occupy the centered 560px board region. Offset rows retain the standard one-radius stagger.

`rowOffset` is removed because it is always zero and is not part of the row-insertion model.

When inserting a new row:

1. shift existing row arrays down by one,
2. toggle `rowPhase`,
3. create logical row zero using its new physical column count,
4. recompute every occupied bubble's `x` and `y` from row, column, and phase,
5. normalize `bubblesRemaining` from the grid.

Toggling the phase preserves the physical parity of every shifted existing row. Recomputing coordinates makes the invariant explicit and prevents stale stored positions.

### 2. Elapsed-time projectile simulation

Treat `projectileSpeed` as pixels per second. Change the default from `12` pixels per frame to `720` pixels per second, preserving approximately the current 60Hz feel.

`update(deltaTime)` passes elapsed milliseconds into:

```ts
updateProjectile(deltaTimeMs: number): boolean
```

Simulation rules:

- Clamp one RAF delta to `50ms` so tab suspension cannot create an unbounded jump.
- Calculate total travel from velocity and elapsed seconds.
- Split the frame into enough equal substeps that one substep travels no farther than `bubbleRadius / 2`.
- After each substep, reflect at side walls, then check bubble collision and ceiling collision.
- Stop processing immediately after attachment or game over.

The side-wall reflection updates both direction and position. For the left wall:

```ts
projectile.x = minX + (minX - projectile.x)
projectile.vx = Math.abs(projectile.vx)
```

The right wall uses the symmetric calculation. The projectile must finish every substep inside `[radius, gameWidth - radius]`.

This is sufficient for the current speeds and bubble sizes; continuous swept-circle collision or an external physics library would add complexity without meaningful benefit.

### 3. Impact-specific legal attachment

Represent the reason for attachment explicitly inside `BubbleShooterGame.ts`:

```ts
type ProjectileImpact =
    | { kind: 'ceiling' }
    | { kind: 'bubble'; anchor: GridPosition }
```

Attachment candidates depend on impact type:

- **Bubble impact:** only empty neighbors of the collided anchor are candidates.
- **Ceiling impact:** only empty cells in logical row zero are candidates.

Choose the legal candidate whose center is nearest the projectile. Remove the current whole-board search and forced row-zero-center fallback.

Before writing a bubble, verify that the selected cell is still empty. If no legal candidate exists:

1. clear the projectile,
2. mark the state for redraw,
3. end the run through the existing caught `end()` path,
4. do not modify any grid cell or bubble count.

A shot must never teleport to an unrelated location or replace an occupied bubble.

### 4. Authoritative board synchronization

Add two private helpers to `BubbleShooterGame`:

```ts
private refreshBubbleCoordinates(constants: GameConstants): void
private syncBubbleCount(): number
```

`refreshBubbleCoordinates` derives every occupied bubble position from the current row, column, and phase. `syncBubbleCount` scans the at-most-280 grid cells, stores the total in `state.bubblesRemaining`, and returns it.

Call these helpers after initialization, attachment, match removal, unsupported-cluster removal, and row insertion. The small scan is preferable to distributed increment/decrement bookkeeping that can drift when rows are shifted, cells are dropped, or attachment fails.

### 5. Matching and unsupported-cluster removal

Replace the current void match check with a resolution that distinguishes direct matches and dropped bubbles:

```ts
interface ShotResolution {
    directMatches: GridPosition[]
    dropped: GridPosition[]
    removedCount: number
}
```

Resolution flow:

1. Flood-fill same-color neighbors from the attached bubble.
2. If fewer than three bubbles are connected, remove nothing and return an empty resolution.
3. Remove the direct same-color cluster.
4. Flood-fill through all remaining colors from every occupied top-row cell.
5. Remove every occupied cell not reached from the ceiling.
6. Synchronize the bubble count.
7. Award ten points for each bubble removed by the shot, including dropped bubbles.
8. Increment `successfulShots` once.
9. Add the full removed count to `bubblesPopped` and use it for `largestCombo`.
10. Award the all-clear bonus only after direct and dropped removals are complete.

Ceiling connectivity is also normalized after random initialization and row insertion. Those maintenance removals do not award points or change successful-shot statistics; only a successful player shot does.

### 6. Future bubble colors

Add a helper that scans the grid for unique active colors:

```ts
private getAvailableBubbleColors(): number[]
```

If the board contains bubbles, it returns only colors present in the grid. If the board is empty, it returns a copy of `config.colors`.

The current queue behavior is retained so the already-previewed next bubble becomes current as soon as the player shoots. After shot resolution and any row insertion, reconcile `nextBubble`:

- keep it when its color remains available,
- reroll it from the available colors when its color disappeared,
- use the configured palette after an all-clear.

This avoids changing a bubble the player has already been shown while preventing later unplayable colors.

### 7. Lifecycle, previews, and statistics

Add `successfulShots` to state, end-game stats, and game data. Accuracy becomes:

```ts
shotsFired > 0 ? (successfulShots / shotsFired) * 100 : 0
```

The Start button handler checks the current state before starting. If a previous run has already started and is no longer active, it resets the game first so both `BaseGame` state and `ScoreManager` are clean.

Preview drawing is made null-aware:

- always clear the preview canvas when the current or next color changes,
- draw a bubble only when a color exists,
- reset cached preview colors on reset, restart, and ended-run start.

The page imports `DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval` in Astro frontmatter and renders the actual default interval in the rules copy. The rules also state that unsupported bubbles fall and that accuracy means the percentage of shots that clear bubbles.

### 8. Renderer behavior

`BubbleShooterRenderer` remains coordinate-driven and does not gain grid knowledge. Its responsibility is still to draw the state it receives. Correcting state coordinates is sufficient to fix rendered overlap.

No renderer refactor or animation work is included.

## State transition flow

For one shot:

1. `shoot()` creates the projectile, promotes the previewed next bubble, and increments `shotsFired`.
2. RAF calls `update(deltaTimeMs)`.
3. Projectile simulation runs bounded substeps until no impact occurs or an impact is found.
4. The impact-specific candidate resolver selects a legal empty cell.
5. The projectile attaches, coordinates and count synchronize, and the direct match resolves.
6. A successful match removes ceiling-disconnected bubbles and updates score/statistics.
7. `shotCount` increments; a configured interval row is inserted only when the board is still non-empty.
8. Ceiling connectivity and count synchronize after any row insertion.
9. The future queue color is reconciled against active board colors.
10. Game-over checks run against the corrected coordinates.
11. The projectile is cleared and the state is emitted for rendering.

## Invariants

The implementation and tests enforce these invariants:

- Every row's length matches `getRowColumnCount(row, rowPhase, constants)`.
- Every occupied bubble's coordinates equal the geometry helpers for its row and column.
- Neighbor relations use the same physical parity as rendered coordinates.
- Adjacent grid neighbors are one bubble diameter apart within floating-point tolerance.
- No attachment writes into an occupied cell.
- `bubblesRemaining` equals the number of occupied grid cells after every mutation.
- A projectile is either in flight or has been cleared after attachment/blockage; it is never left outside wall bounds.
- Every retained bubble is connected to an occupied top-row cell.
- `nextBubble` uses an active color unless the board is empty.
- `successfulShots <= shotsFired`, so accuracy remains between 0% and 100%.

## Error handling

- Existing asynchronous `end()` calls remain caught and logged.
- A blocked attachment is treated as a normal game-over condition, not an exception.
- Invalid geometry should be prevented through helper bounds and regression tests rather than hidden with a global fallback.
- No new network, persistence, or renderer failure paths are introduced.

## Testing strategy

### Pure geometry tests

- Full and offset rows are centered correctly for both row phases.
- Column counts alternate correctly as `rowPhase` changes.
- Neighbor sets and bounds use physical parity.
- Neighbor center distances equal the bubble diameter.

### Game mechanics tests

- One and two row insertions preserve coordinates, widths, connectivity, and bubble counts.
- Simulating equal elapsed time at 30Hz, 60Hz, and 120Hz produces approximately equal projectile positions.
- Wall bounces leave the projectile inside legal bounds.
- A clamped delayed frame cannot tunnel through a bubble.
- Bubble impacts attach only to an empty anchor neighbor.
- Ceiling impacts attach only to row zero.
- A blocked/full board ends without overwriting a cell.
- A direct match removes unsupported clusters and scores the combined removal.
- Connectivity normalization does not award points during initialization or row insertion.
- Queue colors are drawn from active colors and fall back to the configured palette on an empty board.
- Accuracy uses successful shots.

### Initializer and page tests

- Starting after game over resets score and Bubble Shooter statistics before calling `start()`.
- Reset/restart clears preview canvases and cached colors.
- Existing pointer controls and RAF behavior remain intact.
- Static page markup contains the configured row interval and corrected rules.

### Final validation

- targeted Bubble Shooter unit and initializer tests,
- full unit suite,
- typecheck,
- lint,
- formatting check,
- production build,
- existing Bubble Shooter E2E happy-path coverage.

## Risks and mitigations

### Random-board tests

Random initial and added rows can make assertions flaky. Tests will stub `Math.random` or inject deterministic state before invoking mechanics.

### Floating-point comparisons

Hex vertical spacing uses `Math.sqrt(3)`. Geometry tests use `toBeCloseTo` rather than strict equality for distances and coordinates involving that value.

### Large change in one PR

The user explicitly requested one implementation PR. The plan keeps review manageable by sequencing commits around independently testable mechanics: geometry, physics, attachment, match resolution, lifecycle/UI, then full verification. No unrelated refactor is bundled.

## Acceptance criteria

- The original overlap and visually-connected-but-not-matching failure cannot be reproduced after row insertion.
- Geometry, collision, matching, and rendering agree after any tested number of row additions.
- Projectile behavior is refresh-rate independent and collision-safe under bounded delayed frames.
- Attachment never teleports or overwrites.
- Bubble count never drifts from grid occupancy.
- Successful matches remove unsupported clusters.
- Future colors remain playable.
- A second run starts cleanly.
- Accuracy and page rules describe the implemented behavior.
- All planned validation commands pass before the draft PR is marked ready.