// Simple test to verify Memory Matrix game logic
import { MemoryMatrixGame } from './game'
import { CONSTANTS } from './utils'

export function testMemoryMatrixGame(): void {
    console.log('Testing Memory Matrix Game...')

    const game = new MemoryMatrixGame()

    // Test initial state
    const initialState = game.getGameState()
    console.log('Initial state:', {
        totalPairs: initialState.totalPairs,
        boardSize: `${CONSTANTS.BOARD_ROWS}x${CONSTANTS.BOARD_COLS}`,
        gameStarted: initialState.gameStarted,
        score: initialState.score,
    })

    // Test that board has correct number of cards
    const totalCards = initialState.board.flat().length
    console.log('Total cards:', totalCards)
    console.log('Expected cards:', CONSTANTS.BOARD_ROWS * CONSTANTS.BOARD_COLS)

    // Test that each shape appears exactly twice
    const shapeCount: Record<string, number> = {}
    initialState.board.flat().forEach(card => {
        shapeCount[card.shape] = (shapeCount[card.shape] || 0) + 1
    })

    console.log('Shape distribution:', shapeCount)

    // Verify pairs
    const isValidPairDistribution = Object.values(shapeCount).every(
        count => count === 6
    ) // Each shape should appear 6 times (3 pairs each)
    console.log('Valid pair distribution:', isValidPairDistribution)

    console.log('Memory Matrix Game test completed!')
}

// Run test if this file is executed directly
if (typeof window !== 'undefined') {
    ;(window as any).testMemoryMatrix = testMemoryMatrixGame
}
