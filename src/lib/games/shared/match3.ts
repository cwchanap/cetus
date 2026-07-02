/**
 * Generic match-3 grid logic extracted from the Bejeweled implementation.
 *
 * These functions operate over a grid of cells of arbitrary type `T`, where
 * `null` denotes an empty cell. They are pure (apart from the refill factory)
 * and mutate grids in place.
 */

import type { Grid } from './grid'

export interface Position {
    row: number
    col: number
}

export interface Match<T> {
    type: T
    positions: Position[]
}

export type MatchGrid<T> = Grid<T | null>

/**
 * Find all horizontal and vertical runs of identical, non-null cells of length
 * >= minMatch. Overlapping runs of the same type are merged into a single match.
 */
export function findMatches<T>(grid: MatchGrid<T>, minMatch = 3): Match<T>[] {
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    const matches: Match<T>[] = []

    // Horizontal matches
    for (let r = 0; r < rows; r++) {
        let runStart = 0
        for (let c = 1; c <= cols; c++) {
            const prev = grid[r][c - 1]
            const cur = c < cols ? grid[r][c] : null
            if (cur !== prev || prev === null) {
                const runLen = c - runStart
                if (prev !== null && runLen >= minMatch) {
                    const positions: Position[] = []
                    for (let k = runStart; k < c; k++) {
                        positions.push({ row: r, col: k })
                    }
                    matches.push({ type: prev, positions })
                }
                runStart = c
            }
        }
    }

    // Vertical matches
    for (let c = 0; c < cols; c++) {
        let runStart = 0
        for (let r = 1; r <= rows; r++) {
            const prev = grid[r - 1][c]
            const cur = r < rows ? grid[r][c] : null
            if (cur !== prev || prev === null) {
                const runLen = r - runStart
                if (prev !== null && runLen >= minMatch) {
                    const positions: Position[] = []
                    for (let k = runStart; k < r; k++) {
                        positions.push({ row: k, col: c })
                    }
                    matches.push({ type: prev, positions })
                }
                runStart = r
            }
        }
    }

    // De-duplicate overlapping positions by merging overlapping matches of same type
    if (matches.length <= 1) {
        return matches
    }

    const merged: Match<T>[] = []
    const used = new Array(matches.length).fill(false)

    for (let i = 0; i < matches.length; i++) {
        if (used[i]) {
            continue
        }
        const base = matches[i]
        const positions = new Map<string, Position>()
        for (const p of base.positions) {
            positions.set(`${p.row},${p.col}`, p)
        }

        for (let j = i + 1; j < matches.length; j++) {
            if (used[j]) {
                continue
            }
            const other = matches[j]
            if (other.type !== base.type) {
                continue
            }
            let overlaps = false
            for (const p of other.positions) {
                const key = `${p.row},${p.col}`
                if (positions.has(key)) {
                    overlaps = true
                }
            }
            if (overlaps) {
                for (const p of other.positions) {
                    positions.set(`${p.row},${p.col}`, p)
                }
                used[j] = true
            }
        }

        merged.push({
            type: base.type,
            positions: Array.from(positions.values()),
        })
        used[i] = true
    }

    return merged
}

/** Remove matched positions from a grid, setting them to null. */
export function removeMatches<T>(
    grid: MatchGrid<T>,
    matches: Match<T>[]
): { removed: number; largest: number } {
    let removed = 0
    let largest = 0
    for (const m of matches) {
        largest = Math.max(largest, m.positions.length)
        for (const { row, col } of m.positions) {
            if (grid[row][col] !== null) {
                grid[row][col] = null
                removed++
            }
        }
    }
    return { removed, largest }
}

/** Drop non-null cells downward within each column, leaving nulls at the top. */
export function applyGravity<T>(grid: MatchGrid<T>): void {
    const rows = grid.length
    const cols = grid[0]?.length ?? 0

    for (let c = 0; c < cols; c++) {
        let write = rows - 1
        for (let r = rows - 1; r >= 0; r--) {
            if (grid[r][c] !== null) {
                grid[write][c] = grid[r][c]
                if (write !== r) {
                    grid[r][c] = null
                }
                write--
            }
        }
        // Fill remaining with null
        for (let r = write; r >= 0; r--) {
            grid[r][c] = null
        }
    }
}

/**
 * Fill null cells using the provided factory. The factory is invoked once per
 * empty cell, allowing the caller to control RNG and the pool of valid types.
 */
export function refill<T>(grid: MatchGrid<T>, factory: () => T): void {
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === null) {
                grid[r][c] = factory()
            }
        }
    }
}

/** Swap the contents of two cells. */
export function swap<T>(grid: MatchGrid<T>, a: Position, b: Position): void {
    const tmp = grid[a.row][a.col]
    grid[a.row][a.col] = grid[b.row][b.col]
    grid[b.row][b.col] = tmp
}
