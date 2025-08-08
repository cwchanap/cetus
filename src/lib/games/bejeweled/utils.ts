import { JEWEL_TYPES, type JewelType, type Match, type Position } from './types'

// Random helpers
export function randomChoice<T>(arr: ReadonlyArray<T>): T {
    return arr[Math.floor(Math.random() * arr.length)]
}

export function inBounds(
    rows: number,
    cols: number,
    { row, col }: Position
): boolean {
    return row >= 0 && row < rows && col >= 0 && col < cols
}

export function isAdjacent(a: Position, b: Position): boolean {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1
}

export function cloneGrid(
    grid: (JewelType | null)[][]
): (JewelType | null)[][] {
    return grid.map(row => row.slice())
}

export function generateInitialGrid(
    rows: number,
    cols: number,
    jewelTypes: JewelType[] = JEWEL_TYPES,
    minMatch = 3
): (JewelType | null)[][] {
    const grid: (JewelType | null)[][] = Array.from({ length: rows }, () =>
        Array<JewelType | null>(cols).fill(null)
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

export function findMatches(
    grid: (JewelType | null)[][],
    minMatch = 3
): Match[] {
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    const matches: Match[] = []

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

    const merged: Match[] = []
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

export function removeMatches(
    grid: (JewelType | null)[][],
    matches: Match[]
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

export function dropJewels(grid: (JewelType | null)[][]): void {
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

export function refillGrid(
    grid: (JewelType | null)[][],
    jewelTypes: JewelType[] = JEWEL_TYPES
): void {
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === null) {
                grid[r][c] = randomChoice(jewelTypes)
            }
        }
    }
}

export function swap(
    grid: (JewelType | null)[][],
    a: Position,
    b: Position
): void {
    const tmp = grid[a.row][a.col]
    grid[a.row][a.col] = grid[b.row][b.col]
    grid[b.row][b.col] = tmp
}
