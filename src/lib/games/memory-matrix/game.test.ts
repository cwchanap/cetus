import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryMatrixGame } from './game'
import { CONSTANTS } from './utils'
import type { Position, Card } from './types'

// Helper function to build a map of shapes to their board positions
function buildShapeMap(board: Card[][]): Map<string, Position[]> {
    const shapeMap = new Map<string, Position[]>()
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            const card = board[r][c]
            if (!shapeMap.has(card.shape)) {
                shapeMap.set(card.shape, [])
            }
            shapeMap.get(card.shape)!.push({ row: r, col: c })
        }
    }
    return shapeMap
}

describe('MemoryMatrixGame', () => {
    let game: MemoryMatrixGame
    let mockStateCallback: ReturnType<typeof vi.fn>
    let mockGameEndCallback: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.useFakeTimers()
        game = new MemoryMatrixGame()
        mockStateCallback = vi.fn()
        mockGameEndCallback = vi.fn()
        game.setStateChangeCallback(mockStateCallback)
        game.setGameEndCallback(mockGameEndCallback)
    })

    afterEach(() => {
        vi.useRealTimers()
        game.destroy()
    })

    describe('Initialization', () => {
        it('should initialize with correct default state', () => {
            const state = game.getGameState()
            const stats = game.getGameStats()

            expect(state.matchedPairs).toBe(0)
            expect(state.totalPairs).toBe(
                (CONSTANTS.BOARD_ROWS * CONSTANTS.BOARD_COLS) / 2
            )
            expect(state.score).toBe(0)
            expect(state.timeLeft).toBe(CONSTANTS.GAME_DURATION)
            expect(state.gameOver).toBe(false)
            expect(state.gameWon).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(state.isProcessing).toBe(false)
            expect(state.flippedCards).toHaveLength(0)

            expect(stats.matchesFound).toBe(0)
            expect(stats.totalAttempts).toBe(0)
            expect(stats.timeElapsed).toBe(0)
            expect(stats.accuracy).toBe(0)
        })

        it('should create a valid board with correct dimensions', () => {
            const state = game.getGameState()
            expect(state.board).toHaveLength(CONSTANTS.BOARD_ROWS)

            state.board.forEach((row, rowIndex) => {
                expect(row).toHaveLength(CONSTANTS.BOARD_COLS)
                row.forEach((card, colIndex) => {
                    expect(card.position).toEqual({
                        row: rowIndex,
                        col: colIndex,
                    })
                    expect(card.isFlipped).toBe(false)
                    expect(card.isMatched).toBe(false)
                    expect(typeof card.id).toBe('string')
                    expect(typeof card.shape).toBe('string')
                    expect(typeof card.color).toBe('string')
                })
            })
        })

        it('should create valid card pairs', () => {
            const state = game.getGameState()
            const allCards = state.board.flat()
            const cardsByShape: Record<string, typeof allCards> = {}

            // Group cards by shape
            allCards.forEach(card => {
                if (!cardsByShape[card.shape]) {
                    cardsByShape[card.shape] = []
                }
                cardsByShape[card.shape].push(card)
            })

            // Each shape should have an even number of cards (multiples of 2)
            Object.values(cardsByShape).forEach(cards => {
                expect(cards.length % 2).toBe(0)
                // Verify all cards of same shape have the same shape property
                const firstShape = cards[0].shape
                cards.forEach(card => {
                    expect(card.shape).toBe(firstShape)
                })
                // Verify all cards have unique IDs
                const ids = cards.map(card => card.id)
                expect(new Set(ids).size).toBe(ids.length)
            })
        })
    })

    describe('Game Flow', () => {
        it('should start game correctly', () => {
            game.startGame()

            const state = game.getGameState()
            expect(state.gameStarted).toBe(true)
            expect(mockStateCallback).toHaveBeenCalledWith(
                state,
                expect.any(Object)
            )
        })

        it('should handle timer countdown', () => {
            game.startGame()

            // Fast-forward 1 second
            vi.advanceTimersByTime(1000)

            const state = game.getGameState()
            const stats = game.getGameStats()
            expect(state.timeLeft).toBe(CONSTANTS.GAME_DURATION - 1)
            expect(stats.timeElapsed).toBe(1)
            expect(mockStateCallback).toHaveBeenCalled()
        })

        it('should end game when time runs out', () => {
            game.startGame()

            // Fast-forward to end of game
            vi.advanceTimersByTime(CONSTANTS.GAME_DURATION * 1000)

            const state = game.getGameState()
            expect(state.gameOver).toBe(true)
            expect(state.gameWon).toBe(false)
            expect(mockGameEndCallback).toHaveBeenCalledWith(
                0,
                expect.any(Object)
            )
        })

        it('should reset game correctly', () => {
            game.startGame()
            vi.advanceTimersByTime(5000)

            game.resetGame()

            const state = game.getGameState()
            const stats = game.getGameStats()

            expect(state.gameStarted).toBe(false)
            expect(state.gameOver).toBe(false)
            expect(state.timeLeft).toBe(CONSTANTS.GAME_DURATION)
            expect(state.score).toBe(0)
            expect(stats.timeElapsed).toBe(0)
            expect(stats.totalAttempts).toBe(0)
        })
    })

    describe('Card Flipping Logic', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should flip card successfully when valid', () => {
            const position: Position = { row: 0, col: 0 }
            const result = game.flipCard(position)

            expect(result).toBe(true)

            const state = game.getGameState()
            const card = state.board[0][0]
            expect(card.isFlipped).toBe(true)
            expect(state.flippedCards).toHaveLength(1)
            expect(state.flippedCards[0]).toBe(card)
        })

        it('should not flip already flipped card', () => {
            const position: Position = { row: 0, col: 0 }

            // Flip once
            game.flipCard(position)
            const result = game.flipCard(position)

            expect(result).toBe(false)

            const state = game.getGameState()
            expect(state.flippedCards).toHaveLength(1)
        })

        it('should not flip matched card', () => {
            const state = game.getGameState()
            const card = state.board[0][0]
            card.isMatched = true

            const result = game.flipCard({ row: 0, col: 0 })

            expect(result).toBe(false)
            expect(state.flippedCards).toHaveLength(0)
        })

        it('should not flip when game not started', () => {
            game.resetGame() // Reset to stop the game

            const result = game.flipCard({ row: 0, col: 0 })

            expect(result).toBe(false)
        })

        it('should not flip when game is over', () => {
            game.startGame()
            game.endGameEarly() // End the game to set gameOver = true

            const result = game.flipCard({ row: 0, col: 0 })

            expect(result).toBe(false)
        })

        it('should not flip when processing', () => {
            game.startGame()

            // Flip two cards to trigger processing state
            game.flipCard({ row: 0, col: 0 })
            game.flipCard({ row: 0, col: 1 })

            // Game should now be in processing state
            const state = game.getGameState()
            expect(state.isProcessing).toBe(true)

            // Try to flip another card while processing
            const result = game.flipCard({ row: 0, col: 2 })

            expect(result).toBe(false)
        })

        it('should not flip when two cards already flipped', () => {
            // Flip two cards
            game.flipCard({ row: 0, col: 0 })
            game.flipCard({ row: 0, col: 1 })

            const result = game.flipCard({ row: 0, col: 2 })

            expect(result).toBe(false)
        })
    })

    describe('Match Detection', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should process flipped cards after delay', () => {
            // Flip two cards
            game.flipCard({ row: 0, col: 0 })
            game.flipCard({ row: 0, col: 1 })

            const state = game.getGameState()
            expect(state.isProcessing).toBe(true)

            // Process the match check
            vi.advanceTimersByTime(CONSTANTS.FLIP_DELAY)

            const updatedState = game.getGameState()
            expect(updatedState.isProcessing).toBe(false)
            expect(updatedState.flippedCards).toHaveLength(0)
        })

        it('should detect matching cards and increment matchedPairs', () => {
            // Find two matching cards (same shape) on the board
            const board = game.getGameState().board
            const shapeMap = buildShapeMap(board)
            const positions = [...shapeMap.values()][0]

            game.flipCard(positions[0])
            game.flipCard(positions[1])
            vi.advanceTimersByTime(CONSTANTS.FLIP_DELAY)

            const state = game.getGameState()
            expect(state.matchedPairs).toBe(1)
            expect(game.getGameStats().matchesFound).toBe(1)
        })
    })

    describe('Game End Conditions', () => {
        beforeEach(() => {
            game.startGame()
        })

        it('should end game early when requested', () => {
            game.endGameEarly()

            const state = game.getGameState()
            expect(state.gameOver).toBe(true)
            expect(state.gameWon).toBe(false)
            expect(mockGameEndCallback).toHaveBeenCalledWith(
                0,
                expect.any(Object)
            )
        })

        it('should win game and apply time bonus when all pairs are matched', () => {
            // Build map: shape → all board positions with that shape
            const board = game.getGameState().board
            const shapeMap = buildShapeMap(board)
            // Get base score before winning
            const baseScore = game.getGameState().score
            const timeRemainingBefore = game.getGameState().timeLeft

            // Flip all cards 2 at a time (any two same-shape cards match)
            for (const positions of shapeMap.values()) {
                for (let i = 0; i < positions.length; i += 2) {
                    game.flipCard(positions[i])
                    game.flipCard(positions[i + 1])
                    vi.advanceTimersByTime(CONSTANTS.FLIP_DELAY)
                }
            }

            const state = game.getGameState()
            expect(state.gameWon).toBe(true)
            expect(state.gameOver).toBe(true)
            expect(mockGameEndCallback).toHaveBeenCalled()

            // Verify time bonus was applied: final score should be > baseScore + match points
            // The callback should receive the final score with time bonus
            const finalScoreArg = mockGameEndCallback.mock.calls[0][0]
            const expectedMinScore =
                baseScore +
                timeRemainingBefore * CONSTANTS.TIME_BONUS_MULTIPLIER
            expect(finalScoreArg).toBeGreaterThanOrEqual(expectedMinScore)
        })
    })

    describe('State Management', () => {
        it('should return deep copies of state and stats', () => {
            const state1 = game.getGameState()
            const state2 = game.getGameState()

            expect(state1).not.toBe(state2) // Different objects
            expect(state1).toEqual(state2) // Same content

            const stats1 = game.getGameStats()
            const stats2 = game.getGameStats()

            expect(stats1).not.toBe(stats2) // Different objects
            expect(stats1).toEqual(stats2) // Same content
        })

        it('should properly clean up timers on destroy', () => {
            game.startGame()

            const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

            game.destroy()

            expect(clearIntervalSpy).toHaveBeenCalled()
        })
    })
})
