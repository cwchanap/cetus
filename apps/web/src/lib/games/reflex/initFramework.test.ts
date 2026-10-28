// initFramework unit tests for Reflex
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initReflexGameFramework } from './initFramework'

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

// HPA-393: React owns the HUD spans, the start/stop buttons, the overlay
// and its final stats, so the initializer no longer wires or writes them —
// that coverage moved to the ReflexScreen island test. The initializer
// keeps the Pixi canvas host, the canvas click handler, the rAF render
// loop and the unload warning.
function setupDOM() {
    document.body.innerHTML = `
        <div id="game-canvas-container"></div>
    `
}

function getContainer(): HTMLElement {
    return document.getElementById('game-canvas-container')!
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
            const result = await initReflexGameFramework(getContainer())
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            result!.cleanup()
        })

        it('returns undefined when container is detached', async () => {
            const container = getContainer()
            container.remove()
            const result = await initReflexGameFramework(container)
            expect(result).toBeUndefined()
        })

        it('accepts custom config', async () => {
            const result = await initReflexGameFramework(getContainer(), {
                duration: 30,
            })
            expect(result).toBeDefined()
            expect(result!.game.getState().timeRemaining).toBe(30)
            result!.cleanup()
        })
    })

    describe('game start', () => {
        it('emits start with an active state and running spawn timer', async () => {
            const result = await initReflexGameFramework(getContainer())

            result!.game.start()

            const state = result!.game.getState()
            expect(state.isActive).toBe(true)
            expect(state.gameStarted).toBe(true)
            vi.advanceTimersByTime(1000)
            // Spawner ticked: objects appeared from the spawn interval.
            expect(result!.game.getActiveObjects().length).toBeGreaterThan(0)
            result!.cleanup()
        })
    })

    describe('game end', () => {
        it('ends the run through endGame', async () => {
            const result = await initReflexGameFramework(getContainer())
            result!.game.start()
            await result!.endGame()

            const state = result!.game.getState()
            expect(state.isActive).toBe(false)
            expect(state.isGameOver).toBe(true)
            result!.cleanup()
        })
    })

    describe('live stats update', () => {
        it('emits state-change with coin collections', async () => {
            const result = await initReflexGameFramework(getContainer())
            result!.game.start()

            vi.spyOn(Math, 'random').mockReturnValue(0.5) // always coins
            vi.advanceTimersByTime(1000)

            const coin = result!.game.getActiveObjects()[0]
            const stateChange = vi.fn()
            result!.game.on('state-change', stateChange)
            result!.game.handleCellClick(coin.cell.row, coin.cell.col)

            expect(stateChange).toHaveBeenCalled()
            expect(result!.game.getState().coinsCollected).toBe(1)

            result!.cleanup()
        })
    })

    describe('cleanup', () => {
        it('does not throw on cleanup', async () => {
            const result = await initReflexGameFramework(getContainer())
            result!.game.start()
            expect(() => result!.cleanup()).not.toThrow()
        })
    })

    describe('restart', () => {
        it('resets the game state', async () => {
            const result = await initReflexGameFramework(getContainer())
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
})
