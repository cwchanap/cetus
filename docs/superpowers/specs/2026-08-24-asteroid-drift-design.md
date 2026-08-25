# Asteroid Drift Design

**Linear:** HPA-68 — Minigame: Asteroid Drift

**Status:** Planning contract for one HPA-68 PR.

## Goal

Add a fast **90-second** space-dodging minigame where the player pilots a momentum-driven ship, avoids increasingly dense asteroid traffic, and diverts toward temporary energy orbs for bonus score. Asteroid collision ends the run immediately. A normal foreground run that simulates the full duration completes successfully.

The existing Cetus score, achievement, leaderboard/progress, stale-run, and BaseGame lifecycle machinery remains authoritative.

## Product contract

HPA-68 requires:

- a 1–2 minute action run;
- momentum-based movement rather than instant/grid movement;
- asteroids entering from screen edges with increasing density;
- energy orbs in safe-but-risky positions that encourage movement;
- score from survival plus orb collection;
- immediate loss on asteroid collision;
- desktop and mobile controls;
- normal catalog/home-page/restart/progress integration.

V1 fixes one 90-second ruleset. No difficulty selector or progression system is added.

## Repository reuse

Asteroid Drift follows existing seams without turning them into a framework.

- **Gravity Flip shape:** `BaseGame`, game-local simulation time, outer delta clamp, fixed substeps, injected RNG, caught fire-and-forget `end()`, game-local Pixi renderer, and initializer-owned rAF.
- **Evader input:** independent keyboard/touch held sets plus defensive `releasePointerCapture()` for held pointer controls.
- **Shared geometry:** import `circleOverlap` and point `distance` from `src/lib/games/shared/geometry.ts`.
- **Shared utilities:** import `clamp`, `lerp`, and `isEditableTarget` from `src/lib/games/shared/utils.ts`. Do not use the duplicate `clamp`/`lerp` exports from `geometry.ts`.
- **BaseGame/GameTimer:** keep countdown, timeout delivery, score submission, achievements, stale-run guard, reset/start lifecycle, callbacks, and final save flow unchanged.
- **GamePage:** use the existing custom `slot="controls"` contract and keep the initializer script at page root after `</GamePage>`.

Rejected:

- reskin/refactor Evader — its direct movement and interval spawner conflict with the two defining mechanics;
- generic arcade/physics/spawn framework — one new circle-collision game does not justify it;
- GamePage/GameControls refactor — although `GameControls.astro` has a child slot, `GamePage.astro` currently chooses either the complete custom controls slot or `GameControls`. Changing that shared seam would require migration/review across existing custom-control games and is outside HPA-68.

The Asteroid Drift D-pad is therefore intentionally the **second local D-pad copy**. If a third game needs the same held-pointer D-pad, consider extracting a focused `GameDpad.astro` then; do not pre-build it now.

## Architecture

```text
Astro page / native D-pad / keyboard
              |
              v
      initFramework.ts
      - DOM callbacks
      - held-input mapping
      - exactly one game rAF
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

## Initial rules

Before implementation, this block is the frozen planning source. Once Task 1 creates `types.ts`, `ASTEROID_DRIFT_RULES` becomes the production authority. Tuning updates `types.ts`, its direct tests, and this block; the implementation plan does not maintain a third copy.

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
    orbPoints: 100,
} as const
```

The initial score economy intentionally makes orbs meaningful without making survival a rounding error: a full 90-second run with the Deep Space Ace threshold of 10 orbs starts at **900 survival + 1,000 orb = 1,900**, so orbs are about 53% of that strong-run total. The Task 4 tuning checkpoint may adjust both point constants if play shows that split is wrong.

## State and contracts

```ts
export type AsteroidDriftDirection = 'up' | 'down' | 'left' | 'right'
export type AsteroidDriftInputSource = 'keyboard' | 'touch'
export type AsteroidDriftOutcome =
    | 'playing'
    | 'collision'
    | 'survived'
    | 'expired'

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

`AsteroidDriftState` extends `BaseGameState` with `outcome`, `player`, `asteroids`, `energyOrb`, and `orbsCollected`.

Private runtime fields remain game-local: `elapsedSimSeconds`, asteroid/orb spawn accumulators, entity sequence, and independent keyboard/touch held-direction sets.

Canonical submitted/achievement data stays small:

```ts
export interface AsteroidDriftGameData {
    survivalSeconds: number
    orbsCollected: number
    survivedFullRun: boolean
}
```

## Time ownership and anti-farming rule

Asteroid Drift deliberately distinguishes **wall deadline** from **scored survival**.

- `BaseGame/GameTimer` owns the 90-second countdown, visible time, timeout delivery, and save lifecycle.
- `elapsedSimSeconds` advances only through clamped physics substeps and owns difficulty progression **and scored survival**.

This is necessary because browsers may suspend `requestAnimationFrame` in a hidden tab while `GameTimer` continues to advance from `Date.now()`. Awarding score directly from wall elapsed time would let a player background the tab and receive survival score without simulating asteroid risk.

`elapsedSimSeconds` is clamped to `0..duration`. Normal score/data use that value.

At wall-clock timeout, classify completion using one existing tolerance rather than a new tuning constant:

```ts
const simulated = clamp(this.elapsedSimSeconds, 0, this.config.duration)
const completedSimulation =
    simulated >= this.config.duration - this.config.maxUpdateDelta

this.state.outcome = completedSimulation ? 'survived' : 'expired'
```

`survivalSeconds()` returns `config.duration` only for `outcome === 'survived'`; otherwise it returns clamped `elapsedSimSeconds`.

Consequences:

- a healthy foreground run within one outer-frame clamp of 90 seconds gets exactly 90 survival seconds;
- a hidden/background run whose timer expires with little/no simulated play gets only the simulation it actually completed, `outcome: 'expired'`, and `survivedFullRun: false`;
- a heavily janked device receives partial survival credit rather than free wall-clock credit;
- no `visibilitychange` pause path or second timer is introduced.

`survivedFullRun` is true only for `outcome === 'survived'`.

## Player movement

The ship starts centered with zero velocity. Each physics substep:

1. union keyboard/touch held directions;
2. convert opposing directions to signed x/y input;
3. normalize diagonal input;
4. apply `thrustAcceleration * step`;
5. apply frame-rate-independent drag with `Math.exp(-dragPerSecond * step)`;
6. clamp velocity magnitude to `maxPlayerSpeed`;
7. integrate position;
8. clamp center inside the arena by `playerRadius`;
9. zero only the velocity component pointing farther outside when a wall is reached.

The ship coasts after release but remains correctable. No boost, dash, health, shield, fuel, weapons, or rotation control.

## Physics stepping and ordering

`update(deltaSeconds)`:

- ignores inactive/paused/non-finite/non-positive deltas;
- clamps one incoming frame to `maxUpdateDelta`;
- subdivides into at most `maxPhysicsStep` physics steps;
- synchronizes score and emits state after stepping.

Every substep uses this order:

1. advance `elapsedSimSeconds` up to `duration`;
2. integrate player;
3. move and despawn asteroids;
4. age/expire current orb;
5. check asteroid collision;
6. collect orb if still alive;
7. advance spawn accumulators and attempt spawning.

Collision intentionally precedes orb collection. If both contacts occur in one substep, the run is lost and the orb is not awarded.

## Deterministic opening asteroid

`onGameStart()` creates one RNG-free asteroid outside the right edge at center Y using the intro radius and initial speed. With the initial values it reaches the centered idle player in about three seconds.

Random asteroid accumulation starts at `-openingRandomSpawnGrace`, so the opening lesson and browser loss path remain deterministic.

## Random asteroid spawning

Difficulty progress is `clamp(elapsedSimSeconds / duration, 0, 1)`.

One finite random materialization:

1. resolve eligible edges;
2. choose one edge with injected RNG;
3. choose radius and along-edge coordinate;
4. place the center outside by `asteroidSpawnPadding + radius`;
5. choose one target inside the target-inset rectangle;
6. normalize spawn→target;
7. apply ramped speed plus bounded jitter.

An edge is eligible only when the player's center is at least `asteroidSafeEdgeDistance` from it. No rejection/random retry loop exists. Invalid test configuration with zero eligible edges throws.

At `maxAsteroids`, consume zero RNG and cap asteroid spawn debt at one current interval. There is no catch-up spawn loop.

### All-edge despawn

`spawning.ts` owns one pure predicate:

```ts
export function isAsteroidOffArena(
    asteroid: AsteroidDriftAsteroid,
    config: AsteroidDriftConfig
): boolean {
    const margin = config.asteroidSpawnPadding + asteroid.radius
    return (
        asteroid.x < -margin ||
        asteroid.x > config.canvasWidth + margin ||
        asteroid.y < -margin ||
        asteroid.y > config.canvasHeight + margin
    )
}
```

Strict comparison means a newly spawned body exactly on an expanded boundary remains active. The same predicate handles left/right/top/bottom exits and is load-bearing for capacity release and orb clearance.

## Energy orb placement and cadence

At most one orb exists. Eight authored normalized edge-biased anchors keep placement finite:

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

Each attempt consumes one RNG sample for the starting anchor, scans all eight once cyclically, and accepts the first candidate that is:

- at least `orbPlayerMinDistance` from the player; and
- at least `orbAsteroidClearance + asteroid.radius + orbRadius` from every active asteroid.

If none is valid, the attempt ends and the next attempt waits a full interval.

Accumulator behavior is explicit:

- while an orb exists, the accumulator may advance but is capped at one `orbSpawnInterval`; no spawn attempt runs;
- collection **or expiry** removes the orb and resets the accumulator to `0`;
- when no orb exists and the interval is reached, perform exactly one finite spawn attempt and reset the accumulator to `0` whether the attempt succeeds or is blocked.

Therefore no orb debt can create an immediate replacement after collection/expiry and no same-frame retry loop exists.

## Scoring

One pure scorer owns all arithmetic:

```text
score = floor(survivalSeconds) * survivalPointsPerSecond
      + floor(orbsCollected) * orbPoints
```

Rules:

- survival is clamped `0..duration` and comes from simulated survival as described above;
- orb count is normalized to a non-negative integer;
- current config point values are passed to the scorer;
- BaseGame time bonus is disabled;
- score only moves upward through positive `addScore()` delta;
- collision/expiry retain score already earned.

The formula shape is structural. `survivalPointsPerSecond` and `orbPoints` are tuning values until the Task 4 manual checkpoint is complete.

## Lifecycle and outcomes

`AsteroidDriftGame` uses `pausable: false`, `resettable: true`, BaseGame time bonus off.

- Start resets private runtime and creates the deterministic intro asteroid.
- Reset returns to centered zero-score idle state.
- Timer completion classifies `survived` vs `expired` from simulation completion, synchronizes score, then delegates to BaseGame.
- Collision sets `outcome: 'collision'`, synchronizes score, starts the existing async end path as caught fire-and-forget, and returns before orb/spawn work:

```ts
void this.end().catch((error: unknown) =>
    console.error('AsteroidDrift end failed', error)
)
```

- End/reset clears held input.
- No game-local interval/timeout/ticker exists.

## Renderer

`AsteroidDriftRenderer` extends `PixiJSRenderer` with two local layers:

1. static background — dark field, border, fixed authored star dots;
2. dynamic entities — orb, asteroids, ship.

Visual collision honesty is a contract, not a tuning detail:

- every ship hull vertex is derived from `player.radius` and remains at distance `<= player.radius` from the model center;
- asteroid outer circle radius is exactly `asteroid.radius`; crater marks remain inside it;
- energy-orb outer ring radius is exactly `orb.radius`; inner diamond/cross decoration remains inside it;
- no independent visual-size constants exist for these collision-bearing extents.

The ship points along velocity with `atan2`, or right when nearly stationary. Collision remains model-owned circle geometry.

No textures, sprite sheets, filters, particle system, or asset pipeline.

Pixi auto-density inline sizing is overridden to `width: 100%` / `height: auto` as in Gravity Flip.

## Controls and accessibility

Desktop:

- Arrow keys + WASD;
- keydown presses, keyup releases;
- Ctrl/Meta/Alt combinations ignored;
- editable targets ignored through `isEditableTarget()`.

Mobile/pointer:

- explicit custom `slot="controls"` contains Start/Reset and a four-button native D-pad;
- D-pad buttons use `data-direction`, `aria-label`, and `tabindex="-1"`;
- pointerdown presses and defensively releases implicit pointer capture;
- pointerup/leave/cancel release;
- keyboard/touch held sets are independent;
- diagonal input is supported by simultaneous directions.

No canvas hit-testing or virtual joystick.

A polite live region announces start, orb collection, collision, full completion, and incomplete expiry only—not frames/spawns.

## Page and results

Route: `/asteroid-drift`.

`GamePage` uses `initialTime={90}`, no Pause, no manual End, Reset enabled.

Result copy:

- collision: `SHIP LOST` / `Collision`;
- qualifying full simulation: `DRIFT COMPLETE` / `Survived`;
- wall timer expired before enough simulation: `DRIFT ENDED` / `Expired`.

Visible additional stats are Orbs and rounded ship speed. Existing GamePage score/time remain authoritative. Final stats show outcome, simulated survival seconds, and orb count.

Initializer script lives after `</GamePage>`; `game-board-markup.test.ts` locks that placement and adds `asteroid-drift` to its hardcoded GamePage wrapper sweep when Task 4 creates the page.

## Catalog and achievements

Stable identity:

```ts
GameID.ASTEROID_DRIFT = 'asteroid_drift'
icon = '☄️'
```

Catalog:

- action;
- `1-2 minutes`;
- medium;
- tags: asteroid, space, survival, single-player, momentum;
- organism `{ shape: 'spiral', color: 'amber' }`;
- shallow depth.

Depth fixture becomes `9 / 9 / 4`.

After tuning, freeze exactly four achievements:

1. **First Charge** — collect at least 1 orb — Common.
2. **Energy Runner** — collect at least 6 orbs — Rare.
3. **Long Haul** — simulate at least 60 survival seconds — Rare.
4. **Deep Space Ace** — `survivedFullRun` and at least 10 orbs — Epic.

Backgrounding cannot earn Long Haul or Deep Space Ace because their data comes from simulated survival/full-run qualification.

## Risks and tuning focus

### Late-run fairness

Fair-edge spawning prevents immediate player-edge ambushes, but it does not mathematically guarantee an escape corridor when multiple independent asteroids converge. That is acceptable for v1 only if manual play shows deaths remain readable and avoidable enough for an arcade survival game. Do not add pathfinding/fair-gap generation unless the checkpoint demonstrates a real problem.

### Score balance

Orb bonuses are the skill/risk channel, but survival must remain material. Initial values target roughly equal survival/orb contribution around a strong 10-orb full run. Tune point constants if the run feels like only orb collection matters or, conversely, orb risk is not worth taking.

### Background/jank divergence

Wall time can advance faster than simulation when the page is hidden or heavily throttled. The `expired` classification and simulation-based survival score intentionally prevent free leaderboard/achievement credit rather than adding visibility pause machinery.

## Mandatory manual checkpoint

After the playable Task 4 route and before catalog/achievement values are frozen, test desktop + 375×812:

1. Is the ~3-second opening idle collision readable and dodgeable?
2. Does release preserve noticeable momentum without frustrating correction?
3. Do edge-biased orbs create voluntary risk without unsafe placement?
4. During 60–90s traffic, did any death feel effectively unavoidable rather than earned?
5. Can the native D-pad create diagonals and release cleanly on touch?
6. After a strong run, does the score feel like it rewarded both survival and orb collection rather than only one channel?

Allowed tuning values:

- acceleration, drag, max player speed;
- asteroid radius/interval/speed/jitter;
- orb cadence/lifetime/player distance/asteroid clearance;
- `survivalPointsPerSecond` and `orbPoints`.

Do not tune duration, finite spawn/despawn algorithms, timeout/full-run qualification, input/lifecycle architecture, or the score formula shape.

## Scope boundaries

HPA-68 does **not** add:

- shared movement/physics/spawn/survival framework;
- `GameDpad.astro` or GamePage/GameControls migration;
- ECS or physics dependency;
- texture/sprite/audio pipeline;
- seeded/procedural run identity;
- health/shield/boost/fuel/weapons/bosses/destruction;
- near-miss/combo/distance/speed scoring;
- difficulty selector/upgrades;
- manual pause/End;
- visibility-change pause behavior;
- joystick/canvas gameplay hit-testing;
- backend/API/DB/schema/auth/leaderboard changes;
- changes to BaseGame/GameTimer/ScoreManager/GameInitializer/PixiJSRenderer;
- changes to Evader or Gravity Flip.

## Definition of done

HPA-68 is complete when `/asteroid-drift` is keyboard/touch playable; movement is momentum-based and fixed-step; increasing edge traffic and all-edge despawn work; orb placement/cadence are finite; collision feels visually honest; score and achievements accrue from simulated survival rather than background wall time; full-run qualification is not farmable by hiding the tab; reset/replay/submission use existing lifecycle; catalog/data/achievements are registered; manual tuning addresses fairness and score split; targeted/full unit, coverage, type, lint, format, build, Playwright, and catalog-navigation gates pass; and the work remains one HPA-68 PR without unrelated framework/backend changes.
