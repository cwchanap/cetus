# Asteroid Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-68 as a 90-second momentum-driven asteroid-dodging minigame with keyboard/touch controls, fair increasing traffic, energy-orb risk/reward, Pixi rendering, achievements, and the existing Cetus score/progress flow.

**Architecture:** `AsteroidDriftGame` extends `BaseGame` and owns game-local fixed-step thrust physics, simulation-time difficulty/spawn accumulators, collision, and orb lifecycle. BaseGame/GameTimer remain the only wall-clock survival-time authority. `spawning.ts` owns pure finite asteroid/orb placement; `scoring.ts` owns arithmetic; `AsteroidDriftRenderer` extends `PixiJSRenderer`; one custom initializer owns held input, one game rAF loop, HUD/overlay integration, and cleanup. Reuse existing geometry/input helpers only; do not extract an Evader/Gravity Flip/general arcade framework.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, PixiJS 8, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-24-asteroid-drift-design.md`

## Global Constraints

- One HPA-68 implementation PR. Continue implementation on this planning branch/PR; do not split the ticket into follow-up implementation PRs.
- Fixed 90-second run; asteroid collision or BaseGame timeout are the only normal end paths.
- **Clock ownership:** `BaseGame/GameTimer` owns displayed/submitted survival seconds and timeout; private `elapsedSimSeconds` owns only clamped physics difficulty/spawn progression.
- Momentum is normalized thrust + exponential drag + max-speed clamp. No instant grid/direct-position movement.
- Model input is four held directions with independent keyboard/touch source sets.
- `update()` clamps one incoming frame to `0.1s` and substeps by at most `1/120s`.
- Per-substep ordering is simulation time → player → asteroid movement → orb aging → collision → orb collection → spawning.
- Collision beats orb collection if both happen in one substep.
- First asteroid is deterministic, RNG-free, enters from the right at center Y, and provides the browser-test idle-loss path.
- Random asteroid interval ramps `1.35s → 0.45s`; base speed `140 → 240px/s`; radius `18..36`; jitter ±15%; random traffic begins only after the opening grace.
- A random spawn edge is eligible only when player center is at least `190px` from that edge. No random rejection loop.
- At 24 active asteroids, consume zero RNG and cap accumulated spawn debt at one current interval.
- At most one orb exists. Orb placement scans eight authored anchors once from one RNG-selected starting index and skips the attempt if none is safe.
- Orb defaults: 4-second attempt cadence, 7-second active-simulation lifetime, 12px radius, ≥150px from player, and ≥`70 + asteroid.radius + orbRadius` from every asteroid.
- Scoring is `floor(clamp(survivalSeconds, 0, 90)) * 10 + floor(max(orbsCollected, 0)) * 250`; game passes config score values to the pure scorer; BaseGame time bonus is disabled.
- `GamePage`: `initialTime={90}`, `showPause={false}`, `showEnd={false}`, `showReset={true}`.
- Catalog identity: action / medium / `1-2 minutes` / shallow / `{ shape: 'spiral', color: 'amber' }`; depth fixture becomes `9 / 9 / 4`.
- No shared movement/physics/spawn/survival framework, ECS, physics dependency, textures/audio, seeded run system, health/shields/boost/weapons, near-miss/combo/distance score, difficulty selector, pause/manual End, joystick/canvas hit-testing, backend/API/DB/schema/auth work, package additions, or changes to Evader/Gravity Flip.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `GameInitializer.ts`, `PixiJSRenderer.ts`, score service, API/DB/auth, and `e2e/games/all-games-navigation.spec.ts` remain source-unchanged.
- Reuse `circleOverlap`/`distance` from `shared/geometry.ts`, and `clamp`/`lerp`/`isEditableTarget` from current shared helpers.
- Run mandatory manual-play tuning after Task 4 and before Task 5 freezes registration/achievement thresholds.

---

## File Map

### New production

- `src/lib/games/asteroid-drift/types.ts` — constants, config/entities/state/stats/data, config factory.
- `src/lib/games/asteroid-drift/spawning.ts` — pure eligible-edge asteroid creation + finite orb-anchor scan.
- `src/lib/games/asteroid-drift/scoring.ts` — single score arithmetic authority.
- `src/lib/games/asteroid-drift/AsteroidDriftGame.ts` — BaseGame lifecycle, held input, fixed-step motion, spawn accumulators, collision/orbs.
- `src/lib/games/asteroid-drift/AsteroidDriftRenderer.ts` — two-layer Pixi primitive renderer.
- `src/lib/games/asteroid-drift/initFramework.ts` — callbacks, D-pad/keyboard, one game rAF, cleanup/debug handle.
- `src/pages/asteroid-drift/index.astro` — playable route.

### New tests

- `src/lib/games/asteroid-drift/spawning.test.ts`
- `src/lib/games/asteroid-drift/scoring.test.ts`
- `src/lib/games/asteroid-drift/AsteroidDriftGame.test.ts`
- `src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts`
- `src/lib/games/asteroid-drift/initFramework.test.ts`

### Existing files changed only when contract becomes live

- `src/lib/games.ts` — Task 2 stable GameID/icon; Task 5 active catalog row.
- `src/lib/games.test.ts` — ID/icon then final registration.
- `src/lib/games/shared/types.ts` — Task 5 canonical game-data alias + union.
- `src/lib/organisms.test.ts` — Task 5 `9 / 9 / 4`.
- `src/lib/achievements.ts`, `src/lib/achievements.test.ts` — Task 5 four achievements.
- `src/pages/game-board-markup.test.ts` — Task 4 route markup/bootstrap and any registration-scoped sweep.
- `e2e/games/play-coverage.spec.ts` — Task 6 deterministic loss/replay/mobile controls.
- `CLAUDE.md` — Task 5 22-game/project tree/debug handle docs.

### Required source-unchanged surfaces

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
- auth/package/schema surfaces
- `e2e/games/all-games-navigation.spec.ts`

---

## Task 1: Rules, finite spawn policy, and pure score

**Files**
- Create: `src/lib/games/asteroid-drift/types.ts`
- Create: `src/lib/games/asteroid-drift/spawning.ts`
- Create: `src/lib/games/asteroid-drift/spawning.test.ts`
- Create: `src/lib/games/asteroid-drift/scoring.ts`
- Create: `src/lib/games/asteroid-drift/scoring.test.ts`

- [ ] **1.1 Write RED rule and score tests**

`scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createAsteroidDriftConfig } from './types'
import { calculateAsteroidDriftScore } from './scoring'

const config = createAsteroidDriftConfig()

it('scores completed survival seconds plus orb bonuses', () => {
    expect(calculateAsteroidDriftScore({ survivalSeconds: 0, orbsCollected: 0 }, config)).toBe(0)
    expect(calculateAsteroidDriftScore({ survivalSeconds: 12.99, orbsCollected: 2 }, config)).toBe(620)
    expect(calculateAsteroidDriftScore({ survivalSeconds: 90, orbsCollected: 10 }, config)).toBe(3400)
})

it('clamps survival and normalizes orb count', () => {
    expect(calculateAsteroidDriftScore({ survivalSeconds: -5, orbsCollected: -2 }, config)).toBe(0)
    expect(calculateAsteroidDriftScore({ survivalSeconds: 999, orbsCollected: 1.9 }, config)).toBe(1150)
})

it('uses supplied config point values', () => {
    const tuned = createAsteroidDriftConfig({
        duration: 10,
        survivalPointsPerSecond: 2,
        orbPoints: 7,
    })
    expect(calculateAsteroidDriftScore({ survivalSeconds: 10, orbsCollected: 3 }, tuned)).toBe(41)
})
```

`spawning.test.ts` also pins structural rules:

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

Expected RED: modules do not exist.

- [ ] **1.2 Implement canonical types/rules/config factory**

Use BaseGame contracts and define:

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

`AsteroidDriftConfig extends BaseGameConfig` and contains every `ASTEROID_DRIFT_RULES` field plus `rng: () => number`.

Factory:

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

No second rules object, entity classes, or registry.

- [ ] **1.3 Write RED deterministic intro and eligible-edge tests**

```ts
const config = createAsteroidDriftConfig({ rng: () => 0 })
const player = {
    x: config.canvasWidth / 2,
    y: config.canvasHeight / 2,
    velocityX: 0,
    velocityY: 0,
    radius: config.playerRadius,
}

expect(createIntroAsteroid('asteroid-0', config)).toEqual({
    id: 'asteroid-0',
    x: config.canvasWidth + config.asteroidSpawnPadding + config.introAsteroidRadius,
    y: config.canvasHeight / 2,
    velocityX: -config.asteroidInitialSpeed,
    velocityY: 0,
    radius: config.introAsteroidRadius,
})

const nearLeft = eligibleAsteroidSpawnEdges({ ...player, x: 20 }, config)
expect(nearLeft).not.toContain('left')
expect(nearLeft.length).toBeGreaterThan(0)
```

Sweep default center/four near-corner player positions and assert at least one eligible edge. Add one invalid test config with `asteroidSafeEdgeDistance` larger than both dimensions and assert random materialization throws instead of silently using an unsafe edge.

- [ ] **1.4 Implement finite asteroid creation**

`spawning.ts` exports:

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

Eligible edges use player distance to each boundary and `asteroidSafeEdgeDistance` exactly.

Clamp RNG samples through one helper to `[0, 1)`:

```ts
function unitSample(rng: () => number): number {
    const value = rng()
    if (!Number.isFinite(value)) return 0
    return Math.min(1 - Number.EPSILON, Math.max(0, value))
}
```

`createRandomAsteroid()` performs one finite materialization:

1. clamp progress 0..1;
2. resolve eligible edges, throw if empty;
3. choose one eligible edge;
4. choose radius in min..max;
5. choose along-edge coordinate inside radius-safe bounds;
6. place center fully outside by `spawnPadding + radius`;
7. choose an interior target inside the target inset rectangle;
8. normalize spawn→target;
9. derive base speed by `lerp(initial, final, progress)` plus bounded ±jitter;
10. return straight-line velocity.

No RNG retry loop.

- [ ] **1.5 Add structural random-spawn tests**

Using deterministic sample streams, assert:

- near-left player never gets left edge;
- center is fully outside chosen edge;
- velocity points inward;
- radius remains `18..36`;
- speed magnitude stays in ramped `0.85..1.15` bound at progress 0 and 1;
- injected `NaN`, negative, and `1` samples remain finite/in-range.

Prefer geometry outcomes over exact incidental RNG call counts.

- [ ] **1.6 Add finite authored-anchor orb placement**

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

Consume one RNG sample for `startIndex`, scan exactly eight positions cyclically, and accept the first candidate satisfying:

```ts
distance(candidate, player) >= config.orbPlayerMinDistance
```

and for every asteroid:

```ts
distance(candidate, asteroid) >=
    config.orbAsteroidClearance + asteroid.radius + config.orbRadius
```

Tests: player-near skips; asteroid-near skips; all blocked returns null; no random retry.

- [ ] **1.7 Implement pure scorer**

```ts
export function calculateAsteroidDriftScore(
    input: { survivalSeconds: number; orbsCollected: number },
    config: Pick<
        AsteroidDriftConfig,
        'duration' | 'survivalPointsPerSecond' | 'orbPoints'
    >
): number {
    const survivalSeconds = Math.floor(
        clamp(
            Number.isFinite(input.survivalSeconds) ? input.survivalSeconds : 0,
            0,
            config.duration
        )
    )
    const orbsCollected = Math.max(
        0,
        Math.floor(Number.isFinite(input.orbsCollected) ? input.orbsCollected : 0)
    )
    return (
        survivalSeconds * config.survivalPointsPerSecond +
        orbsCollected * config.orbPoints
    )
}
```

- [ ] **1.8 Run Task 1 gates and commit**

```bash
bun run test:run -- src/lib/games/asteroid-drift
bun run typecheck
```

Expected PASS.

```bash
git add src/lib/games/asteroid-drift
git commit -m "feat(asteroid-drift): add rules spawning and scoring"
```

---

## Task 2: Stable identity + momentum BaseGame model

**Files**
- Create: `src/lib/games/asteroid-drift/AsteroidDriftGame.ts`
- Create: `src/lib/games/asteroid-drift/AsteroidDriftGame.test.ts`
- Modify: `src/lib/games.ts` — stable GameID/icon only in this task.
- Modify: `src/lib/games.test.ts` — stable ID/icon lock only; active row waits for Task 5.

- [ ] **2.1 Add stable ID/icon without active catalog row**

```ts
ASTEROID_DRIFT = 'asteroid_drift',
```

and:

```ts
[GameID.ASTEROID_DRIFT]: '☄️',
```

Test only:

```ts
expect(GameID.ASTEROID_DRIFT).toBe('asteroid_drift')
expect(getGameIcon(GameID.ASTEROID_DRIFT)).toBe('☄️')
```

Do not add a temporary `getGameById(...) === undefined` test.

- [ ] **2.2 Write RED initial-state and independent-input tests**

Create a helper with deterministic RNG. Idle state must include center `(400, 240)`, zero velocity/score/orbs/entities, time 90, outcome `playing`.

After `start()`, exactly one intro asteroid exists.

Public API:

```ts
pressDirection(
    direction: AsteroidDriftDirection,
    source: AsteroidDriftInputSource = 'keyboard'
): void

releaseDirection(
    direction: AsteroidDriftDirection,
    source: AsteroidDriftInputSource = 'keyboard'
): void

get pressedDirections(): Set<AsteroidDriftDirection>
```

Prove keyboard-right + touch-up union, and same-direction held by both sources remains active until both release.

- [ ] **2.3 Implement BaseGame shell/private runtime state**

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

`onGameStart()` resets private runtime, sets asteroid accumulator to `-openingRandomSpawnGrace`, pushes deterministic intro, emits state. `onGameReset()`/`onGameEnd()` clear held sets/private accumulators. No timer is created.

- [ ] **2.4 TDD movement behavior**

Tests:

1. right held for 0.1s produces positive X velocity/movement;
2. release then update preserves positive but reduced velocity;
3. up+right final speed approximately equals right-only for equal duration (diagonal normalization);
4. sustained thrust never exceeds `maxPlayerSpeed`;
5. boundary clamp keeps center inside radius bounds and zeroes only outward component.

Implement axes:

```ts
const directions = this.getActiveDirections()
const rawX = Number(directions.has('right')) - Number(directions.has('left'))
const rawY = Number(directions.has('down')) - Number(directions.has('up'))
const inputLength = Math.hypot(rawX, rawY)
const inputX = inputLength > 0 ? rawX / inputLength : 0
const inputY = inputLength > 0 ? rawY / inputLength : 0
```

Then thrust, exponential drag, magnitude clamp, integration, and wall response exactly as spec.

- [ ] **2.5 Write RED fixed-step/collision/difficulty-spawn tests**

Pin:

- inactive/paused/non-finite/non-positive update does nothing;
- `update(5)` advances at most 0.1 sim seconds worth of motion/difficulty;
- a fast asteroid crossing the player's circle during one 0.1s outer frame is caught by `1/120s` substeps;
- no random asteroid appears before opening grace;
- observable spawned asteroid speed/cadence move from initial toward final as clamped sim time progresses;
- capacity path consumes zero RNG and cannot accumulate multi-spawn burst debt.

Do not expose private clocks just for tests; use small config overrides and observable state/RNG spies.

- [ ] **2.6 Implement update/substep/collision/spawn**

`update()`:

```ts
update(deltaTime: number): void {
    if (
        !this.state.isActive ||
        this.state.isPaused ||
        !Number.isFinite(deltaTime) ||
        deltaTime <= 0 ||
        !Number.isFinite(this.config.maxPhysicsStep) ||
        this.config.maxPhysicsStep <= 0
    ) return

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

`stepPhysics()` preserves spec ordering. Collision uses shared `circleOverlap`; on hit set outcome `collision`, sync score, call `end()` once, return before orb/spawn work.

Random spawn:

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

No catch-up `while` loop.

- [ ] **2.7 Add orb lifecycle TDD**

With short test cadence, prove:

- at most one orb;
- valid attempt creates age 0 orb;
- invalid finite-anchor attempt remains null and resets cadence;
- lifetime expiration removes orb;
- circle contact removes/increments exactly once;
- same-step asteroid+orb contact yields collision and no orb award.

Orb age/spawn cadence use active simulation steps; submitted survival score does not.

- [ ] **2.8 Freeze wall-clock survival scoring vs simulation difficulty**

Add private helper:

```ts
private survivalSeconds(): number {
    if (this.state.outcome === 'survived') {
        return this.config.duration
    }
    return clamp(this.getTimerStatus().elapsedTime, 0, this.config.duration)
}
```

This uses BaseGame's live/final timer snapshot while active/collision; the survived special case handles GameTimer's already-stopped completion callback before BaseGame final snapshot exists.

`syncScore()`:

```ts
const target = calculateAsteroidDriftScore(
    {
        survivalSeconds: this.survivalSeconds(),
        orbsCollected: this.state.orbsCollected,
    },
    this.config
)
const delta = target - this.state.score
if (delta > 0) {
    this.addScore(delta, 'asteroid_drift_progress')
}
```

Use Vitest fake timers to prove:

1. advancing only `game.update()` without wall time can increase difficulty/motion but **not survival score**;
2. advancing fake wall time by 3 seconds + timer ticks yields 30 survival points even if physics was advanced in smaller/clamped slices;
3. collision at that point preserves 3-second score;
4. timeout scores exactly duration × survival points.

This is the regression protecting single timer ownership.

- [ ] **2.9 Implement timeout/stats/data/reset**

```ts
protected handleTimeUp(): void {
    this.state.outcome = 'survived'
    this.syncScore()
    super.handleTimeUp()
}
```

`getGameStats()` uses `getTimerStatus().elapsedTime` after BaseGame final snapshot, except survived returns duration if needed; `getGameData()` returns canonical wall-clock survival, orbs, and `survivedFullRun`.

Reset/start clears outcome/entities/orb/velocity/input/private simulation/spawn state.

- [ ] **2.10 Run Task 2 gates + commit**

```bash
bun run test:run -- \
  src/lib/games/asteroid-drift \
  src/lib/games.test.ts
bun run typecheck
```

```bash
git add \
  src/lib/games.ts \
  src/lib/games.test.ts \
  src/lib/games/asteroid-drift
git commit -m "feat(asteroid-drift): add momentum game model"
```

---

## Task 3: Two-layer Pixi renderer

**Files**
- Create: `src/lib/games/asteroid-drift/AsteroidDriftRenderer.ts`
- Create: `src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts`

- [ ] **3.1 Write RED renderer-layer tests**

Follow current Pixi mocks. Setup must create two Asteroid Drift-owned `PIXI.Graphics` layers in order: static background, dynamic entities. Rendering twice must not rebuild static background every frame; dynamic layer clears/redraws.

- [ ] **3.2 Implement renderer config/setup**

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

Background draws dark board/border plus a short fixed authored star-dot list once. Renderer never calls RNG and owns no ticker.

- [ ] **3.3 Add non-color-only entity geometry**

Tests/implementation lock structure rather than visual pixel values:

- triangular ship hull + center/engine line; heading from `atan2(vy, vx)`, right when near-stationary;
- asteroid outer circle + at least two crater marks;
- energy orb ring + diamond/cross geometry;
- invalid/non-Asteroid state is ignored safely.

Dynamic order: orb → asteroids → ship. Collision remains model circle geometry, not rendered triangle/craters.

- [ ] **3.4 Cleanup and gates**

Destroy local graphics/null refs and follow current Pixi renderer cleanup convention exactly once.

```bash
bun run test:run -- \
  src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts \
  src/lib/games/asteroid-drift/AsteroidDriftGame.test.ts
bun run typecheck
```

```bash
git add src/lib/games/asteroid-drift/AsteroidDriftRenderer.ts \
        src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts
git commit -m "feat(asteroid-drift): add Pixi renderer"
```

---

## Task 4: One initializer + native controls + playable route

**Files**
- Create: `src/lib/games/asteroid-drift/initFramework.ts`
- Create: `src/lib/games/asteroid-drift/initFramework.test.ts`
- Create: `src/pages/asteroid-drift/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

- [ ] **4.1 Write RED route markup/bootstrap tests**

Exact IDs:

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

Assert four native `button[data-direction]` values `up`, `left`, `down`, `right`.

Bootstrap must contain `DOMContentLoaded` and call `initAsteroidDriftGameFramework()` from inside it; avoid quote/whitespace-sensitive source assertions.

- [ ] **4.2 Create Astro route**

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

Game board: Pixi mount + polite live region. Additional badges: Orbs and rounded Speed only. Controls: Start/Reset + cross-shaped four-button D-pad using existing `Button.astro` and `aria-label="Thrust …"`. Final stats: outcome/survival/orbs.

Scoring copy derives displayed point values from imported `ASTEROID_DRIFT_RULES` rather than repeating literals.

Canvas CSS:

```css
#asteroid-drift-canvas :global(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  touch-action: manipulation;
}
```

D-pad buttons may use `touch-action: none` locally; canvas has no gameplay pointer handler.

- [ ] **4.3 Write RED initializer lifecycle/HUD tests**

Verify:

- missing container returns `undefined` through current error helper;
- one game/renderer, initial idle render/HUD;
- start hides Start/overlay;
- state callback syncs orbs/speed/score/time;
- collision overlay title `SHIP LOST`, outcome `Collision`, final stats;
- timeout title `DRIFT COMPLETE`, outcome `Survived`;
- Play Again starts fresh active run;
- Reset returns idle + visible Start;
- achievement/challenge globals receive end event results;
- cleanup is idempotent.

- [ ] **4.4 Implement tracked listeners + keyboard mapping**

```ts
const KEY_TO_DIRECTION: Readonly<Record<string, AsteroidDriftDirection>> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up', W: 'up',
    s: 'down', S: 'down',
    a: 'left', A: 'left',
    d: 'right', D: 'right',
}
```

Keydown ignores ctrl/meta/alt, editable targets, unrelated keys; when active, presses normalized direction + prevents default. Repeated keydown is harmless set insertion; no special repeat branch needed. Keyup releases any mapped keyboard direction even just after a collision so held input cannot leak.

- [ ] **4.5 Implement independent pointer-held D-pad**

Each `button[data-direction]`:

- pointerdown: prevent default, active class, defensively release implicit pointer capture, press touch direction only when active;
- pointerup/leave/cancel: prevent default, clear class, release touch direction.

Tests: touch diagonal; keyboard+touch same direction survives one-source release; pointercancel releases; pre-start press leaves no latent movement.

No pointermove/joystick abstraction.

- [ ] **4.6 Add exactly one game rAF + responsive inline canvas override**

After renderer init:

```ts
const canvas = renderer.getApp()?.canvas ?? null
if (canvas) {
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
}
```

One loop driven by monotonic rAF timestamp, first frame delta 0, next deltas capped 0.1, calls `game.update()` only while active/unpaused, then renderer render, then schedules exactly one successor.

Asteroid Drift initializer must not call `setInterval` or register a Pixi ticker. BaseGame/GameTimer's existing timer interval is not replaced.

- [ ] **4.7 Add bounded accessibility/beforeunload/debug integration**

Live announcements only:

- start: `Drift started. Avoid asteroids and collect energy orbs.`
- orb count increase: `Energy orb collected. N total.`
- collision: `Collision. Run ended.`
- completion: `Drift complete. You survived the full 90 seconds.`

Beforeunload only while active.

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

- [ ] **4.8 Run playable gates + commit**

```bash
bun run test:run -- \
  src/lib/games/asteroid-drift \
  src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
```

```bash
git add \
  src/lib/games/asteroid-drift/initFramework.ts \
  src/lib/games/asteroid-drift/initFramework.test.ts \
  src/pages/asteroid-drift/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "feat(asteroid-drift): add playable route and controls"
```

- [ ] **4.9 Mandatory manual-play tuning checkpoint**

Play desktop + 375×812 and answer:

1. ~3-second idle intro collision readable/dodgeable?
2. momentum noticeable but correction comfortable?
3. edge-biased orbs voluntary risk without unsafe spawn?
4. 60–90s traffic hard but readable?
5. D-pad diagonals/release comfortable on touch?

Only these feel values may change: acceleration/drag/max speed; asteroid radius/interval/speed/jitter; orb cadence/lifetime/player distance/asteroid clearance. Do not change duration, score formula, deterministic intro structure, finite spawn algorithm, lifecycle/clock ownership, or architecture.

If tuned, update direct tests + spec/plan values and commit on same PR:

```bash
git add src/lib/games/asteroid-drift \
        docs/superpowers/specs/2026-08-24-asteroid-drift-design.md \
        docs/superpowers/plans/2026-08-24-asteroid-drift.md
git commit -m "chore(asteroid-drift): tune gameplay defaults"
```

No empty tuning commit.

---

## Task 5: Catalog, shared data, achievements, repo metadata

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `src/pages/game-board-markup.test.ts` only if its registered-game sweep is separate from Task 4 direct assertions.
- Modify: `CLAUDE.md`

- [ ] **5.1 Write RED final registration/depth tests**

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

Depth becomes exactly 9/9/4. Keep current generic adjacency invariant; no insertion-position test.

- [ ] **5.2 Append active catalog row**

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

Do not alter `getGameUrl()` or add registry machinery.

- [ ] **5.3 Add canonical shared data alias**

```ts
export type AsteroidDriftGameData =
    import('../asteroid-drift/types').AsteroidDriftGameData
```

Add once to `GameData`. If achievements keeps its own imported/check union, reference this canonical type rather than redefining shape.

- [ ] **5.4 Write RED tests for exactly four achievements**

IDs:

```ts
[
    'asteroid_drift_first_charge',
    'asteroid_drift_energy_runner',
    'asteroid_drift_long_haul',
    'asteroid_drift_deep_space_ace',
]
```

Conditions after tuning:

- First Charge: `orbsCollected >= 1` — Common;
- Energy Runner: `orbsCollected >= 6` — Rare;
- Long Haul: `survivalSeconds >= 60` — Rare;
- Deep Space Ace: `survivedFullRun && orbsCollected >= 10` — Epic.

Negative boundaries: 0, 5, 59, and `{ survivedFullRun: false, orbsCollected: 10 }`.

- [ ] **5.5 Add achievements using current in-game machinery**

Cast/use canonical `AsteroidDriftGameData`; no achievement service/schema changes.

Example:

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

- [ ] **5.6 Finish page sweep + `CLAUDE.md`**

If markup tests have one registration-scoped route array, include `asteroid-drift` once. Update `CLAUDE.md` 21→22 implemented games, game tree/Pixi notes, and `window.asteroidDriftGame`. Preserve existing `AGENTS.md` symlink; do not replace it.

- [ ] **5.7 Run registration gates + commit**

```bash
bun run test:run -- \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts \
  src/pages/game-board-markup.test.ts \
  src/lib/games/asteroid-drift
bun run typecheck
```

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

## Task 6: Deterministic browser/mobile coverage + final gates

**Files**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify source-unchanged: `e2e/games/all-games-navigation.spec.ts`

- [ ] **6.1 Add deterministic idle-collision → Play Again journey**

Intercept existing score endpoint like adjacent game journeys. Steps:

1. open `/asteroid-drift`;
2. assert idle time 90/orbs 0/speed 0/canvas;
3. Start;
4. send no movement;
5. wait for deterministic intro collision using a geometry-derived upper bound;
6. assert overlay `SHIP LOST`, outcome `Collision`, final orbs 0, handle inactive/game-over;
7. Play Again;
8. assert overlay hidden, fresh active state, score/orbs 0, centered zero-velocity player, fresh intro path.

No test-only collision API/seed query.

- [ ] **6.2 Derive browser wait from intro contract**

```ts
import { ASTEROID_DRIFT_RULES } from '../../src/lib/games/asteroid-drift/types'

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

Use a modest margin such as `Math.ceil((introCollisionSeconds + 2) * 1000)`, not a long fixed sleep.

- [ ] **6.3 Add 375×812 reachability/D-pad proof**

Before navigation set 375×812. Assert document scroll width ≤375; canvas width ≤375 and positive height; four D-pad buttons visible/inside viewport.

Start then use actual pointer events on right button, observe positive X velocity/position after real rAF frames via debug handle; pointerup and verify no held-right direction while velocity remains briefly positive (momentum). Hold up+right via pointer events, verify both directions, release cleanly.

Do not freeze pixel-perfect positions or intrinsic device-pixel canvas size.

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

`all-games-navigation.spec.ts` should discover the active catalog route without source edits.

- [ ] **6.6 Verify no prohibited scope drift**

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

git diff --name-only main...HEAD
```

Changed production scope should be Asteroid Drift local files/page + `games.ts` + shared game-data alias + achievements + catalog/docs only; no package/schema/auth additions.

- [ ] **6.7 Commit browser coverage**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(asteroid-drift): cover browser lifecycle and mobile controls"
```

---

## Final Implementation PR Checklist

- [ ] HPA-68 stays one PR from planning through implementation.
- [ ] `BaseGame/GameTimer` is the only wall-clock survival-time authority; `elapsedSimSeconds` drives only clamped physics difficulty/spawns.
- [ ] Game uses `BaseGame + PixiJSRenderer + one initializer-owned game rAF`; no second game ticker/timer exists.
- [ ] Movement is normalized thrust + exponential drag + speed clamp.
- [ ] Outer 0.1s clamp and `1/120s` substeps have non-vacuous tests.
- [ ] Intro asteroid remains deterministic/RNG-free and browser idle-loss remains valid after tuning.
- [ ] Random edge fairness prevents player-adjacent edge materialization without retries.
- [ ] Capacity path consumes zero RNG and cannot bank burst debt.
- [ ] Orb placement uses one RNG start sample + one finite eight-anchor scan per attempt.
- [ ] Collision is checked before orb collection.
- [ ] One pure score function owns wall-clock survival/orb arithmetic; BaseGame time bonus stays off.
- [ ] No health/shield/boost/weapons/near-miss/combo/difficulty/audio/textures/seeded-run system.
- [ ] Keyboard/touch held sets are independent; pointerup/leave/cancel release correctly.
- [ ] GamePage has no Pause/manual End; Reset/Play Again produce fresh state.
- [ ] Catalog is action/medium/1–2 minutes/shallow spiral-amber; depth fixture 9/9/4.
- [ ] Exactly four achievements derive only from canonical game data.
- [ ] BaseGame/timer/score/initializer/Pixi core, Evader, Gravity Flip, score service, DB/API/auth/packages, all-games-navigation source remain unchanged.
- [ ] Targeted/full unit, coverage, typecheck, lint, format, build, play coverage, and catalog navigation all pass.
