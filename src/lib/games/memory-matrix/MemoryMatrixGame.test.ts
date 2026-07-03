import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    MemoryMatrixGame,
    DEFAULT_MEMORY_MATRIX_CONFIG,
} from './MemoryMatrixGame'
import { CONSTANTS } from './utils'
import type { Position, Card } from './types'

// Mock the score service so ScoreManager.saveFinalScore doesn't hit network
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

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

    beforeEach(() => {
        vi.useFakeTimers()
        // Stub fetch so ScoreManager score save resolves cleanly
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
        game = new MemoryMatrixGame()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        game.destroy()
    })

    describe('Initialization', () => {
        it('should initialize with correct default state', () => {
            const state = game.getState()

            expect(state.matchedPairs).toBe(0)
            expect(state.totalPairs).toBe(
                (CONSTANTS.BOARD_ROWS * CONSTANTS.BOARD_COLS) / 2
            )
            expect(state.score).toBe(0)
            expect(state.timeRemaining).toBe(CONSTANTS.GAME_DURATION)
            expect(state.isGameOver).toBe(false)
            expect(state.gameWon).toBe(false)
            expect(state.gameStarted).toBe(false)
            expect(state.isActive).toBe(false)
            expect(state.isProcessing).toBe(false)
            expect(state.flippedCards).toHaveLength(0)
            expect(state.totalAttempts).toBe(0)
            expect(state.matchesFound).toBe(0)
            expect(state.accuracy).toBe(0)
        })

        it('should create a valid board with correct dimensions', () => {
            const state = game.getState()
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
                })
            })
        })

        it('should respect custom board dimensions via config', () => {
            const small = new MemoryMatrixGame({ boardRows: 2, boardCols: 2 })
            const state = small.getState()
            expect(state.board).toHaveLength(2)
            expect(state.totalPairs).toBe(2)
            small.destroy()
        })
    })

    describe('Game Flow', () => {
        it('should start game correctly', () => {
            game.start()

            const state = game.getState()
            expect(state.gameStarted).toBe(true)
            expect(state.isActive).toBe(true)
        })

        it('should handle timer countdown', () => {
            game.start()

            vi.advanceTimersByTime(1000)

            const state = game.getState()
            expect(state.timeRemaining).toBe(CONSTANTS.GAME_DURATION - 1)
        })

        it('should end game when time runs out', async () => {
            game.start()

            await vi.advanceTimersByTimeAsync(
                CONSTANTS.GAME_DURATION * 1000 + 100
            )
            await Promise.resolve()
            await Promise.resolve()

            const state = game.getState()
            expect(state.isGameOver).toBe(true)
            expect(state.gameWon).toBe(false)
        })

        it('should reset game correctly', () => {
            game.start()
            vi.advanceTimersByTime(5000)

            game.reset()

            const state = game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.timeRemaining).toBe(CONSTANTS.GAME_DURATION)
            expect(state.score).toBe(0)
            expect(state.totalAttempts).toBe(0)
        })
    })

    describe('Card Flipping Logic', () => {
        beforeEach(() => {
            game.start()
        })

        it('should flip card successfully when valid', () => {
            const position: Position = { row: 0, col: 0 }
            const result = game.flipCard(position)

            expect(result).toBe(true)

            const state = game.getState()
            expect(state.board[0][0].isFlipped).toBe(true)
            expect(state.flippedCards).toHaveLength(1)
        })

        it('should not flip already flipped card', () => {
            game.flipCard({ row: 0, col: 0 })
            const result = game.flipCard({ row: 0, col: 0 })

            expect(result).toBe(false)
        })

        it('should not flip matched card', () => {
            const state = game.getState()
            state.board[0][0].isMatched = true

            const result = game.flipCard({ row: 0, col: 0 })

            expect(result).toBe(false)
        })

        it('should not flip when game not started', () => {
            game.reset()

            const result = game.flipCard({ row: 0, col: 0 })

            expect(result).toBe(false)
        })

        it('should not flip when game is over', async () => {
            await game.end()

            const result = game.flipCard({ row: 0, col: 0 })

            expect(result).toBe(false)
        })

        it('should not flip when processing (two cards flipped)', () => {
            game.flipCard({ row: 0, col: 0 })
            game.flipCard({ row: 0, col: 1 })

            const state = game.getState()
            expect(state.isProcessing).toBe(true)

            const result = game.flipCard({ row: 0, col: 2 })

            expect(result).toBe(false)
        })

        it('should not flip more than two cards', () => {
            game.flipCard({ row: 0, col: 0 })
            game.flipCard({ row: 0, col: 1 })

            const result = game.flipCard({ row: 0, col: 2 })

            expect(result).toBe(false)
        })
    })

    describe('Match Detection', () => {
        beforeEach(() => {
            game.start()
        })

        it('should process flipped cards after delay', () => {
            game.flipCard({ row: 0, col: 0 })
            game.flipCard({ row: 0, col: 1 })

            const state = game.getState()
            expect(state.isProcessing).toBe(true)
            expect(state.totalAttempts).toBe(1)

            vi.advanceTimersByTime(CONSTANTS.FLIP_DELAY)

            const updatedState = game.getState()
            expect(updatedState.isProcessing).toBe(false)
            expect(updatedState.flippedCards).toHaveLength(0)
        })

        it('should detect matching cards and award score', () => {
            const board = game.getState().board
            const shapeMap = buildShapeMap(board)
            const positions = [...shapeMap.values()][0]

            game.flipCard(positions[0])
            game.flipCard(positions[1])
            vi.advanceTimersByTime(CONSTANTS.FLIP_DELAY)

            const state = game.getState()
            expect(state.matchedPairs).toBe(1)
            expect(state.matchesFound).toBe(1)
            expect(state.score).toBe(CONSTANTS.POINTS_PER_MATCH)
            expect(state.accuracy).toBe(100)
        })

        it('should flip cards back when they do not match', () => {
            const board = game.getState().board
            const shapeMap = buildShapeMap(board)
            const allShapes = [...shapeMap.keys()]
            const pos1 = shapeMap.get(allShapes[0])![0]
            const pos2 = shapeMap.get(allShapes[1])![0]

            game.flipCard(pos1)
            game.flipCard(pos2)
            vi.advanceTimersByTime(CONSTANTS.FLIP_DELAY)

            const state = game.getState()
            expect(state.matchedPairs).toBe(0)
            expect(state.board[pos1.row][pos1.col].isFlipped).toBe(false)
            expect(state.board[pos2.row][pos2.col].isFlipped).toBe(false)
            expect(state.accuracy).toBe(0)
        })
    })

    describe('Game End Conditions', () => {
        beforeEach(() => {
            game.start()
        })

        it('should end game early via end()', async () => {
            await game.end()

            const state = game.getState()
            expect(state.isGameOver).toBe(true)
            expect(state.gameWon).toBe(false)
        })

        it('should win game and apply time bonus when all pairs are matched', async () => {
            const board = game.getState().board
            const shapeMap = buildShapeMap(board)

            for (const positions of shapeMap.values()) {
                for (let i = 0; i < positions.length; i += 2) {
                    game.flipCard(positions[i])
                    game.flipCard(positions[i + 1])
                    vi.advanceTimersByTime(CONSTANTS.FLIP_DELAY)
                }
            }

            await Promise.resolve()
            await Promise.resolve()

            const state = game.getState()
            expect(state.gameWon).toBe(true)
            expect(state.isGameOver).toBe(true)

            // Final score = matches * POINTS_PER_MATCH + time bonus (remaining * 5)
            // Time bonus is only applied on a win (legacy behavior).
            const matchPoints = state.totalPairs * CONSTANTS.POINTS_PER_MATCH
            const expectedScore =
                matchPoints +
                state.timeRemaining * CONSTANTS.TIME_BONUS_MULTIPLIER
            expect(state.score).toBe(expectedScore)
            expect(state.score).toBeGreaterThan(matchPoints)
        })
    })

    describe('getGameData (Task 3.2 contract)', () => {
        it('should expose matchesFound, moves, perfectGame', () => {
            // Access protected method via unknown cast for testing
            const data = (
                game as unknown as {
                    getGameData: () => Record<string, unknown>
                }
            ).getGameData()

            expect(data).toHaveProperty('matchesFound', 0)
            expect(data).toHaveProperty('moves', 0)
            expect(data).toHaveProperty('perfectGame', false)
        })

        it('should mark perfectGame true when accuracy is 100%', () => {
            game.start()
            const board = game.getState().board
            const shapeMap = buildShapeMap(board)
            const positions = [...shapeMap.values()][0]

            game.flipCard(positions[0])
            game.flipCard(positions[1])
            vi.advanceTimersByTime(CONSTANTS.FLIP_DELAY)

            const data = (
                game as unknown as {
                    getGameData: () => Record<string, unknown>
                }
            ).getGameData()

            expect(data).toEqual({
                matchesFound: 1,
                moves: 1,
                perfectGame: true,
            })
        })
    })

    describe('State Management', () => {
        it('should return deep copies of state', () => {
            const state1 = game.getState()
            const state2 = game.getState()

            expect(state1).not.toBe(state2)
            expect(state1).toEqual(state2)
        })

        it('should clear match timeout on cleanup', () => {
            game.start()
            game.flipCard({ row: 0, col: 0 })
            game.flipCard({ row: 0, col: 1 })

            const clearSpy = vi.spyOn(global, 'clearTimeout')
            game.cleanup()

            expect(clearSpy).toHaveBeenCalled()
        })
    })

    describe('DEFAULT_MEMORY_MATRIX_CONFIG', () => {
        it('should match CONSTANTS', () => {
            expect(DEFAULT_MEMORY_MATRIX_CONFIG.duration).toBe(
                CONSTANTS.GAME_DURATION
            )
            expect(DEFAULT_MEMORY_MATRIX_CONFIG.boardRows).toBe(
                CONSTANTS.BOARD_ROWS
            )
            expect(DEFAULT_MEMORY_MATRIX_CONFIG.boardCols).toBe(
                CONSTANTS.BOARD_COLS
            )
            expect(DEFAULT_MEMORY_MATRIX_CONFIG.flipDelay).toBe(
                CONSTANTS.FLIP_DELAY
            )
            expect(DEFAULT_MEMORY_MATRIX_CONFIG.pointsPerMatch).toBe(
                CONSTANTS.POINTS_PER_MATCH
            )
        })
    })
})
