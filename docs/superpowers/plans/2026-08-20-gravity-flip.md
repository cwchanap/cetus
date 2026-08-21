# Gravity Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gravity Flip, a one-minute one-button side-scrolling action game with continuous gravity physics, rising speed/density, a safe-by-construction five-kind challenge catalog, collectible stars, accessible desktop/mobile input, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `GravityFlipGame` extends `BaseGame` and owns fixed-X vertical physics, a closed game-local hazard catalog, distance-based challenge scheduling, collision/star collection, mover-safe bounds, and score synchronization. `GravityFlipRenderer` extends `PixiJSRenderer` with one static corridor layer and one redrawn dynamic scene layer. A custom initializer combines Pattern Pulse's current error/debug-handle contract with Evader's single-rAF loop; the game internally substeps physics to prevent tunneling. No shared runner/physics/input framework or backend change is required.

**Tech Stack:** Astro 5 + TypeScript 6, PixiJS 8.10, Tailwind CSS 4, existing BaseGame/PixiJSRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-20-gravity-flip-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- Deliver HPA-73 in **one implementation PR**; game, route, registration, achievements, and tests stay together.
- ID **`gravity_flip`**, route **`/gravity-flip`**, title **`Gravity Flip`**, icon **`🌗`**.
- Fixed v1 run: **60 seconds**, logical canvas **800×320**.
- Player/world rules: player X **150**, size **28**, corridor inset **36**, gravity **1800 px/s²**, vertical-speed cap **700 px/s**, internal physics step **1/120 s**.
- World speed ramps **220 → 360 px/s**; challenge spacing ramps **520 → 400 px**.
- Moving hazards unlock at **15 elapsed seconds**.
- Mover size is **40 px** and rail clearance is **28 px**; default mover top-left Y travel is exactly **64..216**.
- `GRAVITY_FLIP_RULES`, `GRAVITY_FLIP_HAZARD_CATALOG`, and `calculateGravityFlipScore()` are the only production sources for gameplay constants/catalog semantics/scoring.
- `flipGravity()` reverses gravity but **does not zero vertical velocity**.
- The first challenge is always a floor spike; later challenge selection uses injected `rng: () => number` only.
- Do not classify hazard kinds with `startsWith`, `endsWith`, regexes, or substring parsing.
- Spike/gap challenges place one star on the opposite safe surface; movers do not carry a star.
- A mover at either bounce extremum must not overlap a player resting on either rail.
- Gap collision is lethal only when player X overlaps the gap and the player is touching the gap's catalog surface.
- Spike/mover collision uses conservative AABBs; star pickup uses conservative diameter-AABB overlap; no pixel-perfect geometry.
- Frozen score: `floor(distancePx / 50) * 10 + starsCollected * 250`.
- BaseGame uses `timeBonus: false`; reuse BaseGame timer/save/run-guard/completed-run auto-reset.
- Terminal outcomes: `collision` and `survived`; timeout sets `survived` before delegating to BaseGame.
- Collision UI is **GRAVITY LOST / Collision**; survival UI is **RUN COMPLETE / Survived**.
- Submitted data: `distance`, `starsCollected`, `flips`, `survivedFullRun`.
- Keyboard: `Space`, `ArrowUp`, `ArrowDown`; ignore repeat, Ctrl/Meta/Alt, editable targets, and button targets.
- Canvas `pointerdown` and native `#flip-btn` click call the same `game.flipGravity()` API.
- `#flip-btn` native Enter/Space activation owns button-key input; document keydown must not also flip.
- `GravityFlipInitResult` includes `getGame()`; the Astro page, not `initFramework.ts`, assigns `window.gravityFlipGame`.
- Play Again intentionally hides the overlay and calls `game.start()` so BaseGame auto-resets **and starts** the completed run.
- Create `/gravity-flip` before activating the `GAMES` registry entry because `games.test.ts` verifies routes.
- `getGameUrl()` and `e2e/games/all-games-navigation.spec.ts` stay source-unchanged.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `PixiJSRenderer.ts`, `GameInitializer.ts`, score service, `src/lib/server/db/`, APIs, and auth remain production-unchanged.
- Edit `CLAUDE.md`, not the `AGENTS.md` symlink.
- Codecov project/patch targets are **90%** with **0%** threshold and missing-report failure.

## Load-Bearing Risks

- **Mover unfairness:** both resting rails must remain legal at both mover bounce extrema.
- **Stringly catalog drift:** selection, spawn, stars, collision, and rendering must consume the same closed descriptor table.
- **Thin-hazard tunneling:** the regression uses an injected 8px spike starting at player-right X=164; a single clamped endpoint check would miss it.
- **Frame-dependent score drift:** synchronize BaseGame score to the pure accumulated target instead of awarding rounded points per frame.
- **Focused-button double flip:** document keydown ignores button targets so native Space/Enter click is the only button activation.
- **Terminal-copy drift:** collision and survival titles/outcome strings are tested independently.
- **Debug/error fork:** use Pattern Pulse's `DOMElementNotFoundError` + `handleGameError` + `getGame()` handle shape; only the rAF loop comes from Evader.
- **Double end/save:** first collision delegates once to BaseGame and inactive state stops later substeps.

---

### Task 1: Define contracts, safe mover bounds, GameID/icon, and the scorer

**Files:**
- Modify: `src/lib/games.ts`
- Create: `src/lib/games/gravity-flip/types.ts`
- Create: `src/lib/games/gravity-flip/scoring.ts`
- Create: `src/lib/games/gravity-flip/scoring.test.ts`
- Test: `src/lib/games.test.ts`

**Interfaces:**
- Produces `GameID.GRAVITY_FLIP`, icon mapping, `GravityFlipHazardKind`, `GRAVITY_FLIP_RULES`, `GRAVITY_FLIP_HAZARD_CATALOG`, `GravityFlipConfig`, state/stats/data types, `createGravityFlipConfig()`, `getGravityFlipMoverBounds()`, and `calculateGravityFlipScore()`.
- The active `GAMES` record stays deferred until Task 5 creates the route.

- [ ] **Step 1: Add compile-safe GameID/icon without activating the route**

In `src/lib/games.ts` add:

```ts
GRAVITY_FLIP = 'gravity_flip',
```

and:

```ts
[GameID.GRAVITY_FLIP]: '🌗',
```

Add:

```ts
describe('Gravity Flip identifier', () => {
    it('reserves the id/icon before route registration', () => {
        expect(GameID.GRAVITY_FLIP).toBe('gravity_flip')
        expect(getGameIcon(GameID.GRAVITY_FLIP)).toBe('🌗')
        expect(getGameById(GameID.GRAVITY_FLIP)).toBeUndefined()
    })
})
```

Run `bun run test:run src/lib/games.test.ts`; expected PASS.

- [ ] **Step 2: Create rules, closed catalog, config, and state contracts**

Create `src/lib/games/gravity-flip/types.ts`:

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

export type GravityFlipHazardSurface = 'floor' | 'ceiling' | null
export type GravityFlipHazardShape = 'spike' | 'gap' | 'mover'

export interface GravityFlipHazardDescriptor {
    surface: GravityFlipHazardSurface
    shape: GravityFlipHazardShape
    hasStar: boolean
}

export const GRAVITY_FLIP_HAZARD_CATALOG: Readonly<
    Record<GravityFlipHazardKind, GravityFlipHazardDescriptor>
> = {
    'floor-spike': { surface: 'floor', shape: 'spike', hasStar: true },
    'ceiling-spike': { surface: 'ceiling', shape: 'spike', hasStar: true },
    'floor-gap': { surface: 'floor', shape: 'gap', hasStar: true },
    'ceiling-gap': { surface: 'ceiling', shape: 'gap', hasStar: true },
    mover: { surface: null, shape: 'mover', hasStar: false },
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
    moverSize: 40,
    moverVerticalSpeed: 180,
    moverRailClearance: 28,
    starRadius: 10,
} as const
```

`GravityFlipConfig` extends `BaseGameConfig` with every gameplay rule above plus `rng: () => number`. `createGravityFlipConfig()` maps every field from `GRAVITY_FLIP_RULES`, sets `achievementIntegration: true`, `pausable: false`, `resettable: true`, defaults `rng: Math.random`, and applies overrides last.

Define:

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

Mover bounds are one pure helper:

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

- [ ] **Step 3: Write RED scorer tests**

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

Run `bun run test:run src/lib/games/gravity-flip/scoring.test.ts`; expected RED because `scoring.ts` does not exist.

- [ ] **Step 4: Implement the single scorer**

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

Expected PASS / zero Astro-check errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/gravity-flip/types.ts src/lib/games/gravity-flip/scoring.ts src/lib/games/gravity-flip/scoring.test.ts
git commit -m "feat(gravity-flip): add contracts and scoring"
```

---

### Task 2: Implement BaseGame motion, substeps, and frame-stable score

**Files:**
- Create: `src/lib/games/gravity-flip/GravityFlipGame.ts`
- Create: `src/lib/games/gravity-flip/GravityFlipGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Produces `GravityFlipGame`, `flipGravity(): boolean`, `getConfig()`, player/distance/world-speed state, terminal `survived` handling, `playerRect()`, `syncScore()`, and the collision-safe substep loop. Task 3 fills the entity/challenge part of each substep.

- [ ] **Step 1: Write RED motion/score-partition tests**

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

With Vitest fake timers, cover:

```ts
it('starts floor-resting with downward gravity and zero velocity')
it('flipGravity reverses direction, increments flips, and preserves velocityY')
it('rejects flips before start and after end')
it('clamps player to the floor/ceiling rails')
it('ramps world speed from 220 toward 360 from BaseGame elapsed time')
it('produces the same score for 10x0.01s and 1x0.1s distance updates')
it('timeout marks survived before BaseGame end')
```

Run `bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts`; expected RED.

- [ ] **Step 2: Implement the BaseGame shell and flip contract**

Constructor:

```ts
super(GameID.GRAVITY_FLIP, config, callbacks, {
    basePoints: 0,
    timeBonus: false,
})
```

Initial player:

```ts
const half = this.config.playerSize / 2
const floorY =
    this.config.canvasHeight - this.config.corridorInset - half
```

Initial state has downward gravity, `velocityY: 0`, empty hazards/stars, zero distance/stars/flips, and initial world speed.

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

- [ ] **Step 3: Implement frame update and player physics**

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

For each step:

```ts
const elapsed = this.getTimerStatus().elapsedTime
const progress = clamp(elapsed / this.config.duration, 0, 1)
this.state.worldSpeed = lerp(
    this.config.initialWorldSpeed,
    this.config.finalWorldSpeed,
    progress
)

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

Clamp player center to `corridorInset + half` / `canvasHeight - corridorInset - half`; zero vertical velocity on rail contact. Then add `worldSpeed * step` to distance. Task 3 extends the same `stepPhysics()` after distance advancement with entity updates/collision/spawn.

- [ ] **Step 4: Add rectangle/score helpers and terminal data**

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

`getGameStats()` returns final score/time plus `outcome`, floored distance, stars, and flips. `getGameData()` returns the four submitted fields as `Record<string, unknown>`.

```ts
protected handleTimeUp(): void {
    this.state.outcome = 'survived'
    super.handleTimeUp()
}
```

`render()` is a no-op; `cleanup()` clears transient arrays/private counters once Task 3 adds them.

- [ ] **Step 5: Verify and commit**

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts src/lib/games/gravity-flip/scoring.test.ts
bun run typecheck
git add src/lib/games/gravity-flip/GravityFlipGame.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
git commit -m "feat(gravity-flip): add gravity motion"
```

---

### Task 3: Add descriptor-driven scheduling, safe movers, stars, and collision

**Files:**
- Modify: `src/lib/games/gravity-flip/GravityFlipGame.ts`
- Modify: `src/lib/games/gravity-flip/GravityFlipGame.test.ts`
- Reuse unchanged: `src/lib/games/shared/utils.ts` (`clamp`, `lerp`, `rectOverlap`)

**Interfaces:**
- Consumes the one catalog and mover-bound helper.
- Produces first authored floor spike, distance-based random challenges, deterministic local IDs, safe mover bounce, star collection, and descriptor-driven collision.

- [ ] **Step 1: Write RED catalog/safety/scheduling tests**

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

Use production `rectOverlap` to lock mover rail safety:

```ts
it('keeps rail-resting player disjoint from mover at both extrema', () => {
    const config = createGravityFlipConfig()
    const { minY, maxY } = getGravityFlipMoverBounds(config)
    expect({ minY, maxY }).toEqual({ minY: 64, maxY: 216 })

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
})
```

Also cover:

```ts
it('fresh start authors floor-spike first with stable hazard-0 id')
it('waits the interpolated spacing before the next spawn')
it('reads RNG exactly once per random challenge')
it('does not select mover before 15 seconds')
it('can select mover after 15 seconds')
it('puts a star on the opposite surface only when hasStar is true')
it('collects an overlapping star once')
it('floor/ceiling gaps only kill on their descriptor surface')
it('mover clamps/reverses at both safe bounds')
it('overlapping lethal records still end once')
```

- [ ] **Step 2: Add only the private runtime counters actually needed**

```ts
private distanceSinceChallenge = 0
private entitySequence = 0

private entityId(prefix: 'hazard' | 'star'): string {
    return `${prefix}-${this.entitySequence++}`
}

protected onGameStart(): void {
    this.distanceSinceChallenge = 0
    this.entitySequence = 0
    this.spawnChallenge('floor-spike')
    this.emitStateChange()
}

protected onGameReset(): void {
    this.distanceSinceChallenge = 0
    this.entitySequence = 0
}
```

Do not add a challenge-count field; it has no product/runtime use.

- [ ] **Step 3: Implement spacing and eligible-kind selection from the one catalog**

```ts
private currentChallengeSpacing(elapsedSeconds: number): number {
    const progress = clamp(elapsedSeconds / this.config.duration, 0, 1)
    return lerp(
        this.config.initialChallengeSpacing,
        this.config.finalChallengeSpacing,
        progress
    )
}

private eligibleKinds(elapsedSeconds: number): GravityFlipHazardKind[] {
    return (
        Object.entries(GRAVITY_FLIP_HAZARD_CATALOG) as Array<
            [GravityFlipHazardKind, GravityFlipHazardDescriptor]
        >
    )
        .filter(([, descriptor]) =>
            descriptor.shape !== 'mover' ||
            elapsedSeconds >= this.config.moverUnlockSeconds
        )
        .map(([kind]) => kind)
}

private pickChallengeKind(elapsedSeconds: number): GravityFlipHazardKind {
    const kinds = this.eligibleKinds(elapsedSeconds)
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
const spacing = this.currentChallengeSpacing(elapsedSeconds)
if (this.distanceSinceChallenge >= spacing) {
    this.distanceSinceChallenge -= spacing
    this.spawnChallenge(this.pickChallengeKind(elapsedSeconds))
}
```

At 1/120s the travel per step is only a few pixels while spacing is at least 400px, so one spawn check per step is sufficient.

- [ ] **Step 4: Implement one descriptor-driven spawn path**

```ts
private spawnChallenge(kind: GravityFlipHazardKind): void {
    const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[kind]
    if (descriptor.shape === 'mover') {
        this.spawnMover()
        return
    }
    if (descriptor.surface === null) {
        throw new Error(`Non-mover hazard ${kind} must have a surface`)
    }

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
            ? this.config.canvasHeight - this.config.corridorInset - height
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
        this.spawnOppositeSurfaceStar(x + width / 2, descriptor.surface)
    }
}
```

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

- [ ] **Step 5: Implement mover creation and safe bounce bounds**

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

Each substep moves every hazard left by `worldSpeed * step`. Movers additionally update Y and clamp/reverse:

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

Remove a hazard after `hazard.x + hazard.width < 0`.

- [ ] **Step 6: Implement catalog-driven collision and star pickup**

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

For a gap, return false on null surface, require horizontal AABB overlap, then compare the player's center to the matching resting rail center within a 0.5px tolerance.

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

The substep loop stops because BaseGame synchronously sets `isActive=false` before awaiting score save.

- [ ] **Step 7: Integrate Task 3 into each physics substep**

After player/world distance movement, the remainder of `stepPhysics(step)` is:

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

this.spawnIfSpacingReached(elapsedSeconds, step)
```

`moveStars(step)` subtracts `worldSpeed * step` from X. `spawnIfSpacingReached()` contains the accumulator/spacing code from Step 3. No renderer or second timer participates in simulation.

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

The player occupies X `[136,164]`; the spike starts `[164,172]` and a single 36px endpoint move would finish `[128,136]`. Cetus `rectOverlap` is exclusive, so both endpoints are non-overlapping while the swept path crosses the player. The 1/120-second checks must detect it.

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
- Consumes state and `GRAVITY_FLIP_HAZARD_CATALOG`.
- Produces `GravityFlipRenderer` and `createGravityFlipRendererConfig()`.

- [ ] **Step 1: Write RED renderer tests**

Cover:

```ts
it('creates one corridor layer and one scene layer')
it('draws spike, gap, and mover by descriptor.shape')
it('draws floor and ceiling forms from descriptor.surface')
it('renders player and stars')
it('cleans graphics and Pixi app idempotently')
```

Use one test state containing all five kinds. Run `bun run test:run src/lib/games/gravity-flip/GravityFlipRenderer.test.ts`; expected RED.

- [ ] **Step 2: Implement fixed renderer config/setup**

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

`setup()` calls `super.setup()`, creates `corridorGraphic` and `sceneGraphic`, adds both to the stage, then draws corridor/background once.

- [ ] **Step 3: Implement descriptor-shape dynamic redraw**

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

No `startsWith`, `endsWith`, regex, or second shape table. Render player as a neon diamond/arrow and stars as an explicit small polygon. No textures/assets.

- [ ] **Step 4: Cleanup, verify, commit**

Destroy both Graphics objects before `super.cleanup()`.

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipRenderer.test.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
bun run typecheck
git add src/lib/games/gravity-flip/GravityFlipRenderer.ts src/lib/games/gravity-flip/GravityFlipRenderer.test.ts
git commit -m "feat(gravity-flip): add pixi renderer"
```

---

### Task 5: Add current-pattern initializer, input, result copy, and route

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

- [ ] **Step 1: Write RED initializer tests**

Cover:

```ts
it('reports missing root with DOMElementNotFoundError/handleGameError')
it('cleans renderer and returns undefined when renderer setup fails')
it('returns getGame() and getState()')
it('starts exactly one rAF update/render loop')
it('Space/ArrowUp/ArrowDown flip while active')
it('ignores repeat/modifier/editable keyboard targets')
it('ignores document shortcuts when event.target is a button')
it('canvas pointerdown and #flip-btn click use flipGravity')
it('Reset restores floor/zero idle HUD')
it('collision shows GRAVITY LOST / Collision')
it('timeout shows RUN COMPLETE / Survived')
it('Play Again immediately starts a fresh run')
it('cleanup is listener/rAF/resource idempotent')
it('forwards achievement/challenge completion payloads')
```

Focused-button regression: bubble Space keydown from `#flip-btn`; flips stay unchanged from document handling. Dispatch button click; flips increase exactly once.

- [ ] **Step 2: Implement Pattern Pulse-style error/handle shape**

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

Cleanup cancels the frame before game/renderer teardown.

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

Attach this to `document`; attach `click` on `#flip-btn` and `pointerdown` on the actual Pixi canvas to `game.flipGravity()`.

- [ ] **Step 5: Implement distinct result copy and intentional Play Again**

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

- [ ] **Step 6: Create the Astro page and page-owned debug handle**

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

Use all stable IDs from the spec. CSS scales only the rendered canvas:

```css
#gravity-flip-canvas :global(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  touch-action: manipulation;
}
```

Root script:

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

- [ ] **Step 7: Lock page markup and verify**

Add Gravity Flip to `src/pages/game-board-markup.test.ts`'s games list and assert container/canvas/button IDs plus root-level initializer script.

```bash
bun run test:run src/lib/games/gravity-flip/initFramework.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run format:check
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/games/gravity-flip/initFramework.ts src/lib/games/gravity-flip/initFramework.test.ts src/pages/gravity-flip/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(gravity-flip): add page and input wiring"
```

---

### Task 6: Register game, achievements, browser journey, docs, and full gates

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `e2e/games/play-coverage.spec.ts`
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

- [ ] **Step 1: Activate the registry entry now that the route exists**

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

Replace the pre-registration test with an exact active-entry assertion; verify `getGameUrl(GameID.GRAVITY_FLIP) === '/gravity-flip'`.

- [ ] **Step 2: Add shared game-data typing**

```ts
export type GravityFlipGameData =
    import('../gravity-flip/types').GravityFlipGameData
```

Add it to `GameData` and the achievement check union.

- [ ] **Step 3: Add four achievements; First Flip must inspect flips**

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

Regression assertions:

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

- [ ] **Step 4: Add one deterministic Playwright lose/restart/input journey**

```ts
test.describe('Gravity Flip', () => {
    test('loses to the authored spike, restarts, and flips once per input', async ({
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

        await page.locator('#flip-btn').click()
        await expect(page.locator('#gravity-direction')).toHaveText('CEILING ↑')

        await page.evaluate(() => {
            const active = document.activeElement
            if (active instanceof HTMLElement) active.blur()
        })
        await page.keyboard.press('Space')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')
    })
})
```

Survival copy stays in deterministic initializer tests; do not add a 60-second E2E wait.

- [ ] **Step 5: Update CLAUDE.md only for the new game**

Update game count/list, add Gravity Flip to the game-specific notes, and preserve `window.gameNameGame.getGame()` guidance. Do not edit `AGENTS.md` separately.

- [ ] **Step 6: Run fresh repository gates**

```bash
bun run test:run src/lib/games/gravity-flip src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
bun run test:coverage
```

Expected: all commands exit 0; remote Codecov project and patch checks meet 90% / threshold 0.

- [ ] **Step 7: Verify final scope**

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

No package, migration, schema, shared physics/input/runner framework, Daily mode, seed system, or generic generator should appear.

- [ ] **Step 8: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts e2e/games/play-coverage.spec.ts CLAUDE.md
git commit -m "feat(gravity-flip): register game and achievements"
```

## Plan Self-Review Checklist

- [ ] Every hazard kind has exactly one descriptor row.
- [ ] Selection/spawn/stars/collision/renderer use that descriptor table; no kind-string parsing.
- [ ] Default mover bounds are 64..216 and rail AABBs are disjoint at extrema.
- [ ] Only `distanceSinceChallenge` and resettable `entitySequence` are kept as private generation counters.
- [ ] RNG is read exactly once per random challenge.
- [ ] Thin-hazard regression starts an 8px spike at X=164 and is endpoint-vacuous without substeps.
- [ ] First Flip checks `flips >= 1`, not score.
- [ ] Focused button keyboard is ignored by document keydown.
- [ ] Collision and survival presentation strings are both asserted.
- [ ] Initializer returns `getGame()` and page owns global assignment.
- [ ] Play Again calls `game.start()` and has the explanatory source comment.
- [ ] Unchanged DB path is `src/lib/server/db/`.
- [ ] One implementation PR only; no shared framework or backend expansion.