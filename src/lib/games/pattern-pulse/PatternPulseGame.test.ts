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

    it('exposes no-op update and render methods', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )
        expect(() => game.update(0.016)).not.toThrow()
        expect(() => game.render()).not.toThrow()
        const config = game.getConfig()
        expect(config.duration).toBe(60)
        expect(config.initialSequenceLength).toBe(3)
        expect(config.mistakeLimit).toBe(3)
    })

    it('logs an error when end() rejects during the mistake-limit path', async () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({
                initialSequenceLength: 1,
                rng: () => 0,
            })
        )
        game.on('end', () => {
            throw new Error('end listener error')
        })
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})

        game.start()
        advanceToInput(game)

        for (let attempt = 0; attempt < 3; attempt++) {
            game.pressPad(1)
            if (attempt < 2) {
                vi.advanceTimersByTime(PATTERN_PULSE_TIMING.feedbackMs)
                advanceToInput(game)
            }
        }

        // Flush microtasks for the async end() to reject and .catch to fire
        for (let i = 0; i < 10; i++) {
            await Promise.resolve()
        }

        expect(consoleError).toHaveBeenCalledWith(
            'PatternPulseGame end failed (mistakes)',
            expect.any(Error)
        )
        consoleError.mockRestore()
    })

    it('no-ops playNextCue when it fires after the game ends', async () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )
        game.start()
        // playNextCue is scheduled after prePlaybackDelayMs; end before it fires
        await game.end()
        expect(game.getState().isGameOver).toBe(true)
        expect(game.getState().activePad).toBeNull()

        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
        // playNextCue guard returns without setting activePad
        expect(game.getState().isGameOver).toBe(true)
        expect(game.getState().activePad).toBeNull()
    })

    it('no-ops scheduled pad-clear callback that fires after the game ends', async () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )
        game.start()
        // Advance to first cue active (pad lit, clear callback scheduled)
        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
        expect(game.getState().activePad).toBe(0)

        // End while the pulseMs clear callback is pending
        await game.end()
        expect(game.getState().isGameOver).toBe(true)

        // The pulseMs callback fires and should no-op (activePad stays lit)
        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.initialPulseMs)
        expect(game.getState().isGameOver).toBe(true)
        expect(game.getState().activePad).toBe(0)
    })

    it('no-ops scheduled pulse-gap callback that fires after the game ends', async () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )
        game.start()
        // Advance past prePlaybackDelayMs and pulseMs so the pulseGapMs
        // callback is the only pending timeout
        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.initialPulseMs)
        expect(game.getState().activePad).toBeNull()

        // End while the pulseGapMs callback is pending
        await game.end()
        expect(game.getState().isGameOver).toBe(true)

        // The pulseGapMs callback fires and should no-op
        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.pulseGapMs)
        expect(game.getState().isGameOver).toBe(true)
        expect(game.getState().activePad).toBeNull()
    })

    it('beginInput is a no-op when the game is not active', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )
        const beginInput = (
            game as unknown as { beginInput: () => void }
        ).beginInput.bind(game)
        // Game is idle; beginInput should return without changing phase
        beginInput()
        expect(game.getState().phase).toBe('idle')
    })

    it('forwards state changes via the onStateChange callback', () => {
        const onStateChange = vi.fn()
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 }),
            { onStateChange }
        )
        game.start()
        expect(onStateChange).toHaveBeenCalled()
        expect(onStateChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ phase: 'watch' })
        )
    })

    it('cleanup clears scheduled timeouts without error', () => {
        const game = new PatternPulseGame(
            createPatternPulseConfig({ rng: () => 0 })
        )
        game.start()
        // Schedule a timeout via normal gameplay
        vi.advanceTimersByTime(PATTERN_PULSE_TIMING.prePlaybackDelayMs)
        // cleanup should clear the pending timeout
        expect(() => game.cleanup()).not.toThrow()
    })
})
