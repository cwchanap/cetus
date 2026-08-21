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

### Inject RNG only

Production uses `Math.random`; tests inject `rng: () => number`, matching Pattern Pulse's narrow deterministic seam. Time progression remains explicit through `update(deltaSeconds)` and BaseGame's timer, so no clock abstraction is added.

## Fixed Gameplay Rules

### Run and world

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

The player begins resting on the floor with downward gravity and zero vertical velocity.

`flipGravity()` accepts input only while active/not paused/not over, changes `down ↔ up`, increments `flips`, and preserves vertical velocity.

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

Spawn geometry, star placement, collision dispatch, and renderer shape dispatch all use this table. Production code must not classify kinds with `startsWith`, `endsWith`, substring checks, or duplicated kind lists.

The first challenge of every fresh run is always `floor-spike`, spawned beyond the right edge. After that:

- before 15 elapsed seconds, choose from the four spike/gap kinds;
- at/after 15 seconds, `mover` joins the same small list;
- one challenge is spawned per spacing interval;
- spike/gap challenges place one star on the opposite safe surface;
- movers do not carry a star;
- challenges do not intentionally combine multiple simultaneous lethal patterns.

This is private Gravity Flip content logic, not a generic generator.

### Spike semantics

Spikes use conservative AABBs over their rendered triangle cluster. Pixel-perfect triangle collision is out of scope.

### Gap semantics

A gap is a lethal missing segment in one corridor surface. The player still uses the same top/bottom clamp; if the player's horizontal hit box overlaps a gap while touching that gap's catalog surface, the run ends. There is no separate fall-out-of-world simulation.

### Moving hazard safety invariant

A mover scrolls left with the world and bounces vertically only inside the interior corridor. Its top-left Y bounds are derived from explicit rules:

```ts
minY = corridorInset + moverRailClearance
maxY = canvasHeight
     - corridorInset
     - moverRailClearance
     - moverSize
```

With v1 values the range is `[64, 216]`. A ceiling-resting player occupies Y `[36, 64]`; a floor-resting player occupies Y `[256, 284]`. At either mover extremum the AABBs may touch at an edge but do not overlap. Resting on either rail is therefore always a legal response to a mover.

`getGravityFlipMoverBounds(config)` is the single production helper for these bounds. `spawnMover()` starts within them and mover updates clamp/reverse against them. Tests lock both extrema against the same rectangle-overlap primitive used by gameplay.

### Stars

Every spike/gap challenge places one optional star on the opposite catalog surface at the same challenge X. Stars are never required to survive and never influence hazard generation.

## Collision-Safe Substeps

`update(deltaTime)` ignores non-positive/non-finite deltas and inactive/paused runs. For a valid delta it processes:

```ts
remaining = Math.min(deltaTime, 0.1)
step = Math.min(remaining, maxPhysicsStep) // 1/120 s
```

Each substep advances player physics, world distance, hazards/movers, star collection, collisions, cleanup/spawning, and then continues until `remaining` is exhausted or the run ends.

The regression proving substeps is intentionally smaller than production hazard dimensions. A test config uses `spikeWidth: 8`, `canvasWidth: 200`, `spawnOffsetX: 0`, and constant `worldSpeed: 360`; a single 0.1-second end-position check would skip the spike, while 1/120-second steps collide with it. Default catalog sizes are unchanged.

## Scoring

`calculateGravityFlipScore()` in `scoring.ts` is the **only production scoring formula**:

```text
distancePoints = floor(distancePx / 50) * 10
starPoints     = starsCollected * 250
score          = distancePoints + starPoints
```

`GravityFlipGame` tracks precise floating-point distance. After each accepted update it calculates the target total and adds only the positive delta through BaseGame's score manager. This makes score independent of frame partitioning and prevents per-frame rounding drift.

There is no collision penalty and no BaseGame time bonus.

## Terminal Outcomes and Presentation

```ts
type GravityFlipOutcome = 'playing' | 'collision' | 'survived'
```

### Collision

The first lethal collision sets `outcome='collision'`, synchronizes score once, and calls `void this.end()`. BaseGame marks the run inactive synchronously, so later substeps/collisions cannot submit twice.

Presentation:

- title: **`GRAVITY LOST`**
- outcome text: **`Collision`**

### Survived

`handleTimeUp()` sets `outcome='survived'` before delegating to BaseGame's normal timeout path. It does not save separately.

Presentation:

- title: **`RUN COMPLETE`**
- outcome text: **`Survived`**

The page's static overlay title is only a fallback; the initializer always sets `#game-over-title` and `#final-outcome` from the actual terminal outcome. Initializer tests cover both strings. The browser happy-path remains the deterministic collision/restart journey; it does not wait 60 seconds for a survival smoke test.

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

## `GravityFlipGame.ts`

Responsibilities:

- BaseGame lifecycle integration;
- gravity/player physics with 1/120-second substeps;
- distance/world-speed ramp and frame-stable score sync;
- five-kind catalog selection and descriptor-driven spawn;
- mover-safe travel bounds and bounce;
- descriptor-driven spike/gap/mover collision;
- opposite-surface star creation/collection;
- collision/survival outcomes and submitted data.

The game does not parse hazard kind strings.

## `GravityFlipRenderer.ts`

The renderer uses fixed 800×320 logical coordinates and `responsive: false`; CSS scales the canvas visually on narrow screens.

It owns one static corridor graphic and one dynamic scene graphic. For each hazard it looks up `GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]` and switches on `descriptor.shape` to draw spike/gap/mover geometry. It never uses prefix/suffix classification.

No textures or external assets are required.

## `initFramework.ts`

The initializer follows the **current Pattern Pulse lifecycle/error/debug shape plus Evader's local rAF loop**:

1. require `#gravity-flip-container` / canvas mount; missing required DOM is reported with `DOMElementNotFoundError` + `handleGameError`;
2. initialize the renderer with the same `handleGameError` cleanup path;
3. create exactly one game and one rAF loop;
4. wire Start, Reset, Play Again, HUD/result presentation, achievements/challenges;
5. wire keyboard, canvas pointer, and native flip-button input;
6. return a handle containing `game`, `renderer`, `getGame()`, `getState()`, and idempotent `cleanup()`;
7. **do not** assign a global inside the initializer.

The Astro page receives the handle and assigns:

```ts
window.gravityFlipGame = handle
```

This matches the repository debug contract `window.gameNameGame.getGame()`.

### Play Again is intentionally start, not reset-only

`Play Again` hides the overlay and calls `game.start()`. BaseGame automatically resets a completed run before starting it. This differs intentionally from reset-only handlers in games whose Play Again returns to an idle screen. A source comment must freeze that reason so a later cleanup does not change the behavior.

## Input and Accessibility

One action has equivalent inputs:

- keyboard: `Space`, `ArrowUp`, `ArrowDown`;
- mouse/pen/touch: `pointerdown` on the canvas;
- accessible control: native `#flip-btn` button.

The document keyboard listener ignores:

- repeated keydown events;
- Ctrl/Meta/Alt chords;
- editable targets using the same local `isEditableTarget` shape as Pattern Pulse;
- **button targets**. When `#flip-btn` is focused, native Enter/Space activation owns the action so document keydown cannot flip once and the resulting native click flip again.

No shared input helper, swipe recognizer, or custom focus manager is added.

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

The page-root `<script>` initializes outside `GamePage` slots and assigns the returned handle to `window.gravityFlipGame`.

## Platform Integration

Add `GameID.GRAVITY_FLIP = 'gravity_flip'`, route `/gravity-flip`, icon `🌗`, and one active action-game registry entry. Create the route before activating the registry record because `games.test.ts` validates every active route.

`getGameUrl()` stays unchanged; underscore-to-hyphen derivation already yields `/gravity-flip`.

### Achievements

Four achievements are enough for v1:

1. **First Flip** (`gravity_flip_welcome`) — in-game check `flips >= 1`. Distance score alone must never award it.
2. **Star Catcher** — `starsCollected >= 5`.
3. **Gravity Dancer** — `flips >= 20`.
4. **Full Orbit** — `survivedFullRun === true`.

`GravityFlipGameData` is added to the shared game-data/achievement typing. No achievement framework changes are needed.

## Testing Strategy

### Pure/unit tests

Cover:

- scorer boundaries and frame-partition independence;
- initial floor state and preserved velocity through flips;
- world-speed/spacing ramp;
- exact five-row descriptor catalog coverage;
- first authored floor spike and mover unlock timing;
- mover bounds `[64,216]` and rail-resting non-overlap at both extrema;
- descriptor-driven star placement and gap/spike/mover collision;
- **non-vacuous** 1/120-second regression using an injected 8px spike skipped by an end-position-only 0.1s update;
- collision idempotence, reset/restart, timeout-survived outcome;
- renderer dispatch by descriptor shape and cleanup;
- keyboard editable/repeat/modifier/button-target filtering;
- pointer/button routes to the same `flipGravity()` method;
- collision and survival overlay strings;
- Pattern Pulse-style missing-DOM/error cleanup and `getGame()` handle;
- First Flip checks `flips` directly (0 false / 1 true).

### Playwright

One deterministic browser journey is sufficient:

1. load `/gravity-flip` and wait for the visible canvas;
2. start without flipping and lose to the authored first floor spike;
3. assert overlay + `Collision` result;
4. Play Again and assert a new run is active/floor state reset;
5. click `#flip-btn` once and observe ceiling gravity;
6. use Space away from the focused flip button and observe one further flip.

The catalog-navigation suite remains source-unchanged and picks up the active registry entry automatically.

## Verification Gates

Implementation must run:

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

HPA-73 remains one implementation PR. It does not add packages, a shared runner/physics/input framework, GameInitializer adoption, seeded/Daily play, backend/schema/API changes, a level editor, or a generic hazard generator. The review changes strengthen only Gravity Flip's existing local contracts.