# Gravity Flip — Design Spec

- **Linear issue:** [HPA-73 — Minigame: Gravity Flip](https://linear.app/cwchanap/issue/HPA-73/minigame-gravity-flip)
- **Date:** 2026-08-20
- **Status:** Planning draft, ready for implementation

## Overview

Gravity Flip is a one-button precision runner. The player auto-runs through a horizontal corridor while gravity continuously pulls toward either the floor or ceiling. Pressing the flip control reverses gravity; it does **not** teleport the player or zero vertical velocity. The player uses the resulting arcs to avoid spikes, cross floor/ceiling gaps, dodge moving hazards, and collect stars.

Version 1 is one **60-second** run. The world scrolls past a fixed horizontal player position, while challenge spacing tightens and scroll speed rises over the run. A collision ends the run immediately; surviving until the countdown reaches zero completes it. Score rewards distance plus optional stars.

The implementation stays local to Gravity Flip: `BaseGame` owns countdown, score saving, restart semantics, stale-save protection, achievements, and challenge updates; `PixiJSRenderer` owns the canvas; a Gravity Flip initializer owns one requestAnimationFrame loop, following the existing Evader shape. There is no runner framework, level editor, physics engine, new persistence path, or backend change.

## Product Goals

- Deliver a recognizable **auto-run → flip gravity → thread hazards → collect stars** loop in about one minute.
- Make the gravity change feel physical: momentum carries through a flip rather than snapping between lanes.
- Increase pressure continuously without difficulty modes or a separate progression system.
- Make the first obstacle deterministic and readable so a new player immediately learns that a flip is required.
- Support keyboard, mouse, touch, and accessible button activation with one gameplay action.
- Reuse Cetus score submission, leaderboard/progress, achievements, stale-run protection, and `GamePage` infrastructure.
- Keep tests deterministic with one injected `rng: () => number` seam.

## Non-Goals

Version 1 does **not** include:

- authored campaign levels, checkpoints, bosses, or level selection;
- a generic endless-runner or physics framework shared with other games;
- free horizontal movement, jumping, crouching, or multiple abilities;
- procedural geometry generation beyond a small catalog of isolated challenge types;
- power-ups, shields, lives, revives, economy, upgrades, or permanent progression;
- Daily mode, seeded sharing, replay recording, or resume-after-refresh;
- audio, haptics, particle-system infrastructure, or image assets;
- per-pixel triangle/circle collision geometry;
- database, API, auth, score-service, or leaderboard changes.

## Alternatives Considered

### A. Game-local procedural challenge stream — selected

Keep the player at a fixed horizontal coordinate and scroll a small set of challenge records from right to left. Spawn only one challenge family at each spacing interval, with a safe route by construction. The first challenge is always a floor spike; later challenges use injected RNG.

This gives replayability and rising pressure while keeping generation cheap, deterministic in tests, and understandable in one game module. It also reuses the proven Evader update/render loop shape without copying Evader gameplay.

### B. One authored 60-second track

An authored obstacle timeline would be easier to balance and completely deterministic, but repeated runs would quickly become memorization. It also creates content-authoring work without buying much architecture value for a single one-minute game.

### C. Two-lane instant teleport

A click could snap the player between floor and ceiling. This is the smallest implementation, but it removes the precision arc/momentum that makes Gravity Flip distinct and weakens the ticket's side-scrolling action-game intent.

## Reuse Decisions

### BaseGame remains the run authority

`GravityFlipGame` extends `BaseGame`. BaseGame already provides:

- one 60-second `GameTimer`;
- completed-run reset when `start()` is called again;
- score accumulation and final submission;
- final timer snapshots;
- stale async-save suppression through the existing run guard;
- achievement/challenge result delivery.

Gravity Flip sets `timeBonus: false`; distance and stars are the complete score.

### PixiJSRenderer, not DOM gameplay

The player and hazards move continuously every frame, so a Pixi canvas is a better fit than DOM transforms. `GravityFlipRenderer` uses only two graphics layers: a static corridor layer and a dynamic scene layer that is cleared and redrawn each frame. Entity counts are deliberately tiny, so object pooling or per-entity sprite maps are unnecessary.

### Game-local requestAnimationFrame loop

The initializer follows Evader's existing local loop:

```text
requestAnimationFrame
→ clamp outer delta
→ game.update(deltaSeconds)
→ renderer.render(game.getState())
→ request next frame
```

Do not add a shared animation-loop service. Gravity Flip internally substeps physics, so the outer loop can keep the repository's existing 100 ms tab-throttling clamp without allowing collision tunneling.

### Inject RNG only

Production uses `Math.random`. Tests inject `rng`. Time progression is already explicit through `update(deltaSeconds)` plus BaseGame's timer, so no clock abstraction is required.

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

The runtime constants live once in `GRAVITY_FLIP_RULES` in `types.ts`. Page copy and tests may assert those values, but production modules must not define competing timing/physics constants.

### Gravity and movement

```ts
type GravityDirection = 'down' | 'up'
```

The player begins resting on the floor with downward gravity and zero vertical velocity.

`flipGravity()`:

1. accepts input only while the run is active and not paused/over;
2. changes `down ↔ up`;
3. increments `flips`;
4. leaves vertical velocity unchanged.

Each physics substep applies acceleration in the active gravity direction, clamps vertical speed to ±700 px/s, advances Y, then clamps the player against the ceiling/floor collision surfaces. Contact with a solid surface zeroes vertical velocity.

Keeping velocity through a flip is load-bearing. It allows late reversals, smooth arcs, and recovery rather than reducing the game to an instant two-lane switch.

### Difficulty ramp

Difficulty is derived from elapsed run time; there is no difficulty state machine.

```ts
progress = clamp(elapsedSeconds / 60, 0, 1)
worldSpeed = 220 + (360 - 220) * progress
challengeSpacing = 520 + (400 - 520) * progress
```

`state.worldSpeed` exposes the current value for the HUD and renderer tests. Challenge spacing is internal generation state.

### Challenge catalog

```ts
type GravityFlipHazardKind =
  | 'floor-spike'
  | 'ceiling-spike'
  | 'floor-gap'
  | 'ceiling-gap'
  | 'mover'
```

The first challenge of every fresh run is always `floor-spike`, spawned beyond the right edge. A player who never flips collides after roughly three seconds. This gives a stable onboarding/E2E seam without a tutorial subsystem.

After the first challenge:

- before 15 elapsed seconds, choose from the four floor/ceiling spike/gap kinds;
- at/after 15 seconds, `mover` joins the same small choice list;
- one challenge is spawned per spacing interval;
- floor/ceiling challenges include one star on the opposite, safe side;
- mover challenges do not require a star;
- generated challenges never intentionally combine multiple simultaneous lethal patterns.

The generator is not a general obstacle grammar. It is private Gravity Flip logic over a five-item catalog.

### Spike semantics

Spikes use simple axis-aligned hit boxes that conservatively cover the rendered triangle cluster. Pixel-perfect triangle collision is out of scope.

### Gap semantics

A gap is a lethal missing segment in one corridor surface. The player still uses the same top/bottom physics clamp; if the player's horizontal hit box overlaps the gap while touching that surface, the run ends.

This intentionally avoids a second “fall out of the world” simulation. The gameplay decision remains correct: leave the unsafe surface before its gap reaches the player.

### Moving hazard semantics

A mover scrolls left with the world while bouncing vertically between safe corridor margins. Its collision uses a rectangular hit box. The stored `verticalVelocity` reverses at the top/bottom mover bounds, making motion deterministic under substeps without trigonometric clock state.

### Stars

Stars are optional pickups. Every spike/gap challenge places a star near the opposite safe surface at the same challenge X position. Touching a star removes it and increments `starsCollected` once.

Stars are never required to survive and never alter hazard generation.

## Scoring

`calculateGravityFlipScore()` in `scoring.ts` is the **single production scoring authority**:

```text
distancePoints = floor(distancePx / 50) * 10
starPoints     = starsCollected * 250
score          = distancePoints + starPoints
```

`GravityFlipGame` tracks precise floating-point distance for physics/stats. After each accepted update it calculates the target total and adds only the positive delta through BaseGame's score manager. This makes score independent of frame partitioning and prevents per-frame rounding drift.

Examples:

| Distance | Stars | Score |
|---:|---:|---:|
| 500 px | 0 | 100 |
| 1,250 px | 2 | 750 |
| 8,000 px | 5 | 2,850 |
| 17,000 px | 8 | 5,400 |

There is no collision penalty and no BaseGame time bonus. A collision naturally caps future distance/star opportunities.

## Terminal Outcomes

```ts
type GravityFlipOutcome = 'playing' | 'collision' | 'survived'
```

### Collision

On the first lethal collision:

1. set `outcome='collision'`;
2. synchronize the current score once;
3. call `void this.end()`;
4. stop further entity/player updates because BaseGame marks the run inactive synchronously.

The collision path is idempotent; multiple overlapping hazards cannot submit twice.

### Survived

Override `handleTimeUp()` only to set `outcome='survived'` before delegating to BaseGame's normal timeout end path. Do not create a second timer or manually save the score.

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

Submitted `distance` is `Math.floor(state.distance)`. `survivedFullRun` derives from `outcome === 'survived'`; no duplicate “completed” field is needed.

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

`e2e/games/all-games-navigation.spec.ts` stays source-unchanged because it derives its targets from `GAMES`.

No BaseGame, GameTimer, ScoreManager, PixiJSRenderer, GameInitializer, score service, API, database, or auth production change is planned.

## `GravityFlipGame.ts`

Responsibilities:

- BaseGame state/lifecycle integration;
- gravity direction and player vertical physics;
- 1/120-second internal substeps;
- distance/world-speed ramp;
- one-at-a-time challenge spawning;
- mover bounce motion;
- spike/gap/mover collision;
- star collection;
- score synchronization;
- collision/survival outcomes and game data.

`update(deltaTime)` ignores non-positive/non-finite delta and inactive/paused runs. For a valid delta it processes `remaining = Math.min(deltaTime, 0.1)` in substeps of at most `1/120` second. The initializer also applies the existing 0.1-second outer clamp, but the game owns collision safety.

## `GravityFlipRenderer.ts`

The renderer uses a fixed 800×320 logical canvas and `responsive: false`. The page scales the canvas with CSS (`max-width: 100%; height: auto`) so mobile display size changes do not change physics coordinates.

It owns:

- one static `corridorGraphic` for background/rails/grid;
- one dynamic `sceneGraphic` cleared and redrawn each render.

The dynamic layer renders:

- player as a neon diamond/arrow whose accent points with gravity;
- spike clusters as triangles;
- gaps as dark cutouts over the corresponding rail with warning edges;
- movers as outlined glowing orbs;
- stars using a small explicit polygon helper.

No textures or external assets are required.

## `initFramework.ts`

The initializer:

- guards `#gravity-flip-container` and mounts Pixi into `#gravity-flip-canvas`;
- creates exactly one game and renderer;
- owns exactly one requestAnimationFrame loop;
- clamps outer frame delta to 0.1 seconds;
- wires Start, Reset, Play Again, HUD/result overlay, achievements/challenges;
- wires `Space`, `ArrowUp`, and `ArrowDown` on `document`;
- ignores key repeat, modifier chords, and editable targets;
- wires canvas `pointerdown` and visible `#flip-btn` click to the same `game.flipGravity()` API;
- removes every listener and cancels rAF in idempotent cleanup;
- exposes `window.gravityFlipGame` as the small initializer handle used by browser smoke/debug tests.

`GameInitializer.ts` remains unused; Gravity Flip needs a per-frame loop and game-specific pointer/keyboard action, so adopting it would add indirection without reducing code.

## Input and Accessibility

One action has multiple equivalent inputs:

- keyboard: `Space`, `ArrowUp`, or `ArrowDown`;
- mouse/pen/touch: pointer-down on the canvas;
- accessible control: native `#flip-btn` button.

The keyboard listener ignores events from `input`, `textarea`, `select`, or contenteditable targets and ignores `event.repeat`. The visible button keeps native focus/Enter/Space behavior. No swipe recognizer or custom focus manager is added.

The HUD includes a live text gravity indicator (`FLOOR ↓` / `CEILING ↑`), so direction is not communicated by canvas color alone.

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

The page-root `<script>` initializes the game outside `GamePage` slots, matching the component contract.

## Platform Integration

Add:

```ts
GameID.GRAVITY_FLIP = 'gravity_flip'
```

Registry entry:

```ts
{
  id: GameID.GRAVITY_FLIP,
  name: 'Gravity Flip',
  description: 'Flip gravity to dodge corridor hazards and collect stars',
  category: 'action',
  maxPlayers: 1,
  estimatedDuration: '1 minute',
  difficulty: 'medium',
  tags: ['gravity', 'runner', 'reflex', 'single-player', 'timing'],
  isActive: true,
  organism: { shape: 'spiral', color: 'magenta' },
  depth: 'mid',
}
```

Icon: `🌗`.

`getGameUrl()` remains unchanged; underscore-to-hyphen derivation already maps `gravity_flip` to `/gravity-flip`.

Create the route before activating the registry entry because `games.test.ts` verifies a route exists for every registered game.

`src/lib/games/shared/types.ts` aliases the canonical local `GravityFlipGameData` and adds it to `GameData`/achievement typing.

## Achievements

Keep v1 to four achievements:

1. **First Flip** (`gravity_flip_welcome`) — score threshold 1.
2. **Star Chaser** (`gravity_flip_star_chaser`) — collect at least 5 stars.
3. **Long Haul** (`gravity_flip_long_haul`) — travel at least 8,000 px.
4. **Gravity Master** (`gravity_flip_survivor`) — survive the full 60-second run.

The three in-game checks use `GravityFlipGameData`; there is no new achievement condition type.

## Browser and Test Strategy

### Unit tests

`scoring.test.ts` freezes distance-bucket and star math, including frame-partition-independent totals.

`GravityFlipGame.test.ts` covers:

- initial floor/down state;
- flip preserves velocity and rejects inactive input;
- 1/120 substeps and surface clamps;
- speed/spacing ramp endpoints;
- deterministic first floor spike;
- mover excluded before 15 seconds and eligible after;
- floor/ceiling spike collision;
- gap lethal only while touching the matching surface;
- mover bounce/collision;
- safe-side star collection once;
- score synchronization from distance + stars;
- collision ends once;
- timeout marks `survived` before BaseGame end;
- reset clears entities/private generation counters.

`GravityFlipRenderer.test.ts` verifies setup/layer ownership, representative geometry paths, gravity-direction player rendering, and cleanup.

`initFramework.test.ts` verifies one rAF loop, keyboard filtering, repeat/editable guards, canvas pointer + native button input, HUD/overlay updates, achievement/challenge forwarding, and cleanup/re-init.

### Browser smoke

Add one Gravity Flip test to `e2e/games/play-coverage.spec.ts`:

1. open `/gravity-flip` and verify a visible canvas;
2. start and intentionally provide no flip, relying on the deterministic first floor spike to produce a real collision within a short timeout;
3. verify collision result overlay;
4. use Play Again / Start to begin a fresh run;
5. activate `#flip-btn` and verify the gravity HUD changes to ceiling;
6. press `Space` and verify it changes back.

This covers actual lose/restart plus pointer/button/keyboard wiring without a test-only production mode.

`e2e/games/all-games-navigation.spec.ts` remains unchanged and automatically picks up the active registry entry.

## Risks and Mitigations

- **Frame-rate tunneling:** internal 1/120-second substeps are the collision authority; test one large outer delta against a thin spike.
- **Double submission from overlapping collisions:** collision path checks active/outcome before calling `end()` and BaseGame marks inactive synchronously.
- **Impossible random combinations:** spawn one challenge family per spacing interval; stars are rewards, never required; no compound generator.
- **Mobile coordinate drift:** fixed logical coordinates with CSS canvas scaling; pointer action has no coordinate dependency.
- **First-run browser flakiness:** first challenge is authored/deterministic; RNG begins after it.
- **Score drift by frame partition:** total score is calculated from accumulated distance/stars, then synchronized by delta.
- **Stale async achievement UI:** reuse BaseGame's existing run guard rather than adding a Gravity Flip token.

## Scope Boundary

One HPA-73 implementation PR should deliver the complete v1 game. It must not add a shared runner engine, shared physics system, level editor, difficulty framework, content schema, backend migration, new leaderboard endpoint, anti-cheat, Daily mode, audio system, or generalized obstacle generator.
