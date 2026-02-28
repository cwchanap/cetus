import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BejeweledGame } from './game'
import { GameID } from '@/lib/games'
import type { BejeweledAnimator, JewelType, Position } from './types'
import * as utils from './utils'

class TestAnimator implements BejeweledAnimator {
    animateSwap = vi.fn(async () => {})
    animateSwapBack = vi.fn(async () => {})
    animateClear = vi.fn(async () => {})
}

function createConfig(
    overrides: Partial<{
        rows: number
        cols: number
        jewelTypes: JewelType[]
        minMatch: number
        pointsPerJewel: number
        duration: number
        achievementIntegration: boolean
        pausable: boolean
        resettable: boolean
    }> = {}
) {
    return {
        rows: 6,
        cols: 6,
        jewelTypes: [
            'red',
            'blue',
            'green',
            'yellow',
            'purple',
            'cyan',
        ] as JewelType[],
        minMatch: 3,
        pointsPerJewel: 10,
        duration: 60,
        achievementIntegration: false,
        pausable: true,
        resettable: true,
        ...overrides,
    }
}

function flushMicrotasks() {
    return Promise.resolve().then(() => {})
}

describe('BejeweledGame special achievements logic', () => {
    let game: BejeweledGame
    let animator: TestAnimator

    beforeEach(() => {
        animator = new TestAnimator()
        game = new BejeweledGame(GameID.BEJEWELED, createConfig(), {})
        game.setAnimator(animator)
        game.start()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        game.destroy()
    })

    it('detects clearing 5 gems in a straight line (horizontal)', async () => {
        // Create a deterministic sequence: valid move prediction, then one cascade with 5-in-a-row, then stop
        const fiveRun: Position[] = [
            { row: 2, col: 0 },
            { row: 2, col: 1 },
            { row: 2, col: 2 },
            { row: 2, col: 3 },
            { row: 2, col: 4 },
        ]
        const spy = vi
            .spyOn(utils, 'findMatches')
            // wouldMatches (pre-swap prediction)
            .mockReturnValueOnce([{ type: 'red', positions: fiveRun } as any])
            // initial cascade with a horizontal straight 5
            .mockReturnValueOnce([{ type: 'red', positions: fiveRun } as any])
            // after refill -> no further matches
            .mockReturnValue([])

        // Perform any adjacent swap to pass adjacency checks
        game.clickCell(2, 3)
        game.clickCell(2, 4)

        await flushMicrotasks()
        await flushMicrotasks()

        const stats = game.getGameStats()
        expect(stats.largestMatch).toBeGreaterThanOrEqual(5)
        const gameData = (game as any).getGameData()
        expect(gameData.straightFive).toBe(true)

        spy.mockRestore()
    })

    it('counts consecutive cascades towards maxCombo (>= 3)', async () => {
        // Spy on findMatches to simulate three consecutive elimination rounds
        const match: Position[] = [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
        ]
        const fake = vi
            .spyOn(utils, 'findMatches')
            // wouldMatches (pre-swap prediction)
            .mockReturnValueOnce([{ type: 'red', positions: match } as any])
            // cascade 1
            .mockReturnValueOnce([{ type: 'red', positions: match } as any])
            // cascade 2
            .mockReturnValueOnce([{ type: 'red', positions: match } as any])
            // cascade 3
            .mockReturnValueOnce([{ type: 'red', positions: match } as any])
            // then no more matches
            .mockReturnValue([])

        // Provide a simple adjacent swap on a neutral grid
        const T: JewelType = 'green'
        const grid: (JewelType | null)[][] = Array.from({ length: 6 }, () =>
            Array<JewelType | null>(6).fill(T)
        )
        // Make two adjacent cells different so swap is valid path-wise
        grid[1][1] = 'red'
        grid[1][2] = 'blue'
        ;(game as any).state.grid = grid

        // Act: perform adjacent swap to trigger attemptSwap flow
        game.clickCell(1, 1)
        game.clickCell(1, 2)

        await flushMicrotasks()
        await flushMicrotasks()

        const stats = game.getGameStats()
        expect(stats.maxCombo).toBeGreaterThanOrEqual(3)

        // Cleanup spy
        fake.mockRestore()
    })
})

describe('BejeweledGame cell selection and state', () => {
    let game: BejeweledGame

    beforeEach(() => {
        game = new BejeweledGame(GameID.BEJEWELED, createConfig(), {})
        game.start()
    })

    afterEach(() => {
        game.destroy()
    })

    it('should select a cell on first click', () => {
        game.clickCell(0, 0)
        expect(game.getState().selected).toEqual({ row: 0, col: 0 })
    })

    it('should deselect when clicking the same cell twice', () => {
        game.clickCell(1, 1)
        game.clickCell(1, 1)
        expect(game.getState().selected).toBeNull()
    })

    it('should change selection to non-adjacent cell', () => {
        game.clickCell(0, 0)
        game.clickCell(4, 4) // not adjacent
        expect(game.getState().selected).toEqual({ row: 4, col: 4 })
    })

    it('should not respond to clicks when game is paused', () => {
        game.pause()
        game.clickCell(0, 0)
        expect(game.getState().selected).toBeNull()
    })

    it('should not respond to clicks when game is not active', () => {
        const inactiveGame = new BejeweledGame(
            GameID.BEJEWELED,
            createConfig(),
            {}
        )
        // Don't start the game
        inactiveGame.clickCell(0, 0)
        expect(inactiveGame.getState().selected).toBeNull()
        inactiveGame.destroy()
    })

    it('update and render are no-ops', () => {
        expect(() => (game as any).update(0.016)).not.toThrow()
        expect(() => (game as any).render()).not.toThrow()
    })

    it('should emit state-change events on selection', () => {
        const onStateChange = vi.fn()
        const gameWithCb = new BejeweledGame(GameID.BEJEWELED, createConfig(), {
            onStateChange,
        })
        gameWithCb.start()
        gameWithCb.clickCell(0, 0)
        expect(onStateChange).toHaveBeenCalled()
        gameWithCb.destroy()
    })

    it('should reset with onGameReset', () => {
        game.clickCell(1, 1)
        game.reset()
        expect(game.getState().selected).toBeNull()
        expect(game.getState().combo).toBe(0)
        expect(game.getState().movesMade).toBe(0)
    })

    it('should return getGameStats with expected fields', () => {
        const stats = game.getGameStats()
        expect(stats).toHaveProperty('finalScore')
        expect(stats).toHaveProperty('movesMade')
        expect(stats).toHaveProperty('maxCombo')
        expect(stats).toHaveProperty('largestMatch')
        expect(stats).toHaveProperty('totalMatches')
    })
})

describe('BejeweledGame isStraightRunAtLeast coverage', () => {
    let game: BejeweledGame

    beforeEach(() => {
        game = new BejeweledGame(GameID.BEJEWELED, createConfig(), {})
        game.start()
    })

    afterEach(() => {
        game.destroy()
    })

    it('should detect vertical straight run of 5', async () => {
        const vertRun: Position[] = [
            { row: 0, col: 2 },
            { row: 1, col: 2 },
            { row: 2, col: 2 },
            { row: 3, col: 2 },
            { row: 4, col: 2 },
        ]
        const spy = vi
            .spyOn(utils, 'findMatches')
            .mockReturnValueOnce([{ type: 'red', positions: vertRun } as any])
            .mockReturnValueOnce([{ type: 'red', positions: vertRun } as any])
            .mockReturnValue([])

        game.clickCell(0, 2)
        game.clickCell(0, 3)
        await flushMicrotasks()
        await flushMicrotasks()

        const gameData = (game as any).getGameData()
        expect(gameData.straightFive).toBe(true)
        spy.mockRestore()
    })

    it('should not detect straight five for scattered positions', async () => {
        const scattered: Position[] = [
            { row: 0, col: 0 },
            { row: 2, col: 2 },
            { row: 4, col: 4 },
            { row: 1, col: 3 },
            { row: 3, col: 1 },
        ]
        const spy = vi
            .spyOn(utils, 'findMatches')
            .mockReturnValueOnce([{ type: 'red', positions: scattered } as any])
            .mockReturnValueOnce([{ type: 'red', positions: scattered } as any])
            .mockReturnValue([])

        game.clickCell(0, 0)
        game.clickCell(0, 1)
        await flushMicrotasks()
        await flushMicrotasks()

        const gameData = (game as any).getGameData()
        expect(gameData.straightFive).toBe(false)
        spy.mockRestore()
    })

    it('should not detect straight five for same-row-non-consecutive and same-col-non-consecutive positions', async () => {
        // Positions with same row (non-consecutive cols) and same col (non-consecutive rows)
        // triggers the else { run = 1 } branches in isStraightRunAtLeast
        const gapped: Position[] = [
            { row: 0, col: 0 },
            { row: 0, col: 2 }, // same row, gap at col 1
            { row: 0, col: 4 }, // same row, gap at col 3
            { row: 2, col: 0 }, // same col, gap at row 1
            { row: 4, col: 0 }, // same col, gap at row 3
        ]
        const spy = vi
            .spyOn(utils, 'findMatches')
            .mockReturnValueOnce([{ type: 'red', positions: gapped } as any])
            .mockReturnValueOnce([{ type: 'red', positions: gapped } as any])
            .mockReturnValue([])

        game.clickCell(0, 0)
        game.clickCell(0, 1)
        await flushMicrotasks()
        await flushMicrotasks()

        const gameData = (game as any).getGameData()
        expect(gameData.straightFive).toBe(false)
        spy.mockRestore()
    })
})

describe('BejeweledGame attemptSwap guard paths', () => {
    let game: BejeweledGame
    let animator: TestAnimator

    beforeEach(() => {
        animator = new TestAnimator()
        game = new BejeweledGame(GameID.BEJEWELED, createConfig(), {})
        game.setAnimator(animator)
        game.start()
    })

    afterEach(() => {
        game.destroy()
    })

    it('should skip attemptSwap when isAnimating is true', async () => {
        // Set isAnimating=true to trigger the early-return guard (lines 174-176)
        ;(game as any).state.isAnimating = true
        game.clickCell(0, 0)
        game.clickCell(0, 1)
        await flushMicrotasks()
        expect(animator.animateSwap).not.toHaveBeenCalled()
    })

    it('should animate swap back on invalid move (no matches)', async () => {
        // Mock findMatches to return empty so wouldMatches.length === 0 (lines 191-198)
        const spy = vi.spyOn(utils, 'findMatches').mockReturnValue([])
        game.clickCell(0, 0)
        game.clickCell(0, 1)
        await flushMicrotasks()
        await flushMicrotasks()
        expect(animator.animateSwap).toHaveBeenCalled()
        expect(animator.animateSwapBack).toHaveBeenCalled()
        spy.mockRestore()
    })
})
