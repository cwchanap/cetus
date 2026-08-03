import { describe, expect, it, vi } from 'vitest'
import { IceSlideGame } from './game'
import { createTestRun, createTestStage } from './test-fixtures'

describe('IceSlideGame win + crystal branch (explicit run)', () => {
    it('collects crystals and wins the single-level mission', () => {
        const onCrystal = vi.fn()
        const onWin = vi.fn()
        const onLevelClear = vi.fn()
        const run = createTestRun([
            createTestStage({
                name: 'Crystal Dash',
                rows: ['######', '#SC.G#', '######'],
                parMoves: 1,
            }),
        ])
        const game = new IceSlideGame({ onCrystal, onWin, onLevelClear })
        game.start(run)

        game.move('E')
        expect(onCrystal).toHaveBeenCalledWith(1)
        expect(onLevelClear).toHaveBeenCalledWith(1)
        expect(onWin).toHaveBeenCalled()
        expect(game.getState().status).toBe('won')
        expect(game.getGameData()).toMatchObject({
            solved: true,
            levelsCleared: 1,
            crystalsCollected: 1,
            perfectLevels: 1,
        })
        expect(game.getState().score).toBeGreaterThan(0)
        game.destroy()
    })
})
