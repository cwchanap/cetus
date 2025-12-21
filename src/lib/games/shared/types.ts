/**
 * Shared game types for consistent type safety across all games
 */

// Base game history entry for tracking clicked objects
export interface GameHistoryEntry {
    objectId: string
    type: 'coin' | 'bomb'
    clicked: boolean
    timeToClick?: number
    pointsAwarded: number
}

// Tetris-specific game data
export interface TetrisGameData {
    doubles: number
    triples: number
    tetrises: number
    consecutiveLineClears: number
    piecesPlaced: number
    level: number
}

// Bubble Shooter-specific game data
export interface BubbleShooterGameData {
    bubblesPopped: number
    shotsFired: number
    largestCombo: number
}

// Bejeweled-specific game data
export interface BejeweledGameData {
    maxCombo: number
    largestMatch: number
    straightFive?: boolean
    totalMatches: number
}

// Memory Matrix-specific game data
export interface MemoryMatrixGameData {
    matchesFound: number
    moves: number
    perfectGame?: boolean
}

// Word Scramble-specific game data
export interface WordScrambleGameData {
    lastCorrectWord?: string
    correctWords?: string[]
    totalWordsScrambled: number
}

// Reflex-specific game data
export interface ReflexGameData {
    gameHistory: GameHistoryEntry[]
    coinsCollected: number
    bombsHit: number
}

// Quick Math-specific game data
export interface QuickMathGameData {
    seenOnePlusOne?: boolean
    onePlusOneIncorrect?: boolean
    seenOperand999?: boolean
    zeroAnswerIncorrect?: boolean
    correctAnswers: number
    wrongAnswers: number
}

// Sudoku-specific game data
export interface SudokuGameData {
    difficulty: 'easy' | 'medium' | 'hard'
    cellsFilled: number
    hintsUsed: number
}

// Path Navigator-specific game data
export interface PathNavigatorGameData {
    pathsCompleted: number
    perfectPaths: number
}

// Evader-specific game data
export interface EvaderGameData {
    obstaclesEvaded: number
    powerUpsCollected: number
    longestSurvivalTime: number
}

// 2048-specific game data
export interface Game2048Data {
    maxTile: number
    moves: number
    merges: number
}

// Snake-specific game data
export interface SnakeGameData {
    applesEaten: number
    maxLength: number
}

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
    return `#${color.toString(16).padStart(6, '0')}`
}
