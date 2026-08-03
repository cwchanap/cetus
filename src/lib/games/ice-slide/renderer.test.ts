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
        const rs = await setupPixiJS(container, 2, 7, 48)
        const grid: CellType[][] = [
            ['wall', 'ice', 'goal', 'rock', 'hazard', 'crystal', 'start'],
            ['wall', 'ice', 'ice', 'ice', 'ice', 'ice', 'wall'],
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
