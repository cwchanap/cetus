# Gravity Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gravity Flip, a one-minute one-button side-scrolling action game with continuous gravity physics, rising speed/density, spikes/gaps/moving hazards, collectible stars, accessible desktop/mobile input, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `GravityFlipGame` extends `BaseGame` and owns fixed-X vertical player physics, a tiny private challenge stream, collision/star collection, and score synchronization. `GravityFlipRenderer` extends `PixiJSRenderer` with one static corridor layer and one redrawn dynamic scene layer. A custom initializer follows Evader's existing single-rAF pattern; the game internally substeps physics to avoid tunneling. No shared runner/physics framework or backend change is required.

**Tech Stack:** Astro 5 + TypeScript 6, PixiJS 8.10, Tailwind CSS 4, existing BaseGame/PixiJSRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-20-gravity-flip-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- Deliver HPA-73 in **one implementation PR**; game, registration, achievements, page, and tests stay together.
- ID **`gravity_flip`**, route **`/gravity-flip`**, title **`Gravity Flip`**, icon **`🌗`**.
- Fixed v1 run: **60 seconds**, logical canvas **800×320**.
- Fixed player/world rules: player X **150**, size **28**, corridor inset **36**, gravity **1800 px/s²**, vertical-speed cap **700 px/s**, internal physics step **1/120 s**.
- World speed ramps **220 → 360 px/s** over the run; challenge spacing ramps **520 → 400 px**.
- Moving hazards do not enter the random catalog before **15 elapsed seconds**.
- `GRAVITY_FLIP_RULES` / `createGravityFlipConfig()` are the single production source for gameplay constants.
- `flipGravity()` reverses gravity but **does not zero vertical velocity**.
- The first challenge is always a floor spike; later challenges use injected `rng: () => number`.
- One challenge family per spacing interval; no compound random maze/grammar.
- Floor/ceiling spike and gap challenges place one star on the opposite safe surface; movers do not require a star.
- Gap collision is lethal only while the player overlaps the gap X-range and is touching that same surface.
- Spike/mover collision uses conservative AABBs; do not add pixel-perfect geometry.
- Frozen score: `floor(distancePx / 50) * 10 + starsCollected * 250`.
- `calculateGravityFlipScore()` is the only production implementation of that score formula.
- BaseGame uses `timeBonus: false`.
- Terminal outcomes are `collision` and `survived`; timeout sets `survived` before delegating to BaseGame.
- Submitted data is `distance`, `starsCollected`, `flips`, `survivedFullRun`.
- Use existing BaseGame timer/save/run-guard/achievement flow; no second timer or stale-run token.
- Use `BaseGame + PixiJSRenderer`; no shared runner engine, physics engine, generic spawner, level editor, image assets, persistence, Daily mode, schema/API/leaderboard change, audio, or haptics.
- Renderer keeps fixed logical coordinates; page CSS scales the canvas visually for mobile.
- Keyboard controls: `Space`, `ArrowUp`, `ArrowDown`; ignore repeat, modifier chords, and editable targets.
- Pointer-down on the canvas and native `#flip-btn` both call `game.flipGravity()`.
- Create `/gravity-flip` before adding the active `GAMES` registry record because `games.test.ts` verifies every registered route exists.
- `getGameUrl()` stays unchanged.
- `e2e/games/all-games-navigation.spec.ts` stays source-unchanged and derives coverage from `GAMES`.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `PixiJSRenderer.ts`, `GameInitializer.ts`, score service, database, APIs, and auth remain production-unchanged.
- Edit `CLAUDE.md`, not the repository's `AGENTS.md` symlink.
- Codecov project and patch targets are **90%**, threshold **0%**, blocking on missing reports.

## Load-Bearing Risks

- **Thin-hazard tunneling:** the game, not the initializer, owns 1/120-second collision substeps.
- **Frame-dependent score drift:** synchronize BaseGame score from accumulated distance/stars instead of awarding rounded points per frame.
- **Double end/save:** the first collision sets outcome and delegates to BaseGame; inactive runs reject later updates/collisions.
- **Random impossible patterns:** spawn one challenge family at a time; stars are optional and always placed on the opposite safe surface.
- **Browser smoke flakiness:** the first floor spike is deterministic and requires no RNG/test-only mode.
- **Mobile coordinate drift:** pointer input has no gameplay coordinates; fixed logical physics is CSS-scaled.

---

### Task 1: Add contracts, GameID/icon, and the single production scorer

**Files:**
- Modify: `src/lib/games.ts`
- Create: `src/lib/games/gravity-flip/types.ts`
- Create: `src/lib/games/gravity-flip/scoring.ts`
- Create: `src/lib/games/gravity-flip/scoring.test.ts`
- Test: `src/lib/games.test.ts`

**Interfaces:**
- Produces: `GameID.GRAVITY_FLIP`, the `🌗` icon mapping, `GRAVITY_FLIP_RULES`, `GravityFlipConfig`, state/entity/stats/data types, `createGravityFlipConfig()`, and `calculateGravityFlipScore()`.
- The active `GAMES` record is deliberately deferred until Task 5 creates the route.

- [ ] **Step 1: Add the compile-safe GameID/icon seam without registering an active game**

In `src/lib/games.ts`, add:

```ts
export enum GameID {
    // existing members...
    PATTERN_PULSE = 'pattern_pulse',
    GRAVITY_FLIP = 'gravity_flip',
}
```

and add the exhaustive icon-map entry:

```ts
[GameID.GRAVITY_FLIP]: '🌗',
```

Do **not** add a `GAMES` record yet; the route-invariant test would correctly fail before Task 5 creates `/gravity-flip`.

Add a narrow pre-registration test to `src/lib/games.test.ts`:

```ts
describe('Gravity Flip identifier', () => {
    it('reserves the game id and icon before route registration', () => {
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

Expected: PASS with Gravity Flip still absent from `GAMES`.

- [ ] **Step 2: Create the Gravity Flip contracts and production-rule source**

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
    starRadius: 10,
} as const

export interface GravityFlipConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    corridorInset: number
    playerX: number
    playerSize: number
    gravityAcceleration: number
    maxVerticalSpeed: number
    maxPhysicsStep: number
    initialWorldSpeed: number
    finalWorldSpeed: number
    initialChallengeSpacing: number
    finalChallengeSpacing: number
    moverUnlockSeconds: number
    spawnOffsetX: number
    spikeWidth: number
    spikeHeight: number
    gapWidth: number
    gapHeight: number
    moverSize: number
    moverVerticalSpeed: number
    starRadius: number
    rng: () => number
}

export function createGravityFlipConfig(
    overrides: Partial<GravityFlipConfig> = {}
): GravityFlipConfig {
    return {
        duration: GRAVITY_FLIP_RULES.duration,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        canvasWidth: GRAVITY_FLIP_RULES.canvasWidth,
        canvasHeight: GRAVITY_FLIP_RULES.canvasHeight,
        corridorInset: GRAVITY_FLIP_RULES.corridorInset,
        playerX: GRAVITY_FLIP_RULES.playerX,
        playerSize: GRAVITY_FLIP_RULES.playerSize,
        gravityAcceleration: GRAVITY_FLIP_RULES.gravityAcceleration,
        maxVerticalSpeed: GRAVITY_FLIP_RULES.maxVerticalSpeed,
        maxPhysicsStep: GRAVITY_FLIP_RULES.maxPhysicsStep,
        initialWorldSpeed: GRAVITY_FLIP_RULES.initialWorldSpeed,
        finalWorldSpeed: GRAVITY_FLIP_RULES.finalWorldSpeed,
        initialChallengeSpacing: GRAVITY_FLIP_RULES.initialChallengeSpacing,
        finalChallengeSpacing: GRAVITY_FLIP_RULES.finalChallengeSpacing,
        moverUnlockSeconds: GRAVITY_FLIP_RULES.moverUnlockSeconds,
        spawnOffsetX: GRAVITY_FLIP_RULES.spawnOffsetX,
        spikeWidth: GRAVITY_FLIP_RULES.spikeWidth,
        spikeHeight: GRAVITY_FLIP_RULES.spikeHeight,
        gapWidth: GRAVITY_FLIP_RULES.gapWidth,
        gapHeight: GRAVITY_FLIP_RULES.gapHeight,
        moverSize: GRAVITY_FLIP_RULES.moverSize,
        moverVerticalSpeed: GRAVITY_FLIP_RULES.moverVerticalSpeed,
        starRadius: GRAVITY_FLIP_RULES.starRadius,
        rng: Math.random,
        ...overrides,
    }
}

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

- [ ] **Step 3: Write RED scoring tests**

Create `src/lib/games/gravity-flip/scoring.test.ts`:

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
        [{ distancePx: 17000, starsCollected: 8 }, 5400],
    ])('scores %o as %i', (input, expected) => {
        expect(calculateGravityFlipScore(input)).toBe(expected)
    })

    it('clamps negative/non-finite progress to zero', () => {
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

Expected: FAIL because `scoring.ts` does not exist.

- [ ] **Step 4: Implement the scorer**

Create `src/lib/games/gravity-flip/scoring.ts`:

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
    const distancePoints = Math.floor(safeDistance / 50) * 10
    return distancePoints + safeStars * 250
}
```

Run:

```bash
bun run test:run src/lib/games/gravity-flip/scoring.test.ts src/lib/games.test.ts
bun run typecheck
```

Expected: PASS / zero Astro-check errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/gravity-flip/types.ts src/lib/games/gravity-flip/scoring.ts src/lib/games/gravity-flip/scoring.test.ts
git commit -m "feat(gravity-flip): add contracts and scoring"
```

---

### Task 2: Implement BaseGame gravity motion, difficulty ramp, and frame-stable score

**Files:**
- Create: `src/lib/games/gravity-flip/GravityFlipGame.ts`
- Create: `src/lib/games/gravity-flip/GravityFlipGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Consumes Task 1 config/types/scorer and `GameID.GRAVITY_FLIP`.
- Produces `GravityFlipGame`, `flipGravity(): boolean`, `getConfig()`, gravity/player/distance/world-speed state, terminal `survived` handling, stats/data, and internal collision-safe substeps.
- Task 3 adds hazards/stars without changing these public APIs.

- [ ] **Step 1: Write RED motion/flip tests**

Create `src/lib/games/gravity-flip/GravityFlipGame.test.ts` with fake timers so BaseGame time progression is real:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GravityFlipGame } from './GravityFlipGame'
import { createGravityFlipConfig } from './types'

function createGame() {
    return new GravityFlipGame(
        createGravityFlipConfig({ achievementIntegration: false, rng: () => 0 })
    )
}

describe('GravityFlipGame motion', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-20T00:00:00Z'))
    })

    afterEach(() => vi.useRealTimers())

    it('starts on the floor with downward gravity', () => {
        const game = createGame()
        const state = game.getState()
        expect(state.gravity).toBe('down')
        expect(state.player.x).toBe(150)
        expect(state.player.velocityY).toBe(0)
        expect(state.player.y).toBeCloseTo(320 - 36 - 14)
    })

    it('rejects idle flips and preserves velocity across an active flip', () => {
        const game = createGame()
        expect(game.flipGravity()).toBe(false)
        game.start()
        game.update(0.1)
        const before = game.getState().player.velocityY
        expect(game.flipGravity()).toBe(true)
        const after = game.getState()
        expect(after.gravity).toBe('up')
        expect(after.flips).toBe(1)
        expect(after.player.velocityY).toBe(before)
    })

    it('produces the same distance score for equivalent frame partitions', () => {
        const a = createGame()
        const b = createGame()
        a.start()
        b.start()
        a.update(0.1)
        for (let i = 0; i < 10; i++) b.update(0.01)
        expect(a.getState().distance).toBeCloseTo(b.getState().distance, 5)
        expect(a.getState().score).toBe(b.getState().score)
    })
})
```

Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts
```

Expected: FAIL because `GravityFlipGame.ts` does not exist.

- [ ] **Step 2: Implement the BaseGame shell and state**

Create `GravityFlipGame.ts` with this class shape:

```ts
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import { clamp } from '@/lib/games/shared/utils'
import { calculateGravityFlipScore } from './scoring'
import {
    createGravityFlipConfig,
    type GravityFlipConfig,
    type GravityFlipState,
    type GravityFlipStats,
} from './types'

export class GravityFlipGame extends BaseGame<
    GravityFlipState,
    GravityFlipConfig,
    GravityFlipStats
> {
    constructor(
        config: GravityFlipConfig = createGravityFlipConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.GRAVITY_FLIP, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): GravityFlipState {
        const floorY =
            this.config.canvasHeight -
            this.config.corridorInset -
            this.config.playerSize / 2
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            gravity: 'down',
            player: {
                x: this.config.playerX,
                y: floorY,
                velocityY: 0,
                size: this.config.playerSize,
            },
            hazards: [],
            stars: [],
            distance: 0,
            starsCollected: 0,
            flips: 0,
            worldSpeed: this.config.initialWorldSpeed,
        }
    }

    render(): void {}
    cleanup(): void {}

    getConfig(): GravityFlipConfig {
        return { ...this.config }
    }
}
```

- [ ] **Step 3: Implement flip input and internal substeps**

Add:

```ts
flipGravity(): boolean {
    if (!this.state.isActive || this.state.isPaused || this.state.isGameOver) {
        return false
    }
    this.state.gravity = this.state.gravity === 'down' ? 'up' : 'down'
    this.state.flips++
    this.emitStateChange()
    return true
}

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
        this.stepPlayer(step)
        const moved = this.state.worldSpeed * step
        this.state.distance += moved
        remaining -= step
    }
    this.syncDifficulty()
    this.syncScore()
    this.emitStateChange()
}
```

Player integration:

```ts
private stepPlayer(step: number): void {
    const direction = this.state.gravity === 'down' ? 1 : -1
    this.state.player.velocityY = clamp(
        this.state.player.velocityY +
            direction * this.config.gravityAcceleration * step,
        -this.config.maxVerticalSpeed,
        this.config.maxVerticalSpeed
    )
    this.state.player.y += this.state.player.velocityY * step

    const half = this.state.player.size / 2
    const ceilingY = this.config.corridorInset + half
    const floorY = this.config.canvasHeight - this.config.corridorInset - half
    if (this.state.player.y <= ceilingY) {
        this.state.player.y = ceilingY
        this.state.player.velocityY = 0
    } else if (this.state.player.y >= floorY) {
        this.state.player.y = floorY
        this.state.player.velocityY = 0
    }
}
```

Difficulty/score synchronization:

```ts
private elapsedSeconds(): number {
    return Math.max(0, this.config.duration - this.state.timeRemaining)
}

private progress(): number {
    return clamp(this.elapsedSeconds() / this.config.duration, 0, 1)
}

private syncDifficulty(): void {
    const p = this.progress()
    this.state.worldSpeed =
        this.config.initialWorldSpeed +
        (this.config.finalWorldSpeed - this.config.initialWorldSpeed) * p
}

private syncScore(): void {
    const target = calculateGravityFlipScore({
        distancePx: this.state.distance,
        starsCollected: this.state.starsCollected,
    })
    if (target > this.state.score) {
        this.addScore(target - this.state.score, 'gravity_flip_progress')
    }
}
```

- [ ] **Step 4: Add survival/stats/data lifecycle and regression tests**

Add to the class:

```ts
protected handleTimeUp(): void {
    if (this.state.isActive) {
        this.state.outcome = 'survived'
        this.syncScore()
    }
    super.handleTimeUp()
}

getGameStats(): GravityFlipStats {
    return {
        finalScore: this.state.score,
        timeElapsed: Math.max(
            0,
            this.config.duration - this.state.timeRemaining
        ),
        gameCompleted: this.state.isGameOver,
        outcome: this.state.outcome,
        distance: Math.floor(this.state.distance),
        starsCollected: this.state.starsCollected,
        flips: this.state.flips,
    }
}

protected getGameData(): Record<string, unknown> {
    return {
        distance: Math.floor(this.state.distance),
        starsCollected: this.state.starsCollected,
        flips: this.state.flips,
        survivedFullRun: this.state.outcome === 'survived',
    }
}
```

Extend the test file with:

```ts
it('ramps speed from 220 toward 360 using BaseGame time', () => {
    const game = createGame()
    game.start()
    expect(game.getState().worldSpeed).toBe(220)
    vi.advanceTimersByTime(30_000)
    game.update(1 / 60)
    expect(game.getState().worldSpeed).toBeCloseTo(290)
})

it('marks a timer-complete run as survived', async () => {
    const game = createGame()
    game.start()
    vi.advanceTimersByTime(60_000)
    await Promise.resolve()
    expect(game.getState().outcome).toBe('survived')
    expect(game.getState().isGameOver).toBe(true)
})
```

Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts src/lib/games/gravity-flip/scoring.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/gravity-flip/GravityFlipGame.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
git commit -m "feat(gravity-flip): add gravity runner physics"
```

---

### Task 3: Add the bounded challenge stream, stars, collision, and reset lifecycle

**Files:**
- Modify: `src/lib/games/gravity-flip/GravityFlipGame.ts`
- Modify: `src/lib/games/gravity-flip/GravityFlipGame.test.ts`
- Reuse unchanged: `src/lib/games/shared/utils.ts` (`clamp`, `rectOverlap`)

**Interfaces:**
- Preserves Task 2 public API.
- Adds private one-at-a-time challenge generation and state-owned `hazards[]` / `stars[]` semantics.
- First generated challenge is always `floor-spike`; random mover eligibility begins at 15 elapsed seconds.

- [ ] **Step 1: Write RED first-challenge, collision, and star tests**

Add tests that lock the product contract without exposing generator internals:

```ts
it('spawns a deterministic floor spike and safe-side star on start', () => {
    const game = createGame()
    game.start()
    expect(game.getState().hazards).toHaveLength(1)
    expect(game.getState().hazards[0].kind).toBe('floor-spike')
    expect(game.getState().stars).toHaveLength(1)
    expect(game.getState().stars[0].y).toBeLessThan(160)
})

it('ends once when the first floor spike reaches an unflipped player', async () => {
    const game = createGame()
    game.start()
    for (let i = 0; i < 50 && game.getState().isActive; i++) {
        game.update(0.1)
    }
    await Promise.resolve()
    expect(game.getState().outcome).toBe('collision')
    expect(game.getState().isGameOver).toBe(true)
})

it('collects an opposite-surface star once after a timely flip', () => {
    const game = createGame()
    game.start()
    expect(game.flipGravity()).toBe(true)
    for (let i = 0; i < 50 && game.getState().starsCollected === 0; i++) {
        game.update(0.1)
    }
    expect(game.getState().starsCollected).toBe(1)
    expect(game.getState().score).toBeGreaterThanOrEqual(250)
})
```

Run and expect RED because Task 2 does not spawn entities.

- [ ] **Step 2: Add private generation counters and deterministic first challenge**

Add class fields:

```ts
private nextEntityId = 0
private distanceUntilNextChallengePx = 0
```

Reset them in constructor completion and `onGameReset()` through one helper:

```ts
private resetGeneration(): void {
    this.nextEntityId = 0
    this.distanceUntilNextChallengePx = this.config.initialChallengeSpacing
}

protected onGameReset(): void {
    this.resetGeneration()
}

protected onGameStart(): void {
    if (this.state.hazards.length === 0) {
        this.spawnSurfaceChallenge('floor-spike')
    }
    this.emitStateChange()
}
```

Call `resetGeneration()` in the constructor body after `super(...)` returns.

Use monotonic local IDs:

```ts
private entityId(prefix: 'hazard' | 'star'): string {
    return `${prefix}-${this.nextEntityId++}`
}
```

Do not use global/random IDs; deterministic tests only need run-local identity.

- [ ] **Step 3: Implement surface challenge creation and safe-side stars**

Use `spawnX = canvasWidth + spawnOffsetX`. For surface challenges:

```ts
private spawnSurfaceChallenge(
    kind: Exclude<GravityFlipHazardKind, 'mover'>
): void {
    const isFloor = kind.startsWith('floor')
    const isGap = kind.endsWith('gap')
    const width = isGap ? this.config.gapWidth : this.config.spikeWidth
    const height = isGap ? this.config.gapHeight : this.config.spikeHeight
    const x = this.config.canvasWidth + this.config.spawnOffsetX
    const y = isFloor
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

    const halfPlayer = this.config.playerSize / 2
    const safeY = isFloor
        ? this.config.corridorInset + halfPlayer
        : this.config.canvasHeight - this.config.corridorInset - halfPlayer
    this.state.stars.push({
        id: this.entityId('star'),
        x: x + width / 2,
        y: safeY,
        radius: this.config.starRadius,
    })
}
```

Mover creation:

```ts
private spawnMover(): void {
    const size = this.config.moverSize
    this.state.hazards.push({
        id: this.entityId('hazard'),
        kind: 'mover',
        x: this.config.canvasWidth + this.config.spawnOffsetX,
        y: this.config.canvasHeight / 2 - size / 2,
        width: size,
        height: size,
        verticalVelocity: this.config.moverVerticalSpeed,
    })
}
```

- [ ] **Step 4: Implement rising spacing and the five-item random catalog**

Add:

```ts
private challengeSpacing(): number {
    const p = this.progress()
    return (
        this.config.initialChallengeSpacing +
        (this.config.finalChallengeSpacing -
            this.config.initialChallengeSpacing) *
            p
    )
}

private spawnRandomChallenge(): void {
    const surfaceKinds = [
        'floor-spike',
        'ceiling-spike',
        'floor-gap',
        'ceiling-gap',
    ] as const
    const kinds: readonly GravityFlipHazardKind[] =
        this.elapsedSeconds() >= this.config.moverUnlockSeconds
            ? [...surfaceKinds, 'mover']
            : surfaceKinds
    const rawIndex = Math.floor(this.config.rng() * kinds.length)
    const kind = kinds[Math.max(0, Math.min(kinds.length - 1, rawIndex))]
    if (kind === 'mover') this.spawnMover()
    else this.spawnSurfaceChallenge(kind)
}
```

In each physics substep, after computing `moved`:

```ts
this.distanceUntilNextChallengePx -= moved
while (this.distanceUntilNextChallengePx <= 0) {
    this.spawnRandomChallenge()
    this.distanceUntilNextChallengePx += this.challengeSpacing()
}
```

Add tests with injected RNG `() => 0.999` proving no mover before 15 seconds and mover eligibility after advancing BaseGame fake time past 15 seconds. Assert kinds/outcomes rather than RNG call counts.

- [ ] **Step 5: Move entities and implement collisions with shared AABB reuse**

Import `rectOverlap` from `shared/utils` and create one player rect:

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
```

For every substep:

1. subtract `state.worldSpeed * step` from hazard/star X;
2. bounce movers between `corridorInset` and `canvasHeight - corridorInset - height` by clamping Y and reversing `verticalVelocity`;
3. remove entities fully left of the logical canvas;
4. collect intersecting stars using their bounding square;
5. test hazards.

Surface gaps use X overlap plus surface contact:

```ts
private gapHitsPlayer(hazard: GravityFlipHazard): boolean {
    const player = this.playerRect()
    const overlapsX =
        player.x < hazard.x + hazard.width &&
        player.x + player.width > hazard.x
    if (!overlapsX) return false

    const half = this.state.player.size / 2
    const ceilingY = this.config.corridorInset + half
    const floorY = this.config.canvasHeight - this.config.corridorInset - half
    return hazard.kind === 'floor-gap'
        ? Math.abs(this.state.player.y - floorY) < 0.5
        : Math.abs(this.state.player.y - ceilingY) < 0.5
}
```

Spikes and movers use `rectOverlap(this.playerRect(), hazardRect)`.

- [ ] **Step 6: Add idempotent collision termination and score synchronization**

```ts
private failRun(): void {
    if (!this.state.isActive || this.state.outcome !== 'playing') return
    this.state.outcome = 'collision'
    this.syncScore()
    this.emitStateChange()
    void this.end()
}
```

Stop the substep loop immediately after collision. Add tests for:

- a thin spike still collides when `update(0.1)` is used (proves substeps are load-bearing);
- a floor gap does not kill a player resting on the ceiling;
- the same gap does kill a floor-resting player;
- mover Y reverses at both bounds;
- overlapping lethal records still result in one end state;
- `reset()` clears hazards/stars and the next `start()` recreates `hazard-0` as the authored floor spike.

Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts src/lib/games/gravity-flip/scoring.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/gravity-flip/GravityFlipGame.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
git commit -m "feat(gravity-flip): add hazards and stars"
```

---

### Task 4: Add the simple two-layer Pixi renderer

**Files:**
- Create: `src/lib/games/gravity-flip/GravityFlipRenderer.ts`
- Create: `src/lib/games/gravity-flip/GravityFlipRenderer.test.ts`
- Reuse unchanged: `src/lib/games/renderers/PixiJSRenderer.ts`

**Interfaces:**
- Consumes `GravityFlipState`, `GravityFlipConfig`, and fixed logical coordinates.
- Produces `GravityFlipRenderer` and `createGravityFlipRendererConfig(config, container)`.
- Renderer does not own gameplay input; Task 5 attaches pointer input to `app.canvas`.

- [ ] **Step 1: Write RED setup/render/cleanup tests**

Use the repository's existing Pixi renderer mock pattern and assert behavior, not Pixi internals:

```ts
it('creates one static corridor layer and one dynamic scene layer', async () => {
    const renderer = new GravityFlipRenderer(
        createGravityFlipRendererConfig(createGravityFlipConfig(), '#mount')
    )
    await renderer.initialize()
    expect(renderer.getStage()?.children).toHaveLength(2)
})

it('redraws the dynamic scene for gravity direction and entities', async () => {
    // render a state with one floor spike, one gap, one mover, and one star;
    // assert dynamic Graphics.clear() is called and geometry methods are used.
})

it('destroys both graphics layers and the Pixi app on cleanup', async () => {
    // initialize → cleanup → assert canvas/layers are released.
})
```

Run and expect RED because the renderer does not exist.

- [ ] **Step 2: Implement renderer setup and fixed logical config**

```ts
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type { GravityFlipConfig, GravityFlipState } from './types'

export interface GravityFlipRendererConfig extends PixiJSRendererConfig {
    corridorInset: number
}

export function createGravityFlipRendererConfig(
    config: GravityFlipConfig,
    container: string
): GravityFlipRendererConfig {
    return {
        type: 'canvas',
        container,
        width: config.canvasWidth,
        height: config.canvasHeight,
        responsive: false,
        backgroundColor: 0x020617,
        antialias: true,
        corridorInset: config.corridorInset,
    }
}

export class GravityFlipRenderer extends PixiJSRenderer {
    private corridorGraphic: PIXI.Graphics | null = null
    private sceneGraphic: PIXI.Graphics | null = null

    async setup(): Promise<void> {
        await super.setup()
        this.corridorGraphic = this.createGraphics()
        this.sceneGraphic = this.createGraphics()
        this.addToStage(this.corridorGraphic)
        this.addToStage(this.sceneGraphic)
        this.drawCorridor()
    }
}
```

`drawCorridor()` draws the dark playfield, faint vertical guide lines, and top/bottom cyan rails once.

- [ ] **Step 3: Implement one dynamic redraw path**

`renderGame()` type-checks the state, clears `sceneGraphic`, and draws everything from current state. Keep shape ownership in this file only:

```ts
protected renderGame(state: unknown): void {
    if (!this.sceneGraphic || !this.isGravityFlipState(state)) return
    this.sceneGraphic.clear()
    this.drawPlayer(state)
    for (const hazard of state.hazards) this.drawHazard(hazard)
    for (const star of state.stars) this.drawStar(star.x, star.y, star.radius)
}
```

Use these visual contracts:

- player: 28px neon diamond plus a short accent chevron toward active gravity;
- spikes: 3 triangle teeth inside the hazard AABB;
- gap: background-colored rectangle over the relevant rail plus bright edge caps;
- mover: glowing outlined orb within its AABB;
- star: explicit 10-point alternating-radius polygon.

A local star helper is enough:

```ts
private starPoints(cx: number, cy: number, outer: number): number[] {
    const points: number[] = []
    const inner = outer * 0.45
    for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outer : inner
        const angle = -Math.PI / 2 + (Math.PI * i) / 5
        points.push(cx + Math.cos(angle) * radius)
        points.push(cy + Math.sin(angle) * radius)
    }
    return points
}
```

Do not add textures, spritesheets, filters, particle emitters, or per-entity display-object maps.

- [ ] **Step 4: Implement cleanup**

Destroy the two owned graphics, null them, then call `super.cleanup()` exactly once:

```ts
cleanup(): void {
    this.corridorGraphic?.destroy()
    this.sceneGraphic?.destroy()
    this.corridorGraphic = null
    this.sceneGraphic = null
    super.cleanup()
}
```

Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipRenderer.test.ts
bun run typecheck
```

Expected: PASS / zero typecheck errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/gravity-flip/GravityFlipRenderer.ts src/lib/games/gravity-flip/GravityFlipRenderer.test.ts
git commit -m "feat(gravity-flip): add Pixi renderer"
```

---

### Task 5: Wire the initializer and create the route before catalog activation

**Files:**
- Create: `src/lib/games/gravity-flip/initFramework.ts`
- Create: `src/lib/games/gravity-flip/initFramework.test.ts`
- Create: `src/pages/gravity-flip/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

**Interfaces:**
- Consumes Tasks 1–4.
- Produces one initialized game/renderer/rAF handle, page/HUD/result DOM contract, keyboard + canvas pointer + native button input, and the `/gravity-flip` route.
- The active `GAMES` record remains deferred until Task 6, after this route exists.

- [ ] **Step 1: Create the page shell first so route validation can never observe an active missing page**

`src/pages/gravity-flip/index.astro` uses:

```astro
---
import GamePage from '@/components/games/GamePage.astro'
import Button from '@/components/ui/Button.astro'
import Card from '@/components/ui/Card.astro'
import Badge from '@/components/ui/Badge.astro'
---

<GamePage
  gameId="gravity-flip"
  title="Gravity Flip"
  description="Flip between floor and ceiling gravity to dodge hazards and collect stars for 60 seconds."
  icon="🌗"
  initialTime={60}
  showPause={false}
  showEnd={false}
  showReset={true}
  overlayTitle="GRAVITY LOST"
>
  <div slot="game-board" id="gravity-flip-container" class="space-y-4">
    <div id="gravity-flip-canvas" class="overflow-hidden rounded-xl"></div>
    <div class="flex justify-center">
      <Button id="flip-btn" type="button" variant="primary">Flip Gravity</Button>
    </div>
  </div>

  <div slot="additional-stats" class="grid grid-cols-2 gap-3 text-sm">
    <div>Gravity <span id="gravity-direction">FLOOR ↓</span></div>
    <div>Distance <span id="distance-traveled">0</span>m</div>
    <div>Stars <span id="stars-collected">0</span></div>
    <div>Flips <span id="flip-count">0</span></div>
    <div>Speed <span id="world-speed">220</span></div>
  </div>

  <div slot="game-info">
    <Card variant="glass" class="p-6 space-y-3 text-sm">
      <div>Flip before spikes or gaps reach your current surface.</div>
      <div>Stars appear on the opposite safe surface and are optional.</div>
      <div class="flex gap-2"><Badge variant="outline">Space</Badge><Badge variant="outline">↑ / ↓</Badge><span>Flip gravity</span></div>
      <div>Tap/click the playfield or use the Flip Gravity button on touch devices.</div>
    </Card>
  </div>

  <div slot="final-stats" class="space-y-2">
    <div id="final-outcome">Collision</div>
    <div>Distance: <span id="final-distance">0</span>m</div>
    <div>Stars: <span id="final-stars">0</span></div>
    <div>Flips: <span id="final-flips">0</span></div>
  </div>
</GamePage>

<style>
  #gravity-flip-canvas :global(canvas) {
    display: block;
    width: min(800px, 92vw);
    max-width: 100%;
    height: auto;
    touch-action: manipulation;
  }
</style>

<script>
  import { initGravityFlipGameFramework } from '@/lib/games/gravity-flip/initFramework'

  let handle: Awaited<ReturnType<typeof initGravityFlipGameFramework>> | undefined
  const init = async () => {
    handle = await initGravityFlipGameFramework()
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    void init()
  }
  window.addEventListener('beforeunload', () => handle?.cleanup(), { once: true })
</script>
```

Keep the `<script>` at page root, outside `GamePage`, per the current component contract.

- [ ] **Step 2: Freeze the page contract in markup tests**

In `src/pages/game-board-markup.test.ts`, load `gravityFlipMarkup`, add `'gravity-flip'` to the `games` array, and add:

```ts
describe('Gravity Flip page markup', () => {
    it('keeps the canvas mount, accessible flip button, and root initializer', () => {
        expect(gravityFlipMarkup).toContain('id="gravity-flip-container"')
        expect(gravityFlipMarkup).toContain('id="gravity-flip-canvas"')
        expect(gravityFlipMarkup).toContain('id="flip-btn"')
        expect(gravityFlipMarkup).toContain('id="gravity-direction"')
        expect(gravityFlipMarkup).toMatch(
            /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initGravityFlipGameFramework/
        )
    })
})
```

Run:

```bash
bun run test:run src/pages/game-board-markup.test.ts src/lib/games.test.ts
```

Expected: PASS. `getGameById(GRAVITY_FLIP)` still returns undefined until Task 6.

- [ ] **Step 3: Write RED initializer input/lifecycle tests**

Create jsdom tests that install the exact required DOM IDs and mock the renderer. Lock these behaviors:

```ts
it('starts one rAF loop and advances/render only through that loop')
it('Space/ArrowUp/ArrowDown flip while active and ignore key repeat')
it('ignores modifier chords and editable targets')
it('canvas pointerdown and #flip-btn use the same flip API')
it('Reset clears the run and restores FLOOR / zero HUD')
it('end shows collision/survival final stats and Play Again starts a fresh run')
it('cleanup cancels rAF, removes listeners, destroys game/renderer, and is idempotent')
it('forwards BaseGame achievement and challenge completion payloads')
```

For keyboard assertions, dispatch on `document`; for pointer input dispatch against the renderer canvas; for editable filtering dispatch a bubbling keydown from an `<input>`.

Run and expect RED because `initFramework.ts` does not exist.

- [ ] **Step 4: Implement the initializer with one rAF loop**

Create `initFramework.ts` with a small handle:

```ts
export interface GravityFlipInitResult {
    game: GravityFlipGame
    renderer: GravityFlipRenderer
    cleanup: () => void
    getState: () => ReturnType<GravityFlipGame['getState']>
}
```

Initialization order:

1. require `#gravity-flip-container` and `#gravity-flip-canvas`;
2. create/initialize `GravityFlipRenderer`;
3. create `GravityFlipGame` with enhanced BaseGame callbacks;
4. attach achievement/challenge `end` listener;
5. attach Start/Reset/Play Again/Flip/keyboard/canvas-pointer handlers;
6. start exactly one rAF loop;
7. render initial state;
8. expose the returned handle as `window.gravityFlipGame`.

The loop follows the existing local pattern:

```ts
let frameId: number | null = null
let lastTime = performance.now()
const frame = (now: number) => {
    const delta = Math.min(Math.max(0, now - lastTime) / 1000, 0.1)
    lastTime = now
    const state = game.getState()
    if (state.isActive && !state.isPaused) game.update(delta)
    renderer.render(game.getState())
    frameId = requestAnimationFrame(frame)
}
frameId = requestAnimationFrame(frame)
```

Do not create a second interval/ticker for gameplay.

- [ ] **Step 5: Implement one shared flip action and keyboard filters**

```ts
const editable = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
    )
}

const flip = () => game.flipGravity()
const onKeyDown = (event: KeyboardEvent) => {
    if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        editable(event.target) ||
        ![' ', 'Spacebar', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
        return
    }
    if (flip()) event.preventDefault()
}
```

Attach `onKeyDown` to `document`, `flip` to `#flip-btn` click, and a pointer handler to `renderer.getApp()?.canvas`.

- [ ] **Step 6: Implement HUD, results, Play Again, and cleanup**

State callback updates:

```text
#gravity-direction  FLOOR ↓ / CEILING ↑
#distance-traveled floor(distance / 10) / 10
#stars-collected   starsCollected
#flip-count        flips
#world-speed       floor(worldSpeed)
```

End callback updates `#game-over-title`, `#final-score`, `#final-outcome`, `#final-distance`, `#final-stars`, `#final-flips`, and removes `hidden` from `#game-over-overlay`.

Button behavior:

- Start → `game.start()` and hide Start while active;
- Reset → `game.reset()`, hide overlay, show Start;
- Play Again → hide overlay and call `game.start()`; BaseGame auto-resets the completed run;
- Flip → `game.flipGravity()`.

Cleanup is guarded by a boolean and cancels rAF before removing listeners / renderer / game.

Run:

```bash
bun run test:run src/lib/games/gravity-flip/initFramework.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS / zero typecheck errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/gravity-flip/initFramework.ts src/lib/games/gravity-flip/initFramework.test.ts src/pages/gravity-flip/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(gravity-flip): wire page and controls"
```

---

### Task 6: Activate the catalog entry, achievements, browser journey, and repository gates

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `e2e/games/play-coverage.spec.ts`
- Modify: `CLAUDE.md`
- Verify unchanged: `e2e/games/all-games-navigation.spec.ts`
- Verify unchanged: `AGENTS.md` symlink

**Interfaces:**
- Consumes the complete route/runtime from Tasks 1–5.
- Produces the active Gravity Flip catalog card, standard score/achievement typing, four achievements, one real browser lose/restart/input journey, and repository documentation.

- [ ] **Step 1: Activate the exact registry entry now that `/gravity-flip` exists**

Add to `GAMES`:

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
},
```

Replace Task 1's temporary identifier test with an exact registration test:

```ts
describe('Gravity Flip registration', () => {
    it('has the exact active registry entry and route', () => {
        expect(GameID.GRAVITY_FLIP).toBe('gravity_flip')
        expect(getGameIcon(GameID.GRAVITY_FLIP)).toBe('🌗')
        expect(getGameUrl(GameID.GRAVITY_FLIP)).toBe('/gravity-flip')
        expect(getGameById(GameID.GRAVITY_FLIP)).toMatchObject({
            name: 'Gravity Flip',
            category: 'action',
            estimatedDuration: '1 minute',
            difficulty: 'medium',
            isActive: true,
            organism: { shape: 'spiral', color: 'magenta' },
            depth: 'mid',
        })
        expect(
            GAMES.filter(game => game.id === GameID.GRAVITY_FLIP)
        ).toHaveLength(1)
    })
})
```

Run:

```bash
bun run test:run src/lib/games.test.ts
```

Expected: PASS including the existing “route exists for every game” invariant.

- [ ] **Step 2: Add canonical shared game-data typing**

In `src/lib/games/shared/types.ts`:

```ts
export type GravityFlipGameData =
    import('../gravity-flip/types').GravityFlipGameData
```

Add `| GravityFlipGameData` to `GameData`. Import it into `src/lib/achievements.ts` and add it to `AchievementCheckData` beside the other game-local aliases.

- [ ] **Step 3: Add four lean achievements and RED/GREEN tests**

Add:

```ts
{
    id: 'gravity_flip_welcome',
    name: 'First Flip',
    description: 'Score your first points in Gravity Flip',
    logo: '🌗',
    gameId: GameID.GRAVITY_FLIP,
    condition: { type: 'score_threshold', threshold: 1 },
    rarity: AchievementRarity.COMMON,
},
{
    id: 'gravity_flip_star_chaser',
    name: 'Star Chaser',
    description: 'Collect 5 stars in one Gravity Flip run',
    logo: '⭐',
    gameId: GameID.GRAVITY_FLIP,
    condition: {
        type: 'in_game',
        check: (data: GravityFlipGameData) => data.starsCollected >= 5,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'gravity_flip_long_haul',
    name: 'Long Haul',
    description: 'Travel 8,000 pixels in one Gravity Flip run',
    logo: '🚀',
    gameId: GameID.GRAVITY_FLIP,
    condition: {
        type: 'in_game',
        check: (data: GravityFlipGameData) => data.distance >= 8000,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'gravity_flip_survivor',
    name: 'Gravity Master',
    description: 'Survive the full 60-second Gravity Flip run',
    logo: '🏆',
    gameId: GameID.GRAVITY_FLIP,
    condition: {
        type: 'in_game',
        check: (data: GravityFlipGameData) => data.survivedFullRun,
    },
    rarity: AchievementRarity.EPIC,
},
```

In `achievements.test.ts`, assert exact IDs/game ID and threshold boundaries (`4→false/5→true`, `7999→false/8000→true`, survived false/true).

Run:

```bash
bun run test:run src/lib/achievements.test.ts src/lib/games.test.ts
```

Expected: PASS.

- [ ] **Step 4: Add one real browser lose/restart/input journey**

Append to `e2e/games/play-coverage.spec.ts`:

```ts
test.describe('Gravity Flip', () => {
    test('renders, loses to the authored first spike, restarts, and flips by button/keyboard', async ({
        page,
    }) => {
        await page.goto('/gravity-flip')
        await expectVisibleGameSurface(page, '#gravity-flip-canvas canvas')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')
        await expect(page.locator('#score')).toHaveText('0')

        await startGameWhenReady(page)

        // The first challenge is deliberately a floor spike. No input is a
        // deterministic real loss, not a test-only forced state.
        await expect(page.locator('#game-over-overlay')).not.toHaveClass(
            /hidden/,
            { timeout: 8000 }
        )
        await expect(page.locator('#final-outcome')).toHaveText(/Collision/i)

        await page.locator('#play-again-btn').click()
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')

        await page.locator('#flip-btn').click()
        await expect(page.locator('#gravity-direction')).toHaveText('CEILING ↑')

        await page.keyboard.press('Space')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')
    })
})
```

Run:

```bash
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: Gravity Flip journey passes together with existing game smoke tests.

- [ ] **Step 5: Update repository game documentation without touching the symlink**

In `CLAUDE.md`, add Gravity Flip to the active game list/catalog documentation with:

```text
Gravity Flip — /gravity-flip — action — 1 minute — PixiJS/BaseGame
```

Do not edit `AGENTS.md` directly. Verify it remains the existing symlink after the change.

- [ ] **Step 6: Run focused and full verification**

Focused:

```bash
bun run test:run src/lib/games/gravity-flip src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
```

Repository gates:

```bash
bun run test:run
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:coverage
```

Then verify remote Codecov project + patch statuses both meet the configured 90% / 0%-threshold blocking gate. Do not replace the remote patch result with a local aggregate-coverage claim.

- [ ] **Step 7: Verify scope boundary**

The implementation diff may add/modify only the Gravity Flip game/page/tests plus:

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

Confirm these remain production-unchanged:

```text
src/lib/games/core/BaseGame.ts
src/lib/games/core/GameTimer.ts
src/lib/games/core/ScoreManager.ts
src/lib/games/core/GameInitializer.ts
src/lib/games/renderers/PixiJSRenderer.ts
src/lib/services/scoreService.ts
src/pages/api/
src/server/db/
e2e/games/all-games-navigation.spec.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/achievements.ts src/lib/achievements.test.ts e2e/games/play-coverage.spec.ts CLAUDE.md
git commit -m "feat(gravity-flip): integrate game with Cetus"
```

The complete HPA-73 implementation remains one PR. Do not split platform integration into a second PR.
