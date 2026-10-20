// Edge direction of a tile connector
export type Direction = 'N' | 'E' | 'S' | 'W'

// Number of 90° clockwise rotations from the base orientation. Constraining
// this to 0..3 makes illegal rotations unrepresentable at zero runtime cost.
export type Orientation = 0 | 1 | 2 | 3

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
    orientation: Orientation
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
    // onSolved may be async (the page submits the score over the network).
    // The game loop does not await it; callers are responsible for their
    // own error handling. The void | Promise<void> return lets the game
    // attach a defensive .catch() so an unhandled rejection can never
    // escape the fire-and-forget call site.
    onSolved: (
        finalScore: number,
        stats: CircuitHackerStats
    ) => void | Promise<void>
    onFail: (stats: CircuitHackerStats, reason: RunEndReason) => void
    onGameStart: () => void
}
