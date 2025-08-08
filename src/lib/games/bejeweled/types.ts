import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

// Jewel definitions
export type JewelType = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'cyan'

export const JEWEL_TYPES: JewelType[] = [
    'red',
    'blue',
    'green',
    'yellow',
    'purple',
    'cyan',
]

export const JEWEL_COLORS: Record<JewelType, number> = {
    red: 0xff4d4d,
    blue: 0x4da6ff,
    green: 0x4dff88,
    yellow: 0xffe14d,
    purple: 0xb84dff,
    cyan: 0x4dfff2,
}

export interface Position {
    row: number
    col: number
}

export interface Match {
    type: JewelType
    positions: Position[]
}

export interface BejeweledState extends BaseGameState {
    grid: (JewelType | null)[][]
    rows: number
    cols: number
    selected: Position | null
    combo: number
    movesMade: number
    isAnimating: boolean
}

export interface BejeweledConfig extends BaseGameConfig {
    rows: number
    cols: number
    jewelTypes: JewelType[]
    minMatch: number // typically 3
    pointsPerJewel: number // base points per cleared jewel
}

export interface BejeweledStats extends BaseGameStats {
    movesMade: number
    maxCombo: number
    largestMatch: number
    totalMatches: number
}
