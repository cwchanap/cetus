import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameID, getGameIcon } from '@/lib/games'
import { createRhythmReactorChart } from './chart'
import { calculateRhythmReactorAccuracy } from './scoring'
import {
    RHYTHM_REACTOR_RULES,
    type RhythmReactorConfig,
    type RhythmReactorNote,
} from './types'
import {
    createRhythmReactorConfig,
    RhythmReactorGame,
} from './RhythmReactorGame'

const oneNote = [{ id: 'note-0', laneIndex: 0 as const, hitTimeSeconds: 2 }]

function createGame(
    overrides: Partial<RhythmReactorConfig> = {}
): RhythmReactorGame {
    return new RhythmReactorGame(
        createRhythmReactorConfig({ chart: oneNote, ...overrides })
    )
}

function advanceGame(game: RhythmReactorGame, seconds: number): void {
    let remaining = seconds
    while (remaining > 1e-9) {
        const step = Math.min(0.1, remaining)
        game.update(step)
        remaining -= step
    }
}

function getGameData(game: RhythmReactorGame) {
    return (
        game as unknown as {
            getGameData: () => Record<string, unknown>
        }
    ).getGameData()
}

function handleTimeUp(game: RhythmReactorGame): void {
    ;(
        game as unknown as {
            handleTimeUp: () => void
        }
    ).handleTimeUp()
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('Rhythm Reactor identity and config', () => {
    it('uses the expected stable ID and icon', () => {
        expect(GameID.RHYTHM_REACTOR).toBe('rhythm_reactor')
        expect(getGameIcon(GameID.RHYTHM_REACTOR)).toBe('🎵')
    })

    it('materializes a fresh default chart and accepts a chart override', () => {
        const first = createRhythmReactorConfig()
        const second = createRhythmReactorConfig()
        const overridden = createRhythmReactorConfig({ chart: oneNote })

        expect(first.chart).not.toBe(second.chart)
        expect(first.chart).toEqual(createRhythmReactorChart())
        expect(overridden.chart).toBe(oneNote)
    })

    it('clones chart notes into the initial state', () => {
        const config = createRhythmReactorConfig({ chart: oneNote })
        const game = new RhythmReactorGame(config)
        const state = game.getState()

        expect(state.pendingNotes).not.toBe(config.chart)
        expect(state.pendingNotes[0]).not.toBe(config.chart[0])

        state.pendingNotes[0].id = 'changed'
        state.pendingNotes.pop()

        expect(config.chart).toEqual(oneNote)
    })
})

describe('RhythmReactorGame timing and judgments', () => {
    it('clamps accepted updates and ignores inactive or invalid deltas', () => {
        const game = createGame()

        game.update(0.1)
        expect(game.getState().elapsedSeconds).toBe(0)

        game.start()
        game.update(2)
        expect(game.getState().elapsedSeconds).toBeCloseTo(
            RHYTHM_REACTOR_RULES.maxUpdateDelta
        )

        const elapsed = game.getState().elapsedSeconds
        game.update(Number.NaN)
        game.update(Number.POSITIVE_INFINITY)
        game.update(0)
        game.update(-1)
        expect(game.getState().elapsedSeconds).toBe(elapsed)

        game.update(0.1)
        expect(game.getState().elapsedSeconds).toBeCloseTo(0.2)
    })

    it.each([
        -RHYTHM_REACTOR_RULES.perfectWindowSeconds,
        RHYTHM_REACTOR_RULES.perfectWindowSeconds,
    ])('judges exact Perfect boundary offset %s as Perfect', offset => {
        const game = createGame()
        game.start()
        advanceGame(game, 2 + offset)

        expect(game.hitLane(0)).toMatchObject({
            accepted: true,
            judgment: 'perfect',
        })
    })

    it.each([
        -RHYTHM_REACTOR_RULES.goodWindowSeconds,
        -(RHYTHM_REACTOR_RULES.perfectWindowSeconds + 0.01),
        RHYTHM_REACTOR_RULES.perfectWindowSeconds + 0.01,
        RHYTHM_REACTOR_RULES.goodWindowSeconds,
    ])('judges Good boundary offset %s as Good', offset => {
        const game = createGame()
        game.start()
        advanceGame(game, 2 + offset)

        expect(game.hitLane(0)).toMatchObject({
            accepted: true,
            judgment: 'good',
        })
    })

    it.each([
        -RHYTHM_REACTOR_RULES.missWindowSeconds,
        -(RHYTHM_REACTOR_RULES.goodWindowSeconds + 0.01),
        RHYTHM_REACTOR_RULES.goodWindowSeconds + 0.01,
        RHYTHM_REACTOR_RULES.missWindowSeconds,
    ])('consumes Miss boundary offset %s as one Miss', offset => {
        const game = createGame()
        game.start()
        advanceGame(game, 2 + offset)

        expect(game.hitLane(0)).toEqual({
            accepted: true,
            judgment: 'miss',
            points: 0,
        })
        expect(game.getState()).toMatchObject({
            misses: 1,
            pendingNotes: [],
        })
    })

    it('consumes an early 0.20s press as one note miss', () => {
        const game = createGame()
        game.start()
        advanceGame(game, 1.8)

        game.hitLane(0)
        advanceGame(game, 1)

        expect(game.getState()).toMatchObject({
            misses: 1,
            strayPresses: 0,
            pendingNotes: [],
        })
    })

    it('registers a same-lane miss-window absence as a stray press', () => {
        const game = createGame()
        game.start()
        advanceGame(game, 2)

        expect(game.hitLane(1)).toEqual({
            accepted: true,
            judgment: 'miss',
            points: 0,
        })
        expect(game.getState()).toMatchObject({
            strayPresses: 1,
            misses: 0,
            pendingNotes: oneNote,
        })
    })

    it('expires a note only after the end of its Miss window', () => {
        const game = createGame()
        game.start()
        advanceGame(game, 2 + RHYTHM_REACTOR_RULES.missWindowSeconds)

        expect(game.getState()).toMatchObject({
            misses: 0,
            pendingNotes: oneNote,
        })

        game.update(0.001)
        expect(game.getState()).toMatchObject({
            misses: 1,
            pendingNotes: [],
        })
    })

    it('never counts more misses than the source chart length', () => {
        const chart: RhythmReactorNote[] = [
            { id: 'note-0', laneIndex: 0, hitTimeSeconds: 2 },
            { id: 'note-1', laneIndex: 1, hitTimeSeconds: 3 },
        ]
        const game = createGame({ chart })
        game.start()
        advanceGame(game, 10)
        advanceGame(game, 10)

        expect(game.getState().misses).toBe(chart.length)
        expect(game.getState().pendingNotes).toHaveLength(0)
    })

    it('resets combo and applies one stability loss for a note Miss and stray', () => {
        const chart: RhythmReactorNote[] = [
            { id: 'note-0', laneIndex: 0, hitTimeSeconds: 2 },
            { id: 'note-1', laneIndex: 0, hitTimeSeconds: 3 },
        ]
        const game = createGame({ chart })
        game.start()
        advanceGame(game, 2)
        game.hitLane(0)
        advanceGame(game, 0.8)

        game.hitLane(0)
        expect(game.getState()).toMatchObject({
            combo: 0,
            misses: 1,
            strayPresses: 0,
            stability: 58,
        })

        game.hitLane(1)
        expect(game.getState()).toMatchObject({
            combo: 0,
            misses: 1,
            strayPresses: 1,
            stability: 52,
        })
    })

    it('applies the combo 10 stability bonus on the tenth successful hit', () => {
        const chart: RhythmReactorNote[] = Array.from(
            { length: 10 },
            (_, index) => ({
                id: `note-${index}`,
                laneIndex: 0 as const,
                hitTimeSeconds: 2,
            })
        )
        const game = createGame({
            chart,
            initialStability: 0,
            perfectStabilityGain: 1,
        })
        game.start()
        advanceGame(game, 2)

        for (let index = 0; index < chart.length; index += 1) {
            expect(game.hitLane(0).judgment).toBe('perfect')
        }

        expect(game.getState()).toMatchObject({
            combo: 10,
            maxCombo: 10,
            stability: 15,
        })
    })

    it('clamps stability to 0 and 100 without ending at zero', () => {
        const lowGame = createGame({ initialStability: 1 })
        lowGame.start()
        lowGame.hitLane(1)
        expect(lowGame.getState()).toMatchObject({
            stability: 0,
            isActive: true,
            isGameOver: false,
        })

        const highGame = createGame({ initialStability: 99 })
        highGame.start()
        advanceGame(highGame, 2)
        highGame.hitLane(0)
        expect(highGame.getState().stability).toBe(100)
    })
})

describe('RhythmReactorGame lifecycle and reporting', () => {
    it('rejects inactive input without mutating state', () => {
        const game = createGame()
        const before = game.getState()

        expect(game.hitLane(0)).toEqual({
            accepted: false,
            judgment: null,
            points: 0,
        })
        expect(game.getState()).toEqual(before)
    })

    it('rejects paused input without mutating state', () => {
        const game = createGame({ pausable: true })
        game.start()
        game.pause()
        const before = game.getState()

        expect(game.hitLane(0)).toEqual({
            accepted: false,
            judgment: null,
            points: 0,
        })
        expect(game.getState()).toEqual(before)
    })

    it('rejects non-integer and out-of-range lanes without mutating state', () => {
        const game = createGame()
        game.start()
        const before = game.getState()

        for (const laneIndex of [-1, 4, 1.5, Number.NaN]) {
            expect(game.hitLane(laneIndex)).toEqual({
                accepted: false,
                judgment: null,
                points: 0,
            })
            expect(game.getState()).toEqual(before)
        }
    })

    it('resets from the config chart and clears stray presses', () => {
        const game = createGame()
        game.start()
        advanceGame(game, 1)
        game.hitLane(1)
        expect(game.getState().strayPresses).toBe(1)

        game.reset()
        expect(game.getState()).toMatchObject({
            elapsedSeconds: 0,
            pendingNotes: oneNote,
            strayPresses: 0,
            isActive: false,
            isGameOver: false,
        })

        game.start()
        advanceGame(game, 2)
        expect(game.hitLane(0).judgment).toBe('perfect')
    })

    it('settles all remaining notes on timeout without synthesizing strays', async () => {
        const chart: RhythmReactorNote[] = [
            { id: 'note-0', laneIndex: 0, hitTimeSeconds: 2 },
            { id: 'note-1', laneIndex: 1, hitTimeSeconds: 3 },
        ]
        const game = createGame({ chart })
        const saveSpy = vi
            .spyOn(game.getScoreManager(), 'saveFinalScore')
            .mockResolvedValue({ success: true })
        game.start()

        handleTimeUp(game)
        await Promise.resolve()

        expect(saveSpy).toHaveBeenCalledTimes(1)
        expect(game.getState()).toMatchObject({
            pendingNotes: [],
            misses: chart.length,
            strayPresses: 0,
            elapsedSeconds: game.getState().timeRemaining,
            isActive: false,
            isGameOver: true,
        })
    })

    it('reports stats, data, hits, accuracy, and final stability with strays', () => {
        const chart: RhythmReactorNote[] = [
            { id: 'note-0', laneIndex: 0, hitTimeSeconds: 1 },
            { id: 'note-1', laneIndex: 0, hitTimeSeconds: 2 },
            { id: 'note-2', laneIndex: 0, hitTimeSeconds: 3 },
        ]
        const game = createGame({ chart })
        game.start()
        advanceGame(game, 1)
        game.hitLane(0)
        advanceGame(game, 0.9)
        game.hitLane(0)
        advanceGame(game, 0.9)
        game.hitLane(0)
        game.hitLane(1)

        const stats = game.getGameStats()
        const data = getGameData(game)

        expect(stats).toMatchObject({
            finalScore: 160,
            gameCompleted: false,
            hits: 2,
            perfectHits: 1,
            goodHits: 1,
            misses: 1,
            strayPresses: 1,
            maxCombo: 2,
            accuracy: calculateRhythmReactorAccuracy(1, 1, 1, 1),
            finalStability: 54,
        })
        expect(data).toEqual({
            hits: 2,
            perfectHits: 1,
            goodHits: 1,
            misses: 1,
            strayPresses: 1,
            maxCombo: 2,
            accuracy: 37.5,
            finalStability: 54,
        })
    })

    it('emits one state change for each accepted update and hit', () => {
        const onStateChange = vi.fn()
        const game = new RhythmReactorGame(
            createRhythmReactorConfig({ chart: oneNote }),
            { onStateChange }
        )
        game.start()
        onStateChange.mockClear()

        game.update(0.1)
        expect(onStateChange).toHaveBeenCalledTimes(1)

        onStateChange.mockClear()
        game.hitLane(1)
        expect(onStateChange).toHaveBeenCalledTimes(1)
    })
})
