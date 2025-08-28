import { describe, it, expect, beforeEach } from 'vitest'
import {
    shuffleArray,
    generateCardPairs,
    createGameBoard,
    cardsMatch,
    calculateFinalScore,
    formatTime,
    getCardAt,
    isGameWon,
    calculateAccuracy,
    CONSTANTS,
} from './utils'
import type { Card } from './types'

describe('Memory Matrix Utils', () => {
    describe('shuffleArray', () => {
        it('should return array with same length', () => {
            const original = [1, 2, 3, 4, 5]
            const shuffled = shuffleArray(original)

            expect(shuffled).toHaveLength(original.length)
        })

        it('should contain all original elements', () => {
            const original = [1, 2, 3, 4, 5]
            const shuffled = shuffleArray(original)

            original.forEach(item => {
                expect(shuffled).toContain(item)
            })
        })

        it('should not modify original array', () => {
            const original = [1, 2, 3, 4, 5]
            const originalCopy = [...original]
            shuffleArray(original)

            expect(original).toEqual(originalCopy)
        })

        it('should handle empty array', () => {
            const result = shuffleArray([])
            expect(result).toEqual([])
        })

        it('should handle single element array', () => {
            const result = shuffleArray([42])
            expect(result).toEqual([42])
        })
    })

    describe('generateCardPairs', () => {
        it('should generate correct number of cards', () => {
            const cards = generateCardPairs()
            const expectedCount = CONSTANTS.BOARD_ROWS * CONSTANTS.BOARD_COLS

            expect(cards).toHaveLength(expectedCount)
        })

        it('should create pairs of cards', () => {
            const cards = generateCardPairs()
            const cardsByShape = cards.reduce(
                (acc, card) => {
                    if (!acc[card.shape]) {
                        acc[card.shape] = []
                    }
                    acc[card.shape].push(card)
                    return acc
                },
                {} as Record<string, Card[]>
            )

            // Each shape should have an even number of cards (multiples of 2)
            Object.values(cardsByShape).forEach(shapeCards => {
                expect(shapeCards.length % 2).toBe(0)
                // Verify all cards of same shape have the same shape property
                const firstShape = shapeCards[0].shape
                shapeCards.forEach(card => {
                    expect(card.shape).toBe(firstShape)
                })
                // Verify all cards have unique IDs
                const ids = shapeCards.map(card => card.id)
                expect(new Set(ids).size).toBe(ids.length)
            })
        })

        it('should initialize cards with correct default state', () => {
            const cards = generateCardPairs()

            cards.forEach(card => {
                expect(card.isFlipped).toBe(false)
                expect(card.isMatched).toBe(false)
                expect(card.position).toEqual({ row: 0, col: 0 })
                expect(typeof card.id).toBe('string')
                expect(typeof card.shape).toBe('string')
                expect(typeof card.color).toBe('string')
            })
        })
    })

    describe('createGameBoard', () => {
        it('should create board with correct dimensions', () => {
            const cards = generateCardPairs()
            const board = createGameBoard(cards)

            expect(board).toHaveLength(CONSTANTS.BOARD_ROWS)
            board.forEach(row => {
                expect(row).toHaveLength(CONSTANTS.BOARD_COLS)
            })
        })

        it('should assign correct positions to cards', () => {
            const cards = generateCardPairs()
            const board = createGameBoard(cards)

            board.forEach((row, rowIndex) => {
                row.forEach((card, colIndex) => {
                    expect(card.position).toEqual({
                        row: rowIndex,
                        col: colIndex,
                    })
                })
            })
        })

        it('should use all provided cards', () => {
            const cards = generateCardPairs()
            const board = createGameBoard(cards)
            const boardCards = board.flat()

            expect(boardCards).toHaveLength(cards.length)
            cards.forEach(card => {
                expect(boardCards).toContain(card)
            })
        })
    })

    describe('cardsMatch', () => {
        it('should return true for cards with same shape but different ids', () => {
            const card1: Card = {
                id: 'card-1-0',
                shape: '🔵',
                color: '#3B82F6',
                isFlipped: false,
                isMatched: false,
                position: { row: 0, col: 0 },
            }

            const card2: Card = {
                id: 'card-1-1',
                shape: '🔵',
                color: '#3B82F6',
                isFlipped: false,
                isMatched: false,
                position: { row: 0, col: 1 },
            }

            expect(cardsMatch(card1, card2)).toBe(true)
        })

        it('should return false for cards with different shapes', () => {
            const card1: Card = {
                id: 'card-1-0',
                shape: '🔵',
                color: '#3B82F6',
                isFlipped: false,
                isMatched: false,
                position: { row: 0, col: 0 },
            }

            const card2: Card = {
                id: 'card-2-0',
                shape: '🔺',
                color: '#EF4444',
                isFlipped: false,
                isMatched: false,
                position: { row: 0, col: 1 },
            }

            expect(cardsMatch(card1, card2)).toBe(false)
        })

        it('should return false for same card (same id)', () => {
            const card1: Card = {
                id: 'card-1-0',
                shape: '🔵',
                color: '#3B82F6',
                isFlipped: false,
                isMatched: false,
                position: { row: 0, col: 0 },
            }

            expect(cardsMatch(card1, card1)).toBe(false)
        })
    })

    describe('calculateFinalScore', () => {
        it('should add time bonus to base score', () => {
            const baseScore = 1000
            const timeLeft = 30
            const expectedScore =
                baseScore + timeLeft * CONSTANTS.TIME_BONUS_MULTIPLIER

            expect(calculateFinalScore(baseScore, timeLeft)).toBe(expectedScore)
        })

        it('should handle zero time left', () => {
            const baseScore = 1000
            const timeLeft = 0

            expect(calculateFinalScore(baseScore, timeLeft)).toBe(baseScore)
        })

        it('should handle zero base score', () => {
            const baseScore = 0
            const timeLeft = 30
            const expectedScore = timeLeft * CONSTANTS.TIME_BONUS_MULTIPLIER

            expect(calculateFinalScore(baseScore, timeLeft)).toBe(expectedScore)
        })
    })

    describe('formatTime', () => {
        it('should format minutes and seconds correctly', () => {
            expect(formatTime(0)).toBe('0:00')
            expect(formatTime(30)).toBe('0:30')
            expect(formatTime(60)).toBe('1:00')
            expect(formatTime(90)).toBe('1:30')
            expect(formatTime(125)).toBe('2:05')
        })

        it('should pad seconds with leading zero', () => {
            expect(formatTime(5)).toBe('0:05')
            expect(formatTime(65)).toBe('1:05')
        })
    })

    describe('getCardAt', () => {
        let board: Card[][]

        beforeEach(() => {
            const cards = generateCardPairs()
            board = createGameBoard(cards)
        })

        it('should return card at valid position', () => {
            const card = getCardAt(board, { row: 0, col: 0 })

            expect(card).not.toBeNull()
            expect(card?.position).toEqual({ row: 0, col: 0 })
        })

        it('should return null for negative row', () => {
            const card = getCardAt(board, { row: -1, col: 0 })
            expect(card).toBeNull()
        })

        it('should return null for negative col', () => {
            const card = getCardAt(board, { row: 0, col: -1 })
            expect(card).toBeNull()
        })

        it('should return null for row out of bounds', () => {
            const card = getCardAt(board, { row: CONSTANTS.BOARD_ROWS, col: 0 })
            expect(card).toBeNull()
        })

        it('should return null for col out of bounds', () => {
            const card = getCardAt(board, { row: 0, col: CONSTANTS.BOARD_COLS })
            expect(card).toBeNull()
        })
    })

    describe('isGameWon', () => {
        let board: Card[][]

        beforeEach(() => {
            const cards = generateCardPairs()
            board = createGameBoard(cards)
        })

        it('should return false when no cards are matched', () => {
            expect(isGameWon(board)).toBe(false)
        })

        it('should return false when some cards are matched', () => {
            // Match only the first two cards
            board[0][0].isMatched = true
            board[0][1].isMatched = true

            expect(isGameWon(board)).toBe(false)
        })

        it('should return true when all cards are matched', () => {
            // Match all cards
            board.flat().forEach(card => {
                card.isMatched = true
            })

            expect(isGameWon(board)).toBe(true)
        })
    })

    describe('calculateAccuracy', () => {
        it('should return 0 when no attempts made', () => {
            expect(calculateAccuracy(0, 0)).toBe(0)
        })

        it('should calculate percentage correctly', () => {
            expect(calculateAccuracy(1, 2)).toBe(50)
            expect(calculateAccuracy(3, 4)).toBe(75)
            expect(calculateAccuracy(5, 5)).toBe(100)
        })

        it('should return 0 when no matches but attempts made', () => {
            expect(calculateAccuracy(0, 5)).toBe(0)
        })

        it('should round to nearest integer', () => {
            expect(calculateAccuracy(1, 3)).toBe(33) // 33.33... rounded to 33
            expect(calculateAccuracy(2, 3)).toBe(67) // 66.66... rounded to 67
        })
    })

    describe('CONSTANTS', () => {
        it('should have valid board dimensions', () => {
            expect(CONSTANTS.BOARD_ROWS).toBeGreaterThan(0)
            expect(CONSTANTS.BOARD_COLS).toBeGreaterThan(0)
            expect((CONSTANTS.BOARD_ROWS * CONSTANTS.BOARD_COLS) % 2).toBe(0) // Even number for pairs
        })

        it('should have valid game settings', () => {
            expect(CONSTANTS.GAME_DURATION).toBeGreaterThan(0)
            expect(CONSTANTS.FLIP_DELAY).toBeGreaterThan(0)
            expect(CONSTANTS.POINTS_PER_MATCH).toBeGreaterThan(0)
            expect(CONSTANTS.TIME_BONUS_MULTIPLIER).toBeGreaterThan(0)
        })

        it('should have shapes and colors arrays', () => {
            expect(Array.isArray(CONSTANTS.SHAPES)).toBe(true)
            expect(Array.isArray(CONSTANTS.COLORS)).toBe(true)
            expect(CONSTANTS.SHAPES.length).toBeGreaterThan(0)
            expect(CONSTANTS.COLORS.length).toBeGreaterThan(0)
        })
    })
})
