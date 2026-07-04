/**
 * Generic 2D grid operations shared across grid-based games.
 */

export type Grid<T> = T[][]

/**
 * Create a rows×cols grid filled with a value or factory.
 *
 * @param fill - If a function, called per cell to produce unique values;
 *   otherwise the same value is placed in every cell. To store a function
 *   as a cell value, wrap it: `createGrid(r, c, () => myFn)`.
 */
export function createGrid<T>(
    rows: number,
    cols: number,
    fill: T | (() => T)
): Grid<T> {
    const factory = typeof fill === 'function' ? (fill as () => T) : () => fill
    return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => factory())
    )
}

/** Iterate every cell in a grid. */
export function forEachCell<T>(
    grid: Grid<T>,
    cb: (value: T, row: number, col: number) => void
): void {
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            cb(grid[r][c], r, c)
        }
    }
}

/** Shallow clone a grid (copies each row). */
export function cloneGrid<T>(grid: Grid<T>): Grid<T> {
    return grid.map(row => [...row])
}

/** Deep clone a grid of plain data via JSON. */
export function deepCloneGrid<T>(grid: Grid<T>): Grid<T> {
    return JSON.parse(JSON.stringify(grid))
}

/** Check if a position is within grid bounds. */
export function inBounds<T>(grid: Grid<T>, row: number, col: number): boolean {
    return row >= 0 && row < grid.length && col >= 0 && col < grid[row].length
}

/** Find all cells matching a predicate. */
export function findCells<T>(
    grid: Grid<T>,
    predicate: (value: T, row: number, col: number) => boolean
): Array<{ row: number; col: number; value: T }> {
    const result: Array<{ row: number; col: number; value: T }> = []
    forEachCell(grid, (value, row, col) => {
        if (predicate(value, row, col)) {
            result.push({ row, col, value })
        }
    })
    return result
}

/** Swap two cells in a grid. */
export function swapCells<T>(
    grid: Grid<T>,
    a: { row: number; col: number },
    b: { row: number; col: number }
): void {
    const temp = grid[a.row][a.col]
    grid[a.row][a.col] = grid[b.row][b.col]
    grid[b.row][b.col] = temp
}

/** Check if two positions are adjacent (4-directional). */
export function isAdjacent(
    a: { row: number; col: number },
    b: { row: number; col: number }
): boolean {
    const dr = Math.abs(a.row - b.row)
    const dc = Math.abs(a.col - b.col)
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
}

/** Find a random free cell on a grid (null = free). */
export function findRandomFreeCell<T>(
    grid: Grid<T | null>,
    occupied: Array<{ row: number; col: number }> = []
): { row: number; col: number } | null {
    const occupiedSet = new Set(occupied.map(p => `${p.row},${p.col}`))
    const free = findCells(
        grid,
        (value, r, c) => value === null && !occupiedSet.has(`${r},${c}`)
    )
    if (free.length === 0) {
        return null
    }
    const pick = free[Math.floor(Math.random() * free.length)]
    return { row: pick.row, col: pick.col }
}
