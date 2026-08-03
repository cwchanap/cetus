import { describe, expect, it } from 'vitest'
import { IceSlideGame } from './game'
import { createTestRun, createTestStage } from './test-fixtures'

describe('IceSlideGame crystal farming guard', () => {
    it('does not farm crystals across collect → reset → recollect', () => {
        const run = createTestRun([
            createTestStage({
                name: 'Crystal Corridor',
                parMoves: 3,
                rows: ['######', '#S.C.#', '#....#', '#...G#', '######'],
            }),
        ])
        const game = new IceSlideGame()
        game.start(run)

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
