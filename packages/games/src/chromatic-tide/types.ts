import type {
    BaseGameConfig,
    BaseGameState,
    BaseGameStats,
} from '../core/types'

export const CHROMATIC_TIDE_RULES = {
    duration: 90,
    rows: 12,
    cols: 12,
    progressPointsPerCell: 10,
    completionBonus: 500,
    efficiencyReferenceMoves: 22,
    efficiencyPointsPerMove: 25,
    timePointsPerSecond: 2,
} as const

export const CHROMATIC_TIDE_PALETTE = [
    'teal',
    'amber',
    'magenta',
    'ice',
    'green',
] as const

export type ChromaticTideColor = (typeof CHROMATIC_TIDE_PALETTE)[number]
export type ChromaticTideOutcome = 'playing' | 'cleared' | 'timeout'

export interface ChromaticTideCell {
    color: ChromaticTideColor
    captured: boolean
}

export type ChromaticTideBoard = ChromaticTideCell[][]

export interface ChromaticTideState extends BaseGameState {
    outcome: ChromaticTideOutcome
    board: ChromaticTideBoard
    territoryColor: ChromaticTideColor
    movesUsed: number
    capturedCells: number
    initialCapturedCells: number
}

export interface ChromaticTideStats extends BaseGameStats {
    outcome: ChromaticTideOutcome
    movesUsed: number
    capturedCells: number
    initialCapturedCells: number
    secondsRemaining: number
}

// Canonical definition in @cetus/shared (consumed by achievement predicates)
export type { ChromaticTideGameData } from '@cetus/shared/game-data'

export interface ChromaticTideConfig extends BaseGameConfig {
    rng: () => number
}

export function createChromaticTideConfig(
    overrides: Partial<Omit<ChromaticTideConfig, 'submitScore'>> = {}
): Omit<ChromaticTideConfig, 'submitScore'> {
    return {
        duration: CHROMATIC_TIDE_RULES.duration,
        pausable: false,
        resettable: true,
        rng: Math.random,
        ...overrides,
    }
}
