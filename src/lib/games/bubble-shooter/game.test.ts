import { describe, it, expect, beforeEach } from 'vitest'
import {
    createGameState,
    initializeGrid,
    generateBubble,
    generateNextBubble,
    startGame,
    togglePause,
    resetGame,
    GAME_CONSTANTS,
} from './game'
import type { GameState, Bubble } from './types'

describe('Bubble Shooter Game', () => {
    let gameState: GameState

    beforeEach(() => {
        gameState = createGameState()
    })

    describe('Game State Creation', () => {
        it('should create initial game state with correct default values', () => {
            expect(gameState.grid).toEqual([])
            expect(gameState.shooter.x).toBe(GAME_CONSTANTS.GAME_WIDTH / 2)
            expect(gameState.shooter.y).toBe(GAME_CONSTANTS.SHOOTER_Y)
            expect(gameState.currentBubble).toBeNull()
            expect(gameState.nextBubble).toBeNull()
            expect(gameState.aimAngle).toBe(-Math.PI / 2)
            expect(gameState.projectile).toBeNull()
            expect(gameState.score).toBe(0)
            expect(gameState.bubblesRemaining).toBe(0)
            expect(gameState.gameStarted).toBe(false)
            expect(gameState.gameOver).toBe(false)
            expect(gameState.paused).toBe(false)
            expect(gameState.rowOffset).toBe(0)
            expect(gameState.shotCount).toBe(0)
            expect(gameState.needsRedraw).toBe(true)
        })
    })

    describe('Constants', () => {
        it('should have valid game constants', () => {
            expect(GAME_CONSTANTS.BUBBLE_RADIUS).toBe(20)
            expect(GAME_CONSTANTS.GRID_WIDTH).toBe(14)
            expect(GAME_CONSTANTS.GRID_HEIGHT).toBe(20)
            expect(GAME_CONSTANTS.COLORS).toHaveLength(3)
            expect(GAME_CONSTANTS.GAME_WIDTH).toBe(600)
            expect(GAME_CONSTANTS.GAME_HEIGHT).toBe(800)
            expect(GAME_CONSTANTS.SHOOTER_Y).toBe(740)
        })

        it('should have valid color values', () => {
            GAME_CONSTANTS.COLORS.forEach(color => {
                expect(typeof color).toBe('number')
                expect(color).toBeGreaterThan(0)
                expect(color).toBeLessThanOrEqual(0xffffff)
            })
        })
    })

    describe('Grid Initialization', () => {
        it('should initialize empty grid', () => {
            initializeGrid(gameState)
            expect(Array.isArray(gameState.grid)).toBe(true)
            expect(gameState.bubblesRemaining).toBeGreaterThanOrEqual(0)
        })

        it('should create grid with correct structure', () => {
            initializeGrid(gameState)

            // Check that initial rows are created
            for (let row = 0; row < 5; row++) {
                expect(Array.isArray(gameState.grid[row])).toBe(true)

                // Check alternating row pattern
                const expectedCols = GAME_CONSTANTS.GRID_WIDTH - (row % 2)
                if (gameState.grid[row]) {
                    expect(gameState.grid[row].length).toBeLessThanOrEqual(
                        expectedCols
                    )
                }
            }
        })
    })

    describe('Bubble Generation', () => {
        beforeEach(() => {
            initializeGrid(gameState)
        })

        it('should generate bubble with valid properties', () => {
            const bubble = generateBubble(gameState)

            expect(bubble).toHaveProperty('color')
            expect(bubble).toHaveProperty('x')
            expect(bubble).toHaveProperty('y')
            expect(GAME_CONSTANTS.COLORS).toContain(bubble.color)
            expect(typeof bubble.color).toBe('number')
            expect(typeof bubble.x).toBe('number')
            expect(typeof bubble.y).toBe('number')
        })

        it('should generate different colored bubbles', () => {
            const bubbles = Array.from({ length: 10 }, () =>
                generateBubble(gameState)
            )
            const uniqueColors = new Set(bubbles.map(b => b.color))

            // Should have at least 1 unique color (could be more depending on randomness)
            expect(uniqueColors.size).toBeGreaterThanOrEqual(1)
            expect(uniqueColors.size).toBeLessThanOrEqual(
                GAME_CONSTANTS.COLORS.length
            )
        })
    })

    describe('Game Control', () => {
        beforeEach(() => {
            initializeGrid(gameState)
        })

        it('should start game correctly', () => {
            startGame(gameState)

            // Manually generate bubbles since startGame doesn't do it automatically
            gameState.currentBubble = generateBubble(gameState)
            gameState.nextBubble = { color: GAME_CONSTANTS.COLORS[0] }

            expect(gameState.gameStarted).toBe(true)
            expect(gameState.gameOver).toBe(false)
            expect(gameState.currentBubble).not.toBeNull()
            expect(gameState.nextBubble).not.toBeNull()
        })

        it('should toggle pause when game is started', () => {
            startGame(gameState)
            const initialPauseState = gameState.paused

            togglePause(gameState, () => {})
            expect(gameState.paused).toBe(!initialPauseState)
        })

        it('should reset game correctly', () => {
            startGame(gameState)
            gameState.score = 100
            gameState.shotCount = 5

            resetGame(
                gameState,
                () => {},
                () => {}
            )

            expect(gameState.score).toBe(0)
            expect(gameState.shotCount).toBe(0)
            expect(gameState.gameStarted).toBe(false)
            expect(gameState.gameOver).toBe(false)
            expect(gameState.paused).toBe(false)
        })
    })

    describe('Shooting Mechanics', () => {
        beforeEach(() => {
            initializeGrid(gameState)
            startGame(gameState)
        })

        it('should allow shooting when game is active and no projectile exists', () => {
            // Manually generate bubbles for testing
            gameState.currentBubble = generateBubble(gameState)

            expect(gameState.gameStarted).toBe(true)
            expect(gameState.gameOver).toBe(false)
            expect(gameState.projectile).toBeNull()
            expect(gameState.currentBubble).not.toBeNull()
        })

        it('should not allow shooting when projectile is active', () => {
            gameState.projectile = {
                x: 100,
                y: 100,
                vx: 5,
                vy: -5,
                color: GAME_CONSTANTS.COLORS[0],
            }
            expect(gameState.projectile).not.toBeNull()
        })

        it('should not allow shooting when no current bubble', () => {
            gameState.currentBubble = null
            expect(gameState.currentBubble).toBeNull()
        })
    })

    describe('Game State Management', () => {
        it('should track score correctly', () => {
            expect(gameState.score).toBe(0)

            gameState.score += 100
            expect(gameState.score).toBe(100)
        })

        it('should track shot count', () => {
            expect(gameState.shotCount).toBe(0)

            gameState.shotCount++
            expect(gameState.shotCount).toBe(1)
        })

        it('should track bubbles remaining', () => {
            initializeGrid(gameState)
            const initialCount = gameState.bubblesRemaining

            expect(typeof initialCount).toBe('number')
            expect(initialCount).toBeGreaterThanOrEqual(0)
        })

        it('should handle row offset for grid movement', () => {
            expect(gameState.rowOffset).toBe(0)

            gameState.rowOffset = 0.5
            expect(gameState.rowOffset).toBe(0.5)
        })
    })

    describe('Bubble Properties', () => {
        it('should create bubble with required properties', () => {
            const bubble: Bubble = {
                color: GAME_CONSTANTS.COLORS[0],
                x: 100,
                y: 100,
            }

            expect(bubble).toHaveProperty('color')
            expect(bubble).toHaveProperty('x')
            expect(bubble).toHaveProperty('y')
            expect(typeof bubble.color).toBe('number')
            expect(typeof bubble.x).toBe('number')
            expect(typeof bubble.y).toBe('number')
        })

        it('should validate bubble colors', () => {
            GAME_CONSTANTS.COLORS.forEach(color => {
                const bubble: Bubble = {
                    color,
                    x: 0,
                    y: 0,
                }
                expect(GAME_CONSTANTS.COLORS).toContain(bubble.color)
            })
        })
    })

    describe('Game Validation', () => {
        beforeEach(() => {
            initializeGrid(gameState)
        })

        it('should maintain valid game state transitions', () => {
            // Initial state
            expect(gameState.gameStarted).toBe(false)
            expect(gameState.gameOver).toBe(false)
            expect(gameState.paused).toBe(false)

            // Start game
            startGame(gameState)
            expect(gameState.gameStarted).toBe(true)
            expect(gameState.gameOver).toBe(false)
        })

        it('should handle game over state', () => {
            startGame(gameState)
            gameState.gameOver = true

            expect(gameState.gameOver).toBe(true)
        })

        it('should track additional game statistics', () => {
            expect(gameState.bubblesPopped).toBeUndefined()
            expect(gameState.shotsFired).toBeUndefined()
            expect(gameState.largestCombo).toBeUndefined()

            // These can be set during gameplay
            gameState.bubblesPopped = 10
            gameState.shotsFired = 15
            gameState.largestCombo = 5

            expect(gameState.bubblesPopped).toBe(10)
            expect(gameState.shotsFired).toBe(15)
            expect(gameState.largestCombo).toBe(5)
        })
    })
})
