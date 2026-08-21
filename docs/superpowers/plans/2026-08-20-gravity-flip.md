# Gravity Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gravity Flip, a one-minute one-button side-scrolling action game with continuous gravity physics, a safe-by-construction five-kind challenge catalog, optional stars, accessible desktop/mobile input, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `GravityFlipGame` extends `BaseGame` and owns fixed-X vertical physics, simulation-time difficulty progression, a closed game-local hazard catalog, distance-based challenge scheduling, collision/star collection, safe mover bounds, and score synchronization. `GravityFlipRenderer` extends `PixiJSRenderer` with one static corridor layer and one redrawn dynamic scene layer. A custom initializer combines Pattern Pulse's current error/debug/beforeunload conventions with Evader's single-rAF loop. No shared runner/physics/input framework or backend change is required.

**Tech Stack:** Astro 5 + TypeScript 6, PixiJS 8.10, Tailwind CSS 4, existing BaseGame/PixiJSRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-20-gravity-flip-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- Deliver HPA-73 in **one implementation PR**; game, route, registration, achievements, tuning changes, and tests stay together.
- ID **`gravity_flip`**, route **`/gravity-flip`**, title **`Gravity Flip`**, icon **`🌗`**.
- Structural v1 contracts: **60-second** BaseGame run, logical canvas **800×320**, player X **150**, first challenge `floor-spike`, internal physics step **≤1/120s**, five closed hazard kinds, distance+stars scorer, `timeBonus: false`.
- Initial tuning defaults live once in `GRAVITY_FLIP_RULES`: player size 28, corridor inset 36, gravity 1800 px/s², vertical cap 700 px/s, world speed 220→360 px/s, spacing 520→400 px, mover unlock 15 simulated seconds, spike 52×34, gap 90×18, mover 40px at 180 px/s, mover rail clearance 28, star radius 10, gap rail tolerance 0.5px.
- Balance-sensitive defaults are **subject to the Task 6 manual-play checkpoint**. If changed, update `GRAVITY_FLIP_RULES`, affected tests, and the design doc in the same implementation PR before final gates.
- Difficulty ramp uses private accumulated **simulation time**, not `GameTimer`/`Date.now()` elapsed time. BaseGame/GameTimer remains the only run-duration authority.
- `flipGravity()` reverses gravity but **does not zero vertical velocity**.
- Later challenge selection uses injected `rng: () => number` exactly once per random spawn.
- One discriminated `GRAVITY_FLIP_HAZARD_CATALOG` is the production authority for shape/surface/star semantics.
- Do not classify hazard kinds with `startsWith`, `endsWith`, regexes, or substring parsing.
- Mover Y bounds derive from `max(playerSize, moverRailClearance)`; resting on either rail must be non-overlapping at both extrema for default and larger player sizes.
- Gap collision uses configured `gapRailTolerance`; do not hard-code `0.5` in collision logic.
- Spike/mover collision and star pickup use conservative AABBs; no pixel-perfect geometry.
- `calculateGravityFlipScore()` is the only production scoring formula: `floor(distancePx / 50) * 10 + starsCollected * 250`.
- Terminal outcomes: `collision` and `survived`; timeout sets `survived` before delegating to BaseGame.
- Collision UI: **GRAVITY LOST / Collision**. Survival UI: **RUN COMPLETE / Survived**.
- Use existing BaseGame timer/save/run-guard/completed-run auto-reset; no second timer or stale-run token.
- Use `BaseGame + PixiJSRenderer`; no shared runner engine, physics engine, generic spawner, GameInitializer adoption, level editor, persistence, Daily mode, schema/API/leaderboard change, audio, or haptics.
- Renderer keeps fixed logical coordinates; page CSS scales the canvas visually for mobile.
- Keyboard controls: `Space`, `ArrowUp`, `ArrowDown`; ignore repeat, Ctrl/Meta/Alt, editable targets, and button targets.
- Canvas `pointerdown` and native `#flip-btn` click call the same `game.flipGravity()` API.
- Focused `#flip-btn` native Enter/Space owns button activation; document keydown must not also flip.
- Initializer returns `getGame()`; the Astro page, not `initFramework.ts`, assigns `window.gravityFlipGame`.
- Initializer includes the existing active-run `beforeunload` warning and removes it during cleanup.
- Play Again intentionally hides the overlay and calls `game.start()` so BaseGame auto-resets **and starts** the next run.
- Create `/gravity-flip` before activating the `GAMES` record because `games.test.ts` verifies routes.
- Registering Gravity Flip at `depth: 'mid'` changes `src/lib/organisms.test.ts` partition counts from `6 / 7 / 4` to `6 / 8 / 4`.
- `getGameUrl()` and `e2e/games/all-games-navigation.spec.ts` stay source-unchanged.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `PixiJSRenderer.ts`, `GameInitializer.ts`, score service, `src/lib/server/db/`, APIs, and auth remain production-unchanged.
- Edit `CLAUDE.md`, not the `AGENTS.md` symlink.
- Codecov project/patch targets are **90%** with **0%** threshold and missing-report failure.

## Load-Bearing Risks

- **Mover unfairness:** test default and `playerSize: 40` rail AABBs at both bounce extrema.
- **Illegal descriptor states:** discriminate descriptors on `shape`; spike/gap always have a concrete surface and mover has none.
- **Two-clock drift:** ramp from `elapsedSimSeconds`; use BaseGame timer only to end the run.
- **Thin-hazard tunneling:** regression uses an injected 8px spike starting at player-right X=164; a single clamped endpoint check would miss it.
- **Frame-dependent score drift:** synchronize BaseGame score to the pure accumulated target instead of awarding rounded points per frame.
- **Focused-button double flip:** document keydown ignores button targets so native Space/Enter click is the only button activation.
- **Terminal-copy drift:** collision and survival title/outcome strings are tested independently.
- **Debug/error fork:** use Pattern Pulse's `DOMElementNotFoundError`, `handleGameError`, `getGame()`, and unload-warning conventions; only the rAF loop comes from Evader.
- **Double end/save:** first collision delegates once to BaseGame and inactive state stops later substeps.
- **Catalog count regression:** `organisms.test.ts` is part of registration and targeted gates.
- **Browser timing flake:** Playwright stops after Play Again re-arms; flip/focus tests remain deterministic in `initFramework.test.ts`.
- **Untested balance:** mandatory manual-play questions precede final repository gates.

---

### Task 1: Define contracts, safe mover bounds, GameID/icon, and scorer

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Create: `src/lib/games/gravity-flip/types.ts`
- Create: `src/lib/games/gravity-flip/scoring.ts`
- Create: `src/lib/games/gravity-flip/scoring.test.ts`
- Reuse unchanged: `src/lib/games/shared/utils.ts`

**Interfaces:**
- Produces `GameID.GRAVITY_FLIP`, icon mapping, `GravityFlipHazardKind`, discriminated `GravityFlipHazardDescriptor`, `GRAVITY_FLIP_HAZARD_CATALOG`, `GRAVITY_FLIP_RULES`, config/state/stats/data types, `createGravityFlipConfig()`, `getGravityFlipMoverBounds()`, and `calculateGravityFlipScore()`.
- The active `GAMES` record stays deferred until Task 5 creates the route.

- [ ] **Step 1: Add compile-safe GameID/icon without activating the route**

Add to `GameID`:

```ts
GRAVITY_FLIP = 'gravity_flip',
```

Add to the exhaustive icon record:

```ts
[GameID.GRAVITY_FLIP]: '🌗',
```

Add a temporary pre-registration assertion:

```ts
describe('Gravity Flip identifier', () => {
    it('reserves the id/icon before route registration', () => {
        expect(GameID.GRAVITY_FLIP).toBe('gravity_flip')
        expect(getGameIcon(GameID.GRAVITY_FLIP)).toBe('🌗')
        expect(getGameById(GameID.GRAVITY_FLIP)).toBeUndefined()
    })
})
```

Run:

```bash
bun run test:run src/lib/games.test.ts
```

Expected: PASS.

- [ ] **Step 2: Create the rule source and discriminated catalog**

Create `src/lib/games/gravity-flip/types.ts` starting with:

```ts
import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export type GravityDirection = 'down' | 'up'
export type GravityFlipOutcome = 'playing' | 'collision' | 'survived'
export type GravityFlipHazardKind =
    | 'floor-spike'
    | 'ceiling-spike'
    | 'floor-gap'
    | 'ceiling-gap'
    | 'mover'

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
    'floor-spike': { shape: 'spike', surface: 'floor', hasStar: true },
    'ceiling-spike': { shape: 'spike', surface: 'ceiling', hasStar: true },
    'floor-gap': { shape: 'gap', surface: 'floor', hasStar: true },
    'ceiling-gap': { shape: 'gap', surface: 'ceiling', hasStar: true },
    mover: { shape: 'mover', hasStar: false },
}

export const GRAVITY_FLIP_RULES = {
    duration: 60,
    canvasWidth: 800,
    canvasHeight: 320,
    corridorInset: 36,
    playerX: 150,
    playerSize: 28,
    gravityAcceleration: 1800,
    maxVerticalSpeed: 700,
    maxPhysicsStep: 1 / 120,
    initialWorldSpeed: 220,
    finalWorldSpeed: 360,
    initialChallengeSpacing: 520,
    finalChallengeSpacing: 400,
    moverUnlockSeconds: 15,
    spawnOffsetX: 80,
    spikeWidth: 52,
    spikeHeight: 34,
    gapWidth: 90,
    gapHeight: 18,
    gapRailTolerance: 0.5,
    moverSize: 40,
    moverVerticalSpeed: 180,
    moverRailClearance: 28,
    starRadius: 10,
} as const
```

`GravityFlipConfig` extends `BaseGameConfig` with every configurable rule field above plus `rng: () => number`. `createGravityFlipConfig()` copies every rule from `GRAVITY_FLIP_RULES`, sets:

```ts
achievementIntegration: true,
pausable: false,
resettable: true,
rng: Math.random,
```

then applies overrides last.

Define the runtime contracts:

```ts
export interface GravityFlipPlayer {
    x: number
    y: number
    velocityY: number
    size: number
}

export interface GravityFlipHazard {
    id: string
    kind: GravityFlipHazardKind
    x: number
    y: number
    width: number
    height: number
    verticalVelocity: number
}

export interface GravityFlipStar {
    id: string
    x: number
    y: number
    radius: number
}

export interface GravityFlipState extends BaseGameState {
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

export interface GravityFlipStats extends BaseGameStats {
    outcome: GravityFlipOutcome
    distance: number
    starsCollected: number
    flips: number
}

export interface GravityFlipGameData {
    distance: number
    starsCollected: number
    flips: number
    survivedFullRun: boolean
}
```

- [ ] **Step 3: Add the mover-bound helper that protects player-body clearance**

```ts
export function getGravityFlipMoverBounds(config: GravityFlipConfig): {
    minY: number
    maxY: number
} {
    const clearance = Math.max(config.playerSize, config.moverRailClearance)
    const minY = config.corridorInset + clearance
    const maxY =
        config.canvasHeight -
        config.corridorInset -
        clearance -
        config.moverSize
    if (maxY < minY) {
        throw new RangeError('Gravity Flip mover bounds have no safe corridor')
    }
    return { minY, maxY }
}
```

The only planned runtime throw is for an impossible **numeric config**. The discriminated catalog itself requires no defensive descriptor throw or null guard.

- [ ] **Step 4: Write RED scoring tests**

```ts
import { describe, expect, it } from 'vitest'
import { calculateGravityFlipScore } from './scoring'

describe('calculateGravityFlipScore', () => {
    it.each([
        [{ distancePx: 0, starsCollected: 0 }, 0],
        [{ distancePx: 499, starsCollected: 0 }, 90],
        [{ distancePx: 500, starsCollected: 0 }, 100],
        [{ distancePx: 1250, starsCollected: 2 }, 750],
        [{ distancePx: 8000, starsCollected: 5 }, 2850],
    ])('scores %o as %i', (input, expected) => {
        expect(calculateGravityFlipScore(input)).toBe(expected)
    })

    it('clamps invalid progress', () => {
        expect(
            calculateGravityFlipScore({
                distancePx: Number.NaN,
                starsCollected: -2,
            })
        ).toBe(0)
    })
})
```

Run:

```bash
bun run test:run src/lib/games/gravity-flip/scoring.test.ts
```

Expected: RED because `scoring.ts` does not exist.

- [ ] **Step 5: Implement the single scorer and verify Task 1**

```ts
export interface GravityFlipScoreInput {
    distancePx: number
    starsCollected: number
}

export function calculateGravityFlipScore({
    distancePx,
    starsCollected,
}: GravityFlipScoreInput): number {
    const safeDistance = Number.isFinite(distancePx)
        ? Math.max(0, distancePx)
        : 0
    const safeStars = Number.isFinite(starsCollected)
        ? Math.max(0, Math.floor(starsCollected))
        : 0
    return Math.floor(safeDistance / 50) * 10 + safeStars * 250
}
```

Run:

```bash
bun run test:run src/lib/games/gravity-flip/scoring.test.ts src/lib/games.test.ts
bun run typecheck
```

Expected: PASS / zero Astro-check errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/gravity-flip/types.ts src/lib/games/gravity-flip/scoring.ts src/lib/games/gravity-flip/scoring.test.ts
git commit -m "feat(gravity-flip): add contracts and scoring"
```

---

### Task 2: Implement BaseGame motion, simulation-time ramp, and frame-stable score

**Files:**
- Create: `src/lib/games/gravity-flip/GravityFlipGame.ts`
- Create: `src/lib/games/gravity-flip/GravityFlipGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Produces `GravityFlipGame`, `flipGravity(): boolean`, `getConfig()`, player/distance/world-speed state, terminal `survived` handling, local `emitStateChange()`, score sync, and the collision-safe substep loop.
- Task 3 fills entity/challenge work into each substep without changing public APIs.

- [ ] **Step 1: Write RED motion/ramp/score tests**

Use:

```ts
function createGame(overrides: Partial<GravityFlipConfig> = {}) {
    return new GravityFlipGame(
        createGravityFlipConfig({
            achievementIntegration: false,
            rng: () => 0,
            ...overrides,
        })
    )
}
```

With Vitest fake timers only where BaseGame timeout behavior needs them, cover:

```ts
it('starts floor-resting with downward gravity and zero velocity')
it('flipGravity reverses direction, increments flips, and preserves velocityY')
it('rejects flips before start and after end')
it('clamps player to the floor/ceiling rails')
it('emits state-change callback/event when gravity changes')
it('ramps from 220 toward 360 by repeated update calls without advancing Date')
it('does not jump difficulty when wall-clock time advances without update calls')
it('produces the same score for 10x0.01s and 1x0.1s distance updates')
it('timeout marks survived before BaseGame end')
```

The ramp test should call `update(0.1)` repeatedly (for example 300 calls for ~30 simulated seconds) while leaving fake wall time unchanged; it must not rely on `getTimerStatus().elapsedTime`.

Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts
```

Expected: RED.

- [ ] **Step 2: Implement BaseGame shell, private sim time, and flip contract**

Constructor:

```ts
super(GameID.GRAVITY_FLIP, config, callbacks, {
    basePoints: 0,
    timeBonus: false,
})
```

Private simulation field:

```ts
private elapsedSimSeconds = 0
```

Initial player:

```ts
const half = this.config.playerSize / 2
const floorY =
    this.config.canvasHeight - this.config.corridorInset - half
```

Initial state has downward gravity, `velocityY: 0`, empty hazards/stars, zero distance/stars/flips, and `initialWorldSpeed`.

```ts
flipGravity(): boolean {
    if (!this.state.isActive || this.state.isPaused || this.state.isGameOver) {
        return false
    }
    this.state.gravity = this.state.gravity === 'down' ? 'up' : 'down'
    this.state.flips += 1
    this.emitStateChange()
    return true
}
```

Add the missing local BaseGame-game convention explicitly:

```ts
private emitStateChange(): void {
    if (this.callbacks.onStateChange) {
        this.callbacks.onStateChange(this.getState())
    }
    this.emit('state-change', { state: this.getState() })
}
```

- [ ] **Step 3: Implement substep update using simulation time, not GameTimer elapsed time**

```ts
update(deltaTime: number): void {
    if (
        !this.state.isActive ||
        this.state.isPaused ||
        !Number.isFinite(deltaTime) ||
        deltaTime <= 0
    ) {
        return
    }

    let remaining = Math.min(deltaTime, 0.1)
    while (remaining > 0 && this.state.isActive) {
        const step = Math.min(remaining, this.config.maxPhysicsStep)
        this.stepPhysics(step)
        remaining -= step
    }
    this.syncScore()
    this.emitStateChange()
}
```

At the beginning of each `stepPhysics(step)`:

```ts
this.elapsedSimSeconds = Math.min(
    this.config.duration,
    this.elapsedSimSeconds + step
)
const progress = clamp(
    this.elapsedSimSeconds / this.config.duration,
    0,
    1
)
this.state.worldSpeed = lerp(
    this.config.initialWorldSpeed,
    this.config.finalWorldSpeed,
    progress
)
```

Do **not** call `getTimerStatus()` or `Date.now()` to determine world speed/spacing.

Then apply vertical physics:

```ts
const acceleration =
    this.state.gravity === 'down'
        ? this.config.gravityAcceleration
        : -this.config.gravityAcceleration
this.state.player.velocityY = clamp(
    this.state.player.velocityY + acceleration * step,
    -this.config.maxVerticalSpeed,
    this.config.maxVerticalSpeed
)
this.state.player.y += this.state.player.velocityY * step
```

Clamp player center to `corridorInset + half` / `canvasHeight - corridorInset - half`; zero vertical velocity on rail contact. Add `worldSpeed * step` to `state.distance`.

- [ ] **Step 4: Add score/state/data lifecycle helpers**

```ts
private playerRect() {
    const half = this.state.player.size / 2
    return {
        x: this.state.player.x - half,
        y: this.state.player.y - half,
        width: this.state.player.size,
        height: this.state.player.size,
    }
}

private syncScore(): void {
    const target = calculateGravityFlipScore({
        distancePx: this.state.distance,
        starsCollected: this.state.starsCollected,
    })
    const delta = target - this.state.score
    if (delta > 0) this.addScore(delta, 'gravity_flip_progress')
}
```

`getGameStats()` returns final score/time plus outcome, floored distance, stars, and flips. `getGameData()` returns the four submitted fields as `Record<string, unknown>`.

```ts
protected handleTimeUp(): void {
    this.state.outcome = 'survived'
    super.handleTimeUp()
}

protected onGameStart(): void {
    this.elapsedSimSeconds = 0
    this.emitStateChange()
}

protected onGameReset(): void {
    this.elapsedSimSeconds = 0
}
```

Task 3 extends the start/reset hooks with challenge counters/spawn while preserving the simulation reset.

- [ ] **Step 5: Verify and commit**

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts src/lib/games/gravity-flip/scoring.test.ts
bun run typecheck
git add src/lib/games/gravity-flip/GravityFlipGame.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
git commit -m "feat(gravity-flip): add gravity motion"
```

---

### Task 3: Add discriminated catalog scheduling, safe movers, stars, and collision

**Files:**
- Modify: `src/lib/games/gravity-flip/GravityFlipGame.ts`
- Modify: `src/lib/games/gravity-flip/GravityFlipGame.test.ts`
- Reuse unchanged: `src/lib/games/shared/utils.ts` (`clamp`, `lerp`, `rectOverlap`)

**Interfaces:**
- Consumes the one discriminated catalog, `elapsedSimSeconds`, mover-bound helper, and `gapRailTolerance` config.
- Produces first authored floor spike, distance-based random challenges, deterministic local IDs, safe mover bounce, star collection, and descriptor-driven collision without descriptor throws/null guards.

- [ ] **Step 1: Write RED catalog and mover-invariant tests**

Catalog closure:

```ts
it('has exactly one descriptor for all five kinds', () => {
    expect(Object.keys(GRAVITY_FLIP_HAZARD_CATALOG).sort()).toEqual([
        'ceiling-gap',
        'ceiling-spike',
        'floor-gap',
        'floor-spike',
        'mover',
    ])
})
```

Use production `rectOverlap` to test rail safety for **both default and larger player bodies**:

```ts
function expectRailsDisjointFromMover(config: GravityFlipConfig): void {
    const { minY, maxY } = getGravityFlipMoverBounds(config)
    const playerLeft = config.playerX - config.playerSize / 2
    const ceilingPlayer = {
        x: playerLeft,
        y: config.corridorInset,
        width: config.playerSize,
        height: config.playerSize,
    }
    const floorPlayer = {
        x: playerLeft,
        y: config.canvasHeight - config.corridorInset - config.playerSize,
        width: config.playerSize,
        height: config.playerSize,
    }
    const moverAtTop = {
        x: playerLeft,
        y: minY,
        width: config.moverSize,
        height: config.moverSize,
    }
    const moverAtBottom = { ...moverAtTop, y: maxY }

    expect(rectOverlap(ceilingPlayer, moverAtTop)).toBe(false)
    expect(rectOverlap(floorPlayer, moverAtBottom)).toBe(false)
}

it('keeps default rail-resting player disjoint from mover extrema', () => {
    const config = createGravityFlipConfig()
    expect(getGravityFlipMoverBounds(config)).toEqual({ minY: 64, maxY: 216 })
    expectRailsDisjointFromMover(config)
})

it('derives mover clearance from a larger player body', () => {
    const config = createGravityFlipConfig({ playerSize: 40 })
    expect(getGravityFlipMoverBounds(config)).toEqual({ minY: 76, maxY: 204 })
    expectRailsDisjointFromMover(config)
})
```

Also plan tests for:

```ts
it('fresh start authors floor-spike first with stable hazard-0 id')
it('waits the simulation-time interpolated spacing before the next spawn')
it('reads RNG exactly once per random challenge')
it('does not select mover before 15 simulated seconds')
it('can select mover after 15 simulated seconds')
it('puts a star on the opposite surface when the surface descriptor hasStar')
it('collects an overlapping star once')
it('floor/ceiling gaps only kill on their typed surface using configured tolerance')
it('mover clamps/reverses at both safe bounds')
it('overlapping lethal records still end once')
```

For mover-unlock tests, keep the player far outside challenge X (e.g. `playerX: -1000`) and drive simulated time through repeated `update()` calls; do not advance wall-clock time to unlock movers.

- [ ] **Step 2: Add private challenge counters and deterministic IDs**

Extend Task 2 fields:

```ts
private elapsedSimSeconds = 0
private distanceSinceChallenge = 0
private entitySequence = 0

private entityId(prefix: 'hazard' | 'star'): string {
    return `${prefix}-${this.entitySequence++}`
}
```

Update hooks:

```ts
protected onGameStart(): void {
    this.elapsedSimSeconds = 0
    this.distanceSinceChallenge = 0
    this.entitySequence = 0
    this.spawnChallenge('floor-spike')
    this.emitStateChange()
}

protected onGameReset(): void {
    this.elapsedSimSeconds = 0
    this.distanceSinceChallenge = 0
    this.entitySequence = 0
}
```

Do not add a challenge-count field.

- [ ] **Step 3: Implement spacing and eligible-kind selection from simulation time**

```ts
private currentChallengeSpacing(): number {
    const progress = clamp(
        this.elapsedSimSeconds / this.config.duration,
        0,
        1
    )
    return lerp(
        this.config.initialChallengeSpacing,
        this.config.finalChallengeSpacing,
        progress
    )
}

private eligibleKinds(): GravityFlipHazardKind[] {
    return (
        Object.entries(GRAVITY_FLIP_HAZARD_CATALOG) as Array<
            [GravityFlipHazardKind, GravityFlipHazardDescriptor]
        >
    )
        .filter(([, descriptor]) =>
            descriptor.shape !== 'mover' ||
            this.elapsedSimSeconds >= this.config.moverUnlockSeconds
        )
        .map(([kind]) => kind)
}

private pickChallengeKind(): GravityFlipHazardKind {
    const kinds = this.eligibleKinds()
    const sample = this.config.rng()
    const raw = Number.isFinite(sample) ? sample : 0
    const index = Math.min(
        kinds.length - 1,
        Math.max(0, Math.floor(raw * kinds.length))
    )
    return kinds[index]
}
```

After each substep's distance increment:

```ts
this.distanceSinceChallenge += this.state.worldSpeed * step
const spacing = this.currentChallengeSpacing()
if (this.distanceSinceChallenge >= spacing) {
    this.distanceSinceChallenge -= spacing
    this.spawnChallenge(this.pickChallengeKind())
}
```

One spawn check per substep is sufficient for production tuning because a 1/120s step travels only a few pixels while spacing remains hundreds of pixels.

- [ ] **Step 4: Implement descriptor-driven spawn with type narrowing**

```ts
private spawnChallenge(kind: GravityFlipHazardKind): void {
    const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[kind]
    switch (descriptor.shape) {
        case 'mover':
            this.spawnMover()
            return
        case 'spike':
        case 'gap': {
            const width =
                descriptor.shape === 'gap'
                    ? this.config.gapWidth
                    : this.config.spikeWidth
            const height =
                descriptor.shape === 'gap'
                    ? this.config.gapHeight
                    : this.config.spikeHeight
            const x = this.config.canvasWidth + this.config.spawnOffsetX
            const y =
                descriptor.surface === 'floor'
                    ? this.config.canvasHeight -
                      this.config.corridorInset -
                      height
                    : this.config.corridorInset

            this.state.hazards.push({
                id: this.entityId('hazard'),
                kind,
                x,
                y,
                width,
                height,
                verticalVelocity: 0,
            })

            if (descriptor.hasStar) {
                this.spawnOppositeSurfaceStar(
                    x + width / 2,
                    descriptor.surface
                )
            }
            return
        }
    }
}
```

There is no `surface === null` branch and no catalog-consistency throw: TypeScript guarantees a surface in spike/gap cases.

```ts
private spawnOppositeSurfaceStar(
    x: number,
    hazardSurface: 'floor' | 'ceiling'
): void {
    const halfPlayer = this.config.playerSize / 2
    const ceilingY = this.config.corridorInset + halfPlayer
    const floorY =
        this.config.canvasHeight - this.config.corridorInset - halfPlayer
    this.state.stars.push({
        id: this.entityId('star'),
        x,
        y: hazardSurface === 'floor' ? ceilingY : floorY,
        radius: this.config.starRadius,
    })
}
```

- [ ] **Step 5: Implement mover creation/bounce with one safe-bound helper**

```ts
private spawnMover(): void {
    const { minY, maxY } = getGravityFlipMoverBounds(this.config)
    this.state.hazards.push({
        id: this.entityId('hazard'),
        kind: 'mover',
        x: this.config.canvasWidth + this.config.spawnOffsetX,
        y: (minY + maxY) / 2,
        width: this.config.moverSize,
        height: this.config.moverSize,
        verticalVelocity: this.config.moverVerticalSpeed,
    })
}
```

Mover update:

```ts
const { minY, maxY } = getGravityFlipMoverBounds(this.config)
hazard.y += hazard.verticalVelocity * step
if (hazard.y <= minY) {
    hazard.y = minY
    hazard.verticalVelocity = Math.abs(hazard.verticalVelocity)
} else if (hazard.y >= maxY) {
    hazard.y = maxY
    hazard.verticalVelocity = -Math.abs(hazard.verticalVelocity)
}
```

All hazards move left by `worldSpeed * step` and are removed after `hazard.x + hazard.width < 0`.

- [ ] **Step 6: Implement discriminated collision and configured gap tolerance**

```ts
private hazardRect(hazard: GravityFlipHazard) {
    return {
        x: hazard.x,
        y: hazard.y,
        width: hazard.width,
        height: hazard.height,
    }
}

private collidesWithHazard(hazard: GravityFlipHazard): boolean {
    const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]
    switch (descriptor.shape) {
        case 'gap':
            return this.collidesWithGap(hazard, descriptor.surface)
        case 'spike':
        case 'mover':
            return rectOverlap(this.playerRect(), this.hazardRect(hazard))
    }
}
```

`collidesWithGap` receives a non-null typed surface:

```ts
private collidesWithGap(
    hazard: GravityFlipHazard,
    surface: 'floor' | 'ceiling'
): boolean {
    const player = this.playerRect()
    const overlapsX =
        player.x < hazard.x + hazard.width &&
        player.x + player.width > hazard.x
    if (!overlapsX) return false

    const half = this.state.player.size / 2
    const ceilingY = this.config.corridorInset + half
    const floorY =
        this.config.canvasHeight - this.config.corridorInset - half
    const targetY = surface === 'floor' ? floorY : ceilingY
    return (
        Math.abs(this.state.player.y - targetY) <=
        this.config.gapRailTolerance
    )
}
```

No null guard and no magic `0.5`.

Star collection:

```ts
const player = this.playerRect()
this.state.stars = this.state.stars.filter(star => {
    const starRect = {
        x: star.x - star.radius,
        y: star.y - star.radius,
        width: star.radius * 2,
        height: star.radius * 2,
    }
    if (rectOverlap(player, starRect)) {
        this.state.starsCollected += 1
        return false
    }
    return star.x + star.radius >= 0
})
```

On first lethal overlap:

```ts
this.state.outcome = 'collision'
this.syncScore()
void this.end()
return
```

- [ ] **Step 7: Integrate entity work into each physics substep in fixed order**

After simulation-time/player/distance advancement:

```ts
this.moveHazards(step)
this.moveStars(step)
this.collectStars()

for (const hazard of this.state.hazards) {
    if (this.collidesWithHazard(hazard)) {
        this.state.outcome = 'collision'
        this.syncScore()
        void this.end()
        return
    }
}

this.spawnIfSpacingReached(step)
```

`moveStars(step)` subtracts `worldSpeed * step` from X. `spawnIfSpacingReached()` uses `currentChallengeSpacing()` and `pickChallengeKind()` from Step 3. No renderer or second timer participates in simulation.

- [ ] **Step 8: Add the non-vacuous substep regression**

```ts
it('collides with an 8px spike that a single 0.1s endpoint check would skip', () => {
    const game = createGame({
        canvasWidth: 164,
        spawnOffsetX: 0,
        playerX: 150,
        spikeWidth: 8,
        initialWorldSpeed: 360,
        finalWorldSpeed: 360,
    })

    game.start()
    expect(game.getState().hazards[0]).toMatchObject({
        kind: 'floor-spike',
        x: 164,
        width: 8,
    })

    game.update(0.1)

    expect(game.getState().outcome).toBe('collision')
    expect(game.getState().isGameOver).toBe(true)
})
```

The player occupies X `[136,164]`; the spike begins `[164,172]` and a single 36px endpoint move would finish `[128,136]`. Cetus `rectOverlap` is exclusive, so both endpoints are non-overlapping while the swept path crosses the player. The 1/120-second checks must detect it.

- [ ] **Step 9: Verify and commit**

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts
bun run typecheck
git add src/lib/games/gravity-flip/GravityFlipGame.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
git commit -m "feat(gravity-flip): add safe challenge catalog"
```

---

### Task 4: Add the two-layer Pixi renderer

**Files:**
- Create: `src/lib/games/gravity-flip/GravityFlipRenderer.ts`
- Create: `src/lib/games/gravity-flip/GravityFlipRenderer.test.ts`
- Reuse unchanged: `src/lib/games/renderers/PixiJSRenderer.ts`

**Interfaces:**
- Consumes state and the discriminated `GRAVITY_FLIP_HAZARD_CATALOG`.
- Produces `GravityFlipRenderer` and `createGravityFlipRendererConfig()`.

- [ ] **Step 1: Write RED renderer tests**

Cover:

```ts
it('creates one corridor layer and one scene layer')
it('draws spike, gap, and mover by descriptor.shape')
it('draws floor and ceiling forms from narrowed descriptor.surface')
it('renders player and stars')
it('cleans graphics and Pixi app idempotently')
```

Use one state containing all five hazard kinds. Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipRenderer.test.ts
```

Expected: RED.

- [ ] **Step 2: Implement fixed renderer setup**

```ts
export function createGravityFlipRendererConfig(
    config: GravityFlipConfig
): PixiJSRendererConfig {
    return {
        type: 'canvas',
        container: '#gravity-flip-canvas',
        width: config.canvasWidth,
        height: config.canvasHeight,
        responsive: false,
        backgroundColor: 0x020817,
        antialias: true,
    }
}
```

`setup()` calls `super.setup()`, creates `corridorGraphic` and `sceneGraphic`, adds both to stage, then draws corridor/background once.

- [ ] **Step 3: Implement discriminated dynamic redraw without nullable surface**

```ts
for (const hazard of state.hazards) {
    const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[hazard.kind]
    switch (descriptor.shape) {
        case 'spike':
            this.drawSpike(hazard, descriptor.surface)
            break
        case 'gap':
            this.drawGap(hazard, descriptor.surface)
            break
        case 'mover':
            this.drawMover(hazard)
            break
    }
}
```

`drawSpike` and `drawGap` accept `'floor' | 'ceiling'`, not a nullable type. No `startsWith`, `endsWith`, regex, second shape table, or surface guard.

Render player as a neon diamond/arrow and stars as a small explicit polygon. No textures/assets.

- [ ] **Step 4: Cleanup, verify, commit**

Destroy both Graphics objects before `super.cleanup()`.

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipRenderer.test.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
bun run typecheck
git add src/lib/games/gravity-flip/GravityFlipRenderer.ts src/lib/games/gravity-flip/GravityFlipRenderer.test.ts
git commit -m "feat(gravity-flip): add pixi renderer"
```

---

### Task 5: Add current-pattern initializer, unload guard, input, result copy, and route

**Files:**
- Create: `src/lib/games/gravity-flip/initFramework.ts`
- Create: `src/lib/games/gravity-flip/initFramework.test.ts`
- Create: `src/pages/gravity-flip/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Reuse unchanged: `src/lib/games/core/errors.ts`
- Reuse unchanged: `src/lib/games/pattern-pulse/initFramework.ts`
- Reuse unchanged: `src/lib/games/evader/initFramework.ts`

**Interfaces:**
- Produces `initGravityFlipGameFramework()` and `{ game, renderer, getGame, getState, cleanup }`.
- Page assigns `window.gravityFlipGame`.

- [ ] **Step 1: Write RED initializer/input/presentation tests**

Cover:

```ts
it('reports missing root with DOMElementNotFoundError/handleGameError')
it('cleans renderer and returns undefined when renderer setup fails')
it('returns getGame() and getState()')
it('starts exactly one rAF update/render loop')
it('Space/ArrowUp/ArrowDown flip while active')
it('ignores repeat/modifier/editable keyboard targets')
it('ignores document shortcuts when event.target is a button')
it('focused flip button Space plus native click flips exactly once')
it('canvas pointerdown and #flip-btn click use flipGravity')
it('Reset restores floor/zero idle HUD')
it('collision shows GRAVITY LOST / Collision')
it('timeout shows RUN COMPLETE / Survived')
it('Play Again immediately starts a fresh run')
it('active run beforeunload prevents navigation and sets returnValue')
it('idle/ended run beforeunload does not block')
it('cleanup removes beforeunload/input listeners, cancels rAF, and is idempotent')
it('forwards achievement/challenge completion payloads')
```

For focused-button regression, bubble `keydown` from `#flip-btn`; verify document handling does not increment flips, then dispatch the native `click` and verify flips increase exactly once.

- [ ] **Step 2: Implement Pattern Pulse-style error/handle/listener shape**

```ts
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'

export interface GravityFlipInitResult {
    game: GravityFlipGame
    renderer: GravityFlipRenderer
    getGame: () => GravityFlipGame
    getState: () => ReturnType<GravityFlipGame['getState']>
    cleanup: () => void
}
```

Missing root:

```ts
const container = document.getElementById('gravity-flip-container')
if (!container) {
    handleGameError(
        new DOMElementNotFoundError('gravity-flip-container'),
        'GravityFlip'
    )
    return undefined
}
```

Renderer setup failure reports through `handleGameError`, destroys partial renderer state, and returns `undefined`. The initializer never assigns `window.gravityFlipGame`.

Use a small tracked-listener helper so keyboard, buttons, pointer, and beforeunload all clean up from one list.

- [ ] **Step 3: Add the Evader-style local rAF loop**

```ts
let frameId: number | null = null
let lastUpdateTime = Date.now()

const frame = () => {
    const now = Date.now()
    const deltaSeconds = Math.min((now - lastUpdateTime) / 1000, 0.1)
    lastUpdateTime = now
    const state = game.getState()
    if (state.isActive && !state.isPaused) game.update(deltaSeconds)
    renderer.render(game.getState())
    frameId = requestAnimationFrame(frame)
}
frameId = requestAnimationFrame(frame)
```

The initializer may use `Date.now()` to derive **frame delta** exactly as Evader does; the game never uses wall time for its difficulty ramp. Cleanup cancels rAF before game/renderer teardown.

- [ ] **Step 4: Add local editable/button keyboard filtering**

```ts
function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    )
}

const onKeyDown = (event: KeyboardEvent): void => {
    if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableTarget(event.target) ||
        event.target instanceof HTMLButtonElement
    ) {
        return
    }
    if (![' ', 'Spacebar', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    if (game.flipGravity()) event.preventDefault()
}
```

Attach to `document`; attach `click` on `#flip-btn` and `pointerdown` on the actual Pixi canvas to `game.flipGravity()`.

- [ ] **Step 5: Add active-run beforeunload guard through tracked listeners**

```ts
const beforeUnloadHandler: EventListener = event => {
    if (!game.getState().isActive) return
    event.preventDefault()
    ;(event as BeforeUnloadEvent).returnValue =
        'You have a game in progress. Are you sure you want to leave?'
}
listen(window, 'beforeunload', beforeUnloadHandler)
```

Do not add a second run-state flag; `game.getState().isActive` is authoritative.

- [ ] **Step 6: Implement distinct result copy and intentional Play Again**

```ts
function outcomeTitle(outcome: GravityFlipOutcome): string {
    return outcome === 'survived' ? 'RUN COMPLETE' : 'GRAVITY LOST'
}

function outcomeLabel(outcome: GravityFlipOutcome): string {
    return outcome === 'survived' ? 'Survived' : 'Collision'
}
```

End callback always writes `#game-over-title`, `#final-outcome`, score, distance, stars, and flips.

```ts
const playAgainHandler = (): void => {
    hideOverlay()
    // BaseGame.start() auto-resets a completed run and immediately starts it.
    // Do not change Play Again to reset-only: Gravity Flip expects the next
    // run to be active as soon as this button is pressed.
    game.start()
}
```

- [ ] **Step 7: Create Astro page and page-owned debug handle**

Use:

```astro
<GamePage
  gameId="gravity-flip"
  title="Gravity Flip"
  description="Flip gravity to dodge hazards and collect stars for 60 seconds."
  icon="🌗"
  initialTime={60}
  showPause={false}
  showEnd={false}
  showReset={true}
  overlayTitle="GRAVITY LOST"
>
```

Include all stable IDs from the spec. Scale only the canvas display:

```css
#gravity-flip-canvas :global(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  touch-action: manipulation;
}
```

Page-root script:

```ts
import { initGravityFlipGameFramework } from '@/lib/games/gravity-flip/initFramework'

document.addEventListener('DOMContentLoaded', () => {
    initGravityFlipGameFramework()
        .then(handle => {
            if (handle) {
                ;(
                    window as Window & { gravityFlipGame?: typeof handle }
                ).gravityFlipGame = handle
            }
        })
        .catch(error => {
            console.error('Gravity Flip failed to initialize', error)
        })
})
```

- [ ] **Step 8: Lock page markup, verify, commit**

Add Gravity Flip to `src/pages/game-board-markup.test.ts` games list and assert container/canvas/button IDs plus root-level initializer script.

```bash
bun run test:run src/lib/games/gravity-flip/initFramework.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run format:check
git add src/lib/games/gravity-flip/initFramework.ts src/lib/games/gravity-flip/initFramework.test.ts src/pages/gravity-flip/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(gravity-flip): add page and input wiring"
```

---

### Task 6: Register game, update catalog counts, achievements, browser lifecycle, tune, and run full gates

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify if tuning changes: `src/lib/games/gravity-flip/types.ts`
- Modify if tuning changes: affected Gravity Flip tests and `docs/superpowers/specs/2026-08-20-gravity-flip-design.md`
- Modify: `CLAUDE.md`
- Verify unchanged: `e2e/games/all-games-navigation.spec.ts`
- Verify unchanged: `src/lib/games/core/BaseGame.ts`
- Verify unchanged: `src/lib/games/core/GameTimer.ts`
- Verify unchanged: `src/lib/games/core/ScoreManager.ts`
- Verify unchanged: `src/lib/games/core/GameInitializer.ts`
- Verify unchanged: `src/lib/games/renderers/PixiJSRenderer.ts`
- Verify unchanged: `src/lib/services/scoreService.ts`
- Verify unchanged: `src/pages/api/`
- Verify unchanged: `src/lib/server/db/`

**Interfaces:** Completes HPA-73 without new infrastructure.

- [ ] **Step 1: Activate registry entry and update exact organism partition**

Add now that the route exists:

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

Replace the pre-registration test with an exact active-entry assertion and verify:

```ts
expect(getGameUrl(GameID.GRAVITY_FLIP)).toBe('/gravity-flip')
```

In `src/lib/organisms.test.ts`, update the exact partition assertion:

```ts
it('partitions games into 6 / 8 / 4 by depth', () => {
    expect(getGamesByDepth('shallow')).toHaveLength(6)
    expect(getGamesByDepth('mid')).toHaveLength(8)
    expect(getGamesByDepth('abyssal')).toHaveLength(4)
    // keep existing total/dedup and DEPTH_LABELS assertions
})
```

Run immediately:

```bash
bun run test:run src/lib/games.test.ts src/lib/organisms.test.ts
```

Expected: PASS. Do not defer the count break to coverage.

- [ ] **Step 2: Add shared game-data typing**

In `src/lib/games/shared/types.ts`:

```ts
export type GravityFlipGameData =
    import('../gravity-flip/types').GravityFlipGameData
```

Add it to `GameData` and import/include it in the achievement check union.

- [ ] **Step 3: Add four achievements; First Flip must require a real flip**

```ts
{
    id: 'gravity_flip_welcome',
    name: 'First Flip',
    description: 'Flip gravity for the first time.',
    logo: '🌗',
    gameId: GameID.GRAVITY_FLIP,
    condition: {
        type: 'in_game',
        check: (gameData: GravityFlipGameData) => gameData.flips >= 1,
    },
    rarity: AchievementRarity.COMMON,
},
{
    id: 'gravity_flip_star_catcher',
    name: 'Star Catcher',
    description: 'Collect 5 stars in one Gravity Flip run.',
    logo: '⭐',
    gameId: GameID.GRAVITY_FLIP,
    condition: {
        type: 'in_game',
        check: (gameData: GravityFlipGameData) => gameData.starsCollected >= 5,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'gravity_flip_dancer',
    name: 'Gravity Dancer',
    description: 'Flip gravity at least 20 times in one run.',
    logo: '🔄',
    gameId: GameID.GRAVITY_FLIP,
    condition: {
        type: 'in_game',
        check: (gameData: GravityFlipGameData) => gameData.flips >= 20,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'gravity_flip_full_orbit',
    name: 'Full Orbit',
    description: 'Survive the full Gravity Flip run.',
    logo: '🪐',
    gameId: GameID.GRAVITY_FLIP,
    condition: {
        type: 'in_game',
        check: (gameData: GravityFlipGameData) => gameData.survivedFullRun,
    },
    rarity: AchievementRarity.EPIC,
},
```

Lock the semantic regression:

```ts
expect(firstFlip.condition.check?.({
    distance: 1000,
    starsCollected: 0,
    flips: 0,
    survivedFullRun: false,
}, 200)).toBe(false)

expect(firstFlip.condition.check?.({
    distance: 0,
    starsCollected: 0,
    flips: 1,
    survivedFullRun: false,
}, 0)).toBe(true)
```

- [ ] **Step 4: Add one deterministic Playwright lose/re-arm journey only**

Do **not** exercise flip/focus behavior after Play Again; those assertions already belong to `initFramework.test.ts` and would race the authored spike.

```ts
test.describe('Gravity Flip', () => {
    test('loses to the authored spike and Play Again re-arms a fresh run', async ({
        page,
    }) => {
        await page.goto('/gravity-flip')
        await expectVisibleGameSurface(page, '#gravity-flip-canvas canvas')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')

        await startGameWhenReady(page)
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/,
            { timeout: 8000 }
        )
        await expect(page.locator('#game-over-title')).toHaveText('GRAVITY LOST')
        await expect(page.locator('#final-outcome')).toHaveText('Collision')

        await page.locator('#play-again-btn').click()
        await expect(page.locator('#start-btn')).toHaveCSS('display', 'none')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')

        await expect
            .poll(() =>
                page.evaluate(() =>
                    Boolean(
                        (
                            window as Window & {
                                gravityFlipGame?: {
                                    getGame(): {
                                        getState(): { isActive: boolean }
                                    }
                                }
                            }
                        ).gravityFlipGame?.getGame().getState().isActive
                    )
                )
            )
            .toBe(true)
    })
})
```

Survival copy, keyboard, focused-button, and pointer behavior stay in deterministic initializer tests.

- [ ] **Step 5: Run the manual-play tuning checkpoint before final gates**

Start the real app using the repository development flow and play the actual browser game. Record answers in the implementation PR description/checklist; no new document is required.

Answer all four questions:

1. **First-spike readability:** Can a first-time player understand and execute the required flip before the authored first spike arrives?
2. **Mid/late sequence fairness:** Around simulated `t≈40s`, is a representative `spike → mover → spike` sequence survivable without a forced collision?
3. **Full-run plausibility:** At final speed/spacing, is a 60-second survival realistically achievable, with stars optional rather than required?
4. **Rail safety feel:** Do mover extrema leave both rails visibly usable, matching the AABB invariant?

If any answer is no:

- adjust only balance-sensitive fields in `GRAVITY_FLIP_RULES`;
- update affected exact-value/unit tests and any copied tuning statement in the design doc;
- rerun focused game tests and the Playwright lose/re-arm journey;
- repeat this checkpoint until the four answers are acceptable.

Do not respond to balance issues by adding lives, shields, a level system, a new generator, or another framework.

- [ ] **Step 6: Update CLAUDE.md only for the new game**

Update game count/list, add Gravity Flip to game-specific notes, and preserve `window.gameNameGame.getGame()` guidance. Do not edit `AGENTS.md` separately.

- [ ] **Step 7: Run fresh targeted and repository gates**

Targeted first, explicitly including the catalog-count regression:

```bash
bun run test:run src/lib/games/gravity-flip src/lib/games.test.ts src/lib/organisms.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
```

Then:

```bash
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
bun run test:coverage
```

Expected: every command exits 0; remote Codecov project/patch checks meet 90% with threshold 0.

- [ ] **Step 8: Verify final scope**

Confirm source-unchanged:

```text
src/lib/games/core/BaseGame.ts
src/lib/games/core/GameTimer.ts
src/lib/games/core/ScoreManager.ts
src/lib/games/core/GameInitializer.ts
src/lib/games/renderers/PixiJSRenderer.ts
src/lib/services/scoreService.ts
src/pages/api/
src/lib/server/db/
e2e/games/all-games-navigation.spec.ts
```

Confirm there is no new package, migration, schema, shared physics/input/runner framework, Daily mode, seed system, or generic generator.

- [ ] **Step 9: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/organisms.test.ts src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts e2e/games/play-coverage.spec.ts CLAUDE.md
git add docs/superpowers/specs/2026-08-20-gravity-flip-design.md  # only if tuning changed it
git commit -m "feat(gravity-flip): register game and achievements"
```

## Plan Self-Review Checklist

- [ ] `src/lib/organisms.test.ts` is updated and included in the targeted run (`6 / 8 / 4`).
- [ ] Descriptor union makes spike/gap surface non-null by type; no catalog throw or null-surface guards remain.
- [ ] Selection/spawn/stars/collision/renderer use the one descriptor table; no kind-string parsing.
- [ ] Mover formula uses `max(playerSize, moverRailClearance)` in spec/code/plan.
- [ ] Rail tests cover default player size and `playerSize: 40`.
- [ ] `gapRailTolerance` is in rules/config and collision reads it.
- [ ] Ramp uses `elapsedSimSeconds` only; no `getTimerStatus().elapsedTime` in gameplay difficulty.
- [ ] BaseGame/GameTimer remains the sole run-duration authority.
- [ ] `emitStateChange()` is explicitly defined in Task 2.
- [ ] Initializer wires/removes active-run beforeunload guard.
- [ ] RNG is read exactly once per random challenge.
- [ ] Thin-hazard regression starts an 8px spike at X=164 and is endpoint-vacuous without substeps.
- [ ] First Flip checks `flips >= 1`, not score.
- [ ] Focused button keyboard is ignored by document keydown.
- [ ] Collision and survival presentation strings are both asserted.
- [ ] Initializer returns `getGame()` and page owns global assignment.
- [ ] Play Again calls `game.start()` with explanatory source comment.
- [ ] Playwright stops at lose → Play Again active re-arm; no live-window flip assertions.
- [ ] Manual-play checkpoint answers first-spike readability, t≈40s sequence fairness, full-run plausibility, and rail usability.
- [ ] Tuning defaults may change only through `GRAVITY_FLIP_RULES` + affected tests/spec before final gates.
- [ ] Unchanged DB path is `src/lib/server/db/`.
- [ ] One implementation PR only; no shared framework or backend expansion.
