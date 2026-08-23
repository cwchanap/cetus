# Signal Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Signal Switch, a 90-second lane-management game where players cycle laser gates to match incoming drone signals, preserve combo, survive three integrity strikes, and reuse the existing Cetus score/leaderboard flow.

**Architecture:** `SignalSwitchGame` extends `BaseGame` and owns gates, one-drone-per-lane traffic, center-X gate crossing, integrity/combo/scoring, and simulation-time difficulty. `SignalSwitchRenderer` extends `PixiJSRenderer` with one static lane layer and one redrawn dynamic layer. A game-local initializer owns one rAF loop and native Astro controls. No shared traffic/lane/runner/spawn framework is added.

**Tech Stack:** Astro 5, TypeScript, PixiJS 8, Tailwind 4, existing BaseGame/PixiJSRenderer framework, Vitest/jsdom, Playwright, existing Turso/Kysely score path.

**Spec:** `docs/superpowers/specs/2026-08-22-signal-switch-design.md`

## Global Constraints

- Deliver HPA-71 in **one implementation PR**.
- ID `signal_switch`, route `/signal-switch`, title `Signal Switch`, icon `🚦`.
- Run duration 90 seconds; logical canvas 800×360; BaseGame `timeBonus: false`.
- Signal order is Cyan → Magenta → Amber → Cyan.
- Signal metadata has one production authority: `SIGNAL_SWITCH_SIGNALS` in `types.ts` carries `label`, `glyph`, `shapeName`, and `color`.
- Lane topology has one production authority: `laneUnlockSeconds: [0, 0, 30, 60]`. Do not add separate `maxLanes`, `startingLaneCount`, `lane3UnlockSeconds`, or `lane4UnlockSeconds` config fields.
- Start with 3 integrity; the deterministic first drone is Lane 1 / Magenta and consumes zero RNG.
- Keep at most one unresolved drone per active lane.
- Every random drone signal differs from that lane's current gate at spawn time.
- A successful random spawn consumes exactly two RNG reads: free-lane choice then non-matching-signal choice. All-busy deferral consumes zero reads.
- `SignalSwitchDrone.x` is the horizontal **center**. Crossing compares center X to `gateX`; renderer body geometry uses `x - droneWidth / 2`.
- Difficulty uses accumulated simulation time, not BaseGame wall-clock elapsed time.
- Initial tuning defaults live once in `SIGNAL_SWITCH_RULES`: spawn X 64, gate X 680, 32×22 drone, speed 140→240 px/s, requested spawn interval **3.2→1.1 s**, outer update clamp 0.1 s.
- Requested spawn cadence must stay above lane-capacity cadence at the start, immediately before each positive lane unlock, and run end.
- Crossing uses `previousX < gateX && nextX >= gateX`; no 1/120 physics substeps.
- All-busy traffic holds one ready spawn only; no catch-up bursts.
- A mismatch resets combo, removes one integrity, and subtracts no score. Third mismatch ends the run.
- `survivedFullRun` is true only when `outcome === 'survived' && safePasses > 0`.
- Failure UI: `SIGNAL LOST / Systems failed`; timeout UI: `SHIFT COMPLETE / Survived`.
- Four native lane buttons plus keys 1–4 call one `cycleGate()` API. No canvas hit testing.
- `showPause={false}` and `showEnd={false}`; no manual End Game.
- Extract the already-duplicated `isEditableTarget()` predicate to `shared/utils.ts` and update Gravity Flip + Pattern Pulse to import it; do not create a third copy.
- Keep `emitStateChange()` private to Signal Switch. Do not migrate BaseGame or existing game classes.
- Page init uses the established `DOMContentLoaded` wrapper.
- Create the route before activating the `GAMES` row.
- Register Signal Switch as shallow `lattice/ice` and append normally; organism counts become 7/9/4. No load-bearing insertion index.
- Keep `getGameUrl()` and `e2e/games/all-games-navigation.spec.ts` source-unchanged.
- `BaseGame.ts`, `GameTimer.ts`, `ScoreManager.ts`, `GameInitializer.ts`, `PixiJSRenderer.ts`, score service, DB/API/auth stay production-unchanged.
- The manual-play tuning checkpoint occurs **after Task 4 makes the game playable and before Task 5 freezes catalog/achievement/browser regressions**.
- Balance-sensitive test expectations derive from `SIGNAL_SWITCH_RULES` rather than duplicating its literals. Exact literals remain only where they are the behavior under test (scoring formula and deliberately synthetic crossing/congestion fixtures).

## Load-Bearing Risks

- **Opening saturation:** 3.2s opening cadence must retain capacity headroom through the two-lane phase.
- **Impossible same-lane traffic:** free-lane filtering is the only random lane source.
- **Picker test degeneracy:** RNG lane-selection coverage must offer at least two free lanes.
- **Zero-action generated drones:** remove the selected lane's current gate signal before the second RNG read.
- **Coordinate drift:** crossing and rendering both treat `drone.x` as center.
- **Frame tunneling:** previous→next center crossing handles any accepted 0.1s step.
- **Background-tab difficulty jump:** simulation ramp is rAF-driven; BaseGame alone owns timeout.
- **Zero-activity achievement:** `survivedFullRun` requires at least one safe pass.
- **Spawn burst after congestion:** all-busy readiness is capped and consumes no RNG.
- **Double terminal save:** fatal crossing returns immediately after BaseGame is ended.
- **Missing state emitter:** Task 2 explicitly defines the local private `emitStateChange()` method.
- **Metadata drift:** label/glyph/shape/color are one keyed signal catalog.
- **Page-bootstrap source brittleness:** markup test checks token ordering, not quote/spacing formatting.
- **Over-generalization:** only `isEditableTarget` is extracted because HPA-71 creates its third real consumer; traffic/rAF/overlay helpers remain local.

---

## Task 1: Contracts, stable ID/icon, signal catalog, and scoring

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Create: `src/lib/games/signal-switch/types.ts`
- Create: `src/lib/games/signal-switch/scoring.ts`
- Create: `src/lib/games/signal-switch/scoring.test.ts`

**Produces:** `GameID.SIGNAL_SWITCH`, icon mapping, signal order/catalog, `SIGNAL_SWITCH_RULES`, config/state/stats/data contracts, and the pure pass scorer. The active `GAMES` row remains deferred to Task 5.

- [ ] **1.1 Add the stable GameID and icon only**

```ts
// GameID
SIGNAL_SWITCH = 'signal_switch',

// GAME_ICONS
[GameID.SIGNAL_SWITCH]: '🚦',
```

Permanent test:

```ts
describe('Signal Switch stable ID and icon', () => {
    it('has the stable id and icon', () => {
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

- [ ] **1.2 Create the canonical signal and rule contracts**

Create `src/lib/games/signal-switch/types.ts`:

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

export const SIGNAL_SWITCH_SIGNALS: Readonly<
    Record<
        SignalSwitchSignal,
        {
            label: string
            glyph: string
            shapeName: 'Circle' | 'Triangle' | 'Diamond'
            color: number
        }
    >
> = {
    cyan: {
        label: 'Cyan',
        glyph: '●',
        shapeName: 'Circle',
        color: 0x22d3ee,
    },
    magenta: {
        label: 'Magenta',
        glyph: '▲',
        shapeName: 'Triangle',
        color: 0xec4899,
    },
    amber: {
        label: 'Amber',
        glyph: '◆',
        shapeName: 'Diamond',
        color: 0xf59e0b,
    },
}

export const SIGNAL_SWITCH_RULES = {
    duration: 90,
    canvasWidth: 800,
    canvasHeight: 360,
    laneUnlockSeconds: [0, 0, 30, 60] as const,
    startingIntegrity: 3,
    droneSpawnX: 64,
    gateX: 680,
    droneWidth: 32,
    droneHeight: 22,
    initialDroneSpeed: 140,
    finalDroneSpeed: 240,
    initialSpawnInterval: 3.2,
    finalSpawnInterval: 1.1,
    maxUpdateDelta: 0.1,
} as const
```

Define:

```ts
export type SignalSwitchOutcome =
    | 'playing'
    | 'systems-failed'
    | 'survived'

export interface SignalSwitchConfig extends BaseGameConfig {
    canvasWidth: number
    canvasHeight: number
    laneUnlockSeconds: readonly number[]
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
    /** Horizontal center in logical canvas pixels. */
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

Do not add difficulty presets, a lane registry, or separate max/start lane fields.

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

Expected: PASS.

- [ ] **1.5 Commit**

```bash
git add src/lib/games.ts src/lib/games.test.ts src/lib/games/signal-switch
git commit -m "feat(signal-switch): add contracts and scoring"
```

---

## Task 2: Game model, lane schedule, fair traffic, integrity, and lifecycle

**Files**
- Create: `src/lib/games/signal-switch/SignalSwitchGame.ts`
- Create: `src/lib/games/signal-switch/SignalSwitchGame.test.ts`
- Reuse unchanged: `src/lib/games/core/BaseGame.ts`
- Reuse unchanged: `src/lib/games/core/GameTimer.ts`
- Reuse: `src/lib/games/shared/utils.ts` (`clamp`, `lerp`)

**Produces:** `SignalSwitchGame`, public `cycleGate(laneIndex)`, simulation-time difficulty, traffic, center crossing, terminal behavior, stats/data, and the local state-change emitter.

- [ ] **2.1 Write RED idle/start/gate tests derived from the rule source**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lerp } from '@/lib/games/shared/utils'
import { SignalSwitchGame } from './SignalSwitchGame'
import {
    SIGNAL_SWITCH_RULES,
    createSignalSwitchConfig,
    type SignalSwitchConfig,
} from './types'

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

Rule-derived idle test:

```ts
it('starts idle from the rule source', () => {
    const game = createGame()
    const initialLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.filter(
        unlockAt => unlockAt <= 0
    ).length

    expect(game.getState()).toMatchObject({
        outcome: 'playing',
        activeLaneCount: initialLanes,
        gateSignals: Array.from(
            { length: SIGNAL_SWITCH_RULES.laneUnlockSeconds.length },
            () => 'cyan'
        ),
        drones: [],
        integrity: SIGNAL_SWITCH_RULES.startingIntegrity,
        droneSpeed: SIGNAL_SWITCH_RULES.initialDroneSpeed,
        spawnInterval: SIGNAL_SWITCH_RULES.initialSpawnInterval,
        isActive: false,
    })
})

it('authors the deterministic teaching drone without RNG', () => {
    const rng = vi.fn(() => 0)
    const game = new SignalSwitchGame(createSignalSwitchConfig({ rng }))
    game.start()
    expect(game.getState().drones).toEqual([
        {
            id: 'drone-0',
            laneIndex: 0,
            signal: 'magenta',
            x: SIGNAL_SWITCH_RULES.droneSpawnX,
        },
    ])
    expect(rng).not.toHaveBeenCalled()
})
```

Gate cycling locks Cyan→Magenta→Amber→Cyan, rejects idle input, non-integer/out-of-range indices, and lanes whose unlock time is still in the future.

Run and expect RED:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchGame.test.ts
```

- [ ] **2.2 Implement the BaseGame shell, lane derivation, first drone, gate cycle, and local emitter**

The class owns:

```ts
private elapsedSimSeconds = 0
private spawnElapsedSeconds = 0
private droneSequence = 0
```

Active lanes derive only from the schedule:

```ts
private activeLaneCountForElapsed(elapsedSeconds: number): number {
    return this.config.laneUnlockSeconds.filter(
        unlockAt => elapsedSeconds >= unlockAt
    ).length
}
```

`createInitialState()` uses `laneUnlockSeconds.length` for gate count and `activeLaneCountForElapsed(0)` for initial lanes. It initializes score/time/BaseGame flags, outcome `playing`, all gates Cyan, no drones, full integrity, zero counters, and initial speed/cadence from config.

`cycleGate()` validates active run/integer/active-lane bounds, advances through `SIGNAL_SWITCH_SIGNAL_ORDER`, emits state change, and returns true; rejected calls return false without mutation.

Start/reset:

```ts
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

Define the method the rest of Task 2 calls:

```ts
private emitStateChange(): void {
    if (this.callbacks.onStateChange) {
        this.callbacks.onStateChange(this.getState())
    }
    this.emit('state-change', { state: this.getState() })
}
```

Keep BaseGame unchanged; this local copy matches existing game convention.

- [ ] **2.3 Write RED simulation ramp and spawn-capacity headroom tests**

Use an unreachable gate to isolate the ramp from traffic outcomes:

```ts
function simulationGame(): SignalSwitchGame {
    return createGame({ gateX: 1_000_000 })
}

function advance(game: SignalSwitchGame, seconds: number): void {
    const steps = Math.round(seconds / SIGNAL_SWITCH_RULES.maxUpdateDelta)
    for (let i = 0; i < steps; i += 1) {
        game.update(SIGNAL_SWITCH_RULES.maxUpdateDelta)
    }
}
```

For every positive unlock time, assert active lanes just before the threshold equal the number of schedule entries already unlocked, then one max-delta step crosses the threshold and increases the count. Also test the midpoint using values derived from rules:

```ts
const halfway = SIGNAL_SWITCH_RULES.duration / 2
advance(game, halfway)
expect(game.getState().droneSpeed).toBeCloseTo(
    lerp(
        SIGNAL_SWITCH_RULES.initialDroneSpeed,
        SIGNAL_SWITCH_RULES.finalDroneSpeed,
        0.5
    ),
    5
)
expect(game.getState().spawnInterval).toBeCloseTo(
    lerp(
        SIGNAL_SWITCH_RULES.initialSpawnInterval,
        SIGNAL_SWITCH_RULES.finalSpawnInterval,
        0.5
    ),
    5
)
```

Add the load-bearing headroom invariant without a production helper:

```ts
it('keeps requested cadence above lane capacity through every phase', () => {
    const rules = SIGNAL_SWITCH_RULES
    const positiveUnlocks = rules.laneUnlockSeconds.filter(t => t > 0)
    const checkpoints = [
        0,
        ...positiveUnlocks.map(t => t - 0.001),
        rules.duration,
    ]

    for (const elapsed of checkpoints) {
        const progress = elapsed / rules.duration
        const speed = lerp(
            rules.initialDroneSpeed,
            rules.finalDroneSpeed,
            progress
        )
        const requestedInterval = lerp(
            rules.initialSpawnInterval,
            rules.finalSpawnInterval,
            progress
        )
        const activeLanes = rules.laneUnlockSeconds.filter(
            unlockAt => elapsed >= unlockAt
        ).length
        const laneCapacityInterval =
            (rules.gateX - rules.droneSpawnX) / speed / activeLanes

        expect(requestedInterval).toBeGreaterThan(laneCapacityInterval)
    }
})
```

Outer-delta test uses a synthetic fixed speed rather than a tuning literal:

```ts
const fixedSpeed = 137
const game = createGame({
    gateX: 1_000_000,
    initialDroneSpeed: fixedSpeed,
    finalDroneSpeed: fixedSpeed,
    initialSpawnInterval: 99,
    finalSpawnInterval: 99,
})
game.start()
const before = game.getState().drones[0].x
game.update(Number.NaN)
game.update(-1)
game.update(2)
expect(game.getState().drones[0].x - before).toBeCloseTo(
    fixedSpeed * SIGNAL_SWITCH_RULES.maxUpdateDelta,
    5
)
```

- [ ] **2.4 Implement difficulty derivation and accepted-update guard**

```ts
private syncDifficulty(): void {
    const progress = clamp(
        this.elapsedSimSeconds / this.config.duration,
        0,
        1
    )
    this.state.activeLaneCount =
        this.activeLaneCountForElapsed(this.elapsedSimSeconds)
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

`update()` rejects inactive/paused/non-finite/non-positive deltas, clamps to `config.maxUpdateDelta`, advances `elapsedSimSeconds` up to duration, then syncs difficulty.

- [ ] **2.5 Write RED crossing/combo/integrity tests using deliberately synthetic geometry**

Keep one fixture literal because it exists specifically to prove one-step crossing:

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
```

Test:

- matched Magenta first drone after one Lane-1 cycle crosses center 90→110 in one 0.1s update, scores 100, combo 1, no integrity loss;
- mismatch removes one integrity, resets combo, and score remains unchanged;
- `startingIntegrity: 1` ends once, with `outcome: systems-failed`, inactive/game-over true, and `onEnd` once. Stub `saveFinalScore()` before ending.

- [ ] **2.6 Implement previous-center/next-center resolution**

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

Matched resolution increments pass/combo/maxCombo and calls `calculateSignalSwitchPassPoints(this.state.combo)`. Mismatch increments crashes, resets combo, decrements integrity, and on zero sets `systems-failed`, emits state, starts `end().catch(...)`, and returns false. `update()` returns immediately when movement resolution returns false.

- [ ] **2.7 Write RED random-spawn and congestion tests**

Multi-candidate picker test:

```ts
it('selects among multiple free lanes and a non-matching signal', () => {
    const rng = vi
        .fn<() => number>()
        .mockReturnValueOnce(0.99)
        .mockReturnValueOnce(0.99)
    const game = new SignalSwitchGame(
        createSignalSwitchConfig({
            laneUnlockSeconds: [0, 0, 0],
            initialSpawnInterval: 0.1,
            finalSpawnInterval: 0.1,
            initialDroneSpeed: 1,
            finalDroneSpeed: 1,
            rng,
        })
    )

    game.start() // lane 0 occupied; free candidates are [1, 2]
    game.update(0.1)

    const spawned = game.getState().drones.find(d => d.id === 'drone-1')
    expect(spawned?.laneIndex).toBe(2)
    expect(spawned?.signal).not.toBe(game.getState().gateSignals[2])
    expect(rng).toHaveBeenCalledTimes(2)
})
```

Keep the existing two-lane all-busy test with unreachable gate: after the second lane fills, 20 further updates consume zero RNG.

Keep a compact congestion-release fixture (`spawnX:64`, `gateX:64.5`, fixed speed 1, interval 0.05): after several busy updates, the first crossing releases exactly one ready random spawn and consumes exactly two RNG reads, not a burst.

- [ ] **2.8 Implement free-lane spawning and the capped readiness accumulator**

Use a bounded `randomIndex(length)` helper. `freeActiveLanes()` builds active indices from `state.activeLaneCount` and removes occupied lanes.

```ts
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

After successful movement resolution:

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

All-busy deferral returns before RNG and leaves readiness capped at one current interval.

- [ ] **2.9 Add stats, submitted data, timeout, background guard, and reset tests**

Implement normal BaseGame stats plus:

```ts
protected getGameData(): Record<string, unknown> {
    const data = {
        safePasses: this.state.safePasses,
        crashes: this.state.crashes,
        maxCombo: this.state.maxCombo,
        integrityRemaining: this.state.integrity,
        survivedFullRun:
            this.state.outcome === 'survived' &&
            this.state.safePasses > 0,
    } satisfies SignalSwitchGameData
    return data
}

protected handleTimeUp(): void {
    this.state.outcome = 'survived'
    super.handleTimeUp()
}
```

Use fake timers + stubbed `saveFinalScore` to prove a 90-second wall-clock timeout sets outcome `survived` and ends once. Inspect the first argument captured by the save spy and assert `survivedFullRun: false` when no safe pass was processed.

Reset test derives expected gate count/integrity from rules, then proves a fresh Start recreates `drone-0` Magenta.

Run:

```bash
bun run test:run src/lib/games/signal-switch/SignalSwitchGame.test.ts src/lib/games/signal-switch/scoring.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **2.10 Commit**

```bash
git add src/lib/games/signal-switch/SignalSwitchGame.ts src/lib/games/signal-switch/SignalSwitchGame.test.ts
git commit -m "feat(signal-switch): implement lane traffic gameplay"
```

---

## Task 3: Two-layer Pixi renderer with one signal catalog

**Files**
- Create: `src/lib/games/signal-switch/SignalSwitchRenderer.ts`
- Create: `src/lib/games/signal-switch/SignalSwitchRenderer.test.ts`
- Reuse unchanged: `src/lib/games/renderers/PixiJSRenderer.ts`

- [ ] **3.1 Write RED renderer config/setup tests derived from config**

```ts
const config = createSignalSwitchConfig()
expect(createSignalSwitchRendererConfig(config)).toMatchObject({
    type: 'canvas',
    container: '#signal-switch-canvas',
    width: config.canvasWidth,
    height: config.canvasHeight,
    gateX: config.gateX,
    laneCount: config.laneUnlockSeconds.length,
    droneWidth: config.droneWidth,
    droneHeight: config.droneHeight,
    responsive: false,
})
```

Follow Gravity Flip's Pixi mock pattern and assert two Signal Switch-owned Graphics children after initialize: static lanes and dynamic scene.

- [ ] **3.2 Implement renderer shell and static layer**

`SignalSwitchRendererConfig` extends `PixiJSRendererConfig` with `gateX`, `laneCount`, `droneWidth`, and `droneHeight`.

`drawLanes()` derives lane height from `height / laneCount`, draws the dark board, horizontal separators, and gate-zone guide. No per-lane Y constants.

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
        laneCount: config.laneUnlockSeconds.length,
        droneWidth: config.droneWidth,
        droneHeight: config.droneHeight,
        responsive: false,
        backgroundColor: 0x020817,
        antialias: true,
    }
}
```

- [ ] **3.3 Write RED geometry tests for signal identity and center-X semantics**

Render Cyan/Magenta/Amber signals plus a locked lane and assert:

- Cyan uses circle marker geometry;
- Magenta uses a closed triangle path;
- Amber uses a closed diamond path;
- colors supplied to fill come from `SIGNAL_SWITCH_SIGNALS`;
- locked lane gets a translucent full-lane overlay;
- for a synthetic drone, body left edge equals `drone.x - config.droneWidth / 2` and its marker remains centered at `drone.x`.

Do not freeze unrelated decorative stroke counts.

- [ ] **3.4 Implement dynamic scene drawing without duplicate metadata tables**

Import `SIGNAL_SWITCH_SIGNALS` from `types.ts`; do not create `SIGNAL_COLORS`.

`drawSignalMarker()` switches only on `signal` to choose Pixi geometry and reads color from `SIGNAL_SWITCH_SIGNALS[signal].color`.

Drone drawing:

```ts
for (const drone of state.drones) {
    const y = this.laneCenterY(drone.laneIndex)
    const left = drone.x - this.signalConfig.droneWidth / 2
    const top = y - this.signalConfig.droneHeight / 2
    this.sceneGraphic
        .roundRect(
            left,
            top,
            this.signalConfig.droneWidth,
            this.signalConfig.droneHeight,
            6
        )
        .fill({ color: 0x0f172a, alpha: 0.95 })
    this.drawSignalMarker(this.sceneGraphic, drone.signal, drone.x, y, 7)
}
```

`cleanup()` destroys/nulls the two game-owned Graphics and delegates to `super.cleanup()`.

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

## Task 4: Shared editable-target helper, initializer, and playable `/signal-switch` route

**Files**
- Modify: `src/lib/games/shared/utils.ts`
- Modify: `src/lib/games/shared/utils.test.ts`
- Modify: `src/lib/games/gravity-flip/initFramework.ts`
- Modify: `src/lib/games/pattern-pulse/initFramework.ts`
- Create: `src/lib/games/signal-switch/initFramework.ts`
- Create: `src/lib/games/signal-switch/initFramework.test.ts`
- Create: `src/pages/signal-switch/index.astro`
- Modify: `src/pages/game-board-markup.test.ts`

The active `GAMES` row is still deferred; this task makes the page playable first.

- [ ] **4.1 Write RED shared editable-target tests**

Extend `shared/utils.test.ts`:

```ts
import { isEditableTarget } from './utils'

it('recognizes form controls as editable keyboard targets', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
})
```

Run and expect RED because the export does not exist:

```bash
bun run test:run src/lib/games/shared/utils.test.ts
```

- [ ] **4.2 Implement the shared helper and remove the two existing copies**

Add to `shared/utils.ts`:

```ts
export function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false
    }
    return (
        target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
    )
}
```

Delete the local helper from Gravity Flip and Pattern Pulse and import the shared function instead. Do not otherwise edit their keyboard behavior.

Run:

```bash
bun run test:run \
  src/lib/games/shared/utils.test.ts \
  src/lib/games/gravity-flip/initFramework.test.ts \
  src/lib/games/pattern-pulse/initFramework.test.ts
```

Expected: PASS.

- [ ] **4.3 Write RED Signal Switch missing-DOM/idle-init tests**

Use a jsdom fixture containing the board/canvas, score/time, additional stats, live region, Start/Reset, four lane buttons, game-over overlay/final stats, and Play Again.

Mock the renderer with the same `initialize/getApp/render/destroy` contract used by Gravity Flip initializer tests.

Assert:

- missing `#signal-switch-container` uses existing error handling and returns undefined;
- valid init renders once and returns one handle;
- idle HUD text is derived from `createSignalSwitchConfig()` values;
- every lane button starts with the catalog's Cyan glyph/label and remains disabled until Start.

- [ ] **4.4 Implement initializer callbacks and controls from canonical metadata**

Import `isEditableTarget` from shared utils and `SIGNAL_SWITCH_SIGNALS` from `types.ts`. Do not create a `SIGNAL_SHAPE_NAMES` table.

`syncHud(state)` writes integrity, combo, safe passes, active/total lanes, speed, score, and time. Total lanes is `config.laneUnlockSeconds.length`.

`syncControls(state)` reads each lane's signal metadata:

```ts
const meta = SIGNAL_SWITCH_SIGNALS[signal]
button.textContent = `Lane ${laneIndex + 1}: ${meta.glyph} ${meta.label}`
button.disabled = !state.isActive || laneIndex >= state.activeLaneCount
button.setAttribute(
    'aria-label',
    `Lane ${laneIndex + 1} gate, ${meta.label} ${meta.shapeName}`
)
```

Track previous `activeLaneCount` and integrity. When lane count rises, announce `Lane ${state.activeLaneCount} online.`. Integrity loss announces the remaining value. Ordinary gate changes do not overwrite the live region.

Terminal callbacks fill final counters and use the frozen failure/survival copy. Forward achievement/challenge results exactly as Gravity Flip does.

- [ ] **4.5 Add one rAF loop, responsive canvas override, delegated clicks, and keyboard input**

Copy Gravity Flip's canvas style override (`width:100%`, `height:auto`) and single rAF structure.

One delegated `#gate-controls` click handler resolves `closest('[data-signal-lane]')` and calls `cycleGate(Number(dataset.signalLane))`.

Keyboard map is `1→0`, `2→1`, `3→2`, `4→3`. Ignore repeat, Ctrl/Meta/Alt, shared `isEditableTarget(...)`, and `HTMLButtonElement` targets. Prevent default only on a successful cycle.

Initializer tests cover locked-lane rejection before unlock, lane enablement after simulated unlock, one key cycle, modifier/editable/button guards, and no focused-button double activation.

- [ ] **4.6 Add Reset, Play Again, beforeunload, terminal, and cleanup coverage**

Reset calls `game.reset()`, renders/syncs idle state, hides overlay, and shows Start. Play Again hides overlay and calls `game.start()` so BaseGame auto-resets and immediately starts.

`beforeunload` warns only while active. `cleanup()` is idempotent, cancels rAF, removes tracked listeners, unregisters end handling, destroys renderer, and destroys game once.

Use deterministic model advancement plus stubbed final saves to cover failure and timeout UI without network dependence.

- [ ] **4.7 Create the Astro route using rule-derived tunable presentation**

Frontmatter imports `SIGNAL_SWITCH_RULES` and derives:

```ts
const totalLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.length
const startingLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.filter(
  unlockAt => unlockAt <= 0
).length
```

`GamePage` uses:

```astro
<GamePage
  gameId="signal-switch"
  title="Signal Switch"
  description="Switch each lane gate to match incoming drone signals before impact."
  icon="🚦"
  initialTime={SIGNAL_SWITCH_RULES.duration}
  showPause={false}
  showEnd={false}
  showReset={true}
  overlayTitle="SIGNAL LOST"
>
```

Idle HUD derives integrity, lane counts, and speed from rules instead of repeating tuning literals. Keep four native buttons in a 2×2 grid with Cyan text; four lanes are a structural v1 contract.

After `</GamePage>`:

```astro
<script>
  import { initSignalSwitchGameFramework } from '@/lib/games/signal-switch/initFramework'

  document.addEventListener('DOMContentLoaded', () => {
    initSignalSwitchGameFramework()
      .then(handle => {
        if (handle) {
          ;(
            window as Window & { signalSwitchGame?: typeof handle }
          ).signalSwitchGame = handle
        }
      })
      .catch(error => {
        console.error('Signal Switch failed to initialize', error)
      })
  })
</script>
```

Canvas CSS follows Gravity Flip: block, max-width 100%, height auto, touch-action manipulation.

- [ ] **4.8 Add formatting-tolerant markup coverage**

Load `signalSwitchMarkup`, verify stable board/control/final-stat IDs, four lane attributes, GamePage use, `showPause={false}`, `showEnd={false}`, and no `id="end-btn"`.

For bootstrap ordering, do **not** pin quote/whitespace formatting:

```ts
const readyIndex = signalSwitchMarkup.indexOf('DOMContentLoaded')
const initCallIndex = signalSwitchMarkup.indexOf(
    'initSignalSwitchGameFramework()'
)
expect(readyIndex).toBeGreaterThan(-1)
expect(initCallIndex).toBeGreaterThan(readyIndex)
```

Do not add Signal Switch to the shared all-page sweep until Task 5 activates the registry row.

Run:

```bash
bun run test:run \
  src/lib/games/shared/utils.test.ts \
  src/lib/games/gravity-flip/initFramework.test.ts \
  src/lib/games/pattern-pulse/initFramework.test.ts \
  src/lib/games/signal-switch/initFramework.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **4.9 Commit the playable route**

```bash
git add \
  src/lib/games/shared/utils.ts \
  src/lib/games/shared/utils.test.ts \
  src/lib/games/gravity-flip/initFramework.ts \
  src/lib/games/pattern-pulse/initFramework.ts \
  src/lib/games/signal-switch \
  src/pages/signal-switch/index.astro \
  src/pages/game-board-markup.test.ts
git commit -m "feat(signal-switch): wire playable route and controls"
```

---

## Mandatory tuning checkpoint — after Task 4, before Task 5

The game is now playable but not yet registered/achievement-frozen. Run one serious manual session and record PASS/CHANGE for:

1. first teaching drone discovery time with the 3.2s opening cadence;
2. readability immediately before and after the 30s third-lane unlock;
3. readability immediately before and after the 60s fourth-lane unlock;
4. late two-cycle reaction time;
5. whether a strong run can reach 40 safe passes.

If a tuning value changes:

- edit only `SIGNAL_SWITCH_RULES` and/or scoring constants;
- update behavior tests that intentionally depend on the changed behavior;
- update the design spec table;
- keep tests that merely display/configure the value derived from the rule source;
- rerun Signal Switch unit/initializer/renderer tests and typecheck.

If changes were needed, commit them before Task 5:

```bash
git add src/lib/games/signal-switch docs/superpowers/specs/2026-08-22-signal-switch-design.md
git commit -m "tune(signal-switch): adjust playable defaults"
```

Do not add a subsystem to solve balance.

---

## Task 5: Catalog, shared data, achievements, and repo metadata

**Files**
- Modify: `src/lib/games.ts`
- Modify: `src/lib/games.test.ts`
- Modify: `src/lib/games/shared/types.ts`
- Modify: `src/lib/organisms.test.ts`
- Modify: `src/lib/achievements.ts`
- Modify: `src/lib/achievements.test.ts`
- Modify: `src/pages/game-board-markup.test.ts`
- Modify: `CLAUDE.md`

- [ ] **5.1 Write RED final registration and organism tests**

Registry expectation:

```ts
expect(getGameById(GameID.SIGNAL_SWITCH)).toMatchObject({
    id: GameID.SIGNAL_SWITCH,
    name: 'Signal Switch',
    category: 'action',
    estimatedDuration: '1-2 minutes',
    difficulty: 'medium',
    isActive: true,
    organism: { shape: 'lattice', color: 'ice' },
    depth: 'shallow',
})
expect(getGameUrl(GameID.SIGNAL_SWITCH)).toBe('/signal-switch')
```

Update only the existing depth count expectation to 7/9/4. The existing adjacency test is the regression for the organism choice; do not add an insertion-index test.

Run and expect RED because the active row does not exist:

```bash
bun run test:run src/lib/games.test.ts src/lib/organisms.test.ts
```

- [ ] **5.2 Append the active GAMES row normally**

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
    organism: { shape: 'lattice', color: 'ice' },
    depth: 'shallow',
},
```

No catalog-order comment or special insertion position is needed. Filtered order is Pattern Pulse chain/magenta → Signal Switch lattice/ice → Tetris lattice/teal, so the existing exact shape+color adjacency invariant remains green.

- [ ] **5.3 Add the canonical shared data alias**

```ts
export type SignalSwitchGameData =
    import('../signal-switch/types').SignalSwitchGameData
```

Add it to `GameData` and `AchievementCheckData`.

- [ ] **5.4 Write RED tests for exactly four achievements including the zero-pass guard**

Expected IDs:

```ts
[
    'signal_switch_first_clearance',
    'signal_switch_streak',
    'signal_switch_clean_shift',
    'signal_switch_traffic_controller',
]
```

Lock:

- First Clearance: score threshold 100;
- Signal Streak: maxCombo ≥ 10;
- Clean Shift: `survivedFullRun && crashes === 0`;
- Traffic Controller: `survivedFullRun && safePasses >= 40`.

Include a Clean Shift negative case with `survivedFullRun: false`, `safePasses: 0`, `crashes: 0` to represent the background-timeout guard.

- [ ] **5.5 Add the four existing-machinery definitions**

Use the same four definitions above; no achievement-service changes. `SignalSwitchGameData` is the typed input for in-game checks.

Run:

```bash
bun run test:run src/lib/achievements.test.ts
```

Expected: PASS.

- [ ] **5.6 Finish the shared page sweep and CLAUDE.md**

Add `'signal-switch'` to the shared GamePage markup sweep now that it is registered.

Update `CLAUDE.md`: 19→20 implemented games, add Signal Switch to the list/tree/Pixi renderer notes, and document `window.signalSwitchGame`.

Run:

```bash
bun run test:run \
  src/lib/games.test.ts \
  src/lib/organisms.test.ts \
  src/lib/achievements.test.ts \
  src/pages/game-board-markup.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **5.7 Commit**

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
git commit -m "feat(signal-switch): register game and achievements"
```

---

## Task 6: Browser lifecycle/mobile regression and final gates

**Files**
- Modify: `e2e/games/play-coverage.spec.ts`
- Verify source-unchanged: `e2e/games/all-games-navigation.spec.ts`

Tuning is already complete before this task; this task freezes browser behavior rather than discovering balance.

- [ ] **6.1 Import final rule/scoring authorities and add bounded model advancement**

At the Playwright file, import:

```ts
import { SIGNAL_SWITCH_RULES } from '../../src/lib/games/signal-switch/types'
import { SIGNAL_SWITCH_BASE_PASS_POINTS } from '../../src/lib/games/signal-switch/scoring'
```

Add a bounded helper that calls the exposed `window.signalSwitchGame.game.update(0.1)` until either one safe pass or game over, with a hard iteration cap. Do not add a test-only production API.

- [ ] **6.2 Add the real-control safe-pass → Reset → failure → Play Again journey**

Intercept `**/api/scores` with a successful empty-achievement payload before navigation.

Idle assertions derive values:

```ts
const totalLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.length
const startingLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.filter(
    unlockAt => unlockAt <= 0
).length

await expect(page.locator('#integrity')).toHaveText(
    `${SIGNAL_SWITCH_RULES.startingIntegrity} / ${SIGNAL_SWITCH_RULES.startingIntegrity}`
)
await expect(page.locator('#lanes-online')).toHaveText(
    `${startingLanes} / ${totalLanes}`
)
```

Journey:

1. click Start;
2. click Lane 1 once (teaching Cyan→Magenta action);
3. advance until safe pass;
4. assert safe passes 1, combo 1, score `SIGNAL_SWITCH_BASE_PASS_POINTS`, full integrity;
5. Reset then Start;
6. leave all gates Cyan and advance the **same run** until three non-Cyan mismatches end it;
7. assert visible overlay, `SIGNAL LOST`, `Systems failed`, zero final integrity;
8. click Play Again;
9. assert overlay hidden, integrity restored from rules, safe passes 0, Lane 1 Cyan.

The failure half is deterministic because generated drones exclude the selected lane's current signal.

- [ ] **6.3 Add 375×812 reachability/no-overflow coverage**

Set the viewport to 375×812, open the page, assert four lane buttons exist and are visible/reachable, document scroll width ≤375, every button bounding box stays within viewport width, and rendered canvas width ≤375 with positive height. Do not freeze device-pixel-ratio-dependent intrinsic dimensions.

- [ ] **6.4 Run targeted gates**

```bash
bun run test:run \
  src/lib/games/signal-switch \
  src/lib/games/shared/utils.test.ts \
  src/lib/games/gravity-flip/initFramework.test.ts \
  src/lib/games/pattern-pulse/initFramework.test.ts \
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

- [ ] **6.5 Run full repository gates and scope checks**

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

Verify prohibited production paths remain unchanged:

```bash
git diff --exit-code main...HEAD -- \
  src/lib/games/core/BaseGame.ts \
  src/lib/games/core/GameTimer.ts \
  src/lib/games/core/ScoreManager.ts \
  src/lib/games/core/GameInitializer.ts \
  src/lib/games/renderers/PixiJSRenderer.ts \
  src/lib/services/scoreService.ts \
  src/lib/server/db \
  src/pages/api \
  src/lib/auth.ts \
  src/lib/auth-client.ts \
  e2e/games/all-games-navigation.spec.ts
```

Do **not** include `shared/utils.ts`, Gravity Flip initializer, or Pattern Pulse initializer in the no-diff check; their narrow editable-target reuse change is explicitly part of this plan.

- [ ] **6.6 Commit**

```bash
git add e2e/games/play-coverage.spec.ts
git commit -m "test(signal-switch): cover browser lifecycle and mobile layout"
```

---

## Final Implementation PR Checklist

- [ ] HPA-71 is one implementation PR.
- [ ] `SignalSwitchGame` owns traffic/gates/integrity; no shared lane/traffic/runner/spawn framework exists.
- [ ] Opening requested cadence retains lane-capacity headroom at all phase boundaries.
- [ ] Tuning occurred immediately after the playable Task 4 checkpoint, before registry/E2E freezes.
- [ ] Tunable test expectations derive from `SIGNAL_SWITCH_RULES` rather than duplicated literals.
- [ ] Signal label/glyph/shapeName/color have one keyed catalog.
- [ ] Lane counts derive from `laneUnlockSeconds`; no duplicate max/start/third/fourth lane config fields exist.
- [ ] Free-lane selection is tested with at least two free candidates.
- [ ] All-busy congestion consumes zero RNG and cannot burst on release.
- [ ] `SignalSwitchDrone.x` is center in spawn, movement, crossing, and renderer geometry.
- [ ] Gate crossing uses previous/next center X and needs no physics substeps.
- [ ] Local `emitStateChange()` is explicitly implemented; BaseGame is unchanged.
- [ ] Timeout outcome is `survived`, but zero-pass timeout submits `survivedFullRun: false`.
- [ ] Three integrity failures end once.
- [ ] `isEditableTarget()` has one shared implementation used by Gravity Flip, Pattern Pulse, and Signal Switch.
- [ ] Page bootstrap uses `DOMContentLoaded`; markup coverage is formatting-tolerant.
- [ ] Signal Switch appends normally as shallow `lattice/ice`; organism counts are 7/9/4 and existing adjacency test passes.
- [ ] Exactly four Signal Switch achievements use existing machinery.
- [ ] Reset returns idle; Play Again starts a clean run.
- [ ] 375×812 controls are reachable with no horizontal overflow.
- [ ] Core framework/backend/API/auth/all-games-navigation paths have no HPA-71 production diff.
- [ ] Full unit/coverage/type/lint/format/build/Playwright gates pass.
