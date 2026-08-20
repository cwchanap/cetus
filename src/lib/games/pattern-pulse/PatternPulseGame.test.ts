import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPulseGame } from './PatternPulseGame'
import {
    PATTERN_PULSE_TIMING,
    createPatternPulseConfig,
    type PatternPad,
} from './types'

function advanceToInput(game: PatternPulseGame): void {
    for (let i = 0; i < 1000 && game.getState().phase !== 'input'; i++) {
        vi.advanceTimersByTime(10)
    }
    expect(game.getState().phase).toBe('input')
}

function enterSequence(game: PatternPulseGame, sequence: PatternPad[]): void {
    for (const pad of sequence) {
        expect(game.pressPad(pad)).toBe(true)
    }
}

describe('PatternPulseGame', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-20T00:00:00Z'))
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('creates exactly three initial pads and rejects watch input', () => {
        const values = [0, 0.3, 0.6]
        const rng = vi.fn(() => values.shift() ?? 0)
        const game = new PatternPulseGame(createPatternPulseConfig({ rng }))

        expect(game.getState().sequence).toEqual([0, 1, 2])
        expect(rng).toHaveBeenCalledTimes(3)
        game.start()
        expect(game.getState().phase).toBe('watch')
        expect(game.pressPad(0)).toBe(false)
        advanceToInput(game)
    })

    it('scores a 500ms average response using Date.now under fake timers', () => {
        const values = [0, 0.3, 0.6, 0.9]
        const game = new PatternPulseGame(
            createPatternPulseConfig({
                rng: () => values.shift() ?? 0,
            })
        )

        game.start()
        advanceToInput(game)

        for (const pad of [0, 1, 2] as const) {
            vi.advanceTimersByTime(500)
            expect(game.pressPad(pad)).toBe(true)
        }

        expect(game.getState()).toMatchObject({
            completedRounds: 1,
            streak: 1,
            maxStreak: 1,
            longestSequence: 3,
            phase: 'feedback',
            feedback: 'correct',
            score: 400,
        })

        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
        expect(game.getState().sequence).toEqual([0, 1, 2, 3])
    })

    it('replays the same sequence and resets streak after a mistake', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )
        const before = [...game.getState().sequence]
        game.start()
        advanceToInput(game)

        expect(game.pressPad(1)).toBe(true)
        expect(game.getState()).toMatchObject({
            mistakes: 1,
            streak: 0,
            phase: 'feedback',
            feedback: 'wrong',
            activePad: 1,
            score: 0,
        })

        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
        expect(game.getState().sequence).toEqual(before)
    })

    it('ends after the mistake limit and reports a completed mistake outcome', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({
                initialSequenceLength: 1,
                rng: () => 0,
            })
        )
        game.start()
        advanceToInput(game)

        for (let attempt = 0; attempt < 3; attempt++) {
            expect(game.pressPad(1)).toBe(true)
            if (attempt < 2) {
                vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
                advanceToInput(game)
            }
        }

        expect(game.getState()).toMatchObject({
            isGameOver: true,
            outcome: 'mistakes',
        })
        expect(game.getGameStats()).toMatchObject({
            gameCompleted: true,
            outcome: 'mistakes',
        })
    })

    it('cancels queued playback when BaseGame times out', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({
                duration: 1,
                rng: () => 0,
            })
        )

        game.start()
        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
        expect(game.getState()).toMatchObject({ phase: 'watch', activePad: 0 })

        vi.advanceTimersByTime(650)
        expect(game.getState()).toMatchObject({
            phase: 'ended',
            outcome: 'timeout',
            activePad: null,
            score: 0,
            isGameOver: true,
        })
        expect(game.getGameStats().gameCompleted).toBe(true)
        expect(game.pressPad(0)).toBe(false)

        vi.advanceTimersByTime(5_000)
        expect(game.getState()).toMatchObject({
            phase: 'ended',
            outcome: 'timeout',
            activePad: null,
            score: 0,
        })
        expect(game.pressPad(0)).toBe(false)
    })

    it('resets to idle and cancels playback callbacks', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )

        game.start()
        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
        game.reset()

        expect(game.getState()).toMatchObject({
            phase: 'idle',
            outcome: 'playing',
            isActive: false,
            isGameOver: false,
            score: 0,
            inputIndex: 0,
            activePad: null,
            feedback: null,
            completedRounds: 0,
            mistakes: 0,
            streak: 0,
            maxStreak: 0,
            longestSequence: 0,
        })
        expect(game.getState().sequence).toEqual([0, 0, 0])

        vi.runAllTimers()
        expect(game.getState().phase).toBe('idle')
        expect(game.getState().activePad).toBeNull()
    })

    it('accepts duplicate pads as distinct sequence positions', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )

        game.start()
        advanceToInput(game)
        enterSequence(game, [0, 0, 0])

        expect(game.getState()).toMatchObject({
            sequence: [0, 0, 0],
            completedRounds: 1,
            mistakes: 0,
            streak: 1,
            maxStreak: 1,
            longestSequence: 3,
            score: 500,
        })
    })

    it('reports BaseGame-compatible stats and submitted game data', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )
        game.start()
        advanceToInput(game)
        enterSequence(game, [0, 0, 0])

        const getGameData = (
            game as unknown as {
                getGameData: () => Record<string, unknown>
            }
        ).getGameData.bind(game)

        expect(game.getGameStats()).toEqual({
            finalScore: 500,
            timeElapsed: 2,
            gameCompleted: false,
            outcome: 'playing',
            completedRounds: 1,
            longestSequence: 3,
            mistakes: 0,
            maxStreak: 1,
        })
        expect(getGameData()).toEqual({
            completedRounds: 1,
            longestSequence: 3,
            mistakes: 0,
            maxStreak: 1,
        })
    })
})
