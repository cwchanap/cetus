import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initBejeweledGame } from './init'

// Mock score service
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock BejeweledGame
vi.mock('./game', () => ({
    BejeweledGame: vi.fn().mockImplementation(() => ({
        start: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn(),
        getState: vi.fn(() => ({
            score: 0,
            timeRemaining: 60,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            grid: [],
            selectedCell: null,
            combo: 0,
        })),
        destroy: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        setAnimator: vi.fn(),
        clickCell: vi.fn(),
    })),
}))

// Mock BejeweledRenderer
vi.mock('./renderer', () => ({
    BejeweledRenderer: vi.fn().mockImplementation(() => ({
        initialize: vi.fn().mockResolvedValue(undefined),
        render: vi.fn(),
        cleanup: vi.fn(),
        setCellClickCallback: vi.fn(),
    })),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="bejeweled-container"></div>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <button id="start-btn" style="display:inline-flex">Start</button>
        <button id="end-btn" style="display:none">End</button>
        <button id="play-again-btn">Play Again</button>
    `
}

describe('initBejeweledGame', () => {
    let cleanup: (() => void) | undefined

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        cleanup = undefined
    })

    afterEach(() => {
        if (cleanup) {
            try {
                cleanup()
            } catch {
                // ignore
            }
        }
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('should return a result with game, renderer, and cleanup', async () => {
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            expect(result).toBeDefined()
            expect(result.game).toBeDefined()
            expect(result.renderer).toBeDefined()
            expect(typeof result.cleanup).toBe('function')
        })

        it('should initialize the renderer', async () => {
            const { BejeweledRenderer } = await import('./renderer')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const rendererInstance =
                vi.mocked(BejeweledRenderer).mock.results[0].value
            expect(rendererInstance.initialize).toHaveBeenCalled()
        })

        it('should call setAnimator on the game', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const gameInstance = vi.mocked(BejeweledGame).mock.results[0].value
            expect(gameInstance.setAnimator).toHaveBeenCalled()
        })

        it('should wire renderer cell click to game', async () => {
            const { BejeweledRenderer } = await import('./renderer')
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const rendererInstance =
                vi.mocked(BejeweledRenderer).mock.results[0].value
            const gameInstance = vi.mocked(BejeweledGame).mock.results[0].value
            expect(rendererInstance.setCellClickCallback).toHaveBeenCalled()

            // Trigger the captured callback to cover line 134
            const capturedCallback = vi.mocked(
                rendererInstance.setCellClickCallback
            ).mock.calls[0]?.[0]
            expect(capturedCallback).toBeDefined()
            capturedCallback!(1, 2)
            expect(gameInstance.clickCell).toHaveBeenCalledWith(1, 2)
        })

        it('should call renderer.render on initial state', async () => {
            const { BejeweledRenderer } = await import('./renderer')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const rendererInstance =
                vi.mocked(BejeweledRenderer).mock.results[0].value
            expect(rendererInstance.render).toHaveBeenCalled()
        })

        it('should accept custom config overrides', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame({ duration: 30 })
            cleanup = result.cleanup

            expect(vi.mocked(BejeweledGame)).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ duration: 30 }),
                expect.any(Object)
            )
        })
    })

    describe('enhanced callbacks', () => {
        it('onScoreUpdate should update score DOM element', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            // Get the callbacks passed to BejeweledGame
            const callbacksArg = vi.mocked(BejeweledGame).mock
                .calls[0][2] as any
            callbacksArg.onScoreUpdate(150)

            expect(document.getElementById('score')!.textContent).toBe('150')
        })

        it('onTimeUpdate should update time-remaining DOM element', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const callbacksArg = vi.mocked(BejeweledGame).mock
                .calls[0][2] as any
            callbacksArg.onTimeUpdate(45)

            expect(document.getElementById('time-remaining')!.textContent).toBe(
                '45'
            )
        })

        it('onStart should hide start-btn and show end-btn', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const callbacksArg = vi.mocked(BejeweledGame).mock
                .calls[0][2] as any
            callbacksArg.onStart()

            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            expect(startBtn.style.display).toBe('none')
            expect(endBtn.style.display).toBe('inline-flex')
        })

        it('onStart should hide game-over-overlay', async () => {
            const { BejeweledGame } = await import('./game')
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const callbacksArg = vi.mocked(BejeweledGame).mock
                .calls[0][2] as any
            callbacksArg.onStart()

            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('onEnd should show start-btn and hide end-btn', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const callbacksArg = vi.mocked(BejeweledGame).mock
                .calls[0][2] as any
            callbacksArg.onEnd(100, {})

            const startBtn = document.getElementById(
                'start-btn'
            ) as HTMLButtonElement
            const endBtn = document.getElementById(
                'end-btn'
            ) as HTMLButtonElement
            expect(startBtn.style.display).toBe('inline-flex')
            expect(endBtn.style.display).toBe('none')
        })

        it('onEnd should show game-over-overlay and update final score', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const callbacksArg = vi.mocked(BejeweledGame).mock
                .calls[0][2] as any
            callbacksArg.onEnd(250, {})

            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)
            expect(document.getElementById('final-score')!.textContent).toBe(
                '250'
            )
        })

        it('onStateChange should call renderer.render', async () => {
            const { BejeweledGame } = await import('./game')
            const { BejeweledRenderer } = await import('./renderer')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const rendererInstance =
                vi.mocked(BejeweledRenderer).mock.results[0].value
            vi.mocked(rendererInstance.render).mockClear()

            const callbacksArg = vi.mocked(BejeweledGame).mock
                .calls[0][2] as any
            callbacksArg.onStateChange({ score: 0, grid: [] })

            expect(rendererInstance.render).toHaveBeenCalled()
        })
    })

    describe('button event listeners', () => {
        it('clicking start-btn should call game.start', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const gameInstance = vi.mocked(BejeweledGame).mock.results[0].value
            document.getElementById('start-btn')!.click()
            expect(gameInstance.start).toHaveBeenCalled()
        })

        it('clicking end-btn should call game.end', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const gameInstance = vi.mocked(BejeweledGame).mock.results[0].value
            document.getElementById('end-btn')!.click()
            expect(gameInstance.end).toHaveBeenCalled()
        })

        it('clicking play-again-btn should reset and hide overlay', async () => {
            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')

            const gameInstance = vi.mocked(BejeweledGame).mock.results[0].value
            document.getElementById('play-again-btn')!.click()
            expect(gameInstance.reset).toHaveBeenCalled()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })
    })

    describe('cleanup', () => {
        it('should call renderer.cleanup and game.destroy on cleanup', async () => {
            const { BejeweledGame } = await import('./game')
            const { BejeweledRenderer } = await import('./renderer')
            const result = await initBejeweledGame()

            const gameInstance = vi.mocked(BejeweledGame).mock.results[0].value
            const rendererInstance =
                vi.mocked(BejeweledRenderer).mock.results[0].value

            result.cleanup()
            expect(rendererInstance.cleanup).toHaveBeenCalled()
            expect(gameInstance.destroy).toHaveBeenCalled()
        })
    })

    describe('achievement notifications', () => {
        it('should call showAchievementAward when game ends with achievements', async () => {
            const { BejeweledGame } = await import('./game')
            const showAchievementAward = vi.fn()
            vi.stubGlobal('window', { ...window, showAchievementAward })

            const result = await initBejeweledGame()
            cleanup = result.cleanup

            // Get the 'end' event listener
            const gameInstance = vi.mocked(BejeweledGame).mock.results[0].value
            const onCall = vi
                .mocked(gameInstance.on)
                .mock.calls.find(c => c[0] === 'end')

            expect(onCall).toBeDefined()
            const handler = onCall![1] as (...args: unknown[]) => void
            handler({
                type: 'end',
                data: {
                    newAchievements: [
                        {
                            id: 'bejeweled_pro',
                            name: 'Bejeweled Pro',
                            description: 'Score 500',
                            icon: '💎',
                            rarity: 'rare',
                        },
                    ],
                },
                timestamp: Date.now(),
            })
            expect(showAchievementAward).toHaveBeenCalled()

            vi.unstubAllGlobals()
        })

        it('should not call showAchievementAward when no achievements', async () => {
            const { BejeweledGame } = await import('./game')
            const showAchievementAward = vi.fn()
            vi.stubGlobal('window', { ...window, showAchievementAward })

            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const gameInstance = vi.mocked(BejeweledGame).mock.results[0].value
            const onCall = vi
                .mocked(gameInstance.on)
                .mock.calls.find(c => c[0] === 'end')

            expect(onCall).toBeDefined()
            const handler = onCall![1] as (...args: unknown[]) => void
            handler({
                type: 'end',
                data: { newAchievements: [] },
                timestamp: Date.now(),
            })
            expect(showAchievementAward).not.toHaveBeenCalled()

            vi.unstubAllGlobals()
        })
    })

    describe('missing DOM elements', () => {
        it('should handle missing optional DOM elements in callbacks', async () => {
            document.getElementById('score')!.remove()
            document.getElementById('time-remaining')!.remove()
            document.getElementById('game-over-overlay')!.remove()
            document.getElementById('final-score')!.remove()
            document.getElementById('start-btn')!.remove()
            document.getElementById('end-btn')!.remove()
            document.getElementById('play-again-btn')!.remove()

            const { BejeweledGame } = await import('./game')
            const result = await initBejeweledGame()
            cleanup = result.cleanup

            const callbacksArg = vi.mocked(BejeweledGame).mock
                .calls[0][2] as any
            expect(() => callbacksArg.onScoreUpdate(10)).not.toThrow()
            expect(() => callbacksArg.onTimeUpdate(30)).not.toThrow()
            expect(() => callbacksArg.onStart()).not.toThrow()
            expect(() => callbacksArg.onEnd(0, {})).not.toThrow()
        })
    })
})
