// Types for Tetris game
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

export interface GameStats {
    pieces: number
    singles: number
    doubles: number
    triples: number
    tetrises: number
    consecutiveLineClears: number
}

// Stats passed to onGameOver callback
export interface TetrisEndGameStats {
    lines: number
    level: number
    pieces: number
    singles: number
    doubles: number
    triples: number
    tetrises: number
    consecutiveLineClears: number
}

export interface GameState {
    board: (number | null)[][]
    currentPiece: Piece | null
    nextPiece: Piece | null
    score: number
    level: number
    lines: number
    gameOver: boolean
    paused: boolean
    gameStarted: boolean
    stats: GameStats
    dropTime: number
    dropInterval: number
    needsRedraw: boolean
    onGameOver?: (finalScore: number, stats: TetrisEndGameStats) => void
    piecesPlaced?: number
    tetrises?: number
}

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
