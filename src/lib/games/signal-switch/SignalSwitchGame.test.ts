import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 10; i += 1) {
        await Promise.resolve()
    }
}

function simulationGame(): SignalSwitchGame {
    return createGame({ gateX: 1_000_000 })
}

function advance(game: SignalSwitchGame, seconds: number): void {
    const steps = Math.round(seconds / SIGNAL_SWITCH_RULES.maxUpdateDelta)
    for (let i = 0; i < steps; i += 1) {
        game.update(SIGNAL_SWITCH_RULES.maxUpdateDelta)
    }
}

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

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('SignalSwitchGame', () => {
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

    it('cycles lane gates through the signal order and emits state changes', () => {
        const onStateChange = vi.fn()
        const game = new SignalSwitchGame(
            createSignalSwitchConfig({ rng: () => 0 }),
            { onStateChange }
        )
        game.start()

        expect(game.cycleGate(0)).toBe(true)
        expect(game.getState().gateSignals[0]).toBe('magenta')
        expect(game.cycleGate(0)).toBe(true)
        expect(game.getState().gateSignals[0]).toBe('amber')
        expect(game.cycleGate(0)).toBe(true)
        expect(game.getState().gateSignals[0]).toBe('cyan')
        expect(onStateChange).toHaveBeenCalled()
        expect(onStateChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ gateSignals: expect.any(Array) })
        )
    })

    it('rejects gate cycles that are idle, malformed, out of range, or locked', () => {
        const game = createGame()
        expect(game.cycleGate(0)).toBe(false)

        game.start()
        expect(game.cycleGate(0.5)).toBe(false)
        expect(game.cycleGate(Number.NaN)).toBe(false)
        expect(game.cycleGate(-1)).toBe(false)
        expect(game.cycleGate(4)).toBe(false)
        expect(game.cycleGate(2)).toBe(false)
        expect(game.cycleGate(3)).toBe(false)
        expect(game.getState().gateSignals).toEqual([
            'cyan',
            'cyan',
            'cyan',
            'cyan',
        ])
    })

    it('unlocks scheduled lanes as simulated time crosses each threshold', () => {
        const game = simulationGame()
        game.start()
        const unlocks = SIGNAL_SWITCH_RULES.laneUnlockSeconds.filter(
            unlockAt => unlockAt > 0
        )
        const exactStep = 0.0625
        let stepsDone = 0

        for (const unlockAt of unlocks) {
            const alreadyUnlocked =
                SIGNAL_SWITCH_RULES.laneUnlockSeconds.filter(
                    threshold => unlockAt > threshold
                ).length
            const targetSteps = unlockAt / exactStep - 1

            while (stepsDone < targetSteps) {
                game.update(exactStep)
                stepsDone += 1
            }

            expect(game.getState().activeLaneCount).toBe(alreadyUnlocked)

            game.update(SIGNAL_SWITCH_RULES.maxUpdateDelta)
            stepsDone += 1
            expect(game.getState().activeLaneCount).toBe(alreadyUnlocked + 1)
        }
    })

    it('ramps speed and cadence along simulated progress', () => {
        const game = simulationGame()
        game.start()

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
    })

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

    it('clamps hostile update deltas to the configured maximum', () => {
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
    })

    it('scores a matched crossing with combo growth and no integrity loss', () => {
        const game = crossingGame()
        game.start()
        expect(game.cycleGate(0)).toBe(true)
        game.update(0.1)
        expect(game.getState()).toMatchObject({
            score: 100,
            safePasses: 1,
            combo: 1,
            maxCombo: 1,
            integrity: SIGNAL_SWITCH_RULES.startingIntegrity,
            crashes: 0,
            drones: [],
        })
    })

    it('removes one integrity on a mismatch without touching score', () => {
        const game = crossingGame()
        game.start()
        game.update(0.1)
        expect(game.getState()).toMatchObject({
            crashes: 1,
            combo: 0,
            integrity: SIGNAL_SWITCH_RULES.startingIntegrity - 1,
            score: 0,
        })
    })

    it('resets an earned combo on mismatch while preserving score', () => {
        const game = createGame({
            laneUnlockSeconds: [0],
            droneSpawnX: 90,
            gateX: 100,
            initialDroneSpeed: 200,
            finalDroneSpeed: 200,
            initialSpawnInterval: 0.1,
            finalSpawnInterval: 0.1,
        })
        game.start()
        expect(game.cycleGate(0)).toBe(true)
        game.update(0.1)
        expect(game.getState()).toMatchObject({
            safePasses: 1,
            combo: 1,
            score: 100,
        })
        game.update(0.1)
        expect(game.getState()).toMatchObject({
            crashes: 1,
            combo: 0,
            integrity: SIGNAL_SWITCH_RULES.startingIntegrity - 1,
            score: 100,
        })
    })

    it('ends exactly once with systems-failed when integrity reaches zero', async () => {
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
            }),
            { onEnd }
        )
        stubFinalSave(game)
        game.start()

        game.update(0.1)
        await flushMicrotasks()

        expect(game.getState()).toMatchObject({
            outcome: 'systems-failed',
            integrity: 0,
            isActive: false,
            isGameOver: true,
        })
        expect(onEnd).toHaveBeenCalledTimes(1)

        game.update(0.1)
        expect(game.cycleGate(0)).toBe(false)
        await flushMicrotasks()
        expect(onEnd).toHaveBeenCalledTimes(1)
    })

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

    it('defers spawning without consuming RNG while every active lane is busy', () => {
        const rng = vi.fn(() => 0)
        const game = new SignalSwitchGame(
            createSignalSwitchConfig({
                laneUnlockSeconds: [0, 0],
                gateX: 1_000_000,
                initialSpawnInterval: 0.05,
                finalSpawnInterval: 0.05,
                initialDroneSpeed: 1,
                finalDroneSpeed: 1,
                rng,
            })
        )

        game.start()
        game.update(0.05)
        expect(game.getState().drones).toHaveLength(2)

        const readsAfterFill = rng.mock.calls.length
        for (let i = 0; i < 20; i += 1) {
            game.update(SIGNAL_SWITCH_RULES.maxUpdateDelta)
        }

        expect(rng).toHaveBeenCalledTimes(readsAfterFill)
        expect(game.getState().drones).toHaveLength(2)
    })

    it('releases exactly one deferred spawn after congestion clears', () => {
        const rng = vi.fn(() => 0)
        const game = new SignalSwitchGame(
            createSignalSwitchConfig({
                laneUnlockSeconds: [0, 0],
                droneSpawnX: 64,
                gateX: 64.47,
                initialDroneSpeed: 1,
                finalDroneSpeed: 1,
                initialSpawnInterval: 0.05,
                finalSpawnInterval: 0.05,
                rng,
            })
        )

        game.start()
        game.update(0.05)
        for (let i = 0; i < 7; i += 1) {
            game.update(0.05)
        }
        expect(rng).toHaveBeenCalledTimes(2)

        const drones = game.getState().drones
        for (const drone of drones) {
            while (
                game.getState().gateSignals[drone.laneIndex] !== drone.signal
            ) {
                expect(game.cycleGate(drone.laneIndex)).toBe(true)
            }
        }

        game.update(0.05)
        expect(rng).toHaveBeenCalledTimes(2)
        game.update(0.05)

        expect(rng).toHaveBeenCalledTimes(4)
        expect(game.getState().safePasses).toBe(1)
        expect(game.getState().drones.map(d => d.id)).toEqual([
            'drone-1',
            'drone-2',
        ])
        expect(game.getState().drones[1]).toMatchObject({
            laneIndex: 0,
            x: 64,
        })
    })

    it('reports framework stats and submitted game data', () => {
        const game = crossingGame()
        game.start()
        expect(game.cycleGate(0)).toBe(true)
        game.update(0.1)

        const getGameData = (
            game as unknown as {
                getGameData: () => Record<string, unknown>
            }
        ).getGameData.bind(game)

        expect(game.getGameStats()).toEqual({
            finalScore: 100,
            timeElapsed: 0,
            gameCompleted: false,
            outcome: 'playing',
            safePasses: 1,
            crashes: 0,
            maxCombo: 1,
            integrityRemaining: SIGNAL_SWITCH_RULES.startingIntegrity,
        })
        expect(getGameData()).toEqual({
            safePasses: 1,
            crashes: 0,
            maxCombo: 1,
            integrityRemaining: SIGNAL_SWITCH_RULES.startingIntegrity,
            survivedFullRun: false,
        })
    })

    it('times out into a single survived outcome without safe passes', async () => {
        const onEnd = vi.fn()
        const game = new SignalSwitchGame(
            createSignalSwitchConfig({ rng: () => 0 }),
            { onEnd }
        )
        const saveSpy = vi
            .spyOn(game.getScoreManager(), 'saveFinalScore')
            .mockResolvedValue({ success: true })
        game.start()

        vi.advanceTimersByTime(90_000)
        await flushMicrotasks()

        expect(game.getState()).toMatchObject({
            outcome: 'survived',
            isActive: false,
            isGameOver: true,
        })
        expect(saveSpy).toHaveBeenCalledTimes(1)
        expect(saveSpy.mock.calls[0][0]).toMatchObject({
            safePasses: 0,
            survivedFullRun: false,
        })
        expect(onEnd).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(5_000)
        await flushMicrotasks()
        expect(saveSpy).toHaveBeenCalledTimes(1)
        expect(onEnd).toHaveBeenCalledTimes(1)
    })

    it('marks survivedFullRun only for a timed-out run with safe passes', async () => {
        const game = new SignalSwitchGame(
            createSignalSwitchConfig({
                duration: 1,
                droneSpawnX: 90,
                gateX: 100,
                initialDroneSpeed: 200,
                finalDroneSpeed: 200,
                initialSpawnInterval: 99,
                finalSpawnInterval: 99,
            })
        )
        const saveSpy = vi
            .spyOn(game.getScoreManager(), 'saveFinalScore')
            .mockResolvedValue({ success: true })
        game.start()

        expect(game.cycleGate(0)).toBe(true)
        game.update(0.1)
        vi.advanceTimersByTime(1_000)
        await flushMicrotasks()

        expect(game.getState().outcome).toBe('survived')
        expect(saveSpy.mock.calls[0][0]).toMatchObject({
            safePasses: 1,
            survivedFullRun: true,
        })
    })

    it('reset restores the rule-derived baseline and a fresh start reseeds the teaching drone', () => {
        const game = crossingGame()
        game.start()
        expect(game.cycleGate(0)).toBe(true)
        game.update(0.1)
        expect(game.getState().safePasses).toBe(1)

        game.reset()
        const laneCount = SIGNAL_SWITCH_RULES.laneUnlockSeconds.length
        const startingLanes = SIGNAL_SWITCH_RULES.laneUnlockSeconds.filter(
            unlockAt => unlockAt <= 0
        ).length
        expect(game.getState()).toMatchObject({
            gateSignals: Array.from({ length: laneCount }, () => 'cyan'),
            integrity: SIGNAL_SWITCH_RULES.startingIntegrity,
            drones: [],
            safePasses: 0,
            crashes: 0,
            combo: 0,
            maxCombo: 0,
            score: 0,
            outcome: 'playing',
            activeLaneCount: startingLanes,
            isActive: false,
            isGameOver: false,
        })

        game.start()
        expect(game.getState().drones).toEqual([
            {
                id: 'drone-0',
                laneIndex: 0,
                signal: 'magenta',
                x: 90,
            },
        ])
    })
})
