import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn(),
}))

const swipeToDirection = vi.fn(() => null as 'N' | 'E' | 'S' | 'W' | null)
const keyToDirection = vi.fn((key: string) => {
    if (key === 'ArrowDown' || key === 's') {
        return 'S' as const
    }
    if (key === 'ArrowUp' || key === 'w') {
        return 'N' as const
    }
    if (key === 'ArrowLeft' || key === 'a') {
        return 'W' as const
    }
    if (key === 'ArrowRight' || key === 'd') {
        return 'E' as const
    }
    return null
})

vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn(async () => ({
        app: {
            canvas: document.createElement('canvas'),
            renderer: { resolution: 1 },
            destroy: vi.fn(),
        },
        gridGraphic: { clear: vi.fn(), destroy: vi.fn() },
        cellSize: 48,
    })),
    renderGrid: vi.fn(),
    cleanup: vi.fn(),
    swipeToDirection: (...args: unknown[]) => swipeToDirection(...args),
    keyToDirection: (...args: unknown[]) =>
        keyToDirection(...(args as [string])),
}))

import { initializeIceSlide } from './init'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'
import { cleanup as rendererCleanup, setupPixiJS } from './renderer'

function mountDom(): HTMLElement {
    document.body.innerHTML = `
      <div id="game-canvas-container"></div>
      <span id="score">0</span>
      <span id="level">1</span>
      <span id="moves">0</span>
      <span id="crystals">0</span>
      <span id="time-remaining">0:00</span>
      <span id="level-name">—</span>
      <button id="start-btn" style="display:none"></button>
      <button id="end-btn" style="display:inline-flex"></button>
      <div id="game-over-overlay" class="hidden">
        <span id="game-over-title"></span>
        <span id="final-score"></span>
      </div>
    `
    return document.getElementById('game-canvas-container')!
}

const baseCallbacks = () => ({
    onGameStart: vi.fn(),
    onMove: vi.fn(),
    onCrystal: vi.fn(),
    onLevelClear: vi.fn(),
    onHazard: vi.fn(),
    onScoreUpdate: vi.fn(),
    onTimeUpdate: vi.fn(),
    onWin: vi.fn(),
    onError: vi.fn(),
})

describe('initializeIceSlide', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        swipeToDirection.mockReturnValue(null)
        vi.mocked(saveGameScore).mockReset()
        mountDom()
    })

    it('starts a run and updates HUD after a move', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start()
        expect(handle.getGame()?.getState().status).toBe('playing')
        expect(document.getElementById('level-name')?.textContent).toBe(
            'First Frost'
        )

        handle.getGame()?.move('S')
        expect(handle.getGame()?.getState().levelIndex).toBe(1)
        expect(handle.getGame()?.getState().score).toBeGreaterThan(0)

        handle.cleanup()
    })

    it('submits score on stop after points and restores buttons', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start()
        handle.getGame()?.move('S')
        handle.stop()

        expect(saveGameScore).toHaveBeenCalled()
        const [gameId, score] = vi.mocked(saveGameScore).mock.calls[0]
        expect(gameId).toBe(GameID.ICE_SLIDE)
        expect(score).toBeGreaterThan(0)
        expect(
            document
                .getElementById('game-over-overlay')
                ?.classList.contains('hidden')
        ).toBe(false)
        expect(document.getElementById('start-btn')?.style.display).toBe(
            'inline-flex'
        )

        handle.cleanup()
    })

    it('does not submit score when stopping with zero points', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        handle.stop()
        expect(saveGameScore).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('exposes the handle on window.iceSlideGame for debugging', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        const debugWindow = window as Window & {
            iceSlideGame?: typeof handle
        }
        expect(debugWindow.iceSlideGame).toBe(handle)
        expect(debugWindow.iceSlideGame?.getGame()).toBeNull()
        await handle.start()
        expect(debugWindow.iceSlideGame?.getGame()?.getState().status).toBe(
            'playing'
        )
        handle.cleanup()
        expect(debugWindow.iceSlideGame).toBeUndefined()
    })

    it('forwards afterMove failures to onError', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start()

        vi.mocked(setupPixiJS).mockRejectedValueOnce(new Error('resize failed'))
        // Force a board-size change path: clear L1 (5x5) into L2 (6x6).
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
        )
        await vi.waitFor(() => {
            expect(callbacks.onError).toHaveBeenCalledWith(
                'Ice Slide Error',
                'resize failed'
            )
        })
        handle.cleanup()
    })

    it('resetLevel is exposed on the handle', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        expect(() => handle.resetLevel()).not.toThrow()
        handle.cleanup()
    })

    it('wires keyboard input to move the player', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()

        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
        )
        await vi.waitFor(() => {
            expect(handle.getGame()?.getState().levelIndex).toBe(1)
        })

        handle.cleanup()
    })

    it('wires swipe input when swipeToDirection returns a direction', async () => {
        swipeToDirection.mockReturnValue('S')
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()

        const lastSetup = await vi.mocked(setupPixiJS).mock.results.at(-1)
            ?.value
        expect(lastSetup).toBeTruthy()
        const el = lastSetup!.app.canvas as HTMLCanvasElement

        const down = new Event('pointerdown') as Event & {
            clientX: number
            clientY: number
        }
        Object.assign(down, { clientX: 10, clientY: 10 })
        const up = new Event('pointerup') as Event & {
            clientX: number
            clientY: number
        }
        Object.assign(up, { clientX: 10, clientY: 50 })
        el.dispatchEvent(down)
        el.dispatchEvent(up)

        await vi.waitFor(() => {
            expect(handle.getGame()?.getState().levelIndex).toBe(1)
        })
        expect(swipeToDirection).toHaveBeenCalled()
        handle.cleanup()
    })

    it('dispatches achievementsEarned on successful score save', async () => {
        const handler = vi.fn()
        window.addEventListener('achievementsEarned', handler)

        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        handle.getGame()?.move('S')

        vi.mocked(saveGameScore).mockImplementation(
            (_id, _score, onSuccess) => {
                onSuccess?.({
                    success: true,
                    newAchievements: [{ id: 'ice_slide_welcome' }],
                } as never)
                return Promise.resolve()
            }
        )
        handle.stop()

        expect(saveGameScore).toHaveBeenCalled()
        expect(handler).toHaveBeenCalled()
        expect(handler.mock.calls[0][0].detail).toEqual({
            achievementIds: [{ id: 'ice_slide_welcome' }],
        })
        window.removeEventListener('achievementsEarned', handler)
        handle.cleanup()
    })

    it('surfaces score errors via onError', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start()
        handle.getGame()?.move('S')

        vi.mocked(saveGameScore).mockImplementation(
            (_id, _score, _ok, onErrorCb) => {
                onErrorCb?.('nope')
                return Promise.resolve()
            }
        )
        handle.stop()
        expect(callbacks.onError).toHaveBeenCalledWith(
            'Score not saved',
            'nope'
        )
        handle.cleanup()
    })

    it('cleanup tears down renderer and game', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        handle.cleanup()
        expect(handle.getGame()).toBeNull()
        expect(rendererCleanup).toHaveBeenCalled()
    })

    it('stop is a no-op before start', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        expect(() => handle.stop()).not.toThrow()
        expect(saveGameScore).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('ignores direction keys after the run ends', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        handle.getGame()?.move('S')
        handle.stop()

        const event = new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            bubbles: true,
            cancelable: true,
        })
        const prevented = !window.dispatchEvent(event)
        // Handler must not call preventDefault once status is idle.
        expect(prevented).toBe(false)
        expect(event.defaultPrevented).toBe(false)
        handle.cleanup()
    })

    it('reuses the renderer when board size is unchanged on reset', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        const callsAfterStart = vi.mocked(setupPixiJS).mock.calls.length
        handle.resetLevel()
        // No-op then real same-level move both go through afterMove/ensureRenderer.
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
        )
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
        )
        await vi.waitFor(() => {
            expect(handle.getGame()?.getState().levelMoves).toBe(1)
        })
        expect(handle.getGame()?.getState().levelIndex).toBe(0)
        expect(vi.mocked(setupPixiJS).mock.calls.length).toBe(callsAfterStart)
        handle.cleanup()
    })

    it('shows mission-complete overlay and submits on full win', async () => {
        const { cloneGrid, findStart, parseGrid, slide } = await import(
            './physics'
        )
        const { ICE_SLIDE_LEVELS } = await import('./levels')
        const { DIRECTION_DELTA } = await import('./types')

        function solveMoves(
            level: (typeof ICE_SLIDE_LEVELS)[number]
        ): Array<'N' | 'E' | 'S' | 'W'> | null {
            const base = parseGrid(level)
            const start = findStart(base)
            type Node = {
                r: number
                c: number
                grid: ReturnType<typeof cloneGrid>
                path: Array<'N' | 'E' | 'S' | 'W'>
            }
            const queue: Node[] = [
                {
                    r: start.row,
                    c: start.col,
                    grid: cloneGrid(base),
                    path: [],
                },
            ]
            queue[0].grid[start.row][start.col] = 'ice'
            const seen = new Set([`${start.row},${start.col}`])
            const dirs = ['N', 'E', 'S', 'W'] as const
            while (queue.length) {
                const cur = queue.shift()
                if (!cur) {
                    break
                }
                for (const d of dirs) {
                    const g = cloneGrid(cur.grid)
                    const outcome = slide(
                        g,
                        { row: cur.r, col: cur.c },
                        DIRECTION_DELTA[d]
                    )
                    if (outcome.kind === 'noop' || outcome.kind === 'hazard') {
                        continue
                    }
                    const path = [...cur.path, d]
                    if (outcome.reachedGoal) {
                        return path
                    }
                    const key = `${outcome.end.row},${outcome.end.col}`
                    if (seen.has(key)) {
                        continue
                    }
                    seen.add(key)
                    if (path.length < 25) {
                        queue.push({
                            r: outcome.end.row,
                            c: outcome.end.col,
                            grid: g,
                            path,
                        })
                    }
                }
            }
            return null
        }

        const onWin = vi.fn()
        const container = mountDom()
        const handle = await initializeIceSlide(container, {
            ...baseCallbacks(),
            onWin,
        })
        await handle.start()

        for (let i = 0; i < ICE_SLIDE_LEVELS.length; i++) {
            const moves = solveMoves(ICE_SLIDE_LEVELS[i])
            expect(moves, `level ${i + 1} path`).not.toBeNull()
            for (const move of moves!) {
                handle.getGame()?.move(move)
            }
        }

        expect(onWin).toHaveBeenCalled()
        expect(
            document
                .getElementById('game-over-overlay')
                ?.classList.contains('hidden')
        ).toBe(false)
        expect(document.getElementById('game-over-title')?.textContent).toBe(
            'MISSION COMPLETE!'
        )
        expect(saveGameScore).toHaveBeenCalledTimes(1)
        handle.stop()
        expect(saveGameScore).toHaveBeenCalledTimes(1)
        expect(document.getElementById('game-over-title')?.textContent).toBe(
            'MISSION COMPLETE!'
        )
        handle.cleanup()
    })
})
