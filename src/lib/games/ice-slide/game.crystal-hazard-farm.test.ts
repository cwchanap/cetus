import { describe, expect, it, vi } from 'vitest'

vi.mock('./levels', () => {
    const levels = [
        {
            id: 1,
            name: 'Crystal Hazard',
            parMoves: 2,
            rows: ['######', '#S.C.#', '#...H#', '######'],
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

describe('IceSlideGame crystal farming via hazard', () => {
    it('subtracts attempt crystals after falling in a hole', () => {
        const onHazard = vi.fn()
        const game = new IceSlideGame({ onHazard })
        game.start()

        game.move('E') // collect crystal, stop at (1,4)
        expect(game.getState().crystalsCollected).toBe(1)

        game.move('S') // into hazard at (2,4)
        expect(onHazard).toHaveBeenCalled()
        expect(game.getState().crystalsCollected).toBe(0)
        expect(game.getState().levelCrystalsCollected).toBe(0)
        expect(game.getState().player).toEqual(game.getState().start)
        expect(game.getState().levelMoves).toBe(2)
        expect(game.getState().moves).toBe(2)

        game.move('E')
        expect(game.getState().crystalsCollected).toBe(1)
        expect(game.getState().levelMoves).toBe(3)
        game.destroy()
    })
})
