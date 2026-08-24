# Asteroid Drift Design

**Linear:** HPA-68 — Minigame: Asteroid Drift

**Status:** Approved planning direction for a single HPA-68 implementation PR.

## Goal

Add a fast 90-second space-dodging minigame where the player pilots a momentum-driven ship, avoids increasingly dense asteroid traffic, and diverts toward temporary energy orbs for bonus score. A collision ends the run immediately; surviving the full timer completes it. The existing Cetus score/achievement/progress flow remains authoritative.

## Product contract

HPA-68 requires:

- a 1–2 minute action run;
- momentum-based movement rather than grid/instant movement;
- asteroids entering from screen edges with increasing density;
- energy orbs placed at safe-but-risky positions;
- score from survival time plus orb collection;
- immediate run end on asteroid collision;
- desktop and mobile controls;
- normal Cetus catalog, restart, leaderboard/progress, and achievement integration.

For v1, the run duration is fixed at **90 seconds**.

## Repository findings

Asteroid Drift should reuse existing seams, not existing game rules.

- `EvaderGame` already demonstrates held keyboard + touch input and an 800px Pixi canvas, but its movement is direct velocity assignment and its object spawning uses a wall-clock interval. Reworking Evader into Asteroid Drift would couple two distinct games and still leave the momentum/fair-spawn problem unsolved.
- `GravityFlipGame` demonstrates the better lifecycle for a new continuous-motion game: `BaseGame`, game-local simulation time, a 0.1s outer delta clamp, fixed physics substeps, a game-local scorer, injected RNG, local state-change emission, and one initializer-owned rAF loop.
- `GravityFlipRenderer` / recent Pixi games show that a game-local `PixiJSRenderer` subclass is sufficient. Asteroid Drift needs no scene engine, physics package, sprite assets, or shared ECS.
- `shared/geometry.ts` already exports `circleOverlap`; `shared/utils.ts` already exports `clamp`, `lerp`, and `isEditableTarget`. Those are enough shared primitives.
- `BaseGame` already owns timer completion, score submission, achievements, stale-run protection, reset/start lifecycle, and score callbacks. Asteroid Drift must not duplicate those systems.

## Approaches considered

### A. Standalone BaseGame + Pixi game-local physics — chosen

Create a small `asteroid-drift` module with local contracts, spawn policy, scorer, model, renderer, and initializer. Copy the established seams from Gravity Flip and the held-control interaction pattern from Evader, but keep Asteroid Drift rules local.

This is the smallest option that gives the game its required movement feel and fair spawning while remaining easy to tune and test.

### B. Re-skin or generalize Evader — rejected

Evader's instant directional velocity is the opposite of HPA-68's momentum requirement. Its interval-based spawning and coin/bomb collision semantics are also not the model needed here. Extracting a shared movement/spawn framework before Asteroid Drift exists would add migration work to an unrelated shipped game.

### C. Add a generic 2D physics/spawn framework — rejected

A new engine abstraction, collision world, entity system, spawn scheduler, or external physics dependency is unnecessary for one circle-collision arcade game. If a later game independently needs the exact same contracts, extraction can happen then.

## Architecture

The v1 production shape is:

```text
Astro page / native D-pad / keyboard
              |
              v
      initFramework.ts
      - DOM callbacks
      - held-input mapping
      - one rAF loop
      - cleanup / debug handle
          |             |
          v             v
AsteroidDriftGame   AsteroidDriftRenderer
(BaseGame)          (PixiJSRenderer)
     |                    |
     v                    v
spawning.ts          static background
scoring.ts           + dynamic graphics
```

No production file outside the game module changes until stable ID/icon/catalog/data/achievement registration becomes necessary.

## Rules and tuning constants

`types.ts` owns one `ASTEROID_DRIFT_RULES` constant object. Initial v1 values are:

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

These are initial tuning values, not a framework API. The mandatory manual-play checkpoint may adjust acceleration/drag/max speed, asteroid interval/speed/radius, and orb cadence/clearance once, before registration and achievement thresholds are frozen. Structural behavior described below does not change at that checkpoint.

## State and contracts

The canonical game-local types are:

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

`AsteroidDriftState` extends `BaseGameState` with:

- `outcome`;
- `player`;
- `asteroids`;
- `energyOrb: AsteroidDriftOrb | null`;
- `orbsCollected`.

Simulation-only clocks and accumulators stay private on `AsteroidDriftGame`:

- `elapsedSimSeconds`;
- `asteroidSpawnAccumulator`;
- `orbSpawnAccumulator`;
- `entitySequence`;
- keyboard/touch held-direction sets.

They reset on start/reset and do not become persisted state.

`AsteroidDriftStats` contains final score, survival seconds, outcome, and orb count. `AsteroidDriftGameData` contains:

```ts
{
    survivalSeconds: number
    orbsCollected: number
    survivedFullRun: boolean
}
```

This is sufficient for achievements without inventing extra telemetry.

## Player movement

The ship starts centered with zero velocity.

Each physics substep:

1. Resolve the union of keyboard/touch held directions.
2. Convert opposing inputs to a signed x/y axis.
3. Normalize diagonal input so diagonal thrust is not stronger.
4. Add `thrustAcceleration * step` to velocity.
5. Apply frame-rate-independent drag with `Math.exp(-dragPerSecond * step)`.
6. Clamp velocity magnitude to `maxPlayerSpeed`.
7. Integrate position.
8. Clamp the ship center inside the arena by `playerRadius`.
9. If a boundary was crossed, zero only the outward velocity component.

The ship therefore coasts after release but slows quickly enough for keyboard and D-pad control. There is no rotation control, boost, health, shield, dash, or fuel meter in v1.

## Physics stepping and update order

`update(deltaSeconds)` follows Gravity Flip's proven shape:

- ignore inactive/paused/non-finite/non-positive input;
- clamp one incoming frame to `maxUpdateDelta = 0.1`;
- subdivide into at most `1/120s` physics steps;
- after stepping, synchronize score and emit state.

Each substep order is fixed:

1. advance `elapsedSimSeconds`;
2. integrate the player;
3. move/despawn asteroids;
4. age/expire the current orb;
5. check asteroid collision;
6. collect the orb if still alive;
7. advance asteroid/orb spawn accumulators and spawn if eligible.

Collision happens before orb collection. If an asteroid and orb are reached on the same substep, the collision ends the run and no orb is awarded.

All asteroid and ship collisions use `circleOverlap` from `shared/geometry.ts` with its existing inclusive contact semantics.

## Opening hazard

The first hazard is deterministic and consumes no RNG.

On start, spawn one `intro` asteroid fully outside the right edge, centered vertically, radius 26, traveling horizontally left at the current initial asteroid speed. The player starts at the arena center.

This gives the player roughly three seconds to understand thrust and dodge, while also providing a deterministic browser-level loss path: doing nothing must collide with the intro asteroid before random traffic matters.

Random asteroid spawning observes `openingRandomSpawnGrace = 4`; the random spawn accumulator begins at `-4`, so the first random spawn cannot occur before the opening lesson is readable.

## Asteroid density and fair edge spawning

Random traffic uses a game-local pure helper in `spawning.ts`.

Difficulty progress is `clamp(elapsedSimSeconds / duration, 0, 1)`.

- Spawn interval linearly ramps from 1.35s to 0.45s.
- Base asteroid speed linearly ramps from 140 px/s to 240 px/s.
- Radius varies from 18 to 36 px.
- Speed receives bounded ±15% jitter.
- Asteroids travel in straight lines; they do not accelerate, bounce, home, or collide with each other.

### Safe edge rule

Eligible spawn edges are derived from the current player position. An edge is eligible only when the player's center is at least `asteroidSafeEdgeDistance` from that edge.

With an 800×480 arena and a 190px threshold, at least one edge is always eligible. This prevents a new asteroid from materializing immediately beside a ship hugging an edge without introducing retries.

For a spawn:

1. choose one eligible edge using injected `rng`;
2. choose the along-edge coordinate within radius-safe bounds;
3. place the asteroid fully off-screen using `asteroidSpawnPadding + radius`;
4. choose a target point inside the arena's `asteroidTargetInset` rectangle;
5. normalize the vector from spawn to target;
6. multiply by the current ramped speed plus bounded jitter.

There is no rejection loop and no unbounded RNG retry.

When `maxAsteroids` is reached, no RNG is consumed. The spawn accumulator is capped at one current interval so one asteroid can spawn promptly after capacity becomes available without a burst of catch-up spawns.

## Energy orb placement

At most one energy orb exists at a time.

The game owns eight authored edge-biased normalized anchor positions:

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

These positions pull the player away from passive center camping and toward regions where new asteroid traffic can enter, satisfying the ticket's “safe-but-risky” intent without procedural navigation logic.

At each orb spawn attempt:

1. consume one RNG sample to choose a starting anchor index;
2. scan all eight anchors once in cyclic order;
3. accept the first anchor at least `orbPlayerMinDistance` from the player and at least `orbAsteroidClearance + asteroid.radius + orbRadius` from every active asteroid;
4. if none is valid, skip this attempt and try again only after another `orbSpawnInterval`.

There is no retry loop and no extra RNG while scanning.

An orb expires after seven active simulation seconds if not collected. Collection increments `orbsCollected`, removes the orb, and affects score immediately.

## Scoring

One pure scorer owns all Asteroid Drift score arithmetic:

```ts
score = floor(survivalSeconds) * 10 + orbsCollected * 250
```

Rules:

- `survivalSeconds` is clamped to `0..90`;
- BaseGame time bonus is disabled;
- score is monotonic during a run;
- `AsteroidDriftGame` synchronizes only the positive delta through `addScore()`;
- collision preserves all score earned before impact;
- timeout sets simulation survival to exactly 90 seconds before final score synchronization.

No combo, near-miss, speed, distance, multiplier, accuracy, or difficulty score exists in v1.

## Lifecycle and outcomes

`AsteroidDriftGame` extends `BaseGame` with `pausable: false`, `resettable: true`, and BaseGame time bonus disabled.

- `start()` creates a fresh active run through the existing BaseGame behavior.
- `onGameStart()` clears held input/private accumulators and creates the intro asteroid.
- `reset()` returns to an idle centered zero-score state.
- `handleTimeUp()` sets outcome to `survived`, pins simulation time to 90s, synchronizes score, then delegates to BaseGame.
- asteroid collision sets outcome to `collision`, synchronizes score, and calls `end()` once.
- end/reset clears held input.
- no interval/timeout exists inside the game, so cleanup only clears local references through normal `destroy()`.

There is no manual End button and no Pause button. The normal run ends only by collision or timeout.

## Renderer

`AsteroidDriftRenderer` extends `PixiJSRenderer` and uses simple Pixi primitives only.

Use two game-local graphics layers:

1. `backgroundGraphic` — static dark field, border, and a small authored starfield drawn once at setup;
2. `dynamicGraphic` — cleared each render and redraws ship, asteroids, orb, and optional short thrust indication.

The player is rendered as a non-color-only triangular ship. Its visual heading derives from velocity using `atan2`; when nearly stationary it points right. Collision remains a circle and is independent of triangle geometry.

Asteroids render as outlined circles with fixed crater marks. Energy orbs render as a bright double-ring/diamond combination so they are visually distinct without relying only on color.

No textures, sprite sheets, particle system, filters, audio-reactive effects, or asset pipeline are added.

`PixiJSRenderer`'s auto-density inline canvas size must be overridden to `width: 100%` / `height: auto`, matching Gravity Flip, so the intrinsic 800×480 aspect ratio remains correct on narrow screens.

## Controls and accessibility

Desktop:

- Arrow keys and WASD map to four directions.
- Keydown presses a direction; keyup releases it.
- Ctrl/Meta/Alt combinations are ignored.
- `isEditableTarget()` prevents gameplay input from stealing keys from editable controls.

Mobile/pointer:

- Astro owns four native direction buttons in a compact D-pad.
- Each button uses `pointerdown` to press and `pointerup`, `pointerleave`, and `pointercancel` to release.
- Keyboard and touch held sets are independent, so releasing one source does not cancel the other.
- Multi-direction input is supported naturally by the sets.

The canvas itself has no gameplay hit-testing.

The page exposes a polite `aria-live` status node. It announces run start, orb collection, collision, and full-run completion; it does not announce every frame or asteroid spawn.

## Page and HUD

Route: `/asteroid-drift`.

`GamePage` settings:

- `initialTime={90}`;
- `showPause={false}`;
- `showEnd={false}`;
- `showReset={true}`;
- collision overlay title: `SHIP LOST`;
- full-run title updated by the initializer to `DRIFT COMPLETE`.

Visible HUD badges:

- Orbs;
- Ship speed (rounded px/s).

The existing GamePage score and time fields remain authoritative. Final stats show outcome, survival seconds, and orb count.

Controls contain Start/Reset plus the native D-pad. Play Again uses existing BaseGame completed-run restart behavior and starts the next run immediately, matching Gravity Flip.

## Catalog and achievements

Add stable ID `GameID.ASTEROID_DRIFT = 'asteroid_drift'`, icon `☄️`, and route through the normal `getGameUrl()` transformation.

Catalog entry:

- name: `Asteroid Drift`;
- category: `action`;
- estimated duration: `1-2 minutes`;
- difficulty: `medium`;
- tags: `asteroid`, `space`, `survival`, `single-player`, `momentum`;
- organism: `{ shape: 'spiral', color: 'amber' }`;
- depth: `shallow`.

This intentionally changes the current depth partition from `8 / 9 / 4` to `9 / 9 / 4`.

Add four achievements after the manual tuning checkpoint:

1. **First Charge** — collect at least 1 orb — Common.
2. **Energy Runner** — collect at least 6 orbs in one run — Rare.
3. **Long Haul** — survive at least 60 seconds — Rare.
4. **Deep Space Ace** — survive the full 90 seconds and collect at least 10 orbs — Epic.

No achievement requires a separate stored metric.

## Initializer responsibilities

`initFramework.ts` owns only integration work:

- create default config/game/renderer;
- wire BaseGame callbacks into HUD/overlay/status;
- forward end-event achievements/challenges;
- map keyboard and D-pad events to the game's direction API;
- wire Start, Reset, Play Again;
- own exactly one rAF loop using the monotonic rAF timestamp and a 0.1s delta clamp;
- render initial idle state;
- apply responsive canvas inline styles;
- add/remove a beforeunload guard while a run is active;
- expose a window handle for the existing browser-test/debug pattern;
- clean all tracked listeners, rAF, renderer, and game exactly once.

No second ticker, setInterval, Pixi ticker callback, or canvas pointer movement path is introduced.

## Testing strategy

### Pure tests

`spawning.test.ts` freezes structural fairness rather than incidental random call counts:

- intro asteroid is deterministic and RNG-free;
- a player near one edge excludes that edge but leaves valid alternatives;
- random asteroids start fully outside the selected eligible edge and move inward;
- spawn speed/radius remain inside configured bounds;
- active-cap path consumes no RNG and cannot accumulate burst debt;
- orb anchor choice rejects player-near and asteroid-near anchors;
- no-valid-anchor returns null after one finite scan.

`scoring.test.ts` pins survival/orb arithmetic and clamping.

### Game tests

`AsteroidDriftGame.test.ts` covers:

- centered idle state and zero velocity;
- held input acceleration, diagonal normalization, drag/coasting, max-speed clamp;
- boundary clamp plus outward-velocity cancellation;
- independent keyboard/touch direction sets;
- intro asteroid creation;
- 0.1s outer clamp and fixed-step anti-tunneling collision proof;
- density/speed ramp progression;
- max-active spawn behavior;
- orb collection/expiry;
- collision-before-orb ordering;
- collision outcome/end and score preservation;
- timeout outcome with exact 90-second survival score;
- reset/start clears private state and held input;
- game data/stats.

### Renderer/initializer tests

Pin static-vs-dynamic layer setup, non-color-only shapes, responsive canvas override, one rAF path, DOM listener cleanup, editable-target keyboard gating, D-pad pointer hold/release semantics, HUD sync, collision/completion overlay copy, replay, and no duplicate initialization side effects.

### Browser coverage

Extend `e2e/games/play-coverage.spec.ts` with one Asteroid Drift journey:

1. load `/asteroid-drift`;
2. start;
3. do nothing and deterministically collide with the intro asteroid;
4. assert `SHIP LOST`, score/final survival/orb stats, and inactive state;
5. Play Again and prove a fresh active run;
6. at 375×812, assert no horizontal overflow and exercise a D-pad press/release through real pointer events.

Keep `all-games-navigation.spec.ts` production/test source unchanged; it should discover the new active catalog route automatically and serves as a required regression gate after registration.

## Manual tuning checkpoint

After the playable route/controls are complete and before achievements/catalog are frozen, manually play desktop and 375px mobile and answer exactly these questions:

1. Is the intro asteroid's ~3 second idle collision readable and dodgeable on the first attempt?
2. Does release preserve noticeable momentum without making precise correction frustrating?
3. Do orb anchors create voluntary risk instead of spawning on top of the player or active hazards?
4. Around 60–90 seconds, is traffic dense enough to feel harder without becoming visually unreadable?
5. Can the four-button D-pad comfortably produce diagonal thrust and clean release on touch?

If tuning is needed, change only the listed game-local constants and their direct tests/docs. Do not widen the architecture.

## Scope boundaries

HPA-68 does **not** add:

- a shared movement, physics, spawn, survival, or arcade framework;
- a generic entity/component system;
- a physics dependency;
- texture/sprite/audio asset pipelines;
- procedural levels or seeded run identity;
- health, shields, boost, fuel, weapons, bosses, asteroid destruction, near-miss scoring, combos, difficulty selection, or upgrades;
- pause/manual-end controls;
- touch joystick or canvas hit-testing;
- backend/API/database/schema/auth/leaderboard changes;
- changes to `BaseGame`, `GameTimer`, `ScoreManager`, `GameInitializer`, or `PixiJSRenderer`.

## Risks and mitigations

- **Unfair spawn near the ship:** edge eligibility is derived from player distance; no retry-based guesswork.
- **Orb appears directly inside danger:** finite authored-anchor scan checks current player/asteroid clearance.
- **Frame-rate-dependent momentum/collision:** exponential drag plus fixed substeps and outer delta clamp.
- **Background-tab delta spike:** initializer and model both clamp to 0.1s, following current continuous-game conventions.
- **Mobile stuck input:** independent source sets and pointer up/leave/cancel releases mirror the proven Evader control behavior.
- **Scope creep into a generic engine:** every new production helper stays under `src/lib/games/asteroid-drift/` unless it is existing shared code already reused elsewhere.

## Definition of done

HPA-68 is complete when:

- `/asteroid-drift` is playable with keyboard and touch D-pad;
- movement is momentum-based and frame-rate-stable;
- intro + increasing random asteroid traffic can end the run on collision;
- energy orbs follow the finite safe/risky placement contract;
- score combines survival seconds and orb bonuses through one pure scorer;
- timeout and collision both submit through existing BaseGame flow;
- reset and Play Again produce fresh runs;
- catalog/homepage/icon/organism/game-data/achievements are registered;
- targeted unit, markup, Playwright, typecheck, lint, format, build, and full test gates pass;
- the implementation remains one HPA-68 PR with no unrelated framework/backend work.
