import { describe, expect, it, vi } from 'vitest'

vi.mock('./levels', () => {
    const levels = [
        {
            id: 1,
            name: 'Crystal Dash',
            parMoves: 1,
            rows: ['######', '#SC.G#', '######'],
        },
    ]
    return {
        ICE_SLIDE_LEVELS: levels,
        getLevel: (index: number) => {
            const level = levels[index]
            if (!level) {
                throw new Error(`Ice Slide level index out of range: ${index}`)
            }
            return level
        },
    }
})

import { IceSlideGame } from './game'

describe('IceSlideGame win + crystal branch (mocked levels)', () => {
    it('collects crystals and wins the single-level mission', () => {
        const onCrystal = vi.fn()
        const onWin = vi.fn()
        const onLevelClear = vi.fn()
        const game = new IceSlideGame({ onCrystal, onWin, onLevelClear })
        game.start()

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
