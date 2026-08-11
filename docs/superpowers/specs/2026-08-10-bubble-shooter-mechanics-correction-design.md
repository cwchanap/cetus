# HPA-121 Bubble Shooter Mechanics Correction Design

**Issue:** HPA-121  
**Date:** 2026-08-10  
**Status:** Approved for a single implementation PR

## Summary

Bubble Shooter currently lets its logical hex grid, stored bubble coordinates, projectile simulation, and attachment rules drift apart. That explains the reported bubble overlap and cases where a visually connected group of three does not clear.

The correction stays small and uses the existing architecture:

- phase-aware hex geometry in the Bubble Shooter helpers,
- authoritative board-coordinate/count synchronization,
- elapsed-time projectile movement with bounded collision substeps,
- impact-local attachment without teleport/overwrite fallbacks,
- direct-match plus ceiling-connectivity cleanup,
- active-board future colors and successful-shot accuracy,
- one targeted `BaseGame.start()` restart fix shared by every framework-native game,
- corrected preview/rules behavior and regression coverage.

No physics engine, shared hex-grid package, renderer rewrite, persistence migration, or compatibility shim is added.

## Verified root causes

1. `addRowAtTop()` shifts row arrays down and updates `y`, but the shifted bubble keeps its old `x` while `getBubbleX()` and `getNeighbors()` derive parity from the new logical row number.
2. `BubbleShooterGame.update()` discards `deltaTime`; projectile velocity is therefore applied once per animation frame.
3. `findAttachPosition()` can search the whole board and ultimately force a row-zero fallback. `attachBubble()` writes that position without a final occupied-cell contract.
4. `BaseGame.start()` clears game-over flags but does not reset state, timer history, or `ScoreManager`, so starting an ended framework-native game can retain the previous run unless the initializer manually resets first.
5. Match resolution removes only the direct same-color cluster and leaves bubbles disconnected from the ceiling suspended.
6. Bubble generation always samples the configured palette, even after a color no longer exists on the board.
7. The page says a row appears after every shot while `rowAddInterval` defaults to five.

## Goals

- Keep rendered bubble coordinates and logical hex neighbors consistent after any number of inserted rows.
- Make projectile travel depend on elapsed time, not refresh rate.
- Keep projectile collision safe when `projectileSpeed` is increased later.
- Restrict attachment to cells physically reachable from the detected impact.
- Never overwrite an occupied cell and never teleport a blocked shot elsewhere.
- Make the grid authoritative for `bubblesRemaining`.
- Remove bubbles disconnected from the ceiling after successful match resolution and after board-maintenance mutations.
- Generate the opening queue only after startup connectivity cleanup.
- Keep future queue colors playable without rerolling the bubble already shown as current.
- Start a completed `BaseGame` run from clean state without duplicating reset logic in each initializer.
- Define `BaseGame.update(deltaTime)` in seconds and make Bubble Shooter follow that contract.
- Keep tests deterministic and implementation-local.

## Non-goals

- New Pixi assets, animations, particles, sounds, power-ups, levels, or difficulty modes.
- A general-purpose physics engine.
- A shared hex-grid or graph package.
- Reusing `src/lib/games/shared/match3.ts`; it models rectangular run matching/gravity, not hex connectivity.
- A broad `BaseGame` lifecycle redesign beyond resetting a completed run before `start()` begins the next run and documenting the `deltaTime` unit.
- Database/schema changes or score-history migration.
- Backward compatibility for the internal Bubble Shooter state/helper signatures.

## Existing boundaries and reuse

- `src/lib/games/core/BaseGame.ts` owns generic run lifecycle. The PR adds only completed-run reset semantics and the `deltaTime` unit contract.
- `src/lib/games/bubble-shooter/types.ts` owns Bubble Shooter state/config types.
- `src/lib/games/bubble-shooter/utils.ts` already owns hex coordinates/neighbors and is extended in place.
- `src/lib/games/shared/geometry.ts` already provides `distance`; attachment and collision continue to reuse it.
- `src/lib/games/bubble-shooter/BubbleShooterGame.ts` owns projectile, board mutation, matching, scoring, row insertion, and queue decisions.
- `src/lib/games/bubble-shooter/BubbleShooterRenderer.ts` remains coordinate-driven and unchanged.
- `src/lib/games/bubble-shooter/initFramework.ts` owns the RAF loop, pointer controls, previews, and DOM synchronization.
- `src/pages/bubble-shooter/index.astro` owns static rules copy.

## 1. Shared completed-run restart semantics

`BaseGame.start()` should reset an ended run before starting the new run:

```ts
start(): void {
    if (this.state.isActive) {
        return
    }

    if (this.state.gameStarted && this.state.isGameOver) {
        this.reset()
    }

    this.runGuard.next()
    // existing start flow...
}
```

This fixes the lifecycle at the owning abstraction instead of adding another initializer workaround. Existing initializers that already call `reset()` before `start()` remain safe: their reset produces `gameStarted: false`, so the new BaseGame guard is a no-op.

The implementation adds a core regression proving state and `ScoreManager` are reset when `start()` follows an ended run. It does not remove unrelated initializer guards in this PR.

## 2. `deltaTime` contract

`BaseGame.update(deltaTime)` is documented as receiving **elapsed seconds**.

Evader already uses this convention. Bubble Shooter's RAF loop must therefore convert `performance.now()` milliseconds to seconds before calling `game.update(deltaTimeSeconds)`.

Bubble Shooter keeps its own defensive clamp inside game logic:

```ts
const MAX_PROJECTILE_FRAME_SECONDS = 0.05
const deltaSeconds = Math.min(Math.max(deltaTime, 0), 0.05)
```

Keeping the clamp inside the game makes the physics behavior unit-testable without a browser loop.

## 3. Phase-aware centered hex geometry

Add:

```ts
export type RowPhase = 0 | 1
```

and `rowPhase: RowPhase` to `BubbleShooterState`. Physical parity is:

```ts
const parity = ((row + rowPhase) % 2) as RowPhase
```

All row width, coordinate, neighbor, bounds, and candidate calculations use that physical parity through Bubble Shooter-local helpers:

```ts
getRowParity(row, rowPhase)
getRowColumnCount(row, rowPhase, constants)
getBubbleX(col, row, rowPhase, constants)
getBubbleY(row, constants)
getNeighbors(row, col, rowPhase, constants)
```

The board is horizontally centered. For the default 600px canvas, 20px radius, and 14-column full row, the 560px grid occupies x=20..580 at its bubble edges. That matches the projectile wall bounds exactly. Today the left-aligned grid leaves an attachability mismatch at the right edge, so centering is part of geometry correctness rather than visual polish.

`rowOffset` is removed because it is always zero and is not needed by the phase model.

When inserting a row:

1. snapshot the active color set used to generate the new row,
2. shift rows downward,
3. toggle `rowPhase`,
4. create the new row-zero shape,
5. recompute all occupied bubble coordinates from row/column/phase,
6. remove bubbles no longer connected to row zero,
7. synchronize `bubblesRemaining`,
8. only then reconcile the future queue.

## 4. Dense authoritative board state

Use dense `(Bubble | null)[]` rows; empty cells are explicit `null`, never sparse holes.

Add private helpers:

```ts
private createEmptyRow(row: number, constants: GameConstants): (Bubble | null)[]
private refreshBubbleCoordinates(constants: GameConstants): void
private syncBubbleCount(): number
```

`refreshBubbleCoordinates` recalculates every occupied `x/y` from row/column/phase. `syncBubbleCount` scans the at-most-280 cells and writes the occupied count to state.

The scan intentionally replaces distributed increment/decrement bookkeeping because mutation paths now include row shifts and cluster drops.

## 5. Elapsed-time projectile simulation

Treat `projectileSpeed` as pixels per second. Change the default from `12` pixels/frame to `720` pixels/second to preserve approximately the 60Hz feel.

For one `update(deltaTimeSeconds)`:

1. clamp elapsed time to `0.05s`,
2. compute travel from current velocity,
3. split the frame so each substep travels at most `bubbleRadius / 2`,
4. move one substep,
5. reflect the projectile position and velocity inside side-wall bounds,
6. check bubble collision first,
7. check ceiling collision second,
8. stop immediately after the projectile resolves.

Bubble collision must remain higher priority than ceiling collision. With a valid dense top row, a projectile approaching an occupied ceiling cell should collide with that bubble before being classified as a bare ceiling impact.

The substep loop is retained even though 720px/s × 0.05s = 36px is smaller than the default 40px collision diameter. It protects the existing speed configuration knob. The regression therefore uses a deliberately higher speed (4000px/s) so a single 50ms step would travel 200px and tunnel through a bubble without substeps.

## 6. Impact-local attachment

Use:

```ts
type ProjectileImpact =
    | { kind: 'ceiling' }
    | { kind: 'bubble'; anchor: GridPosition }
```

Candidate rules:

- bubble impact: only empty in-bounds neighbors of the collided anchor,
- ceiling impact: only empty cells in logical row zero.

The closest candidate is selected with the existing shared `distance` helper.

Remove the whole-board search and forced top-center fallback.

### Blocked impact behavior

No legal candidate is **not** itself a game-over condition. A blocked projectile:

1. is cleared,
2. marks redraw,
3. writes no bubble,
4. creates no match and does not increment `successfulShots`,
5. is still a consumed shot (`shotsFired` was already incremented by `shoot()`),
6. participates in the normal row-add interval bookkeeping,
7. ends the run only if the existing danger-zone check becomes true after normal shot/row resolution.

`checkGameOverCondition()` remains the sole gameplay authority for game over. This prevents replacing the old teleport bug with a spurious loss on a locally blocked impact.

A regression uses a locally blocked/partial board that is nowhere near the danger zone and asserts that the projectile is consumed, the grid is unchanged, and the run continues.

## 7. Match resolution and unsupported drops

Use local iterative hex traversal; do not introduce a shared graph abstraction.

```ts
interface ShotResolution {
    directMatches: GridPosition[]
    dropped: GridPosition[]
    removedCount: number
}
```

Contracts:

```ts
private collectColorCluster(start, constants): GridPosition[]
private collectCeilingConnected(constants): Set<string>
private removeUnsupportedBubbles(constants): GridPosition[]
private resolveMatches(attached, constants): ShotResolution
```

`removeUnsupportedBubbles()` only nulls disconnected occupied cells and returns their positions. It does **not** synchronize counts. The caller owns one `syncBubbleCount()` after its complete board mutation sequence.

Successful shot resolution:

1. collect the attached bubble's same-color cluster,
2. if fewer than three, remove nothing,
3. remove the direct match,
4. remove every remaining bubble not connected to row zero,
5. synchronize count once,
6. score `10 × (direct + dropped)`,
7. increment `successfulShots` once,
8. add the full removed count to `bubblesPopped`,
9. update `largestCombo` with the full removed count,
10. add the 1000-point all-clear bonus after both removal phases.

Startup and added-row connectivity cleanup use the same drop primitive but award no score/stat changes.

## 8. Startup ordering and active colors

Startup order is explicit:

```text
initialize grid
→ refresh coordinates
→ remove unsupported bubbles
→ sync bubble count
→ generate current bubble
→ generate next bubble
```

This prevents a color that exists only on a soon-to-be-culled floating startup bubble from entering the opening queue.

`getAvailableBubbleColors()` returns unique colors currently present on the board, falling back to `config.colors` when the board is empty.

Initial-grid generation samples one fixed copy of `config.colors`; it does not let a partially generated board feed back into later cells.

Added-row generation snapshots active colors **before** mutating the row. After match resolution and any interval row insertion have completed, `reconcileNextBubbleColor()` runs exactly once:

- keep `nextBubble` when its color still exists,
- reroll only `nextBubble` when its color disappeared,
- use the configured palette after an all-clear,
- never reroll `currentBubble` after it has been shown to the player.

## 9. Statistics and rules

Add `successfulShots` to Bubble Shooter state, end stats, and game data.

Accuracy becomes:

```ts
shotsFired > 0 ? (successfulShots / shotsFired) * 100 : 0
```

The page imports `DEFAULT_BUBBLE_SHOOTER_CONFIG.rowAddInterval` and states the configured interval rather than hardcoding "after each shot". It also explains that unsupported bubbles fall and that accuracy means shots that clear bubbles.

Preview canvases are cleared when current/next becomes null and on reset/restart. No Bubble Shooter-specific ended-run reset is added because `BaseGame.start()` now owns that behavior.

## State transition for one shot

1. `shoot()` creates the projectile, promotes the previewed next bubble, generates a future next bubble, and increments `shotsFired`.
2. RAF passes elapsed seconds to `update()`.
3. Projectile simulation runs bounded substeps.
4. Bubble collision is checked before ceiling collision.
5. Impact-local candidates are evaluated.
6. If a legal cell exists, insert and resolve direct/drop matches; otherwise consume the blocked projectile without writing a cell.
7. Increment the row-interval shot counter for the resolved shot.
8. Add/normalize a row when the configured interval is reached and the board is non-empty.
9. Synchronize board count after mutation/cleanup.
10. Reconcile only `nextBubble` against active colors.
11. Clear the projectile.
12. `checkGameOverCondition()` decides whether to call `end()`.

## Invariants

- Every row length equals `getRowColumnCount(row, rowPhase, constants)`.
- Every index inside a row exists and contains either `Bubble` or `null`.
- Every occupied bubble coordinate equals the geometry helper result for its row/column/phase.
- Logical neighbor relations use the same physical parity as rendered geometry.
- Every geometric neighbor is one bubble diameter away within floating-point tolerance.
- Projectile `x` remains within side-wall bounds after each substep.
- Bubble collision takes precedence over ceiling collision.
- No attachment writes into an occupied cell.
- No blocked impact teleports to another region or ends the run by itself.
- `bubblesRemaining` equals occupied grid cells after every board mutation sequence.
- Every retained bubble is connected to row zero after maintenance cleanup.
- Opening queue colors are sampled only after startup connectivity cleanup.
- `nextBubble` uses an active color unless the board is empty.
- `successfulShots <= shotsFired`.
- `BaseGame.start()` after an ended run starts from reset state and score.
- `BaseGame.update(deltaTime)` uses seconds.

## Testing strategy

### Core framework

- End a minimal `BaseGame`, add score/state before end, call `start()`, and assert the second run begins with initial state and zero `ScoreManager` score.
- Preserve the existing `start()` no-op while already active.

### Geometry and board

- Rewrite existing utility suites to the phase-aware signatures and centered coordinates.
- Assert both row phases, row widths, neighbor bounds, and neighbor distances.
- Assert dense rows with indexed checks (`col in row` and `row[col] !== undefined`).
- Insert one and two rows and assert phase, coordinates, widths, and counts.

### Projectile and attachment

- Simulate equal elapsed seconds at 30Hz/60Hz/120Hz and compare positions.
- Test wall reflection keeps the projectile in bounds.
- At 4000px/s, use one 50ms update with a bubble 100px along the path and assert attachment; this fails without substeps.
- Fill only the local impact candidate set while keeping the board below the danger zone; assert shot consumed, grid unchanged, game active.
- Assert bubble impact is evaluated before ceiling impact when both thresholds are reached in one substep.

### Match/drop/colors

- Direct match removes the cluster plus unsupported bubbles and scores both.
- Maintenance connectivity cleanup awards no points.
- A floating-only startup color is removed before opening current/next generation.
- Added-row ordering removes unsupported colors before next-bubble reconciliation.
- Empty board falls back to configured colors.
- Accuracy uses `successfulShots / shotsFired`.

### Initializer/page

- RAF converts elapsed milliseconds to seconds before `game.update()`.
- Preview canvases clear when colors become null/reset.
- Rules render the configured row interval and no stale "after each shot" text.

## Risks

### Scoring-era comparability

Dropped bubbles will now award points and accuracy changes to a true hit-rate metric. New Bubble Shooter score/stat rows therefore use slightly different semantics from historical rows. No migration/versioning is included in this mechanics PR; leaderboard history may mix the two scoring eras.

### Shared restart semantics

Changing `BaseGame.start()` affects all framework-native games. The change is intentionally narrow and must run the full unit/E2E suite. Existing initializer-level reset guards are left in place to avoid unrelated cleanup churn.

### Random generation

Tests stub `Math.random` or inject deterministic board state.

### Floating point

Hex vertical spacing uses `Math.sqrt(3)`; geometry tests use approximate assertions where appropriate.

## Acceptance criteria

- Original overlap and visually-connected-but-not-matching failures are covered by regression tests and corrected by one geometry model.
- The centered grid aligns its outer bubble edges with projectile wall bounds.
- Equal elapsed time produces equivalent projectile travel across refresh rates.
- High configurable projectile speed cannot tunnel through bubbles under the bounded substep model.
- Attachment never teleports or overwrites.
- A locally blocked impact does not cause game over; danger-zone detection remains the only game-over authority.
- Bubble count cannot drift from grid occupancy.
- Matches remove unsupported clusters.
- Opening/future queue colors remain playable after maintenance cleanup.
- Starting any completed framework-native game through `BaseGame.start()` resets previous run state and score.
- `BaseGame.update(deltaTime)` is documented/used in seconds.
- Accuracy and page rules match implemented behavior.
- Focused tests, full tests, typecheck, lint, format check, build, and existing E2E coverage pass before the draft PR is marked ready.