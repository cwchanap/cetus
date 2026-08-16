import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn(),
}))

const swipeToDirection = vi.fn(
    (_dx: number, _dy: number) => null as 'N' | 'E' | 'S' | 'W' | null
)
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
    swipeToDirection: (...args: unknown[]) =>
        swipeToDirection(...(args as [number, number])),
    keyToDirection: (...args: unknown[]) =>
        keyToDirection(...(args as [string])),
}))

vi.mock('./daily', async () => {
    const actual = await vi.importActual<typeof import('./daily')>('./daily')
    return {
        ...actual,
        createIceSlideDailyRunDefinition: vi.fn(
            actual.createIceSlideDailyRunDefinition
        ),
    }
})

vi.mock('./expedition', async () => {
    const actual =
        await vi.importActual<typeof import('./expedition')>('./expedition')
    return {
        ...actual,
        createIceSlideExpeditionRunDefinition: vi.fn(
            actual.createIceSlideExpeditionRunDefinition
        ),
    }
})

vi.mock('./run', async () => {
    const actual = await vi.importActual<typeof import('./run')>('./run')
    return {
        ...actual,
        cloneIceSlideRunDefinition: vi.fn(actual.cloneIceSlideRunDefinition),
    }
})

import { initializeIceSlide } from './init'
import { saveGameScore } from '@/lib/services/scoreService'
import { GameID } from '@/lib/games'
import { cleanup as rendererCleanup, setupPixiJS } from './renderer'
import { createIceSlideDailyRunDefinition } from './daily'
import { createIceSlideExpeditionRunDefinition } from './expedition'
import { CAMPAIGN_RUN_KEY, cloneIceSlideRunDefinition } from './run'
import { cloneGrid, slide } from './physics'
import {
    DIRECTION_DELTA,
    type CellType,
    type Direction,
    type IceSlideGameData,
} from './types'
import { createTestRun, createTestStage } from './test-fixtures'

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
      <div id="daily-meta" class="hidden">
        <span id="daily-date"></span>
        <span id="daily-reset"></span>
        <span id="daily-stage-progress"></span>
        <span id="daily-objective-clear"></span>
        <span id="daily-objective-efficient"></span>
        <span id="daily-objective-bonus"></span>
      </div>
      <div id="expedition-meta" class="hidden">
        <span id="expedition-seed"></span>
        <span id="expedition-stage-progress"></span>
        <span id="expedition-stars"></span>
        <span id="expedition-attempts"></span>
        <span id="expedition-objective-clear"></span>
        <span id="expedition-objective-efficient"></span>
        <span id="expedition-objective-bonus"></span>
      </div>
      <div id="stage-clear-overlay" class="hidden">
        <span id="stage-clear-title"></span>
        <span id="stage-clear-score"></span>
        <span id="stage-clear-clear"></span>
        <span id="stage-clear-efficient"></span>
        <span id="stage-clear-bonus"></span>
        <button id="stage-clear-continue-btn"></button>
      </div>
      <div id="run-final-stage-result" class="hidden">
        <span id="run-final-heading"></span>
        <span id="run-final-clear"></span>
        <span id="run-final-efficient"></span>
        <span id="run-final-bonus"></span>
      </div>
      <div id="expedition-summary" class="hidden">
        <span id="expedition-summary-seed"></span>
        <span id="expedition-summary-progress"></span>
        <span id="expedition-summary-stars"></span>
        <span id="expedition-summary-moves"></span>
        <span id="expedition-summary-crystals"></span>
        <span id="expedition-summary-attempts"></span>
        <span id="expedition-summary-time"></span>
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
    onScoreSaved: vi.fn(),
})

function findSolution(
    grid: CellType[][],
    start: { row: number; col: number }
): Direction[] | null {
    type Node = {
        grid: CellType[][]
        position: { row: number; col: number }
        path: Direction[]
    }
    const queue: Node[] = [
        { grid: cloneGrid(grid), position: { ...start }, path: [] },
    ]
    const seen = new Set<string>()
    const directions: Direction[] = ['N', 'E', 'S', 'W']

    while (queue.length) {
        const current = queue.shift()!
        const key = `${current.position.row},${current.position.col}:${current.grid
            .map(row => row.join(''))
            .join('/')}`
        if (seen.has(key)) {
            continue
        }
        seen.add(key)

        for (const direction of directions) {
            const nextGrid = cloneGrid(current.grid)
            const outcome = slide(
                nextGrid,
                current.position,
                DIRECTION_DELTA[direction]
            )
            if (outcome.kind === 'noop' || outcome.kind === 'hazard') {
                continue
            }
            const path = [...current.path, direction]
            if (outcome.reachedGoal) {
                return path
            }
            if (path.length < 40) {
                queue.push({
                    grid: nextGrid,
                    position: outcome.end,
                    path,
                })
            }
        }
    }
    return null
}

function solveCurrentStage(
    handle: Awaited<ReturnType<typeof initializeIceSlide>>
) {
    const game = handle.getGame()
    expect(game).not.toBeNull()
    const state = game!.getState()
    const path = findSolution(state.grid, state.player)
    expect(path).not.toBeNull()
    for (const direction of path!) {
        game!.move(direction)
    }
}

describe('initializeIceSlide', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        swipeToDirection.mockReturnValue(null)
        vi.mocked(saveGameScore).mockReset()
        mountDom()
    })

    afterEach(() => {
        const debugWindow = window as Window & {
            iceSlideGame?: { cleanup: () => void }
        }
        debugWindow.iceSlideGame?.cleanup()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('keeps a Daily retry on its captured UTC run across rollover', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-12T23:59:59Z'))
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('daily')
        const runKey = handle.getGame()!.getState().runKey
        const signatures = handle.getGame()!.getState().stageSignatures

        vi.setSystemTime(new Date('2026-08-13T00:00:01Z'))
        await handle.playAgain()
        expect(handle.getGame()!.getState().runKey).toBe(runKey)
        expect(handle.getGame()!.getState().stageSignatures).toEqual(signatures)

        await handle.start('daily')
        expect(handle.getGame()!.getState().runKey).toContain('2026-08-13')
        handle.cleanup()
    })

    it('keeps the no-argument start path on Campaign and hides Daily HUD', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start()
        expect(handle.getGame()!.getState().mode).toBe('campaign')
        expect(
            document.getElementById('daily-meta')?.classList.contains('hidden')
        ).toBe(true)
        handle.cleanup()
    })

    it('populates Daily HUD before the first move', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-12T23:59:59Z'))
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('daily')
        const state = handle.getGame()!.getState()
        expect(
            document.getElementById('daily-meta')?.classList.contains('hidden')
        ).toBe(false)
        expect(document.getElementById('daily-date')?.textContent).toBe(
            '2026-08-12'
        )
        expect(document.getElementById('daily-reset')?.textContent).toContain(
            '2026-08-13'
        )
        expect(
            document.getElementById('daily-stage-progress')?.textContent
        ).toBe('Stage 1 / 5')
        expect(
            document.getElementById('daily-objective-clear')?.textContent
        ).toContain('Clear')
        expect(
            document.getElementById('daily-objective-efficient')?.textContent
        ).toContain(String(state.parMoves))
        expect(
            document.getElementById('daily-objective-bonus')?.textContent
        ).not.toBe('')
        handle.cleanup()
    })

    it('gates Daily input behind Continue after a non-final clear', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('daily')
        solveCurrentStage(handle)

        expect(
            document
                .getElementById('stage-clear-overlay')
                ?.classList.contains('hidden')
        ).toBe(false)
        expect(
            document.getElementById('stage-clear-title')?.textContent
        ).toContain('Stage 1')
        expect(
            document.getElementById('stage-clear-score')?.textContent
        ).not.toBe('')

        const game = handle.getGame()!
        const movesBefore = game.getState().moves
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
        )
        expect(game.getState().moves).toBe(movesBefore)

        const canvas = (await vi.mocked(setupPixiJS).mock.results.at(-1)!.value)
            .app.canvas as HTMLCanvasElement
        const down = new Event('pointerdown') as Event & {
            clientX: number
            clientY: number
        }
        const up = new Event('pointerup') as Event & {
            clientX: number
            clientY: number
        }
        Object.assign(down, { clientX: 10, clientY: 10 })
        Object.assign(up, { clientX: 10, clientY: 60 })
        swipeToDirection.mockReturnValue('S')
        canvas.dispatchEvent(down)
        canvas.dispatchEvent(up)
        expect(game.getState().moves).toBe(movesBefore)

        handle.resetLevel()
        expect(game.getState().moves).toBe(movesBefore)

        document
            .getElementById('stage-clear-continue-btn')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(
            document
                .getElementById('stage-clear-overlay')
                ?.classList.contains('hidden')
        ).toBe(true)
        expect(
            document.getElementById('daily-stage-progress')?.textContent
        ).toBe('Stage 2 / 5')
        document
            .getElementById('stage-clear-continue-btn')
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        expect(
            document
                .getElementById('stage-clear-overlay')
                ?.classList.contains('hidden')
        ).toBe(true)
        handle.cleanup()
    })

    it('ends a zero-score Daily run locally without submitting', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('daily')
        handle.stop()

        expect(handle.getGame()!.getState().status).toBe('idle')
        expect(document.getElementById('game-over-title')?.textContent).toBe(
            'RUN ENDED'
        )
        expect(document.getElementById('final-score')?.textContent).toBe('0')
        expect(saveGameScore).not.toHaveBeenCalled()
        expect(document.getElementById('start-btn')?.style.display).toBe(
            'inline-flex'
        )
        handle.stop()
        handle.cleanup()
    })

    it('renders a Daily clear without a bonus row when no objective is assigned', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('daily')
        const game = handle.getGame()!
        ;(
            game as unknown as { state: { objectiveIds: string[] } }
        ).state.objectiveIds = []
        solveCurrentStage(handle)

        expect(document.getElementById('stage-clear-bonus')?.textContent).toBe(
            '— Bonus'
        )
        document.getElementById('stage-clear-continue-btn')?.click()
        handle.cleanup()
    })

    it('renders a final Daily result without a bonus row when no objective is assigned', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('daily')
        for (let stage = 1; stage <= 5; stage++) {
            if (stage === 5) {
                ;(
                    handle.getGame() as unknown as {
                        state: { objectiveIds: string[] }
                    }
                ).state.objectiveIds = []
            }
            solveCurrentStage(handle)
            if (stage < 5) {
                document.getElementById('stage-clear-continue-btn')?.click()
            }
        }

        expect(document.getElementById('run-final-bonus')?.textContent).toBe(
            '— Bonus'
        )
        handle.cleanup()
    })

    it('renders final Daily stars and submits immediately from onWin', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('daily')
        for (let stage = 1; stage <= 5; stage++) {
            solveCurrentStage(handle)
            if (stage < 5) {
                document.getElementById('stage-clear-continue-btn')?.click()
            }
        }

        const game = handle.getGame()!
        const gameData = game.getGameData()
        expect(game.getState().status).toBe('won')
        expect(
            document
                .getElementById('stage-clear-overlay')
                ?.classList.contains('hidden')
        ).toBe(true)
        expect(
            document
                .getElementById('run-final-stage-result')
                ?.classList.contains('hidden')
        ).toBe(false)
        expect(document.getElementById('run-final-heading')?.textContent).toBe(
            'Daily stars'
        )
        expect(
            document.getElementById('run-final-clear')?.textContent
        ).not.toBe('')
        expect(
            document.getElementById('run-final-efficient')?.textContent
        ).not.toBe('')
        expect(
            document.getElementById('run-final-bonus')?.textContent
        ).not.toBe('')
        expect(saveGameScore).toHaveBeenCalledTimes(1)

        const [, , , , submittedData, options] =
            vi.mocked(saveGameScore).mock.calls[0]
        expect(submittedData).toEqual(gameData)
        expect(options).toMatchObject({
            context: {
                mode: 'daily',
                competitionKey: gameData.runKey,
                rulesetVersion: gameData.rulesetVersion,
            },
        })
        handle.cleanup()
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

    it('replays Campaign when Play Again is requested without a Daily retry', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start()
        await handle.playAgain()

        expect(handle.getGame()?.getState().mode).toBe('campaign')
        expect(handle.getGame()?.getState().status).toBe('playing')
        handle.cleanup()
    })

    it('forwards afterMove failures to onError and ends the run', async () => {
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
        expect(handle.getGame()).toBeNull()
        expect(document.getElementById('start-btn')?.style.display).toBe(
            'inline-flex'
        )
        expect(document.getElementById('end-btn')?.style.display).toBe('none')
        handle.cleanup()
    })

    it('ignores a deferred renderer resize that completes after stop', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start()

        const initialRenderer = (await vi
            .mocked(setupPixiJS)
            .mock.results.at(-1)!.value)!
        let resolveResize!: (renderer: typeof initialRenderer) => void
        const pendingResize = new Promise<typeof initialRenderer>(resolve => {
            resolveResize = resolve
        })
        vi.mocked(setupPixiJS).mockReturnValueOnce(pendingResize)

        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
        )
        handle.stop()
        handle.cleanup()
        resolveResize(initialRenderer)
        await pendingResize
        await Promise.resolve()

        expect(handle.getGame()).toBeNull()
        expect(callbacks.onError).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('recovers when initial renderer setup fails', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)

        vi.mocked(setupPixiJS).mockRejectedValueOnce(new Error('boot failed'))
        await expect(handle.start()).rejects.toThrow('boot failed')
        expect(callbacks.onError).toHaveBeenCalledWith(
            'Ice Slide Error',
            'boot failed'
        )
        expect(handle.getGame()).toBeNull()
        expect(document.getElementById('start-btn')?.style.display).toBe(
            'inline-flex'
        )
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

    it('ignores keyboard input that does not map to a direction', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        const movesBefore = handle.getGame()?.getState().moves

        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'q', bubbles: true })
        )

        expect(handle.getGame()?.getState().moves).toBe(movesBefore)
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

    it('ignores score callbacks that arrive after the run is stale', async () => {
        const callbacks = baseCallbacks()
        let onSuccess: ((result: unknown) => void) | undefined
        let onError: ((error: string, result?: unknown) => void) | undefined
        const achievementHandler = vi.fn()
        window.addEventListener('achievementsEarned', achievementHandler)
        vi.mocked(saveGameScore).mockImplementation(
            (_id, _score, success, error) => {
                onSuccess = success as ((result: unknown) => void) | undefined
                onError = error as
                    | ((error: string, result?: unknown) => void)
                    | undefined
                return Promise.resolve()
            }
        )

        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start()
        handle.getGame()?.move('S')
        handle.stop()
        handle.cleanup()

        onSuccess?.({
            success: true,
            newAchievements: [{ id: 'stale' }],
        })
        onError?.('stale failure')

        expect(achievementHandler).not.toHaveBeenCalled()
        expect(callbacks.onError).not.toHaveBeenCalled()
        window.removeEventListener('achievementsEarned', achievementHandler)
    })

    it('forwards hazard and score updates from an active custom run', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start()

        handle.getGame()!.start(
            createTestRun([
                createTestStage({
                    rows: ['#####', '#S.H#', '#G..#', '#####'],
                }),
            ])
        )
        handle.getGame()!.move('E')

        expect(callbacks.onScoreUpdate).toHaveBeenCalledWith(0)
        expect(callbacks.onHazard).toHaveBeenCalledTimes(1)
        handle.cleanup()
    })

    it('does not submit a zero score from a win callback', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        ;(
            handle.getGame() as unknown as {
                callbacks: { onWin?: (score: number) => void }
            }
        ).callbacks.onWin?.(0)

        expect(saveGameScore).not.toHaveBeenCalled()
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

    it('silences an unauthenticated Daily score error', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start('daily')

        vi.mocked(saveGameScore).mockImplementation(
            (_id, _score, _onSuccess, onErrorCb) => {
                onErrorCb?.('You must be logged in to save scores', {
                    success: false,
                    code: 'UNAUTHENTICATED',
                })
                return Promise.resolve()
            }
        )

        for (let stage = 1; stage <= 5; stage++) {
            solveCurrentStage(handle)
            if (stage < 5) {
                document.getElementById('stage-clear-continue-btn')?.click()
            }
        }

        expect(saveGameScore).toHaveBeenCalledTimes(1)
        expect(callbacks.onError).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('fires onScoreSaved after a current successful Daily save', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start('daily')

        vi.mocked(saveGameScore).mockImplementation(
            (_id, _score, onSuccess) => {
                onSuccess?.({ success: true, newAchievements: [] } as never)
                return Promise.resolve()
            }
        )

        for (let stage = 1; stage <= 5; stage++) {
            solveCurrentStage(handle)
            if (stage < 5) {
                document.getElementById('stage-clear-continue-btn')?.click()
            }
        }

        expect(callbacks.onScoreSaved).toHaveBeenCalledTimes(1)
        const saved = callbacks.onScoreSaved.mock.calls[0][0]
        expect(saved.mode).toBe('daily')
        expect(saved.solved).toBe(true)
        const runKey = handle.getGame()?.getState().runKey
        expect(saved.runKey).toBe(runKey)
        handle.cleanup()
    })

    it('does not fire onScoreSaved on an unauthenticated Daily score error', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start('daily')

        vi.mocked(saveGameScore).mockImplementation(
            (_id, _score, _onSuccess, onErrorCb) => {
                onErrorCb?.('You must be logged in to save scores', {
                    success: false,
                    code: 'UNAUTHENTICATED',
                })
                return Promise.resolve()
            }
        )

        for (let stage = 1; stage <= 5; stage++) {
            solveCurrentStage(handle)
            if (stage < 5) {
                document.getElementById('stage-clear-continue-btn')?.click()
            }
        }

        expect(callbacks.onScoreSaved).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('does not fire onScoreSaved on a generic score error', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start()
        handle.getGame()?.move('S')

        vi.mocked(saveGameScore).mockImplementation(
            (_id, _score, _onSuccess, onErrorCb) => {
                onErrorCb?.('nope')
                return Promise.resolve()
            }
        )

        handle.stop()
        expect(callbacks.onScoreSaved).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('suppresses onScoreSaved when a newer run starts first', async () => {
        const callbacks = baseCallbacks()
        let onSuccess: ((result: unknown) => void) | undefined
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)
        await handle.start()
        handle.getGame()?.move('S')

        vi.mocked(saveGameScore).mockImplementation((_id, _score, success) => {
            onSuccess = success as ((result: unknown) => void) | undefined
            return Promise.resolve()
        })

        handle.stop()
        await handle.start()

        onSuccess?.({ success: true, newAchievements: [] })
        expect(callbacks.onScoreSaved).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('cleanup tears down renderer and game', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()
        container.appendChild(document.createElement('canvas'))
        handle.cleanup()
        expect(handle.getGame()).toBeNull()
        expect(rendererCleanup).toHaveBeenCalled()
        expect(container).toBeEmptyDOMElement()
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

    it('tears down the previous run when Daily materialization fails', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)

        // Mount a Campaign run first so a game/renderer is live.
        await handle.start()
        expect(handle.getGame()).not.toBeNull()

        // Force the next Daily generation to throw.
        vi.mocked(createIceSlideDailyRunDefinition).mockImplementationOnce(
            () => {
                throw new Error('gen failed')
            }
        )

        await expect(handle.start('daily')).rejects.toThrow('gen failed')
        expect(callbacks.onError).toHaveBeenCalledWith(
            'Ice Slide Error',
            'gen failed'
        )
        // failRun must have torn down the previous game/renderer.
        expect(handle.getGame()).toBeNull()
        expect(vi.mocked(rendererCleanup)).toHaveBeenCalled()
        expect(container.childNodes.length).toBe(0)
        expect(document.getElementById('start-btn')?.style.display).toBe(
            'inline-flex'
        )
        handle.cleanup()
    })

    it('starts, retries, and refreshes a seeded Expedition run', async () => {
        const words = [
            new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444]),
            new Uint32Array([0xaaaaaaaa, 0xbbbbbbbb, 0xcccccccc, 0xdddddddd]),
        ]
        const getRandomValues = vi.fn((array: Uint32Array) => {
            const next = words.shift()
            if (!next) {
                throw new Error('unexpected getRandomValues call')
            }
            array.set(next)
            return array
        })
        vi.stubGlobal('crypto', { getRandomValues })
        const mathRandom = vi.spyOn(Math, 'random')

        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('expedition')
        const first = handle.getGame()!.getState()
        expect(first.mode).toBe('expedition')
        expect(first.stagesTotal).toBe(6)
        expect(getRandomValues).toHaveBeenCalledTimes(1)

        await handle.playAgain()
        const retry = handle.getGame()!.getState()
        expect(retry.runKey).toBe(first.runKey)
        expect(retry.stageSignatures).toEqual(first.stageSignatures)
        expect(getRandomValues).toHaveBeenCalledTimes(1)

        await handle.start('expedition')
        const fresh = handle.getGame()!.getState()
        expect(fresh.runKey).not.toBe(first.runKey)
        expect(getRandomValues).toHaveBeenCalledTimes(2)

        expect(mathRandom).not.toHaveBeenCalled()
        mathRandom.mockRestore()
        handle.cleanup()
    })

    it('populates the Expedition HUD from the captured run', async () => {
        const seed = '11111111222222223333333344444444'
        const getRandomValues = vi.fn((array: Uint32Array) => {
            array.set(
                new Uint32Array([
                    0x11111111, 0x22222222, 0x33333333, 0x44444444,
                ])
            )
            return array
        })
        vi.stubGlobal('crypto', { getRandomValues })

        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('expedition')
        const state = handle.getGame()!.getState()
        const run = createIceSlideExpeditionRunDefinition(seed)

        expect(
            document
                .getElementById('expedition-meta')
                ?.classList.contains('hidden')
        ).toBe(false)
        // Raw seed from the captured run, not the run-key hash.
        expect(document.getElementById('expedition-seed')?.textContent).toBe(
            seed
        )
        // Tier comes from the captured run's current stage definition.
        expect(
            document.getElementById('expedition-stage-progress')?.textContent
        ).toBe(
            `Stage ${state.levelIndex + 1} / ${state.stagesTotal} · ` +
                run.stages[state.levelIndex].difficulty.toUpperCase()
        )
        // Max stars derives from the total stage count.
        expect(document.getElementById('expedition-stars')?.textContent).toBe(
            `Stars ${state.starsEarned} / ${state.stagesTotal * 3}`
        )
        expect(
            document.getElementById('expedition-attempts')?.textContent
        ).toBe(`Falls ${state.falls} · Resets ${state.resets}`)
        expect(
            document.getElementById('expedition-objective-clear')?.textContent
        ).toContain('Clear')
        expect(
            document.getElementById('expedition-objective-efficient')
                ?.textContent
        ).toContain(String(state.parMoves))
        expect(
            document.getElementById('expedition-objective-bonus')?.textContent
        ).not.toBe('')
        handle.cleanup()
    })

    it('submits a completed Expedition run with expedition context', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('expedition')
        for (let stage = 1; stage <= 6; stage++) {
            solveCurrentStage(handle)
        }

        const game = handle.getGame()!
        const gameData = game.getGameData()
        expect(game.getState().status).toBe('won')
        expect(saveGameScore).toHaveBeenCalledTimes(1)
        expect(
            document
                .getElementById('run-final-stage-result')
                ?.classList.contains('hidden')
        ).toBe(false)
        expect(document.getElementById('run-final-heading')?.textContent).toBe(
            'Expedition stars'
        )
        expect(
            document.getElementById('run-final-clear')?.textContent
        ).not.toBe('')
        expect(
            document.getElementById('run-final-efficient')?.textContent
        ).not.toBe('')
        expect(
            document.getElementById('run-final-bonus')?.textContent
        ).not.toBe('')
        expect(
            document
                .getElementById('expedition-summary')
                ?.classList.contains('hidden')
        ).toBe(false)
        expect(
            document.getElementById('expedition-summary-progress')?.textContent
        ).toBe(`${gameData.stagesTotal} / ${gameData.stagesTotal} stages`)
        expect(
            document.getElementById('expedition-summary-stars')?.textContent
        ).toBe(`${gameData.starsEarned} / ${gameData.stagesTotal * 3} stars`)

        const [, , , , submittedData, options] =
            vi.mocked(saveGameScore).mock.calls[0]
        expect(submittedData).toEqual(gameData)
        const expeditionData = submittedData as IceSlideGameData
        expect(expeditionData.mode).toBe('expedition')
        expect(expeditionData.solved).toBe(true)
        expect(options).toMatchObject({
            context: {
                mode: 'expedition',
                rulesetVersion: 1,
            },
        })
        expect(
            (
                options as {
                    context?: { competitionKey?: string }
                }
            ).context?.competitionKey
        ).toBeUndefined()
        handle.cleanup()
    })

    it('submits a positive-score Expedition End with expedition context', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('expedition')
        solveCurrentStage(handle)
        handle.stop()

        expect(saveGameScore).toHaveBeenCalledTimes(1)
        const [, score, , , submittedData, options] =
            vi.mocked(saveGameScore).mock.calls[0]
        expect(score).toBeGreaterThan(0)
        const expeditionData = submittedData as IceSlideGameData
        expect(expeditionData.mode).toBe('expedition')
        expect(expeditionData.solved).toBe(false)
        expect(options).toMatchObject({
            context: {
                mode: 'expedition',
                rulesetVersion: 1,
            },
        })
        expect(
            (
                options as {
                    context?: { competitionKey?: string }
                }
            ).context?.competitionKey
        ).toBeUndefined()
        expect(document.getElementById('game-over-title')?.textContent).toBe(
            'RUN ENDED'
        )
        // The same local summary as a zero-score End, plus submission.
        expect(
            document
                .getElementById('expedition-summary')
                ?.classList.contains('hidden')
        ).toBe(false)
        expect(
            document.getElementById('expedition-summary-progress')?.textContent
        ).toBe('1 / 6 stages')
        handle.cleanup()
    })

    it('ends a zero-score Expedition run locally without submitting', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('expedition')
        handle.stop()

        expect(handle.getGame()!.getState().status).toBe('idle')
        expect(document.getElementById('game-over-title')?.textContent).toBe(
            'RUN ENDED'
        )
        expect(document.getElementById('final-score')?.textContent).toBe('0')
        expect(saveGameScore).not.toHaveBeenCalled()
        expect(document.getElementById('start-btn')?.style.display).toBe(
            'inline-flex'
        )
        // Zero-score End still renders the local Expedition summary.
        expect(
            document
                .getElementById('expedition-summary')
                ?.classList.contains('hidden')
        ).toBe(false)
        expect(
            document.getElementById('expedition-summary-seed')?.textContent
        ).toMatch(/^[0-9a-f]{32}$/)
        expect(
            document.getElementById('expedition-summary-progress')?.textContent
        ).toBe('0 / 6 stages')
        expect(
            document.getElementById('expedition-summary-stars')?.textContent
        ).toBe('0 / 18 stars')
        expect(
            document.getElementById('expedition-summary-moves')?.textContent
        ).toBe('0')
        expect(
            document.getElementById('expedition-summary-crystals')?.textContent
        ).toBe('0')
        expect(
            document.getElementById('expedition-summary-attempts')?.textContent
        ).toBe('Falls 0 · Resets 0')
        expect(
            document.getElementById('expedition-summary-time')?.textContent
        ).toBe('0:00')
        handle.cleanup()
    })

    it('hides a previous Expedition summary when another mode starts and ends', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        // A local Expedition End renders its summary in the result overlay.
        await handle.start('expedition')
        handle.stop()
        expect(
            document
                .getElementById('expedition-summary')
                ?.classList.contains('hidden')
        ).toBe(false)

        // Starting another mode must reset that stale summary so a manual End
        // in the new run cannot show the previous Expedition's statistics.
        await handle.start('campaign')
        handle.stop()
        expect(
            document
                .getElementById('expedition-summary')
                ?.classList.contains('hidden')
        ).toBe(true)
        handle.cleanup()
    })

    it('silences an unauthenticated Expedition score error', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)

        await handle.start('expedition')
        solveCurrentStage(handle)

        vi.mocked(saveGameScore).mockImplementation(
            (_id, _score, _onSuccess, onErrorCb) => {
                onErrorCb?.('You must be logged in to save scores', {
                    success: false,
                    code: 'UNAUTHENTICATED',
                })
                return Promise.resolve()
            }
        )
        handle.stop()

        expect(saveGameScore).toHaveBeenCalledTimes(1)
        expect(callbacks.onError).not.toHaveBeenCalled()
        handle.cleanup()
    })

    it('clears stale retry state when an Expedition start fails after Daily', async () => {
        const callbacks = baseCallbacks()
        const container = mountDom()
        const handle = await initializeIceSlide(container, callbacks)

        await handle.start('daily')
        const dailyRunKey = handle.getGame()!.getState().runKey

        // Expedition materialization blows up mid-start.
        vi.mocked(createIceSlideExpeditionRunDefinition).mockImplementationOnce(
            () => {
                throw new Error('gen failed')
            }
        )
        await expect(handle.start('expedition')).rejects.toThrow('gen failed')
        expect(callbacks.onError).toHaveBeenCalledWith(
            'Ice Slide Error',
            'gen failed'
        )
        expect(handle.getGame()).toBeNull()
        expect(document.getElementById('start-btn')?.style.display).toBe(
            'inline-flex'
        )

        // failRun cleared the captured retry snapshot and the internal Daily
        // date/mode state: a later retry cannot silently relaunch the
        // previous Daily run.
        await handle.playAgain()
        const state = handle.getGame()!.getState()
        expect(state.mode).toBe('campaign')
        expect(state.runKey).toBe(CAMPAIGN_RUN_KEY)
        expect(state.runKey).not.toBe(dailyRunKey)
        expect(
            document.getElementById('daily-meta')?.classList.contains('hidden')
        ).toBe(true)
        handle.cleanup()
    })

    it('rejects Play Again in an objective mode when the retry snapshot is missing', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        // Activate Daily (objective mode) while the retry snapshot capture
        // yields null this once — objective mode is live with no captured run.
        vi.mocked(cloneIceSlideRunDefinition).mockImplementationOnce(
            () => null as never
        )
        await handle.start('daily')
        expect(handle.getGame()?.getState().mode).toBe('daily')

        await expect(handle.playAgain()).rejects.toThrow(
            'Ice Slide retry run is unavailable'
        )
        expect(handle.getGame()?.getState().mode).toBe('daily')
        handle.cleanup()
    })

    it('recreates the renderer when a generated Expedition stage changes size', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())

        await handle.start('expedition')
        const callsAfterStart = vi.mocked(setupPixiJS).mock.calls.length
        const keyByDirection: Record<'N' | 'E' | 'S' | 'W', string> = {
            N: 'ArrowUp',
            E: 'ArrowRight',
            S: 'ArrowDown',
            W: 'ArrowLeft',
        }

        // Play generated stages through the wired input so afterMove ensures
        // the renderer for each new board size. Same-size stages reuse the
        // renderer; the first size change recreates it. Expedition non-final
        // clears lock wired input behind the shared stage-clear overlay, so
        // Continue is clicked between stages.
        let stage = handle.getGame()!.getState()
        for (;;) {
            const path = findSolution(stage.grid, stage.player)
            expect(path).not.toBeNull()
            for (const direction of path!) {
                window.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: keyByDirection[direction],
                        bubbles: true,
                    })
                )
            }
            await vi.waitFor(() => {
                expect(handle.getGame()?.getState().levelIndex).toBeGreaterThan(
                    stage.levelIndex
                )
            })
            // No-op for the final clear (status is won, input never locked).
            document.getElementById('stage-clear-continue-btn')?.click()
            const next = handle.getGame()!.getState()
            if (next.rows === stage.rows && next.cols === stage.cols) {
                expect(vi.mocked(setupPixiJS).mock.calls.length).toBe(
                    callsAfterStart
                )
                stage = next
                continue
            }
            await vi.waitFor(() => {
                expect(
                    vi.mocked(setupPixiJS).mock.calls.length
                ).toBeGreaterThan(callsAfterStart)
            })
            break
        }
        handle.cleanup()
    })

    it('tears down pointer and keyboard handlers on cleanup', async () => {
        const container = mountDom()
        const handle = await initializeIceSlide(container, baseCallbacks())
        await handle.start()

        const canvas = (await vi.mocked(setupPixiJS).mock.results.at(-1)!.value)
            .app.canvas as HTMLCanvasElement

        handle.cleanup()

        // The canvas is detached and its listeners removed: dispatching on it
        // or on the window must not reach the game's input handlers.
        expect(container.childNodes.length).toBe(0)
        const down = new Event('pointerdown') as Event & {
            clientX: number
            clientY: number
        }
        Object.assign(down, { clientX: 10, clientY: 10 })
        const up = new Event('pointerup') as Event & {
            clientX: number
            clientY: number
        }
        Object.assign(up, { clientX: 10, clientY: 60 })
        canvas.dispatchEvent(down)
        canvas.dispatchEvent(up)
        const keydown = new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            bubbles: true,
            cancelable: true,
        })
        expect(window.dispatchEvent(keydown)).toBe(true)
        expect(keydown.defaultPrevented).toBe(false)
        expect(swipeToDirection).not.toHaveBeenCalled()
        expect(keyToDirection).not.toHaveBeenCalled()
        expect(handle.getGame()).toBeNull()
        handle.cleanup()
    })
})
