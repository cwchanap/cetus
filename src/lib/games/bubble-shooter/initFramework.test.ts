import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initBubbleShooterGameFramework } from './initFramework'

// Mock score service
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock BubbleShooterGame
vi.mock('./BubbleShooterGame', () => ({
    BubbleShooterGame: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        getState: vi.fn(() => ({
            score: 0,
            timeRemaining: 9999,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            grid: [],
            shooter: { x: 300, y: 740 },
            currentBubble: null,
            nextBubble: null,
            aimAngle: -Math.PI / 2,
            projectile: null,
            bubblesRemaining: 0,
            shotsFired: 0,
            bubblesPopped: 0,
            largestCombo: 0,
            needsRedraw: false,
        })),
        setAimAngle: vi.fn(),
        shoot: vi.fn(),
        update: vi.fn(),
        markRendered: vi.fn(),
        getConfig: vi.fn(() => ({})),
        getConstantsView: vi.fn(() => ({})),
    })),
    DEFAULT_BUBBLE_SHOOTER_CONFIG: {
        duration: Number.MAX_SAFE_INTEGER,
        achievementIntegration: true,
        pausable: true,
        resettable: true,
        bubbleRadius: 20,
        gridWidth: 14,
        gridHeight: 20,
        colors: [0xff4444, 0x44ff44, 0x4444ff],
        gameWidth: 600,
        gameHeight: 800,
        shooterY: 740,
        projectileSpeed: 12,
        initialRows: 5,
        rowAddInterval: 5,
        bubbleFillChance: 0.8,
        newRowFillChance: 0.6,
        backgroundColor: 0,
    },
}))

// Mock BubbleShooterRenderer
vi.mock('./BubbleShooterRenderer', () => ({
    BubbleShooterRenderer: vi.fn().mockImplementation(() => {
        const canvasListeners: Record<
            string,
            ((...args: unknown[]) => void)[]
        > = {}
        return {
            initialize: vi.fn().mockResolvedValue(undefined),
            render: vi.fn(),
            cleanup: vi.fn(),
            getApp: vi.fn(() => ({
                canvas: {
                    style: {},
                    parentNode: null,
                    addEventListener: vi.fn(
                        (
                            event: string,
                            handler: (...args: unknown[]) => void
                        ) => {
                            canvasListeners[event] = (
                                canvasListeners[event] || []
                            ).concat(handler)
                        }
                    ),
                    removeEventListener: vi.fn(),
                    getBoundingClientRect: vi.fn(() => ({
                        left: 0,
                        top: 0,
                    })),
                },
            })),
            _canvasListeners: canvasListeners,
        }
    }),
    createBubbleShooterRendererConfig: vi.fn(() => ({
        type: 'canvas',
        container: '#game-container',
    })),
}))

// Mock errors module
vi.mock('@/lib/games/core/errors', () => ({
    DOMElementNotFoundError: class DOMElementNotFoundError extends Error {
        constructor(id: string) {
            super(`DOM element not found: ${id}`)
        }
    },
    handleGameError: vi.fn(),
}))

// Mock utils so drawBubbleOnCanvas / pixiColorToHex don't touch the canvas API
vi.mock('./utils', () => ({
    drawBubbleOnCanvas: vi.fn(),
    pixiColorToHex: vi.fn((c: number) => `#${c.toString(16)}`),
    getBubbleX: vi.fn(),
    getBubbleY: vi.fn(),
    getNeighbors: vi.fn(() => []),
}))

function createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {}
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag)
    for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value)
    }
    return el
}

function setupDOM() {
    const container = createElement('div', { id: 'game-container' })
    const currentBubble = createElement('canvas', {
        id: 'current-bubble',
        width: '64',
        height: '64',
    })
    const nextBubble = createElement('canvas', {
        id: 'next-bubble',
        width: '48',
        height: '48',
    })
    const score = createElement('span', { id: 'score' })
    score.textContent = '0'
    const bubblesRemaining = createElement('span', {
        id: 'bubbles-remaining',
    })
    bubblesRemaining.textContent = '0'
    const finalScore = createElement('span', { id: 'final-score' })
    finalScore.textContent = '0'
    const finalBubblesPopped = createElement('span', {
        id: 'final-bubbles-popped',
    })
    finalBubblesPopped.textContent = '0'
    const finalShots = createElement('span', { id: 'final-shots' })
    finalShots.textContent = '0'
    const finalAccuracy = createElement('span', { id: 'final-accuracy' })
    finalAccuracy.textContent = '0%'
    const finalCombo = createElement('span', { id: 'final-combo' })
    finalCombo.textContent = '0'
    const overlay = createElement('div', {
        id: 'game-over-overlay',
        class: 'hidden',
    })
    const pauseOverlay = createElement('div', {
        id: 'pause-overlay',
        class: 'hidden',
    })
    const startBtn = createElement('button', { id: 'start-btn' })
    startBtn.style.display = 'inline-flex'
    startBtn.textContent = 'Start'
    const endBtn = createElement('button', { id: 'end-btn' })
    endBtn.style.display = 'none'
    endBtn.textContent = 'End'
    const pauseBtn = createElement('button', { id: 'pause-btn' })
    pauseBtn.textContent = 'Pause'
    const resetBtn = createElement('button', { id: 'reset-btn' })
    resetBtn.textContent = 'Reset'
    const restartBtn = createElement('button', { id: 'restart-btn' })
    restartBtn.textContent = 'Restart'
    const resumeBtn = createElement('button', { id: 'resume-btn' })
    resumeBtn.textContent = 'Resume'

    document.body.replaceChildren(
        container,
        currentBubble,
        nextBubble,
        score,
        bubblesRemaining,
        finalScore,
        finalBubblesPopped,
        finalShots,
        finalAccuracy,
        finalCombo,
        overlay,
        pauseOverlay,
        startBtn,
        endBtn,
        pauseBtn,
        resetBtn,
        restartBtn,
        resumeBtn
    )

    // Provide a stub 2D context for the preview canvases
    const mockCtx = {
        fillRect: vi.fn(),
        fillStyle: '',
    }
    for (const c of [currentBubble, nextBubble]) {
        Object.defineProperty(c, 'getContext', {
            value: vi.fn(() => mockCtx),
            writable: true,
        })
    }
}

describe('initBubbleShooterGameFramework', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    let result: Awaited<ReturnType<typeof initBubbleShooterGameFramework>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        result = undefined
    })

    afterEach(() => {
        if (result) {
            try {
                result.cleanup()
            } catch {
                // ignore
            }
        }
        vi.useRealTimers()
        vi.unstubAllGlobals()
        document.body.replaceChildren()
        rafCallbacks.length = 0
    })

    describe('initialization', () => {
        it('returns undefined when game-container is missing', async () => {
            document.getElementById('game-container')!.remove()
            const res = await initBubbleShooterGameFramework()
            expect(res).toBeUndefined()
        })

        it('returns undefined when current-bubble canvas is missing', async () => {
            document.getElementById('current-bubble')!.remove()
            const res = await initBubbleShooterGameFramework()
            expect(res).toBeUndefined()
        })

        it('returns undefined when next-bubble canvas is missing', async () => {
            document.getElementById('next-bubble')!.remove()
            const res = await initBubbleShooterGameFramework()
            expect(res).toBeUndefined()
        })

        it('returns undefined when renderer initialization fails', async () => {
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            vi.mocked(BubbleShooterRenderer).mockImplementationOnce(
                () =>
                    ({
                        initialize: vi
                            .fn()
                            .mockRejectedValue(new Error('PixiJS failed')),
                        render: vi.fn(),
                        cleanup: vi.fn(),
                        getApp: vi.fn(() => null),
                    }) as any
            )
            const res = await initBubbleShooterGameFramework()
            expect(res).toBeUndefined()
        })

        it('returns an object with game, renderer, cleanup, restart, getState, endGame', async () => {
            result = await initBubbleShooterGameFramework()
            expect(result).toBeDefined()
            expect(result!.game).toBeDefined()
            expect(result!.renderer).toBeDefined()
            expect(typeof result!.cleanup).toBe('function')
            expect(typeof result!.restart).toBe('function')
            expect(typeof result!.getState).toBe('function')
            expect(typeof result!.endGame).toBe('function')
        })

        it('calls renderer.initialize', async () => {
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const rendererInstance = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value
            expect(rendererInstance.initialize).toHaveBeenCalled()
        })

        it('renders the initial state', async () => {
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const rendererInstance = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value
            expect(rendererInstance.render).toHaveBeenCalled()
        })

        it('starts the render loop', async () => {
            result = await initBubbleShooterGameFramework()
            expect(rafCallbacks.length).toBeGreaterThan(0)
        })
    })

    describe('game instance methods', () => {
        it('restart calls game.reset', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            result!.restart()
            expect(gameMock.reset).toHaveBeenCalled()
        })

        it('getState returns the game state', async () => {
            result = await initBubbleShooterGameFramework()
            const state = result!.getState()
            expect(state).toHaveProperty('score')
        })

        it('endGame calls game.end', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            await result!.endGame()
            expect(gameMock.end).toHaveBeenCalled()
        })

        it('cleanup cancels render loop and destroys game/renderer', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            const rendererMock = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value

            result!.cleanup()
            result = undefined

            expect(cancelAnimationFrame).toHaveBeenCalled()
            expect(rendererMock.cleanup).toHaveBeenCalled()
            expect(gameMock.destroy).toHaveBeenCalled()
        })
    })

    describe('button event listeners', () => {
        it('clicking start-btn calls game.start', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            document.getElementById('start-btn')!.click()
            expect(gameMock.start).toHaveBeenCalled()
        })

        it('clicking end-btn calls game.end', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            document.getElementById('end-btn')!.click()
            expect(gameMock.end).toHaveBeenCalled()
        })

        it('clicking pause-btn when not paused calls game.pause', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            document.getElementById('pause-btn')!.click()
            expect(gameMock.pause).toHaveBeenCalled()
        })

        it('clicking pause-btn when paused calls game.resume', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            vi.mocked(gameMock.getState).mockReturnValueOnce({
                ...gameMock.getState(),
                isPaused: true,
            })
            document.getElementById('pause-btn')!.click()
            expect(gameMock.resume).toHaveBeenCalled()
        })

        it('clicking reset-btn calls game.reset and hides overlay', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            document.getElementById('reset-btn')!.click()
            expect(gameMock.reset).toHaveBeenCalled()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('clicking restart-btn calls game.reset', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            document.getElementById('restart-btn')!.click()
            expect(gameMock.reset).toHaveBeenCalled()
        })

        it('clicking resume-btn calls game.resume', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            document.getElementById('resume-btn')!.click()
            expect(gameMock.resume).toHaveBeenCalled()
        })
    })

    describe('canvas aim/shoot handlers', () => {
        it('pointermove calls game.setAimAngle when active', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            const rendererInstance = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value
            const listeners = (
                rendererInstance as {
                    _canvasListeners: Record<
                        string,
                        ((...a: unknown[]) => void)[]
                    >
                }
            )._canvasListeners

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                isActive: true,
                isPaused: false,
                projectile: null,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                shooter: { x: 300, y: 740 },
            } as any)

            listeners['pointermove']?.[0]?.(
                new MouseEvent('pointermove', { clientX: 100, clientY: 100 })
            )
            expect(gameMock.setAimAngle).toHaveBeenCalled()
        })

        it('pointerdown aims before shooting', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            const rendererInstance = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value
            const listeners = (
                rendererInstance as {
                    _canvasListeners: Record<
                        string,
                        ((...a: unknown[]) => void)[]
                    >
                }
            )._canvasListeners

            // The pointerdown handler must update aim before shooting so a
            // tap shoots toward the touch point, not the last pointermove
            // position. Gate on active state so setAimAngle is reached.
            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                isActive: true,
                isPaused: false,
                projectile: null,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                shooter: { x: 300, y: 740 },
            } as any)
            vi.mocked(gameMock.setAimAngle).mockClear()
            vi.mocked(gameMock.shoot).mockClear()

            listeners['pointerdown']?.[0]?.(
                new MouseEvent('pointerdown', { clientX: 100, clientY: 100 })
            )

            expect(gameMock.setAimAngle).toHaveBeenCalledBefore(gameMock.shoot)
            expect(gameMock.shoot).toHaveBeenCalled()
        })
    })

    describe('keyboard controls', () => {
        it('p key toggles pause when active', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                isActive: true,
                isGameOver: false,
                isPaused: false,
            } as any)
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'p', bubbles: true })
            )
            expect(gameMock.pause).toHaveBeenCalled()
        })

        it('ignores pause key when not active', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'p', bubbles: true })
            )
            expect(gameMock.pause).not.toHaveBeenCalled()
        })
    })

    describe('enhanced callbacks', () => {
        it('onScoreUpdate updates the score element', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            callbacksArg.onScoreUpdate(150)
            expect(document.getElementById('score')!.textContent).toBe('150')
        })

        it('onStart hides start button and shows end button', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            callbacksArg.onStart()
            expect(
                (document.getElementById('start-btn') as HTMLButtonElement)
                    .style.display
            ).toBe('none')
            expect(
                (document.getElementById('end-btn') as HTMLButtonElement).style
                    .display
            ).toBe('inline-flex')
        })

        it('onEnd populates overlay stats and shows the overlay', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            callbacksArg.onEnd(250, {
                finalScore: 250,
                timeElapsed: 30,
                gameCompleted: true,
                bubblesPopped: 9,
                shotsFired: 12,
                accuracy: 75,
                largestCombo: 5,
            })
            expect(document.getElementById('final-score')!.textContent).toBe(
                '250'
            )
            expect(
                document.getElementById('final-bubbles-popped')!.textContent
            ).toBe('9')
            expect(document.getElementById('final-accuracy')!.textContent).toBe(
                '75%'
            )
            expect(
                document
                    .getElementById('game-over-overlay')!
                    .classList.contains('hidden')
            ).toBe(false)
        })

        it('onStateChange updates bubbles-remaining', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            callbacksArg.onStateChange({
                bubblesRemaining: 42,
                currentBubble: null,
                nextBubble: null,
            })
            expect(
                document.getElementById('bubbles-remaining')!.textContent
            ).toBe('42')
        })

        it('onEnd uses fallbacks for missing stats', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            callbacksArg.onEnd(0, {
                finalScore: 0,
                timeElapsed: 0,
                gameCompleted: false,
            })
            expect(
                document.getElementById('final-bubbles-popped')!.textContent
            ).toBe('0')
            expect(document.getElementById('final-accuracy')!.textContent).toBe(
                '0%'
            )
        })
    })

    describe('achievement handler', () => {
        it('calls showAchievementAward when achievements are present', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const showAchievementAward = vi.fn()
            vi.stubGlobal('showAchievementAward', showAchievementAward)

            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value

            const onGameEndCall = vi
                .mocked(gameMock.on)
                .mock.calls.find((call: any[]) => call[0] === 'end')
            const onGameEnd = onGameEndCall?.[1] as
                | ((...args: unknown[]) => unknown)
                | undefined

            if (onGameEnd) {
                onGameEnd({
                    data: { newAchievements: [{ id: 'bubble_master' }] },
                })
                expect(showAchievementAward).toHaveBeenCalledWith([
                    { id: 'bubble_master' },
                ])
            }
            vi.unstubAllGlobals()
        })

        it('handles end event with no achievements', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            const onGameEndCall = vi
                .mocked(gameMock.on)
                .mock.calls.find((call: any[]) => call[0] === 'end')
            const onGameEnd = onGameEndCall?.[1] as
                | ((...args: unknown[]) => unknown)
                | undefined
            expect(() => onGameEnd?.({ data: {} })).not.toThrow()
        })
    })

    describe('beforeunload handler', () => {
        it('calls preventDefault when game is active', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                isActive: true,
                isGameOver: false,
                isPaused: false,
            } as any)

            const event = new Event('beforeunload', { cancelable: true })
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
            window.dispatchEvent(event)
            expect(preventDefaultSpy).toHaveBeenCalled()
        })

        it('does not call preventDefault when game is not active', async () => {
            result = await initBubbleShooterGameFramework()
            const event = new Event('beforeunload', { cancelable: true })
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault')
            window.dispatchEvent(event)
            expect(preventDefaultSpy).not.toHaveBeenCalled()
        })
    })

    describe('render loop', () => {
        it('renders when needsRedraw is true', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            const rendererMock = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                needsRedraw: true,
            } as any)
            vi.mocked(rendererMock.render).mockClear()

            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }
            expect(rendererMock.render).toHaveBeenCalled()
            expect(gameMock.markRendered).toHaveBeenCalled()
        })

        it('does not render when needsRedraw is false', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            const rendererMock = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value

            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                needsRedraw: false,
            } as any)
            vi.mocked(rendererMock.render).mockClear()

            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }
            expect(rendererMock.render).not.toHaveBeenCalled()
        })
    })

    describe('custom callbacks passthrough', () => {
        it('forwards onStateChange', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const onStateChange = vi.fn()
            result = await initBubbleShooterGameFramework(undefined, {
                onStateChange,
            })
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            callbacksArg.onStateChange({
                bubblesRemaining: 0,
                currentBubble: null,
                nextBubble: null,
            })
            expect(onStateChange).toHaveBeenCalled()
        })

        it('forwards onEnd', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const onEnd = vi.fn()
            result = await initBubbleShooterGameFramework(undefined, { onEnd })
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            callbacksArg.onEnd(100, {
                finalScore: 100,
                timeElapsed: 10,
                gameCompleted: false,
                bubblesPopped: 1,
                shotsFired: 2,
                accuracy: 50,
                largestCombo: 1,
            })
            expect(onEnd).toHaveBeenCalledWith(100, expect.any(Object))
        })
    })

    describe('renderer error cleanup paths', () => {
        it('removes the canvas and cleans up the renderer when initialize fails with a mounted canvas', async () => {
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            const parent = document.createElement('div')
            const canvas = document.createElement('canvas')
            parent.appendChild(canvas)
            vi.mocked(BubbleShooterRenderer).mockImplementationOnce(
                () =>
                    ({
                        initialize: vi
                            .fn()
                            .mockRejectedValue(new Error('PixiJS failed')),
                        render: vi.fn(),
                        cleanup: vi.fn(),
                        getApp: vi.fn(() => ({ canvas })),
                    }) as any
            )
            const res = await initBubbleShooterGameFramework()
            expect(res).toBeUndefined()
            expect(canvas.parentNode).toBeNull()
        })

        it('swallows errors thrown during renderer cleanup after init failure', async () => {
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            const parent = document.createElement('div')
            const canvas = document.createElement('canvas')
            parent.appendChild(canvas)
            vi.mocked(BubbleShooterRenderer).mockImplementationOnce(
                () =>
                    ({
                        initialize: vi
                            .fn()
                            .mockRejectedValue(new Error('PixiJS failed')),
                        render: vi.fn(),
                        cleanup: vi.fn().mockImplementation(() => {
                            throw new Error('cleanup boom')
                        }),
                        getApp: vi.fn(() => ({ canvas })),
                    }) as any
            )
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            const res = await initBubbleShooterGameFramework()
            expect(res).toBeUndefined()
            expect(consoleSpy).toHaveBeenCalled()
            consoleSpy.mockRestore()
        })
    })

    describe('bubble preview drawing', () => {
        it('onStateChange draws the current and next bubble previews when colors are set', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { drawBubbleOnCanvas } = await import('./utils')
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            vi.mocked(drawBubbleOnCanvas).mockClear()
            callbacksArg.onStateChange({
                bubblesRemaining: 5,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                nextBubble: { color: 0x00ff00 },
            })
            expect(drawBubbleOnCanvas).toHaveBeenCalledTimes(2)
        })

        it('onStateChange does not redraw previews when colors are unchanged', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { drawBubbleOnCanvas } = await import('./utils')
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            callbacksArg.onStateChange({
                bubblesRemaining: 5,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                nextBubble: { color: 0x00ff00 },
            })
            vi.mocked(drawBubbleOnCanvas).mockClear()
            // Same colors as before → previews should NOT redraw.
            callbacksArg.onStateChange({
                bubblesRemaining: 4,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                nextBubble: { color: 0x00ff00 },
            })
            expect(drawBubbleOnCanvas).not.toHaveBeenCalled()
        })

        it('onStateChange skips previews when colors are undefined', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { drawBubbleOnCanvas } = await import('./utils')
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            vi.mocked(drawBubbleOnCanvas).mockClear()
            callbacksArg.onStateChange({
                bubblesRemaining: 0,
                currentBubble: null,
                nextBubble: null,
            })
            expect(drawBubbleOnCanvas).not.toHaveBeenCalled()
        })

        it('onStateChange skips previews when the canvas context is unavailable', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { drawBubbleOnCanvas } = await import('./utils')
            // Make both preview canvases return null from getContext so the
            // `!ctx` guard in drawCurrentBubblePreview / drawNextBubblePreview
            // triggers even when a color is present.
            const currentCanvas = document.getElementById(
                'current-bubble'
            ) as HTMLCanvasElement
            const nextCanvas = document.getElementById(
                'next-bubble'
            ) as HTMLCanvasElement
            Object.defineProperty(currentCanvas, 'getContext', {
                value: vi.fn(() => null),
                writable: true,
            })
            Object.defineProperty(nextCanvas, 'getContext', {
                value: vi.fn(() => null),
                writable: true,
            })
            result = await initBubbleShooterGameFramework()
            const callbacksArg = vi.mocked(BubbleShooterGame).mock
                .calls[0][1] as any
            vi.mocked(drawBubbleOnCanvas).mockClear()
            callbacksArg.onStateChange({
                bubblesRemaining: 5,
                currentBubble: { x: 300, y: 700, color: 0xff0000 },
                nextBubble: { color: 0x00ff00 },
            })
            expect(drawBubbleOnCanvas).not.toHaveBeenCalled()
        })
    })

    describe('pause UI synchronization', () => {
        it('syncPauseUI shows the pause overlay and updates button text when paused', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            // Persistently report paused so syncPauseUI takes the paused branch.
            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                isPaused: true,
            } as any)
            document.getElementById('resume-btn')!.click()
            const pauseBtn = document.getElementById('pause-btn')!
            const pauseOverlay = document.getElementById('pause-overlay')!
            expect(pauseBtn.textContent).toBe('Resume')
            expect(pauseOverlay.classList.contains('hidden')).toBe(false)
        })
    })

    describe('canvas controls edge cases', () => {
        it('returns a no-op cleanup when the renderer has no canvas', async () => {
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            vi.mocked(BubbleShooterRenderer).mockImplementationOnce(
                () =>
                    ({
                        initialize: vi.fn().mockResolvedValue(undefined),
                        render: vi.fn(),
                        cleanup: vi.fn(),
                        getApp: vi.fn(() => null),
                    }) as any
            )
            const res = await initBubbleShooterGameFramework()
            expect(res).toBeDefined()
            // cleanup should not throw even though there is no canvas.
            expect(() => res!.cleanup()).not.toThrow()
            res!.cleanup()
        })

        it('pointermove ignores input when the game is not active', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            const rendererInstance = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value
            const listeners = (
                rendererInstance as {
                    _canvasListeners: Record<
                        string,
                        ((...a: unknown[]) => void)[]
                    >
                }
            )._canvasListeners
            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                isActive: false,
            } as any)
            vi.mocked(gameMock.setAimAngle).mockClear()
            listeners['pointermove']?.[0]?.(
                new MouseEvent('pointermove', { clientX: 100, clientY: 100 })
            )
            expect(gameMock.setAimAngle).not.toHaveBeenCalled()
        })

        it('pointermove aims from the shooter when currentBubble is null', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            const { BubbleShooterRenderer } = await import(
                './BubbleShooterRenderer'
            )
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            const rendererInstance = vi.mocked(BubbleShooterRenderer).mock
                .results[0].value
            const listeners = (
                rendererInstance as {
                    _canvasListeners: Record<
                        string,
                        ((...a: unknown[]) => void)[]
                    >
                }
            )._canvasListeners
            const baseState = gameMock.getState()
            vi.mocked(gameMock.getState).mockReturnValue({
                ...baseState,
                isActive: true,
                isPaused: false,
                projectile: null,
                currentBubble: null,
                shooter: { x: 300, y: 740 },
            })
            vi.mocked(gameMock.setAimAngle).mockClear()
            listeners['pointermove']?.[0]?.(
                new MouseEvent('pointermove', { clientX: 100, clientY: 100 })
            )
            expect(gameMock.setAimAngle).toHaveBeenCalled()
        })
    })

    describe('keyboard resume', () => {
        it('p key resumes when paused', async () => {
            const { BubbleShooterGame } = await import('./BubbleShooterGame')
            result = await initBubbleShooterGameFramework()
            const gameMock = vi.mocked(BubbleShooterGame).mock.results[0].value
            vi.mocked(gameMock.getState).mockReturnValue({
                ...gameMock.getState(),
                isActive: true,
                isGameOver: false,
                isPaused: true,
            } as any)
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'p', bubbles: true })
            )
            expect(gameMock.resume).toHaveBeenCalled()
        })
    })
})
