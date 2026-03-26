import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initializeEvaderGame } from './init'
import type { GameCallbacks } from './types'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock the PixiJS renderer module
vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn().mockResolvedValue({
        app: null,
        stage: null,
        playerSprite: null,
    }),
    renderPlayer: vi.fn(),
    renderObjects: vi.fn(),
    cleanup: vi.fn(),
}))

function makeCallbacks(overrides: Partial<GameCallbacks> = {}): GameCallbacks {
    return {
        onScoreUpdate: vi.fn(),
        onTimeUpdate: vi.fn(),
        onObjectSpawn: vi.fn(),
        onCollision: vi.fn(),
        onGameOver: vi.fn(),
        onGameStart: vi.fn(),
        ...overrides,
    }
}

function setupDOM() {
    document.body.innerHTML = `
        <div id="game-container"></div>
        <span id="final-score">0</span>
        <span id="final-coins">0</span>
        <span id="final-bombs">0</span>
        <div id="game-over-overlay" class="hidden"></div>
        <button id="start-btn" style="display:none">Start</button>
        <button id="stop-btn" style="display:inline-flex">Stop</button>
    `
}

describe('initializeEvaderGame', () => {
    let container: HTMLElement
    const rafCallbacks: FrameRequestCallback[] = []

    beforeEach(() => {
        setupDOM()
        container = document.getElementById('game-container')!
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
        rafCallbacks.length = 0
    })

    describe('initialization', () => {
        it('should return game instance with required methods', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            expect(result).toBeDefined()
            expect(typeof result.game).toBe('object')
            expect(typeof result.cleanup).toBe('function')
            expect(typeof result.startGame).toBe('function')
            expect(typeof result.stopGame).toBe('function')
            expect(typeof result.pressKey).toBe('function')
            expect(typeof result.releaseKey).toBe('function')
        })

        it('should call setupPixiJS with the container and config', async () => {
            const { setupPixiJS } = await import('./renderer')
            const callbacks = makeCallbacks()
            await initializeEvaderGame(container, callbacks)
            expect(setupPixiJS).toHaveBeenCalledWith(
                container,
                expect.any(Object)
            )
        })

        it('should accept custom config overrides', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks, {
                gameDuration: 30,
            })
            expect(result).toBeDefined()
        })

        it('should throw and show error when setupPixiJS fails', async () => {
            const { setupPixiJS } = await import('./renderer')
            vi.mocked(setupPixiJS).mockRejectedValueOnce(
                new Error('PixiJS init failed')
            )
            const callbacks = makeCallbacks()
            await expect(
                initializeEvaderGame(container, callbacks)
            ).rejects.toThrow('PixiJS init failed')
            expect(container.innerHTML).toContain('Failed to initialize')
        })
    })

    describe('game controls', () => {
        it('startGame should not throw', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            expect(() => result.startGame()).not.toThrow()
        })

        it('stopGame should trigger onGameOver callback', async () => {
            const onGameOver = vi.fn()
            const callbacks = makeCallbacks({ onGameOver })
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            result.stopGame()
            // The enhancedCallbacks.onGameOver calls handleGameOver first, then our callback
            // It's async so we need to wait
            await vi.runAllTimersAsync()
            expect(onGameOver).toHaveBeenCalled()
        })

        it('pressKey should not throw', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            expect(() => result.pressKey('ArrowUp')).not.toThrow()
        })

        it('releaseKey should not throw', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            expect(() => result.releaseKey('ArrowUp')).not.toThrow()
        })
    })

    describe('handleGameOver', () => {
        it('should update final-score element when game ends', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            const finalScore = document.getElementById('final-score')!
            // Score starts at 0; after stop the element should be set to '0'
            expect(finalScore.textContent).toBe('0')
        })

        it('should show game-over-overlay when game ends', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)
        })

        it('should show start-btn and hide stop-btn when game ends', async () => {
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const stopBtn = document.getElementById(
                'stop-btn'
            ) as HTMLButtonElement
            startBtn.style.display = 'none'
            stopBtn.style.display = 'inline-flex'

            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()

            expect(startBtn.style.display).toBe('inline-flex')
            expect(stopBtn.style.display).toBe('none')
        })

        it('should call saveGameScore after game ends', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            expect(saveGameScore).toHaveBeenCalled()
        })

        it('should work without optional DOM elements', async () => {
            document.getElementById('final-score')!.remove()
            document.getElementById('final-coins')!.remove()
            document.getElementById('final-bombs')!.remove()
            document.getElementById('game-over-overlay')!.remove()
            document.getElementById('start-btn')!.remove()
            document.getElementById('stop-btn')!.remove()

            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            await expect(
                (async () => {
                    result.stopGame()
                    await vi.runAllTimersAsync()
                })()
            ).resolves.not.toThrow()
        })

        it('should dispatch achievementsEarned when achievements earned', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, onSuccess) => {
                    onSuccess?.({ newAchievements: ['evader_pro'] })
                    return { success: true }
                }
            )

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'achievementsEarned' })
            )
        })
    })

    describe('keyboard events', () => {
        it('should respond to ArrowUp keydown', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            const event = new KeyboardEvent('keydown', {
                key: 'ArrowUp',
                bubbles: true,
            })
            expect(() => document.dispatchEvent(event)).not.toThrow()
        })

        it('should respond to ArrowDown keydown', async () => {
            const callbacks = makeCallbacks()
            await initializeEvaderGame(container, callbacks)
            const event = new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                bubbles: true,
            })
            expect(() => document.dispatchEvent(event)).not.toThrow()
        })

        it('should respond to ArrowLeft and ArrowRight keydown', async () => {
            const callbacks = makeCallbacks()
            await initializeEvaderGame(container, callbacks)
            const leftEvent = new KeyboardEvent('keydown', {
                key: 'ArrowLeft',
                bubbles: true,
            })
            const rightEvent = new KeyboardEvent('keydown', {
                key: 'ArrowRight',
                bubbles: true,
            })
            expect(() => document.dispatchEvent(leftEvent)).not.toThrow()
            expect(() => document.dispatchEvent(rightEvent)).not.toThrow()
        })

        it('should respond to ArrowUp keyup', async () => {
            const callbacks = makeCallbacks()
            await initializeEvaderGame(container, callbacks)
            const event = new KeyboardEvent('keyup', {
                key: 'ArrowUp',
                bubbles: true,
            })
            expect(() => document.dispatchEvent(event)).not.toThrow()
        })

        it('non-arrow keys should be ignored', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            const event = new KeyboardEvent('keydown', {
                key: 'a',
                bubbles: true,
            })
            expect(() => document.dispatchEvent(event)).not.toThrow()
        })
    })

    describe('cleanup', () => {
        it('should cancel animation frame and abort listeners on cleanup', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            expect(() => result.cleanup()).not.toThrow()
            expect(cancelAnimationFrame).toHaveBeenCalled()
        })

        it('should not throw on double cleanup', async () => {
            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.cleanup()
            expect(() => result.cleanup()).not.toThrow()
        })
    })

    describe('callbacks', () => {
        it('should call onGameStart callback when game starts', async () => {
            const onGameStart = vi.fn()
            const callbacks = makeCallbacks({ onGameStart })
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            expect(onGameStart).toHaveBeenCalled()
        })

        it('should call onScoreUpdate when game starts', async () => {
            const onScoreUpdate = vi.fn()
            const callbacks = makeCallbacks({ onScoreUpdate })
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            expect(onScoreUpdate).toHaveBeenCalled()
        })

        it('should call onTimeUpdate when game starts', async () => {
            const onTimeUpdate = vi.fn()
            const callbacks = makeCallbacks({ onTimeUpdate })
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            expect(onTimeUpdate).toHaveBeenCalled()
        })

        it('should call onObjectSpawn when object spawns', async () => {
            const onObjectSpawn = vi.fn()
            const callbacks = makeCallbacks({ onObjectSpawn })
            const result = await initializeEvaderGame(container, callbacks, {
                spawnInterval: 0.001,
            })
            result.startGame()
            vi.advanceTimersByTime(100)
            expect(onObjectSpawn).toHaveBeenCalled()
        })

        it('should call onCollision callback when collision occurs', async () => {
            const onCollision = vi.fn()
            const callbacks = makeCallbacks({ onCollision })
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()

            // Place a coin object directly at the player's position to force a collision
            const game = result.game as any
            const playerX = game.state.player.x
            const playerY = game.state.player.y
            game.state.objects.push({
                id: 'test-collision-obj',
                type: 'coin',
                x: playerX,
                y: playerY,
                speed: 0,
                spawnTime: Date.now(),
            })

            // Run the RAF callback to trigger the game update/collision check
            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }

            expect(onCollision).toHaveBeenCalled()
        })
    })

    describe('handleGameOver error callback', () => {
        it('should log error when saveGameScore error callback is called', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, _onSuccess, onError) => {
                    onError?.('network failure')
                    return { success: false }
                }
            )
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            const callbacks = makeCallbacks()
            const result = await initializeEvaderGame(container, callbacks)
            result.startGame()
            result.stopGame()
            await vi.runAllTimersAsync()

            expect(errorSpy).toHaveBeenCalledWith(
                'Failed to submit score:',
                expect.any(String)
            )
            errorSpy.mockRestore()
        })
    })

    describe('keyup with multiple arrow keys', () => {
        it('should respond to ArrowDown keyup', async () => {
            const callbacks = makeCallbacks()
            await initializeEvaderGame(container, callbacks)
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keyup', {
                        key: 'ArrowDown',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
        })

        it('should respond to ArrowLeft keyup', async () => {
            const callbacks = makeCallbacks()
            await initializeEvaderGame(container, callbacks)
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keyup', {
                        key: 'ArrowLeft',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
        })

        it('should respond to ArrowRight keyup', async () => {
            const callbacks = makeCallbacks()
            await initializeEvaderGame(container, callbacks)
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keyup', {
                        key: 'ArrowRight',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
        })
    })
})
