# Asteroid Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-68 as a 90-second momentum-driven asteroid-dodging minigame with keyboard/touch controls, fair increasing traffic, energy-orb risk/reward, Pixi rendering, achievements, and the existing Cetus score submission flow.

**Architecture:** `AsteroidDriftGame` extends `BaseGame` and owns game-local fixed-step thrust physics, simulation-time spawn accumulators, collision, orb lifecycle, and score synchronization. `spawning.ts` owns pure finite asteroid/orb placement; `scoring.ts` owns arithmetic; `AsteroidDriftRenderer` extends `PixiJSRenderer`; one custom initializer owns held input, one rAF loop, HUD/overlay integration, and cleanup. Reuse existing shared geometry/input primitives only; do not extract an Evader/Gravity Flip/general arcade framework.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, PixiJS 8, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-24-asteroid-drift-design.md`

## Global Constraints

- One HPA-68 implementation PR. Continue implementation on this planning branch/PR; do not split the ticket into follow-up implementation PRs.
- Fixed 90-second run; asteroid collision or BaseGame timeout are the only normal end paths.
- Momentum is thrust + exponential drag + max-speed clamp. No instant grid/direct-position movement.
- Model input is four held directions with independent keyboard/touch source sets; diagonal input is normalized.
- `update()` clamps one incoming frame to `0.1s` and substeps by at most `1/120s`.
- Per-substep ordering is time → player → asteroid movement → orb aging → collision → orb collection → spawning.
- Collision beats orb collection if both happen in one substep.
- First asteroid is deterministic, RNG-free, enters from the right at center Y, and creates the browser-test idle-loss path.
- Random asteroid spawning starts only after the opening grace; interval ramps `1.35s → 0.45s`, base speed `140 → 240 px/s`, radius `18..36`, speed jitter `±15%`.
- A spawn edge is eligible only when the player center is at least `190px` from that edge. No rejection loop.
- At 24 active asteroids, consume zero RNG and cap accumulated spawn debt at one current interval.
- At most one orb exists. Orb placement scans eight authored anchors once from one RNG-selected start index and skips the attempt if none is safe.
- Orb rules: 4-second attempt cadence, 7-second lifetime, 12px radius, at least 150px from player and `70 + asteroid.radius + orbRadius` from each asteroid.
- Scoring authority is `floor(clamp(survivalSeconds, 0, 90)) * 10 + max(0, floor(orbsCollected)) * 250`; BaseGame time bonus is disabled.
- `GamePage`: `initialTime={90}`, `showPause={false}`, `showEnd={false}`, `showReset={true}`.
- Catalog identity: action / medium / `1-2 minutes` / shallow / `{ shape: 'spiral', color: 'amber' }`; depth fixture becomes `9 / 9 / 4`.
- No shared movement/physics/spawn/survival framework, ECS, physics dependency, sprites/textures/audio, seeded run system, health/shields/boost/weapons, near-miss/combo scoring, difficulty selector, pause/manual End, joystick/canvas hit-testing, backend/API/DB/schema/auth work, or package additions.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `GameInitializer.ts`, `PixiJSRenderer.ts`, score service, APIs, DB/schema, auth, and `e2e/games/all-games-navigation.spec.ts` remain source-unchanged.
- Reuse `circleOverlap`/`distance` from `shared/geometry.ts`, and `clamp`/`lerp`/`isEditableTarget` from existing shared helpers. Do not copy them locally.
- Run the mandatory manual-play tuning checkpoint after Task 4 and before Task 5 freezes catalog copy and achievement thresholds.

---

## File Map

### New game-local production files

- `src/lib/games/asteroid-drift/types.ts` — constants, state/config/entity/stats/data contracts, config factory.
- `src/lib/games/asteroid-drift/spawning.ts` — pure eligible-edge asteroid materialization and finite authored-anchor orb placement.
- `src/lib/games/asteroid-drift/scoring.ts` — single score arithmetic authority.
- `src/lib/games/asteroid-drift/AsteroidDriftGame.ts` — BaseGame lifecycle, held input, fixed-step motion, spawn accumulators, collision/orb lifecycle.
- `src/lib/games/asteroid-drift/AsteroidDriftRenderer.ts` — two-layer Pixi primitive renderer.
- `src/lib/games/asteroid-drift/initFramework.ts` — callbacks, native D-pad/keyboard integration, one rAF loop, cleanup/debug handle.
- `src/pages/asteroid-drift/index.astro` — GamePage route, HUD, D-pad, instructions, result markup, bootstrap.

### New co-located tests

- `src/lib/games/asteroid-drift/spawning.test.ts`
- `src/lib/games/asteroid-drift/scoring.test.ts`
- `src/lib/games/asteroid-drift/AsteroidDriftGame.test.ts`
- `src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts`
- `src/lib/games/asteroid-drift/initFramework.test.ts`

### Existing files changed when their contract becomes live

- `src/lib/games.ts` — Task 2 stable GameID/icon; Task 5 active catalog row.
- `src/lib/games.test.ts` — Task 2 icon lock + Task 5 registration lock.
- `src/lib/games/shared/types.ts` — Task 5 canonical `AsteroidDriftGameData` alias and union membership.
- `src/lib/organisms.test.ts` — Task 5 depth count becomes `9 / 9 / 4`.
- `src/lib/achievements.ts`, `src/lib/achievements.test.ts` — Task 5 four HPA-68 achievements.
- `src/pages/game-board-markup.test.ts` — Task 4 route markup/bootstrap contract; Task 5 include in registered shared sweep if that sweep is registration-scoped.
- `e2e/games/play-coverage.spec.ts` — Task 6 deterministic collision/replay + 375px D-pad proof.
- `CLAUDE.md` — Task 5 22-game/project-tree/debug-handle documentation.

### Required source-unchanged regression surfaces

- `src/lib/games/core/BaseGame.ts`
- `src/lib/games/core/GameTimer.ts`
- `src/lib/games/core/ScoreManager.ts`
- `src/lib/games/core/GameInitializer.ts`
- `src/lib/games/renderers/PixiJSRenderer.ts`
- `src/lib/games/evader/**`
- `src/lib/games/gravity-flip/**`
- `src/lib/services/scoreService.ts`
- `src/lib/server/db/**`
- `src/pages/api/**`
- auth modules
- `e2e/games/all-games-navigation.spec.ts`

---

## Task 1: Add rules, fair spawning, and score arithmetic

**Files**
- Create: `src/lib/games/asteroid-drift/types.ts`
- Create: `src/lib/games/asteroid-drift/spawning.ts`
- Create: `src/lib/games/asteroid-drift/spawning.test.ts`
- Create: `src/lib/games/asteroid-drift/scoring.ts`
- Create: `src/lib/games/asteroid-drift/scoring.test.ts`

**Interfaces**
- Produces `ASTEROID_DRIFT_RULES`, `AsteroidDriftConfig`, entity/state/stats/data types, `createAsteroidDriftConfig()`.
- Produces `ASTEROID_DRIFT_ORB_ANCHORS`, `eligibleAsteroidSpawnEdges()`, `createIntroAsteroid()`, `createRandomAsteroid()`, `findEnergyOrbSpawn()`.
- Produces `calculateAsteroidDriftScore()`.
- Task 2 consumes these APIs without duplicating spawn/scoring arithmetic.

- [ ] **1.1 Write RED rules/scoring tests**

Create `scoring.test.ts` with exact cases:

```ts
import { describe, expect, it } from 'vitest'
import { calculateAsteroidDriftScore } from './scoring'

it('scores completed survival seconds and orb bonuses', () => {
    expect(calculateAsteroidDriftScore({ survivalSeconds: 0, orbsCollected: 0 })).toBe(0)
    expect(calculateAsteroidDriftScore({ survivalSeconds: 12.99, orbsCollected: 2 })).toBe(620)
    expect(calculateAsteroidDriftScore({ survivalSeconds: 90, orbsCollected: 10 })).toBe(3400)
})

it('clamps survival and normalizes orb count', () => {
    expect(calculateAsteroidDriftScore({ survivalSeconds: -5, orbsCollected: -2 })).toBe(0)
    expect(calculateAsteroidDriftScore({ survivalSeconds: 999, orbsCollected: 1.9 })).toBe(1150)
})
```

Also assert the structural rule values in `spawning.test.ts`:

```ts
expect(ASTEROID_DRIFT_RULES.duration).toBe(90)
expect(ASTEROID_DRIFT_RULES.maxUpdateDelta).toBe(0.1)
expect(ASTEROID_DRIFT_RULES.maxPhysicsStep).toBe(1 / 120)
expect(ASTEROID_DRIFT_RULES.asteroidInitialInterval).toBeGreaterThan(
    ASTEROID_DRIFT_RULES.asteroidFinalInterval
)
expect(ASTEROID_DRIFT_RULES.asteroidInitialSpeed).toBeLessThan(
    ASTEROID_DRIFT_RULES.asteroidFinalSpeed
)
```

Run:

```bash
bun run test:run -- \
  src/lib/games/asteroid-drift/scoring.test.ts \
  src/lib/games/asteroid-drift/spawning.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **1.2 Implement canonical contracts and config factory**

`types.ts` starts with the exact rules from the spec and these interfaces:

```ts
import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

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

export interface AsteroidDriftConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    playerRadius: number
    thrustAcceleration: number
    dragPerSecond: number
    maxPlayerSpeed: number
    maxUpdateDelta: number
    maxPhysicsStep: number
    introAsteroidRadius: number
    asteroidSpawnPadding: number
    asteroidMinRadius: number
    asteroidMaxRadius: number
    asteroidInitialInterval: number
    asteroidFinalInterval: number
    asteroidInitialSpeed: number
    asteroidFinalSpeed: number
    asteroidSpeedJitter: number
    asteroidTargetInset: number
    asteroidSafeEdgeDistance: number
    maxAsteroids: number
    openingRandomSpawnGrace: number
    orbRadius: number
    orbSpawnInterval: number
    orbLifetime: number
    orbPlayerMinDistance: number
    orbAsteroidClearance: number
    survivalPointsPerSecond: number
    orbPoints: number
    rng: () => number
}

export interface AsteroidDriftState extends BaseGameState {
    outcome: AsteroidDriftOutcome
    player: AsteroidDriftPlayer
    asteroids: AsteroidDriftAsteroid[]
    energyOrb: AsteroidDriftOrb | null
    orbsCollected: number
}

export interface AsteroidDriftStats extends BaseGameStats {
    outcome: AsteroidDriftOutcome
    survivalSeconds: number
    orbsCollected: number
}

export interface AsteroidDriftGameData {
    survivalSeconds: number
    orbsCollected: number
    survivedFullRun: boolean
}
```

The factory is one shallow override seam for unit tests/tuning:

```ts
export function createAsteroidDriftConfig(
    overrides: Partial<AsteroidDriftConfig> = {}
): AsteroidDriftConfig {
    return {
        ...ASTEROID_DRIFT_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        rng: Math.random,
        ...overrides,
    }
}
```

Do not add per-entity classes, runtime registries, or a second rules object.

- [ ] **1.3 Write RED deterministic intro/eligible-edge tests**

Use a centered player and the default config:

```ts
const config = createAsteroidDriftConfig({ rng: () => 0 })
const player: AsteroidDriftPlayer = {
    x: config.canvasWidth / 2,
    y: config.canvasHeight / 2,
    velocityX: 0,
    velocityY: 0,
    radius: config.playerRadius,
}

const intro = createIntroAsteroid('asteroid-0', config)
expect(intro).toEqual({
    id: 'asteroid-0',
    x: config.canvasWidth + config.asteroidSpawnPadding + config.introAsteroidRadius,
    y: config.canvasHeight / 2,
    velocityX: -config.asteroidInitialSpeed,
    velocityY: 0,
    radius: config.introAsteroidRadius,
})
```

Pin edge safety by moving the player 20px from the left boundary:

```ts
const edges = eligibleAsteroidSpawnEdges({ ...player, x: 20 }, config)
expect(edges).not.toContain('left')
expect(edges.length).toBeGreaterThan(0)
```

Also sweep representative positions (four corners + center) and assert `edges.length > 0`; do not freeze exact full edge arrays except the near-left exclusion.

- [ ] **1.4 Implement finite asteroid materialization**

In `spawning.ts`, export:

```ts
export type AsteroidSpawnEdge = 'top' | 'right' | 'bottom' | 'left'

export function eligibleAsteroidSpawnEdges(
    player: Pick<AsteroidDriftPlayer, 'x' | 'y'>,
    config: AsteroidDriftConfig
): AsteroidSpawnEdge[]

export function createIntroAsteroid(
    id: string,
    config: AsteroidDriftConfig
): AsteroidDriftAsteroid

export function createRandomAsteroid(
    id: string,
    player: Pick<AsteroidDriftPlayer, 'x' | 'y'>,
    progress: number,
    config: AsteroidDriftConfig
): AsteroidDriftAsteroid
```

Implement edge distances directly:

```ts
const candidates: Array<[AsteroidSpawnEdge, number]> = [
    ['top', player.y],
    ['right', config.canvasWidth - player.x],
    ['bottom', config.canvasHeight - player.y],
    ['left', player.x],
]
return candidates
    .filter(([, distanceToEdge]) => distanceToEdge >= config.asteroidSafeEdgeDistance)
    .map(([edge]) => edge)
```

For RNG, clamp samples to `[0, 1)` with one private helper so `1`, negatives, or non-finite injected values cannot create an out-of-range index:

```ts
function unitSample(rng: () => number): number {
    const value = rng()
    if (!Number.isFinite(value)) return 0
    return Math.min(1 - Number.EPSILON, Math.max(0, value))
}
```

`createRandomAsteroid()` must:

1. clamp `progress` to `0..1`;
2. choose one current eligible edge from one RNG sample;
3. choose radius in `min..max`;
4. choose the along-edge coordinate in radius-safe bounds;
5. place center fully outside by `spawnPadding + radius`;
6. choose target X/Y inside the inset rectangle;
7. normalize the spawn→target vector;
8. compute base speed with `lerp(initial, final, progress)` and bounded `±speedJitter`;
9. return one straight-line asteroid.

No helper may loop on RNG.

- [ ] **1.5 Add structural random-spawn tests**

Use deterministic sample streams, but assert outcomes rather than incidental total call counts:

- player-near-left never selects left;
- every generated center is fully beyond the chosen arena edge;
- velocity points inward (`vx > 0` for left, `vx < 0` for right, etc.);
- radius is within `18..36`;
- speed magnitude is within `baseSpeed * 0.85 .. baseSpeed * 1.15` for progress 0 and 1;
- generated values remain finite for injected `NaN`, `-1`, and `1` samples.

- [ ] **1.6 Write RED and implement finite orb anchor placement**

Export exact anchors:

```ts
export const ASTEROID_DRIFT_ORB_ANCHORS = [
    { x: 0.16, y: 0.18 },
    { x: 0.5, y: 0.14 },
    { x: 0.84, y: 0.18 },
    { x: 0.12, y: 0.5 },
    { x: 0.88, y: 0.5 },
    { x: 0.16, y: 0.82 },
    { x: 0.5, y: 0.86 },
    { x: 0.84, y: 0.82 },
] as const
```

Signature:

```ts
export function findEnergyOrbSpawn(
    player: Pick<AsteroidDriftPlayer, 'x' | 'y'>,
    asteroids: readonly AsteroidDriftAsteroid[],
    config: AsteroidDriftConfig
): { x: number; y: number } | null
```

Use one RNG sample for `startIndex`, then scan all eight anchors cyclically exactly once. Convert each normalized anchor to canvas coordinates. Accept only when:

```ts
distance(candidate, player) >= config.orbPlayerMinDistance
```

and for every asteroid:

```ts
distance(candidate, asteroid) >=
    config.orbAsteroidClearance + asteroid.radius + config.orbRadius
```

Tests must prove:

- an anchor too near the player is skipped for the next valid authored anchor;
- an anchor too near an asteroid is skipped;
- when all eight are blocked, result is `null` after the finite scan;
- there is no random retry path.

- [ ] **1.7 Implement scorer and run Task 1 green gate**

`scoring.ts` is only:

```ts
import { clamp } from '@/lib/games/shared/utils'
import { ASTEROID_DRIFT_RULES } from './types'

export function calculateAsteroidDriftScore(input: {
    survivalSeconds: number
    orbsCollected: number
}): number {
    const survivalSeconds = Math.floor(
        clamp(
            Number.isFinite(input.survivalSeconds) ? input.survivalSeconds : 0,
            0,
            ASTEROID_DRIFT_RULES.duration
        )
    )
    const orbsCollected = Math.max(
        0,
        Math.floor(Number.isFinite(input.orbsCollected) ? input.orbsCollected : 0)
    )
    return (
        survivalSeconds * ASTEROID_DRIFT_RULES.survivalPointsPerSecond +
        orbsCollected * ASTEROID_DRIFT_RULES.orbPoints
    )
}
```

Run:

```bash
bun run test:run -- src/lib/games/asteroid-drift
bun run typecheck
```

Expected: PASS.

- [ ] **1.8 Commit**

```bash
git add src/lib/games/asteroid-drift
git commit -m "feat(asteroid-drift): add rules spawning and scoring"
```

---

## Task 2: Add stable identity and the momentum BaseGame model

**Files**
- Create: `src/lib/games/asteroid-drift/AsteroidDriftGame.ts`
- Create: `src/lib/games/asteroid-drift/AsteroidDriftGame.test.ts`
- Modify: `src/lib/games.ts` — add only stable `GameID` + icon in this task, not active catalog row.
- Modify: `src/lib/games.test.ts` — icon/ID lock only; final registration waits for Task 5.

**Interfaces**
- Consumes Task 1 config/spawn/scorer APIs.
- Produces `AsteroidDriftGame` with `pressDirection()`, `releaseDirection()`, `getConfig()`, `getGameStats()`, BaseGame `getState()`, and a test-visible read-only `pressedDirections` getter.
- Task 4 initializer is the only browser consumer of the held-direction methods.

- [ ] **2.1 Add stable GameID/icon without activating the route**

Add:

```ts
ASTEROID_DRIFT = 'asteroid_drift',
```

to `GameID` and:

```ts
[GameID.ASTEROID_DRIFT]: '☄️',
```

to `GAME_ICONS` so the exhaustive `Record<GameID, string>` remains valid.

Test only:

```ts
expect(GameID.ASTEROID_DRIFT).toBe('asteroid_drift')
expect(getGameIcon(GameID.ASTEROID_DRIFT)).toBe('☄️')
```

Do not add a throwaway `getGameById(...) === undefined` assertion.

Run:

```bash
bun run test:run -- src/lib/games.test.ts
```

Expected: PASS after the enum/icon edit.

- [ ] **2.2 Write RED initial-state, input, and movement tests**

Create a helper:

```ts
function createGame(
    overrides: Partial<AsteroidDriftConfig> = {},
    callbacks: BaseGameCallbacks = {}
) {
    return new AsteroidDriftGame(
        createAsteroidDriftConfig({ rng: () => 0, ...overrides }),
        callbacks
    )
}
```

Pin idle state:

```ts
expect(game.getState()).toMatchObject({
    score: 0,
    timeRemaining: 90,
    isActive: false,
    outcome: 'playing',
    asteroids: [],
    energyOrb: null,
    orbsCollected: 0,
    player: {
        x: 400,
        y: 240,
        velocityX: 0,
        velocityY: 0,
        radius: 16,
    },
})
```

After `game.start()`, verify exactly one intro asteroid and no RNG-driven random asteroid.

Input contract tests:

```ts
game.pressDirection('right', 'keyboard')
game.pressDirection('up', 'touch')
expect(game.pressedDirections).toEqual(new Set(['right', 'up']))
game.releaseDirection('right', 'keyboard')
expect(game.pressedDirections).toEqual(new Set(['up']))
```

Also press the same direction from both sources and prove releasing one source preserves it until the other releases.

- [ ] **2.3 Implement BaseGame shell and held-input ownership**

Class declaration:

```ts
export class AsteroidDriftGame extends BaseGame<
    AsteroidDriftState,
    AsteroidDriftConfig,
    AsteroidDriftStats
> {
    private elapsedSimSeconds = 0
    private asteroidSpawnAccumulator = 0
    private orbSpawnAccumulator = 0
    private entitySequence = 0
    private keyboardHeldDirections = new Set<AsteroidDriftDirection>()
    private touchHeldDirections = new Set<AsteroidDriftDirection>()

    constructor(
        config: AsteroidDriftConfig = createAsteroidDriftConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.ASTEROID_DRIFT, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }
}
```

`createInitialState()` centers the player and mirrors BaseGame state fields exactly.

`onGameStart()` must:

```ts
this.resetRuntimeFields()
this.asteroidSpawnAccumulator = -this.config.openingRandomSpawnGrace
this.state.asteroids.push(
    createIntroAsteroid(this.entityId('asteroid'), this.config)
)
this.emitStateChange()
```

`onGameReset()` and `onGameEnd()` clear held input/private runtime fields. Do not add timers.

- [ ] **2.4 Implement normalized thrust, drag, speed clamp, and wall response TDD-first**

Write tests that compare behavior, not implementation details:

1. holding right for 0.1s yields positive X velocity and X movement;
2. releasing then updating keeps velocity positive but smaller (coasting + drag);
3. up+right velocity magnitude after equal time is approximately the same as right-only, proving diagonal normalization;
4. sustained thrust never exceeds `maxPlayerSpeed`;
5. forcing the ship against the right boundary clamps `x` to `canvasWidth - radius` and zeroes only positive `velocityX`; negative/tangential velocity remains possible.

Implement input axes:

```ts
const directions = this.getActiveDirections()
const rawX = Number(directions.has('right')) - Number(directions.has('left'))
const rawY = Number(directions.has('down')) - Number(directions.has('up'))
const length = Math.hypot(rawX, rawY)
const inputX = length > 0 ? rawX / length : 0
const inputY = length > 0 ? rawY / length : 0
```

Then per substep:

```ts
player.velocityX += inputX * this.config.thrustAcceleration * step
player.velocityY += inputY * this.config.thrustAcceleration * step

const dragFactor = Math.exp(-this.config.dragPerSecond * step)
player.velocityX *= dragFactor
player.velocityY *= dragFactor

const speed = Math.hypot(player.velocityX, player.velocityY)
if (speed > this.config.maxPlayerSpeed) {
    const scale = this.config.maxPlayerSpeed / speed
    player.velocityX *= scale
    player.velocityY *= scale
}

player.x += player.velocityX * step
player.y += player.velocityY * step
```

Apply arena clamps after integration and zero only velocity pointing farther out of the arena.

- [ ] **2.5 Write RED fixed-step and asteroid-spawn model tests**

Tests must pin:

- `update(NaN)`, `update(-1)`, inactive/paused paths do nothing;
- one `update(5)` advances at most 0.1 simulation seconds;
- a fast asteroid that would cross the ship within a single 0.1s outer frame is still detected by `1/120s` substeps;
- initial random spawn debt cannot produce a random asteroid before the opening grace;
- current interval/speed interpolate from initial toward final as private simulation time advances;
- at `maxAsteroids`, calling enough updates to reach a spawn boundary consumes zero RNG and caps debt instead of banking a burst.

Do not expose private clocks solely for tests. Use small test configs (`duration`, intervals, speeds, maxAsteroids) and observable asteroid counts/positions.

- [ ] **2.6 Implement substep loop, collision, spawn accumulators, and score synchronization**

`update()` follows:

```ts
update(deltaTime: number): void {
    if (
        !this.state.isActive ||
        this.state.isPaused ||
        !Number.isFinite(deltaTime) ||
        deltaTime <= 0 ||
        !Number.isFinite(this.config.maxPhysicsStep) ||
        this.config.maxPhysicsStep <= 0
    ) {
        return
    }

    let remaining = Math.min(deltaTime, this.config.maxUpdateDelta)
    while (remaining > 0 && this.state.isActive) {
        const step = Math.min(remaining, this.config.maxPhysicsStep)
        this.stepPhysics(step)
        remaining -= step
    }
    this.syncScore()
    this.emitStateChange()
}
```

`stepPhysics()` preserves the spec ordering exactly. Move/despawn asteroids when their circle is beyond the arena plus configured spawn padding.

Collision:

```ts
if (
    circleOverlap(
        this.state.player,
        this.state.player.radius,
        asteroid,
        asteroid.radius
    )
) {
    this.state.outcome = 'collision'
    this.syncScore()
    this.end().catch((error: unknown) =>
        console.error('AsteroidDrift end failed', error)
    )
    return
}
```

Random asteroid spawning:

```ts
this.asteroidSpawnAccumulator += step
const interval = this.currentAsteroidSpawnInterval()
if (this.state.asteroids.length >= this.config.maxAsteroids) {
    this.asteroidSpawnAccumulator = Math.min(
        this.asteroidSpawnAccumulator,
        interval
    )
} else if (this.asteroidSpawnAccumulator >= interval) {
    this.asteroidSpawnAccumulator -= interval
    this.state.asteroids.push(
        createRandomAsteroid(
            this.entityId('asteroid'),
            this.state.player,
            this.currentProgress(),
            this.config
        )
    )
}
```

At most one random asteroid is created in one substep; do not catch up in a `while` loop.

`syncScore()` computes one target score and sends only positive deltas through `addScore(delta, 'asteroid_drift_progress')`.

- [ ] **2.7 Add orb lifecycle and collision-before-collection tests**

Use short `orbSpawnInterval` and controlled RNG/config to prove:

- only one orb exists;
- successful spawn sets `ageSeconds: 0`;
- no-valid-anchor leaves `energyOrb` null and does not retry within the same cadence;
- an uncollected orb expires at `orbLifetime`;
- circle contact removes orb and increments `orbsCollected` once;
- when an asteroid collision and orb contact occur on the same step, outcome is collision and `orbsCollected` does not increment.

Implement one attempt per orb cadence and reset `orbSpawnAccumulator` after every attempt, including a skipped placement.

- [ ] **2.8 Add timeout/reset/stats/data behavior**

Override timeout:

```ts
protected handleTimeUp(): void {
    this.elapsedSimSeconds = this.config.duration
    this.state.outcome = 'survived'
    this.syncScore()
    super.handleTimeUp()
}
```

`getGameStats()` derives final elapsed time from `getTimerStatus().elapsedTime` and returns the game-specific values.

`getGameData()` returns:

```ts
const data = {
    survivalSeconds: Math.floor(
        this.state.outcome === 'survived'
            ? this.config.duration
            : this.elapsedSimSeconds
    ),
    orbsCollected: this.state.orbsCollected,
    survivedFullRun: this.state.outcome === 'survived',
} satisfies AsteroidDriftGameData
return data
```

Tests must prove timeout yields the full 900 survival points before orb bonuses, collision preserves pre-impact survival/orb score, and reset/start clears outcome/entities/orbs/velocity/held input/private spawn debt.

- [ ] **2.9 Run Task 2 gates and commit**

```bash
bun run test:run -- \
  src/lib/games/asteroid-drift \
  src/lib/games.test.ts
bun run typecheck
```

Expected: PASS.

```bash
git add \
  src/lib/games.ts \
  src/lib/games.test.ts \
  src/lib/games/asteroid-drift
git commit -m "feat(asteroid-drift): add momentum game model"
```

---

## Task 3: Add the two-layer Pixi renderer

**Files**
- Create: `src/lib/games/asteroid-drift/AsteroidDriftRenderer.ts`
- Create: `src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts`

**Interfaces**
- Consumes `AsteroidDriftState` / `AsteroidDriftConfig`.
- Produces `AsteroidDriftRenderer` and `createAsteroidDriftRendererConfig(config)`.
- The renderer has no game-rule mutations and owns no ticker.

- [ ] **3.1 Write RED renderer setup/layer tests**

Follow the existing Pixi mock conventions used by Gravity Flip/Signal Switch. Verify setup produces exactly two Asteroid Drift-owned `PIXI.Graphics` layers added in order:

1. static background;
2. dynamic entities.

Call `render()` twice and assert the static background draw path is not rebuilt on every state change while the dynamic graphic is cleared/redrawn.

- [ ] **3.2 Implement renderer config and setup**

Config factory:

```ts
export function createAsteroidDriftRendererConfig(
    config: AsteroidDriftConfig
): PixiJSRendererConfig {
    return {
        type: 'canvas',
        container: '#asteroid-drift-canvas',
        width: config.canvasWidth,
        height: config.canvasHeight,
        responsive: false,
        backgroundColor: 0x020617,
        antialias: true,
    }
}
```

`setup()` calls `super.setup()`, creates both graphics, adds them to the stage, and draws the background once.

The background uses only authored static geometry: dark board, border, and a small fixed starfield coordinate list local to the renderer. Do not call RNG during rendering.

- [ ] **3.3 Add non-color-only entity geometry tests and implementation**

Tests lock structure, not exact visual polish:

- player draws a triangular hull plus center/engine line; stationary heading is right;
- non-zero velocity rotates heading via `Math.atan2(vy, vx)`;
- each asteroid draws an outer circle plus at least two crater primitives/marks;
- energy orb draws both a ring and diamond/cross geometry;
- thrust cue appears only when ship speed is non-trivial;
- invalid/non-Asteroid state is ignored safely.

Dynamic render clears once then draws state in this order:

1. energy orb;
2. asteroids;
3. player/thrust.

Collision geometry remains model-owned circles; renderer triangle/craters never feed gameplay.

- [ ] **3.4 Implement idempotent renderer cleanup**

Destroy Asteroid Drift graphics and null references, then delegate to the existing renderer destroy/cleanup convention exactly once. Do not manually destroy the Pixi Application twice.

Test cleanup after setup and cleanup after a partial/failed setup path if the current Pixi test harness supports that path.

- [ ] **3.5 Run renderer gates and commit**

```bash
bun run test:run -- \
  src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts \
  src/lib/games/asteroid-drift/AsteroidDriftGame.test.ts
bun run typecheck
```

Expected: PASS.

```bash
git add src/lib/games/asteroid-drift/AsteroidDriftRenderer.ts \
        src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts
git commit -m "feat(asteroid-drift): add Pixi renderer"
```

---

## Task 4: Wire one initializer, native controls, and the playable route

**Files**
- Create: `src/lib/games/asteroid-drift/initFramework.ts`
- Create: `src/lib/games/asteroid-drift/initFramework.test.ts`
- Create: `src/pages/asteroid-drift/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces**
- Produces `AsteroidDriftInitResult` with `game`, `renderer`, `getGame()`, `getState()`, `cleanup()`.
- Exposes `window.asteroidDriftGame = handle` from the page for the existing debug/E2E pattern.
- Native DOM controls call only `pressDirection()` / `releaseDirection()` / BaseGame start/reset; no direct model mutation.

- [ ] **4.1 Write RED page markup/bootstrap contract**

Add the route to the relevant markup fixture and assert these exact IDs exist:

```text
#asteroid-drift-container
#asteroid-drift-canvas
#asteroid-drift-status
#orbs-collected
#ship-speed
#asteroid-drift-dpad
#final-outcome
#final-survival
#final-orbs
```

Assert four native `button[data-direction]` controls with values `up`, `left`, `down`, `right`.

Bootstrap must contain `DOMContentLoaded` and call `initAsteroidDriftGameFramework()` from inside that callback; do not make quote/whitespace-sensitive string assertions.

Run:

```bash
bun run test:run -- src/pages/game-board-markup.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **4.2 Create the Astro GamePage route**

Use:

```astro
<GamePage
  gameId="asteroid-drift"
  title="Asteroid Drift"
  description="Thrust through an asteroid field, collect energy orbs, and survive for 90 seconds."
  icon="☄️"
  initialTime={90}
  showPause={false}
  showEnd={false}
  showReset={true}
  overlayTitle="SHIP LOST"
>
```

Game-board slot contains the Pixi mount and polite live region.

Additional stats contain exactly:

```text
Orbs: #orbs-collected
Speed: #ship-speed px/s
```

Controls contain normal Start/Reset buttons plus one compact cross-shaped D-pad of four existing `Button.astro` components. Use `aria-label="Thrust up"` etc. Keep controls as native Astro DOM; do not put them inside canvas hit-testing.

Game info copy explains momentum, collision, orb bonus, and `10 points / full survival second + 250 / orb` from imported scorer/rule constants rather than a second magic-number source.

Final stats contain outcome, survival seconds, and orbs.

Canvas CSS:

```css
#asteroid-drift-canvas :global(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  touch-action: none;
}
```

- [ ] **4.3 Write RED initializer lifecycle/HUD tests**

Mock renderer initialization like Gravity Flip. Verify:

- missing `#asteroid-drift-container` returns `undefined` through existing error handling;
- one game + one renderer are created;
- initial render/HUD occurs before Start;
- start hides Start and overlay;
- state callback updates orbs, speed, score, and time;
- collision uses `SHIP LOST`, `Collision`, and final stats;
- full timeout uses `DRIFT COMPLETE`, `Survived`, and completion announcement;
- Play Again invokes BaseGame completed-run `start()` behavior and yields a fresh active state;
- Reset returns idle state and visible Start;
- end events forward achievements/challenge notifications through current globals;
- cleanup is idempotent.

- [ ] **4.4 Implement tracked listeners and keyboard mapping**

Use a local `listen()` registry like Gravity Flip. Keyboard map:

```ts
const KEY_TO_DIRECTION: Readonly<Record<string, AsteroidDriftDirection>> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    W: 'up',
    s: 'down',
    S: 'down',
    a: 'left',
    A: 'left',
    d: 'right',
    D: 'right',
}
```

Keydown ignores ctrl/meta/alt, editable targets, and unrelated keys. When active, press the normalized direction and `preventDefault()`.

Keyup always releases mapped keyboard direction even if the run just ended, so no held key survives a collision.

Do not reject `event.repeat`: held-set insertion is idempotent and keyup is still authoritative.

- [ ] **4.5 Add independent pointer-held D-pad behavior**

For each `button[data-direction]`:

- `pointerdown`: prevent default, add active visual class, release implicit pointer capture in try/catch, press touch direction only when game is active;
- `pointerup`, `pointerleave`, `pointercancel`: prevent default, remove active class, release touch direction.

Tests cover:

- touch up+right can be held together;
- keyboard right + touch right survives releasing only one source;
- pointercancel releases a held direction;
- pre-start pointerdown cannot leave latent movement in the model.

Do not add a joystick abstraction or pointermove logic.

- [ ] **4.6 Add exactly one rAF loop and responsive inline canvas override**

After renderer setup:

```ts
const canvas = renderer.getApp()?.canvas ?? null
if (canvas) {
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
}
```

One loop:

```ts
let frameId: number | null = null
let lastFrameTime: number | null = null

const frame = (timestamp: number): void => {
    const deltaSeconds =
        lastFrameTime === null
            ? 0
            : Math.min((timestamp - lastFrameTime) / 1000, 0.1)
    lastFrameTime = timestamp

    const state = game.getState()
    if (state.isActive && !state.isPaused) {
        game.update(deltaSeconds)
    }
    renderer.render(game.getState())
    frameId = requestAnimationFrame(frame)
}
frameId = requestAnimationFrame(frame)
```

Tests prove initializer does not call `setInterval`, does not use a Pixi ticker, schedules one successor per frame, and cancels the outstanding frame exactly once on cleanup.

- [ ] **4.7 Add beforeunload + live region + page debug handle**

Guard beforeunload only when `game.getState().isActive`.

Announcements are bounded to:

- start: `Drift started. Avoid asteroids and collect energy orbs.`;
- orb count increase: `Energy orb collected. N total.`;
- collision: `Collision. Run ended.`;
- timeout: `Drift complete. You survived the full 90 seconds.`.

Do not announce movement, speed, asteroid spawning, or every state change.

Page bootstrap:

```ts
document.addEventListener('DOMContentLoaded', () => {
  initAsteroidDriftGameFramework()
    .then(handle => {
      if (handle) {
        ;(window as Window & { asteroidDriftGame?: typeof handle }).asteroidDriftGame = handle
      }
    })
    .catch(error => {
      console.error('Asteroid Drift failed to initialize', error)
    })
})
```

- [ ] **4.8 Run playable-route gates**

```bash
bun run test:run -- \
  src/lib/games/asteroid-drift \
  src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
```

Expected: PASS.

- [ ] **4.9 Commit playable route**

```bash
git add \
  src/lib/games/asteroid-drift/initFramework.ts \
  src/lib/games/asteroid-drift/initFramework.test.ts \
  src/pages/asteroid-drift/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "feat(asteroid-drift): add playable route and controls"
```

- [ ] **4.10 Mandatory manual-play tuning checkpoint**

Run the dev server and play `/asteroid-drift` on desktop plus a 375×812 viewport. Answer all five frozen questions from the spec:

1. intro asteroid gives roughly three readable seconds and is dodgeable on first attempt;
2. release preserves noticeable momentum without making correction frustrating;
3. orb anchors cause voluntary route risk without appearing on the player/active asteroid;
4. 60–90s traffic is harder but visually readable;
5. D-pad supports comfortable diagonals and clean touch release.

If values need adjustment, change only these game-local tuning fields and their direct tests/spec values:

```text
thrustAcceleration
dragPerSecond
maxPlayerSpeed
asteroidMinRadius / asteroidMaxRadius
asteroidInitialInterval / asteroidFinalInterval
asteroidInitialSpeed / asteroidFinalSpeed
asteroidSpeedJitter
orbSpawnInterval
orbLifetime
orbPlayerMinDistance
orbAsteroidClearance
```

The deterministic intro architecture, finite spawn algorithms, 90-second duration, scorer formula, input/lifecycle contracts, and no-framework boundary are not tuning knobs.

If tuning changes code/docs, commit them on the same PR before Task 5:

```bash
git add src/lib/games/asteroid-drift \
        docs/superpowers/specs/2026-08-24-asteroid-drift-design.md \
        docs/superpowers/plans/2026-08-24-asteroid-drift.md
git commit -m "chore(asteroid-drift): tune gameplay defaults"
```

If no values change, do not create an empty tuning commit.

---

## Task 5: Register catalog/data/achievements and repo metadata

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `src/pages/game-board-markup.test.ts` only if its shared registered-game sweep is separate from the Task 4 route-specific assertions.
- Modify: `CLAUDE.md`

**Interfaces**
- Makes the route discoverable from `GAMES`/homepage/getGameUrl.
- Adds canonical game-data type for achievement checks.
- Adds exactly four achievements using existing achievement machinery.

- [ ] **5.1 Write RED final registration and depth tests**

Expected registry object:

```ts
expect(getGameById(GameID.ASTEROID_DRIFT)).toMatchObject({
    id: GameID.ASTEROID_DRIFT,
    name: 'Asteroid Drift',
    category: 'action',
    estimatedDuration: '1-2 minutes',
    difficulty: 'medium',
    isActive: true,
    organism: { shape: 'spiral', color: 'amber' },
    depth: 'shallow',
})
expect(getGameUrl(GameID.ASTEROID_DRIFT)).toBe('/asteroid-drift')
```

Update only the existing depth-count expectation:

```ts
expect(getGamesByDepth('shallow')).toHaveLength(9)
expect(getGamesByDepth('mid')).toHaveLength(9)
expect(getGamesByDepth('abyssal')).toHaveLength(4)
```

Retain the current organism adjacency invariant; do not add a custom insertion-position test.

Run and expect RED because the active row is not yet present:

```bash
bun run test:run -- src/lib/games.test.ts src/lib/organisms.test.ts
```

- [ ] **5.2 Append the active GAMES row normally**

```ts
{
    id: GameID.ASTEROID_DRIFT,
    name: 'Asteroid Drift',
    description:
        'Thrust through an asteroid field, collect energy orbs, and survive the drift',
    category: 'action',
    maxPlayers: 1,
    estimatedDuration: '1-2 minutes',
    difficulty: 'medium',
    tags: ['asteroid', 'space', 'survival', 'single-player', 'momentum'],
    isActive: true,
    organism: { shape: 'spiral', color: 'amber' },
    depth: 'shallow',
},
```

Do not add a new category/depth registry or alter `getGameUrl()`.

- [ ] **5.3 Add canonical shared game-data alias**

In `src/lib/games/shared/types.ts`:

```ts
export type AsteroidDriftGameData =
    import('../asteroid-drift/types').AsteroidDriftGameData
```

Add it once to `GameData`.

If `src/lib/achievements.ts` maintains a separate `AchievementCheckData` union/import list, add the same canonical alias there rather than redefining the shape.

- [ ] **5.4 Write RED tests for exactly four achievements**

Expected IDs:

```ts
[
    'asteroid_drift_first_charge',
    'asteroid_drift_energy_runner',
    'asteroid_drift_long_haul',
    'asteroid_drift_deep_space_ace',
]
```

Lock these conditions after Task 4 tuning:

- First Charge: `orbsCollected >= 1` — Common;
- Energy Runner: `orbsCollected >= 6` — Rare;
- Long Haul: `survivalSeconds >= 60` — Rare;
- Deep Space Ace: `survivedFullRun && orbsCollected >= 10` — Epic.

Include negative boundary cases `0`, `5`, `59`, and `{ survivedFullRun: false, orbsCollected: 10 }` respectively.

- [ ] **5.5 Add achievements with existing in-game checks only**

Use canonical data:

```ts
const data = gameData as AsteroidDriftGameData
```

Example final condition:

```ts
{
    id: 'asteroid_drift_deep_space_ace',
    name: 'Deep Space Ace',
    description: 'Survive the full drift and collect at least 10 energy orbs.',
    logo: '🌠',
    gameId: GameID.ASTEROID_DRIFT,
    condition: {
        type: 'in_game',
        check: gameData => {
            const data = gameData as AsteroidDriftGameData
            return data.survivedFullRun && data.orbsCollected >= 10
        },
    },
    rarity: AchievementRarity.EPIC,
}
```

Use similarly direct checks for the other three. No achievement-service/schema changes.

- [ ] **5.6 Update shared page sweep and `CLAUDE.md`**

If `game-board-markup.test.ts` has a registered-game route array separate from Task 4's direct Asteroid assertions, include `'asteroid-drift'` now. Do not duplicate the same route in two arrays.

Update `CLAUDE.md` from 21 to 22 implemented games and add Asteroid Drift to the game tree/Pixi notes/debug handle list. Document `window.asteroidDriftGame` using the same style as recent game handles. Do not edit the `AGENTS.md` symlink directly if it exists as the existing repo symlink.

- [ ] **5.7 Run registration gates and commit**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts \
  src/pages/game-board-markup.test.ts \
  src/lib/games/asteroid-drift
bun run typecheck
```

Expected: PASS.

```bash
git add \
  src/lib/games.ts \
  src/lib/games.test.ts \
  src/lib/games/shared/types.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.ts \
  src/lib/achievements.test.ts \
  src/pages/game-board-markup.test.ts \
  CLAUDE.md
git commit -m "feat(asteroid-drift): register game and achievements"
```

---

## Task 6: Add deterministic browser/mobile coverage and run final gates

**Files**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify source-unchanged: `e2e/games/all-games-navigation.spec.ts`

Tuning is complete before this task. Browser coverage freezes lifecycle/reachability rather than rebalancing gameplay.

- [ ] **6.1 Add the deterministic idle-collision → Play Again journey**

Intercept the existing score endpoint the same way as adjacent game journeys so score persistence cannot make the test network-dependent.

Journey:

1. `page.goto('/asteroid-drift')`;
2. assert idle time `90`, orbs `0`, speed `0`, canvas present;
3. click Start;
4. do not send movement input;
5. wait for the deterministic intro asteroid to collide, with a bounded timeout derived from its geometry/speed rather than waiting for the full game duration;
6. assert overlay visible, title `SHIP LOST`, outcome `Collision`, final orbs `0`, and game handle state inactive/game-over;
7. click Play Again;
8. assert overlay hidden, active fresh state, score `0`, orbs `0`, centered player/zero starting velocity before input, and exactly the fresh intro asteroid path.

Do not add a test-only production collision API or random-seed query parameter. The deterministic intro contract is the test seam.

- [ ] **6.2 Derive an upper bound for the idle-collision wait**

Import the rule constants in the E2E spec:

```ts
import { ASTEROID_DRIFT_RULES } from '../../src/lib/games/asteroid-drift/types'
```

Compute:

```ts
const introStartX =
    ASTEROID_DRIFT_RULES.canvasWidth +
    ASTEROID_DRIFT_RULES.asteroidSpawnPadding +
    ASTEROID_DRIFT_RULES.introAsteroidRadius
const playerX = ASTEROID_DRIFT_RULES.canvasWidth / 2
const contactDistance =
    ASTEROID_DRIFT_RULES.playerRadius +
    ASTEROID_DRIFT_RULES.introAsteroidRadius
const introCollisionSeconds =
    (introStartX - playerX - contactDistance) /
    ASTEROID_DRIFT_RULES.asteroidInitialSpeed
```

Use a modest browser margin (for example `Math.ceil((introCollisionSeconds + 2) * 1000)`) instead of a magic ten/sixty-second sleep.

- [ ] **6.3 Add 375×812 D-pad and no-horizontal-overflow proof**

Set viewport to 375×812 before navigation. Assert:

- document scroll width ≤375;
- canvas bounding width ≤375 and height >0;
- all four `[data-direction]` buttons are visible and their boxes stay within viewport width;
- Start, then `pointerdown` on right button; use the debug handle to observe positive X velocity after several real rAF frames;
- `pointerup` right; verify speed remains positive briefly (momentum) but no latent `right` direction remains;
- hold up and right via real pointer events and verify both active directions, then release both cleanly.

Do not freeze pixel-perfect button positions or device-pixel-ratio-dependent canvas backing dimensions.

- [ ] **6.4 Run targeted gates**

```bash
bun run test:run -- \
  src/lib/games/asteroid-drift \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: PASS.

- [ ] **6.5 Run full repository gates**

```bash
bun run test:run
bun run test:coverage
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- \
  e2e/games/play-coverage.spec.ts \
  e2e/games/all-games-navigation.spec.ts
```

Expected: PASS. `all-games-navigation.spec.ts` should discover `/asteroid-drift` from the active catalog row without source edits.

- [ ] **6.6 Verify scope boundaries from merge-base**

```bash
git diff --exit-code main...HEAD -- \
  src/lib/games/core/BaseGame.ts \
  src/lib/games/core/GameTimer.ts \
  src/lib/games/core/ScoreManager.ts \
  src/lib/games/core/GameInitializer.ts \
  src/lib/games/renderers/PixiJSRenderer.ts \
  src/lib/games/evader \
  src/lib/games/gravity-flip \
  src/lib/services/scoreService.ts \
  src/lib/server/db \
  src/pages/api \
  e2e/games/all-games-navigation.spec.ts
```

Also verify package/schema/auth surfaces are absent from the changed-file list:

```bash
git diff --name-only main...HEAD
```

Expected production scope is the Asteroid Drift module/page plus `games.ts`, shared game-data alias, achievements, catalog/docs, and the planned shared tests only.

- [ ] **6.7 Commit browser coverage**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(asteroid-drift): cover browser lifecycle and mobile controls"
```

---

## Final Implementation PR Checklist

- [ ] HPA-68 remains one PR from planning through implementation.
- [ ] Game uses `BaseGame + PixiJSRenderer + one initializer-owned rAF`; no second ticker/timer loop exists.
- [ ] Movement is thrust + exponential drag + speed clamp; diagonal thrust is normalized.
- [ ] Outer 0.1s clamp and `1/120s` fixed substeps are covered by non-vacuous tests.
- [ ] Intro asteroid is deterministic/RNG-free and still provides the browser idle-loss path after tuning.
- [ ] Random asteroid edge eligibility prevents immediate player-adjacent edge spawns without retries.
- [ ] Asteroid capacity path consumes zero RNG and cannot bank burst debt.
- [ ] Orb placement consumes one RNG start-index sample and scans the eight anchors at most once per attempt.
- [ ] Collision is evaluated before orb collection within each substep.
- [ ] One pure score authority owns survival/orb arithmetic; BaseGame time bonus remains off.
- [ ] No health, shield, boost, weapons, near-miss, combo, difficulty, audio, texture, or seeded-run system was pulled in.
- [ ] Keyboard/touch held sets are independent; mobile pointerup/leave/cancel all release correctly.
- [ ] GamePage has no Pause or manual End; Reset and Play Again both yield fresh state.
- [ ] Catalog is action/medium/1–2 minutes/shallow spiral-amber; depth test is 9/9/4.
- [ ] Exactly four achievements derive from `survivalSeconds`, `orbsCollected`, `survivedFullRun`.
- [ ] `BaseGame`, timer/score/initializer/Pixi core, Evader, Gravity Flip, score service, DB/API/auth, packages, and all-games-navigation remain source-unchanged.
- [ ] Targeted tests, full unit/coverage, typecheck, lint, format, build, play coverage, and catalog navigation all pass.
