# Gravity Flip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gravity Flip, a one-minute one-button side-scrolling action game with continuous gravity physics, rising speed/density, a safe-by-construction five-kind challenge catalog, collectible stars, accessible desktop/mobile input, achievements, and the existing Cetus score/leaderboard flow.

**Architecture:** `GravityFlipGame` extends `BaseGame` and owns fixed-X vertical physics, a closed game-local hazard catalog, collision/star collection, mover-safe bounds, and score synchronization. `GravityFlipRenderer` extends `PixiJSRenderer` with one static corridor layer and one redrawn dynamic scene layer. A custom initializer combines Pattern Pulse's current error/debug-handle contract with Evader's single-rAF loop; the game internally substeps physics to prevent tunneling. No shared runner/physics/input framework or backend change is required.

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
- Do not classify hazard kinds with `startsWith`, `endsWith`, or substring parsing.
- Spike/gap challenges place one star on the opposite safe surface; movers do not carry a star.
- A mover at either bounce extremum must not overlap a player resting on either rail.
- Gap collision is lethal only when player X overlaps the gap and the player is touching the gap's catalog surface.
- Spike/mover collision uses conservative AABBs; no pixel-perfect geometry.
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
- **Stringly catalog drift:** spawn, stars, collision, and rendering must consume the same closed descriptor table.
- **Thin-hazard tunneling:** the regression uses an injected 8px spike that a single 0.1s end-position collision check would skip.
- **Frame-dependent score drift:** synchronize BaseGame score to the pure accumulated target instead of awarding rounded points per frame.
- **Focused-button double flip:** document keydown ignores button targets so native Space/Enter click is the only button activation.
- **Terminal-copy drift:** collision and survival titles/outcome strings are tested independently.
- **Debug/error fork:** use Pattern Pulse's `DOMElementNotFoundError` + `handleGameError` + `getGame()` handle shape; only the rAF loop comes from Evader.
- **Double end/save:** first collision delegates once to BaseGame and inactive state stops later substeps.

---

### Task 1: Define the closed contracts, safe mover bounds, GameID/icon, and scorer

**Files:**
- Modify: `src/lib/games.ts`
- Create: `src/lib/games/gravity-flip/types.ts`
- Create: `src/lib/games/gravity-flip/scoring.ts`
- Create: `src/lib/games/gravity-flip/scoring.test.ts`
- Test: `src/lib/games.test.ts`
- Reuse unchanged: `src/lib/games/shared/utils.ts` (`rectOverlap`)

**Interfaces:**
- Produces `GameID.GRAVITY_FLIP`, icon mapping, `GravityFlipHazardKind`, `GRAVITY_FLIP_RULES`, `GRAVITY_FLIP_HAZARD_CATALOG`, `GravityFlipConfig`, state/stats/data types, `createGravityFlipConfig()`, `getGravityFlipMoverBounds()`, and `calculateGravityFlipScore()`.
- The active `GAMES` record stays deferred until Task 5 creates the route.

- [ ] **Step 1: Add compile-safe GameID/icon without activating the route**

In `src/lib/games.ts` add:

```ts
GRAVITY_FLIP = 'gravity_flip',
```

and the exhaustive icon entry:

```ts
[GameID.GRAVITY_FLIP]: '🌗',
```

Add this pre-registration test to `src/lib/games.test.ts`:

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

- [ ] **Step 2: Create the contracts, rule source, and closed descriptor table**

Create `src/lib/games/gravity-flip/types.ts` with these load-bearing definitions:

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

`GravityFlipConfig` contains the same configurable fields plus `rng: () => number`. `createGravityFlipConfig()` copies from `GRAVITY_FLIP_RULES`, sets BaseGame fields (`achievementIntegration: true`, `pausable: false`, `resettable: true`), defaults `rng: Math.random`, then applies overrides.

Add the pure mover-bound helper:

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

Keep the existing state/entity/data shapes from the spec. Do not add a separate catalog class or registry.

- [ ] **Step 3: Lock catalog completeness and mover rail safety**

Add tests alongside the Task 2 game tests or in `scoring.test.ts` only if keeping Task 1 test count minimal. The preferred home is `GravityFlipGame.test.ts` in Task 2, but freeze the exact assertion now:

```ts
expect(Object.keys(GRAVITY_FLIP_HAZARD_CATALOG).sort()).toEqual([
    'ceiling-gap',
    'ceiling-spike',
    'floor-gap',
    'floor-spike',
    'mover',
])
```

and the mover-bound expectation will be:

```ts
expect(getGravityFlipMoverBounds(createGravityFlipConfig())).toEqual({
    minY: 64,
    maxY: 216,
})
```

- [ ] **Step 4: Write RED scorer tests**

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

Expected: FAIL because `scoring.ts` does not exist.

- [ ] **Step 5: Implement the single scorer**

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

### Task 2: Implement BaseGame motion, collision-safe substeps, and frame-stable score

**Files:**
- Create: `src/lib/games/gravity-flip/GravityFlipGame.ts`
- Create: `src/lib/games/gravity-flip/GravityFlipGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`

**Interfaces:**
- Consumes Task 1 contracts/scorer.
- Produces `GravityFlipGame`, `flipGravity(): boolean`, `getConfig()`, motion/distance/world-speed state, `survived` timeout behavior, and the substep update loop.
- Task 3 adds catalog spawn/collision without changing the public API.

- [ ] **Step 1: Write RED gravity/velocity/score-partition tests**

Use fake timers and an achievement-disabled config:

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

Cover:

```ts
it('starts floor-resting with downward gravity and zero velocity')
it('flipGravity reverses direction, increments flips, and preserves velocityY')
it('rejects flips before start and after end')
it('clamps player to the floor/ceiling rails')
it('ramps world speed from 220 toward 360 from BaseGame elapsed time')
it('produces the same distance score for 10x0.01s and 1x0.1s updates')
it('timeout marks survived before BaseGame end')
```

Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts
```

Expected: FAIL because the game class does not exist.

- [ ] **Step 2: Implement the BaseGame shell**

The constructor uses:

```ts
super(GameID.GRAVITY_FLIP, config, callbacks, {
    basePoints: 0,
    timeBonus: false,
})
```

Initial player center positions:

```ts
const half = this.config.playerSize / 2
const floorY =
    this.config.canvasHeight - this.config.corridorInset - half
```

Initial state has `gravity: 'down'`, `velocityY: 0`, empty hazards/stars, zero distance/flips/stars, and `worldSpeed: initialWorldSpeed`.

`flipGravity()` is:

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

Do not alter `velocityY`.

- [ ] **Step 3: Implement the internal substep update and score synchronization**

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

`stepPhysics()` derives elapsed progress from `getTimerStatus().elapsedTime`, updates world speed, applies acceleration/velocity/Y clamp, and accumulates:

```ts
this.state.distance += this.state.worldSpeed * step
```

`syncScore()` calls `calculateGravityFlipScore()` and adds only a positive delta to BaseGame:

```ts
const target = calculateGravityFlipScore({
    distancePx: this.state.distance,
    starsCollected: this.state.starsCollected,
})
const delta = target - this.state.score
if (delta > 0) this.addScore(delta, 'gravity_flip_progress')
```

- [ ] **Step 4: Implement terminal stats/data and survival timeout**

`getGameStats()` returns BaseGame-compatible final score/time plus `outcome`, floored `distance`, `starsCollected`, and `flips`.

`getGameData()` returns:

```ts
protected getGameData(): Record<string, unknown> {
    return {
        distance: Math.floor(this.state.distance),
        starsCollected: this.state.starsCollected,
        flips: this.state.flips,
        survivedFullRun: this.state.outcome === 'survived',
    }
}
```

Override timeout only to label the result:

```ts
protected handleTimeUp(): void {
    this.state.outcome = 'survived'
    super.handleTimeUp()
}
```

- [ ] **Step 5: Run focused tests and commit**

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts src/lib/games/gravity-flip/scoring.test.ts
bun run typecheck
git add src/lib/games/gravity-flip/GravityFlipGame.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
git commit -m "feat(gravity-flip): add gravity motion"
```

---

### Task 3: Add descriptor-driven challenge spawn, mover-safe bounds, stars, and collision

**Files:**
- Modify: `src/lib/games/gravity-flip/GravityFlipGame.ts`
- Modify: `src/lib/games/gravity-flip/GravityFlipGame.test.ts`
- Reuse unchanged: `src/lib/games/shared/utils.ts`

**Interfaces:**
- Consumes `GRAVITY_FLIP_HAZARD_CATALOG` and `getGravityFlipMoverBounds()`.
- Produces the complete five-kind challenge runtime with no string parsing.

- [ ] **Step 1: Write RED catalog and safety tests**

Add:

```ts
it('has exactly one descriptor for all five closed hazard kinds', () => {
    expect(Object.keys(GRAVITY_FLIP_HAZARD_CATALOG).sort()).toEqual([
        'ceiling-gap',
        'ceiling-spike',
        'floor-gap',
        'floor-spike',
        'mover',
    ])
})
```

Lock mover safety using the same `rectOverlap` helper as production:

```ts
it('keeps a rail-resting player disjoint from mover at both extrema', () => {
    const config = createGravityFlipConfig()
    const { minY, maxY } = getGravityFlipMoverBounds(config)
    expect({ minY, maxY }).toEqual({ minY: 64, maxY: 216 })

    const half = config.playerSize / 2
    const playerX = config.playerX - half
    const ceilingPlayer = {
        x: playerX,
        y: config.corridorInset,
        width: config.playerSize,
        height: config.playerSize,
    }
    const floorPlayer = {
        x: playerX,
        y: config.canvasHeight - config.corridorInset - config.playerSize,
        width: config.playerSize,
        height: config.playerSize,
    }
    const moverAtTop = {
        x: playerX,
        y: minY,
        width: config.moverSize,
        height: config.moverSize,
    }
    const moverAtBottom = { ...moverAtTop, y: maxY }

    expect(rectOverlap(ceilingPlayer, moverAtTop)).toBe(false)
    expect(rectOverlap(floorPlayer, moverAtBottom)).toBe(false)
})
```

Also add tests for:

```ts
it('fresh start always authors floor-spike first')
it('does not select mover before 15 seconds')
it('can select mover after 15 seconds')
it('places a star on the opposite surface only when descriptor.hasStar')
it('floor gap kills only while resting on floor; ceiling is safe')
it('ceiling gap kills only while resting on ceiling; floor is safe')
it('mover clamps/reverses at both safe bounds')
it('overlapping lethal records still end once')
```

- [ ] **Step 2: Implement one descriptor-driven surface spawn path**

Do not use `startsWith`/`endsWith`.

```ts
private spawnChallenge(kind: GravityFlipHazardKind): void {
    const descriptor = GRAVITY_FLIP_HAZARD_CATALOG[kind]
    if (descriptor.shape === 'mover') {
        this.spawnMover(kind)
        return
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

    if (descriptor.hasStar && descriptor.surface) {
        this.spawnOppositeSurfaceStar(x + width / 2, descriptor.surface)
    }
}
```

`spawnOppositeSurfaceStar()` maps the descriptor surface to the opposite rail center; it does not inspect the kind string.

- [ ] **Step 3: Implement safe mover creation/bounce**

```ts
private spawnMover(kind: 'mover'): void {
    const { minY, maxY } = getGravityFlipMoverBounds(this.config)
    const y = (minY + maxY) / 2
    this.state.hazards.push({
        id: this.entityId('hazard'),
        kind,
        x: this.config.canvasWidth + this.config.spawnOffsetX,
        y,
        width: this.config.moverSize,
        height: this.config.moverSize,
        verticalVelocity: this.config.moverVerticalSpeed,
    })
}
```

For each mover substep:

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

- [ ] **Step 4: Dispatch collision from descriptor shape/surface**

```ts
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

`collidesWithGap()` requires non-null surface and checks X overlap plus rail contact derived from `descriptor.surface`.

- [ ] **Step 5: Add the non-vacuous substep regression**

The test must create a hazard narrower than one clamped outer-frame displacement:

```ts
it('collides with an 8px spike that a single 0.1s end-position check would skip', () => {
    const game = createGame({
        canvasWidth: 200,
        spawnOffsetX: 0,
        playerX: 150,
        spikeWidth: 8,
        initialWorldSpeed: 360,
        finalWorldSpeed: 360,
    })

    game.start()
    expect(game.getState().hazards[0]).toMatchObject({
        kind: 'floor-spike',
        x: 200,
        width: 8,
    })

    game.update(0.1)

    expect(game.getState().outcome).toBe('collision')
    expect(game.getState().isGameOver).toBe(true)
})
```

Why this is load-bearing: a single 0.1s move at 360 px/s shifts the 8px hazard 36px from `[200,208]` to `[164,172]`, leaving it just beyond a player ending at X=164. Internal 1/120s checks encounter the crossing.

- [ ] **Step 6: Run focused gates and commit**

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipGame.test.ts
bun run typecheck
git add src/lib/games/gravity-flip/GravityFlipGame.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
git commit -m "feat(gravity-flip): add safe challenge catalog"
```

---

### Task 4: Add the two-layer Pixi renderer with descriptor shape dispatch

**Files:**
- Create: `src/lib/games/gravity-flip/GravityFlipRenderer.ts`
- Create: `src/lib/games/gravity-flip/GravityFlipRenderer.test.ts`
- Reuse unchanged: `src/lib/games/renderers/PixiJSRenderer.ts`

**Interfaces:**
- Consumes game state plus `GRAVITY_FLIP_HAZARD_CATALOG`.
- Produces the fixed 800×320 canvas renderer and `createGravityFlipRendererConfig()`.

- [ ] **Step 1: Write RED renderer lifecycle/dispatch tests**

Cover:

```ts
it('creates one corridor layer and one scene layer')
it('draws spike, gap, and mover by descriptor.shape')
it('does not use kind prefix/suffix parsing')
it('renders player and stars from state')
it('cleans both graphics and Pixi app idempotently')
```

For shape coverage, render one state containing all five kinds and spy on private drawing helpers only through observable Graphics operations or narrowly exposed protected test seams already used by renderer tests; do not add a production registry.

Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipRenderer.test.ts
```

Expected: FAIL because renderer does not exist.

- [ ] **Step 2: Implement fixed Pixi configuration**

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

`setup()` calls `super.setup()`, creates `corridorGraphic` and `sceneGraphic`, adds both to stage, then draws the static corridor once.

- [ ] **Step 3: Implement full dynamic redraw and catalog shape switch**

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

No `startsWith`, `endsWith`, regex, or second shape map.

Render stars as a small polygon and player as a neon diamond/arrow. Color is supplemental; HUD carries text gravity state.

- [ ] **Step 4: Cleanup and focused verification**

Destroy the two Graphics instances before `super.cleanup()`.

Run:

```bash
bun run test:run src/lib/games/gravity-flip/GravityFlipRenderer.test.ts src/lib/games/gravity-flip/GravityFlipGame.test.ts
bun run typecheck
```

Then commit:

```bash
git add src/lib/games/gravity-flip/GravityFlipRenderer.ts src/lib/games/gravity-flip/GravityFlipRenderer.test.ts
git commit -m "feat(gravity-flip): add pixi renderer"
```

---

### Task 5: Add current-pattern initializer, accessible input, outcome copy, and route

**Files:**
- Create: `src/lib/games/gravity-flip/initFramework.ts`
- Create: `src/lib/games/gravity-flip/initFramework.test.ts`
- Create: `src/pages/gravity-flip/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Reuse unchanged: `src/lib/games/core/errors.ts`
- Reuse unchanged: `src/lib/games/pattern-pulse/initFramework.ts`
- Reuse unchanged: `src/lib/games/evader/initFramework.ts`

**Interfaces:**
- Produces `initGravityFlipGameFramework()` and handle `{ game, renderer, getGame, getState, cleanup }`.
- The page assigns `window.gravityFlipGame = handle`.

- [ ] **Step 1: Write RED initializer contract tests**

Cover these exact behaviors:

```ts
it('reports missing #gravity-flip-container with DOMElementNotFoundError/handleGameError')
it('cleans renderer and returns undefined when renderer initialization fails')
it('returns getGame() and getState() on the handle')
it('starts exactly one rAF loop and uses it for update + render')
it('Space/ArrowUp/ArrowDown flip while active')
it('ignores repeat/modifier/editable keyboard targets')
it('ignores document shortcuts when event.target is a button')
it('canvas pointerdown and #flip-btn click use flipGravity()')
it('Reset returns HUD to floor/zero idle state')
it('collision shows GRAVITY LOST and Collision')
it('timeout shows RUN COMPLETE and Survived')
it('Play Again immediately starts a fresh run')
it('cleanup cancels rAF, removes listeners, destroys renderer/game once')
it('forwards achievement/challenge completion payloads')
```

For focused-button behavior, dispatch a bubbling Space keydown from `#flip-btn` and assert no flip from the document listener, then dispatch its click and assert exactly one flip.

- [ ] **Step 2: Implement Pattern Pulse-style DOM/error and handle seams**

Imports include:

```ts
import {
    DOMElementNotFoundError,
    handleGameError,
} from '@/lib/games/core/errors'
```

Handle:

```ts
export interface GravityFlipInitResult {
    game: GravityFlipGame
    renderer: GravityFlipRenderer
    getGame: () => GravityFlipGame
    getState: () => ReturnType<GravityFlipGame['getState']>
    cleanup: () => void
}
```

Missing required root:

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

Renderer initialization failure reports through `handleGameError`, cleans the renderer, and returns `undefined`, matching Pattern Pulse rather than inventing a console-only path.

Do **not** assign `window.gravityFlipGame` inside this module.

- [ ] **Step 3: Add Evader-style local rAF loop**

```ts
let frameId: number | null = null
let lastUpdateTime = Date.now()

const frame = () => {
    const now = Date.now()
    const deltaSeconds = Math.min((now - lastUpdateTime) / 1000, 0.1)
    lastUpdateTime = now

    const state = game.getState()
    if (state.isActive && !state.isPaused) {
        game.update(deltaSeconds)
    }
    renderer.render(game.getState())
    frameId = requestAnimationFrame(frame)
}
frameId = requestAnimationFrame(frame)
```

Cleanup cancels `frameId` before renderer/game destruction.

- [ ] **Step 4: Add local editable/button keyboard filtering**

Copy the Pattern Pulse shape locally; do not add a shared input module:

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
```

Document handler:

```ts
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

    if (![' ', 'Spacebar', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return
    }
    if (game.flipGravity()) event.preventDefault()
}
```

Attach `click` on `#flip-btn` and `pointerdown` on the Pixi canvas to the same `game.flipGravity()` call.

- [ ] **Step 5: Implement terminal copy and deliberate Play Again semantics**

Outcome helpers are local:

```ts
function outcomeTitle(outcome: GravityFlipOutcome): string {
    return outcome === 'survived' ? 'RUN COMPLETE' : 'GRAVITY LOST'
}

function outcomeLabel(outcome: GravityFlipOutcome): string {
    return outcome === 'survived' ? 'Survived' : 'Collision'
}
```

End callback always writes `#game-over-title`, `#final-outcome`, score/distance/stars/flips, then shows overlay.

Play Again handler must include this comment and behavior:

```ts
const playAgainHandler = (): void => {
    hideOverlay()
    // BaseGame.start() auto-resets a completed run and immediately starts it.
    // Do not change Play Again to reset-only: Gravity Flip's browser/user flow
    // expects the next run to be active as soon as this button is pressed.
    game.start()
}
```

- [ ] **Step 6: Create the Astro page and let the page own the debug global**

Use `GamePage` with:

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

Board IDs:

```html
<div id="gravity-flip-container">
  <div id="gravity-flip-canvas"></div>
  <button id="flip-btn" type="button">Flip Gravity</button>
</div>
```

Include HUD/final IDs from the spec and CSS:

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

- [ ] **Step 7: Lock page structure**

In `src/pages/game-board-markup.test.ts`, add Gravity Flip to the game list and assert:

```ts
expect(gravityFlipMarkup).toContain('id="gravity-flip-container"')
expect(gravityFlipMarkup).toContain('id="gravity-flip-canvas"')
expect(gravityFlipMarkup).toContain('id="flip-btn"')
expect(gravityFlipMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initGravityFlipGameFramework/
)
```

Run:

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

### Task 6: Register the game, achievements, browser journey, docs, and repository gates

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

**Interfaces:**
- Completes HPA-73 platform integration. No new architecture seam is introduced.

- [ ] **Step 1: Activate the exact registry entry now that the route exists**

Add to `GAMES`:

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

Replace the Task 1 pre-registration test with an exact active-entry assertion and verify `getGameUrl(GameID.GRAVITY_FLIP) === '/gravity-flip'`.

- [ ] **Step 2: Add canonical game-data typing**

In `src/lib/games/shared/types.ts`:

```ts
export type GravityFlipGameData =
    import('../gravity-flip/types').GravityFlipGameData
```

Add it to `GameData` and to the achievement check union in `src/lib/achievements.ts`.

- [ ] **Step 3: Add four achievements; First Flip must inspect flips**

Add:

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
        check: (gameData: GravityFlipGameData) =>
            gameData.starsCollected >= 5,
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
        check: (gameData: GravityFlipGameData) =>
            gameData.survivedFullRun,
    },
    rarity: AchievementRarity.EPIC,
},
```

Achievement tests must explicitly prove the review regression:

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

Distance score must not unlock **First Flip**.

- [ ] **Step 4: Add one deterministic browser lose/restart/input journey**

In `e2e/games/play-coverage.spec.ts`:

```ts
test.describe('Gravity Flip', () => {
    test('loses to the authored spike, restarts, and flips once per input', async ({
        page,
    }) => {
        await page.goto('/gravity-flip')
        await expectVisibleGameSurface(page, '#gravity-flip-canvas canvas')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')

        await startGameWhenReady(page)

        // No flip: deterministic authored floor spike must end this run.
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

        // Move focus away from #flip-btn so document Space owns this action.
        await page.locator('#gravity-flip-canvas').click()
        await page.keyboard.press('Space')
        await expect(page.locator('#gravity-direction')).toHaveText('FLOOR ↓')
    })
})
```

Browser coverage remains collision-only; survival copy is covered deterministically in unit/integration tests without a 60-second E2E wait.

- [ ] **Step 5: Update CLAUDE.md only for the new game**

Update game count/list, add the Gravity Flip renderer/game note, and preserve the debug contract `window.gameNameGame.getGame()`. Do not edit the `AGENTS.md` symlink separately.

- [ ] **Step 6: Run focused + full repository gates**

Run fresh:

```bash
bun run test:run src/lib/games/gravity-flip src/lib/games.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
bun run test:coverage
```

Expected: all commands exit 0; remote Codecov project and patch statuses must meet 90% / threshold 0.

- [ ] **Step 7: Verify scope boundaries in the final diff**

Confirm these remain source-unchanged:

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

Before implementation starts, verify this document against the spec:

- [ ] Every hazard kind has exactly one descriptor row.
- [ ] No planned production path parses hazard kind strings.
- [ ] Default mover bounds are 64..216 and rail AABBs are disjoint at extrema.
- [ ] Thin-hazard regression uses injected 8px width and would be skipped by a single 0.1s endpoint test.
- [ ] First Flip checks `flips >= 1`, not score.
- [ ] Focused button keyboard is ignored by the document handler.
- [ ] Collision and survival presentation strings are both asserted.
- [ ] Initializer returns `getGame()` and page owns global assignment.
- [ ] Play Again calls `game.start()` and has the explanatory source comment.
- [ ] Unchanged DB path is `src/lib/server/db/`.
- [ ] One implementation PR only; no shared framework or backend expansion.