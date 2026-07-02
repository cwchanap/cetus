// Types for Tetris game
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameStats,
} from '@/lib/games/core/types'

export interface Position {
    x: number
    y: number
}

export interface Piece {
    type: string
    shape: number[][]
    color: number
    x: number
    y: number
}

// Shape of the static game constants (board dimensions, block size, pieces)
export interface GameConstants {
    BOARD_WIDTH: number
    BOARD_HEIGHT: number
    BLOCK_SIZE: number
    GAME_WIDTH: number
    GAME_HEIGHT: number
    NEXT_CANVAS_SIZE: number
    COLORS: { [key: string]: number }
    PIECE_TYPES: string[]
    PIECES: { [key: string]: { shape: number[][]; color: number } }
}

// Per-line-clear statistics tracked during a game
export interface TetrisLineStats {
    pieces: number
    singles: number
    doubles: number
    triples: number
    tetrises: number
    consecutiveLineClears: number
}

// Extended state for Tetris game (extends BaseGameState)
export interface TetrisState extends BaseGameState {
    board: (number | null)[][]
    currentPiece: Piece | null
    nextPiece: Piece | null
    level: number
    lines: number
    dropTime: number
    dropInterval: number
    stats: TetrisLineStats
    needsRedraw: boolean
}

// Extended config for Tetris game (extends BaseGameConfig)
export interface TetrisConfig extends BaseGameConfig {
    boardWidth: number
    boardHeight: number
    blockSize: number
    gameWidth: number
    gameHeight: number
    nextCanvasSize: number
    startingLevel: number
    baseDropInterval: number
    pieces: { [key: string]: { shape: number[][]; color: number } }
    pieceTypes: string[]
    colors: { [key: string]: number }
    backgroundColor: number
    gridColor: number
}

// Extended stats for Tetris game (extends BaseGameStats)
export interface TetrisStats extends BaseGameStats {
    lines: number
    level: number
    pieces: number
    singles: number
    doubles: number
    triples: number
    tetrises: number
    consecutiveLineClears: number
}
