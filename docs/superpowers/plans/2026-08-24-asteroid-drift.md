# Asteroid Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship HPA-68 as a 90-second momentum-driven asteroid-dodging minigame with fair increasing traffic, finite energy-orb risk/reward, keyboard/touch input, Pixi rendering, achievements, and the existing Cetus score/progress flow.

**Architecture:** `AsteroidDriftGame` extends `BaseGame` and owns game-local fixed-step thrust physics, simulated-survival scoring, difficulty/spawn accumulators, collision, despawn, and orb lifecycle. BaseGame/GameTimer own the visible wall-clock countdown and timeout delivery, while simulation time is the anti-farming score authority. `spawning.ts` owns finite asteroid/orb placement plus one all-edge off-arena predicate; `scoring.ts` owns arithmetic; `AsteroidDriftRenderer` extends `PixiJSRenderer`; one custom initializer owns held input, one game rAF loop, HUD/overlay integration, and cleanup. No shared arcade framework is added.

**Tech Stack:** Astro 5, TypeScript 6, BaseGame/GameTimer/ScoreManager, PixiJS 8, Tailwind 4, Vitest 3, Playwright 1.54, Bun 1.3.

**Spec:** `docs/superpowers/specs/2026-08-24-asteroid-drift-design.md`

## Global Constraints

- One HPA-68 PR from planning through implementation.
- Implement the exact initial `ASTEROID_DRIFT_RULES` block from the spec in Task 1. After that, `types.ts` is the production constants authority; do not maintain a duplicate numeric rules table in this plan.
- BaseGame/GameTimer own displayed countdown and timeout delivery. `elapsedSimSeconds` owns scored survival and difficulty progression.
- Timer expiry is a full survival only when simulated time is within one `maxUpdateDelta` of duration; otherwise outcome is `expired`, score/data remain simulation-based, and `survivedFullRun` is false.
- Movement is normalized thrust + exponential drag + max-speed clamp with one outer delta clamp and fixed substeps.
- Collision is checked before orb collection.
- Random asteroid placement and orb placement are finite; no rejection/random retry loops.
- Asteroids despawn on all four sides with the single padded-arena predicate from the spec.
- Asteroid/orb capacity paths cannot bank burst debt.
- Score formula shape is survival points + orb points; its two point constants are tunable at the mandatory Task 4 checkpoint.
- Renderer collision-bearing extents derive from model radii; no independent hull/asteroid/orb size constants.
- One custom `slot="controls"`; D-pad is intentionally game-local for this second use. Do not refactor GamePage/GameControls or create `GameDpad.astro` in HPA-68.
- Initializer script lives after `</GamePage>` and the route enters the hardcoded page-markup wrapper sweep in Task 4.
- No changes to BaseGame, GameTimer, ScoreManager, GameInitializer, PixiJSRenderer, Evader, Gravity Flip, score service, API/DB/auth/schema/packages, or `e2e/games/all-games-navigation.spec.ts`.
- Import `circleOverlap`/point `distance` from `@/lib/games/shared/geometry`; import `clamp`/`lerp`/`isEditableTarget` from `@/lib/games/shared/utils`.

---

## File Map

### New production

- `src/lib/games/asteroid-drift/types.ts` — rules/config/entities/state/stats/data.
- `src/lib/games/asteroid-drift/spawning.ts` — edge eligibility, asteroid materialization, all-edge despawn predicate, finite orb-anchor scan.
- `src/lib/games/asteroid-drift/scoring.ts` — pure score arithmetic.
- `src/lib/games/asteroid-drift/AsteroidDriftGame.ts` — BaseGame model, fixed-step movement, simulated survival, spawning/collision/orbs.
- `src/lib/games/asteroid-drift/AsteroidDriftRenderer.ts` — two-layer Pixi renderer.
- `src/lib/games/asteroid-drift/initFramework.ts` — callbacks, input, one game rAF, cleanup/debug handle.
- `src/pages/asteroid-drift/index.astro` — playable route.

### New tests

- `src/lib/games/asteroid-drift/spawning.test.ts`
- `src/lib/games/asteroid-drift/scoring.test.ts`
- `src/lib/games/asteroid-drift/AsteroidDriftGame.test.ts`
- `src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts`
- `src/lib/games/asteroid-drift/initFramework.test.ts`

### Existing files

- `src/lib/games.ts` — Task 2 stable ID/icon; Task 5 active row.
- `src/lib/games.test.ts` — ID/icon then registration.
- `src/lib/games/shared/types.ts` — canonical game-data alias + union.
- `src/lib/organisms.test.ts` — final depth count.
- `src/lib/achievements.ts`, `src/lib/achievements.test.ts` — four achievements.
- `src/pages/game-board-markup.test.ts` — Task 4 route/bootstrap/D-pad/wrapper sweep.
- `e2e/games/play-coverage.spec.ts` — deterministic collision/replay/mobile proof.
- `CLAUDE.md` — game tree/debug handle count/docs.

---

## Task 1: Rules, finite spawn/despawn policy, and pure score

**Files**
- Create: `src/lib/games/asteroid-drift/types.ts`
- Create: `src/lib/games/asteroid-drift/spawning.ts`
- Create: `src/lib/games/asteroid-drift/spawning.test.ts`
- Create: `src/lib/games/asteroid-drift/scoring.ts`
- Create: `src/lib/games/asteroid-drift/scoring.test.ts`

**Interfaces**
- Produces `ASTEROID_DRIFT_RULES`, `AsteroidDriftConfig`, entity/state/stats/data/outcome/input types, and `createAsteroidDriftConfig()`.
- Produces `eligibleAsteroidSpawnEdges()`, `createIntroAsteroid()`, `createRandomAsteroid()`, `isAsteroidOffArena()`, `ASTEROID_DRIFT_ORB_ANCHORS`, `findEnergyOrbSpawn()`.
- Produces `calculateAsteroidDriftScore()`.

- [ ] **1.1 Write RED score tests without copying tuning values into the plan**

```ts
import { describe, expect, it } from 'vitest'
import { createAsteroidDriftConfig } from './types'
import { calculateAsteroidDriftScore } from './scoring'

const config = createAsteroidDriftConfig()

it('scores whole simulated seconds plus orb bonuses', () => {
    expect(
        calculateAsteroidDriftScore(
            { survivalSeconds: 12.99, orbsCollected: 2 },
            config
        )
    ).toBe(
        12 * config.survivalPointsPerSecond + 2 * config.orbPoints
    )
})

it('clamps survival and normalizes orb count', () => {
    expect(
        calculateAsteroidDriftScore(
            { survivalSeconds: -5, orbsCollected: -2 },
            config
        )
    ).toBe(0)
    expect(
        calculateAsteroidDriftScore(
            { survivalSeconds: config.duration + 99, orbsCollected: 1.9 },
            config
        )
    ).toBe(
        config.duration * config.survivalPointsPerSecond + config.orbPoints
    )
})

it('uses supplied point values', () => {
    const tuned = createAsteroidDriftConfig({
        duration: 10,
        survivalPointsPerSecond: 2,
        orbPoints: 7,
    })
    expect(
        calculateAsteroidDriftScore(
            { survivalSeconds: 10, orbsCollected: 3 },
            tuned
        )
    ).toBe(41)
})
```

Run:

```bash
bun run test:run -- src/lib/games/asteroid-drift/scoring.test.ts
```

Expected RED: module does not exist.

- [ ] **1.2 Implement the spec's canonical rules/types/config**

Transcribe the exact `ASTEROID_DRIFT_RULES` block from the linked spec into `types.ts` once. Define:

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

`AsteroidDriftConfig extends BaseGameConfig` contains every rule plus `rng: () => number`.

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

- [ ] **1.3 Write RED finite asteroid/edge/despawn tests**

Cover:

```ts
const config = createAsteroidDriftConfig({ rng: () => 0 })
const player = {
    x: config.canvasWidth / 2,
    y: config.canvasHeight / 2,
    velocityX: 0,
    velocityY: 0,
    radius: config.playerRadius,
}

expect(createIntroAsteroid('asteroid-0', config)).toMatchObject({
    id: 'asteroid-0',
    y: config.canvasHeight / 2,
    velocityX: -config.asteroidInitialSpeed,
    velocityY: 0,
    radius: config.introAsteroidRadius,
})

expect(
    eligibleAsteroidSpawnEdges({ ...player, x: 20 }, config)
).not.toContain('left')
```

Also prove:

- center/corner-like default player positions always leave an eligible edge;
- invalid test config with no eligible edge throws;
- random spawn starts fully outside its selected edge and velocity points inward;
- radius and speed stay inside config-derived bounds;
- invalid RNG samples remain finite/in-range;
- each exact expanded boundary is still active;
- one epsilon beyond left/right/top/bottom expanded boundaries is off-arena.

- [ ] **1.4 Implement finite asteroid helpers**

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

export function isAsteroidOffArena(
    asteroid: AsteroidDriftAsteroid,
    config: AsteroidDriftConfig
): boolean
```

`spawning.ts` imports point `distance` from `shared/geometry` and `clamp`/`lerp` from `shared/utils`.

Clamp each RNG sample through one finite helper:

```ts
function unitSample(rng: () => number): number {
    const value = rng()
    if (!Number.isFinite(value)) return 0
    return Math.min(1 - Number.EPSILON, Math.max(0, value))
}
```

`createRandomAsteroid()` performs one finite edge/radius/coordinate/target/speed materialization with no retry loop.

`isAsteroidOffArena()` is exactly the strict padded-bounds predicate from the spec; no second offscreen rule exists in the game class.

- [ ] **1.5 Add finite orb-anchor policy**

Export the exact eight `ASTEROID_DRIFT_ORB_ANCHORS` from the spec and:

```ts
export function findEnergyOrbSpawn(
    player: Pick<AsteroidDriftPlayer, 'x' | 'y'>,
    asteroids: readonly AsteroidDriftAsteroid[],
    config: AsteroidDriftConfig
): { x: number; y: number } | null
```

Consume one RNG sample for starting index, scan exactly eight cyclic positions, and return the first point meeting player and asteroid clearances. Tests cover player-near skip, asteroid-near skip, wraparound selection, and all-blocked null.

- [ ] **1.6 Implement pure scorer**

`scoring.ts` imports `clamp` from `shared/utils`:

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

- [ ] **1.7 Run Task 1 gates and commit**

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
- Modify: `src/lib/games.ts` — stable ID/icon only.
- Modify: `src/lib/games.test.ts` — ID/icon lock only.

**Interfaces**
- Produces `AsteroidDriftGame`, `pressDirection()`, `releaseDirection()`, `pressedDirections`, stats/game-data lifecycle.
- Uses Task 1 spawning/scoring contracts.

- [ ] **2.1 Add stable ID/icon without active catalog row**

```ts
ASTEROID_DRIFT = 'asteroid_drift',
```

```ts
[GameID.ASTEROID_DRIFT]: '☄️',
```

Tests:

```ts
expect(GameID.ASTEROID_DRIFT).toBe('asteroid_drift')
expect(getGameIcon(GameID.ASTEROID_DRIFT)).toBe('☄️')
```

Do not add a temporary inactive catalog row or `getGameById(...) === undefined` test.

- [ ] **2.2 Write RED idle/input tests**

Idle state derives its center/time/radius from config and has zero score, velocity, asteroids, orbs, and outcome `playing`. After start, exactly one intro asteroid exists.

Public input API:

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

Prove keyboard+touch union and same-direction two-source release independence.

- [ ] **2.3 Implement BaseGame shell/private runtime**

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

`onGameStart()` resets private runtime, offsets asteroid accumulation by opening grace, pushes intro asteroid, and emits state. Reset/end clear held input/private accumulators. No game-local timer exists.

- [ ] **2.4 TDD movement**

Prove:

1. held right creates positive velocity/position;
2. release preserves reduced positive velocity;
3. diagonal normalization does not increase acceleration magnitude;
4. sustained thrust never exceeds max speed;
5. boundary clamp keeps the circle inside and clears only outward velocity.

Input axes:

```ts
const directions = this.getActiveDirections()
const rawX = Number(directions.has('right')) - Number(directions.has('left'))
const rawY = Number(directions.has('down')) - Number(directions.has('up'))
const inputLength = Math.hypot(rawX, rawY)
const inputX = inputLength > 0 ? rawX / inputLength : 0
const inputY = inputLength > 0 ? rawY / inputLength : 0
```

Then thrust, exponential drag, speed-magnitude clamp, integration, and wall response exactly as the spec.

- [ ] **2.5 Write RED fixed-step/collision/despawn/capacity tests**

Pin:

- inactive/paused/non-finite/non-positive update is inert;
- one oversized update advances at most one outer-clamp worth of simulation;
- a fast crossing asteroid is caught by fixed substeps;
- random traffic waits for opening grace;
- intro can leave left and be removed;
- a positive-X test asteroid can leave right and be removed by the same predicate;
- filling to max then moving a body off-arena lowers active count and reopens capacity;
- full capacity consumes zero spawn RNG and cannot bank a multi-spawn burst;
- observed random traffic gets denser/faster as simulated progress increases.

Use config-derived expectations and observable state; do not expose private clocks for tests.

- [ ] **2.6 Implement update/substep/collision/despawn/spawn**

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

`stepPhysics()` follows the spec order. Clamp `elapsedSimSeconds` to duration. Move then filter asteroids only through `isAsteroidOffArena()`.

Collision:

```ts
this.state.outcome = 'collision'
this.syncScore()
void this.end().catch((error: unknown) =>
    console.error('AsteroidDrift end failed', error)
)
return
```

Return before orb collection/spawning; do not await physics.

Asteroid capacity uses one interval-capped accumulator and no catch-up loop.

- [ ] **2.7 Add orb lifecycle/debt TDD**

With small config durations/cadences, prove:

- at most one orb;
- valid attempt creates age-0 orb;
- blocked attempt resets the attempt cadence;
- while an orb exists, accumulator is capped at one interval and no second spawn occurs;
- collection resets accumulator to zero and does not instant-respawn;
- expiry resets accumulator to zero and does not instant-respawn;
- contact collects exactly once;
- same-step asteroid+orb contact loses before collection;
- collision end is called once and rejected async end/save is caught.

Implementation policy:

```ts
if (this.state.energyOrb) {
    this.orbSpawnAccumulator = Math.min(
        this.orbSpawnAccumulator + step,
        this.config.orbSpawnInterval
    )
} else {
    this.orbSpawnAccumulator += step
    if (this.orbSpawnAccumulator >= this.config.orbSpawnInterval) {
        this.orbSpawnAccumulator = 0
        // one finite findEnergyOrbSpawn() attempt
    }
}
```

Set `orbSpawnAccumulator = 0` whenever the current orb is collected or expires.

- [ ] **2.8 Make simulation the score authority and close background farming**

Private survival helper:

```ts
private survivalSeconds(): number {
    if (this.state.outcome === 'survived') {
        return this.config.duration
    }
    return clamp(this.elapsedSimSeconds, 0, this.config.duration)
}
```

`syncScore()` calls the Task 1 scorer using `survivalSeconds()` and orb count, adding only positive delta.

Timer completion:

```ts
protected handleTimeUp(): void {
    const simulated = clamp(
        this.elapsedSimSeconds,
        0,
        this.config.duration
    )
    const completedSimulation =
        simulated >= this.config.duration - this.config.maxUpdateDelta

    this.state.outcome = completedSimulation ? 'survived' : 'expired'
    this.syncScore()
    super.handleTimeUp()
}
```

Tests use a short custom duration:

1. advancing `game.update()` advances survival score even if wall time is unchanged;
2. collision preserves the simulated seconds actually played;
3. simulate to within one `maxUpdateDelta` of duration, then fire timer completion: outcome `survived`, full-duration score/data, `survivedFullRun=true`;
4. **anti-farm regression:** start, advance fake wall timer to completion without calling `game.update()`: outcome `expired`, survival score/data remain 0, `survivedFullRun=false`;
5. a partially simulated timeout returns partial simulated survival and cannot earn full-run data.

Only the two timeout delivery tests need fake timers. Delete the previous wall-clock-vs-sim synchronization suite; there is no Date.now-based scoring path anymore.

- [ ] **2.9 Stats/data/reset**

`getGameStats()` and `getGameData()` both use the same `survivalSeconds()` authority. `survivedFullRun` is `outcome === 'survived'`.

Reset/start clears outcome/entities/orb/velocity/input/simulation/spawn state.

- [ ] **2.10 Run Task 2 gates and commit**

```bash
bun run test:run -- src/lib/games/asteroid-drift src/lib/games.test.ts
bun run typecheck
```

Expected PASS.

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/asteroid-drift
git commit -m "feat(asteroid-drift): add momentum game model"
```

---

## Task 3: Two-layer Pixi renderer with collision-honest geometry

**Files**
- Create: `src/lib/games/asteroid-drift/AsteroidDriftRenderer.ts`
- Create: `src/lib/games/asteroid-drift/AsteroidDriftRenderer.test.ts`

- [ ] **3.1 Write RED layer/lifecycle tests**

Follow current Pixi mocks. Setup creates exactly two Asteroid Drift-owned Graphics layers in order: static background, dynamic entities. Static background is drawn once; dynamic layer clears/redraws.

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

Background is deterministic and consumes no RNG. Renderer owns no ticker.

- [ ] **3.3 Lock collision-bearing visual extents**

Renderer tests inspect recorded Graphics arguments rather than only asserting that shapes exist.

For a fixture state:

- every local ship hull vertex must satisfy `Math.hypot(x, y) <= player.radius`;
- asteroid outer `circle(...)` call uses exactly `asteroid.radius`;
- orb outer ring `circle(...)` call uses exactly `energyOrb.radius`;
- crater marks/inner orb decoration stay within their owning radius;
- no independent production constant determines collision-bearing visual size.

Also lock triangular/heading geometry, crater decoration, orb diamond/cross identity, and safe ignore of invalid state.

Dynamic order remains orb → asteroids → ship. Model circle collision remains authoritative.

- [ ] **3.4 Cleanup/gates/commit**

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

## Task 4: Initializer, native controls, playable route, and tuning

**Files**
- Create: `src/lib/games/asteroid-drift/initFramework.ts`
- Create: `src/lib/games/asteroid-drift/initFramework.test.ts`
- Create: `src/pages/asteroid-drift/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

- [ ] **4.1 Write RED route/bootstrap/wrapper tests**

Load `asteroidDriftMarkup` at module scope and add `'asteroid-drift'` to the existing hardcoded `games` wrapper array immediately when the route is introduced.

Require IDs:

```text
asteroid-drift-container
asteroid-drift-canvas
asteroid-drift-status
orbs-collected
ship-speed
asteroid-drift-dpad
final-outcome
final-survival
final-orbs
```

Assert:

- four native `button[data-direction]` values up/left/down/right;
- all four carry `tabindex="-1"` and an accessible label;
- explicit `slot="controls"` exists;
- no `end-btn`; Pause/End false, Reset true;
- initializer script is page-root content after `</GamePage>`:

```ts
expect(asteroidDriftMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initAsteroidDriftGameFramework/
)
```

- `DOMContentLoaded` occurs before `initAsteroidDriftGameFramework()`.

- [ ] **4.2 Create Astro route/custom controls**

Use GamePage with game ID/title/icon, spec-derived initial time, no Pause/End, Reset enabled, and initial collision overlay title.

Use explicit:

```astro
<div slot="controls">
  <!-- Start/Reset + #asteroid-drift-dpad -->
</div>
```

Start/Reset use existing Button. The four held-pointer D-pad controls are native buttons with `data-direction`, `aria-label`, `tabindex="-1"`, and `touch-action: none`.

Do **not** modify GamePage/GameControls to pass children through. This is the second D-pad copy; extraction is deferred until a third real consumer.

Scoring copy reads values from `ASTEROID_DRIFT_RULES` rather than literals.

Canvas remains non-interactive gameplay-wise and scales with `max-width: 100%; height: auto`.

Close `</GamePage>` before the initializer script.

- [ ] **4.3 Write RED initializer/HUD/result tests**

Verify:

- missing root returns undefined through current error path;
- initial idle render/HUD;
- Start hides overlay/start appropriately;
- state callbacks sync orbs/speed/score/time;
- collision result `SHIP LOST` / `Collision`;
- survived result `DRIFT COMPLETE` / `Survived`;
- expired result `DRIFT ENDED` / `Expired`, with partial simulated survival;
- Play Again starts a fresh active run;
- Reset restores idle;
- achievements/challenges forward from end event;
- cleanup is idempotent.

- [ ] **4.4 Implement keyboard mapping**

Import `isEditableTarget` from shared utils. Map arrows/WASD to four directions. Keydown ignores modifier combos/editable targets/unrelated keys and only presses while active. Keyup releases mapped keyboard direction even after game end.

- [ ] **4.5 Implement Evader-shaped independent pointer D-pad locally**

For each D-pad button:

- pointerdown: prevent default, add active class, `releasePointerCapture(pointerId)` inside try/catch, press touch direction only while active;
- pointerup/leave/cancel: prevent default, remove active class, release touch direction.

Tests cover touch diagonal, keyboard+touch same-direction ownership, pointercancel, pre-start no latent input, and harmless pointer-capture failure.

No pointermove/virtual joystick abstraction.

- [ ] **4.6 Add one game rAF and responsive canvas override**

```ts
const canvas = renderer.getApp()?.canvas ?? null
if (canvas) {
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
}
```

One rAF loop uses monotonic timestamps, first delta zero, subsequent outer delta bounded by config, updates only active/unpaused game, renders, schedules one successor. No game-local interval/Pixi ticker.

- [ ] **4.7 Add bounded live/beforeunload/debug integration**

Announce only start, orb collection, collision, full completion, and incomplete expiry. Beforeunload only while active. Expose `window.asteroidDriftGame` from the page-root DOMContentLoaded bootstrap.

- [ ] **4.8 Run playable gates and commit**

```bash
bun run test:run -- src/lib/games/asteroid-drift src/pages/game-board-markup.test.ts
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

- [ ] **4.9 Mandatory manual tuning checkpoint**

Play desktop + 375×812 and answer all six:

1. Is the opening idle collision readable/dodgeable?
2. Is momentum noticeable without frustrating correction?
3. Do edge-biased orbs create voluntary risk without unsafe placement?
4. During late traffic, did any death feel effectively unavoidable rather than earned?
5. Can D-pad diagonals and release work comfortably on touch?
6. After a strong run, did score reward both survival and orb collection rather than only one channel?

Allowed tuning values are exactly the categories listed in the spec, including `survivalPointsPerSecond` and `orbPoints`.

If tuning is needed, update **only**:

- `src/lib/games/asteroid-drift/types.ts`;
- direct tests that derive/assert those values;
- the spec's `ASTEROID_DRIFT_RULES` constants block and score-balance note.

Do **not** update this implementation plan to mirror tuning numbers. Do not change duration, finite algorithms, anti-farming completion rule, lifecycle, or architecture during tuning.

Commit only if values actually change:

```bash
git add src/lib/games/asteroid-drift \
        docs/superpowers/specs/2026-08-24-asteroid-drift-design.md
git commit -m "chore(asteroid-drift): tune gameplay defaults"
```

---

## Task 5: Catalog, shared data, achievements, and repo metadata

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `CLAUDE.md`

`game-board-markup.test.ts` was already updated in Task 4; do not defer/duplicate that edit here.

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

Depth becomes exactly `9 / 9 / 4`. Keep the existing generic adjacency invariant.

- [ ] **5.2 Add active catalog row**

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

Do not alter URL machinery or add a registry abstraction.

- [ ] **5.3 Add canonical shared game-data alias**

```ts
export type AsteroidDriftGameData =
    import('../asteroid-drift/types').AsteroidDriftGameData
```

Add it once to `GameData`; achievement checks use the canonical type rather than restating the shape.

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

Conditions:

- First Charge: `orbsCollected >= 1`;
- Energy Runner: `orbsCollected >= 6`;
- Long Haul: `survivalSeconds >= 60`;
- Deep Space Ace: `survivedFullRun && orbsCollected >= 10`.

Include negative boundaries and an explicit background-style data case `{ survivalSeconds: 0, survivedFullRun: false }` proving it cannot satisfy Long Haul/Deep Space Ace.

- [ ] **5.5 Add current-machinery achievement definitions**

Use `AsteroidDriftGameData`; no achievement service/schema changes.

- [ ] **5.6 Update CLAUDE.md**

Update implemented-game count/tree/Pixi notes/debug handle. Preserve `AGENTS.md` symlink; do not replace it.

- [ ] **5.7 Run gates and commit**

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
  CLAUDE.md
git commit -m "feat(asteroid-drift): register game and achievements"
```

---

## Task 6: Browser/mobile regression and final gates

**Files**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify source-unchanged: `e2e/games/all-games-navigation.spec.ts`

- [ ] **6.1 Add deterministic intro-collision → Play Again journey**

Intercept the score endpoint like adjacent journeys. Open `/asteroid-drift`, assert idle state, start, provide no movement, wait for the deterministic intro collision, assert `SHIP LOST`/inactive/final stats, click Play Again, and assert a fresh active centered run.

Derive the collision wait from imported `ASTEROID_DRIFT_RULES`; do not use a fixed long sleep or test-only collision API.

- [ ] **6.2 Add 375×812 D-pad/momentum proof**

Assert no horizontal overflow, positive responsive canvas height, and all four D-pad buttons visible/in viewport.

Use actual pointer events:

1. Start.
2. Hold right long enough to observe positive X velocity/position through debug handle.
3. Release right; held-right disappears while velocity remains briefly positive, proving momentum.
4. Hold up+right; debug handle reports both directions.
5. Release both cleanly.

Do not freeze exact pixel positions/device-pixel intrinsic canvas dimensions.

- [ ] **6.3 Keep background anti-farm at unit level**

Do not add a slow 90-second browser background-tab test. Task 2 owns the deterministic fake-timer regression that timeout without simulation becomes `expired` with no free survival score/full-run data. Browser E2E focuses real interaction/layout.

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

- [ ] **6.6 Verify scope**

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

Changed production scope should remain Asteroid Drift-local files/page + game catalog/shared-data/achievements/docs only. No GamePage/GameControls/D-pad abstraction change.

- [ ] **6.7 Commit browser coverage**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(asteroid-drift): cover browser lifecycle and mobile controls"
```

---

## Final Implementation PR Checklist

- [ ] One HPA-68 PR.
- [ ] GameTimer owns visible deadline; simulation time owns scored survival/difficulty.
- [ ] Background timeout without simulation ends `expired`, cannot earn free survival score, Long Haul, or Deep Space Ace.
- [ ] Healthy near-complete simulation rounds to full duration using only `maxUpdateDelta` tolerance.
- [ ] Momentum, outer clamp, and fixed substeps have non-vacuous tests.
- [ ] Intro remains deterministic/RNG-free.
- [ ] Fair edge selection is finite; all-edge despawn releases capacity.
- [ ] Orb placement is one finite anchor scan; active/removed orbs cannot bank spawn debt.
- [ ] Collision precedes orb collection and async end is caught.
- [ ] Renderer ship/asteroid/orb extents derive directly from model radii.
- [ ] Task 4 tuning evaluates unavoidable deaths and survival-vs-orb score balance; point constants may tune there.
- [ ] `types.ts` is production rules authority; plan does not mirror tuned numbers.
- [ ] Second local D-pad copy is deliberate; no GamePage/GameControls/GameDpad refactor.
- [ ] Root-level Astro bootstrap and hardcoded wrapper sweep are locked.
- [ ] Catalog is action/medium/1–2 minutes/shallow spiral-amber; final depth fixture 9/9/4.
- [ ] Exactly four achievements use canonical simulation-based data.
- [ ] Core runtime, Evader, Gravity Flip, backend/schema/auth/packages, and all-games-navigation source remain unchanged.
- [ ] Targeted/full unit, coverage, typecheck, lint, format, build, play coverage, and catalog navigation pass.
