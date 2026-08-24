# Asteroid Drift Design

**Linear:** HPA-68 — Minigame: Asteroid Drift

**Status:** Planning contract for one HPA-68 PR.

## Goal

Add a fast **90-second** space-dodging minigame where the player pilots a momentum-driven ship, avoids increasingly dense asteroid traffic, and diverts toward temporary energy orbs for bonus score. A collision ends the run immediately; surviving the BaseGame timer completes it. Existing Cetus score, achievement, leaderboard/progress, and stale-run handling remain authoritative.

## Product contract

HPA-68 requires:

- a 1–2 minute action run;
- momentum-based movement rather than instant/grid movement;
- asteroids entering from screen edges with increasing density;
- energy orbs in safe-but-risky positions that encourage movement;
- score from survival time plus orb collection;
- immediate loss on asteroid collision;
- desktop and mobile controls;
- normal catalog/home-page/restart/progress integration.

V1 fixes the duration at 90 seconds and keeps one ruleset/difficulty.

## Repository findings

Asteroid Drift should reuse existing seams, not existing game rules.

- `EvaderGame` already demonstrates independent keyboard/touch held input and a native pointer D-pad, but its movement is direct velocity assignment and its object spawning is wall-clock `setInterval`. Reworking Evader would couple two distinct games and still not provide the required momentum/fair-spawn behavior.
- `GravityFlipGame` demonstrates the better continuous-game shape: `BaseGame`, game-local simulation time for physics/difficulty, a 0.1s outer delta clamp, fixed substeps, injected RNG, game-local score synchronization, and one initializer-owned rAF loop.
- Recent Pixi games show that one game-local `PixiJSRenderer` subclass is enough. No scene engine, ECS, physics package, or asset pipeline is required.
- `shared/geometry.ts` already provides `circleOverlap` and `distance`; existing shared helpers provide `clamp`, `lerp`, and `isEditableTarget`.
- `BaseGame`/`GameTimer` already own wall-clock duration, final timer snapshots, score submission, achievements, run guards, reset/start lifecycle, and callbacks. Asteroid Drift must not create a second survival-time authority.

## Approach

### Chosen: standalone `BaseGame + PixiJSRenderer` with game-local physics

Create a small `asteroid-drift` module containing contracts, pure spawn policy, scorer, model, renderer, and initializer. Copy only the established seams from Gravity Flip and the held-input interaction pattern from Evader.

### Rejected: generalize/re-skin Evader

Evader's direct movement and interval spawner are the opposite of the new game's two defining mechanics. Refactoring a shipped game first adds work without reducing HPA-68 complexity.

### Rejected: generic arcade/physics/spawn framework

One circle-collision arcade game does not justify a movement framework, entity system, collision world, generic spawn scheduler, or new dependency. Extract later only if another game independently needs the same contracts.

## Architecture

```text
Astro page / native D-pad / keyboard
              |
              v
      initFramework.ts
      - DOM callbacks
      - held-input mapping
      - exactly one rAF loop
      - cleanup / debug handle
          |             |
          v             v
AsteroidDriftGame   AsteroidDriftRenderer
(BaseGame)          (PixiJSRenderer)
     |                    |
     v                    v
spawning.ts          static background
scoring.ts           + dynamic primitives
```

No production file outside the game module changes until stable ID/icon and final catalog/data/achievement registration become live.

## Initial rule values

`types.ts` owns one `ASTEROID_DRIFT_RULES` object:

```ts
export const ASTEROID_DRIFT_RULES = {
    duration: 90,
    canvasWidth: 800,
    canvasHeight: 480,

    playerRadius: 16,
    thrustAcceleration: 720,
    dragPerSecond: 1.7,
    maxPlayerSpeed: 300,

    maxUpdateDelta: 0.1,
    maxPhysicsStep: 1 / 120,

    introAsteroidRadius: 26,
    asteroidSpawnPadding: 40,
    asteroidMinRadius: 18,
    asteroidMaxRadius: 36,
    asteroidInitialInterval: 1.35,
    asteroidFinalInterval: 0.45,
    asteroidInitialSpeed: 140,
    asteroidFinalSpeed: 240,
    asteroidSpeedJitter: 0.15,
    asteroidTargetInset: 80,
    asteroidSafeEdgeDistance: 190,
    maxAsteroids: 24,
    openingRandomSpawnGrace: 4,

    orbRadius: 12,
    orbSpawnInterval: 4,
    orbLifetime: 7,
    orbPlayerMinDistance: 150,
    orbAsteroidClearance: 70,

    survivalPointsPerSecond: 10,
    orbPoints: 250,
} as const
```

The manual-play checkpoint may tune movement, asteroid, and orb feel values before Task 5. Duration, score formula, finite spawn algorithms, input/lifecycle rules, and architecture are structural rather than tuning knobs.

## State and contracts

Game-local types:

```ts
export type AsteroidDriftDirection = 'up' | 'down' | 'left' | 'right'
export type AsteroidDriftInputSource = 'keyboard' | 'touch'
export type AsteroidDriftOutcome = 'playing' | 'collision' | 'survived'

export interface AsteroidDriftPlayer {
    x: number
    y: number
    velocityX: number
    velocityY: number
    radius: number
}

export interface AsteroidDriftAsteroid {
    id: string
    x: number
    y: number
    velocityX: number
    velocityY: number
    radius: number
}

export interface AsteroidDriftOrb {
    id: string
    x: number
    y: number
    radius: number
    ageSeconds: number
}
```

`AsteroidDriftState` extends `BaseGameState` with `outcome`, `player`, `asteroids`, `energyOrb: AsteroidDriftOrb | null`, and `orbsCollected`.

Simulation-only fields remain private on `AsteroidDriftGame`: `elapsedSimSeconds`, asteroid/orb spawn accumulators, entity sequence, and keyboard/touch held-direction sets. They are not persisted or submitted.

Canonical achievement data is intentionally small:

```ts
export interface AsteroidDriftGameData {
    survivalSeconds: number
    orbsCollected: number
    survivedFullRun: boolean
}
```

## Two clocks, two responsibilities

This game deliberately has two notions of elapsed time, but only one is player-visible/scoring time:

- **BaseGame/GameTimer wall clock** owns the 90-second run, displayed time, timeout, final timer snapshot, and `survivalSeconds` used for score/stats/achievement data.
- **`elapsedSimSeconds`** advances only by clamped physics substeps and owns asteroid difficulty progression/spawn ramping. It exists so a throttled/background frame cannot inject a giant physics jump.

For an active/collision run, survival seconds come from `getTimerStatus().elapsedTime` (floored by the existing GameTimer). For a successful timeout, survival is exactly `config.duration`. Never derive submitted survival score from `elapsedSimSeconds`.

## Player movement

The ship starts centered with zero velocity. Each physics substep:

1. union keyboard/touch held directions;
2. turn opposing directions into signed x/y input;
3. normalize diagonal input;
4. add `thrustAcceleration * step` to velocity;
5. apply frame-rate-independent drag with `Math.exp(-dragPerSecond * step)`;
6. clamp velocity magnitude to `maxPlayerSpeed`;
7. integrate position;
8. clamp the ship center inside the arena by `playerRadius`;
9. when a boundary is crossed, zero only the velocity component pointing farther outside.

The ship therefore coasts after release but remains correctable. V1 has no boost, rotation control, health, shield, dash, fuel, or weapons.

## Physics stepping and ordering

`update(deltaSeconds)` follows the recent continuous-game pattern:

- ignore inactive/paused/non-finite/non-positive deltas;
- clamp one incoming frame to `maxUpdateDelta = 0.1`;
- subdivide into at most `1/120s` physics steps;
- after stepping, synchronize score and emit state.

Every substep uses this order:

1. advance `elapsedSimSeconds`;
2. integrate player;
3. move/despawn asteroids;
4. age/expire current orb;
5. check asteroid collision;
6. collect orb if still alive;
7. advance asteroid/orb spawn accumulators and attempt spawning.

Collision intentionally precedes orb collection. If both contacts occur in one substep, the run is lost and the orb is not awarded.

Ship/asteroid and ship/orb contact use existing `circleOverlap`; spawn clearance uses existing `distance`.

## Deterministic opening asteroid

The first hazard is deterministic and consumes no RNG.

At `onGameStart()`, create one asteroid fully outside the right edge at center Y, radius 26, moving horizontally left at the initial asteroid speed. The player starts at arena center. With the default geometry this produces an idle collision after roughly three seconds, giving a readable first lesson and a deterministic browser loss path.

Random asteroid accumulation starts at `-openingRandomSpawnGrace`, so random traffic cannot obscure that opening lesson.

## Random asteroid spawning

Difficulty progress is `clamp(elapsedSimSeconds / duration, 0, 1)`.

- interval ramps linearly `1.35s → 0.45s`;
- base speed ramps `140 → 240 px/s`;
- radius varies `18..36px`;
- speed gets bounded ±15% jitter;
- asteroids travel straight and do not bounce/home/collide with each other.

### Edge fairness

An edge is eligible only when the player's center is at least `asteroidSafeEdgeDistance` from it. With the default 800×480 arena and 190px threshold, at least one edge is always eligible.

A spawn performs a finite sequence:

1. choose one eligible edge using injected `rng`;
2. choose radius and an along-edge coordinate within radius-safe bounds;
3. place the center fully off-screen by `asteroidSpawnPadding + radius`;
4. choose a target inside the arena's `asteroidTargetInset` rectangle;
5. normalize spawn→target;
6. apply ramped speed plus bounded jitter.

No rejection/random retry loop exists. Invalid test-only configuration that yields zero eligible edges should throw rather than silently violate the fair-edge rule.

At `maxAsteroids`, no RNG is consumed. Spawn debt is capped at one current interval so capacity release can spawn promptly but never bursts through accumulated debt.

## Energy orb placement

At most one orb exists. Eight authored edge-biased normalized anchors pull the ship away from passive center camping:

```ts
export const ASTEROID_DRIFT_ORB_ANCHORS = [
    { x: 0.16, y: 0.18 },
    { x: 0.50, y: 0.14 },
    { x: 0.84, y: 0.18 },
    { x: 0.12, y: 0.50 },
    { x: 0.88, y: 0.50 },
    { x: 0.16, y: 0.82 },
    { x: 0.50, y: 0.86 },
    { x: 0.84, y: 0.82 },
] as const
```

Each spawn attempt:

1. consumes one RNG sample for a starting anchor index;
2. scans all eight anchors once in cyclic order;
3. accepts the first at least `orbPlayerMinDistance` from the player and at least `orbAsteroidClearance + asteroid.radius + orbRadius` from every active asteroid;
4. returns no orb if none is currently valid.

A failed attempt waits until the next full `orbSpawnInterval`; no same-frame retry. An orb expires after seven active simulation seconds. Collection removes it and increments `orbsCollected` once.

## Scoring

One pure scorer owns all arithmetic:

```text
score = floor(survivalSeconds) * 10 + orbsCollected * 250
```

Rules:

- survival is clamped `0..90`;
- orb count is non-negative integer;
- the game passes current config point values to the scorer so test/tuning overrides cannot diverge from the model;
- BaseGame time bonus is disabled;
- score is monotonic and synchronized only by positive delta through `addScore()`;
- collision keeps all earned score;
- successful timeout scores exactly 90 survival seconds.

No distance/speed/near-miss/combo/multiplier score exists in v1.

## Lifecycle and outcomes

`AsteroidDriftGame` extends `BaseGame` with `pausable: false`, `resettable: true`, and time bonus off.

- Start creates a fresh active run through BaseGame and adds the deterministic intro asteroid.
- Reset returns to idle centered zero-score state.
- Timeout sets outcome `survived`, synchronizes the exact-duration score, then delegates to BaseGame.
- Asteroid collision sets outcome `collision`, synchronizes current wall-clock survival score, and calls `end()` once.
- End/reset clears held input.
- No game-local interval/timeout/ticker exists.

The normal run has no Pause or manual End action.

## Renderer

`AsteroidDriftRenderer` extends `PixiJSRenderer` and uses two game-local graphics layers:

1. static background — dark field, border, fixed authored star dots drawn once;
2. dynamic entities — cleared/redrawn for orb, asteroids, and ship.

The player is a non-color-only triangular ship whose visual heading derives from velocity with `atan2`; when nearly stationary it points right. Collision remains model-owned circle geometry. Asteroids are outlined circles with crater marks. Energy orbs use a double-ring/diamond treatment so identity is not color-only.

No textures, sprite sheets, particle system, filters, or asset pipeline are added.

As in Gravity Flip, override Pixi auto-density inline canvas sizing to `width: 100%` / `height: auto` so 800×480 remains responsive. The non-interactive canvas uses `touch-action: manipulation`; gameplay touch lives on native buttons.

## Controls and accessibility

Desktop:

- Arrow keys + WASD;
- keydown presses a direction, keyup releases it;
- Ctrl/Meta/Alt combinations are ignored;
- `isEditableTarget()` prevents gameplay input from stealing editable controls.

Mobile/pointer:

- four native Astro buttons form a compact D-pad;
- `pointerdown` presses;
- `pointerup`, `pointerleave`, and `pointercancel` release;
- implicit pointer capture is released in the same defensive pattern as Evader so touch slide-off can release;
- keyboard/touch held sets are independent, so releasing one source cannot cancel the other;
- multi-direction input naturally supports diagonals.

No canvas hit-testing or virtual joystick.

A polite `aria-live` node announces start, orb collection, collision, and full completion only—not every frame/spawn.

## Page and HUD

Route: `/asteroid-drift`.

`GamePage`:

- `initialTime={90}`;
- `showPause={false}`;
- `showEnd={false}`;
- `showReset={true}`;
- collision title `SHIP LOST`;
- successful timeout title changed by initializer to `DRIFT COMPLETE`.

Visible additional badges are only Orbs and rounded ship speed. Existing GamePage score/time remain authoritative. Final stats show outcome, survival seconds, and orb count.

Controls contain Start/Reset plus D-pad. Play Again follows BaseGame's completed-run start behavior and immediately begins a fresh run, matching recent continuous games.

## Catalog and achievements

Stable ID/icon:

```ts
GameID.ASTEROID_DRIFT = 'asteroid_drift'
icon = '☄️'
```

Catalog row:

- name `Asteroid Drift`;
- category `action`;
- duration `1-2 minutes`;
- difficulty `medium`;
- tags `asteroid`, `space`, `survival`, `single-player`, `momentum`;
- organism `{ shape: 'spiral', color: 'amber' }`;
- depth `shallow`.

Depth fixture changes from `8 / 9 / 4` to `9 / 9 / 4`.

After the manual tuning checkpoint, freeze exactly four achievements:

1. **First Charge** — collect ≥1 orb — Common.
2. **Energy Runner** — collect ≥6 orbs — Rare.
3. **Long Haul** — survive ≥60 wall-clock seconds — Rare.
4. **Deep Space Ace** — survive full 90s and collect ≥10 orbs — Epic.

No extra persisted metric is introduced.

## Initializer responsibilities

`initFramework.ts` owns integration only:

- create default config/game/renderer;
- wire BaseGame callbacks to HUD/overlay/status;
- forward end-event achievements/challenges;
- map keyboard/D-pad events to direction API;
- wire Start, Reset, Play Again;
- own exactly one rAF loop using monotonic rAF timestamps;
- render idle state;
- apply responsive canvas inline sizing;
- add/remove beforeunload guard while active;
- expose `window.asteroidDriftGame` for existing debug/E2E style;
- clean tracked listeners, rAF, renderer, and game exactly once.

No second rAF, `setInterval`, Pixi ticker callback, or canvas movement listener is introduced by Asteroid Drift. BaseGame's existing `GameTimer` interval remains the sole wall-clock timer.

## Testing strategy

### Pure spawning/scoring

Lock structural behavior:

- deterministic intro is RNG-free;
- player-near edge is excluded while valid alternatives remain;
- random asteroid starts fully outside selected edge and travels inward;
- radius/speed remain within ramped bounds;
- invalid RNG samples are clamped safely;
- max-active model path consumes zero RNG and caps debt;
- orb anchors reject player/asteroid proximity;
- all-blocked anchors return null after one finite scan;
- scorer clamps survival/orb inputs and uses supplied score config.

### Game model

Cover:

- idle centered zero-velocity state;
- held acceleration, diagonal normalization, coasting/drag, max-speed clamp;
- wall clamp/outward-velocity cancellation;
- independent keyboard/touch sets;
- intro creation;
- 0.1s outer clamp + non-vacuous fixed-step anti-tunneling collision;
- spawn interval/speed progression;
- capacity/no-burst behavior;
- orb create/expire/collect;
- collision-before-orb ordering;
- collision outcome and score preservation;
- timeout exact 90s score;
- BaseGame wall-clock survival vs simulation-clock difficulty distinction;
- reset/start cleanup;
- stats/game data.

### Renderer/initializer

Pin static-vs-dynamic layers, non-color-only primitive identity, responsive canvas override, exactly one game rAF path, listener cleanup, editable-target keyboard gating, D-pad pointer release semantics, HUD/overlay/replay behavior, and no duplicate integration loops.

### Browser

Extend `e2e/games/play-coverage.spec.ts`:

1. load route and start;
2. provide no movement and deterministically collide with intro asteroid;
3. assert `SHIP LOST` + final stats/inactive state;
4. Play Again and assert fresh active run;
5. at 375×812, assert no horizontal overflow and exercise real D-pad pointer press/release/diagonal state.

Keep `e2e/games/all-games-navigation.spec.ts` source unchanged; it should discover the active catalog route automatically and remains a required gate.

## Manual tuning checkpoint

After playable Task 4 and before registration/achievements, manually test desktop + 375×812:

1. Is the ~3s opening idle collision readable/dodgeable?
2. Does release preserve noticeable momentum without frustrating correction?
3. Do edge-biased orbs create voluntary risk without spawning on player/hazard?
4. Is 60–90s traffic harder but still readable?
5. Can the native D-pad create diagonals and release cleanly on touch?

If needed, tune only movement/asteroid/orb feel constants and their direct tests/docs. Do not widen architecture or change the score/lifecycle contract.

## Scope boundaries

HPA-68 does **not** add:

- shared movement/physics/spawn/survival framework;
- ECS or physics dependency;
- texture/sprite/audio pipeline;
- procedural levels/seed identity;
- health/shield/boost/fuel/weapons/bosses/destruction;
- near-miss/combo/distance/speed scoring;
- difficulty selection/upgrades;
- pause/manual End;
- touch joystick/canvas gameplay hit-testing;
- backend/API/DB/schema/auth/leaderboard changes;
- changes to BaseGame/GameTimer/ScoreManager/GameInitializer/PixiJSRenderer;
- changes to Evader or Gravity Flip.

## Definition of done

HPA-68 is complete when `/asteroid-drift` is keyboard/touch playable; movement is momentum-based/frame-stable; increasing edge traffic and collision work; orbs follow finite safe/risky placement; survival score uses BaseGame wall-clock time while simulation time only drives difficulty; reset/replay/submission work through existing lifecycle; catalog/data/achievements are registered; targeted/full unit, coverage, type, lint, format, build, Playwright and catalog-navigation gates pass; and the work remains one HPA-68 PR without unrelated framework/backend changes.
