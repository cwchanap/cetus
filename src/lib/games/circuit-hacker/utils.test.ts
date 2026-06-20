import { describe, it, expect } from 'vitest'
import {
    oppositeDirection,
    rotateConnectors,
    getBaseConnectors,
    getConnectors,
    cellsConnect,
} from './utils'
import type { Tile } from './types'

const tile = (type: Tile['type'], orientation = 0): Tile => ({
    type,
    orientation,
    locked: false,
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
