import { describe, expect, it, vi } from 'vitest'
import { IceSlideGame } from './game'
import { createTestRun, createTestStage } from './test-fixtures'
import type { Direction } from './types'

function createRouteLifecycleRun(
    stage3Rows: string[] = ['######', '#S..H#', '#G...#', '######']
) {
    const createRouteStage = (
        id: string,
        rows: string[] = ['#####', '#S.G#', '#####']
    ) =>
        createTestStage({
            id,
            rows,
            objectiveIds: ['no_reset'],
        })

    return createTestRun([
        createRouteStage('expedition:route:1'),
        createRouteStage('expedition:route:2'),
        createRouteStage('expedition:route:3', stage3Rows),
        createRouteStage('expedition:route:4'),
        createRouteStage('expedition:route:5', [
            '######',
            '#S..H#',
            '#G...#',
            '######',
        ]),
        createRouteStage('expedition:route:6'),
    ])
}

function clearCurrentStage(game: IceSlideGame): void {
    const routes: Record<number, Direction[]> = {
        0: ['E'],
        1: ['E'],
        2: ['E', 'S'],
        3: ['E'],
        4: ['E', 'S'],
        5: ['E'],
    }
    const route = routes[game.getState().levelIndex]
    if (!route) {
        throw new Error('missing test route')
    }
    for (const direction of route) {
        game.move(direction)
    }
}

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

    it('invalidates Undo after a hazard rebuild without spending its charge', () => {
        const game = new IceSlideGame()
        game.start(
            createRouteLifecycleRun([
                '########',
                '#S..O.H#',
                '#......#',
                '#G.....#',
                '########',
            ])
        )
        clearCurrentStage(game)
        clearCurrentStage(game)
        expect(game.chooseExpeditionRoute('safe')).toBe(true)

        game.move('E')
        expect(game.canUndo()).toBe(true)
        game.move('S')
        game.move('E')
        game.move('N')

        expect(game.undo()).toBe(false)
        expect(game.canUndo()).toBe(false)
        expect(game.getState().undoChargesAvailable).toBe(1)
        expect(game.getState().undoChargesUsed).toBe(0)
        expect(game.getState().routeChoices).toEqual(['safe'])
        game.destroy()
    })

    it('invalidates Undo after a manual reset without spending its charge', () => {
        const game = new IceSlideGame()
        game.start(
            createRouteLifecycleRun([
                '#######',
                '#S....#',
                '#G....#',
                '#######',
            ])
        )
        clearCurrentStage(game)
        clearCurrentStage(game)
        expect(game.chooseExpeditionRoute('safe')).toBe(true)

        game.move('E')
        expect(game.canUndo()).toBe(true)
        game.resetLevel()

        expect(game.undo()).toBe(false)
        expect(game.canUndo()).toBe(false)
        expect(game.getState().undoChargesAvailable).toBe(1)
        expect(game.getState().undoChargesUsed).toBe(0)
        expect(game.getState().routeChoices).toEqual(['safe'])
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

    it('preserves Expedition route charges and history through hazard, reset, and advance', () => {
        const game = new IceSlideGame()
        game.start(createRouteLifecycleRun())

        clearCurrentStage(game)
        clearCurrentStage(game)
        expect(game.chooseExpeditionRoute('safe')).toBe(true)

        game.move('E')
        expect(game.getState().undoChargesAvailable).toBe(1)
        expect(game.getState().undoChargesUsed).toBe(0)
        expect(game.getState().routeChoices).toEqual(['safe'])

        game.resetLevel()
        expect(game.getState().undoChargesAvailable).toBe(1)
        expect(game.getState().undoChargesUsed).toBe(0)
        expect(game.getState().routeChoices).toEqual(['safe'])

        clearCurrentStage(game)
        expect(game.getState().levelIndex).toBe(3)
        expect(game.getState().undoChargesAvailable).toBe(1)
        expect(game.getState().undoChargesUsed).toBe(0)
        expect(game.getState().routeChoices).toEqual(['safe'])

        clearCurrentStage(game)
        expect(game.getState().levelIndex).toBe(4)
        expect(game.chooseExpeditionRoute('safe')).toBe(true)
        expect(game.getState().routeChoices).toEqual(['safe', 'safe'])
        expect(game.getState().undoChargesAvailable).toBe(2)
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
