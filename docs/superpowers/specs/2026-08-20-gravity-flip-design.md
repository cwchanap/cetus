# Gravity Flip — Design Spec

- **Linear issue:** [HPA-73 — Minigame: Gravity Flip](https://linear.app/cwchanap/issue/HPA-73/minigame-gravity-flip)
- **Date:** 2026-08-20
- **Status:** Planning draft, reviewed for implementation

## Overview

Gravity Flip is a one-button precision runner. The player auto-runs through a horizontal corridor while gravity continuously pulls toward either the floor or ceiling. Pressing the flip control reverses gravity; it does **not** teleport the player or zero vertical velocity. The player uses the resulting arcs to avoid spikes, cross floor/ceiling gaps, dodge moving hazards, and collect stars.

Version 1 is one **60-second** run. The world scrolls past a fixed horizontal player position while challenge spacing tightens and scroll speed rises. A lethal collision ends the run immediately; surviving until the countdown reaches zero completes it. Score rewards distance plus optional stars.

The implementation remains local to Gravity Flip: `BaseGame` owns countdown, completed-run reset, score saving, stale-save protection, achievements, and challenge updates; `PixiJSRenderer` owns the canvas; a Gravity Flip initializer owns one requestAnimationFrame loop, following the existing Evader shape. There is no shared runner framework, physics engine, level editor, generic spawner, new persistence path, or backend change.

## Product Goals

- Deliver a recognizable **auto-run → flip gravity → thread hazards → collect stars** loop in about one minute.
- Preserve vertical momentum through gravity changes so timing matters.
- Increase pressure continuously without difficulty modes or a progression subsystem.
- Make the first obstacle deterministic and readable so a new player immediately learns that a flip is required.
- Guarantee that moving hazards never make either resting rail intrinsically lethal.
- Support keyboard, pointer/touch, and native button activation through one `flipGravity()` API.
- Reuse Cetus score submission, leaderboard/progress, achievements, stale-run protection, and `GamePage` infrastructure.
- Keep tests deterministic with one injected `rng: () => number` seam.

## Non-Goals

Version 1 does **not** include:

- authored campaign levels, checkpoints, bosses, or level selection;
- a generic endless-runner, collision, or physics framework shared with other games;
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

`GravityFlipGame` extends `BaseGame`. BaseGame already provides the 60-second `GameTimer`, completed-run reset on the next `start()`, score accumulation/final submission, final timer snapshots, stale async-save suppression through the existing run guard, and achievement/challenge result delivery.

Gravity Flip uses `timeBonus: false`; distance and stars are the complete score. Do not add a second timer, score-save path, or stale-run token.

### PixiJSRenderer with two redraw layers

Continuous movement belongs on canvas. `GravityFlipRenderer` uses a fixed 800×320 logical canvas with one static corridor/background layer and one dynamic scene layer cleared/redrawn each render. Entity count is tiny; per-entity maps, pooling, textures, and sprite infrastructure are unnecessary.

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

### Inject RNG only

Production uses `Math.random`; tests inject `rng: () => number`, matching Pattern Pulse's narrow deterministic seam. Time progression remains explicit through `update(deltaSeconds)` and BaseGame's timer, so no clock abstraction is added.

## Fixed Gameplay Rules

| Rule | Value |
|---|---:|
| Run duration | 60 seconds |
| Logical canvas | 800 × 320 px |
| Player X | 150 px |
| Player size | 28 px |
| Corridor inset | 36 px from top/bottom |
| Gravity acceleration | 1800 px/s² |
| Maximum vertical speed | 700 px/s |
| Maximum internal physics step | 1/120 s |
| Initial world speed | 220 px/s |
| Final world speed | 360 px/s |
| Initial challenge spacing | 520 px |
| Final challenge spacing | 400 px |
| Moving hazard unlock | 15 elapsed seconds |
| Mover size | 40 px |
| Mover rail clearance | 28 px |

The production constants live once in `GRAVITY_FLIP_RULES` in `types.ts`. Page/initializer/renderer code must not define competing gameplay constants.

### Gravity and movement

```ts
type GravityDirection = 'down' | 'up'
```

The player begins resting on the floor with downward gravity and zero vertical velocity. `flipGravity()` accepts input only while active/not paused/not over, changes `down ↔ up`, increments `flips`, and preserves vertical velocity.

Each physics substep applies acceleration in the active gravity direction, clamps vertical speed to ±700 px/s, advances Y, then clamps the player against the ceiling/floor surfaces. Contact with a solid surface zeroes vertical velocity.

### Difficulty ramp

Difficulty is a pure elapsed-time ramp:

```ts
progress = clamp(elapsedSeconds / 60, 0, 1)
worldSpeed = 220 + (360 - 220) * progress
challengeSpacing = 520 + (400 - 520) * progress
```

There is no difficulty state machine.

## Closed Challenge Catalog

The five hazard kinds are a closed content union:

```ts
type GravityFlipHazardKind =
  | 'floor-spike'
  | 'ceiling-spike'
  | 'floor-gap'
  | 'ceiling-gap'
  | 'mover'

type HazardSurface = 'floor' | 'ceiling' | null
type HazardShape = 'spike' | 'gap' | 'mover'

interface GravityFlipHazardDescriptor {
  surface: HazardSurface
  shape: HazardShape
  hasStar: boolean
}

const GRAVITY_FLIP_HAZARD_CATALOG: Record<
  GravityFlipHazardKind,
  GravityFlipHazardDescriptor
> = {
  'floor-spike':   { surface: 'floor',   shape: 'spike', hasStar: true },
  'ceiling-spike': { surface: 'ceiling', shape: 'spike', hasStar: true },
  'floor-gap':     { surface: 'floor',   shape: 'gap',   hasStar: true },
  'ceiling-gap':   { surface: 'ceiling', shape: 'gap',   hasStar: true },
  mover:           { surface: null,      shape: 'mover', hasStar: false },
}
```

Challenge eligibility, spawn geometry, star placement, collision dispatch, and renderer shape dispatch all use this table. Production code must not classify kinds with `startsWith`, `endsWith`, regexes, substring checks, or a second kind-to-shape/surface table.

The first challenge of every fresh run is always `floor-spike`, spawned beyond the right edge. After that, pre-15-second selection uses catalog entries whose descriptor shape is not `mover`; at/after 15 seconds all five rows are eligible. One challenge is spawned per spacing interval. Spike/gap rows put one star on the opposite safe surface; movers do not carry a star. Challenges never intentionally compose multiple lethal patterns.

The deterministic random order is the insertion order of this single catalog object. This remains private Gravity Flip content logic, not a generic generator.

### Spike semantics

Spikes use conservative AABBs over their rendered triangle cluster. Pixel-perfect triangle collision is out of scope.

### Gap semantics

A gap is a lethal missing segment in one corridor surface. If the player's horizontal hit box overlaps a gap while touching that gap's descriptor surface, the run ends. There is no separate fall-out-of-world simulation.

### Moving hazard safety invariant

Mover top-left Y bounds are derived from explicit rules:

```ts
minY = corridorInset + moverRailClearance
maxY = canvasHeight
     - corridorInset
     - moverRailClearance
     - moverSize
```

With v1 values this is `[64, 216]`. A ceiling-resting player occupies Y `[36,64]`; a floor-resting player occupies Y `[256,284]`. Cetus `rectOverlap` uses exclusive edge semantics, so touching at Y=64 or Y=256 is not overlap. Resting on either rail is therefore always legal.

`getGravityFlipMoverBounds(config)` is the single production helper for these bounds. `spawnMover()` starts within them and mover updates clamp/reverse against them. Tests lock both extrema against the same `rectOverlap` primitive used by gameplay.

### Stars

Every spike/gap challenge places one optional star on the opposite descriptor surface at the same challenge X. Star collection uses conservative diameter-AABB vs player-AABB overlap, removes a star once, and increments `starsCollected` once. Stars are never required to survive and never affect generation.

## Collision-Safe Substeps

`update(deltaTime)` ignores non-positive/non-finite deltas and inactive/paused runs. For a valid delta:

```ts
remaining = Math.min(deltaTime, 0.1)
step = Math.min(remaining, maxPhysicsStep) // 1/120 s
```

Each substep advances player physics, distance, hazard/mover X/Y, off-screen cleanup, star collection, lethal collision, and challenge-spacing accumulation. The loop stops when time is consumed or the run ends.

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

`GravityFlipGame` keeps only two small private runtime fields outside submitted state:

```ts
private distanceSinceChallenge = 0
private entitySequence = 0
```

A local helper supplies deterministic IDs:

```ts
private entityId(prefix: 'hazard' | 'star'): string {
  return `${prefix}-${this.entitySequence++}`
}
```

`onGameStart()` resets both fields, then authors the first `floor-spike`, producing `hazard-0`. Every substep adds `worldSpeed * step` to `distanceSinceChallenge`. Once it reaches interpolated spacing, subtract that spacing and spawn one eligible catalog entry from one RNG read. At a 1/120-second step the travel is only a few pixels while spacing is at least 400px, so one spawn check per substep is sufficient.

Reset clears both fields. No unused challenge counter or generic spawn scheduler is introduced.

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

Collision presentation is **`GRAVITY LOST` / `Collision`**.

`handleTimeUp()` sets `outcome='survived'` before delegating to BaseGame's normal timeout end path. Survival presentation is **`RUN COMPLETE` / `Survived`**. The initializer always writes `#game-over-title` and `#final-outcome`; the page's static overlay title is only fallback copy. Browser smoke remains collision-only; survival copy is unit-tested rather than waiting 60 seconds in Playwright.

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

Platform integration modifies only:

```text
src/lib/games.ts
src/lib/games.test.ts
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

Owns BaseGame lifecycle, player physics/substeps, distance/world-speed ramp, score synchronization, first challenge plus distance spacing, catalog selection/spawn, safe mover bounds/bounce, descriptor-driven collision, star collection, terminal outcomes, and submitted data. It never parses hazard kind strings.

### `GravityFlipRenderer.ts`

Uses fixed 800×320 logical coordinates and `responsive: false`; CSS scales the canvas visually. It owns one static corridor graphic and one dynamic scene graphic. Every hazard render looks up `GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]` and switches on `descriptor.shape`. No textures/assets or second shape map.

### `initFramework.ts`

The initializer follows current Pattern Pulse lifecycle/error/debug seams plus Evader's local rAF loop:

1. require `#gravity-flip-container`; report missing DOM with `DOMElementNotFoundError` + `handleGameError`;
2. initialize the renderer with the same error/cleanup convention;
3. create one game and one rAF loop;
4. wire Start, Reset, Play Again, HUD/result, achievement/challenge payloads, keyboard, canvas pointer, and native flip button;
5. return `{ game, renderer, getGame, getState, cleanup }`;
6. never assign a global itself.

The Astro page assigns the returned handle to `window.gravityFlipGame`, matching `window.gameNameGame.getGame()` debugging.

Play Again intentionally hides the overlay and calls `game.start()`: BaseGame resets a completed run and immediately starts it. The source implementation must comment that this is intentional so it is not replaced by reset-only behavior.

## Input and Accessibility

Equivalent input paths are keyboard `Space`/`ArrowUp`/`ArrowDown`, `pointerdown` on the canvas, and native `#flip-btn` click.

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
overlayTitle="GRAVITY LOST"
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

The page-root script initializes outside `GamePage` slots and assigns the returned handle to `window.gravityFlipGame`.

## Platform Integration and Achievements

Add `GameID.GRAVITY_FLIP = 'gravity_flip'`, route `/gravity-flip`, icon `🌗`, and one active action-game registry entry. Create the route before activating `GAMES`. `getGameUrl()` stays unchanged and already derives `/gravity-flip`.

Four achievements are sufficient:

1. **First Flip** (`gravity_flip_welcome`) — in-game check `flips >= 1`; distance score alone must not award it.
2. **Star Catcher** — `starsCollected >= 5`.
3. **Gravity Dancer** — `flips >= 20`.
4. **Full Orbit** — `survivedFullRun === true`.

`GravityFlipGameData` joins the shared game-data/achievement typing; no achievement framework change is required.

## Testing Strategy

Unit/integration coverage locks scorer/frame partitioning, initial state and preserved velocity, world-speed/spacing ramp, exact five-row catalog, first authored floor spike, one RNG read per random challenge, mover unlock timing, mover bounds `[64,216]`, rail non-overlap at extrema, descriptor-driven stars/collision/rendering, the non-vacuous X=164/8px substep regression, collision idempotence, reset/restart, survived timeout, input filtering including focused button, both terminal-copy variants, Pattern Pulse-style error/getGame handle behavior, and First Flip `0 → false / 1 → true`.

One Playwright journey loads the real canvas, starts without flipping, loses to the deterministic first floor spike, asserts collision UI, Play Again immediately starts a fresh run, flips with the button, blurs it, then flips once with Space. The catalog-navigation suite remains source-unchanged.

## Verification Gates

Implementation must run fresh:

```bash
bun run test:run src/lib/games/gravity-flip src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
bun run test:coverage
```

Codecov project and patch targets remain 90% with zero threshold leniency.

## Scope Boundaries

HPA-73 remains one implementation PR. It does not add packages, a shared runner/physics/input framework, GameInitializer adoption, seeded/Daily play, backend/schema/API changes, a level editor, or a generic hazard generator.