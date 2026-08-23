# Signal Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Signal Switch, a 90-second real-time lane-management game where players cycle laser gates to match incoming drone signals, preserve a combo, survive three integrity strikes, and use the existing Cetus score/leaderboard flow.

**Architecture:** `SignalSwitchGame` extends `BaseGame` and owns gate state, one-drone-per-lane scheduling, previous-X/next-X gate crossing, integrity/combo/scoring, and simulation-time difficulty. `SignalSwitchRenderer` extends `PixiJSRenderer` with one static lane layer and one redrawn dynamic layer. A game-local initializer follows Gravity Flip's rAF/error/lifecycle conventions while four native Astro buttons plus number keys call one `cycleGate()` API. No shared lane/spawn/input framework or backend change is required.

**Tech Stack:** Astro 5 + TypeScript 6, PixiJS 8.10, Tailwind CSS 4, existing BaseGame/PixiJSRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-22-signal-switch-design.md`

## Global Constraints

- Package manager: **Bun `1.3.1`**.
- Deliver HPA-71 in **one implementation PR**; game, route, registration, achievements, tuning, and tests stay together.
- ID **`signal_switch`**, route **`/signal-switch`**, title **`Signal Switch`**, icon **`🚦`**.
- Run duration **90 seconds**; logical canvas **800×360**; BaseGame `timeBonus: false`.
- Signal cycle: **Cyan Circle `●` → Magenta Triangle `▲` → Amber Diamond `◆` → Cyan**.
- Start with **3 integrity** and **2 active lanes**; unlock lane 3 at **30 simulated seconds** and lane 4 at **60 simulated seconds**.
- All four gates start Cyan. The deterministic first drone is **Lane 1 / Magenta** and consumes no RNG.
- Keep at most **one unresolved drone per lane**. Random spawns use only active free lanes.
- A random drone's signal must differ from that lane's gate at spawn time.
- A successful random spawn consumes exactly **two RNG reads**: free-lane selection, then one of two non-matching signals. An all-busy deferred spawn consumes zero reads.
- Difficulty uses private accumulated **simulation time**, not `GameTimer`/`Date.now()` elapsed time.
- Initial tuning defaults live once in `SIGNAL_SWITCH_RULES`: spawn X 64, gate X 680, drone 32×22, speed 140→240 px/s, spawn interval 2.2→1.1 s, accepted outer update ≤0.1 s.
- Gate crossing uses **`previousX < gateX && nextX >= gateX`**; do not introduce physics substeps.
- All-busy traffic keeps one ready spawn only; never replay missed intervals as a catch-up burst.
- Safe-pass points come only from `calculateSignalSwitchPassPoints(comboAfterPass)`: `100 + min(max(floor(comboAfterPass), 1) - 1, 8) * 20`.
- A wrong gate resets combo, removes one integrity, and subtracts **no score**. The third crash ends the run.
- Failure UI: **`SIGNAL LOST` / `Systems failed`**. Timeout UI: **`SHIFT COMPLETE` / `Survived`**.
- Reuse BaseGame timer/save/run-guard/completed-run reset. No second countdown, stale-run token, final survival bonus, or special leaderboard path.
- Reuse `BaseGame + PixiJSRenderer`; do not add a traffic engine, lane engine, generic spawner, GameInitializer adoption, schema/API work, audio, haptics, or image assets.
- Signal identity is color + stable glyph/shape/text; color alone is never the interaction contract.
- Four native lane buttons exist in Astro from first render. Use one delegated `#gate-controls` click listener.
- Desktop controls are `1`, `2`, `3`, `4`; ignore repeat, Ctrl/Meta/Alt, editable targets, and button targets.
- Initializer returns `getGame()`; the page assigns `window.signalSwitchGame`.
- Initializer installs/removes the existing active-run `beforeunload` warning and owns one rAF loop.
- Reset returns idle. Play Again calls `game.start()` so BaseGame auto-resets and immediately starts the next run.
- Create `/signal-switch` before activating the `GAMES` record because `games.test.ts` checks every registered route.
- Register at `depth: 'shallow'`; organism counts change **`6 / 9 / 4` → `7 / 9 / 4`**.
- `getGameUrl()` and `e2e/games/all-games-navigation.spec.ts` remain source-unchanged.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `PixiJSRenderer.ts`, `GameInitializer.ts`, shared utils, score service, DB/API/auth remain production-unchanged.
- Edit `CLAUDE.md`, not the `AGENTS.md` symlink.
- Balance defaults may change only at the Task 6 manual-play checkpoint; update constants, exact tests, and the design spec together.

## Load-Bearing Risks

- **Impossible same-lane traffic:** free-lane filtering is the only spawn lane source.
- **Zero-action generated drones:** remove the selected lane's current gate signal before the second RNG draw.
- **Frame tunneling:** resolve previous-X → next-X gate crossing and lock it with a one-frame regression.
- **Background-tab difficulty jump:** ramp from simulation time; BaseGame timer alone decides run expiration.
- **Spawn burst after congestion:** hold one ready spawn while all lanes are occupied, with zero RNG reads.
- **Double terminal save:** fatal crossing stops update work after BaseGame marks the run inactive.
- **Focused-button double input:** document keydown ignores button targets.
- **Color-only readability:** Circle/Triangle/Diamond marker geometry accompanies color and text.
- **Route registration race:** route in Task 4, active catalog entry in Task 5.
- **Browser timing flake:** Playwright advances the exposed game model instead of waiting 90 seconds.
- **Over-generalization:** copy conventions from Gravity Flip; do not extract a common runner/lane/spawn system.

---

## Task 1: Contracts, stable ID/icon, and scoring

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Create: `src/lib/games/signal-switch/types.ts`
- Create: `src/lib/games/signal-switch/scoring.ts`
- Create: `src/lib/games/signal-switch/scoring.test.ts`

- [ ] **1.1 Add the stable GameID and icon, but not the active catalog row yet**

```ts
// GameID
SIGNAL_SWITCH = 'signal_switch',

// GAME_ICONS
[GameID.SIGNAL_SWITCH]: '🚦',
```

Add this permanent test; do not add a temporary `getGameById(...) === undefined` test:

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

Expected: PASS.

- [ ] **1.2 Create the canonical signal/config/state contracts**

Create `types.ts`:

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

Keep this flat; no difficulty presets or lane descriptor registry.

- [ ] **1.3 Write RED scoring tests**

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

Run and expect RED because `scoring.ts` does not exist:

```bash
bun run test:run src/lib/games/signal-switch/scoring.test.ts
```

- [ ] **1.4 Implement the only pass scorer**

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

- [ ] **1.5 Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/signal-switch/types.ts src/lib/games/signal-switch/scoring.ts src/lib/games/signal-switch/scoring.test.ts
git commit -m "feat(signal-switch): add contracts and scoring"
```

---

## Task 2: Game model, fair traffic, integrity, and lifecycle

**Files**
- Create: `src/lib/games/signal-switch/SignalSwitchGame.ts`
- Create: `src/lib/games/signal-switch/SignalSwitchGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`
- Reuse unchanged: `src/lib/games/shared/utils.ts`

- [ ] **2.1 Write RED idle/start/gate tests**

Start the test file with helpers that also make terminal saves deterministic:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignalSwitchGame } from './SignalSwitchGame'
import { createSignalSwitchConfig, type SignalSwitchConfig } from './types'

function createGame(overrides: Partial<SignalSwitchConfig> = {}) {
    return new SignalSwitchGame(
        createSignalSwitchConfig({ rng: () => 0, ...overrides })
    )
}

function stubFinalSave(game: SignalSwitchGame): void {
    vi.spyOn(game.getScoreManager(), 'saveFinalScore').mockResolvedValue({
        success: true,
    })
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
})
```

Lock the idle and deterministic-first-drone contract:

```ts
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

it('authors Lane 1 Magenta as drone-0 on every fresh start', () => {
    const rng = vi.fn(() => 0)
    const game = new SignalSwitchGame(createSignalSwitchConfig({ rng }))
    game.start()
    expect(game.getState().drones).toEqual([
        { id: 'drone-0', laneIndex: 0, signal: 'magenta', x: 64 },
    ])
    expect(rng).not.toHaveBeenCalled()
})
```

Gate-cycle test:

```ts
it('cycles only active lanes Cyan → Magenta → Amber → Cyan', () => {
    const game = createGame()
    expect(game.cycleGate(0)).toBe(false)
    game.start()

    expect(game.cycleGate(0)).toBe(true)
    expect(game.getState().gateSignals[0]).toBe('magenta')
    game.cycleGate(0)
    expect(game.getState().gateSignals[0]).toBe('amber')
    game.cycleGate(0)
    expect(game.getState().gateSignals[0]).toBe('cyan')

    expect(game.cycleGate(2)).toBe(false)
    expect(game.cycleGate(-1)).toBe(false)
    expect(game.cycleGate(4)).toBe(false)
    expect(game.cycleGate(1.5)).toBe(false)
})
```

Run and expect RED:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchGame.test.ts
```

- [ ] **2.2 Implement the BaseGame shell, first drone, and gate cycling**

Use:

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
        const index = SIGNAL_SWITCH_SIGNAL_ORDER.indexOf(current)
        this.state.gateSignals[laneIndex] =
            SIGNAL_SWITCH_SIGNAL_ORDER[
                (index + 1) % SIGNAL_SWITCH_SIGNAL_ORDER.length
            ]
        this.emitStateChange()
        return true
    }

    render(): void {}
    cleanup(): void {}
}
```

Add:

```ts
private droneId(): string {
    return `drone-${this.droneSequence++}`
}

protected onGameStart(): void {
    this.elapsedSimSeconds = 0
    this.spawnElapsedSeconds = 0
    this.droneSequence = 0
    this.state.drones.push({
        id: this.droneId(),
        laneIndex: 0,
        signal: 'magenta',
        x: this.config.droneSpawnX,
    })
    this.emitStateChange()
}

protected onGameReset(): void {
    this.elapsedSimSeconds = 0
    this.spawnElapsedSeconds = 0
    this.droneSequence = 0
}
```

- [ ] **2.3 Write RED simulation-time ramp tests without letting traffic end the test**

Use a gate far outside reachable space so normal traffic can fill lanes but never crash while testing the clock-independent ramp:

```ts
function simulationGame(): SignalSwitchGame {
    return createGame({ gateX: 1_000_000 })
}

function advance(game: SignalSwitchGame, seconds: number): void {
    const steps = Math.round(seconds / 0.1)
    for (let i = 0; i < steps; i += 1) game.update(0.1)
}

it('unlocks lane 3 at 30s and lane 4 at 60s of simulation time', () => {
    const game = simulationGame()
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

it('ramps speed and spawn cadence linearly', () => {
    const game = simulationGame()
    game.start()
    advance(game, 45)
    expect(game.getState().droneSpeed).toBeCloseTo(190, 5)
    expect(game.getState().spawnInterval).toBeCloseTo(1.65, 5)
})

it('ignores invalid deltas and clamps one accepted update to 0.1s', () => {
    const game = createGame({
        gateX: 1_000_000,
        initialDroneSpeed: 140,
        finalDroneSpeed: 140,
        initialSpawnInterval: 99,
        finalSpawnInterval: 99,
    })
    game.start()
    const before = game.getState().drones[0].x
    game.update(Number.NaN)
    game.update(-1)
    game.update(2)
    expect(game.getState().drones[0].x - before).toBeCloseTo(14, 5)
})
```

- [ ] **2.4 Implement the ramp and update guard**

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
) return

const step = Math.min(deltaTime, this.config.maxUpdateDelta)
this.elapsedSimSeconds = Math.min(
    this.config.duration,
    this.elapsedSimSeconds + step
)
this.syncDifficulty()
```

- [ ] **2.5 Write RED crossing/combo/integrity tests**

Use an exact one-frame crossing fixture:

```ts
function crossingGame(startingIntegrity = 3): SignalSwitchGame {
    return createGame({
        startingIntegrity,
        droneSpawnX: 90,
        gateX: 100,
        initialDroneSpeed: 200,
        finalDroneSpeed: 200,
        initialSpawnInterval: 99,
        finalSpawnInterval: 99,
    })
}

it('resolves a matched drone crossing 90 → 110 in one frame', () => {
    const game = crossingGame()
    game.start()
    game.cycleGate(0)
    game.update(0.1)
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

it('a mismatch resets combo/integrity and subtracts no score', () => {
    const game = crossingGame()
    game.start()
    game.update(0.1)
    expect(game.getState()).toMatchObject({
        crashes: 1,
        combo: 0,
        integrity: 2,
        score: 0,
    })
})

it('ends exactly once on the final integrity point', async () => {
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
    stubFinalSave(game)
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

- [ ] **2.6 Implement previous-X/next-X resolution**

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

private resolveDrone(drone: SignalSwitchDrone): boolean {
    if (drone.signal === this.state.gateSignals[drone.laneIndex]) {
        this.state.safePasses += 1
        this.state.combo += 1
        this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo)
        this.addScore(
            calculateSignalSwitchPassPoints(this.state.combo),
            'signal_switch_safe_pass'
        )
        return true
    }

    this.state.crashes += 1
    this.state.combo = 0
    this.state.integrity = Math.max(0, this.state.integrity - 1)
    if (this.state.integrity > 0) return true

    this.state.outcome = 'systems-failed'
    this.emitStateChange()
    this.end().catch((error: unknown) =>
        console.error('SignalSwitch end failed', error)
    )
    return false
}
```

After `syncDifficulty()` in `update()`:

```ts
if (!this.moveAndResolveDrones(step)) return
```

- [ ] **2.7 Write RED fair-spawn and congestion tests**

Free lane + non-matching signal:

```ts
it('uses only a free lane and a non-matching signal', () => {
    const rng = vi
        .fn<() => number>()
        .mockReturnValueOnce(0.99)
        .mockReturnValueOnce(0.99)
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
    game.update(0.1)
    const spawned = game.getState().drones.find(d => d.id === 'drone-1')
    expect(spawned?.laneIndex).toBe(1)
    expect(spawned?.signal).not.toBe(game.getState().gateSignals[1])
    expect(rng).toHaveBeenCalledTimes(2)
})
```

All-busy zero-RNG behavior:

```ts
it('holds one ready spawn with zero RNG reads while both lanes are busy', () => {
    const rng = vi.fn(() => 0)
    const game = new SignalSwitchGame(
        createSignalSwitchConfig({
            gateX: 1_000_000,
            initialSpawnInterval: 0.1,
            finalSpawnInterval: 0.1,
            initialDroneSpeed: 1,
            finalDroneSpeed: 1,
            rng,
        })
    )
    game.start()
    game.update(0.1)
    expect(game.getState().drones).toHaveLength(2)
    expect(rng).toHaveBeenCalledTimes(2)

    rng.mockClear()
    for (let i = 0; i < 20; i += 1) game.update(0.1)
    expect(game.getState().drones).toHaveLength(2)
    expect(rng).not.toHaveBeenCalled()
})
```

No catch-up burst after congestion:

```ts
it('spawns exactly one drone when a congested lane finally frees', () => {
    const rng = vi.fn(() => 0)
    const game = new SignalSwitchGame(
        createSignalSwitchConfig({
            droneSpawnX: 64,
            gateX: 64.5,
            initialSpawnInterval: 0.05,
            finalSpawnInterval: 0.05,
            initialDroneSpeed: 1,
            finalDroneSpeed: 1,
            rng,
        })
    )
    game.start()
    game.update(0.1) // spawn drone-1; both lanes occupied
    rng.mockClear()

    game.update(0.1) // ready but all busy
    game.update(0.1)
    game.update(0.1)
    expect(rng).not.toHaveBeenCalled()

    game.update(0.1) // drone-0 crosses; exactly one ready spawn is released
    expect(rng).toHaveBeenCalledTimes(2)
    expect(game.getState().drones).toHaveLength(2)
    expect(game.getState().drones.filter(d => d.id === 'drone-2')).toHaveLength(1)
})
```

The default gate is Cyan and generated drones are non-Cyan, so the crossing above is a non-fatal first crash with default integrity 3.

- [ ] **2.8 Implement free-lane spawning and the capped accumulator**

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

Finish `update()` after movement:

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

- [ ] **2.9 Add stats/game-data/timeout/reset regressions**

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

Timeout test:

```ts
it('marks timeout as survived and ends once', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-22T00:00:00Z'))
    const onEnd = vi.fn()
    const game = new SignalSwitchGame(
        createSignalSwitchConfig({ gateX: 1_000_000, rng: () => 0 }),
        { onEnd }
    )
    stubFinalSave(game)
    game.start()
    await vi.advanceTimersByTimeAsync(90_000)
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1))
    expect(game.getState()).toMatchObject({
        outcome: 'survived',
        isActive: false,
        isGameOver: true,
    })
})
```

Reset/ID test:

```ts
it('reset restores the deterministic fresh-run contract', () => {
    const game = createGame()
    game.start()
    expect(game.getState().drones[0].id).toBe('drone-0')
    game.cycleGate(0)
    game.reset()
    expect(game.getState()).toMatchObject({
        gateSignals: ['cyan', 'cyan', 'cyan', 'cyan'],
        drones: [],
        integrity: 3,
        safePasses: 0,
        combo: 0,
        isActive: false,
    })
    game.start()
    expect(game.getState().drones[0]).toMatchObject({
        id: 'drone-0', laneIndex: 0, signal: 'magenta',
    })
})
```

Run:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchGame.test.ts src/lib/games/signal-switch/scoring.test.ts
bun run typecheck
```

Expected: PASS / zero Astro-check errors.

- [ ] **2.10 Commit**

```bash
git add src/lib/games/signal-switch/SignalSwitchGame.ts src/lib/games/signal-switch/SignalSwitchGame.test.ts
git commit -m "feat(signal-switch): implement lane traffic gameplay"
```

---

## Task 3: Two-layer Pixi renderer

**Files**
- Create: `src/lib/games/signal-switch/SignalSwitchRenderer.ts`
- Create: `src/lib/games/signal-switch/SignalSwitchRenderer.test.ts`
- Reuse unchanged: `src/lib/games/renderers/PixiJSRenderer.ts`

- [ ] **3.1 Write RED renderer config/setup tests**

Follow Gravity Flip's existing Pixi mock pattern. Lock:

```ts
const config = createSignalSwitchConfig()
expect(createSignalSwitchRendererConfig(config)).toMatchObject({
    type: 'canvas',
    container: '#signal-switch-canvas',
    width: 800,
    height: 360,
    gateX: 680,
    maxLanes: 4,
    responsive: false,
    backgroundColor: 0x020817,
    antialias: true,
})
```

After `initialize()`, assert two Signal Switch-owned Graphics children exist: static lanes and dynamic scene.

Run and expect RED:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchRenderer.test.ts
```

- [ ] **3.2 Implement renderer shell/static lanes**

```ts
import * as PIXI from 'pixi.js'
import {
    PixiJSRenderer,
    type PixiJSRendererConfig,
} from '@/lib/games/renderers/PixiJSRenderer'
import type {
    SignalSwitchConfig,
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

`drawLanes()` derives `laneHeight = height / maxLanes`; draw the dark board, horizontal separators, and gate-zone guide. No per-lane Y constants.

- [ ] **3.3 Write RED geometry tests for non-color identity**

Render a state containing Cyan/Magenta/Amber active signals plus one locked lane. Assert the dynamic Graphics spy records:

- a circle marker for Cyan;
- a closed 3-corner path for Magenta;
- a closed 4-corner diamond path for Amber;
- a full-lane translucent locked overlay for lane index 3.

Assert load-bearing geometry/coordinates, not every decorative stroke count.

- [ ] **3.4 Implement dynamic gate/drone markers and cleanup**

```ts
const SIGNAL_COLORS: Readonly<Record<SignalSwitchSignal, number>> = {
    cyan: 0x22d3ee,
    magenta: 0xec4899,
    amber: 0xf59e0b,
}
```

Lane center:

```ts
private laneCenterY(laneIndex: number): number {
    const height = this.signalConfig.height ?? 360
    return (laneIndex + 0.5) * (height / this.signalConfig.maxLanes)
}
```

Marker dispatcher:

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

`renderGame()` clears only the dynamic layer, draws active gate beams/markers, each drone body/marker, then locked-lane overlays.

`cleanup()` destroys/nulls the two game-owned Graphics and calls `super.cleanup()`.

Factory:

```ts
export function createSignalSwitchRendererConfig(
    config: SignalSwitchConfig
): SignalSwitchRendererConfig {
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
}
```

Run:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchRenderer.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **3.5 Commit**

```bash
git add src/lib/games/signal-switch/SignalSwitchRenderer.ts src/lib/games/signal-switch/SignalSwitchRenderer.test.ts
git commit -m "feat(signal-switch): add Pixi lane renderer"
```

---

## Task 4: Initializer and `/signal-switch` route

**Files**
- Create: `src/lib/games/signal-switch/initFramework.ts`
- Create: `src/lib/games/signal-switch/initFramework.test.ts`
- Create: `src/pages/signal-switch/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`
- Reuse unchanged: `src/components/games/GamePage.astro`

The active `GAMES` row is still deferred until Task 5; this task makes the route real first.

- [ ] **4.1 Write RED missing-DOM and idle-init tests**

Use a jsdom fixture containing:

```html
<div id="signal-switch-container"><div id="signal-switch-canvas"></div></div>
<span id="score">0</span><span id="time-remaining">90</span>
<span id="integrity">3 / 3</span><span id="combo">0</span>
<span id="safe-passes">0</span><span id="lanes-online">2 / 4</span>
<span id="drone-speed">140</span>
<p id="signal-switch-status"></p>
<button id="start-btn"></button><button id="reset-btn"></button>
<div id="gate-controls">
  <button data-signal-lane="0"></button><button data-signal-lane="1"></button>
  <button data-signal-lane="2"></button><button data-signal-lane="3"></button>
</div>
<div id="game-over-overlay" class="hidden"></div>
<span id="game-over-title"></span><span id="final-outcome"></span>
<span id="final-score"></span><span id="final-safe-passes"></span>
<span id="final-crashes"></span><span id="final-max-combo"></span>
<span id="final-integrity"></span><button id="play-again-btn"></button>
```

Mock the renderer module using the same `initialize/getApp/render/destroy` contract as Gravity Flip's current initializer tests. Assert:

- missing `#signal-switch-container` calls `handleGameError` and returns `undefined`;
- valid init renders once and returns one handle;
- idle HUD is `3 / 3`, `0`, `0`, `2 / 4`, `140`;
- all four gate buttons show `● Cyan` and remain disabled until Start.

- [ ] **4.2 Implement concrete initializer helpers and callbacks**

Use the full editable-target guard, not a new shared helper:

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

function outcomeTitle(outcome: SignalSwitchOutcome): string {
    return outcome === 'survived' ? 'SHIFT COMPLETE' : 'SIGNAL LOST'
}

function outcomeLabel(outcome: SignalSwitchOutcome): string {
    return outcome === 'survived' ? 'Survived' : 'Systems failed'
}

const SIGNAL_SHAPE_NAMES: Readonly<Record<SignalSwitchSignal, string>> = {
    cyan: 'Circle',
    magenta: 'Triangle',
    amber: 'Diamond',
}
```

`syncHud(state)` writes:

```ts
setText('integrity', `${state.integrity} / ${config.startingIntegrity}`)
setText('combo', String(state.combo))
setText('safe-passes', String(state.safePasses))
setText('lanes-online', `${state.activeLaneCount} / ${config.maxLanes}`)
setText('drone-speed', String(Math.round(state.droneSpeed)))
setText('score', String(state.score))
setText('time-remaining', String(state.timeRemaining))
```

`syncControls(state)` queries `#gate-controls [data-signal-lane]`, parses each integer index, reads the canonical meta, and writes:

```ts
button.textContent = `Lane ${laneIndex + 1}: ${meta.glyph} ${meta.label}`
button.disabled = !state.isActive || laneIndex >= state.activeLaneCount
button.setAttribute(
    'aria-label',
    `Lane ${laneIndex + 1} gate, ${meta.label} ${SIGNAL_SHAPE_NAMES[signal]}`
)
```

Track `lastActiveLaneCount` and `lastIntegrity`. `onStateChange` syncs HUD/controls and announces only:

```text
Lane 3 online.
Lane 4 online.
Signal mismatch. Integrity 2 of 3.
Signal mismatch. Integrity 1 of 3.
Signal mismatch. Integrity 0 of 3.
```

`onStart` hides Start/overlay. `onEnd` fills terminal stats, shows overlay, and announces exactly:

```text
survived       → Shift complete. Signal network stable.
systems-failed → Signal lost. Systems failed.
```

Forward achievement/challenge payloads from the game `end` event exactly as Gravity Flip does.

- [ ] **4.3 Implement one rAF loop and responsive canvas override**

After renderer initialization:

```ts
const canvas = renderer.getApp()?.canvas ?? null
if (canvas) {
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
}
```

Use one loop:

```ts
const frame = (timestamp: number): void => {
    const deltaSeconds =
        lastFrameTime === null
            ? 0
            : Math.min((timestamp - lastFrameTime) / 1000, 0.1)
    lastFrameTime = timestamp
    const state = game.getState()
    if (state.isActive && !state.isPaused) game.update(deltaSeconds)
    renderer.render(game.getState())
    frameId = requestAnimationFrame(frame)
}
```

- [ ] **4.4 Write RED delegated-click and keyboard tests, then implement handlers**

Test after Start:

```ts
const lane1 = document.querySelector<HTMLButtonElement>(
    '[data-signal-lane="0"]'
)!
lane1.click()
expect(handle!.getState().gateSignals[0]).toBe('magenta')
expect(lane1.textContent).toContain('▲ Magenta')
```

Assert lane 3 click/key is rejected before 30 simulated seconds and enabled afterward. Assert key `2` cycles lane 2 exactly once.

Also assert no key action for repeat, Ctrl/Meta/Alt, input/textarea/select/contentEditable targets, non-`1..4` keys, or a button target.

Implement one delegated click listener:

```ts
const gateControlsHandler: EventListener = event => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>('[data-signal-lane]')
    if (!button || !gateControls?.contains(button)) return
    game.cycleGate(Number(button.dataset.signalLane))
}
```

Keyboard map:

```ts
const KEY_TO_LANE: Readonly<Record<string, number>> = {
    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
}
```

Guard repeat/modifiers/editable/button targets. Call `preventDefault()` only when `game.cycleGate(laneIndex)` returns `true`.

- [ ] **4.5 Add Reset, Play Again, beforeunload, and idempotent cleanup tests/implementation**

Reset handler:

```ts
game.reset()
renderer.render(game.getState())
syncHud(game.getState())
syncControls(game.getState())
hideOverlay()
setStartVisible(true)
```

Play Again:

```ts
hideOverlay()
game.start()
```

`beforeunload` warns only while active.

`cleanup()` uses a `cleanedUp` guard, cancels rAF, removes every tracked listener, unregisters the game-end handler, destroys renderer, then destroys game once.

Tests verify Reset returns idle/disabled controls, Play Again immediately produces an active fresh Lane-1/Magenta run, unload warning disappears after cleanup, and repeated cleanup is harmless.

- [ ] **4.6 Add terminal/live-region tests**

Using the game handle and deterministic model advancement, lock:

- lane 3/4 unlock announcements once each;
- integrity-loss message once per crash;
- gate cycling does not overwrite the live region;
- failure: `SIGNAL LOST`, `Systems failed`, final counters, visible overlay;
- timeout: `SHIFT COMPLETE`, `Survived`, visible overlay.

Stub `game.getScoreManager().saveFinalScore` in tests that end a run so callback assertions do not depend on fetch.

- [ ] **4.7 Create the Astro route with the complete static DOM contract**

Use:

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

Board:

```astro
<div slot="game-board" id="signal-switch-container" class="w-full max-w-[800px]">
  <div id="signal-switch-canvas" class="overflow-hidden rounded-lg bg-black/30"></div>
  <p id="signal-switch-status" class="sr-only" aria-live="polite"></p>
</div>
```

Additional stats use IDs and idle text:

```text
integrity     3 / 3
combo         0
safe-passes   0
lanes-online  2 / 4
drone-speed   140
```

Controls include Start, Reset, and a 2×2 grid. Keep all lane buttons statically disabled; initializer enables lanes 1/2 when the run starts:

```astro
<div id="gate-controls" class="grid w-full max-w-md grid-cols-2 gap-2">
  <Button type="button" data-signal-lane="0" disabled>Lane 1: ● Cyan</Button>
  <Button type="button" data-signal-lane="1" disabled>Lane 2: ● Cyan</Button>
  <Button type="button" data-signal-lane="2" disabled>Lane 3: ● Cyan</Button>
  <Button type="button" data-signal-lane="3" disabled>Lane 4: ● Cyan</Button>
</div>
```

Game-info copy explains the three-signal cycle, three integrity strikes, later lane unlocks, and combo scoring. Final stats use `final-outcome`, `final-safe-passes`, `final-crashes`, `final-max-combo`, `final-integrity`.

After `</GamePage>`:

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

Canvas CSS:

```css
#signal-switch-canvas :global(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
  touch-action: manipulation;
}
```

- [ ] **4.8 Add explicit markup coverage, without adding to the shared game sweep yet**

Load `signalSwitchMarkup` and assert:

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
]) expect(signalSwitchMarkup).toContain(`id="${id}"`)

expect(signalSwitchMarkup.match(/data-signal-lane="[0-3]"/g)).toHaveLength(4)
expect(signalSwitchMarkup).toContain('initialTime={90}')
expect(signalSwitchMarkup).toContain('showPause={false}')
expect(signalSwitchMarkup).toContain('showEnd={false}')
expect(signalSwitchMarkup).not.toContain('id="end-btn"')
expect(signalSwitchMarkup).toMatch(
    /<\/GamePage>[\s\S]*<script[^>]*>[\s\S]*initSignalSwitchGameFramework/
)
```

Do not add `'signal-switch'` to the shared `games` array until Task 5 activates `GAMES`.

Run:

```bash
bun run test:run src/lib/games/signal-switch/initFramework.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **4.9 Commit**

```bash
git add src/lib/games/signal-switch/initFramework.ts src/lib/games/signal-switch/initFramework.test.ts src/pages/signal-switch/index.astro src/pages/game-board-markup.test.ts
git commit -m "feat(signal-switch): wire route and controls"
```

---

## Task 5: Catalog, shared game data, achievements, and repo metadata

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `src/pages/game-board-markup.test.ts`
- Modify: `CLAUDE.md`

- [ ] **5.1 Write RED final registration/organism tests**

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
            tags: ['timing', 'reflex', 'lanes', 'single-player', 'signals'],
            isActive: true,
            organism: { shape: 'lattice', color: 'teal' },
            depth: 'shallow',
        })
        expect(getGameIcon(GameID.SIGNAL_SWITCH)).toBe('🚦')
        expect(getGameUrl(GameID.SIGNAL_SWITCH)).toBe('/signal-switch')
        expect(GAMES.filter(g => g.id === GameID.SIGNAL_SWITCH)).toHaveLength(1)
    })
})
```

Change only the existing partition expectation to:

```ts
expect(getGamesByDepth('shallow')).toHaveLength(7)
expect(getGamesByDepth('mid')).toHaveLength(9)
expect(getGamesByDepth('abyssal')).toHaveLength(4)
```

Run and expect RED:

```bash
bun run test:run src/lib/games.test.ts src/lib/organisms.test.ts
```

- [ ] **5.2 Activate the exact GAMES row now that the route exists**

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

Leave `getGameUrl()` unchanged. Run the two suites again; expected PASS including the existing no-adjacent-identical-shape+color invariant.

- [ ] **5.3 Add the canonical shared data alias**

In `src/lib/games/shared/types.ts`:

```ts
export type SignalSwitchGameData =
    import('../signal-switch/types').SignalSwitchGameData
```

Add `| SignalSwitchGameData` to `GameData`.

In `achievements.ts`, import `SignalSwitchGameData` with the recent canonical game-data types and add it to `AchievementCheckData`.

Run `bun run typecheck`; expected PASS.

- [ ] **5.4 Write RED tests for exactly four achievements**

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

Assert First Clearance is score-threshold 100. Call each in-game `check` with true/false examples:

```ts
const data = {
    safePasses: 40,
    crashes: 0,
    maxCombo: 10,
    integrityRemaining: 3,
    survivedFullRun: true,
}
```

Lock `maxCombo >= 10`, `survivedFullRun && crashes === 0`, and `survivedFullRun && safePasses >= 40` independently.

Run and expect RED:

```bash
bun run test:run src/lib/achievements.test.ts
```

- [ ] **5.5 Add exactly four achievement definitions**

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
        check: (gameData: SignalSwitchGameData) => gameData.maxCombo >= 10,
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

Run `bun run test:run src/lib/achievements.test.ts`; expected PASS.

- [ ] **5.6 Finish markup sweep and CLAUDE.md**

Append `'signal-switch'` to the shared `games` array in `src/pages/game-board-markup.test.ts`.

Update `CLAUDE.md`:

- 19 implemented games → 20;
- append Signal Switch to the overview list;
- add `signal-switch/` to the project tree;
- include it in the PixiJS canvas list;
- add `Signal Switch: PixiJS lane-timing game with four native lane controls and a window.signalSwitchGame debug handle`.

Do not edit `AGENTS.md` directly.

Run:

```bash
bun run test:run src/lib/games.test.ts src/lib/organisms.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **5.7 Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/shared/types.ts src/lib/organisms.test.ts src/lib/achievements.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts CLAUDE.md
git commit -m "feat(signal-switch): register game and achievements"
```

---

## Task 6: Browser lifecycle/mobile coverage, tuning, and final gates

**Files**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify source-unchanged: `e2e/games/all-games-navigation.spec.ts`
- Tuning-only if manual play requires it: Signal Switch constants/tests and design spec

- [ ] **6.1 Add a bounded Playwright model-advance helper**

`play-coverage.spec.ts` already imports `type Page`. Add:

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

This uses the existing debug handle only; do not add a test-only production API.

- [ ] **6.2 Add the real-control safe-pass → Reset → failure → Play Again journey**

Intercept final score submission before navigation so terminal UI is deterministic:

```ts
await page.route('**/api/scores', route =>
    route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, newAchievements: [] }),
    })
)
```

Then:

```ts
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
// Gates stay Cyan. First/random drones are generated non-Cyan for their lane.
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
```

The failure half is deterministic because the test never changes a gate after the fresh Start and generated signals exclude the selected lane's current gate at spawn.

- [ ] **6.3 Add 375×812 reachability/no-overflow coverage**

```ts
await page.setViewportSize({ width: 375, height: 812 })
await page.goto('/signal-switch')
await expect(page.locator('#gate-controls')).toBeVisible()
await expect(page.locator('[data-signal-lane]')).toHaveCount(4)
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

const boxes = await page.locator('[data-signal-lane]').evaluateAll(buttons =>
    buttons.map(button => {
        const rect = button.getBoundingClientRect()
        return {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
        }
    })
)
expect(boxes.every(box => box.width > 0 && box.height > 0)).toBe(true)
expect(boxes.every(box => box.left >= 0 && box.right <= 375)).toBe(true)

const canvasBox = await page.locator('#signal-switch-canvas canvas').boundingBox()
expect(canvasBox).not.toBeNull()
expect(canvasBox!.width).toBeLessThanOrEqual(375)
expect(canvasBox!.height).toBeGreaterThan(0)
```

Do not freeze a device-pixel-ratio-dependent intrinsic canvas size.

- [ ] **6.4 Run targeted automated gates before tuning**

```bash
bun run test:run src/lib/games/signal-switch src/lib/games.test.ts src/lib/organisms.test.ts src/lib/achievements.test.ts src/pages/game-board-markup.test.ts
bun run typecheck
bun run lint
bun run format:check
bun run test:e2e -- e2e/games/play-coverage.spec.ts
```

Expected: PASS. Fix implementation defects before judging balance.

- [ ] **6.5 Perform the mandatory manual-play tuning checkpoint**

Play at least one serious run and record PASS/CHANGE for:

1. First Lane-1/Magenta drone gives enough time to discover one cycle.
2. Three lanes around 30s are busy but readable.
3. Four lanes around 60s remain readable.
4. A late drone needing two cycles is still comfortably actionable.
5. A strong survival run can reach 40 safe passes.

If tuning changes are needed, change only relevant `SIGNAL_SWITCH_RULES`/scoring constants, exact tests, and `docs/superpowers/specs/2026-08-22-signal-switch-design.md`. Re-run targeted game + Playwright tests. Do not introduce a new subsystem to solve balance.

- [ ] **6.6 Run full repository gates and scope checks**

```bash
bun run test:run
bun run test:coverage
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run test:e2e -- e2e/games/play-coverage.spec.ts e2e/games/all-games-navigation.spec.ts
```

Then:

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
  src/lib/auth.ts \
  src/lib/auth-client.ts \
  e2e/games/all-games-navigation.spec.ts
```

Expected: all gates PASS; the second command exits 0 with no diff.

- [ ] **6.7 Commit**

```bash
git add e2e/games/play-coverage.spec.ts
git add src/lib/games/signal-switch docs/superpowers/specs/2026-08-22-signal-switch-design.md
git commit -m "test(signal-switch): cover browser lifecycle and tuning"
```

Unchanged paths are harmless in `git add`; do not manufacture a tuning edit if manual play needs none.

---

## Final Implementation PR Checklist

- [ ] HPA-71 is one implementation PR.
- [ ] `SignalSwitchGame` owns traffic/gates/integrity; no shared real-time framework was added.
- [ ] Core game framework/backend/API/auth files listed above have no HPA-71 production diff.
- [ ] Every generated drone is placed in a free active lane and starts non-matching.
- [ ] All-busy congestion consumes no RNG and cannot create a catch-up burst.
- [ ] Gate crossing uses previous X/next X and has a one-frame regression.
- [ ] Three integrity failures end exactly once; timeout marks `survived`.
- [ ] Signals have color + Circle/Triangle/Diamond + text identity.
- [ ] Four native buttons and keys 1–4 use the same `cycleGate()` API.
- [ ] `/signal-switch` is active in `GAMES`; organism counts are 7/9/4.
- [ ] Exactly four Signal Switch achievements use existing machinery.
- [ ] Reset returns idle; Play Again starts a clean run.
- [ ] 375×812 controls are reachable in 2×2 layout with no horizontal overflow.
- [ ] Manual tuning answers are recorded; any tuning edits are mirrored in spec/tests.
- [ ] Full unit/coverage/type/lint/format/build/Playwright gates pass.
