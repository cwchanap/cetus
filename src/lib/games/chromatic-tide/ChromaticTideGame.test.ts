import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseGame } from '@/lib/games/core/BaseGame'
import { ChromaticTideGame } from './ChromaticTideGame'
import {
    createChromaticTideConfig,
    type ChromaticTideConfig,
    type ChromaticTideState,
} from './types'

class TestChromaticTideGame extends ChromaticTideGame {
    expireForTest(): void {
        this.handleTimeUp()
    }

    gameDataForTest(): Record<string, unknown> {
        return this.getGameData()
    }
}

function sequenceRng(samples: number[], fallback = 0.4): () => number {
    let index = 0
    return () => samples[index++] ?? fallback
}

function oneMoveClearRng(): () => number {
    return sequenceRng([...Array<number>(143).fill(0), 0.2])
}

function makeGame(
    overrides: Partial<ChromaticTideConfig> = {},
    onStateChange = vi.fn()
): { game: TestChromaticTideGame; onStateChange: ReturnType<typeof vi.fn> } {
    const game = new TestChromaticTideGame(
        createChromaticTideConfig({
            achievementIntegration: false,
            rng: oneMoveClearRng(),
            ...overrides,
        }),
        { onStateChange }
    )
    return { game, onStateChange }
}

describe('ChromaticTideGame', () => {
    const games = new Set<TestChromaticTideGame>()

    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
    })

    afterEach(() => {
        for (const game of games) {
            game.destroy()
        }
        games.clear()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    function track(
        result: ReturnType<typeof makeGame>
    ): ReturnType<typeof makeGame> {
        games.add(result.game)
        return result
    }

    it('provides the BaseGame model', () => {
        const { game } = track(makeGame())

        expect(game).toBeInstanceOf(BaseGame)
    })

    it('starts idle with the generated territory count and zero score', () => {
        const { game } = track(makeGame())

        expect(game.getState()).toMatchObject({
            score: 0,
            timeRemaining: 90,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            territoryColor: 'teal',
            movesUsed: 0,
            capturedCells: 143,
            initialCapturedCells: 143,
        })
    })

    it('rejects inactive, current, invalid, paused, and non-playing actions', () => {
        const { game, onStateChange } = track(makeGame())

        expect(game.chooseColor('amber')).toBe(false)
        game.start()
        expect(game.chooseColor('teal')).toBe(false)
        expect(
            game.chooseColor(
                'ultraviolet' as unknown as Parameters<
                    ChromaticTideGame['chooseColor']
                >[0]
            )
        ).toBe(false)

        const internal = game as unknown as { state: ChromaticTideState }
        internal.state.isPaused = true
        expect(game.chooseColor('amber')).toBe(false)
        internal.state.isPaused = false
        internal.state.outcome = 'timeout'
        expect(game.chooseColor('amber')).toBe(false)

        expect(game.getState()).toMatchObject({
            score: 0,
            movesUsed: 0,
            capturedCells: 143,
        })
        expect(onStateChange).not.toHaveBeenCalled()
    })

    it('accepts an absent non-current color as a zero-gain move', () => {
        const { game, onStateChange } = track(makeGame())
        game.start()

        expect(game.chooseColor('green')).toBe(true)

        expect(game.getState()).toMatchObject({
            territoryColor: 'green',
            movesUsed: 1,
            capturedCells: 143,
            score: 0,
            outcome: 'playing',
        })
        expect(onStateChange).toHaveBeenCalledTimes(1)
    })

    it('clears the 143 teal plus one amber board exactly once', async () => {
        const { game, onStateChange } = track(makeGame())
        const end = vi.spyOn(game, 'end')
        game.start()

        expect(game.chooseColor('amber')).toBe(true)
        await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1))

        expect(game.getState()).toMatchObject({
            outcome: 'cleared',
            capturedCells: 144,
            movesUsed: 1,
            score: 2645,
            isActive: false,
            isGameOver: true,
        })
        expect(
            game
                .getScoreManager()
                .getScoreHistory()
                .filter(entry => entry.reason === 'chromatic_tide_progress')
        ).toHaveLength(1)
        expect(onStateChange).toHaveBeenCalledTimes(1)

        expect(game.chooseColor('teal')).toBe(false)
        expect(end).toHaveBeenCalledTimes(1)
        expect(game.getState().score).toBe(2645)
    })

    it('reset consumes a fresh board and restores idle run state', () => {
        const rng = vi.fn(
            sequenceRng([
                ...Array<number>(143).fill(0),
                0.2,
                ...Array<number>(143).fill(0.4),
                0.6,
            ])
        )
        const { game } = track(makeGame({ rng }))
        const firstBoard = game.getState().board
        game.start()
        expect(game.chooseColor('green')).toBe(true)

        game.reset()

        expect(rng).toHaveBeenCalledTimes(288)
        expect(game.getState()).toMatchObject({
            score: 0,
            timeRemaining: 90,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            outcome: 'playing',
            territoryColor: 'magenta',
            movesUsed: 0,
            capturedCells: 143,
            initialCapturedCells: 143,
        })
        expect(game.getState().board).not.toBe(firstBoard)
        expect(game.getState().board).not.toEqual(firstBoard)
    })

    it('timeout keeps partial score and delegates through BaseGame end', async () => {
        const rng = sequenceRng([0, 0.2, ...Array<number>(142).fill(0.4)])
        const { game, onStateChange } = track(makeGame({ rng }))
        const end = vi.spyOn(game, 'end')
        game.start()
        expect(game.chooseColor('amber')).toBe(true)
        expect(game.getState()).toMatchObject({
            capturedCells: 2,
            score: 10,
        })
        onStateChange.mockClear()
        await vi.advanceTimersByTimeAsync(5000)

        game.expireForTest()
        await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1))

        expect(game.getState()).toMatchObject({
            outcome: 'timeout',
            capturedCells: 2,
            score: 10,
            isActive: false,
            isGameOver: true,
        })
        expect(onStateChange).toHaveBeenCalledTimes(1)
    })

    it('reports overlay stats and canonical achievement data', async () => {
        const { game } = track(makeGame())
        game.start()
        await vi.advanceTimersByTimeAsync(4000)
        expect(game.chooseColor('green')).toBe(true)

        expect(game.getGameStats()).toEqual({
            finalScore: 0,
            timeElapsed: 4,
            gameCompleted: false,
            outcome: 'playing',
            movesUsed: 1,
            capturedCells: 143,
            initialCapturedCells: 143,
            secondsRemaining: 86,
        })
        expect(game.gameDataForTest()).toEqual({
            cleared: false,
            movesUsed: 1,
            capturedCells: 143,
            initialCapturedCells: 143,
            secondsRemaining: 86,
        })
    })
})
