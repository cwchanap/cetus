// Types for Memory Matrix game
export interface Position {
    row: number
    col: number
}

export interface Card {
    id: string
    shape: string
    color: string
    isFlipped: boolean
    isMatched: boolean
    position: Position
}

export interface GameState {
    board: Card[][]
    flippedCards: Card[]
    matchedPairs: number
    totalPairs: number
    score: number
    timeLeft: number
    gameOver: boolean
    gameWon: boolean
    gameStarted: boolean
    isProcessing: boolean // Prevents clicking during card comparison
}

export interface GameStats {
    matchesFound: number
    totalAttempts: number
    timeElapsed: number
    accuracy: number // percentage of successful matches
}

export interface GameConstants {
    BOARD_ROWS: number
    BOARD_COLS: number
    GAME_DURATION: number // in seconds
    FLIP_DELAY: number // delay before flipping cards back
    SHAPES: string[]
    COLORS: string[]
    POINTS_PER_MATCH: number
    TIME_BONUS_MULTIPLIER: number
}
