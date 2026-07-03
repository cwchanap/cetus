import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initPathNavigatorGameFramework } from './initFramework'

// Mock score service (used by BaseGame saveFinalScore fallback path)
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock pixi.js so the renderer can initialize in jsdom
vi.mock('pixi.js', () => {
    const makeGraphics = () => {
        const g: Record<string, unknown> = { alpha: 1, x: 0, y: 0 }
        for (const m of [
            'clear',
            'rect',
            'fill',
            'stroke',
            'circle',
            'moveTo',
            'lineTo',
            'poly',
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
        Object.assign(canvas, { width: 800, height: 600 })
        Object.defineProperty(canvas, 'style', {
            value: { border: '', borderRadius: '', cursor: '' },
            writable: true,
        })
        canvas.getBoundingClientRect = vi.fn().mockReturnValue({
            left: 0,
            top: 0,
            width: 800,
            height: 600,
        })
        return {
            init: vi.fn().mockResolvedValue(undefined),
            canvas,
            stage: { addChild: vi.fn() },
            renderer: { resize: vi.fn() },
            destroy: vi.fn(),
        }
    }
    return {
        Application: vi.fn(makeApp),
        Container: vi.fn(makeContainer),
        Graphics: vi.fn(makeGraphics),
        Assets: { load: vi.fn() },
        Text: vi.fn(),
        Sprite: vi.fn(),
        Texture: { EMPTY: {} },
    }
})

function setupDOM() {
    document.body.innerHTML = `
        <div id="path-navigator-container"></div>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <span id="level">1</span>
        <button id="start-btn">Start Game</button>
        <button id="end-btn" style="display:none;">End Game</button>
        <button id="play-again-btn">Play Again</button>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <span id="levels-completed">0</span>
        <span id="total-time">0</span>
    `
}

describe('initPathNavigatorGameFramework', () => {
    let instance:
        | Awaited<ReturnType<typeof initPathNavigatorGameFramework>>
        | undefined

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 1)
        )
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            })
        )
    })

    afterEach(() => {
        if (instance) {
            try {
                instance.cleanup()
            } catch {
                // ignore
            }
            instance = undefined
        }
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('should return undefined when container is missing', async () => {
            document.getElementById('path-navigator-container')!.remove()
            const result = await initPathNavigatorGameFramework()
            expect(result).toBeUndefined()
        })

        it('should return an instance with the framework API', async () => {
            instance = await initPathNavigatorGameFramework()
            expect(instance).toBeDefined()
            expect(instance!.game).toBeDefined()
            expect(instance!.renderer).toBeDefined()
            expect(typeof instance!.cleanup).toBe('function')
            expect(typeof instance!.restart).toBe('function')
            expect(typeof instance!.endGame).toBe('function')
            expect(typeof instance!.getState).toBe('function')
        })
    })

    describe('game controls', () => {
        it('start button click should start the game', async () => {
            instance = await initPathNavigatorGameFramework()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement

            startBtn.click()

            const state = instance!.getState()
            expect(state.isActive).toBe(true)
            expect(state.gameStarted).toBe(true)
            // Start button hidden, end button visible
            expect(startBtn.style.display).toBe('none')
        })

        it('end button click should end the game', async () => {
            instance = await initPathNavigatorGameFramework()
            const startBtn = document.getElementById('start-btn')
            const endBtn = document.getElementById('end-btn')

            ;(startBtn as HTMLButtonElement).click()
            await Promise.resolve()
            ;(endBtn as HTMLButtonElement).click()
            // Allow the async end() to settle
            await vi.waitFor(() => {
                expect(instance!.getState().isGameOver).toBe(true)
            })
        })

        it('play-again button should reset the game and hide overlay', async () => {
            instance = await initPathNavigatorGameFramework()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const playAgainBtn = document.getElementById(
                'play-again-btn'
            ) as HTMLButtonElement

            startBtn.click()
            playAgainBtn.click()

            const state = instance!.getState()
            expect(state.isActive).toBe(false)
            expect(state.currentLevel).toBe(1)
            expect(state.score).toBe(0)
            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('onEnd callback should populate the game-over overlay', async () => {
            instance = await initPathNavigatorGameFramework()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement

            startBtn.click()
            endBtn.click()

            await vi.waitFor(() => {
                const overlay = document.getElementById('game-over-overlay')!
                expect(overlay.classList.contains('hidden')).toBe(false)
            })

            const finalScore = document.getElementById('final-score')!
            expect(finalScore.textContent).toBe('0')
            const levelsCompleted = document.getElementById('levels-completed')!
            expect(levelsCompleted.textContent).toBe('0')
        })
    })

    describe('keyboard controls', () => {
        it('should not move the cursor before the game starts', async () => {
            instance = await initPathNavigatorGameFramework()
            const stateBefore = instance!.getState()
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp' })
            )
            const stateAfter = instance!.getState()
            expect(stateAfter.cursor.x).toBe(stateBefore.cursor.x)
            expect(stateAfter.cursor.y).toBe(stateBefore.cursor.y)
        })

        it('should move the cursor with arrow keys once started', async () => {
            instance = await initPathNavigatorGameFramework()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            startBtn.click()

            const beforeX = instance!.getState().cursor.x
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowRight' })
            )
            const afterX = instance!.getState().cursor.x
            expect(afterX).not.toBe(beforeX)
        })

        it('should ignore non-arrow keys', async () => {
            instance = await initPathNavigatorGameFramework()
            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            startBtn.click()

            const beforeX = instance!.getState().cursor.x
            const beforeY = instance!.getState().cursor.y
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter' })
            )
            const afterX = instance!.getState().cursor.x
            const afterY = instance!.getState().cursor.y
            expect(afterX).toBe(beforeX)
            expect(afterY).toBe(beforeY)
        })
    })

    describe('cleanup', () => {
        it('should not throw and should tear down listeners', async () => {
            instance = await initPathNavigatorGameFramework()
            expect(() => instance!.cleanup()).not.toThrow()
            instance = undefined
        })
    })
})
