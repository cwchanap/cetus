# Signal Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Signal Switch, a 90-second real-time lane-management game where players cycle four laser gates to match incoming drone signals, preserve a combo, survive three integrity strikes, and use the existing Cetus score/leaderboard flow.

**Architecture:** `SignalSwitchGame` extends `BaseGame` and owns gate state, one-drone-per-lane scheduling, previous-X/next-X gate crossing, integrity/combo/scoring, and a simulation-time speed/lane ramp. `SignalSwitchRenderer` extends `PixiJSRenderer` with one static lane layer and one redrawn dynamic layer. A game-local initializer follows Gravity Flip's rAF/error/lifecycle conventions while four native Astro buttons plus number keys call one `cycleGate()` API. No shared lane/spawn/input framework or backend change is required.

**Tech Stack:** Astro 5 + TypeScript 6, PixiJS 8.10, Tailwind CSS 4, existing BaseGame/PixiJSRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-22-signal-switch-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- Deliver HPA-71 in **one implementation PR**; game logic, renderer, route, registration, achievements, tuning changes, and tests stay together.
- ID **`signal_switch`**, route **`/signal-switch`**, title **`Signal Switch`**, icon **`🚦`**.
- Run duration **90 seconds**; logical canvas **800×360**; `timeBonus: false`.
- Signal cycle is exactly **Cyan Circle `●` → Magenta Triangle `▲` → Amber Diamond `◆` → Cyan**.
- Start with **3 integrity**, **2 active lanes**, unlock lane 3 at **30 simulated seconds** and lane 4 at **60 simulated seconds**.
- All four gates start Cyan; the deterministic first drone is **Lane 1 / Magenta** and consumes no RNG.
- Keep at most **one unresolved drone per lane**. Random spawns use only active free lanes.
- Random drone signal must differ from that lane's current gate at spawn time.
- A successful random spawn consumes exactly **two RNG reads**: free-lane selection, then one of the two non-matching signals. A deferred all-busy spawn consumes zero reads.
- Difficulty uses private accumulated **simulation time**, not `GameTimer`/`Date.now()` elapsed time.
- Initial tuning defaults live once in `SIGNAL_SWITCH_RULES`: spawn X 64, gate X 680, drone 32×22, speed 140→240 px/s, spawn interval 2.2→1.1 s, outer update clamp 0.1 s.
- Gate crossing resolves with **`previousX < gateX && nextX >= gateX`**; do not rely on endpoint overlap or introduce physics substeps.
- When all active lanes are occupied, cap one ready spawn at the current interval; never accumulate a catch-up burst.
- Safe pass scoring uses only `calculateSignalSwitchPassPoints(comboAfterPass)`: `100 + min(max(floor(comboAfterPass), 1) - 1, 8) * 20`.
- A wrong gate resets combo, removes one integrity, and subtracts **no score**. Third crash ends the run.
- Failure UI: **`SIGNAL LOST` / `Systems failed`**. Timeout UI: **`SHIFT COMPLETE` / `Survived`**.
- Use existing BaseGame timer/save/run-guard/completed-run auto-reset; no second countdown, final survival bonus, or stale-run token.
- Use `BaseGame + PixiJSRenderer`; no shared traffic engine, lane engine, generic spawner, GameInitializer adoption, schema/API/leaderboard changes, audio, haptics, or image assets.
- Renderer keeps fixed logical coordinates; page CSS visually scales the canvas for mobile.
- Every signal is represented by color **and** stable glyph/shape/text. Color alone is never the interaction contract.
- Four native lane buttons live in Astro from first render. Use one delegated `#gate-controls` click listener; do not attach one custom listener per lane button.
- Desktop controls are `1`, `2`, `3`, `4`; ignore repeat, Ctrl/Meta/Alt, editable targets, and button targets.
- Native focused-button Enter/Space owns button activation; document keydown must not also cycle a gate.
- Initializer returns `getGame()`; the Astro page, not `initFramework.ts`, assigns `window.signalSwitchGame`.
- Initializer includes the existing active-run `beforeunload` warning and removes it during cleanup.
- Reset returns to idle. Play Again intentionally calls `game.start()` so BaseGame auto-resets **and starts** the next run.
- Create `/signal-switch` before activating the `GAMES` record because `games.test.ts` verifies every registered route exists.
- Register Signal Switch at `depth: 'shallow'`, changing `src/lib/organisms.test.ts` partition counts from **`6 / 9 / 4` to `7 / 9 / 4`**.
- `getGameUrl()` and `e2e/games/all-games-navigation.spec.ts` stay source-unchanged.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `PixiJSRenderer.ts`, `GameInitializer.ts`, `shared/utils.ts`, score service, `src/lib/server/db/`, APIs, and auth remain production-unchanged.
- Edit `CLAUDE.md`, not the `AGENTS.md` symlink.
- Balance-sensitive defaults are subject to the Task 6 manual-play checkpoint. If changed, update the rule/scoring source, exact-value tests, and design spec in this same HPA-71 implementation PR.

## Load-Bearing Risks

- **Impossible same-lane traffic:** free-lane filtering is the only random-spawn lane source.
- **Zero-action generated drones:** signal candidates remove the selected lane's current gate state before the second RNG read.
- **Frame tunneling:** resolve a gate crossing from previous X to next X, including a test where one accepted 0.1-second frame begins before and finishes beyond the gate.
- **Background-tab difficulty jump:** ramp from `elapsedSimSeconds`; BaseGame timer alone decides run expiration.
- **Spawn burst after congestion:** all-busy state holds one ready spawn only, with zero RNG reads until a lane frees.
- **Double terminal save:** fatal crossing stops the update path immediately after BaseGame marks the run inactive.
- **Focused-button double input:** document keydown ignores `HTMLButtonElement` targets.
- **Color-only readability:** controls and renderer use Circle/Triangle/Diamond marker geometry in addition to signal color.
- **Route registration race:** the page exists in Task 4; active catalog registration waits until Task 5.
- **Mobile canvas distortion:** copy Gravity Flip's inline width/height override plus `max-width:100%; height:auto` CSS.
- **Browser timing flake:** Playwright advances the exposed game model synchronously instead of waiting for 90 real seconds.
- **Over-engineering:** conventions may be copied from Gravity Flip; no common runner/lane/spawn abstraction is introduced.

---

### Task 1: Define signal contracts, stable GameID/icon, and pass scoring

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Create: `src/lib/games/signal-switch/types.ts`
- Create: `src/lib/games/signal-switch/scoring.ts`
- Create: `src/lib/games/signal-switch/scoring.test.ts`

**Interfaces:**
- Produces `GameID.SIGNAL_SWITCH`, icon mapping, `SignalSwitchSignal`, `SIGNAL_SWITCH_SIGNAL_ORDER`, display metadata, `SIGNAL_SWITCH_RULES`, config/state/stats/data contracts, `createSignalSwitchConfig()`, and `calculateSignalSwitchPassPoints()`.
- The active `GAMES` entry stays deferred until Task 5 because the page route does not exist yet.

- [ ] **Step 1: Add the stable ID/icon without adding a catalog record**

Add to `GameID`:

```ts
SIGNAL_SWITCH = 'signal_switch',
```

Add to the exhaustive `GAME_ICONS` record:

```ts
[GameID.SIGNAL_SWITCH]: '🚦',
```

Add a stable contract test beside the recent-game tests; do **not** add a temporary `getGameById(...) === undefined` assertion:

```ts
describe('Signal Switch stable ID and icon', () => {
    it('has the stable game ID and icon', () => {
        expect(GameID.SIGNAL_SWITCH).toBe('signal_switch')
        expect(getGameIcon(GameID.SIGNAL_SWITCH)).toBe('🚦')
    })
})
```

Run:

```bash
bun run test:run src/lib/games.test.ts
```

Expected: PASS. Route/catalog assertions are intentionally absent until Task 5.

- [ ] **Step 2: Create the signal, rule, state, stats, and data contracts**

Create `src/lib/games/signal-switch/types.ts` with these production authorities:

```ts
import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export const SIGNAL_SWITCH_SIGNAL_ORDER = [
    'cyan',
    'magenta',
    'amber',
] as const

export type SignalSwitchSignal =
    (typeof SIGNAL_SWITCH_SIGNAL_ORDER)[number]

export const SIGNAL_SWITCH_SIGNAL_META: Readonly<
    Record<SignalSwitchSignal, { label: string; glyph: string }>
> = {
    cyan: { label: 'Cyan', glyph: '●' },
    magenta: { label: 'Magenta', glyph: '▲' },
    amber: { label: 'Amber', glyph: '◆' },
}

export const SIGNAL_SWITCH_RULES = {
    duration: 90,
    canvasWidth: 800,
    canvasHeight: 360,
    maxLanes: 4,
    startingLaneCount: 2,
    lane3UnlockSeconds: 30,
    lane4UnlockSeconds: 60,
    startingIntegrity: 3,
    droneSpawnX: 64,
    gateX: 680,
    droneWidth: 32,
    droneHeight: 22,
    initialDroneSpeed: 140,
    finalDroneSpeed: 240,
    initialSpawnInterval: 2.2,
    finalSpawnInterval: 1.1,
    maxUpdateDelta: 0.1,
} as const

export type SignalSwitchOutcome =
    | 'playing'
    | 'systems-failed'
    | 'survived'

export interface SignalSwitchConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    maxLanes: number
    startingLaneCount: number
    lane3UnlockSeconds: number
    lane4UnlockSeconds: number
    startingIntegrity: number
    droneSpawnX: number
    gateX: number
    droneWidth: number
    droneHeight: number
    initialDroneSpeed: number
    finalDroneSpeed: number
    initialSpawnInterval: number
    finalSpawnInterval: number
    maxUpdateDelta: number
    rng: () => number
}

export interface SignalSwitchDrone {
    id: string
    laneIndex: number
    signal: SignalSwitchSignal
    x: number
}

export interface SignalSwitchState extends BaseGameState {
    outcome: SignalSwitchOutcome
    activeLaneCount: number
    gateSignals: SignalSwitchSignal[]
    drones: SignalSwitchDrone[]
    integrity: number
    safePasses: number
    crashes: number
    combo: number
    maxCombo: number
    droneSpeed: number
    spawnInterval: number
}

export interface SignalSwitchStats extends BaseGameStats {
    outcome: SignalSwitchOutcome
    safePasses: number
    crashes: number
    maxCombo: number
    integrityRemaining: number
}

export interface SignalSwitchGameData {
    safePasses: number
    crashes: number
    maxCombo: number
    integrityRemaining: number
    survivedFullRun: boolean
}

export function createSignalSwitchConfig(
    overrides: Partial<SignalSwitchConfig> = {}
): SignalSwitchConfig {
    return {
        ...SIGNAL_SWITCH_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        rng: Math.random,
        ...overrides,
    }
}
```

Keep the rule source flat. Do not introduce difficulty presets or a lane descriptor registry.

- [ ] **Step 3: Write RED scoring tests for the exact combo curve**

Create `src/lib/games/signal-switch/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calculateSignalSwitchPassPoints } from './scoring'

describe('calculateSignalSwitchPassPoints', () => {
    it.each([
        [1, 100],
        [2, 120],
        [5, 180],
        [9, 260],
        [20, 260],
        [0, 100],
        [-4, 100],
        [Number.NaN, 100],
    ])('scores combo %s as %i', (combo, expected) => {
        expect(calculateSignalSwitchPassPoints(combo)).toBe(expected)
    })
})
```

Run:

```bash
bun run test:run src/lib/games/signal-switch/scoring.test.ts
```

Expected: RED because `scoring.ts` does not exist yet.

- [ ] **Step 4: Implement the single pass scorer**

Create `src/lib/games/signal-switch/scoring.ts`:

```ts
export const SIGNAL_SWITCH_BASE_PASS_POINTS = 100
export const SIGNAL_SWITCH_COMBO_STEP_POINTS = 20
export const SIGNAL_SWITCH_COMBO_BONUS_CAP = 8

export function calculateSignalSwitchPassPoints(
    comboAfterPass: number
): number {
    const safeCombo = Number.isFinite(comboAfterPass)
        ? Math.max(1, Math.floor(comboAfterPass))
        : 1
    const bonusSteps = Math.min(
        safeCombo - 1,
        SIGNAL_SWITCH_COMBO_BONUS_CAP
    )
    return (
        SIGNAL_SWITCH_BASE_PASS_POINTS +
        bonusSteps * SIGNAL_SWITCH_COMBO_STEP_POINTS
    )
}
```

Run:

```bash
bun run test:run src/lib/games/signal-switch/scoring.test.ts src/lib/games.test.ts
bun run typecheck
```

Expected: PASS / zero Astro-check errors.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/signal-switch/types.ts src/lib/games/signal-switch/scoring.ts src/lib/games/signal-switch/scoring.test.ts
git commit -m "feat(signal-switch): add contracts and scoring"
```

---

### Task 2: Implement gate cycling, fair drone traffic, integrity, and lifecycle

**Files:**
- Create: `src/lib/games/signal-switch/SignalSwitchGame.ts`
- Create: `src/lib/games/signal-switch/SignalSwitchGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`
- Reuse unchanged: `src/lib/games/shared/utils.ts`

**Interfaces:**
- Consumes Task 1's config/state/signal/scoring contracts.
- Produces `SignalSwitchGame`, public `cycleGate(laneIndex: number): boolean`, BaseGame `start/reset/end` behavior, deterministic `getState()` values, and achievement-facing game data.
- No public spawn/debug mutation API is added; deterministic tests inject `rng` and advance `update()`.

- [ ] **Step 1: Write RED tests for idle state, first drone, and gate input**

Start `SignalSwitchGame.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest'
import { SignalSwitchGame } from './SignalSwitchGame'
import { createSignalSwitchConfig } from './types'

function createGame(rng: () => number = () => 0): SignalSwitchGame {
    return new SignalSwitchGame(createSignalSwitchConfig({ rng }))
}

describe('SignalSwitchGame lifecycle and gate controls', () => {
    it('starts idle with four Cyan gates, two lanes, and full integrity', () => {
        const game = createGame()
        expect(game.getState()).toMatchObject({
            outcome: 'playing',
            activeLaneCount: 2,
            gateSignals: ['cyan', 'cyan', 'cyan', 'cyan'],
            drones: [],
            integrity: 3,
            safePasses: 0,
            crashes: 0,
            combo: 0,
            maxCombo: 0,
            droneSpeed: 140,
            spawnInterval: 2.2,
            isActive: false,
        })
    })

    it('spawns the deterministic Lane 1 Magenta drone on start', () => {
        const rng = vi.fn(() => 0)
        const game = createGame(rng)
        game.start()

        expect(game.getState().drones).toEqual([
            { id: 'drone-0', laneIndex: 0, signal: 'magenta', x: 64 },
        ])
        expect(rng).not.toHaveBeenCalled()
    })

    it('cycles only active lanes in Cyan → Magenta → Amber order', () => {
        const game = createGame()
        expect(game.cycleGate(0)).toBe(false)
        game.start()

        expect(game.cycleGate(0)).toBe(true)
        expect(game.getState().gateSignals[0]).toBe('magenta')
        expect(game.cycleGate(0)).toBe(true)
        expect(game.getState().gateSignals[0]).toBe('amber')
        expect(game.cycleGate(0)).toBe(true)
        expect(game.getState().gateSignals[0]).toBe('cyan')

        expect(game.cycleGate(2)).toBe(false)
        expect(game.cycleGate(-1)).toBe(false)
        expect(game.cycleGate(4)).toBe(false)
        expect(game.cycleGate(1.5)).toBe(false)
    })
})
```

Run:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchGame.test.ts
```

Expected: RED because `SignalSwitchGame.ts` does not exist.

- [ ] **Step 2: Implement the BaseGame shell, idle state, first drone, and gate cycling**

Create `SignalSwitchGame.ts` with the concrete class shape:

```ts
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { clamp, lerp } from '@/lib/games/shared/utils'
import { GameID } from '@/lib/games'
import { calculateSignalSwitchPassPoints } from './scoring'
import {
    SIGNAL_SWITCH_SIGNAL_ORDER,
    createSignalSwitchConfig,
    type SignalSwitchConfig,
    type SignalSwitchDrone,
    type SignalSwitchGameData,
    type SignalSwitchSignal,
    type SignalSwitchState,
    type SignalSwitchStats,
} from './types'

export class SignalSwitchGame extends BaseGame<
    SignalSwitchState,
    SignalSwitchConfig,
    SignalSwitchStats
> {
    private elapsedSimSeconds = 0
    private spawnElapsedSeconds = 0
    private droneSequence = 0

    constructor(
        config: SignalSwitchConfig = createSignalSwitchConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.SIGNAL_SWITCH, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): SignalSwitchState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            activeLaneCount: this.config.startingLaneCount,
            gateSignals: Array.from(
                { length: this.config.maxLanes },
                () => 'cyan' as const
            ),
            drones: [],
            integrity: this.config.startingIntegrity,
            safePasses: 0,
            crashes: 0,
            combo: 0,
            maxCombo: 0,
            droneSpeed: this.config.initialDroneSpeed,
            spawnInterval: this.config.initialSpawnInterval,
        }
    }

    cycleGate(laneIndex: number): boolean {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            !Number.isInteger(laneIndex) ||
            laneIndex < 0 ||
            laneIndex >= this.state.activeLaneCount
        ) {
            return false
        }

        const current = this.state.gateSignals[laneIndex]
        const currentIndex = SIGNAL_SWITCH_SIGNAL_ORDER.indexOf(current)
        this.state.gateSignals[laneIndex] =
            SIGNAL_SWITCH_SIGNAL_ORDER[
                (currentIndex + 1) % SIGNAL_SWITCH_SIGNAL_ORDER.length
            ]
        this.emitStateChange()
        return true
    }

    render(): void {}
    cleanup(): void {}
}
```

Implement `onGameStart()` to reset the three private counters and push exactly:

```ts
{
    id: this.droneId(),
    laneIndex: 0,
    signal: 'magenta',
    x: this.config.droneSpawnX,
}
```

Implement `onGameReset()` to set the same private counters to zero. Keep initial-state creation as the only gate/integrity reset authority.

Run the lifecycle test file again. Expected: the initial/start/gate tests pass while later update tests do not exist yet.

- [ ] **Step 3: Add RED tests for the simulation-time lane/speed/cadence ramp**

Add:

```ts
function advance(game: SignalSwitchGame, seconds: number): void {
    const steps = Math.round(seconds / 0.1)
    for (let i = 0; i < steps; i += 1) {
        game.update(0.1)
    }
}

it('unlocks lanes at 30s and 60s of accepted simulation time', () => {
    const game = createGame()
    game.start()

    advance(game, 29.9)
    expect(game.getState().activeLaneCount).toBe(2)
    game.update(0.1)
    expect(game.getState().activeLaneCount).toBe(3)

    advance(game, 29.9)
    expect(game.getState().activeLaneCount).toBe(3)
    game.update(0.1)
    expect(game.getState().activeLaneCount).toBe(4)
})

it('ramps speed up and spawn interval down from simulation time', () => {
    const game = createGame()
    game.start()
    advance(game, 45)

    expect(game.getState().droneSpeed).toBeCloseTo(190, 5)
    expect(game.getState().spawnInterval).toBeCloseTo(1.65, 5)
})

it('ignores invalid deltas and clamps one update to 0.1s', () => {
    const game = createGame()
    game.start()
    const before = game.getState().drones[0].x

    game.update(Number.NaN)
    game.update(-1)
    game.update(2)

    expect(game.getState().drones[0].x - before).toBeCloseTo(14, 5)
})
```

The tests use `update()` only; do not advance fake wall-clock time to test difficulty.

- [ ] **Step 4: Implement the ramp and accepted-update clamp**

Add helpers:

```ts
private activeLaneCountForElapsed(): number {
    if (this.elapsedSimSeconds >= this.config.lane4UnlockSeconds) return 4
    if (this.elapsedSimSeconds >= this.config.lane3UnlockSeconds) return 3
    return this.config.startingLaneCount
}

private syncDifficulty(): void {
    const progress = clamp(
        this.elapsedSimSeconds / this.config.duration,
        0,
        1
    )
    this.state.activeLaneCount = this.activeLaneCountForElapsed()
    this.state.droneSpeed = lerp(
        this.config.initialDroneSpeed,
        this.config.finalDroneSpeed,
        progress
    )
    this.state.spawnInterval = lerp(
        this.config.initialSpawnInterval,
        this.config.finalSpawnInterval,
        progress
    )
}
```

Start `update(deltaTime)` with:

```ts
if (
    !this.state.isActive ||
    this.state.isPaused ||
    !Number.isFinite(deltaTime) ||
    deltaTime <= 0
) {
    return
}

const step = Math.min(deltaTime, this.config.maxUpdateDelta)
this.elapsedSimSeconds = Math.min(
    this.config.duration,
    this.elapsedSimSeconds + step
)
this.syncDifficulty()
```

The remaining movement/spawn work is added in the next steps.

- [ ] **Step 5: Add RED tests for crossing, combo, integrity, and terminal outcome**

Use a narrow injected config so a single accepted frame crosses the gate:

```ts
function crossingGame(): SignalSwitchGame {
    return new SignalSwitchGame(
        createSignalSwitchConfig({
            droneSpawnX: 90,
            gateX: 100,
            initialDroneSpeed: 200,
            finalDroneSpeed: 200,
            initialSpawnInterval: 99,
            finalSpawnInterval: 99,
            rng: () => 0,
        })
    )
}

it('resolves a matched drone that crosses from before to beyond the gate', () => {
    const game = crossingGame()
    game.start()
    game.cycleGate(0) // Cyan → Magenta
    game.update(0.1) // 90 → 110; endpoint-only overlap is unnecessary

    expect(game.getState()).toMatchObject({
        drones: [],
        safePasses: 1,
        crashes: 0,
        combo: 1,
        maxCombo: 1,
        integrity: 3,
        score: 100,
    })
})

it('resets combo and integrity without subtracting prior score', () => {
    const game = crossingGame()
    game.start()
    game.cycleGate(0)
    game.update(0.1)
    expect(game.getState().score).toBe(100)

    game.reset()
    game.start() // first drone is Magenta, gate is Cyan
    game.update(0.1)

    expect(game.getState()).toMatchObject({
        combo: 0,
        crashes: 1,
        integrity: 2,
        score: 0,
    })
})
```

For fatal behavior, use normal public start/update with `startingIntegrity: 1` and an `onEnd` spy:

```ts
it('ends once when the final integrity point is lost', async () => {
    const onEnd = vi.fn()
    const game = new SignalSwitchGame(
        createSignalSwitchConfig({
            startingIntegrity: 1,
            droneSpawnX: 90,
            gateX: 100,
            initialDroneSpeed: 200,
            finalDroneSpeed: 200,
            initialSpawnInterval: 99,
            finalSpawnInterval: 99,
            rng: () => 0,
        }),
        { onEnd }
    )
    game.start()
    game.update(0.1)
    game.update(0.1)
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1))
    expect(game.getState()).toMatchObject({
        outcome: 'systems-failed',
        integrity: 0,
        isActive: false,
        isGameOver: true,
    })
})
```

Mock the existing score-save boundary in this test file the same way recent BaseGame game tests do so no network/database call escapes Vitest.

- [ ] **Step 6: Implement crossing resolution and terminal behavior**

Move each drone and resolve crossing with previous/next X:

```ts
private moveAndResolveDrones(step: number): boolean {
    const remaining: SignalSwitchDrone[] = []

    for (const drone of this.state.drones) {
        const previousX = drone.x
        const nextX = previousX + this.state.droneSpeed * step
        const crossedGate =
            previousX < this.config.gateX && nextX >= this.config.gateX

        if (!crossedGate) {
            remaining.push({ ...drone, x: nextX })
            continue
        }

        if (!this.resolveDrone(drone)) {
            this.state.drones = []
            return false
        }
    }

    this.state.drones = remaining
    return true
}
```

Resolve one crossing:

```ts
private resolveDrone(drone: SignalSwitchDrone): boolean {
    const matched =
        drone.signal === this.state.gateSignals[drone.laneIndex]

    if (matched) {
        this.state.safePasses += 1
        this.state.combo += 1
        this.state.maxCombo = Math.max(
            this.state.maxCombo,
            this.state.combo
        )
        this.addScore(
            calculateSignalSwitchPassPoints(this.state.combo),
            'signal_switch_safe_pass'
        )
        return true
    }

    this.state.crashes += 1
    this.state.combo = 0
    this.state.integrity = Math.max(0, this.state.integrity - 1)

    if (this.state.integrity > 0) {
        return true
    }

    this.state.outcome = 'systems-failed'
    this.emitStateChange()
    this.end().catch((error: unknown) =>
        console.error('SignalSwitch end failed', error)
    )
    return false
}
```

In `update()` call `moveAndResolveDrones(step)` after the difficulty sync and return immediately when it returns `false`. This guarantees a fatal crossing cannot continue into random spawning.

- [ ] **Step 7: Add RED tests for fair random spawning and congestion deferral**

Add deterministic tests that lock the RNG contract rather than implementation call counts unrelated to spawning:

```ts
it('spawns only into free active lanes with a non-matching signal', () => {
    const rng = vi
        .fn<() => number>()
        .mockReturnValueOnce(0.99) // choose last free lane
        .mockReturnValueOnce(0.99) // choose second non-matching signal
    const game = new SignalSwitchGame(
        createSignalSwitchConfig({
            initialSpawnInterval: 0.1,
            finalSpawnInterval: 0.1,
            initialDroneSpeed: 1,
            finalDroneSpeed: 1,
            rng,
        })
    )
    game.start() // lane 0 already occupied
    game.update(0.1)

    const spawned = game.getState().drones.find(d => d.id === 'drone-1')
    expect(spawned?.laneIndex).toBe(1)
    expect(spawned?.signal).not.toBe(game.getState().gateSignals[1])
    expect(rng).toHaveBeenCalledTimes(2)
})

it('defers one ready spawn with zero RNG reads while all active lanes are busy', () => {
    const rng = vi.fn(() => 0)
    const game = new SignalSwitchGame(
        createSignalSwitchConfig({
            initialSpawnInterval: 0.1,
            finalSpawnInterval: 0.1,
            initialDroneSpeed: 1,
            finalDroneSpeed: 1,
            rng,
        })
    )
    game.start()
    game.update(0.1) // fills lane 1
    expect(rng).toHaveBeenCalledTimes(2)

    rng.mockClear()
    for (let i = 0; i < 20; i += 1) game.update(0.1)
    expect(game.getState().drones).toHaveLength(2)
    expect(rng).not.toHaveBeenCalled()
})
```

Add a third test with a compact crossing config: after congestion has held ready for multiple updates, resolve one lane and assert exactly one new drone appears and exactly two RNG reads occur, not a burst of multiple drones.

- [ ] **Step 8: Implement free-lane selection and the capped spawn accumulator**

Use one bounded random-index helper:

```ts
private randomIndex(length: number): number {
    const sample = this.config.rng()
    const safeSample = Number.isFinite(sample) ? sample : 0
    return Math.min(
        length - 1,
        Math.max(0, Math.floor(safeSample * length))
    )
}

private freeActiveLanes(): number[] {
    const occupied = new Set(this.state.drones.map(drone => drone.laneIndex))
    return Array.from(
        { length: this.state.activeLaneCount },
        (_, laneIndex) => laneIndex
    ).filter(laneIndex => !occupied.has(laneIndex))
}

private trySpawnRandomDrone(): boolean {
    const freeLanes = this.freeActiveLanes()
    if (freeLanes.length === 0) return false

    const laneIndex = freeLanes[this.randomIndex(freeLanes.length)]
    const currentGate = this.state.gateSignals[laneIndex]
    const candidates = SIGNAL_SWITCH_SIGNAL_ORDER.filter(
        signal => signal !== currentGate
    )
    const signal = candidates[this.randomIndex(candidates.length)]

    this.state.drones.push({
        id: this.droneId(),
        laneIndex,
        signal,
        x: this.config.droneSpawnX,
    })
    return true
}
```

After successful movement resolution in `update()`:

```ts
this.spawnElapsedSeconds = Math.min(
    this.state.spawnInterval,
    this.spawnElapsedSeconds + step
)

if (
    this.spawnElapsedSeconds >= this.state.spawnInterval &&
    this.trySpawnRandomDrone()
) {
    this.spawnElapsedSeconds = 0
}

this.emitStateChange()
```

When all lanes are occupied, `trySpawnRandomDrone()` returns before `randomIndex()`, so no RNG reads occur and the accumulator stays capped at one ready interval.

- [ ] **Step 9: Add stats, game data, timeout outcome, reset-ID regression, and final Task 2 gates**

Implement:

```ts
getGameStats(): SignalSwitchStats {
    return {
        finalScore: this.state.score,
        timeElapsed: Math.floor(this.getTimerStatus().elapsedTime),
        gameCompleted: this.state.isGameOver,
        outcome: this.state.outcome,
        safePasses: this.state.safePasses,
        crashes: this.state.crashes,
        maxCombo: this.state.maxCombo,
        integrityRemaining: this.state.integrity,
    }
}

protected getGameData(): Record<string, unknown> {
    const data = {
        safePasses: this.state.safePasses,
        crashes: this.state.crashes,
        maxCombo: this.state.maxCombo,
        integrityRemaining: this.state.integrity,
        survivedFullRun: this.state.outcome === 'survived',
    } satisfies SignalSwitchGameData
    return data
}

protected handleTimeUp(): void {
    this.state.outcome = 'survived'
    super.handleTimeUp()
}
```

Add a fake-timer timeout test that advances the authoritative BaseGame timer to 90 seconds and verifies `outcome === 'survived'` plus one end callback.

Add a reset/restart test:

```ts
game.start()
expect(game.getState().drones[0].id).toBe('drone-0')
game.reset()
expect(game.getState().drones).toEqual([])
expect(game.getState().gateSignals).toEqual([
    'cyan', 'cyan', 'cyan', 'cyan',
])
game.start()
expect(game.getState().drones[0]).toMatchObject({
    id: 'drone-0',
    laneIndex: 0,
    signal: 'magenta',
})
```

Run:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchGame.test.ts src/lib/games/signal-switch/scoring.test.ts
bun run typecheck
```

Expected: PASS / zero Astro-check errors.

- [ ] **Step 10: Commit Task 2**

```bash
git add src/lib/games/signal-switch/SignalSwitchGame.ts src/lib/games/signal-switch/SignalSwitchGame.test.ts
git commit -m "feat(signal-switch): implement lane traffic gameplay"
```

---

### Task 3: Add the two-layer Pixi renderer with non-color signal markers

**Files:**
- Create: `src/lib/games/signal-switch/SignalSwitchRenderer.ts`
- Create: `src/lib/games/signal-switch/SignalSwitchRenderer.test.ts`
- Reuse unchanged: `src/lib/games/renderers/PixiJSRenderer.ts`

**Interfaces:**
- Consumes `SignalSwitchConfig`, `SignalSwitchState`, and the signal union.
- Produces `SignalSwitchRenderer`, `SignalSwitchRendererConfig`, and `createSignalSwitchRendererConfig(config)`.
- Renderer reads state only; it never calls `cycleGate`, changes drones, awards score, or schedules traffic.

- [ ] **Step 1: Write RED renderer setup/config tests**

Create tests that follow the existing Gravity Flip renderer mock pattern and lock:

```ts
const config = createSignalSwitchConfig()
const rendererConfig = createSignalSwitchRendererConfig(config)
expect(rendererConfig).toMatchObject({
    type: 'canvas',
    container: '#signal-switch-canvas',
    width: 800,
    height: 360,
    responsive: false,
    backgroundColor: 0x020817,
    antialias: true,
})
```

After `await renderer.initialize()`, assert two game-owned `PIXI.Graphics` children are attached after base setup: one static lane layer and one dynamic scene layer.

Run:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchRenderer.test.ts
```

Expected: RED because the renderer file does not exist.

- [ ] **Step 2: Implement the renderer shell and static lane layer**

Use the existing renderer base, with one config extension for `gateX` and `maxLanes`:

```ts
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type {
    SignalSwitchConfig,
    SignalSwitchDrone,
    SignalSwitchSignal,
    SignalSwitchState,
} from './types'

export interface SignalSwitchRendererConfig extends PixiJSRendererConfig {
    gateX: number
    maxLanes: number
}

export class SignalSwitchRenderer extends PixiJSRenderer {
    private signalConfig: SignalSwitchRendererConfig
    private lanesGraphic: PIXI.Graphics | null = null
    private sceneGraphic: PIXI.Graphics | null = null

    constructor(config: SignalSwitchRendererConfig) {
        super(config)
        this.signalConfig = config
    }

    async setup(): Promise<void> {
        await super.setup()
        const app = this.getApp()
        if (!app) {
            throw new Error(
                'SignalSwitchRenderer: app not available after setup'
            )
        }
        this.lanesGraphic = this.createGraphics()
        this.sceneGraphic = this.createGraphics()
        app.stage.addChild(this.lanesGraphic)
        app.stage.addChild(this.sceneGraphic)
        this.drawLanes()
    }
}
```

`drawLanes()` derives `laneHeight = height / maxLanes`, draws the dark background, horizontal separators at each lane boundary, and a thin vertical gate-zone guide around configured `gateX`. Do not author four lane-center constants.

- [ ] **Step 3: Add RED tests that prove markers differ by geometry, not only color**

Render one state containing active Cyan/Magenta/Amber gates and drones. Spy on Graphics calls and assert:

- Cyan marker uses a circle call.
- Magenta marker emits a three-corner triangle path (`moveTo` plus `lineTo` calls).
- Amber marker emits a four-corner diamond path.
- a locked fourth lane causes a full-lane translucent rectangle after the active gate drawings.

Do not assert exact draw-call totals for unrelated background strokes; assert the load-bearing marker operations/coordinates only.

- [ ] **Step 4: Implement dynamic gates, drones, lock overlays, and cleanup**

Use one exhaustive Pixi color record:

```ts
const SIGNAL_COLORS: Readonly<Record<SignalSwitchSignal, number>> = {
    cyan: 0x22d3ee,
    magenta: 0xec4899,
    amber: 0xf59e0b,
}
```

Derive lane center as:

```ts
private laneCenterY(laneIndex: number): number {
    const height = this.signalConfig.height ?? 360
    return (
        (laneIndex + 0.5) *
        (height / this.signalConfig.maxLanes)
    )
}
```

Implement a single marker dispatcher:

```ts
private drawSignalMarker(
    graphic: PIXI.Graphics,
    signal: SignalSwitchSignal,
    x: number,
    y: number,
    radius: number
): void {
    const color = SIGNAL_COLORS[signal]
    switch (signal) {
        case 'cyan':
            graphic.circle(x, y, radius).fill({ color, alpha: 0.95 })
            return
        case 'magenta':
            graphic
                .moveTo(x, y - radius)
                .lineTo(x + radius, y + radius)
                .lineTo(x - radius, y + radius)
                .lineTo(x, y - radius)
                .fill({ color, alpha: 0.95 })
            return
        case 'amber':
            graphic
                .moveTo(x, y - radius)
                .lineTo(x + radius, y)
                .lineTo(x, y + radius)
                .lineTo(x - radius, y)
                .lineTo(x, y - radius)
                .fill({ color, alpha: 0.95 })
            return
    }
}
```

`renderGame()` clears only the dynamic layer, draws active gate beams + markers, each drone body + matching marker, then draws locked-lane overlays for indices `>= activeLaneCount`.

`cleanup()` destroys/nulls both game-owned graphics then calls `super.cleanup()`, matching Gravity Flip's current renderer lifecycle.

Implement `createSignalSwitchRendererConfig(config)`:

```ts
return {
    type: 'canvas',
    container: '#signal-switch-canvas',
    width: config.canvasWidth,
    height: config.canvasHeight,
    gateX: config.gateX,
    maxLanes: config.maxLanes,
    responsive: false,
    backgroundColor: 0x020817,
    antialias: true,
}
```

Run:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchRenderer.test.ts
bun run typecheck
```

Expected: PASS / zero Astro-check errors.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/games/signal-switch/SignalSwitchRenderer.ts src/lib/games/signal-switch/SignalSwitchRenderer.test.ts
git commit -m "feat(signal-switch): add Pixi lane renderer"
```

---

### Task 4: Wire the single-instance initializer and Astro route before catalog activation

**Files:**
- Create: `src/lib/games/signal-switch/initFramework.ts`
- Create: `src/lib/games/signal-switch/initFramework.test.ts`
- Create: `src/pages/signal-switch/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Reuse unchanged: `src/components/games/GamePage.astro`

**Interfaces:**
- Produces `initSignalSwitchGameFramework(): Promise<SignalSwitchInitResult | undefined>` and route `/signal-switch`.
- `SignalSwitchInitResult` exposes `game`, `renderer`, `getGame()`, `getState()`, and idempotent `cleanup()`.
- Astro page exposes `window.signalSwitchGame = handle` after successful initialization.
- Do not add Signal Switch to `GAMES` yet; this task first makes the route real.

- [ ] **Step 1: Add RED initializer tests for missing DOM and idle initialization**

Build a jsdom fixture with:

```html
<div id="signal-switch-container">
  <div id="signal-switch-canvas"></div>
</div>
<span id="score">0</span>
<span id="time-remaining">90</span>
<span id="integrity">3 / 3</span>
<span id="combo">0</span>
<span id="safe-passes">0</span>
<span id="lanes-online">2 / 4</span>
<span id="drone-speed">140</span>
<p id="signal-switch-status"></p>
<button id="start-btn"></button>
<button id="reset-btn"></button>
<div id="gate-controls">
  <button data-signal-lane="0"></button>
  <button data-signal-lane="1"></button>
  <button data-signal-lane="2"></button>
  <button data-signal-lane="3"></button>
</div>
<div id="game-over-overlay" class="hidden"></div>
<span id="game-over-title"></span>
<span id="final-outcome"></span>
<span id="final-score"></span>
<span id="final-safe-passes"></span>
<span id="final-crashes"></span>
<span id="final-max-combo"></span>
<span id="final-integrity"></span>
<button id="play-again-btn"></button>
```

With the renderer module mocked like Gravity Flip's initializer tests, assert:

- missing `#signal-switch-container` routes through `handleGameError` and returns `undefined`;
- valid init renders once, returns the game handle, sets idle HUD to `3 / 3`, `0`, `0`, `2 / 4`, `140`, and keeps Start visible;
- idle gate buttons display Cyan Circle text; all are disabled until the run starts.

- [ ] **Step 2: Implement initializer helpers, callbacks, one game, and one rAF loop**

Follow the current Gravity Flip structure. Keep these helper responsibilities local:

```ts
function isEditableTarget(target: EventTarget | null): boolean { /* same concrete HTMLElement/input/textarea/select/contentEditable checks as Gravity Flip */ }
function outcomeTitle(outcome: SignalSwitchOutcome): string {
    return outcome === 'survived' ? 'SHIFT COMPLETE' : 'SIGNAL LOST'
}
function outcomeLabel(outcome: SignalSwitchOutcome): string {
    return outcome === 'survived' ? 'Survived' : 'Systems failed'
}
```

Implement `syncHud(state)` with exact DOM values:

```ts
setText('integrity', `${state.integrity} / ${config.startingIntegrity}`)
setText('combo', String(state.combo))
setText('safe-passes', String(state.safePasses))
setText('lanes-online', `${state.activeLaneCount} / ${config.maxLanes}`)
setText('drone-speed', String(Math.round(state.droneSpeed)))
setText('score', String(state.score))
setText('time-remaining', String(state.timeRemaining))
```

Implement `syncControls(state)` by querying `#gate-controls [data-signal-lane]`, parsing each lane index, looking up `SIGNAL_SWITCH_SIGNAL_META[state.gateSignals[index]]`, and setting:

```text
textContent = `Lane ${index + 1}: ${glyph} ${label}`
disabled = !state.isActive || index >= state.activeLaneCount
aria-label = `Lane ${index + 1} gate, ${label} ${shape-name}`
```

Use explicit shape names Circle/Triangle/Diamond from a local display-only mapping; do not infer shape names by glyph parsing.

Track `lastActiveLaneCount` and `lastIntegrity`. `onStateChange` announces only when lanes increase or integrity decreases. `onEnd` fills final values and announces exactly one terminal message.

After renderer setup, create one `SignalSwitchGame(config, enhancedCallbacks)`, subscribe once to its `end` event for existing achievement/challenge notifications, and install one rAF loop:

```ts
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
```

Override the Pixi canvas inline styles after setup:

```ts
canvas.style.width = '100%'
canvas.style.height = 'auto'
```

- [ ] **Step 3: Add RED delegated-button and keyboard tests**

After `game.start()` through the real Start listener, verify:

```ts
const lane1 = document.querySelector<HTMLButtonElement>(
    '[data-signal-lane="0"]'
)!
lane1.click()
expect(handle!.getState().gateSignals[0]).toBe('magenta')
expect(lane1.textContent).toContain('▲ Magenta')

const lane3 = document.querySelector<HTMLButtonElement>(
    '[data-signal-lane="2"]'
)!
expect(lane3.disabled).toBe(true)
lane3.click()
expect(handle!.getState().gateSignals[2]).toBe('cyan')
```

Dispatch `KeyboardEvent('keydown', { key: '2', bubbles: true })` on `document` and assert Lane 2 cycles once. Add separate tests proving no cycle for:

- `repeat: true`;
- `ctrlKey`, `metaKey`, or `altKey`;
- input/textarea/select/contentEditable targets;
- a lane button target, so native focused-button activation cannot double-cycle;
- key `3` before lane 3 is active.

Use fake rAF/game updates to reach 30 simulated seconds, then assert lane 3 becomes enabled and key `3` cycles it.

- [ ] **Step 4: Implement one delegated click listener, number-key mapping, Reset/Play Again, unload warning, and cleanup**

Click delegation:

```ts
const gateControlsHandler: EventListener = event => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>('[data-signal-lane]')
    if (!button || !gateControls?.contains(button)) return
    const laneIndex = Number(button.dataset.signalLane)
    game.cycleGate(laneIndex)
}
```

Keyboard mapping:

```ts
const KEY_TO_LANE: Readonly<Record<string, number>> = {
    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
}
```

Ignore repeat/modifiers/editable/button targets, look up the lane, call `cycleGate`, and call `preventDefault()` only when the game returned `true`.

Reset handler:

```ts
game.reset()
renderer.render(game.getState())
syncHud(game.getState())
syncControls(game.getState())
hideOverlay()
setStartVisible(true)
```

Play Again handler:

```ts
hideOverlay()
game.start()
```

`beforeunload` warns only while `game.getState().isActive`.

`cleanup()` is guarded by `cleanedUp`, cancels rAF, removes every tracked listener, unsubscribes the game `end` handler, calls `renderer.destroy()`, then `game.destroy()` exactly once.

- [ ] **Step 5: Add RED terminal/live-region tests and make the callbacks satisfy them**

Use deterministic injected/game-handle advancement to assert:

- lane 3 unlock writes `Lane 3 online.` to `#signal-switch-status` once;
- a mismatch writes `Signal mismatch. Integrity 2 of 3.`;
- non-fatal gate cycling does not overwrite the live region;
- final failure writes `SIGNAL LOST`, `Systems failed`, final counters, shows the overlay, and announces `Signal lost. Systems failed.`;
- timeout writes `SHIFT COMPLETE`, `Survived`, and announces `Shift complete. Signal network stable.`;
- Reset hides the overlay and returns the controls to idle/disabled state;
- Play Again immediately produces an active fresh run with Lane 1 Magenta and three integrity;
- cleanup removes the unload warning and is idempotent.

- [ ] **Step 6: Create the Astro page with the complete static DOM contract**

Create `src/pages/signal-switch/index.astro` using `GamePage`, `Badge`, `Button`, and `Card`.

Freeze the wrapper:

```astro
<GamePage
  gameId="signal-switch"
  title="Signal Switch"
  description="Switch each lane gate to match incoming drone signals for 90 seconds."
  icon="🚦"
  initialTime={90}
  showPause={false}
  showEnd={false}
  showReset={true}
  overlayTitle="SIGNAL LOST"
>
```

Game board:

```astro
<div slot="game-board" id="signal-switch-container" class="w-full max-w-[800px]">
  <div id="signal-switch-canvas" class="overflow-hidden rounded-lg bg-black/30"></div>
  <p id="signal-switch-status" class="sr-only" aria-live="polite"></p>
</div>
```

Additional stats use the exact IDs `integrity`, `combo`, `safe-passes`, `lanes-online`, and `drone-speed` with idle values `3 / 3`, `0`, `0`, `2 / 4`, and `140`.

Controls contain Start/Reset and this 2×2 native-button grid:

```astro
<div id="gate-controls" class="grid w-full max-w-md grid-cols-2 gap-2">
  <Button type="button" data-signal-lane="0">Lane 1: ● Cyan</Button>
  <Button type="button" data-signal-lane="1">Lane 2: ● Cyan</Button>
  <Button type="button" data-signal-lane="2" disabled>Lane 3: ● Cyan</Button>
  <Button type="button" data-signal-lane="3" disabled>Lane 4: ● Cyan</Button>
</div>
```

Game-info copy must explain:

- press/click the matching lane control before a drone reaches its gate;
- signals cycle Cyan Circle → Magenta Triangle → Amber Diamond;
- three wrong gates end the run;
- lanes 3 and 4 come online later;
- safe passes build combo points.

Final stats use IDs `final-outcome`, `final-safe-passes`, `final-crashes`, `final-max-combo`, `final-integrity`.

After `</GamePage>`, initialize and expose the handle:

```ts
initSignalSwitchGameFramework()
    .then(handle => {
        if (handle) {
            ;(window as Window & {
                signalSwitchGame?: typeof handle
            }).signalSwitchGame = handle
        }
    })
    .catch(error => {
        console.error('Signal Switch failed to initialize', error)
    })
```

Page CSS:

```css
#signal-switch-canvas :global(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  touch-action: manipulation;
}
```

- [ ] **Step 7: Extend markup tests without activating the game registry yet**

Add `signalSwitchMarkup` and an explicit test that checks:

```ts
for (const id of [
    'signal-switch-container',
    'signal-switch-canvas',
    'gate-controls',
    'integrity',
    'combo',
    'safe-passes',
    'lanes-online',
    'drone-speed',
    'final-outcome',
    'final-safe-passes',
    'final-crashes',
    'final-max-combo',
    'final-integrity',
    'start-btn',
    'reset-btn',
]) {
    expect(signalSwitchMarkup).toContain(`id="${id}"`)
}
expect(signalSwitchMarkup.match(/data-signal-lane="[0-3]"/g)).toHaveLength(4)
expect(signalSwitchMarkup).toContain('initialTime={90}')
expect(signalSwitchMarkup).toContain('showPause={false}')
expect(signalSwitchMarkup).toContain('showEnd={false}')
expect(signalSwitchMarkup).not.toContain('id="end-btn"')
expect(signalSwitchMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initSignalSwitchGameFramework/
)
```

Do **not** add `'signal-switch'` to the shared `games` array until Task 5 activates its `GAMES` entry.

Run:

```bash
bun run test:run src/lib/games/signal-switch/initFramework.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS / route exists while catalog is still unchanged.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/lib/games/signal-switch/initFramework.ts src/lib/games/signal-switch/initFramework.test.ts src/pages/signal-switch/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(signal-switch): wire route and controls"
```

---

### Task 5: Activate catalog/shared typing and add four achievements

**Files:**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `src/pages/game-board-markup.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Activates the already-existing Task 4 route in `GAMES`.
- Adds canonical `SignalSwitchGameData` to the shared `GameData`/achievement type surface.
- Adds exactly four Signal Switch achievements through the existing code-defined achievement engine.
- Keeps `getGameUrl()`, all-games-navigation derivation, score/API/database code, and `AGENTS.md` unchanged.

- [ ] **Step 1: Add RED registration/organism tests for the final catalog contract**

Add to `games.test.ts`:

```ts
describe('Signal Switch registration', () => {
    it('has the exact active registry entry', () => {
        expect(getGameById(GameID.SIGNAL_SWITCH)).toMatchObject({
            id: GameID.SIGNAL_SWITCH,
            name: 'Signal Switch',
            description:
                'Switch lane gates to match incoming drone signals before impact',
            category: 'action',
            maxPlayers: 1,
            estimatedDuration: '1-2 minutes',
            difficulty: 'medium',
            tags: [
                'timing',
                'reflex',
                'lanes',
                'single-player',
                'signals',
            ],
            isActive: true,
            organism: { shape: 'lattice', color: 'teal' },
            depth: 'shallow',
        })
        expect(getGameIcon(GameID.SIGNAL_SWITCH)).toBe('🚦')
        expect(getGameUrl(GameID.SIGNAL_SWITCH)).toBe('/signal-switch')
        expect(
            GAMES.filter(game => game.id === GameID.SIGNAL_SWITCH)
        ).toHaveLength(1)
    })
})
```

Change only the organism partition assertion to:

```ts
it('partitions games into 7 / 9 / 4 by depth', () => {
    expect(getGamesByDepth('shallow')).toHaveLength(7)
    expect(getGamesByDepth('mid')).toHaveLength(9)
    expect(getGamesByDepth('abyssal')).toHaveLength(4)
    // keep the existing no-double-count and label checks
})
```

Run:

```bash
bun run test:run src/lib/games.test.ts src/lib/organisms.test.ts
```

Expected: RED because the active registry entry is not present and shallow count is still 6.

- [ ] **Step 2: Activate the exact GAMES record now that `/signal-switch` exists**

Append the active record so the existing shallow filtering places it after Pattern Pulse:

```ts
{
    id: GameID.SIGNAL_SWITCH,
    name: 'Signal Switch',
    description:
        'Switch lane gates to match incoming drone signals before impact',
    category: 'action',
    maxPlayers: 1,
    estimatedDuration: '1-2 minutes',
    difficulty: 'medium',
    tags: ['timing', 'reflex', 'lanes', 'single-player', 'signals'],
    isActive: true,
    organism: { shape: 'lattice', color: 'teal' },
    depth: 'shallow',
},
```

Do not change `getGameUrl()`; `signal_switch` already derives `/signal-switch`.

Run the two registration suites again. Expected: PASS, including the existing adjacent-organism invariant.

- [ ] **Step 3: Add the canonical shared game-data alias and union member**

In `src/lib/games/shared/types.ts` add:

```ts
// Signal Switch-specific game data (canonical definition in signal-switch/types.ts)
export type SignalSwitchGameData =
    import('../signal-switch/types').SignalSwitchGameData
```

Add `| SignalSwitchGameData` to `GameData`.

In `achievements.ts`, import `SignalSwitchGameData` from shared types and add it to `AchievementCheckData` immediately with the other canonical recent-game types.

Run:

```bash
bun run typecheck
```

Expected: zero Astro-check errors.

- [ ] **Step 4: Write RED achievement tests for all four exact conditions**

Use the existing exported `ACHIEVEMENTS` and a small lookup helper in `achievements.test.ts`:

```ts
const signalAchievements = ACHIEVEMENTS.filter(
    achievement => achievement.gameId === GameID.SIGNAL_SWITCH
)
expect(signalAchievements.map(a => a.id)).toEqual([
    'signal_switch_first_clearance',
    'signal_switch_streak',
    'signal_switch_clean_shift',
    'signal_switch_traffic_controller',
])
```

Lock the in-game conditions by calling their checks with concrete data:

```ts
const clean = ACHIEVEMENTS.find(
    a => a.id === 'signal_switch_clean_shift'
)!
expect(clean.condition.check?.({
    safePasses: 30,
    crashes: 0,
    maxCombo: 30,
    integrityRemaining: 3,
    survivedFullRun: true,
}, 4000)).toBe(true)
expect(clean.condition.check?.({
    safePasses: 30,
    crashes: 1,
    maxCombo: 12,
    integrityRemaining: 2,
    survivedFullRun: true,
}, 3000)).toBe(false)
```

Add equivalent true/false checks for `maxCombo >= 10` and `survivedFullRun && safePasses >= 40`, and assert First Clearance uses `type: 'score_threshold', threshold: 100`.

Run:

```bash
bun run test:run src/lib/achievements.test.ts
```

Expected: RED because no Signal Switch achievements exist yet.

- [ ] **Step 5: Add exactly four achievement definitions**

Add:

```ts
{
    id: 'signal_switch_first_clearance',
    name: 'First Clearance',
    description: 'Guide your first drone safely through Signal Switch',
    logo: '🚦',
    gameId: GameID.SIGNAL_SWITCH,
    condition: { type: 'score_threshold', threshold: 100 },
    rarity: AchievementRarity.COMMON,
},
{
    id: 'signal_switch_streak',
    name: 'Signal Streak',
    description: 'Reach a 10-drone combo in Signal Switch',
    logo: '🔟',
    gameId: GameID.SIGNAL_SWITCH,
    condition: {
        type: 'in_game',
        check: (gameData: SignalSwitchGameData) =>
            gameData.maxCombo >= 10,
    },
    rarity: AchievementRarity.RARE,
},
{
    id: 'signal_switch_clean_shift',
    name: 'Clean Shift',
    description: 'Survive a full Signal Switch run without a crash',
    logo: '✨',
    gameId: GameID.SIGNAL_SWITCH,
    condition: {
        type: 'in_game',
        check: (gameData: SignalSwitchGameData) =>
            gameData.survivedFullRun && gameData.crashes === 0,
    },
    rarity: AchievementRarity.EPIC,
},
{
    id: 'signal_switch_traffic_controller',
    name: 'Traffic Controller',
    description: 'Survive a full run with at least 40 safe drone passes',
    logo: '🛸',
    gameId: GameID.SIGNAL_SWITCH,
    condition: {
        type: 'in_game',
        check: (gameData: SignalSwitchGameData) =>
            gameData.survivedFullRun && gameData.safePasses >= 40,
    },
    rarity: AchievementRarity.LEGENDARY,
},
```

Run:

```bash
bun run test:run src/lib/achievements.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add the route to the shared GamePage markup sweep and update repo guidance**

Append `'signal-switch'` to the `games` array in `src/pages/game-board-markup.test.ts`. The explicit Signal Switch DOM test was already added in Task 4.

Update `CLAUDE.md`:

- `19 fully implemented interactive games` → `20 fully implemented interactive games`;
- append `Signal Switch` to the overview game list;
- add `signal-switch/` to the `src/lib/games/` project tree;
- include Signal Switch in the PixiJS canvas renderer list;
- add a game-specific note: `Signal Switch: PixiJS lane-timing game with four native lane controls and a window.signalSwitchGame debug handle`.

Do not edit `AGENTS.md` directly.

Run:

```bash
bun run test:run src/lib/games.test.ts src/lib/organisms.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS / zero Astro-check errors.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/organisms.test.ts src/lib/achievements.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts CLAUDE.md
git commit -m "feat(signal-switch): register game and achievements"
```

---

### Task 6: Add browser lifecycle/mobile coverage, tune by manual play, and run full gates

**Files:**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify unchanged: `e2e/games/all-games-navigation.spec.ts`
- Potential tuning-only modifications after manual checkpoint: `src/lib/games/signal-switch/types.ts`, `src/lib/games/signal-switch/scoring.ts`, exact Signal Switch tests, `docs/superpowers/specs/2026-08-22-signal-switch-design.md`

**Interfaces:**
- Proves route/Pixi bootstrap, real native controls, one safe pass, integrity failure, Play Again, and 375×812 reachability without a 90-second wall-clock wait.
- Final tuning may change only documented tuning/scoring constants unless manual play reveals a structural defect.

- [ ] **Step 1: Add a Playwright helper that advances only the exposed game model**

In `play-coverage.spec.ts`, add a typed page-evaluate helper local to the Signal Switch tests:

```ts
async function advanceSignalSwitchUntil(
    page: Page,
    predicate: 'safe-pass' | 'game-over'
): Promise<void> {
    await page.evaluate(mode => {
        const handle = (window as Window & {
            signalSwitchGame?: {
                game: {
                    getState(): {
                        safePasses: number
                        isActive: boolean
                        isGameOver: boolean
                    }
                    update(deltaSeconds: number): void
                }
            }
        }).signalSwitchGame
        if (!handle) throw new Error('Signal Switch handle missing')

        for (let i = 0; i < 2000; i += 1) {
            const state = handle.game.getState()
            if (mode === 'safe-pass' && state.safePasses >= 1) return
            if (mode === 'game-over' && state.isGameOver) return
            handle.game.update(0.1)
        }
        throw new Error(`Signal Switch did not reach ${mode}`)
    }, predicate)
}
```

This deliberately advances game simulation, not BaseGame's real countdown. It is only an E2E acceleration seam through the existing page debug handle; do not add a production test-only API.

- [ ] **Step 2: Add the real-control safe-pass → reset → failure → Play Again journey**

Add one test:

```ts
test('Signal Switch plays a safe pass, can fail integrity, and re-arms', async ({ page }) => {
    await page.goto('/signal-switch')

    await expect(page.locator('#start-btn')).toBeVisible()
    await expect(page.locator('#integrity')).toHaveText('3 / 3')
    await expect(page.locator('#lanes-online')).toHaveText('2 / 4')
    await expect(page.locator('[data-signal-lane]')).toHaveCount(4)

    await page.locator('#start-btn').click()
    await page.locator('[data-signal-lane="0"]').click() // Cyan → Magenta
    await advanceSignalSwitchUntil(page, 'safe-pass')

    await expect(page.locator('#safe-passes')).toHaveText('1')
    await expect(page.locator('#combo')).toHaveText('1')
    await expect(page.locator('#score')).toHaveText('100')
    await expect(page.locator('#integrity')).toHaveText('3 / 3')

    await page.locator('#reset-btn').click()
    await page.locator('#start-btn').click()
    // Leave every gate Cyan. First/random generated drones are guaranteed
    // non-Cyan for their lane at spawn, so three crossings deterministically fail.
    await advanceSignalSwitchUntil(page, 'game-over')

    await expect(page.locator('#game-over-overlay')).not.toHaveClass(/hidden/)
    await expect(page.locator('#game-over-title')).toHaveText('SIGNAL LOST')
    await expect(page.locator('#final-outcome')).toHaveText('Systems failed')
    await expect(page.locator('#final-integrity')).toHaveText('0')

    await page.locator('#play-again-btn').click()
    await expect(page.locator('#game-over-overlay')).toHaveClass(/hidden/)
    await expect(page.locator('#integrity')).toHaveText('3 / 3')
    await expect(page.locator('#safe-passes')).toHaveText('0')
    await expect(page.locator('[data-signal-lane="0"]')).toContainText('● Cyan')
})
```

The failure half is deterministic because every generated signal explicitly differs from that lane's gate at spawn and the test never changes gates after the fresh Start.

- [ ] **Step 3: Add the 375×812 control/canvas reachability assertion**

In the same spec or a second short Signal Switch test:

```ts
await page.setViewportSize({ width: 375, height: 812 })
await page.goto('/signal-switch')
const controls = page.locator('#gate-controls')
await expect(controls).toBeVisible()
await expect(page.locator('[data-signal-lane]')).toHaveCount(4)
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

const boxes = await page.locator('[data-signal-lane]').evaluateAll(buttons =>
    buttons.map(button => button.getBoundingClientRect()).map(rect => ({
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
    }))
)
expect(boxes.every(box => box.width > 0 && box.height > 0)).toBe(true)
expect(boxes.every(box => box.left >= 0 && box.right <= 375)).toBe(true)
```

Also assert the Pixi canvas rendered width is `<= 375` and its rendered height is positive; do not freeze a device-pixel-ratio-dependent exact canvas size.

- [ ] **Step 4: Run targeted automated gates before manual tuning**

Run:

```bash
bun run test:run src/lib/games/signal-switch src/lib/games.test.ts src/lib/organisms.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: all PASS. Fix implementation defects before judging balance.

- [ ] **Step 5: Perform the mandatory manual-play tuning checkpoint**

Run the game locally and complete at least one full 90-second run. Record explicit PASS/CHANGE answers in the implementation PR body for all five questions:

1. First Lane 1 Magenta drone gives enough time to discover one gate cycle.
2. Three lanes around 30s are busy but readable.
3. Four lanes around 60s remain readable at the current speed/cadence.
4. A late-run drone that needs two gate cycles is still comfortably actionable.
5. A strong full run can reach 40 safe passes, so Traffic Controller is achievable.

If a tuning value changes, modify only the relevant constants in `SIGNAL_SWITCH_RULES` or `scoring.ts`, the exact-value tests, and `docs/superpowers/specs/2026-08-22-signal-switch-design.md`. Re-run the targeted Signal Switch unit/init/renderer tests plus Playwright after every tuning change.

Do not introduce new systems to solve a tuning problem.

- [ ] **Step 6: Run the full repository gates and verify unchanged derived navigation**

Run:

```bash
bun run test:run
bun run test:coverage
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
```

Expected:

- all unit/integration tests pass;
- coverage command exits 0 under the repository thresholds;
- typecheck/lint/format/build pass;
- Signal Switch Playwright journey/mobile assertion pass;
- the source diff for `e2e/games/all-games-navigation.spec.ts` remains empty while its derived catalog navigation test passes for `/signal-switch`.

Verify scope with:

```bash
git diff --name-only main...HEAD
git diff --exit-code main...HEAD -- \
  src/lib/games/core/BaseGame.ts \
  src/lib/games/core/GameTimer.ts \
  src/lib/games/core/ScoreManager.ts \
  src/lib/games/core/GameInitializer.ts \
  src/lib/games/renderers/PixiJSRenderer.ts \
  src/lib/games/shared/utils.ts \
  src/lib/services/scoreService.ts \
  src/lib/server/db \
  src/pages/api \
  e2e/games/all-games-navigation.spec.ts
```

Expected: the second command exits 0 with no diff.

- [ ] **Step 7: Commit Task 6**

```bash
git add e2e/games/play-coverage.spec.ts src/lib/games/signal-switch docs/superpowers/specs/2026-08-22-signal-switch-design.md
git commit -m "test(signal-switch): cover browser lifecycle and tuning"
```

If no tuning files changed, Git simply stages only the E2E file. Do not manufacture a design/code edit just to match the command list.

---

## Final Implementation PR Checklist

- [ ] HPA-71 remains one implementation PR.
- [ ] `SignalSwitchGame` owns traffic/gates/integrity; no shared real-time framework was added.
- [ ] BaseGame/GameTimer/ScoreManager/PixiJSRenderer/GameInitializer/backend/API/auth production files have no HPA-71 diff.
- [ ] Every generated drone is placed in a free active lane and starts with a non-matching signal.
- [ ] All-busy congestion creates no RNG reads and no catch-up spawn burst.
- [ ] Gate crossing is previous-X/next-X based and covered by a tunneling regression.
- [ ] Three integrity failures end once; timeout survives through BaseGame.
- [ ] All signals have color + Circle/Triangle/Diamond + text identity.
- [ ] Four native buttons and keys 1–4 use the same `cycleGate()` API.
- [ ] `/signal-switch` is active in `GAMES`; organism counts are 7/9/4.
- [ ] Four achievements use existing score/in-game achievement machinery.
- [ ] Reset returns idle; Play Again immediately starts a clean run.
- [ ] 375×812 has reachable 2×2 controls and no horizontal overflow.
- [ ] Manual tuning answers are recorded in the PR body and any constant changes are reflected in spec/tests.
- [ ] Full unit/coverage/type/lint/format/build/Playwright gates pass.
