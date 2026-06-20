import { describe, it, expect } from 'vitest'
import {
    oppositeDirection,
    rotateConnectors,
    getBaseConnectors,
    getConnectors,
    cellsConnect,
    computePoweredCells,
    isSolved,
} from './utils'
import type { Tile, GridPosition } from './types'

const tile = (type: Tile['type'], orientation = 0): Tile => ({
    type,
    orientation,
    locked: false,
    powered: false,
})

const t = (type: Tile['type'], orientation = 0, locked = false): Tile => ({
    type,
    orientation,
    locked,
    powered: false,
})

describe('connector math', () => {
    it('returns opposite directions', () => {
        expect(oppositeDirection('N')).toBe('S')
        expect(oppositeDirection('S')).toBe('N')
        expect(oppositeDirection('E')).toBe('W')
        expect(oppositeDirection('W')).toBe('E')
    })

    it('rotates connectors clockwise', () => {
        expect(rotateConnectors(['N'], 1)).toEqual(['E'])
        expect(rotateConnectors(['N'], 2)).toEqual(['S'])
        expect(rotateConnectors(['N', 'E'], 1).sort()).toEqual(['E', 'S'])
        expect(rotateConnectors(['N'], 4)).toEqual(['N'])
    })

    it('defines base connectors per tile type', () => {
        expect(getBaseConnectors('straight').sort()).toEqual(['N', 'S'])
        expect(getBaseConnectors('elbow').sort()).toEqual(['E', 'N'])
        expect(getBaseConnectors('t-junction').sort()).toEqual(['E', 'N', 'S'])
        expect(getBaseConnectors('cross').sort()).toEqual(['E', 'N', 'S', 'W'])
        expect(getBaseConnectors('source')).toEqual(['N'])
        expect(getBaseConnectors('core')).toEqual(['N'])
        expect(getBaseConnectors('blocker')).toEqual([])
    })

    it('applies orientation to connectors', () => {
        expect(getConnectors(tile('straight', 1)).sort()).toEqual(['E', 'W'])
        expect(getConnectors(tile('source', 1))).toEqual(['E'])
    })

    it('connects two tiles only when both face each other', () => {
        // straight vertical (N,S) above a straight vertical: A's S meets B's N
        expect(
            cellsConnect(tile('straight', 0), 'S', tile('straight', 0))
        ).toBe(true)
        // straight horizontal has no S connector
        expect(
            cellsConnect(tile('straight', 1), 'S', tile('straight', 0))
        ).toBe(false)
        // blocker never connects
        expect(cellsConnect(tile('cross'), 'E', tile('blocker'))).toBe(false)
    })
})

describe('power flood-fill', () => {
    // 1x3 row: source(→E) — straight(horizontal) — core(←W)
    // source base 'N' rotated to 'E' = orientation 1
    // core base 'N' rotated to 'W' = orientation 3
    const source: GridPosition = { row: 0, col: 0 }
    const cores: GridPosition[] = [{ row: 0, col: 2 }]

    it('powers a fully connected line', () => {
        const grid: Tile[][] = [
            [t('source', 1, true), t('straight', 1), t('core', 3, true)],
        ]
        const powered = computePoweredCells(grid, source)
        expect(powered[0][0]).toBe(true)
        expect(powered[0][1]).toBe(true)
        expect(powered[0][2]).toBe(true)
        expect(isSolved(grid, source, cores)).toBe(true)
    })

    it('does not power past a broken connection', () => {
        // middle straight left vertical (orientation 0 -> N,S) breaks the row
        const grid: Tile[][] = [
            [t('source', 1, true), t('straight', 0), t('core', 3, true)],
        ]
        const powered = computePoweredCells(grid, source)
        expect(powered[0][0]).toBe(true)
        expect(powered[0][1]).toBe(false)
        expect(powered[0][2]).toBe(false)
        expect(isSolved(grid, source, cores)).toBe(false)
    })
})
