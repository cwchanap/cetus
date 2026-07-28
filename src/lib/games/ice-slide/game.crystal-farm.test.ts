import { describe, expect, it } from 'vitest'

vi.mock('./levels', () => {
    const levels = [
        {
            id: 1,
            name: 'Crystal Corridor',
            parMoves: 3,
            rows: ['######', '#S.C.#', '#....#', '#...G#', '######'],
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

describe('IceSlideGame crystal farming guard', () => {
    it('does not farm crystals across collect → reset → recollect', () => {
        const game = new IceSlideGame()
        game.start()

        game.move('E')
        expect(game.getState().crystalsCollected).toBe(1)
        expect(game.getState().levelCrystalsCollected).toBe(1)

        game.resetLevel()
        expect(game.getState().levelCrystalsCollected).toBe(0)
        expect(game.getState().crystalsCollected).toBe(0)

        game.move('E')
        expect(game.getState().crystalsCollected).toBe(1)
        game.destroy()
    })
})
