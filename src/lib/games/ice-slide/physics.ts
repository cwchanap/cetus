import {
    GLYPH_TO_CELL,
    type CellType,
    type GridPosition,
    type IceSlideLevel,
} from './types'

export function parseGrid(level: IceSlideLevel): CellType[][] {
    if (level.rows.length === 0) {
        throw new Error(`Level ${level.id} has no rows`)
    }
    const cols = level.rows[0].length
    return level.rows.map((row, rowIndex) => {
        if (row.length !== cols) {
            throw new Error(
                `Level ${level.id} row ${rowIndex} length ${row.length} != ${cols}`
            )
        }
        return [...row].map(glyph => {
            const cell = GLYPH_TO_CELL[glyph]
            if (!cell) {
                throw new Error(
                    `Level ${level.id} unknown glyph "${glyph}" at row ${rowIndex}`
                )
            }
            return cell
        })
    })
}

export function findStart(grid: CellType[][]): GridPosition {
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            if (grid[row][col] === 'start') {
                return { row, col }
            }
        }
    }
    throw new Error('Level is missing a start tile')
}

export function cloneGrid(grid: CellType[][]): CellType[][] {
    return grid.map(row => [...row])
}

export function countCrystals(grid: CellType[][]): number {
    let count = 0
    for (const row of grid) {
        for (const cell of row) {
            if (cell === 'crystal') {
                count++
            }
        }
    }
    return count
}

function isBlocking(cell: CellType | undefined): boolean {
    return cell === undefined || cell === 'wall' || cell === 'rock'
}

export type SlideOutcome =
    | { kind: 'noop' }
    | {
          kind: 'moved'
          path: GridPosition[]
          end: GridPosition
          crystals: number
          reachedGoal: boolean
      }
    | { kind: 'hazard'; path: GridPosition[] }

/**
 * Simulate a slide from `from` in `direction` on `grid`.
 * Mutates `grid` only when crystals are collected (`kind: 'moved'`).
 */
export function slide(
    grid: CellType[][],
    from: GridPosition,
    direction: { row: number; col: number }
): SlideOutcome {
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    let row = from.row
    let col = from.col
    const path: GridPosition[] = [{ row, col }]
    let crystals = 0

    const nextRow = row + direction.row
    const nextCol = col + direction.col
    if (
        nextRow < 0 ||
        nextRow >= rows ||
        nextCol < 0 ||
        nextCol >= cols ||
        isBlocking(grid[nextRow][nextCol])
    ) {
        return { kind: 'noop' }
    }

    while (true) {
        const nr = row + direction.row
        const nc = col + direction.col

        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
            return {
                kind: 'moved',
                path,
                end: { row, col },
                crystals,
                reachedGoal: grid[row][col] === 'goal',
            }
        }

        const next = grid[nr][nc]
        if (isBlocking(next)) {
            return {
                kind: 'moved',
                path,
                end: { row, col },
                crystals,
                reachedGoal: grid[row][col] === 'goal',
            }
        }

        row = nr
        col = nc
        path.push({ row, col })

        if (next === 'hazard') {
            return { kind: 'hazard', path }
        }

        if (next === 'crystal') {
            grid[row][col] = 'ice'
            crystals++
        }

        if (next === 'goal') {
            return {
                kind: 'moved',
                path,
                end: { row, col },
                crystals,
                reachedGoal: true,
            }
        }
    }
}
