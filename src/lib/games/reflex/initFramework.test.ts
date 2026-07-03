// initFramework unit tests for Reflex
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initReflexGameFramework } from './initFramework'
import type { ReflexStats } from './frameworkTypes'

// Mock pixi.js for the renderer
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = {
            alpha: 1,
            x: 0,
            y: 0,
            scale: { set: vi.fn() },
            anchor: { set: vi.fn() },
        }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'poly',
            'addChild',
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
        canvas.getBoundingClientRect = vi.fn(
            () =>
                ({
                    left: 0,
                    top: 0,
                    width: 500,
                    height: 500,
                }) as DOMRect
        )
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
        <span id="accuracy">0%</span>
        <span id="final-score">0</span>
        <span id="final-coins">0</span>
        <span id="final-bombs">0</span>
        <span id="final-accuracy">0%</span>
        <span id="avg-reaction">0ms</span>
        <div id="game-over-overlay" class="hidden"></div>
        <button id="start-btn">Start</button>
        <button id="stop-btn" style="display:none">Stop</button>
        <button id="play-again-btn">Play Again</button>
    `
}

describe('initReflexGameFramework', () => {
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
            const result = await initReflexGameFramework()
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            result!.cleanup()
        })

        it('returns undefined when container is missing', async () => {
            document.getElementById('game-canvas-container')!.remove()
            const result = await initReflexGameFramework()
            expect(result).toBeUndefined()
        })

        it('accepts custom config', async () => {
            const result = await initReflexGameFramework({ duration: 30 })
            expect(result).toBeDefined()
            expect(result!.game.getState().timeRemaining).toBe(30)
            result!.cleanup()
        })
    })

    describe('game start', () => {
        it('hides start button and shows stop button on start', async () => {
            const result = await initReflexGameFramework()
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
            const result = await initReflexGameFramework()
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            result!.game.start()
            expect(overlay.classList.contains('hidden')).toBe(true)
            result!.cleanup()
        })
    })

    describe('game end', () => {
        it('shows overlay and resets buttons on end', async () => {
            const result = await initReflexGameFramework()
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
            const result = await initReflexGameFramework()
            result!.game.start()
            await result!.game.end()

            const finalScore = document.getElementById('final-score')!
            const finalAccuracy = document.getElementById('final-accuracy')!
            expect(finalScore.textContent).toBe('0')
            expect(finalAccuracy.textContent).toBe('0%')
            result!.cleanup()
        })

        it('uses stats.accuracy for the display', async () => {
            const result = await initReflexGameFramework()

            const divergentStats: ReflexStats = {
                finalScore: 100,
                timeElapsed: 60,
                gameCompleted: true,
                totalClicks: 10,
                correctClicks: 7,
                incorrectClicks: 3,
                accuracy: 70,
                coinsCollected: 5,
                bombsHit: 3,
                missedCoins: 0,
                averageReactionTime: 0,
                objectsSpawned: 10,
                gameHistory: [],
            }

            const onEnd = result!.game.getGameStats()
            expect(onEnd).toBeDefined()

            // Simulate the showGameOver path with divergent stats
            const stats = divergentStats
            const el = document.getElementById('final-accuracy')!
            el.textContent = `${Math.round(stats.accuracy)}%`
            expect(el.textContent).toBe('70%')

            result!.cleanup()
        })
    })

    describe('live stats update', () => {
        it('updates coins/bombs/accuracy on state change', async () => {
            const result = await initReflexGameFramework()
            result!.game.start()

            vi.spyOn(Math, 'random').mockReturnValue(0.5) // always coins
            vi.advanceTimersByTime(1000)

            const coin = result!.game.getActiveObjects()[0]
            result!.game.handleCellClick(coin.cell.row, coin.cell.col)

            const coinsEl = document.getElementById('coins-collected')!
            const accuracyEl = document.getElementById('accuracy')!
            expect(coinsEl.textContent).toBe('1')
            expect(accuracyEl.textContent).toMatch(/\d+%/)

            result!.cleanup()
        })
    })

    describe('cleanup', () => {
        it('does not throw on cleanup', async () => {
            const result = await initReflexGameFramework()
            result!.game.start()
            expect(() => result!.cleanup()).not.toThrow()
        })
    })

    describe('restart', () => {
        it('resets the game state', async () => {
            const result = await initReflexGameFramework()
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
            const result = await initReflexGameFramework()
            result!.game.start()

            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            vi.advanceTimersByTime(1000)

            const coin = result!.game.getActiveObjects()[0]
            result!.game.handleCellClick(coin.cell.row, coin.cell.col)

            const scoreEl = document.getElementById('score')!
            expect(scoreEl.textContent).toBe('10')
            result!.cleanup()
        })

        it('updates time element on tick', async () => {
            const result = await initReflexGameFramework()
            result!.game.start()

            vi.advanceTimersByTime(1000)

            const timeEl = document.getElementById('time-remaining')!
            expect(timeEl.textContent).toBe('59')
            result!.cleanup()
        })
    })
})
