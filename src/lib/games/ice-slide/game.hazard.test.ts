import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./levels', () => {
    const levels = [
        {
            id: 1,
            name: 'Hazard Lane',
            parMoves: 1,
            rows: ['#####', '#S.H#', '#####'],
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

describe('IceSlideGame hazard branch (mocked levels)', () => {
    it('reloads the level after sliding into a hazard', () => {
        const onHazard = vi.fn()
        const onMove = vi.fn()
        const game = new IceSlideGame({ onHazard, onMove })
        game.start()

        game.move('E')
        expect(onHazard).toHaveBeenCalled()
        expect(onMove).toHaveBeenCalled()
        expect(game.getState().player).toEqual(game.getState().start)
        expect(game.getState().moves).toBe(1)
        expect(game.getState().levelMoves).toBe(0)
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
        const game = new IceSlideGame({ onWin })
        game.start()
        game.stop()
        expect(game.getState().status).toBe('idle')
        expect(onWin).not.toHaveBeenCalled()
        game.destroy()
    })
})
