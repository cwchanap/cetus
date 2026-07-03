import type { SpawnType } from '@/lib/games/shared/spawner'

export interface GameObject {
    id: string
    type: SpawnType
    x: number
    y: number
    speed: number
    spawnTime: number
}

export interface Player {
    x: number
    y: number
    size: number
    speed: number
}

export type GameHistoryEntry = {
    type: SpawnType
    points: number
}
