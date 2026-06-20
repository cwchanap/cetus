import type { Direction, Tile, TileType } from './types'

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
