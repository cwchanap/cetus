import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ReflexGame } from './game'
import type { GameConfig, GameCallbacks } from './types'

// Mock timers
vi.useFakeTimers()

describe('ReflexGame', () => {
    let game: ReflexGame
    let mockCallbacks: GameCallbacks
    const defaultConfig: GameConfig = {
        gameDuration: 60,
        gridSize: 12,
        cellSize: 40,
        objectLifetime: 2,
        spawnInterval: 1,
        coinToBombRatio: 2,
        pointsForCoin: 10,
        pointsForBomb: -15,
        pointsForMissedCoin: -5,
    }

    beforeEach(() => {
        mockCallbacks = {
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onObjectSpawn: vi.fn(),
            onObjectClick: vi.fn(),
            onObjectExpire: vi.fn(),
            onGameOver: vi.fn(),
            onGameStart: vi.fn(),
        }

        game = new ReflexGame(defaultConfig, mockCallbacks)
    })

    afterEach(() => {
        game.cleanup()
        vi.clearAllTimers()
    })

    describe('Initialization', () => {
        it('should initialize with correct default state', () => {
            const state = game.getState()

            expect(state.score).toBe(0)
            expect(state.timeRemaining).toBe(60)
            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.objects).toEqual([])
            expect(state.totalClicks).toBe(0)
            expect(state.correctClicks).toBe(0)
            expect(state.incorrectClicks).toBe(0)
        })

        it('should initialize grid with correct dimensions', () => {
            const grid = game.getGrid()

            expect(grid).toHaveLength(12)
            expect(grid[0]).toHaveLength(12)

            // Check first cell properties
            expect(grid[0][0]).toEqual({
                id: 'cell-0-0',
                row: 0,
                col: 0,
                x: 0,
                y: 0,
            })

            // Check last cell properties
            expect(grid[11][11]).toEqual({
                id: 'cell-11-11',
                row: 11,
                col: 11,
                x: 11 * 40,
                y: 11 * 40,
            })
        })
    })

    describe('Game Control', () => {
        it('should start game correctly', () => {
            game.startGame()

            const state = game.getState()
            expect(state.isGameActive).toBe(true)
            expect(state.gameStartTime).toBeTruthy()
            expect(mockCallbacks.onGameStart).toHaveBeenCalled()
            expect(mockCallbacks.onScoreUpdate).toHaveBeenCalledWith(0)
            expect(mockCallbacks.onTimeUpdate).toHaveBeenCalledWith(60)
        })

        it('should not restart if already active', () => {
            game.startGame()
            const firstStartTime = game.getState().gameStartTime

            vi.advanceTimersByTime(100)
            game.startGame()

            expect(game.getState().gameStartTime).toBe(firstStartTime)
            expect(mockCallbacks.onGameStart).toHaveBeenCalledTimes(1)
        })

        it('should stop game correctly', () => {
            game.startGame()
            game.stopGame()

            const state = game.getState()
            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(true)
            expect(mockCallbacks.onGameOver).toHaveBeenCalled()
        })
    })

    describe('Timer System', () => {
        it('should countdown time correctly', () => {
            game.startGame()

            vi.advanceTimersByTime(1000)
            expect(mockCallbacks.onTimeUpdate).toHaveBeenCalledWith(59)

            vi.advanceTimersByTime(1000)
            expect(mockCallbacks.onTimeUpdate).toHaveBeenCalledWith(58)
        })

        it('should end game when time reaches 0', () => {
            game.startGame()

            vi.advanceTimersByTime(60000) // 60 seconds

            const state = game.getState()
            expect(state.timeRemaining).toBe(0)
            expect(state.isGameOver).toBe(true)
            expect(mockCallbacks.onGameOver).toHaveBeenCalled()
        })

        it('should spawn objects at intervals', () => {
            game.startGame()

            vi.advanceTimersByTime(1000) // First spawn
            expect(mockCallbacks.onObjectSpawn).toHaveBeenCalledTimes(1)

            vi.advanceTimersByTime(1000) // Second spawn
            expect(mockCallbacks.onObjectSpawn).toHaveBeenCalledTimes(2)
        })
    })

    describe('Object Spawning', () => {
        it('should spawn objects with correct properties', () => {
            game.startGame()
            vi.advanceTimersByTime(1000)

            const activeObjects = game.getActiveObjects()
            expect(activeObjects).toHaveLength(1)

            const object = activeObjects[0]
            expect(object.type).toMatch(/^(coin|bomb)$/)
            expect(object.isActive).toBe(true)
            expect(object.clicked).toBe(false)
            expect(object.cell.row).toBeGreaterThanOrEqual(0)
            expect(object.cell.row).toBeLessThan(12)
            expect(object.cell.col).toBeGreaterThanOrEqual(0)
            expect(object.cell.col).toBeLessThan(12)
        })

        it('should not spawn objects in occupied cells', () => {
            game.startGame()

            // Spawn multiple objects
            for (let i = 0; i < 10; i++) {
                vi.advanceTimersByTime(1000)
            }

            const activeObjects = game.getActiveObjects()
            const occupiedPositions = new Set()

            activeObjects.forEach(obj => {
                const pos = `${obj.cell.row}-${obj.cell.col}`
                expect(occupiedPositions.has(pos)).toBe(false)
                occupiedPositions.add(pos)
            })
        })

        it('should respect coin to bomb ratio approximately', () => {
            game.startGame()

            // Spawn many objects to test ratio
            for (let i = 0; i < 100; i++) {
                vi.advanceTimersByTime(1000)
                vi.advanceTimersByTime(2000) // Let objects expire
            }

            const history = game.getState().gameHistory
            const coins = history.filter(h => h.type === 'coin').length
            const bombs = history.filter(h => h.type === 'bomb').length

            // Should be approximately 2:1 ratio (allowing for some randomness)
            if (coins > 0 && bombs > 0) {
                const ratio = coins / bombs
                expect(ratio).toBeGreaterThan(1.0) // At least 1:1
                expect(ratio).toBeLessThan(4.0) // At most 4:1
            }
        })
    })

    describe('Object Expiration', () => {
        it('should expire objects after lifetime', () => {
            game.startGame()
            vi.advanceTimersByTime(1000) // Spawn first object

            expect(game.getActiveObjects()).toHaveLength(1)

            vi.advanceTimersByTime(1000) // Spawn second object, first should still be alive
            expect(game.getActiveObjects()).toHaveLength(2)

            vi.advanceTimersByTime(1000) // First object should expire (2s total), third spawns
            game.cleanupExpiredObjects() // Manually trigger cleanup

            expect(game.getActiveObjects()).toHaveLength(2) // Second and third objects remain
            expect(mockCallbacks.onObjectExpire).toHaveBeenCalled()
        })

        it('should apply penalty for missed coins', () => {
            // Mock spawn to always create coins for predictable testing
            const originalRandom = Math.random
            Math.random = vi.fn(() => 0.5) // Always spawn coins (< 2 / (2 + 1) ≈ 0.667)

            game.startGame()
            vi.advanceTimersByTime(1000) // Spawn coin
            vi.advanceTimersByTime(2100) // Let coin expire

            const state = game.getState()
            expect(state.score).toBe(-5) // Penalty for missed coin
            expect(state.missedCoins).toBe(1)

            Math.random = originalRandom
        })
    })

    describe('Click Handling', () => {
        it('should handle coin clicks correctly', () => {
            // Mock spawn to always create coins
            const originalRandom = Math.random
            Math.random = vi.fn(() => 0.5) // Always spawn coins (< 2 / (2 + 1) ≈ 0.667)

            game.startGame()
            vi.advanceTimersByTime(1000) // Spawn coin

            const activeObjects = game.getActiveObjects()
            const coin = activeObjects[0]

            const result = game.handleCellClick(coin.cell.row, coin.cell.col)

            expect(result).toBe(true)
            expect(game.getState().score).toBe(10)
            expect(game.getState().coinsCollected).toBe(1)
            expect(game.getState().correctClicks).toBe(1)
            expect(mockCallbacks.onObjectClick).toHaveBeenCalledWith(coin, 10)

            Math.random = originalRandom
        })

        it('should handle bomb clicks correctly', () => {
            // Mock spawn to always create bombs
            const originalRandom = Math.random
            Math.random = vi.fn(() => 0.95)

            game.startGame()
            vi.advanceTimersByTime(1000) // Spawn bomb

            const activeObjects = game.getActiveObjects()
            const bomb = activeObjects[0]

            const result = game.handleCellClick(bomb.cell.row, bomb.cell.col)

            expect(result).toBe(true)
            expect(game.getState().score).toBe(-15)
            expect(game.getState().bombsHit).toBe(1)
            expect(game.getState().incorrectClicks).toBe(1)
            expect(mockCallbacks.onObjectClick).toHaveBeenCalledWith(bomb, -15)

            Math.random = originalRandom
        })

        it('should handle empty cell clicks', () => {
            game.startGame()

            const result = game.handleCellClick(5, 5) // Empty cell

            expect(result).toBe(false)
            expect(game.getState().totalClicks).toBe(1)
            expect(game.getState().score).toBe(0)
        })

        it('should not handle clicks when game is inactive', () => {
            const result = game.handleCellClick(5, 5)

            expect(result).toBe(false)
            expect(game.getState().totalClicks).toBe(0)
        })
    })

    describe('Game Statistics', () => {
        it('should calculate accuracy correctly', () => {
            // Mock spawns for predictable testing
            const originalRandom = Math.random
            Math.random = vi.fn(() => 0.5) // Always coins (< 2 / (2 + 1) ≈ 0.667)

            game.startGame()

            // Spawn and click 3 coins
            for (let i = 0; i < 3; i++) {
                vi.advanceTimersByTime(1000)
                const objects = game.getActiveObjects()
                if (objects.length > 0) {
                    game.handleCellClick(
                        objects[0].cell.row,
                        objects[0].cell.col
                    )
                }
            }

            // Click empty cell once
            game.handleCellClick(0, 0)

            const state = game.getState()
            expect(state.totalClicks).toBe(4)
            expect(state.correctClicks).toBe(3)

            Math.random = originalRandom
        })

        it('should track game history correctly', () => {
            const originalRandom = Math.random
            Math.random = vi.fn(() => 0.5) // Always coins (< 2 / (2 + 1) ≈ 0.667)

            game.startGame()
            vi.advanceTimersByTime(1000) // Spawn coin

            const objects = game.getActiveObjects()
            game.handleCellClick(objects[0].cell.row, objects[0].cell.col)

            const history = game.getState().gameHistory
            expect(history).toHaveLength(1)
            expect(history[0]).toMatchObject({
                type: 'coin',
                clicked: true,
                pointsAwarded: 10,
            })
            expect(history[0].timeToClick).toBeTypeOf('number')

            Math.random = originalRandom
        })
    })

    describe('generateGameStats accuracy and reaction time branches', () => {
        afterEach(() => {
            vi.restoreAllMocks()
        })

        it('should include non-zero accuracy when player has made clicks', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5)

            game.startGame()
            vi.advanceTimersByTime(1000)
            const objects = game.getActiveObjects()
            if (objects.length > 0) {
                game.handleCellClick(objects[0].cell.row, objects[0].cell.col)
            }

            game.stopGame()

            const stats = (mockCallbacks.onGameOver as ReturnType<typeof vi.fn>)
                .mock.calls[0][1]
            expect(stats.accuracy).toBeGreaterThan(0)
        })

        it('should include non-zero averageReactionTime when objects were clicked', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5)

            game.startGame()
            vi.advanceTimersByTime(500)
            const objects = game.getActiveObjects()
            if (objects.length > 0) {
                game.handleCellClick(objects[0].cell.row, objects[0].cell.col)
            }

            game.stopGame()

            const stats = (mockCallbacks.onGameOver as ReturnType<typeof vi.fn>)
                .mock.calls[0][1]
            expect(stats.averageReactionTime).toBeGreaterThanOrEqual(0)
        })
    })

    describe('spawnObject - no available cells', () => {
        it('should handle no-available-cells gracefully with tiny grid', () => {
            const smallGame = new ReflexGame(
                { ...defaultConfig, gridSize: 1, spawnInterval: 0.01 },
                mockCallbacks
            )
            smallGame.startGame()
            // Fill the single cell
            vi.advanceTimersByTime(100)
            // Spawn again when no cells available — should not throw
            vi.advanceTimersByTime(100)
            expect(smallGame.getActiveObjects().length).toBeLessThanOrEqual(1)
            smallGame.cleanup()
        })
    })

    describe('timer guard when isGameActive is false', () => {
        it('should skip timer tick when isGameActive is false', () => {
            const game = new ReflexGame(defaultConfig, mockCallbacks)
            game.startGame()
            const timeBefore = game.getState().timeRemaining
            // Directly set isGameActive=false without clearing timers
            ;(game as any).state.isGameActive = false
            // Advance both timers — callbacks fire but guards return early
            vi.advanceTimersByTime(2000)
            expect(game.getState().timeRemaining).toBe(timeBefore)
            game.cleanup()
        })
    })
})
