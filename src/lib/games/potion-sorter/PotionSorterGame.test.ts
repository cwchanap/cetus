import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PotionSorterGame, createPotionSorterConfig } from './PotionSorterGame'
import { POTION_SORTER_PRESETS } from './levels'
import { calculatePotionSorterScore } from './scoring'
import type { PotionSorterGameData } from './types'

const EASY_SOLUTION: Array<[number, number]> = [
    [0, 3],
    [2, 0],
    [1, 2],
    [1, 3],
    [0, 1],
    [2, 0],
    [2, 3],
    [1, 2],
    [0, 1],
    [0, 3],
]

const makeGame = (): PotionSorterGame =>
    new PotionSorterGame(createPotionSorterConfig('easy'))

const getGameData = (game: PotionSorterGame): PotionSorterGameData =>
    (
        game as unknown as {
            getGameData: () => PotionSorterGameData
        }
    ).getGameData()

const pour = (game: PotionSorterGame, source: number, destination: number) => {
    expect(game.activateTube(source)).toBe('selected')
    expect(game.activateTube(destination)).toBe('poured')
}

const replaySolution = (game: PotionSorterGame): void => {
    for (const [source, destination] of EASY_SOLUTION) {
        pour(game, source, destination)
    }
}

const submittedPayloads = (): Array<{
    gameId: string
    score: number
    gameData: PotionSorterGameData
}> =>
    vi
        .mocked(fetch)
        .mock.calls.map(([, init]) => JSON.parse(String(init?.body))) as Array<{
        gameId: string
        score: number
        gameData: PotionSorterGameData
    }>

describe('PotionSorterGame', () => {
    beforeEach(() => {
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

    it('defaults to the Medium preset with a 300 second duration', () => {
        const config = createPotionSorterConfig()
        const game = new PotionSorterGame()

        expect(config.preset.difficulty).toBe('medium')
        expect(config.duration).toBe(300)
        expect(game.getState().difficulty).toBe('medium')
        expect(game.getState().timeRemaining).toBe(300)
    })

    it('clones the preset tubes instead of sharing the exported arrays', () => {
        const game = makeGame()
        const state = game.getState()

        expect(state.tubes).toEqual(POTION_SORTER_PRESETS.easy.initialTubes)
        expect(state.tubes).not.toBe(POTION_SORTER_PRESETS.easy.initialTubes)
        expect(state.tubes[0]).not.toBe(
            POTION_SORTER_PRESETS.easy.initialTubes[0]
        )
    })

    it('rejects tube actions before Start and accepts them while active', () => {
        const game = makeGame()

        expect(game.activateTube(0)).toBe('invalid')
        game.start()
        expect(game.activateTube(0)).toBe('selected')
        expect(game.getState().selectedTubeIndex).toBe(0)
    })

    it('selects non-empty tubes, deselects the selected tube, and rejects empty tubes', () => {
        const game = makeGame()
        game.start()

        expect(game.activateTube(0)).toBe('selected')
        expect(game.getState().selectedTubeIndex).toBe(0)

        expect(game.activateTube(0)).toBe('deselected')
        expect(game.getState().selectedTubeIndex).toBe(null)

        expect(game.activateTube(3)).toBe('invalid')
        expect(game.getState().selectedTubeIndex).toBe(null)
    })

    it('keeps the source selected on an invalid destination without moves or history', () => {
        const game = makeGame()
        game.start()

        expect(game.activateTube(0)).toBe('selected')
        expect(game.activateTube(1)).toBe('invalid')

        const state = game.getState()
        expect(state.selectedTubeIndex).toBe(0)
        expect(state.movesMade).toBe(0)
        expect(game.canUndo()).toBe(false)
    })

    it('clears selection, increments moves, and enables Undo on a legal pour', () => {
        const game = makeGame()
        game.start()

        pour(game, 0, 3)

        const state = game.getState()
        expect(state.selectedTubeIndex).toBe(null)
        expect(state.movesMade).toBe(1)
        expect(game.canUndo()).toBe(true)
    })

    it('Undo restores the exact pre-pour tubes and never changes moves', () => {
        const game = makeGame()
        game.start()
        pour(game, 0, 3)

        expect(game.undo()).toBe(true)

        const state = game.getState()
        expect(state.tubes).toEqual(
            POTION_SORTER_PRESETS.easy.initialTubes.map(tube => [...tube])
        )
        expect(state.undosUsed).toBe(1)
        expect(state.movesMade).toBe(1)
        expect(state.selectedTubeIndex).toBe(null)
    })

    it('allows the same pour again after Undo, yielding movesMade 2', () => {
        const game = makeGame()
        game.start()

        pour(game, 0, 3)
        expect(game.undo()).toBe(true)
        pour(game, 0, 3)

        const state = game.getState()
        expect(state.movesMade).toBe(2)
        expect(state.undosUsed).toBe(1)
        expect(game.canUndo()).toBe(true)
    })

    it('changes difficulty while idle and rejects it while active', () => {
        const game = makeGame()

        expect(game.newGame('hard')).toBe(true)
        expect(game.getState().difficulty).toBe('hard')
        expect(game.getState().timeRemaining).toBe(480)
        expect(game.getTimerStatus().currentTime).toBe(480)

        game.start()
        expect(game.newGame('hard')).toBe(false)
        expect(game.getState().difficulty).toBe('hard')
        expect(game.getState().timeRemaining).toBe(480)
    })

    it('solves the Easy path and awards exactly one puzzle_solved entry', () => {
        vi.useFakeTimers()
        const game = makeGame()
        game.start()

        replaySolution(game)

        const state = game.getState()
        expect(state.result).toBe('solved')
        expect(state.isGameOver).toBe(true)
        expect(state.movesMade).toBe(10)
        expect(game.getScoreManager().getScore()).toBe(
            calculatePotionSorterScore(
                POTION_SORTER_PRESETS.easy,
                180,
                10,
                true
            )
        )
        expect(
            game
                .getScoreManager()
                .getScoreHistory()
                .filter(entry => entry.reason === 'puzzle_solved')
        ).toHaveLength(1)
    })

    it('times out with score 0 and rejects all later actions', async () => {
        vi.useFakeTimers()
        const game = makeGame()
        game.start()

        await vi.advanceTimersByTimeAsync(180_000)
        await Promise.resolve()

        const state = game.getState()
        expect(state.result).toBe('timeout')
        expect(state.isGameOver).toBe(true)
        expect(state.selectedTubeIndex).toBe(null)
        expect(game.getScoreManager().getScore()).toBe(0)
        expect(game.activateTube(0)).toBe('invalid')
        expect(game.undo()).toBe(false)
    })

    it('uses the shared BaseGame final timer snapshot for elapsed time', async () => {
        vi.useFakeTimers()
        const game = makeGame()
        game.start()

        await vi.advanceTimersByTimeAsync(4000)
        await game.end()

        expect(getGameData(game).elapsedSeconds).toBe(4)
        expect(game.getGameStats().timeElapsed).toBe(4)
    })

    it('submits the exact solve payload', async () => {
        vi.useFakeTimers()
        const game = makeGame()
        game.start()

        replaySolution(game)
        await Promise.resolve()

        expect(submittedPayloads()).toEqual([
            {
                gameId: 'potion_sorter',
                score: calculatePotionSorterScore(
                    POTION_SORTER_PRESETS.easy,
                    180,
                    10,
                    true
                ),
                gameData: {
                    difficulty: 'easy',
                    solved: true,
                    movesMade: 10,
                    undosUsed: 0,
                    elapsedSeconds: 0,
                },
            },
        ])
        expect(getGameData(game)).toEqual({
            difficulty: 'easy',
            solved: true,
            movesMade: 10,
            undosUsed: 0,
            elapsedSeconds: 0,
        })
    })

    it('submits the exact timeout payload', async () => {
        vi.useFakeTimers()
        const game = makeGame()
        game.start()

        await vi.advanceTimersByTimeAsync(180_000)
        await Promise.resolve()

        expect(submittedPayloads()).toEqual([
            {
                gameId: 'potion_sorter',
                score: 0,
                gameData: {
                    difficulty: 'easy',
                    solved: false,
                    movesMade: 0,
                    undosUsed: 0,
                    elapsedSeconds: 180,
                },
            },
        ])
        expect(getGameData(game)).toEqual({
            difficulty: 'easy',
            solved: false,
            movesMade: 0,
            undosUsed: 0,
            elapsedSeconds: 180,
        })
    })

    it('Start, pour, Undo, Reset leaves the exported Easy literal unchanged', () => {
        const easySnapshot = POTION_SORTER_PRESETS.easy.initialTubes.map(
            tube => [...tube]
        )
        const game = makeGame()

        game.start()
        pour(game, 0, 3)
        game.undo()
        game.reset()

        expect(POTION_SORTER_PRESETS.easy.initialTubes).toEqual(easySnapshot)
        const state = game.getState()
        expect(state.movesMade).toBe(0)
        expect(state.undosUsed).toBe(0)
        expect(state.result).toBe('playing')
        expect(state.tubes).not.toBe(easySnapshot)
    })
})
