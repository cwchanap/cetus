import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MineGridGame, createMineGridConfig } from './MineGridGame'
import type { MineGridConfig } from './types'

const zeroRng = () => 0
const tinyConfig: MineGridConfig = {
    ...createMineGridConfig('easy', zeroRng),
    duration: 10,
    preset: {
        difficulty: 'easy',
        rows: 2,
        cols: 2,
        mines: 1,
        duration: 10,
    },
}

const makeGame = (): MineGridGame =>
    new MineGridGame({
        ...tinyConfig,
        preset: { ...tinyConfig.preset },
    })

const clearTinyGame = (game: MineGridGame, flagMine: boolean = false): void => {
    game.start()
    expect(game.revealCell(1, 1)).toBe(true)
    if (flagMine) {
        expect(game.toggleFlag(0, 1)).toBe(true)
    }
    expect(game.revealCell(0, 0)).toBe(true)
    expect(game.revealCell(1, 0)).toBe(true)
}

describe('MineGridGame', () => {
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

    it('creates a hidden board with timeRemaining equal to config.duration', () => {
        const game = makeGame()
        const state = game.getState()

        expect(state.timeRemaining).toBe(tinyConfig.duration)
        expect(state.board).toHaveLength(2)
        expect(state.board[0]).toHaveLength(2)
        expect(state.minesPlaced).toBe(false)
        expect(
            state.board.flat().every(cell => !cell.hasMine && !cell.revealed)
        ).toBe(true)
    })

    it('guarantees the first accepted reveal is safe', () => {
        const game = makeGame()
        game.start()

        expect(game.revealCell(1, 1)).toBe(true)
        expect(game.getState().minesPlaced).toBe(true)
        expect(game.getState().board[1][1].hasMine).toBe(false)
        expect(game.getState().board[1][1].revealed).toBe(true)
    })

    it('counts pre-reveal safe flags as incorrect after lazy placement', () => {
        const game = makeGame()
        game.start()

        expect(game.toggleFlag(0, 0)).toBe(true)
        expect(game.revealCell(1, 1)).toBe(true)

        expect(game.getState().incorrectFlagActions).toBe(1)
    })

    it('increments incorrectFlagActions again when the same safe cell is wrongly re-flagged', () => {
        const game = makeGame()
        game.start()

        game.toggleFlag(0, 0)
        game.revealCell(1, 1)
        expect(game.toggleFlag(0, 0)).toBe(true)
        expect(game.toggleFlag(0, 0)).toBe(true)

        expect(game.getState().incorrectFlagActions).toBe(2)
        expect(game.getState().flagsPlaced).toBe(1)
    })

    it('awards more score when mines are correctly flagged before clear', () => {
        const withoutFlag = makeGame()
        clearTinyGame(withoutFlag)
        const scoreWithoutFlag = withoutFlag.getScoreManager().getScore()

        const withFlag = makeGame()
        clearTinyGame(withFlag, true)
        const scoreWithFlag = withFlag.getScoreManager().getScore()

        expect(scoreWithFlag).toBeGreaterThan(scoreWithoutFlag)
    })

    it('ends with result mine and score zero when a mine is revealed', () => {
        const game = makeGame()
        game.start()
        game.revealCell(1, 1)

        expect(game.revealCell(0, 1)).toBe(true)
        expect(game.getState().result).toBe('mine')
        expect(game.getState().isGameOver).toBe(true)
        expect(game.getScoreManager().getScore()).toBe(0)
    })

    it('ends with result timeout and score zero when the timer expires', async () => {
        vi.useFakeTimers()
        const game = makeGame()
        game.start()

        await vi.advanceTimersByTimeAsync(tinyConfig.duration * 1000)
        await Promise.resolve()

        expect(game.getState().result).toBe('timeout')
        expect(game.getState().isGameOver).toBe(true)
        expect(game.getScoreManager().getScore()).toBe(0)
    })

    it('awards the clear score exactly once', () => {
        const game = makeGame()
        clearTinyGame(game)

        expect(game.getState().result).toBe('cleared')
        expect(game.getScoreManager().getScore()).toBe(80)
        expect(
            game
                .getScoreManager()
                .getScoreHistory()
                .filter(entry => entry.reason === 'grid_clear')
        ).toHaveLength(1)
        expect(game.revealCell(0, 0)).toBe(false)
        expect(game.getScoreManager().getScore()).toBe(80)
    })

    it('returns final elapsedSeconds from the shared BaseGame timer snapshot', async () => {
        vi.useFakeTimers()
        const game = makeGame()
        game.start()

        await vi.advanceTimersByTimeAsync(4000)
        await game.end()

        const data = (
            game as unknown as {
                getGameData: () => {
                    elapsedSeconds: number
                }
            }
        ).getGameData()

        expect(data.elapsedSeconds).toBe(4)
        expect(game.getGameStats().timeElapsed).toBe(4)
    })

    it('changes idle difficulty in place and updates board dimensions plus timer duration', () => {
        const game = makeGame()

        expect(game.newGame('hard')).toBe(true)
        expect(game.getState().difficulty).toBe('hard')
        expect(game.getState().board).toHaveLength(12)
        expect(game.getState().board[0]).toHaveLength(12)
        expect(game.getState().timeRemaining).toBe(600)
        expect(game.getTimerStatus().currentTime).toBe(600)
    })

    it('rejects difficulty changes while active', () => {
        const game = makeGame()
        game.start()

        expect(game.newGame('hard')).toBe(false)
        expect(game.getState().difficulty).toBe('easy')
        expect(game.getState().board).toHaveLength(2)
        expect(game.getState().timeRemaining).toBe(10)
    })

    it('reset returns to a fresh board with minesPlaced false', () => {
        const game = makeGame()
        game.start()
        game.revealCell(1, 1)

        expect(game.getState().minesPlaced).toBe(true)
        game.reset()

        const state = game.getState()
        expect(state.minesPlaced).toBe(false)
        expect(state.result).toBe('playing')
        expect(state.isActive).toBe(false)
        expect(
            state.board
                .flat()
                .every(cell => !cell.hasMine && !cell.revealed && !cell.flagged)
        ).toBe(true)
    })
})
