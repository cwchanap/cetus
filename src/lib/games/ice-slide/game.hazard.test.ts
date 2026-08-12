import { describe, expect, it, vi } from 'vitest'
import { IceSlideGame } from './game'
import { createTestRun, createTestStage } from './test-fixtures'

describe('IceSlideGame hazard branch (explicit run)', () => {
    it('reloads the level after sliding into a hazard', () => {
        const onHazard = vi.fn()
        const onMove = vi.fn()
        const run = createTestRun([
            createTestStage({
                name: 'Hazard Lane',
                rows: ['#####', '#S.H#', '#G..#', '#####'],
                parMoves: 1,
            }),
        ])
        const game = new IceSlideGame({ onHazard, onMove })
        game.start(run)

        game.move('E')
        expect(onHazard).toHaveBeenCalled()
        expect(onMove).toHaveBeenCalled()
        expect(game.getState().player).toEqual(game.getState().start)
        expect(game.getState().moves).toBe(1)
        // Hazard keeps the failed move; only manual Reset zeroes levelMoves.
        expect(game.getState().levelMoves).toBe(1)
        expect(game.getState().falls).toBe(1)
        expect(game.getState().resets).toBe(1)
        expect(game.getState().levelFalls).toBe(1)
        expect(game.getState().levelResets).toBe(1)
        game.destroy()
    })

    it('does not award perfectLevels after a hazard then at-par solve', () => {
        const run = createTestRun([
            createTestStage({
                name: 'Hazard Lane',
                rows: ['#####', '#S.H#', '#G..#', '#####'],
                parMoves: 1,
            }),
        ])
        const game = new IceSlideGame()
        game.start(run)

        game.move('E') // hazard; levelMoves retained at 1
        expect(game.getState().levelMoves).toBe(1)

        game.move('S')
        game.move('E') // clear in 2 post-hazard moves → total levelMoves 3 > par 1
        expect(game.getState().levelsCleared).toBe(1)
        expect(game.getState().perfectLevels).toBe(0)
        game.destroy()
    })

    it('ignores move and reset while idle', () => {
        const game = new IceSlideGame()
        game.move('E')
        game.resetLevel()
        expect(game.getState().status).toBe('idle')
        expect(game.getState().moves).toBe(0)
        game.destroy()
    })

    it('stop leaves the run idle without winning', () => {
        const onWin = vi.fn()
        const run = createTestRun([
            createTestStage({
                name: 'Hazard Lane',
                rows: ['#####', '#S.H#', '#G..#', '#####'],
                parMoves: 1,
            }),
        ])
        const game = new IceSlideGame({ onWin })
        game.start(run)
        game.stop()
        expect(game.getState().status).toBe('idle')
        expect(onWin).not.toHaveBeenCalled()
        game.destroy()
    })
})
