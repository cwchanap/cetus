// Edge direction of a tile connector
export type Direction = 'N' | 'E' | 'S' | 'W'

// Difficulty tiers (chosen up front)
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'

// Shapes a tile can take
export type TileType =
    | 'straight'
    | 'elbow'
    | 't-junction'
    | 'cross'
    | 'source'
    | 'core'
    | 'blocker'

// A single grid cell
export interface Tile {
    type: TileType
    // number of 90° clockwise rotations from the base orientation (0..3)
    orientation: number
    // locked tiles (source, core, blocker) cannot be rotated by the player
    locked: boolean
    // currently reachable from the source through matching connectors
    powered: boolean
}

export interface GridPosition {
    row: number
    col: number
}

// Per-difficulty configuration
export interface DifficultyConfig {
    difficulty: Difficulty
    rows: number
    cols: number
    cores: number
    blockers: number
    duration: number // seconds
    multiplier: number
}

// Runtime game configuration
export interface CircuitHackerConfig {
    difficulty: Difficulty
    cellSize: number // pixels per tile on the canvas
}

// Submitted with the score and used for achievement checks
export interface CircuitHackerGameData {
    difficulty: Difficulty
    secondsRemaining: number
    rotationsUsed: number
    solved: boolean
}

// Returned at game end
export interface CircuitHackerStats {
    finalScore: number
    difficulty: Difficulty
    secondsRemaining: number
    rotationsUsed: number
    solved: boolean
}

export interface CircuitHackerState {
    grid: Tile[][]
    sourcePos: GridPosition
    corePositions: GridPosition[]
    rows: number
    cols: number
    score: number
    timeRemaining: number
    rotationsUsed: number
    isGameActive: boolean
    isGameOver: boolean
    solved: boolean
}

// Why a run ended without being solved: the timer expired (`timeout`) or the
// player stopped the game early (`manual`). This describes run-end causes only
// — puzzle *generation* failures surface as a thrown Error, not this type.
export type RunEndReason = 'timeout' | 'manual'

export interface CircuitHackerCallbacks {
    onTimeUpdate: (timeRemaining: number) => void
    onRotation: (rotationsUsed: number) => void
    onSolved: (finalScore: number, stats: CircuitHackerStats) => void
    onFail: (stats: CircuitHackerStats, reason: RunEndReason) => void
    onGameStart: () => void
}
