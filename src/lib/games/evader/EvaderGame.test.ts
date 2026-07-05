// EvaderGame (BaseGame framework) unit tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EvaderGame, DEFAULT_EVADER_CONFIG } from './EvaderGame'
import type { EvaderConfig } from './frameworkTypes'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import type { GameObject } from './types'

describe('EvaderGame', () => {
    let game: EvaderGame
    let mockCallbacks: BaseGameCallbacks
    let config: Partial<EvaderConfig>

    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )

        config = {
            duration: 60,
            canvasWidth: 800,
            canvasHeight: 600,
            playerSize: 30,
            playerSpeed: 200,
            objectSize: 25,
            objectSpeed: 150,
            spawnInterval: 1,
            pointsForCoin: 10,
            pointsForBomb: -20,
            coinToBombRatio: 2,
        }

        mockCallbacks = {
            onStart: vi.fn(),
            onEnd: vi.fn(),
            onScoreUpdate: vi.fn(),
            onTimeUpdate: vi.fn(),
            onStateChange: vi.fn(),
        }

        game = new EvaderGame(config, mockCallbacks)
    })

    afterEach(() => {
        game.destroy()
        vi.unstubAllGlobals()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('initialization', () => {
        it('should create game with initial state', () => {
            const state = game.getState()

            expect(state.score).toBe(0)
            expect(state.timeRemaining).toBe(config.duration)
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(false)
            expect(state.coinsCollected).toBe(0)
            expect(state.bombsHit).toBe(0)
        })

        it('should position player at left edge center', () => {
            const state = game.getState()

            expect(state.player.x).toBe(config.playerSize! / 2)
            expect(state.player.y).toBe(config.canvasHeight! / 2)
        })

        it('should initialize with empty objects array', () => {
            const state = game.getState()

            expect(state.objects).toHaveLength(0)
        })
    })

    describe('game lifecycle', () => {
        it('should start the game', () => {
            game.start()
            const state = game.getState()

            expect(state.isActive).toBe(true)
            expect(state.gameStarted).toBe(true)
            expect(mockCallbacks.onStart).toHaveBeenCalled()
        })

        it('should not start if already active', () => {
            game.start()
            vi.advanceTimersByTime(100)
            game.start()

            // Only one spawn timer should be running; advancing 1s spawns once
            vi.advanceTimersByTime(1000)
            expect(game.getState().objects).toHaveLength(1)
        })

        it('should stop the game', async () => {
            game.start()
            await game.end()
            const state = game.getState()

            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(true)
            expect(mockCallbacks.onEnd).toHaveBeenCalled()
        })

        it('should call onTimeUpdate on first tick', () => {
            game.start()

            vi.advanceTimersByTime(1000)

            expect(mockCallbacks.onTimeUpdate).toHaveBeenCalledWith(
                config.duration! - 1
            )
        })
    })

    describe('timer', () => {
        it('should decrement time each second', () => {
            game.start()

            vi.advanceTimersByTime(1000)

            const state = game.getState()
            expect(state.timeRemaining).toBe(config.duration! - 1)
            expect(mockCallbacks.onTimeUpdate).toHaveBeenCalledWith(
                config.duration! - 1
            )
        })

        it('should end game when time runs out', async () => {
            game.start()

            vi.advanceTimersByTime(config.duration! * 1000)
            await vi.runAllTimersAsync()

            expect(mockCallbacks.onEnd).toHaveBeenCalled()
        })
    })

    describe('object spawning', () => {
        it('should spawn objects at spawn interval', () => {
            game.start()

            vi.advanceTimersByTime(config.spawnInterval! * 1000)

            expect(game.getState().objects).toHaveLength(1)
        })

        it('should spawn objects at right edge of screen', () => {
            game.start()

            vi.advanceTimersByTime(config.spawnInterval! * 1000)

            const spawnedObject = game.getState().objects[0] as GameObject
            expect(spawnedObject.x).toBe(config.canvasWidth)
        })

        it('should spawn either coins or bombs', () => {
            game.start()

            // Spawn multiple objects
            vi.advanceTimersByTime(config.spawnInterval! * 10 * 1000)

            const types = game.getState().objects.map(o => o.type)

            expect(types.some(t => t === 'coin' || t === 'bomb')).toBe(true)
        })
    })

    describe('player movement', () => {
        it('should track pressed keys', () => {
            game.start()
            game.pressKey('ArrowUp')
            game.releaseKey('ArrowUp')

            expect(game.getState().isActive).toBe(true)
        })

        it('should move player with arrow keys', () => {
            game.start()
            const initialY = game.getState().player.y

            game.pressKey('ArrowDown')
            game.update(0.1)

            const newY = game.getState().player.y
            expect(newY).toBeGreaterThan(initialY)
        })

        it('should constrain player to canvas bounds', () => {
            game.start()

            // Try to move up past top edge
            game.pressKey('ArrowUp')
            game.update(5)

            const state = game.getState()
            expect(state.player.y).toBeGreaterThanOrEqual(
                config.playerSize! / 2
            )
        })

        it('should move player left with ArrowLeft key', () => {
            game.start()
            // Move right first to get off the left edge, then move left
            game.pressKey('ArrowRight')
            game.update(0.2)
            game.releaseKey('ArrowRight')
            const midX = game.getState().player.x

            game.pressKey('ArrowLeft')
            game.update(0.1)

            const newX = game.getState().player.x
            expect(newX).toBeLessThan(midX)
        })

        it('should move player right with ArrowRight key', () => {
            game.start()
            const initialX = game.getState().player.x

            game.pressKey('ArrowRight')
            game.update(0.1)

            const newX = game.getState().player.x
            expect(newX).toBeGreaterThan(initialX)
        })

        it('should move player with WASD keys', () => {
            game.start()

            game.pressKey('d')
            game.update(0.1)
            game.releaseKey('d')
            const afterRight = game.getState().player.x
            expect(afterRight).toBeGreaterThan(config.playerSize! / 2)

            game.pressKey('s')
            game.update(0.1)
            game.releaseKey('s')
            const afterDown = game.getState().player.y
            expect(afterDown).toBeGreaterThan(config.canvasHeight! / 2)

            game.pressKey('a')
            game.update(0.1)
            game.releaseKey('a')
            expect(game.getState().player.x).toBeLessThan(afterRight)

            game.pressKey('w')
            game.update(0.1)
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
            game.start()
            vi.advanceTimersByTime(config.spawnInterval! * 3 * 1000)
            game.cleanup()

            expect(game.getState().objects).toHaveLength(0)
        })

        it('should stop spawning after cleanup', () => {
            game.start()
            vi.advanceTimersByTime(config.spawnInterval! * 3 * 1000)
            game.cleanup()

            // No new objects spawn after cleanup (spawn timer cleared)
            vi.advanceTimersByTime(config.spawnInterval! * 3 * 1000)
            expect(game.getState().objects).toHaveLength(0)
        })
    })

    describe('game stats', () => {
        it('should provide stats on game over', async () => {
            game.start()
            await game.end()

            expect(mockCallbacks.onEnd).toHaveBeenCalledWith(
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

    describe('collision handling', () => {
        it('should award points and track stats on coin collision', () => {
            game.start()

            const player = game.getState().player
            // Place a coin directly on the player
            ;(
                game as unknown as { state: { objects: GameObject[] } }
            ).state.objects.push({
                id: 'test-coin',
                type: 'coin',
                x: player.x,
                y: player.y,
                speed: 0,
                spawnTime: Date.now(),
            })

            game.update(0.016)

            const state = game.getState()
            expect(state.coinsCollected).toBe(1)
            expect(state.score).toBe(config.pointsForCoin)
            expect(state.objects).toHaveLength(0)
        })

        it('should penalize and track stats on bomb collision', () => {
            game.start()

            const player = game.getState().player
            ;(
                game as unknown as { state: { objects: GameObject[] } }
            ).state.objects.push({
                id: 'test-bomb',
                type: 'bomb',
                x: player.x,
                y: player.y,
                speed: 0,
                spawnTime: Date.now(),
            })

            game.update(0.016)

            const state = game.getState()
            expect(state.bombsHit).toBe(1)
            // ScoreManager clamps to >= 0
            expect(state.score).toBe(0)
            expect(state.objects).toHaveLength(0)
        })

        it('should remove objects that move off screen', () => {
            game.start()
            ;(
                game as unknown as { state: { objects: GameObject[] } }
            ).state.objects.push({
                id: 'offscreen',
                type: 'coin',
                x: 1, // just above 0, moving left
                y: 100,
                speed: 1000,
                spawnTime: Date.now(),
            })

            game.update(0.1)

            expect(game.getState().objects).toHaveLength(0)
        })
    })

    describe('pressedKeys cleanup', () => {
        it('should clear pressedKeys when game stops', async () => {
            game.start()
            game.pressKey('ArrowUp')
            game.pressKey('ArrowRight')
            await game.end()

            // Start a new game after reset and verify no stuck movement
            game.reset()
            game.start()
            const state = game.getState()
            // Player should be at initial position (no stuck movement)
            expect(state.player.x).toBe(config.playerSize! / 2)
            expect(state.player.y).toBe(config.canvasHeight! / 2)
        })

        it('should not carry stuck keys into next game after stop with held keys', () => {
            game.start()
            game.pressKey('ArrowRight')
            game.update(0.05)
            game.end()

            // Second game: reset + start without releasing the key
            game.reset()
            game.start()
            const startX = game.getState().player.x

            // Advance physics — player should NOT move because no keys are pressed
            game.update(0.2)
            const afterX = game.getState().player.x

            expect(afterX).toBe(startX)
        })
    })

    describe('timer guard when isActive is false', () => {
        it('should skip timer tick when isActive is false', async () => {
            game.start()
            const timeBefore = game.getState().timeRemaining
            await game.end()
            // Advance both timers — callbacks fire but guards return early
            vi.advanceTimersByTime(2000)
            expect(game.getState().timeRemaining).toBe(timeBefore)
        })
    })

    describe('case mismatch on release', () => {
        it('should release direction when Shift changes casing between keydown and keyup', () => {
            game.start()
            const initialY = game.getState().player.y

            // Simulate: user holds Shift, presses W (key reports 'W'),
            // then releases Shift, then releases W (key reports 'w')
            game.pressKey('W')
            game.update(0.1)
            const movedY = game.getState().player.y
            expect(movedY).toBeLessThan(initialY) // Moving up

            // Release with different casing
            game.releaseKey('w')
            game.update(0.1)
            const afterReleaseY = game.getState().player.y
            expect(afterReleaseY).toBe(movedY) // Stopped moving
        })

        it('should release direction when lowercase key is released as uppercase', () => {
            game.start()
            const initialX = game.getState().player.x

            // Press 'd' normally, release as 'D' (e.g. Caps Lock toggled)
            game.pressKey('d')
            game.update(0.1)
            const movedX = game.getState().player.x
            expect(movedX).toBeGreaterThan(initialX)

            game.releaseKey('D')
            game.update(0.1)
            const afterReleaseX = game.getState().player.x
            expect(afterReleaseX).toBe(movedX) // Stopped moving
        })
    })

    describe('object ID uniqueness', () => {
        afterEach(() => {
            vi.restoreAllMocks()
        })

        it('generates unique IDs even when Date.now() returns the same value', () => {
            const FIXED_TIME = 1_700_000_000_000
            vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME)

            game.start()

            for (let i = 0; i < 50; i++) {
                vi.advanceTimersByTime(config.spawnInterval! * 1000)
            }

            const objects = game.getState().objects
            const ids = objects.map(o => o.id)
            const uniqueIds = new Set(ids)

            expect(ids.length).toBeGreaterThan(1)
            expect(uniqueIds.size).toBe(ids.length)
        })
    })

    describe('alias key overlap', () => {
        it('should preserve direction when one alias is released while the other is held', () => {
            game.start()
            const initialY = game.getState().player.y

            // Hold both ArrowUp and W (both map to 'up')
            game.pressKey('ArrowUp')
            game.pressKey('w')

            // Release only ArrowUp — W is still held, so movement should continue
            game.releaseKey('ArrowUp')
            game.update(0.1)

            const newY = game.getState().player.y
            expect(newY).toBeLessThan(initialY)
        })

        it('should stop movement when both aliases are released', () => {
            game.start()
            const initialY = game.getState().player.y

            game.pressKey('ArrowUp')
            game.pressKey('w')
            game.releaseKey('ArrowUp')
            game.releaseKey('w')

            // Both released — no movement
            game.update(0.1)
            const afterReleaseY = game.getState().player.y
            expect(afterReleaseY).toBe(initialY)
        })

        it('should work with horizontal aliases too', () => {
            game.start()
            const initialX = game.getState().player.x

            // Hold both ArrowRight and D
            game.pressKey('ArrowRight')
            game.pressKey('d')

            // Release ArrowRight — D still held
            game.releaseKey('ArrowRight')
            game.update(0.1)

            const newX = game.getState().player.x
            expect(newX).toBeGreaterThan(initialX)
        })
    })

    describe('getGameData contract', () => {
        it('returns EvaderGameData shape with longestSurvivalTime', () => {
            const data = (
                game as unknown as {
                    getGameData: () => Record<string, unknown>
                }
            ).getGameData()
            expect(data).toMatchObject({
                coinsCollected: 0,
                bombsHit: 0,
                longestSurvivalTime: 0,
            })
        })
    })

    describe('default config export', () => {
        it('exports expected defaults', () => {
            expect(DEFAULT_EVADER_CONFIG.duration).toBe(60)
            expect(DEFAULT_EVADER_CONFIG.canvasWidth).toBe(800)
            expect(DEFAULT_EVADER_CONFIG.canvasHeight).toBe(300)
            expect(DEFAULT_EVADER_CONFIG.playerSpeed).toBe(300)
            expect(DEFAULT_EVADER_CONFIG.pointsForCoin).toBe(100)
            expect(DEFAULT_EVADER_CONFIG.pointsForBomb).toBe(-100)
        })
    })

    describe('lifecycle hooks via public API', () => {
        it('pause triggers onGamePause (stops spawn timer)', () => {
            game.start()
            vi.advanceTimersByTime(config.spawnInterval! * 1000)
            expect(game.getState().objects).toHaveLength(1)

            game.pause()
            expect(game.getState().isPaused).toBe(true)

            // No new objects spawn while paused
            vi.advanceTimersByTime(config.spawnInterval! * 5 * 1000)
            expect(game.getState().objects).toHaveLength(1)
        })

        it('resume triggers onGameResume (restarts spawn timer)', () => {
            game.start()
            vi.advanceTimersByTime(config.spawnInterval! * 1000)
            const countBeforePause = game.getState().objects.length

            game.pause()
            game.resume()
            expect(game.getState().isPaused).toBe(false)

            // Spawning resumes after resume
            vi.advanceTimersByTime(config.spawnInterval! * 1000)
            expect(game.getState().objects.length).toBeGreaterThan(
                countBeforePause
            )
        })

        it('onGamePause and onGameResume are invoked via pause/resume', () => {
            const onPause = vi.spyOn(
                game as unknown as { onGamePause: () => void },
                'onGamePause'
            )
            const onResume = vi.spyOn(
                game as unknown as { onGameResume: () => void },
                'onGameResume'
            )

            game.start()
            game.pause()
            expect(onPause).toHaveBeenCalledTimes(1)

            game.resume()
            expect(onResume).toHaveBeenCalledTimes(1)
        })
    })

    describe('update guard branches', () => {
        it('update is a no-op when game is not active', () => {
            const timeBefore = game.getState().timeRemaining
            const playerBefore = { ...game.getState().player }

            game.update(0.5)

            // Nothing changed
            expect(game.getState().timeRemaining).toBe(timeBefore)
            expect(game.getState().player).toEqual(playerBefore)
        })

        it('update is a no-op when game is paused', () => {
            game.start()
            const timeBefore = game.getState().timeRemaining
            game.pause()

            game.update(0.5)

            expect(game.getState().timeRemaining).toBe(timeBefore)
        })

        it('update keeps non-colliding, on-screen objects (return true)', () => {
            game.start()
            const player = game.getState().player
            // Place a coin far from the player and on-screen (not off-screen)
            ;(
                game as unknown as { state: { objects: GameObject[] } }
            ).state.objects.push({
                id: 'safe-coin',
                type: 'coin',
                x: 400,
                y: player.y + 200, // far from player vertically
                speed: 10, // slow so it stays on screen
                spawnTime: Date.now(),
            })

            game.update(0.016)

            const objects = game.getState().objects
            expect(objects.some(o => o.id === 'safe-coin')).toBe(true)
        })
    })

    describe('render', () => {
        it('render does not throw (rendering handled by renderer)', () => {
            expect(() => game.render()).not.toThrow()
        })
    })

    describe('getConfig', () => {
        it('returns a copy of the config', () => {
            const cfg = game.getConfig()
            expect(cfg.duration).toBe(config.duration)
            expect(cfg.canvasWidth).toBe(config.canvasWidth)
            expect(cfg.canvasHeight).toBe(config.canvasHeight)
            // Mutating the returned copy does not affect the game
            const original = game.getConfig()
            cfg.canvasWidth = 9999
            expect(game.getConfig().canvasWidth).toBe(original.canvasWidth)
        })
    })

    describe('startSpawnTimer guard', () => {
        it('startSpawnTimer is a no-op when timer already running', () => {
            game.start()
            const objectsBefore = game.getState().objects.length

            // Call startSpawnTimer again while already running
            ;(
                game as unknown as { startSpawnTimer: () => void }
            ).startSpawnTimer()

            // Advancing time should only spawn from the single timer
            vi.advanceTimersByTime(config.spawnInterval! * 1000)
            expect(game.getState().objects.length).toBe(objectsBefore + 1)
        })
    })

    describe('pressKey with non-movement key', () => {
        it('ignores keys that are not movement keys', () => {
            game.start()
            const initialX = game.getState().player.x
            const initialY = game.getState().player.y

            game.pressKey('Space')
            game.pressKey('x')
            game.update(0.1)

            // Player should not have moved
            expect(game.getState().player.x).toBe(initialX)
            expect(game.getState().player.y).toBe(initialY)
        })
    })

    describe('pressedKeys getter', () => {
        it('returns normalized direction set from held keys', () => {
            game.start()
            expect(game.pressedKeys.size).toBe(0)

            game.pressKey('ArrowUp')
            game.pressKey('d')
            expect(game.pressedKeys.has('up')).toBe(true)
            expect(game.pressedKeys.has('right')).toBe(true)

            game.releaseKey('ArrowUp')
            game.releaseKey('d')
            expect(game.pressedKeys.size).toBe(0)
        })
    })
})
