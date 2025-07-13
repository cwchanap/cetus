import type { Card, Position, GameConstants } from './types'

// Game constants
export const CONSTANTS: GameConstants = {
    BOARD_ROWS: 6,
    BOARD_COLS: 8,
    GAME_DURATION: 60, // 60 seconds
    FLIP_DELAY: 700, // 0.7 seconds
    SHAPES: ['🔵', '🔺', '🔶', '⭐', '❤️', '🟢', '🔴', '🟡'], // 8 different shapes
    COLORS: [
        '#3B82F6',
        '#EF4444',
        '#10B981',
        '#F59E0B',
        '#8B5CF6',
        '#EC4899',
        '#14B8A6',
        '#F97316',
    ],
    POINTS_PER_MATCH: 100,
    TIME_BONUS_MULTIPLIER: 5,
}

// Shuffle array utility
export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}

// Generate unique card pairs
export function generateCardPairs(): Card[] {
    const totalCards = CONSTANTS.BOARD_ROWS * CONSTANTS.BOARD_COLS
    const totalPairs = totalCards / 2
    const cards: Card[] = []

    // Create pairs of cards with same shape
    for (let i = 0; i < totalPairs; i++) {
        const shape = CONSTANTS.SHAPES[i % CONSTANTS.SHAPES.length]
        const baseId = `card-${i}`

        // Create two identical cards for each pair
        for (let j = 0; j < 2; j++) {
            cards.push({
                id: `${baseId}-${j}`,
                shape,
                color: CONSTANTS.COLORS[i % CONSTANTS.COLORS.length],
                isFlipped: false,
                isMatched: false,
                position: { row: 0, col: 0 }, // Will be set when placing on board
            })
        }
    }

    return shuffleArray(cards)
}

// Create game board from cards
export function createGameBoard(cards: Card[]): Card[][] {
    const board: Card[][] = []
    let cardIndex = 0

    for (let row = 0; row < CONSTANTS.BOARD_ROWS; row++) {
        board[row] = []
        for (let col = 0; col < CONSTANTS.BOARD_COLS; col++) {
            const card = cards[cardIndex]
            card.position = { row, col }
            board[row][col] = card
            cardIndex++
        }
    }

    return board
}

// Check if two cards match
export function cardsMatch(card1: Card, card2: Card): boolean {
    return card1.shape === card2.shape && card1.id !== card2.id
}

// Calculate final score with time bonus
export function calculateFinalScore(
    baseScore: number,
    timeLeft: number
): number {
    const timeBonus = timeLeft * CONSTANTS.TIME_BONUS_MULTIPLIER
    return baseScore + timeBonus
}

// Format time display
export function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Get card at position
export function getCardAt(board: Card[][], position: Position): Card | null {
    if (
        position.row >= 0 &&
        position.row < board.length &&
        position.col >= 0 &&
        position.col < board[0].length
    ) {
        return board[position.row][position.col]
    }
    return null
}

// Check if game is won
export function isGameWon(board: Card[][]): boolean {
    return board.flat().every(card => card.isMatched)
}

// Calculate accuracy percentage
export function calculateAccuracy(matches: number, attempts: number): number {
    if (attempts === 0) {
        return 0
    }
    return Math.round((matches / attempts) * 100)
}
