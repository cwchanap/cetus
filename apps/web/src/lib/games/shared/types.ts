/**
 * Shared game types for consistent type safety across all games
 *
 * The portable game-result DTOs (the `*GameData` shapes consumed by the
 * achievement predicates) are canonically defined in `@cetus/shared` and
 * re-exported here for the web game modules. Runtime-only types (stats,
 * render helpers) remain web-side.
 */

export type {
    GameHistoryEntry,
    TetrisGameData,
    BubbleShooterGameData,
    BejeweledGameData,
    MemoryMatrixGameData,
    WordScrambleGameData,
    ReflexGameData,
    QuickMathGameData,
    SudokuGameData,
    PathNavigatorGameData,
    EvaderGameData,
    Game2048Data,
    SnakeGameData,
    Difficulty,
    CircuitHackerGameData,
    SatelliteSyncGameData,
    IceSlideMode,
    IceSlideObjectiveId,
    IceSlideExpeditionRouteChoice,
    IceSlideGameData,
    MineGridDifficulty,
    MineGridGameData,
    PatternPulseGameData,
    GravityFlipGameData,
    PotionSorterDifficulty,
    PotionSorterGameData,
    SignalSwitchGameData,
    RhythmReactorGameData,
    AsteroidDriftGameData,
    ChromaticTideGameData,
} from '@cetus/shared/game-data'

import type {
    TetrisGameData,
    BubbleShooterGameData,
    BejeweledGameData,
    MemoryMatrixGameData,
    WordScrambleGameData,
    ReflexGameData,
    QuickMathGameData,
    SudokuGameData,
    PathNavigatorGameData,
    EvaderGameData,
    Game2048Data,
    SnakeGameData,
    CircuitHackerGameData,
    SatelliteSyncGameData,
    IceSlideGameData,
    MineGridGameData,
    PatternPulseGameData,
    GravityFlipGameData,
    PotionSorterGameData,
    SignalSwitchGameData,
    RhythmReactorGameData,
    AsteroidDriftGameData,
    ChromaticTideGameData,
} from '@cetus/shared/game-data'

// Union type for all game data
export type GameData =
    | TetrisGameData
    | BubbleShooterGameData
    | BejeweledGameData
    | MemoryMatrixGameData
    | WordScrambleGameData
    | ReflexGameData
    | QuickMathGameData
    | SudokuGameData
    | PathNavigatorGameData
    | EvaderGameData
    | Game2048Data
    | SnakeGameData
    | CircuitHackerGameData
    | SatelliteSyncGameData
    | IceSlideGameData
    | MineGridGameData
    | PatternPulseGameData
    | GravityFlipGameData
    | PotionSorterGameData
    | SignalSwitchGameData
    | RhythmReactorGameData
    | AsteroidDriftGameData
    | ChromaticTideGameData

// Common game stats returned from games
export interface GameStats {
    finalScore: number
    timeElapsed?: number
    level?: number
}

// Tetris stats
export interface TetrisStats extends GameStats {
    lines: number
    pieces: number
    singles: number
    doubles: number
    triples: number
    tetrises: number
    consecutiveLineClears: number
}

// Bubble Shooter stats
export interface BubbleShooterStats extends GameStats {
    bubblesPopped: number
    shotsFired: number
    accuracy: number
}

// Generic stats type for games that don't have specific stats
export interface GenericGameStats extends GameStats {
    [key: string]: number | unknown
}

/**
 * Color utility function for PixiJS rendering
 * Shared across multiple games. Throws a TypeError for invalid hex values.
 */
export function hexToPixiColor(hex: string): number {
    const cleanHex = hex.trim().replace(/^#/, '')

    if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
        throw new TypeError(`Invalid hex color: "${hex}"`)
    }

    return parseInt(cleanHex, 16)
}

// Usage example:
// hexToPixiColor('#00FFAA') // returns 65450
// hexToPixiColor('#GGGGGG') // throws TypeError

/**
 * Convert Pixi color number to hex string
 */
export function pixiColorToHex(color: number): string {
    if (typeof color !== 'number' || !Number.isFinite(color)) {
        throw new TypeError('Color must be a finite number')
    }

    // Coerce to integer and clamp to valid 24-bit color range
    const intColor = Math.max(0, Math.min(0xffffff, Math.floor(color)))

    return `#${intColor.toString(16).padStart(6, '0')}`
}
