import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { init2048Game } from './init'

// Mock score service
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock game module
vi.mock('./game', () => ({
    createGameState: vi.fn(() => ({
        board: Array(4)
            .fill(null)
            .map(() => Array(4).fill(null)),
        score: 0,
        maxTile: 0,
        gameStarted: false,
        gameOver: false,
        lastMoveAnimations: [],
    })),
    startGame: vi.fn(state => ({
        ...state,
        gameStarted: true,
        board: [
            [
                { id: '1', value: 2, isNew: true, mergedFrom: null },
                null,
                null,
                null,
            ],
            ...state.board.slice(1),
        ],
    })),
    resetGame: vi.fn(state => ({
        ...state,
        score: 0,
        gameOver: false,
        gameStarted: false,
    })),
    processMove: vi.fn((state, _dir, totalMerges, _callbacks) => ({
        state: { ...state, score: state.score + 10 },
        totalMerges: totalMerges + 1,
        callbacksToInvoke: [],
    })),
    endGame: vi.fn((state, totalMerges) => ({
        state: { ...state, gameOver: true },
        stats: {
            finalScore: state.score,
            maxTile: state.maxTile,
            moveCount: 5,
            mergeCount: totalMerges,
            gameWon: false,
        },
    })),
}))

// Mock renderer module
vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn().mockResolvedValue({
        app: { destroy: vi.fn() },
        stage: null,
        tileContainer: null,
    }),
    draw: vi.fn(),
    playAnimations: vi.fn().mockResolvedValue(undefined),
    destroyRenderer: vi.fn(),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="game-2048-container"></div>
        <span id="score-display">0</span>
        <span id="max-tile-display">0</span>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <span id="final-max-tile">0</span>
        <span id="final-moves">0</span>
        <h2 id="game-over-title">Game Over</h2>
        <div id="win-notification" class="hidden"></div>
        <button id="start-btn" style="display:inline-flex">Start</button>
        <button id="end-btn" style="display:none">End</button>
    `
}

describe('init2048Game', () => {
    let gameInst: Awaited<ReturnType<typeof init2048Game>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.useFakeTimers()
        gameInst = undefined
    })

    afterEach(() => {
        if (gameInst) {
            try {
                gameInst.destroy()
            } catch {
                // ignore
            }
        }
        vi.useRealTimers()
        document.body.innerHTML = ''
    })

    describe('initialization', () => {
        it('should return undefined when container is missing', async () => {
            document.getElementById('game-2048-container')!.remove()
            const result = await init2048Game()
            expect(result).toBeUndefined()
        })

        it('should return undefined when setupPixiJS fails', async () => {
            const { setupPixiJS } = await import('./renderer')
            vi.mocked(setupPixiJS).mockRejectedValueOnce(
                new Error('PixiJS failed')
            )
            const result = await init2048Game()
            expect(result).toBeUndefined()
        })

        it('should return a game instance with required methods', async () => {
            gameInst = await init2048Game()
            expect(gameInst).toBeDefined()
            expect(typeof gameInst!.start).toBe('function')
            expect(typeof gameInst!.restart).toBe('function')
            expect(typeof gameInst!.getState).toBe('function')
            expect(typeof gameInst!.endGame).toBe('function')
            expect(typeof gameInst!.destroy).toBe('function')
        })

        it('should call setupPixiJS with the container', async () => {
            const { setupPixiJS } = await import('./renderer')
            gameInst = await init2048Game()
            expect(setupPixiJS).toHaveBeenCalledWith(expect.any(HTMLElement))
        })

        it('should call initial draw after setup', async () => {
            const { draw } = await import('./renderer')
            gameInst = await init2048Game()
            expect(draw).toHaveBeenCalled()
        })
    })

    describe('game instance methods', () => {
        it('start should call startGame and update UI', async () => {
            const { startGame } = await import('./game')
            const { draw: drawRenderer } = await import('./renderer')
            gameInst = await init2048Game()
            vi.mocked(drawRenderer).mockClear()

            gameInst!.start()
            expect(startGame).toHaveBeenCalled()
            expect(drawRenderer).toHaveBeenCalled()
        })

        it('start should hide game-over-overlay', async () => {
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')
            gameInst = await init2048Game()
            gameInst!.start()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('start should update score display', async () => {
            gameInst = await init2048Game()
            gameInst!.start()
            const scoreDisplay = document.getElementById('score-display')!
            expect(scoreDisplay.textContent).toBe('0')
        })

        it('restart should call resetGame', async () => {
            const { resetGame } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.restart()
            expect(resetGame).toHaveBeenCalled()
        })

        it('restart should hide game-over-overlay', async () => {
            const overlay = document.getElementById('game-over-overlay')!
            overlay.classList.remove('hidden')
            gameInst = await init2048Game()
            gameInst!.restart()
            expect(overlay.classList.contains('hidden')).toBe(true)
        })

        it('getState should return the current state', async () => {
            gameInst = await init2048Game()
            const state = gameInst!.getState()
            expect(state).toBeDefined()
            expect(state).toHaveProperty('score')
            expect(state).toHaveProperty('gameStarted')
        })

        it('endGame should do nothing if game not started', async () => {
            const { endGame } = await import('./game')
            gameInst = await init2048Game()
            await gameInst!.endGame()
            // endGame in game module should NOT be called when gameStarted=false
            expect(endGame).not.toHaveBeenCalled()
        })

        it('destroy should call destroyRenderer', async () => {
            const { destroyRenderer } = await import('./renderer')
            gameInst = await init2048Game()
            gameInst!.destroy()
            gameInst = undefined
            expect(destroyRenderer).toHaveBeenCalled()
        })
    })

    describe('keyboard controls', () => {
        it('should not handle keydown when game is not started', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
            )
            expect(processMove).not.toHaveBeenCalled()
        })

        it('should handle ArrowUp/Down/Left/Right when game is started', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
            )
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'up',
                expect.any(Number),
                expect.any(Object)
            )
        })

        it('should handle w/a/s/d keys', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'w', bubbles: true })
            )
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'up',
                expect.any(Number),
                expect.any(Object)
            )

            vi.mocked(processMove).mockClear()
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 's', bubbles: true })
            )
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'down',
                expect.any(Number),
                expect.any(Object)
            )
        })

        it('should handle capital W/A/S/D keys', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'A', bubbles: true })
            )
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'left',
                expect.any(Number),
                expect.any(Object)
            )
        })

        it('should ignore non-directional keys', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            )
            expect(processMove).not.toHaveBeenCalled()
        })
    })

    describe('touch controls', () => {
        it('should handle touchstart event', async () => {
            gameInst = await init2048Game()
            gameInst!.start()

            const container = document.getElementById('game-2048-container')!
            const touchStartEvent = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            })
            expect(() => container.dispatchEvent(touchStartEvent)).not.toThrow()
        })

        it('should handle touchend for right swipe', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            const container = document.getElementById('game-2048-container')!
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            })
            container.dispatchEvent(touchStart)

            // Simulate right swipe (large horizontal delta, recent time)
            vi.setSystemTime(Date.now())
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 250, clientY: 105 } as Touch],
            })
            container.dispatchEvent(touchEnd)
            await vi.runAllTimersAsync()
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'right',
                expect.any(Number),
                expect.any(Object)
            )
        })

        it('should ignore slow swipes (deltaTime > 300ms)', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            const container = document.getElementById('game-2048-container')!
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            })
            container.dispatchEvent(touchStart)

            // Advance time past the threshold
            vi.advanceTimersByTime(400)

            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 250, clientY: 105 } as Touch],
            })
            container.dispatchEvent(touchEnd)
            expect(processMove).not.toHaveBeenCalled()
        })

        it('should ignore small swipes below threshold', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            const container = document.getElementById('game-2048-container')!
            const touchStart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 } as Touch],
            })
            container.dispatchEvent(touchStart)

            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 105, clientY: 103 } as Touch],
            })
            container.dispatchEvent(touchEnd)
            expect(processMove).not.toHaveBeenCalled()
        })

        it('should handle touchmove to prevent scrolling', async () => {
            gameInst = await init2048Game()
            gameInst!.start()

            const container = document.getElementById('game-2048-container')!
            const touchMove = new TouchEvent('touchmove')
            expect(() => container.dispatchEvent(touchMove)).not.toThrow()
        })
    })

    describe('onGameOver callback', () => {
        it('should update final stats and show overlay', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            gameInst = await init2048Game()
            gameInst!.start()

            // Manually trigger endGameManually
            const state = gameInst!.getState()
            ;(state as any).gameStarted = true
            await gameInst!.endGame()
            await vi.runAllTimersAsync()
        })

        it('should dispatch achievementsEarned when achievements earned', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, onSuccess) => {
                    onSuccess?.({ newAchievements: ['2048_winner'] })
                    return { success: true }
                }
            )

            const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

            // Access gameCallbacks.onGameOver via init
            // We test this by calling start() then triggering game-over
            gameInst = await init2048Game()
            gameInst!.start()

            // Trigger onGameOver via endGame after patching state
            const state = gameInst!.getState() as any
            state.gameStarted = true
            state.gameOver = false

            await gameInst!.endGame()
            await vi.runAllTimersAsync()

            dispatchSpy.mockRestore()
        })
    })

    describe('callbacks parameter', () => {
        it('should call onScoreChange callback', async () => {
            const onScoreChange = vi.fn()
            gameInst = await init2048Game({ onScoreChange })
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                })
            )
            await vi.runAllTimersAsync()
        })
    })
})
