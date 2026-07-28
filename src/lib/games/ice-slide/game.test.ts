import { afterEach, describe, expect, it, vi } from 'vitest'
import { IceSlideGame } from './game'

describe('IceSlideGame', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('starts on level 1 and clears First Frost in one move', () => {
        const onLevelClear = vi.fn()
        const onWin = vi.fn()
        const game = new IceSlideGame({ onLevelClear, onWin })
        game.start()

        const state = game.getState()
        expect(state.status).toBe('playing')
        expect(state.levelIndex).toBe(0)
        expect(state.levelName).toBe('First Frost')

        game.move('S')
        expect(onLevelClear).toHaveBeenCalledWith(1)
        expect(game.getState().levelIndex).toBe(1)
        expect(game.getState().levelsCleared).toBe(1)
        expect(game.getState().score).toBeGreaterThan(0)
        expect(onWin).not.toHaveBeenCalled()
        game.destroy()
    })

    it('does not count blocked moves', () => {
        const game = new IceSlideGame()
        game.start()
        game.move('N')
        expect(game.getState().moves).toBe(0)
        game.destroy()
    })

    it('resetLevel restores player to start without wiping run score', () => {
        const game = new IceSlideGame()
        game.start()
        game.move('S') // clear level 1
        const scoreAfter = game.getState().score
        expect(scoreAfter).toBeGreaterThan(0)

        // Level 2 start is blocked to the east; move south instead.
        game.move('S')
        expect(game.getState().levelMoves).toBeGreaterThan(0)
        game.resetLevel()
        expect(game.getState().player).toEqual(game.getState().start)
        expect(game.getState().levelMoves).toBe(0)
        expect(game.getState().score).toBe(scoreAfter)
        game.destroy()
    })

    it('tracks elapsed time while playing', () => {
        vi.useFakeTimers()
        const onTimeUpdate = vi.fn()
        const game = new IceSlideGame({ onTimeUpdate })
        game.start()
        vi.advanceTimersByTime(3000)
        expect(game.getState().elapsedSeconds).toBe(3)
        expect(onTimeUpdate).toHaveBeenCalled()
        game.destroy()
    })

    it('exposes gameData shape for score submission', () => {
        const game = new IceSlideGame()
        game.start()
        game.move('S')
        const data = game.getGameData()
        expect(data).toMatchObject({
            levelsCleared: 1,
            totalMoves: 1,
            crystalsCollected: 0,
            solved: false,
            perfectLevels: 1,
        })
        expect(typeof data.elapsedSeconds).toBe('number')
        game.destroy()
    })
})
