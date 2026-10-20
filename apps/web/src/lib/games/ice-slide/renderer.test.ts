import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {}
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'roundRect',
            'star',
            'destroy',
        ]) {
            g[m] = vi.fn(() => g)
        }
        return g
    }
    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: {
                border: '',
                borderRadius: '',
                boxShadow: '',
                touchAction: '',
                maxWidth: '',
                height: '',
            },
            writable: true,
        })
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: { addChild: vi.fn() },
            destroy: vi.fn(),
        }
    }
    return {
        Application: vi.fn(makeApp),
        Graphics: vi.fn(makeGraphics),
    }
})

import { Application } from 'pixi.js'
import {
    setupPixiJS,
    renderGrid,
    cleanup,
    swipeToDirection,
    keyToDirection,
} from './renderer'
import type { CellType, IceSlideState } from './types'

function makeState(
    grid: CellType[][],
    overrides: Partial<IceSlideState> = {}
): IceSlideState {
    return {
        levelIndex: 0,
        levelName: 'test',
        rows: grid.length,
        cols: grid[0].length,
        grid,
        player: { row: 1, col: 1 },
        start: { row: 1, col: 1 },
        moves: 0,
        levelMoves: 0,
        parMoves: 0,
        objectiveIds: [],
        pendingRouteChoiceAfterStage: null,
        routeChoices: [],
        undoChargesAvailable: 0,
        undoChargesUsed: 0,
        starsPossible: 0,
        levelFalls: 0,
        levelResets: 0,
        crystalsCollected: 0,
        levelCrystalsCollected: 0,
        score: 0,
        elapsedSeconds: 0,
        status: 'playing',
        perfectLevels: 0,
        levelsCleared: 0,
        lastSlidePath: [],
        mode: 'campaign',
        runKey: 'ice-slide:campaign:g1:r1',
        runSchemaVersion: 1,
        generatorVersion: 1,
        rulesetVersion: 1,
        stagesTotal: 8,
        starsEarned: 0,
        falls: 0,
        resets: 0,
        stageSignatures: [],
        ...overrides,
    }
}

describe('ice-slide renderer', () => {
    let container: HTMLElement

    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
    })

    afterEach(() => {
        container.remove()
        vi.clearAllMocks()
    })

    it('initializes a PixiJS app sized to the grid', async () => {
        const rs = await setupPixiJS(container, 5, 7, 48)
        expect(rs.app.init).toHaveBeenCalledWith(
            expect.objectContaining({ width: 336, height: 240 })
        )
        expect(rs.cellSize).toBe(48)
        expect(container.contains(rs.app.canvas)).toBe(true)
        expect(rs.app.stage.addChild).toHaveBeenCalled()
    })

    it('throws a wrapped error and clears the container when PixiJS init fails', async () => {
        container.appendChild(document.createElement('div'))
        vi.mocked(Application).mockImplementationOnce(() => {
            throw new Error('pixi exploded')
        })
        await expect(setupPixiJS(container, 1, 1, 48)).rejects.toThrow(
            'Failed to initialize PixiJS'
        )
        expect(container.children).toHaveLength(0)
    })

    it('destroys the Application when app.init rejects', async () => {
        const failingApp = {
            init: vi.fn().mockRejectedValue(new Error('init failed')),
            canvas: document.createElement('canvas'),
            stage: { addChild: vi.fn() },
            destroy: vi.fn(),
        }
        vi.mocked(Application).mockImplementationOnce(
            () => failingApp as unknown as Application
        )
        await expect(setupPixiJS(container, 1, 1, 48)).rejects.toThrow(
            'Failed to initialize PixiJS'
        )
        expect(failingApp.destroy).toHaveBeenCalled()
        expect(container.children).toHaveLength(0)
    })

    it('renders every cell type, slide trail, and player without throwing', async () => {
        const rs = await setupPixiJS(container, 2, 10, 48)
        const grid: CellType[][] = [
            [
                'wall',
                'ice',
                'goal',
                'rock',
                'hazard',
                'crystal',
                'snow',
                'fragile',
                'collapsed',
                'start',
            ],
            [
                'wall',
                'ice',
                'ice',
                'ice',
                'ice',
                'ice',
                'ice',
                'ice',
                'ice',
                'wall',
            ],
        ]
        const state = makeState(grid, {
            player: { row: 1, col: 2 },
            lastSlidePath: [
                { row: 1, col: 1 },
                { row: 1, col: 2 },
            ],
        })
        expect(() => renderGrid(rs, state)).not.toThrow()
        expect(rs.gridGraphic.clear).toHaveBeenCalled()
        expect(rs.gridGraphic.rect).toHaveBeenCalled()
        expect(rs.gridGraphic.circle).toHaveBeenCalled()
        expect(rs.gridGraphic.star).toHaveBeenCalled()
        expect(rs.gridGraphic.roundRect).toHaveBeenCalled()
        cleanup(rs)
        expect(rs.gridGraphic.destroy).toHaveBeenCalled()
        expect(rs.app.destroy).toHaveBeenCalledWith(true)
    })

    it('renders snow with an inset field and offset bands', async () => {
        const rs = await setupPixiJS(container, 1, 1, 48)
        const grid: CellType[][] = [['snow']]

        renderGrid(rs, makeState(grid, { player: { row: 0, col: 0 } }))

        const rectCalls = vi.mocked(rs.gridGraphic.rect).mock.calls
        const roundRectCalls = vi.mocked(rs.gridGraphic.roundRect).mock.calls

        expect(rectCalls.length).toBeGreaterThanOrEqual(2)
        expect(roundRectCalls.length).toBeGreaterThanOrEqual(3)
        expect(roundRectCalls[0]).toEqual([6, 6, 36, 36, 5])
        expect(roundRectCalls.slice(1).length).toBeGreaterThanOrEqual(2)
        expect(
            roundRectCalls.slice(1).every(([x, y]) => x !== 6 || y !== 6)
        ).toBe(true)
    })

    it('renders fragile with a visible segmented crack', async () => {
        const rs = await setupPixiJS(container, 1, 2, 48)
        renderGrid(
            rs,
            makeState([['fragile', 'ice']], { player: { row: 0, col: 1 } })
        )

        const calls = vi.mocked(rs.gridGraphic.roundRect).mock.calls
        expect(calls).toContainEqual([13, 9, 3, 14, 1])
        expect(calls).toContainEqual([15, 20, 13, 3, 1])
        expect(calls).toContainEqual([25, 20, 3, 15, 1])
    })

    it('renders collapsed as a hollow broken surface', async () => {
        const rs = await setupPixiJS(container, 1, 2, 48)
        renderGrid(
            rs,
            makeState([['collapsed', 'ice']], { player: { row: 0, col: 1 } })
        )

        const calls = vi.mocked(rs.gridGraphic.roundRect).mock.calls
        expect(calls).toContainEqual([7, 7, 34, 34, 5])
        expect(calls).toContainEqual([14, 14, 20, 20, 4])
    })

    it('maps swipe deltas to cardinal directions', () => {
        expect(swipeToDirection(0, 0)).toBeNull()
        expect(swipeToDirection(10, 0)).toBeNull()
        expect(swipeToDirection(30, 5)).toBe('E')
        expect(swipeToDirection(-30, 5)).toBe('W')
        expect(swipeToDirection(5, 30)).toBe('S')
        expect(swipeToDirection(5, -30)).toBe('N')
        expect(swipeToDirection(5, 5, 100)).toBeNull()
    })

    it('maps keyboard keys to directions', () => {
        expect(keyToDirection('ArrowUp')).toBe('N')
        expect(keyToDirection('w')).toBe('N')
        expect(keyToDirection('W')).toBe('N')
        expect(keyToDirection('ArrowRight')).toBe('E')
        expect(keyToDirection('d')).toBe('E')
        expect(keyToDirection('D')).toBe('E')
        expect(keyToDirection('ArrowDown')).toBe('S')
        expect(keyToDirection('s')).toBe('S')
        expect(keyToDirection('S')).toBe('S')
        expect(keyToDirection('ArrowLeft')).toBe('W')
        expect(keyToDirection('a')).toBe('W')
        expect(keyToDirection('A')).toBe('W')
        expect(keyToDirection('Enter')).toBeNull()
        expect(keyToDirection('q')).toBeNull()
    })
})
