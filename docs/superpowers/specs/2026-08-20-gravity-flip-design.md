# Gravity Flip — Design Spec

- **Linear issue:** [HPA-73 — Minigame: Gravity Flip](https://linear.app/cwchanap/issue/HPA-73/minigame-gravity-flip)
- **Date:** 2026-08-20
- **Status:** Planning draft, reviewed for implementation

## Overview

Gravity Flip is a one-button precision runner. The player auto-runs through a horizontal corridor while gravity continuously pulls toward either the floor or ceiling. Pressing the flip control reverses gravity; it does **not** teleport the player or zero vertical velocity. The player uses the resulting arcs to avoid spikes, cross floor/ceiling gaps, dodge moving hazards, and optionally collect stars.

Version 1 is one 60-second run. The world scrolls past a fixed horizontal player position. Challenge spacing tightens and scroll speed rises with **simulated gameplay time**, while `BaseGame` remains the authority on the real 60-second run timer. A lethal collision ends the run immediately; surviving until the countdown reaches zero completes it.

The implementation remains local to Gravity Flip: `BaseGame` owns countdown, completed-run reset, score saving, stale-save protection, achievements, and challenge updates; `PixiJSRenderer` owns the canvas; a Gravity Flip initializer owns one requestAnimationFrame loop, following the existing Evader shape. There is no shared runner framework, physics engine, level editor, generic spawner, new persistence path, or backend change.

## Product Goals

- Deliver a recognizable **auto-run → flip gravity → thread hazards → collect stars** loop in about one minute.
- Preserve vertical momentum through gravity changes so timing matters.
- Increase pressure continuously without difficulty modes or a progression subsystem.
- Make the first obstacle deterministic and readable so a new player immediately learns that a flip is required.
- Keep every mover fair by construction: resting on either rail must remain legal at both mover extrema.
- Support keyboard, pointer/touch, and native button activation through one `flipGravity()` API.
- Reuse Cetus score submission, leaderboard/progress, achievements, stale-run protection, and `GamePage` infrastructure.
- Keep deterministic tests to one injected `rng: () => number` seam; do not add a clock abstraction.
- Treat balance-sensitive numbers as initial v1 tuning defaults until the implementation PR passes the manual-play checkpoint.

## Non-Goals

Version 1 does **not** include:

- authored campaign levels, checkpoints, bosses, or level selection;
- a generic endless-runner, collision, input, or physics framework shared with other games;
- `GameInitializer` adoption or refactoring;
- free horizontal movement, jumping, crouching, or multiple abilities;
- procedural geometry generation beyond a private five-item challenge catalog;
- power-ups, shields, lives, revives, economy, upgrades, or permanent progression;
- Daily mode, seeded sharing, replay recording, or resume-after-refresh;
- audio, haptics, particle-system infrastructure, or image assets;
- per-pixel triangle/circle collision geometry;
- database, API, auth, score-service, or leaderboard changes.

## Reuse Decisions

### BaseGame remains the run authority

`GravityFlipGame` extends `BaseGame`. BaseGame already provides:

- the 60-second `GameTimer`;
- completed-run reset on the next `start()`;
- score accumulation/final submission;
- final timer snapshots;
- stale async-save suppression through the existing run guard;
- achievement/challenge result delivery.

Gravity Flip uses `timeBonus: false`; distance and stars are the complete score. Do not add a second timer, score-save path, or stale-run token.

### PixiJSRenderer with two redraw layers

Continuous movement belongs on canvas. `GravityFlipRenderer` uses a fixed 800×320 logical canvas with:

- one static corridor/background layer;
- one dynamic scene layer cleared and redrawn each render.

The entity count is tiny. Per-entity maps, pooling, textures, and sprite infrastructure are unnecessary.

### Game-local requestAnimationFrame loop

The initializer follows Evader's local loop:

```text
requestAnimationFrame
→ clamp outer delta to 0.1 s
→ game.update(deltaSeconds)
→ renderer.render(game.getState())
→ request next frame
```

The game, not the initializer, owns collision-safe internal substeps. Do not introduce a shared animation-loop service.

### Shared math only where it already exists

Reuse `clamp`, `lerp`, and `rectOverlap` from `src/lib/games/shared/utils.ts`, matching Evader. Do not create Gravity Flip copies or migrate to the parallel `shared/geometry.ts` helpers as part of HPA-73.

### Inject RNG only

Production uses `Math.random`; tests inject `rng: () => number`, matching Pattern Pulse's narrow deterministic seam. Run duration is still owned by BaseGame/GameTimer. Difficulty progression uses an accumulated simulation-time field described below, so no `Date.now()` calls or clock injection are needed in `GravityFlipGame`.

## Structural Rules vs Tuning Defaults

The following are structural v1 contracts and are not balance knobs:

| Structural rule | Value |
|---|---:|
| Run duration | 60 seconds |
| Logical canvas | 800 × 320 px |
| Player X | 150 px |
| Maximum internal physics step | 1/120 s |
| First challenge | floor spike |
| Hazard catalog | 5 closed kinds |
| Score formula | distance + stars only |
| BaseGame time bonus | disabled |

The following are **initial tuning defaults**, not immutable product requirements. They are the starting values implemented and unit-tested, then reviewed in the manual-play checkpoint before HPA-73 is considered ready:

| Tuning value | Initial default |
|---|---:|
| Player size | 28 px |
| Corridor inset | 36 px |
| Gravity acceleration | 1800 px/s² |
| Maximum vertical speed | 700 px/s |
| Initial world speed | 220 px/s |
| Final world speed | 360 px/s |
| Initial challenge spacing | 520 px |
| Final challenge spacing | 400 px |
| Moving hazard unlock | 15 simulated seconds |
| Spike width × height | 52 × 34 px |
| Gap width × height | 90 × 18 px |
| Mover size | 40 px |
| Mover vertical speed | 180 px/s |
| Mover rail clearance | 28 px |
| Star radius | 10 px |
| Gap rail tolerance | 0.5 px |

Production defines these once in `GRAVITY_FLIP_RULES` in `types.ts`. Page/initializer/renderer code must not define competing values.

If manual play changes a tuning default, the implementation PR updates `GRAVITY_FLIP_RULES`, affected exact-value tests, and this design document together before final gates. The architecture and structural rules do not change during tuning.

## Gravity and Movement

```ts
type GravityDirection = 'down' | 'up'
```

The player begins resting on the floor with downward gravity and zero vertical velocity. `flipGravity()` accepts input only while active/not paused/not over, changes `down ↔ up`, increments `flips`, and preserves vertical velocity.

Each physics substep applies acceleration in the active gravity direction, clamps vertical speed, advances Y, then clamps the player against the ceiling/floor surfaces. Contact with a solid surface zeroes vertical velocity.

Keeping velocity through a flip is load-bearing. It makes the action a timing game rather than a two-lane teleport.

## Simulation Time and Difficulty Ramp

`BaseGame/GameTimer` remains the only authority on how long the run lasts. Gravity Flip separately tracks only **simulated gameplay time** for speed/density tuning:

```ts
private elapsedSimSeconds = 0
```

Every accepted physics substep does:

```ts
elapsedSimSeconds = Math.min(duration, elapsedSimSeconds + step)
progress = clamp(elapsedSimSeconds / duration, 0, 1)
worldSpeed = lerp(initialWorldSpeed, finalWorldSpeed, progress)
challengeSpacing = lerp(initialChallengeSpacing, finalChallengeSpacing, progress)
```

This deliberately avoids deriving physics difficulty from `GameTimer`'s `Date.now()`-based elapsed time. If a tab is backgrounded and rAF pauses, the BaseGame countdown can still expire, but returning to the tab never jumps the simulation to a denser/faster state that the player did not actually simulate.

Tests advance the ramp with `update()` calls only; they do not advance the 60-second GameTimer to test difficulty.

## Closed Challenge Catalog

The five hazard kinds are a closed content union:

```ts
type GravityFlipHazardKind =
  | 'floor-spike'
  | 'ceiling-spike'
  | 'floor-gap'
  | 'ceiling-gap'
  | 'mover'
```

Descriptor states are discriminated by `shape`, so impossible combinations such as a spike with `surface: null` are unrepresentable:

```ts
export type GravityFlipHazardDescriptor =
  | {
      shape: 'spike' | 'gap'
      surface: 'floor' | 'ceiling'
      hasStar: boolean
    }
  | {
      shape: 'mover'
      hasStar: false
    }

export const GRAVITY_FLIP_HAZARD_CATALOG: Readonly<
  Record<GravityFlipHazardKind, GravityFlipHazardDescriptor>
> = {
  'floor-spike':   { shape: 'spike', surface: 'floor',   hasStar: true },
  'ceiling-spike': { shape: 'spike', surface: 'ceiling', hasStar: true },
  'floor-gap':     { shape: 'gap',   surface: 'floor',   hasStar: true },
  'ceiling-gap':   { shape: 'gap',   surface: 'ceiling', hasStar: true },
  mover:           { shape: 'mover', hasStar: false },
}
```

Challenge eligibility, spawn geometry, star placement, collision dispatch, and renderer shape dispatch all use this table. Production code must not classify kinds with `startsWith`, `endsWith`, regexes, substring checks, or a second kind-to-shape/surface table.

The first challenge of every fresh run is always `floor-spike`, spawned beyond the right edge. After that:

- before the mover unlock point, eligible catalog rows are the non-mover rows;
- at/after the mover unlock point, all five rows are eligible;
- one challenge is spawned per spacing interval;
- spike/gap rows place one star on the opposite safe surface when `hasStar` is true;
- movers do not carry a star;
- challenges never intentionally compose multiple lethal patterns at the same spawn position.

The deterministic random order is the insertion order of this single catalog object. This remains private Gravity Flip content logic, not a generic generator.

## Hazard Semantics

### Spikes

Spikes use conservative AABBs over their rendered triangle cluster. Pixel-perfect triangle collision is out of scope.

### Gaps

A gap is a lethal missing segment in one corridor surface. The player still uses the same top/bottom clamp; if the player's horizontal hit box overlaps a gap while the player center is within `gapRailTolerance` of that gap's descriptor rail center, the run ends. There is no separate fall-out-of-world simulation.

`gapRailTolerance` is part of `GRAVITY_FLIP_RULES`; it is not a magic number in collision code.

### Movers and the rail-safety invariant

A mover scrolls left with the world and bounces vertically only inside the corridor interior. Its top-left Y bounds are derived from the larger of the current player body and authored extra rail clearance:

```ts
clearance = Math.max(playerSize, moverRailClearance)
minY = corridorInset + clearance
maxY = canvasHeight
     - corridorInset
     - clearance
     - moverSize
```

With initial defaults this is `[64, 216]`. A ceiling-resting 28px player occupies Y `[36,64]`; a floor-resting player occupies Y `[256,284]`. Cetus `rectOverlap` uses exclusive edge semantics, so both extrema only edge-touch a resting player.

The formula must also remain correct when player size changes. With `playerSize: 40`, the clearance becomes 40 and mover bounds become `[76, 204]`; the resting-player AABBs still only edge-touch the mover. Unit tests lock both the default and non-default-player-size cases.

`moverRailClearance` may be tuned above the player size to create extra visual/gameplay margin, but it may never reduce clearance below the player body because the helper always takes `Math.max(playerSize, moverRailClearance)`.

`getGravityFlipMoverBounds(config)` is the single production helper for these bounds. `spawnMover()` starts inside them and mover updates clamp/reverse against them. If a test supplies a physically impossible config where `maxY < minY`, the helper may throw a `RangeError`; normal catalog dispatch does not require defensive descriptor throws or null guards.

### Stars

Every eligible spike/gap challenge places one optional star on the opposite descriptor surface at the same challenge X. Star collection uses conservative diameter-AABB vs player-AABB overlap, removes the star once, and increments `starsCollected` once. Stars are never required to survive and never affect generation.

## Collision-Safe Substeps

`update(deltaTime)` ignores non-positive/non-finite deltas and inactive/paused runs. For a valid outer delta:

```ts
remaining = Math.min(deltaTime, 0.1)
step = Math.min(remaining, maxPhysicsStep) // 1/120 s
```

Each substep advances:

1. `elapsedSimSeconds` and the speed/spacing ramp;
2. player vertical physics;
3. world distance;
4. hazard/mover X/Y;
5. star X;
6. star collection;
7. lethal collision;
8. challenge-spacing accumulation/spawn.

The loop stops when the clamped outer time is consumed or the run ends.

The substep regression uses an intentionally thin test hazard:

```ts
spikeWidth: 8
canvasWidth: 164
spawnOffsetX: 0
playerX: 150
initialWorldSpeed: 360
finalWorldSpeed: 360
```

The 28px player occupies X `[136,164]`. The spike starts `[164,172]`, touching but not overlapping under exclusive AABB semantics. A hypothetical single 0.1-second endpoint move shifts it 36px to `[128,136]`, again edge-touching only. At 1/120-second increments the spike crosses the player's interval and collision is detected. Default catalog sizes remain unchanged.

## Challenge Scheduling

`GravityFlipGame` keeps three small private runtime values outside submitted state:

```ts
private elapsedSimSeconds = 0
private distanceSinceChallenge = 0
private entitySequence = 0
```

A local helper supplies deterministic IDs:

```ts
private entityId(prefix: 'hazard' | 'star'): string {
  return `${prefix}-${this.entitySequence++}`
}
```

`onGameStart()` resets all three runtime values, then authors the first `floor-spike`, producing `hazard-0`. Every substep adds `worldSpeed * step` to `distanceSinceChallenge`. Once it reaches current interpolated spacing, subtract that spacing and spawn one eligible catalog entry from exactly one RNG read.

At a 1/120-second step the travel is only a few pixels while spacing is hundreds of pixels, so one spawn check per substep is sufficient.

Reset clears all three private values. No generic spawn scheduler is introduced.

## Scoring

`calculateGravityFlipScore()` in `scoring.ts` is the only production scoring formula:

```text
distancePoints = floor(distancePx / 50) * 10
starPoints     = starsCollected * 250
score          = distancePoints + starPoints
```

`GravityFlipGame` tracks precise floating-point distance and adds only the positive delta between this pure target score and BaseGame's current score. This makes score independent of frame partitioning. There is no collision penalty or BaseGame time bonus.

## Terminal Outcomes and Presentation

```ts
type GravityFlipOutcome = 'playing' | 'collision' | 'survived'
```

On collision, set `outcome='collision'`, synchronize score once, and call `void this.end()`. BaseGame marks the run inactive synchronously, so overlapping hazards cannot submit twice.

Collision presentation:

- title: **`GRAVITY LOST`**
- outcome: **`Collision`**

`handleTimeUp()` sets `outcome='survived'` before delegating to BaseGame's normal timeout end path.

Survival presentation:

- title: **`RUN COMPLETE`**
- outcome: **`Survived`**

The initializer always writes `#game-over-title` and `#final-outcome`; the page's static overlay title is only fallback copy. Browser smoke remains collision-only; survival copy is deterministic in initializer tests rather than requiring a 60-second E2E wait.

## State, Stats, and Submitted Data

```ts
interface GravityFlipPlayer {
  x: number
  y: number
  velocityY: number
  size: number
}

interface GravityFlipHazard {
  id: string
  kind: GravityFlipHazardKind
  x: number
  width: number
  height: number
  y: number
  verticalVelocity: number
}

interface GravityFlipStar {
  id: string
  x: number
  y: number
  radius: number
}

interface GravityFlipState extends BaseGameState {
  outcome: GravityFlipOutcome
  gravity: GravityDirection
  player: GravityFlipPlayer
  hazards: GravityFlipHazard[]
  stars: GravityFlipStar[]
  distance: number
  starsCollected: number
  flips: number
  worldSpeed: number
}

interface GravityFlipStats extends BaseGameStats {
  outcome: GravityFlipOutcome
  distance: number
  starsCollected: number
  flips: number
}

interface GravityFlipGameData {
  distance: number
  starsCollected: number
  flips: number
  survivedFullRun: boolean
}
```

Submitted `distance` is `Math.floor(state.distance)`. `survivedFullRun` derives from `outcome === 'survived'`.

## Architecture and Files

```text
src/lib/games/gravity-flip/
  types.ts
  scoring.ts
  scoring.test.ts
  GravityFlipGame.ts
  GravityFlipGame.test.ts
  GravityFlipRenderer.ts
  GravityFlipRenderer.test.ts
  initFramework.ts
  initFramework.test.ts
src/pages/gravity-flip/index.astro
```

Platform integration modifies:

```text
src/lib/games.ts
src/lib/games.test.ts
src/lib/organisms.test.ts
src/lib/games/shared/types.ts
src/lib/achievements.ts
src/lib/achievements.test.ts
src/pages/game-board-markup.test.ts
e2e/games/play-coverage.spec.ts
CLAUDE.md
```

`e2e/games/all-games-navigation.spec.ts` stays source-unchanged because it derives targets from `GAMES`.

No `BaseGame`, `GameTimer`, `ScoreManager`, `PixiJSRenderer`, `GameInitializer`, score service, API, `src/lib/server/db/`, or auth production change is planned.

## Component Responsibilities

### `GravityFlipGame.ts`

Owns:

- BaseGame lifecycle;
- private `elapsedSimSeconds` progression;
- player physics/substeps;
- distance/world-speed ramp and score synchronization;
- first challenge plus distance spacing;
- catalog selection/spawn;
- safe mover bounds/bounce;
- descriptor-driven collision;
- star collection;
- terminal outcomes/submitted data;
- a local `emitStateChange()` helper matching existing BaseGame games.

The game never parses hazard kind strings and never derives its difficulty ramp from wall-clock timer status.

### `GravityFlipRenderer.ts`

Uses fixed 800×320 logical coordinates and `responsive: false`; CSS scales the canvas visually. It owns one static corridor graphic and one dynamic scene graphic. Every hazard render looks up `GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]` and switches on the discriminated `descriptor.shape`. `spike`/`gap` cases have non-null `descriptor.surface` by type; mover has no surface. No textures/assets or second shape map are needed.

### `initFramework.ts`

The initializer follows current Pattern Pulse lifecycle/error/debug seams plus Evader's local rAF loop:

1. require `#gravity-flip-container`; report missing DOM with `DOMElementNotFoundError` + `handleGameError`;
2. initialize the renderer with the same error/cleanup convention;
3. create one game and one rAF loop;
4. wire Start, Reset, Play Again, HUD/result, achievement/challenge payloads, keyboard, canvas pointer, and native flip button;
5. install the same active-run `beforeunload` warning shape used by current game initializers;
6. return `{ game, renderer, getGame, getState, cleanup }`;
7. never assign a global itself.

The Astro page assigns the returned handle to `window.gravityFlipGame`, matching `window.gameNameGame.getGame()` debugging.

Play Again intentionally hides the overlay and calls `game.start()`: BaseGame resets a completed run and immediately starts it. The source implementation must comment that this is intentional so it is not replaced by reset-only behavior.

## Input and Accessibility

Equivalent input paths are:

- keyboard `Space`, `ArrowUp`, `ArrowDown`;
- `pointerdown` on the canvas;
- native `#flip-btn` click.

The document keyboard listener ignores repeat, Ctrl/Meta/Alt, editable targets using Pattern Pulse's local shape, and all button targets. When `#flip-btn` is focused, native Enter/Space activation owns the action; document keydown must not flip first and then allow the native click to flip again. No shared input helper or swipe recognizer is added.

The HUD includes textual `FLOOR ↓` / `CEILING ↑` gravity state, so direction is not communicated by color alone.

## Page Contract

`src/pages/gravity-flip/index.astro` uses `GamePage` with:

```text
gameId="gravity-flip"
title="Gravity Flip"
icon="🌗"
initialTime={60}
showPause={false}
showEnd={false}
showReset={true}
```

Stable IDs:

- `#gravity-flip-container`
- `#gravity-flip-canvas`
- `#flip-btn`
- `#gravity-direction`
- `#distance-traveled`
- `#stars-collected`
- `#flip-count`
- `#world-speed`
- `#final-outcome`
- `#final-distance`
- `#final-stars`
- `#final-flips`

`GameOverlay` supplies `#game-over-overlay`, `#game-over-title`, `#final-score`, and `#play-again-btn`. The page-root script initializes outside `GamePage` slots and owns `window.gravityFlipGame` assignment.

## Platform Integration

Add `GameID.GRAVITY_FLIP = 'gravity_flip'`, icon `🌗`, and after the route exists activate:

```ts
{
  id: GameID.GRAVITY_FLIP,
  name: 'Gravity Flip',
  description:
    'Flip gravity to dodge hazards and collect stars in a one-minute precision run',
  category: 'action',
  maxPlayers: 1,
  estimatedDuration: '1 minute',
  difficulty: 'medium',
  tags: ['gravity', 'runner', 'precision', 'single-player', 'action'],
  isActive: true,
  organism: { shape: 'spiral', color: 'magenta' },
  depth: 'mid',
}
```

`getGameUrl()` remains unchanged and derives `/gravity-flip`. Because this adds an eighth `mid` game, `src/lib/organisms.test.ts` must update the exact depth partition from `6 / 7 / 4` to `6 / 8 / 4` in the same registration task.

## Achievements

Four HPA-73 achievements use existing achievement plumbing:

1. **First Flip** — in-game check `flips >= 1`.
2. **Star Catcher** — `starsCollected >= 5`.
3. **Gravity Dancer** — `flips >= 20`.
4. **Full Orbit** — `survivedFullRun === true`.

First Flip is deliberately not a score threshold because distance earns points without a flip.

## Testing Strategy

### Unit/integration coverage

Lock:

- BaseGame lifecycle, score sync, and simulation-time ramp;
- momentum-preserving flips;
- local `emitStateChange()` behavior;
- exact five-row catalog and discriminated descriptor behavior;
- default and `playerSize: 40` mover rail safety using production `rectOverlap`;
- one RNG read per random spawn;
- mover eligibility by simulated time, not wall time;
- descriptor-driven spawn/star/collision/renderer behavior with no null guards;
- gap tolerance sourced from config;
- the non-vacuous 8px tunneling fixture;
- focused-button double-flip prevention;
- active-run before-unload warning and cleanup;
- distinct collision/survival copy;
- `getGame()` debug handle and page-owned global assignment;
- First Flip `0 → false`, `1 → true`;
- `organisms.test.ts` depth partition `6 / 8 / 4`.

### Browser journey

One Playwright journey covers only stable browser composition/lifecycle:

```text
load route
→ canvas visible
→ start
→ no-input loss on authored first spike
→ GRAVITY LOST / Collision
→ Play Again
→ prove a fresh run is active/re-armed
```

Do not perform flip-button/Space/focus assertions inside the live ~3-second hazard window; those are deterministic initializer tests.

### Manual-play tuning checkpoint

After the game is fully wired but before final repository gates, manually play the actual browser game and answer these named questions:

1. **First-spike readability:** Can a first-time player understand and execute the required flip before the authored first spike arrives?
2. **Mid/late sequence fairness:** Around simulated `t≈40s`, is a representative `spike → mover → spike` sequence survivable without a forced collision?
3. **Full-run plausibility:** At the final speed/spacing ramp, is a 60-second survival realistically achievable while stars remain optional rather than required?
4. **Rail safety feel:** Do mover extrema leave both rails visibly usable, matching the AABB invariant rather than merely passing unit tests?

The initial tuning defaults are outputs to validate, not sacred inputs. If play reveals a balance problem, adjust only `GRAVITY_FLIP_RULES` tuning fields and dependent tests/copy; do not redesign the catalog or add new systems.

## Risks and Mitigations

- **Mover unfairness:** derive bounds from `max(playerSize, moverRailClearance)` and test non-default player size.
- **Illegal descriptor states:** discriminated union makes null spike/gap surfaces unrepresentable.
- **Two-clock drift:** ramp from `elapsedSimSeconds`; BaseGame timer only ends the run.
- **Thin-hazard tunneling:** internal 1/120s collision substeps with a non-vacuous fixture.
- **Focused-button double flip:** document keydown ignores button targets.
- **Stale save/callback:** reuse BaseGame run guard; no local token.
- **Unload during live run:** existing-style `beforeunload` warning.
- **E2E timing flake:** Playwright stops at Play Again re-arm; input behavior stays in unit/integration tests.
- **Catalog bookkeeping drift:** one discriminated table drives all consumers.
- **Untested tuning:** named manual-play checkpoint before final gates.

## Acceptance Criteria

HPA-73 is ready when:

- the game appears in the active catalog and `/gravity-flip` route;
- keyboard, pointer/touch, and native button input all flip through one API;
- physics is substepped and frame-partition-safe;
- BaseGame remains the only timer/save/run-guard authority;
- every hazard consumer uses the one discriminated catalog;
- rail-resting player safety is proven for default and larger player sizes;
- ramp progression uses simulation time, not wall clock;
- collision and survival outcomes present distinct copy;
- First Flip requires an actual flip;
- the current debug/error/beforeunload conventions are followed;
- `organisms.test.ts` reflects the new mid-zone count;
- the deterministic browser lose/re-arm journey passes;
- the manual-play checkpoint accepts or revises the initial tuning defaults;
- full unit/type/lint/format/build/E2E/coverage gates pass during implementation;
- no new shared runner/physics/input framework, package, schema, API, or backend work is introduced.
