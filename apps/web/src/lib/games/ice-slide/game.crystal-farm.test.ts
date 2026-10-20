import { describe, expect, it } from 'vitest'
import { IceSlideGame } from './game'
import { createTestRun, createTestStage } from './test-fixtures'

function createCrystalUndoRun() {
    return createTestRun([
        createTestStage({ id: 'crystal:1' }),
        createTestStage({ id: 'crystal:2' }),
        createTestStage({
            id: 'crystal:3',
            rows: ['#######', '#S.C..#', '#G....#', '#######'],
        }),
    ])
}

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

    it('restores a collected crystal and both crystal counters with Undo', () => {
        const game = new IceSlideGame()
        game.start(createCrystalUndoRun())
        game.move('E')
        game.move('E')
        expect(game.chooseExpeditionRoute('safe')).toBe(true)

        const before = game.getState()
        game.move('E')
        const afterMove = game.getState()
        expect(afterMove.grid[1][3]).toBe('ice')
        expect(afterMove.crystalsCollected).toBe(1)
        expect(afterMove.levelCrystalsCollected).toBe(1)
        expect(game.canUndo()).toBe(true)

        expect(game.undo()).toBe(true)
        const afterUndo = game.getState()
        expect(afterUndo.grid[1][3]).toBe('crystal')
        expect(afterUndo.grid).toEqual(before.grid)
        expect(afterUndo.crystalsCollected).toBe(before.crystalsCollected)
        expect(afterUndo.levelCrystalsCollected).toBe(
            before.levelCrystalsCollected
        )
        game.destroy()
    })
})
