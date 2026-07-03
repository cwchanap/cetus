// initFramework unit tests for Evader
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initEvaderGameFramework, showGameOver } from './initFramework'
import type { EvaderStats } from './frameworkTypes'

// Mock pixi.js for the renderer
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
        }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
        ]) {
            g[m] = vi.fn(() => g)
        }
        g['destroy'] = vi.fn()
        return g
    }

    const makeContainer = () => ({
        addChild: vi.fn(),
        removeChild: vi.fn(),
        removeChildren: vi.fn(),
        destroy: vi.fn(),
        x: 0,
        y: 0,
    })

    const makeApp = () => {
        const canvas = document.createElement('canvas')
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', boxShadow: '' },
            writable: true,
        })
        canvas.addEventListener = vi.fn()
        canvas.removeEventListener = vi.fn()
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: { addChild: vi.fn() },
            destroy: vi.fn(),
            renderer: { resize: vi.fn() },
        }
    }

    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        FillGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        Text: vi.fn(() => ({
            text: '',
            destroy: vi.fn(),
            anchor: { set: vi.fn() },
        })),
        Assets: { load: vi.fn() },
    }
})

function setupDOM() {
    document.body.innerHTML = `
        <div id="game-canvas-container"></div>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <span id="coins-collected">0</span>
        <span id="bombs-hit">0</span>
        <span id="final-score">0</span>
        <span id="final-coins">0</span>
        <span id="final-bombs">0</span>
        <div id="game-status" style="display:flex"></div>
        <div id="game-over-overlay" class="hidden"></div>
        <button id="start-btn">Start</button>
        <button id="stop-btn" style="display:none">Stop</button>
        <button id="play-again-btn">Play Again</button>
    `
}

describe('initEvaderGameFramework', () => {
    beforeEach(() => {
        setupDOM()
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ newAchievements: [] }),
            })
        )
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 1)
        )
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('returns a result with game, renderer, and cleanup', async () => {
            const result = await initEvaderGameFramework()
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            result!.cleanup()
        })

        it('returns undefined when container is missing', async () => {
            document.getElementById('game-canvas-container')!.remove()
            const result = await initEvaderGameFramework()
            expect(result).toBeUndefined()
        })

        it('accepts custom config', async () => {
            const result = await initEvaderGameFramework({ duration: 30 })
            expect(result).toBeDefined()
            expect(result!.game.getState().timeRemaining).toBe(30)
            result!.cleanup()
        })
    })

    describe('game start', () => {
        it('hides start button and shows stop button on start', async () => {
            const result = await initEvaderGameFramework()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const stopBtn = document.getElementById(
                'stop-btn'
            ) as HTMLButtonElement

            result!.game.start()

            expect(startBtn.style.display).toBe('none')
            expect(stopBtn.style.display).toBe('inline-flex')
            result!.cleanup()
        })

        it('hides the game-over overlay on start', async () => {
            const result = await initEvaderGameFramework()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            result!.game.start()
            expect(overlay.classList.contains('hidden')).toBe(true)
            result!.cleanup()
        })

        it('hides the status message on start', async () => {
            const result = await initEvaderGameFramework()
            const status = document.getElementById('game-status')!

            result!.game.start()
            expect(status.style.display).toBe('none')
            result!.cleanup()
        })
    })

    describe('game end', () => {
        it('shows overlay and resets buttons on end', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()
            await result!.game.end()

            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)

            const startBtn = document.getElementById('start-btn')!
            const stopBtn = document.getElementById('stop-btn')!
            expect(startBtn.style.display).toBe('inline-flex')
            expect(stopBtn.style.display).toBe('none')
            result!.cleanup()
        })

        it('displays final stats in the overlay', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()
            await result!.game.end()

            const finalScore = document.getElementById('final-score')!
            expect(finalScore.textContent).toBe('0')
            result!.cleanup()
        })

        it('uses stats values for the display', async () => {
            const result = await initEvaderGameFramework()
            result!.cleanup()

            const stats: EvaderStats = {
                finalScore: 100,
                timeElapsed: 60,
                gameCompleted: true,
                coinsCollected: 5,
                bombsHit: 3,
                gameHistory: [],
            }

            showGameOver(stats.finalScore, stats)

            const finalScore = document.getElementById('final-score')!
            const finalCoins = document.getElementById('final-coins')!
            const finalBombs = document.getElementById('final-bombs')!
            expect(finalScore.textContent).toBe('100')
            expect(finalCoins.textContent).toBe('5')
            expect(finalBombs.textContent).toBe('3')
        })
    })

    describe('live stats update', () => {
        it('updates coins/bombs on state change', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()

            // Place a coin on the player and run a physics update to trigger collision
            const game = result!.game
            const player = game.getState().player
            ;(
                game as unknown as { state: { objects: unknown[] } }
            ).state.objects.push({
                id: 'test-coin',
                type: 'coin',
                x: player.x,
                y: player.y,
                speed: 0,
                spawnTime: Date.now(),
            })
            game.update(0.016)

            const coinsEl = document.getElementById('coins-collected')!
            expect(coinsEl.textContent).toBe('1')

            result!.cleanup()
        })
    })

    describe('cleanup', () => {
        it('does not throw on cleanup', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()
            expect(() => result!.cleanup()).not.toThrow()
        })
    })

    describe('restart', () => {
        it('resets the game state', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()
            vi.advanceTimersByTime(1000)

            result!.restart()

            const state = result!.game.getState()
            expect(state.gameStarted).toBe(false)
            expect(state.score).toBe(0)
            expect(state.objects).toEqual([])
            result!.cleanup()
        })
    })

    describe('score/time UI callbacks', () => {
        it('updates score element on score change', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()

            // Place a coin on the player to award points
            const game = result!.game
            const player = game.getState().player
            ;(
                game as unknown as { state: { objects: unknown[] } }
            ).state.objects.push({
                id: 'test-coin',
                type: 'coin',
                x: player.x,
                y: player.y,
                speed: 0,
                spawnTime: Date.now(),
            })
            game.update(0.016)

            const scoreEl = document.getElementById('score')!
            expect(scoreEl.textContent).toBe('100')
            result!.cleanup()
        })

        it('updates time element on tick', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()

            vi.advanceTimersByTime(1000)

            const timeEl = document.getElementById('time-remaining')!
            expect(timeEl.textContent).toBe('59')
            result!.cleanup()
        })
    })

    describe('keyboard controls', () => {
        it('responds to ArrowUp keydown when active', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'ArrowUp',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
            result!.cleanup()
        })

        it('responds to keyup', async () => {
            const result = await initEvaderGameFramework()
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keyup', {
                        key: 'ArrowDown',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
            result!.cleanup()
        })

        it('ignores non-movement keys', async () => {
            const result = await initEvaderGameFramework()
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'x',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
            result!.cleanup()
        })

        it('ignores movement keys when modifier is held', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()

            const game = result!.game
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'ArrowUp',
                        bubbles: true,
                        ctrlKey: true,
                    })
                )
            ).not.toThrow()
            expect(game.pressedKeys.has('up')).toBe(false)
            result!.cleanup()
        })

        it('releases WASD key on keyup even when modifier is held', async () => {
            const result = await initEvaderGameFramework()
            result!.game.start()

            const game = result!.game

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'w',
                    bubbles: true,
                })
            )
            expect(game.pressedKeys.has('up')).toBe(true)

            document.dispatchEvent(
                new KeyboardEvent('keyup', {
                    key: 'w',
                    bubbles: true,
                    metaKey: true,
                })
            )
            expect(game.pressedKeys.has('up')).toBe(false)
            result!.cleanup()
        })
    })

    describe('achievement notifications', () => {
        it('dispatches achievements via window.showAchievementAward when earned', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({
                    ok: true,
                    json: async () => ({
                        newAchievements: ['evader_pro'],
                    }),
                })
            )
            const showSpy = vi.fn()
            window.showAchievementAward = showSpy

            const result = await initEvaderGameFramework()
            result!.game.start()
            await result!.game.end()

            expect(showSpy).toHaveBeenCalled()
            delete window.showAchievementAward
            result!.cleanup()
        })
    })
})
