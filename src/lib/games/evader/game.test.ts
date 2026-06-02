import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EvaderGame } from './game'
import type { GameConfig, GameCallbacks, GameObject } from './types'

describe('EvaderGame', () => {
    let game: EvaderGame
    let mockCallbacks: GameCallbacks
    let config: GameConfig

    beforeEach(() => {
        vi.useFakeTimers()

        config = {
            canvasWidth: 800,
            canvasHeight: 600,
            playerSize: 30,
            playerSpeed: 200,
            objectSize: 25,
            objectSpeed: 150,
            gameDuration: 60,
            spawnInterval: 1,
            pointsForCoin: 10,
            pointsForBomb: -20,
            coinToBombRatio: 2,
        }

        mockCallbacks = {
            onGameStart: vi.fn(),
            onGameOver: vi.fn(),
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onObjectSpawn: vi.fn(),
            onCollision: vi.fn(),
        }

        game = new EvaderGame(config, mockCallbacks)
    })

    afterEach(() => {
        game.cleanup()
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    describe('initialization', () => {
        it('should create game with initial state', () => {
            const state = game.getState()

            expect(state.score).toBe(0)
            expect(state.timeRemaining).toBe(config.gameDuration)
            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.coinsCollected).toBe(0)
            expect(state.bombsHit).toBe(0)
        })

        it('should position player at left edge center', () => {
            const state = game.getState()

            expect(state.player.x).toBe(config.playerSize / 2)
            expect(state.player.y).toBe(config.canvasHeight / 2)
        })

        it('should initialize with empty objects array', () => {
            const state = game.getState()

            expect(state.objects).toHaveLength(0)
        })
    })

    describe('game lifecycle', () => {
        it('should start the game', () => {
            game.startGame()
            const state = game.getState()

            expect(state.isGameActive).toBe(true)
            expect(state.gameStartTime).not.toBeNull()
            expect(mockCallbacks.onGameStart).toHaveBeenCalled()
        })

        it('should not start if already active', () => {
            game.startGame()
            game.startGame()

            expect(mockCallbacks.onGameStart).toHaveBeenCalledTimes(1)
        })

        it('should stop the game', () => {
            game.startGame()
            game.stopGame()
            const state = game.getState()

            expect(state.isGameActive).toBe(false)
            expect(state.isGameOver).toBe(true)
            expect(mockCallbacks.onGameOver).toHaveBeenCalled()
        })

        it('should call onScoreUpdate and onTimeUpdate on start', () => {
            game.startGame()

            expect(mockCallbacks.onScoreUpdate).toHaveBeenCalledWith(0)
            expect(mockCallbacks.onTimeUpdate).toHaveBeenCalledWith(
                config.gameDuration
            )
        })
    })

    describe('timer', () => {
        it('should decrement time each second', () => {
            game.startGame()

            vi.advanceTimersByTime(1000)

            const state = game.getState()
            expect(state.timeRemaining).toBe(config.gameDuration - 1)
            expect(mockCallbacks.onTimeUpdate).toHaveBeenCalledWith(
                config.gameDuration - 1
            )
        })

        it('should end game when time runs out', () => {
            game.startGame()

            vi.advanceTimersByTime(config.gameDuration * 1000)

            expect(mockCallbacks.onGameOver).toHaveBeenCalled()
        })
    })

    describe('object spawning', () => {
        it('should spawn objects at spawn interval', () => {
            game.startGame()

            vi.advanceTimersByTime(config.spawnInterval * 1000)

            expect(mockCallbacks.onObjectSpawn).toHaveBeenCalled()
        })

        it('should spawn objects at right edge of screen', () => {
            game.startGame()

            vi.advanceTimersByTime(config.spawnInterval * 1000)

            const spawnedObject = (
                mockCallbacks.onObjectSpawn as ReturnType<typeof vi.fn>
            ).mock.calls[0][0] as GameObject
            expect(spawnedObject.x).toBe(config.canvasWidth)
        })

        it('should spawn either coins or bombs', () => {
            game.startGame()

            // Spawn multiple objects
            vi.advanceTimersByTime(config.spawnInterval * 10 * 1000)

            const calls = (
                mockCallbacks.onObjectSpawn as ReturnType<typeof vi.fn>
            ).mock.calls
            const types = calls.map((call: [GameObject]) => call[0].type)

            expect(types.some(t => t === 'coin' || t === 'bomb')).toBe(true)
        })
    })

    describe('player movement', () => {
        it('should track pressed keys', () => {
            game.startGame()
            game.pressKey('ArrowUp')
            game.releaseKey('ArrowUp')

            expect(game.getState().isGameActive).toBe(true)
        })

        it('should move player with arrow keys', () => {
            // Mock requestAnimationFrame
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()
            const initialY = game.getState().player.y

            game.pressKey('ArrowDown')
            vi.advanceTimersByTime(100)

            const newY = game.getState().player.y
            expect(newY).toBeGreaterThan(initialY)
        })

        it('should constrain player to canvas bounds', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()

            // Try to move up past top edge
            game.pressKey('ArrowUp')
            vi.advanceTimersByTime(5000)

            const state = game.getState()
            expect(state.player.y).toBeGreaterThanOrEqual(config.playerSize / 2)
        })

        it('should move player left with ArrowLeft key', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()
            // Move right first to get off the left edge, then move left
            game.pressKey('ArrowRight')
            vi.advanceTimersByTime(200)
            game.releaseKey('ArrowRight')
            const midX = game.getState().player.x

            game.pressKey('ArrowLeft')
            vi.advanceTimersByTime(100)

            const newX = game.getState().player.x
            expect(newX).toBeLessThan(midX)
        })

        it('should move player right with ArrowRight key', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()
            const initialX = game.getState().player.x

            game.pressKey('ArrowRight')
            vi.advanceTimersByTime(100)

            const newX = game.getState().player.x
            expect(newX).toBeGreaterThan(initialX)
        })

        it('should move player with WASD keys', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()

            game.pressKey('d')
            vi.advanceTimersByTime(100)
            game.releaseKey('d')
            const afterRight = game.getState().player.x
            expect(afterRight).toBeGreaterThan(config.playerSize / 2)

            game.pressKey('s')
            vi.advanceTimersByTime(100)
            game.releaseKey('s')
            const afterDown = game.getState().player.y
            expect(afterDown).toBeGreaterThan(config.canvasHeight / 2)

            game.pressKey('a')
            vi.advanceTimersByTime(100)
            game.releaseKey('a')
            expect(game.getState().player.x).toBeLessThan(afterRight)

            game.pressKey('w')
            vi.advanceTimersByTime(100)
            game.releaseKey('w')
            expect(game.getState().player.y).toBeLessThan(afterDown)
        })
    })

    describe('getState', () => {
        it('should return a copy of the state', () => {
            const state1 = game.getState()
            const state2 = game.getState()

            expect(state1).toEqual(state2)
            expect(state1).not.toBe(state2)
        })
    })

    describe('cleanup', () => {
        it('should clear timers and objects', () => {
            game.startGame()
            vi.advanceTimersByTime(config.spawnInterval * 3 * 1000)
            game.cleanup()

            expect(game.getState().objects).toHaveLength(0)
        })

        it('should stop timer updates after cleanup', () => {
            game.startGame()
            const timeAtCleanup = game.getState().timeRemaining

            game.cleanup()
            vi.advanceTimersByTime(5000)

            expect(game.getState().timeRemaining).toBe(timeAtCleanup)
        })
    })

    describe('game stats', () => {
        it('should provide stats on game over', () => {
            game.startGame()
            game.stopGame()

            expect(mockCallbacks.onGameOver).toHaveBeenCalledWith(
                0,
                expect.objectContaining({
                    finalScore: 0,
                    coinsCollected: 0,
                    bombsHit: 0,
                    gameHistory: [],
                })
            )
        })
    })

    describe('pressedKeys cleanup', () => {
        it('should clear pressedKeys when game stops', () => {
            game.startGame()
            game.pressKey('ArrowUp')
            game.pressKey('ArrowRight')
            game.stopGame()

            // Start a new game and verify no stuck movement
            game.startGame()
            const state = game.getState()
            // Player should be at initial position (no stuck movement)
            expect(state.player.x).toBe(config.playerSize / 2)
            expect(state.player.y).toBe(config.canvasHeight / 2)
        })

        it('should not carry stuck keys into next game after stop with held keys', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            // First game: start, press a key, then stop while key is held
            game.startGame()
            game.pressKey('ArrowRight')
            vi.advanceTimersByTime(50)
            game.stopGame()

            // Second game: start without releasing the key
            game.startGame()
            const startX = game.getState().player.x

            // Advance time — player should NOT move because no keys are pressed
            vi.advanceTimersByTime(200)
            const afterX = game.getState().player.x

            expect(afterX).toBe(startX)
        })
    })

    describe('timer guard when isGameActive is false', () => {
        it('should skip timer tick when isGameActive is false', () => {
            game.startGame()
            const timeBefore = game.getState().timeRemaining
            // Use public API to stop game instead of directly mutating internal state
            game.stopGame()
            // Advance both timers — callbacks fire but guards return early
            vi.advanceTimersByTime(2000)
            expect(game.getState().timeRemaining).toBe(timeBefore)
        })

        it('should hit early-return guard when state mutated without clearing timers', () => {
            game.startGame()
            const timeBefore = game.getState().timeRemaining
            // Directly set isGameActive to false WITHOUT clearing timers
            // @ts-expect-error - accessing private state for test coverage
            game.state.isGameActive = false
            vi.advanceTimersByTime(2000)
            // timeRemaining unchanged because guard returned early
            expect(game.getState().timeRemaining).toBe(timeBefore)
        })
    })

    describe('case mismatch on release', () => {
        it('should release direction when Shift changes casing between keydown and keyup', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()
            const initialY = game.getState().player.y

            // Simulate: user holds Shift, presses W (key reports 'W'),
            // then releases Shift, then releases W (key reports 'w')
            game.pressKey('W')
            vi.advanceTimersByTime(100)
            const movedY = game.getState().player.y
            expect(movedY).toBeLessThan(initialY) // Moving up

            // Release with different casing
            game.releaseKey('w')
            vi.advanceTimersByTime(100)
            const afterReleaseY = game.getState().player.y
            expect(afterReleaseY).toBe(movedY) // Stopped moving
        })

        it('should release direction when lowercase key is released as uppercase', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()
            const initialX = game.getState().player.x

            // Press 'd' normally, release as 'D' (e.g. Caps Lock toggled)
            game.pressKey('d')
            vi.advanceTimersByTime(100)
            const movedX = game.getState().player.x
            expect(movedX).toBeGreaterThan(initialX)

            game.releaseKey('D')
            vi.advanceTimersByTime(100)
            const afterReleaseX = game.getState().player.x
            expect(afterReleaseX).toBe(movedX) // Stopped moving
        })
    })

    describe('alias key overlap', () => {
        it('should preserve direction when one alias is released while the other is held', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()
            const initialY = game.getState().player.y

            // Hold both ArrowUp and W (both map to 'up')
            game.pressKey('ArrowUp')
            game.pressKey('w')

            // Release only ArrowUp — W is still held, so movement should continue
            game.releaseKey('ArrowUp')
            vi.advanceTimersByTime(100)

            const newY = game.getState().player.y
            expect(newY).toBeLessThan(initialY)
        })

        it('should stop movement when both aliases are released', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()
            const initialY = game.getState().player.y

            game.pressKey('ArrowUp')
            game.pressKey('w')
            game.releaseKey('ArrowUp')
            game.releaseKey('w')

            // Both released — no movement
            vi.advanceTimersByTime(100)
            const afterReleaseY = game.getState().player.y
            expect(afterReleaseY).toBe(initialY)
        })

        it('should work with horizontal aliases too', () => {
            vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
                setTimeout(cb, 16)
                return 0
            })

            game.startGame()
            const initialX = game.getState().player.x

            // Hold both ArrowRight and D
            game.pressKey('ArrowRight')
            game.pressKey('d')

            // Release ArrowRight — D still held
            game.releaseKey('ArrowRight')
            vi.advanceTimersByTime(100)

            const newX = game.getState().player.x
            expect(newX).toBeGreaterThan(initialX)
        })
    })
})
