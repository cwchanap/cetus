import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '@/lib/games/core/types'

export const POTION_TUBE_CAPACITY = 4 as const

export type PotionColor =
    | 'cyan'
    | 'magenta'
    | 'amber'
    | 'lime'
    | 'violet'
    | 'coral'
    | 'azure'
export type PotionTube = PotionColor[]
export type PotionSorterDifficulty = 'easy' | 'medium' | 'hard'
export type PotionSorterResult = 'playing' | 'solved' | 'timeout'
export type PotionSorterActionResult =
    | 'selected'
    | 'deselected'
    | 'poured'
    | 'invalid'

export interface PotionSorterPreset {
    difficulty: PotionSorterDifficulty
    duration: number
    moveTarget: number
    completionBase: number
    initialTubes: PotionTube[]
}

export interface PotionSorterConfig extends BaseGameConfig {
    preset: PotionSorterPreset
}

export interface PotionSorterState extends BaseGameState {
    difficulty: PotionSorterDifficulty
    tubes: PotionTube[]
    selectedTubeIndex: number | null
    movesMade: number
    undosUsed: number
    result: PotionSorterResult
}

export interface PotionSorterStats extends BaseGameStats {
    difficulty: PotionSorterDifficulty
    solved: boolean
    result: PotionSorterResult
    movesMade: number
    undosUsed: number
}

export interface PotionSorterGameData {
    difficulty: PotionSorterDifficulty
    solved: boolean
    movesMade: number
    undosUsed: number
    elapsedSeconds: number
}
