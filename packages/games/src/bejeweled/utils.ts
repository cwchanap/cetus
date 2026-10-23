import { JEWEL_TYPES, type JewelType, type Position } from './types'
import { randomElement, create2DArray } from '../shared/utils'
import {
    findMatches as sharedFindMatches,
    removeMatches as sharedRemoveMatches,
    applyGravity,
    refill,
    swap as sharedSwap,
} from '../shared/match3'
import {
    cloneGrid as sharedCloneGrid,
    isAdjacent as sharedIsAdjacent,
} from '../shared/grid'

// Random helpers
export function randomChoice<T>(arr: ReadonlyArray<T>): T {
    if (arr.length === 0) {
        throw new Error('randomChoice: array must not be empty')
    }
    return randomElement([...arr]) as T
}

export function inBounds(
    rows: number,
    cols: number,
    { row, col }: Position
): boolean {
    return row >= 0 && row < rows && col >= 0 && col < cols
}

export const isAdjacent = sharedIsAdjacent

export function cloneGrid(
    grid: (JewelType | null)[][]
): (JewelType | null)[][] {
    return sharedCloneGrid(grid)
}

export function generateInitialGrid(
    rows: number,
    cols: number,
    jewelTypes: JewelType[] = JEWEL_TYPES,
    minMatch = 3
): (JewelType | null)[][] {
    const grid: (JewelType | null)[][] = create2DArray<JewelType | null>(
        rows,
        cols,
        null
    )

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let attempts = 0
            let jewel: JewelType
            do {
                jewel = randomChoice(jewelTypes)
                attempts++
                // avoid creating immediate horizontal or vertical line >= minMatch
            } while (
                createsImmediateMatch(grid, r, c, jewel, minMatch) &&
                attempts < 20
            )
            grid[r][c] = jewel
        }
    }

    return grid
}

function createsImmediateMatch(
    grid: (JewelType | null)[][],
    r: number,
    c: number,
    jewel: JewelType,
    minMatch: number
): boolean {
    // Check horizontal
    const left1 = c >= 1 ? grid[r][c - 1] : null
    const left2 = c >= 2 ? grid[r][c - 2] : null
    if (left1 === jewel && left2 === jewel && minMatch <= 3) {
        return true
    }

    // Check vertical
    const up1 = r >= 1 ? grid[r - 1][c] : null
    const up2 = r >= 2 ? grid[r - 2][c] : null
    if (up1 === jewel && up2 === jewel && minMatch <= 3) {
        return true
    }

    return false
}

export const findMatches = sharedFindMatches
export const removeMatches = sharedRemoveMatches
export const dropJewels = applyGravity

export function findLegalSwap(
    grid: (JewelType | null)[][],
    minMatch = 3
): [Position, Position] | null {
    const copy = cloneGrid(grid)
    for (let row = 0; row < copy.length; row++) {
        for (let col = 0; col < copy[row].length; col++) {
            const a = { row, col }
            for (const b of [
                { row, col: col + 1 },
                { row: row + 1, col },
            ]) {
                if (
                    !inBounds(copy.length, copy[row].length, b) ||
                    !copy[row][col] ||
                    !copy[b.row][b.col]
                ) {
                    continue
                }
                swap(copy, a, b)
                const legal = findMatches(copy, minMatch).some(match =>
                    match.positions.some(
                        p =>
                            (p.row === a.row && p.col === a.col) ||
                            (p.row === b.row && p.col === b.col)
                    )
                )
                swap(copy, a, b)
                if (legal) {
                    return [a, b]
                }
            }
        }
    }
    return null
}

export function refillGrid(
    grid: (JewelType | null)[][],
    jewelTypes: JewelType[] = JEWEL_TYPES
): void {
    refill(grid, () => randomChoice(jewelTypes))
}

export function swap(
    grid: (JewelType | null)[][],
    a: Position,
    b: Position
): void {
    sharedSwap(grid, a, b)
}
