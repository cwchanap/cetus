// src/lib/games/circuit-hacker/renderer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1, x: 0, y: 0 }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'roundRect',
        ]) {
            g[m] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }
    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', boxShadow: '' },
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
        Container: vi.fn(() => ({ addChild: vi.fn(), destroy: vi.fn() })),
        Graphics: vi.fn(makeGraphics),
    }
})

import { Application } from 'pixi.js'
import { setupPixiJS, renderGrid, pointerToCell, cleanup } from './renderer'
import type { CircuitHackerState, Tile } from './types'

const tile = (over: Partial<Tile> = {}): Tile => ({
    type: 'straight',
    orientation: 0,
    locked: false,
    powered: false,
    ...over,
})

describe('circuit-hacker renderer', () => {
    let container: HTMLElement
    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
    })

    afterEach(() => {
        container.remove()
    })

    it('initializes a PixiJS app sized to the grid', async () => {
        const rs = await setupPixiJS(container, 5, 5, 48)
        expect(rs.app.init).toHaveBeenCalledWith(
            expect.objectContaining({ width: 240, height: 240 })
        )
        expect(container.contains(rs.app.canvas)).toBe(true)
    })

    it('maps pointer coordinates to a cell', () => {
        expect(pointerToCell(10, 10, 48, 5, 5)).toEqual({ row: 0, col: 0 })
        expect(pointerToCell(100, 50, 48, 5, 5)).toEqual({ row: 1, col: 2 })
        expect(pointerToCell(-5, 10, 48, 5, 5)).toBeNull()
        expect(pointerToCell(10, 9999, 48, 5, 5)).toBeNull()
    })

    it('renders without throwing', async () => {
        const rs = await setupPixiJS(container, 1, 2, 48)
        const state = {
            grid: [[tile({ type: 'source', locked: true }), tile()]],
            sourcePos: { row: 0, col: 0 },
            corePositions: [],
            rows: 1,
            cols: 2,
            score: 0,
            timeRemaining: 10,
            rotationsUsed: 0,
            isGameActive: true,
            isGameOver: false,
            solved: false,
        } as CircuitHackerState
        expect(() => renderGrid(rs, state, 48)).not.toThrow()
        expect(rs.tileGraphic.clear).toHaveBeenCalled()
        cleanup(rs)
        expect(rs.app.destroy).toHaveBeenCalled()
    })

    it('throws a wrapped error and cleans the container when PixiJS init fails', async () => {
        // Append a dummy child to verify the catch block clears the container
        container.appendChild(document.createElement('div'))
        vi.mocked(Application).mockImplementationOnce(() => {
            throw new Error('pixi exploded')
        })
        await expect(setupPixiJS(container, 1, 1, 48)).rejects.toThrow(
            'Failed to initialize PixiJS'
        )
        // The catch block removes all children from the container
        expect(container.children).toHaveLength(0)
    })

    it('renders a blocker tile without throwing', async () => {
        const rs = await setupPixiJS(container, 1, 2, 48)
        const state = {
            grid: [[tile({ type: 'blocker', locked: true }), tile()]],
            sourcePos: { row: 0, col: 0 },
            corePositions: [],
            rows: 1,
            cols: 2,
            score: 0,
            timeRemaining: 10,
            rotationsUsed: 0,
            isGameActive: true,
            isGameOver: false,
            solved: false,
        } as CircuitHackerState
        expect(() => renderGrid(rs, state, 48)).not.toThrow()
        // COLOR_BLOCKER = 0x1e293b; the blocker fill call uses it directly
        expect(rs.tileGraphic.fill).toHaveBeenCalledWith(0x1e293b)
        cleanup(rs)
    })
})
