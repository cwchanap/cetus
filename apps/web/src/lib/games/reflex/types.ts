// Reflex game domain types (shared between framework and renderer)

export interface Cell {
    id: string
    row: number
    col: number
    x: number
    y: number
}

export interface GameObject {
    id: string
    type: 'coin' | 'bomb'
    cell: Cell
    spawnTime: number
    expirationTime: number
    isActive: boolean
    clicked: boolean
}

export interface GameHistoryEntry {
    objectId: string
    type: 'coin' | 'bomb'
    clicked: boolean
    timeToClick?: number
    pointsAwarded: number
}

export interface GridPosition {
    row: number
    col: number
}

export interface SpawnResult {
    success: boolean
    object?: GameObject
    reason?: string
}
