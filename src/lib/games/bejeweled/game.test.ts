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
