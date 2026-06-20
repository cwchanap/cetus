import type { Direction, GridPosition, Tile, TileType } from './types'

const CLOCKWISE: Direction[] = ['N', 'E', 'S', 'W']

export function oppositeDirection(dir: Direction): Direction {
    switch (dir) {
        case 'N':
            return 'S'
        case 'S':
            return 'N'
        case 'E':
            return 'W'
        case 'W':
            return 'E'
    }
}

export function rotateConnectors(
    connectors: Direction[],
    times: number
): Direction[] {
    const steps = ((times % 4) + 4) % 4
    return connectors.map(dir => {
        const idx = CLOCKWISE.indexOf(dir)
        return CLOCKWISE[(idx + steps) % 4]
    })
}

export function getBaseConnectors(type: TileType): Direction[] {
    switch (type) {
        case 'straight':
            return ['N', 'S']
        case 'elbow':
            return ['N', 'E']
        case 't-junction':
            return ['N', 'E', 'S']
        case 'cross':
            return ['N', 'E', 'S', 'W']
        case 'source':
            return ['N']
        case 'core':
            return ['N']
        case 'blocker':
            return []
    }
}

export function getConnectors(tile: Tile): Direction[] {
    return rotateConnectors(getBaseConnectors(tile.type), tile.orientation)
}

export function cellsConnect(from: Tile, dir: Direction, to: Tile): boolean {
    return (
        getConnectors(from).includes(dir) &&
        getConnectors(to).includes(oppositeDirection(dir))
    )
}

const DELTA: Record<Direction, { dr: number; dc: number }> = {
    N: { dr: -1, dc: 0 },
    E: { dr: 0, dc: 1 },
    S: { dr: 1, dc: 0 },
    W: { dr: 0, dc: -1 },
}

export function computePoweredCells(
    grid: Tile[][],
    source: GridPosition
): boolean[][] {
    const rows = grid.length
    const cols = rows > 0 ? grid[0].length : 0
    const powered: boolean[][] = grid.map(row => row.map(() => false))

    const queue: GridPosition[] = [source]
    powered[source.row][source.col] = true

    while (queue.length > 0) {
        const { row, col } = queue.shift() as GridPosition
        const from = grid[row][col]
        for (const dir of ['N', 'E', 'S', 'W'] as Direction[]) {
            const nr = row + DELTA[dir].dr
            const nc = col + DELTA[dir].dc
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
                continue
            }
            if (powered[nr][nc]) {
                continue
            }
            if (cellsConnect(from, dir, grid[nr][nc])) {
                powered[nr][nc] = true
                queue.push({ row: nr, col: nc })
            }
        }
    }

    return powered
}

export function isSolved(
    grid: Tile[][],
    source: GridPosition,
    cores: GridPosition[]
): boolean {
    const powered = computePoweredCells(grid, source)
    return cores.every(core => powered[core.row][core.col])
}
