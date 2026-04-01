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
    processMove: vi.fn((state, _dir, totalMerges, callbacks) => ({
        state: { ...state, score: state.score + 10 },
        totalMerges: totalMerges + 1,
        callbacksToInvoke: callbacks?.onScoreChange
            ? [() => callbacks.onScoreChange(state.score + 10)]
            : [],
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

        it('should handle ArrowDown and ArrowLeft keys', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowDown',
                    bubbles: true,
                })
            )
            await vi.runAllTimersAsync()
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'down',
                expect.any(Number),
                expect.any(Object)
            )

            vi.mocked(processMove).mockClear()
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowLeft',
                    bubbles: true,
                })
            )
            await vi.runAllTimersAsync()
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'left',
                expect.any(Number),
                expect.any(Object)
            )
        })

        it('should handle lowercase a key for left direction', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'a', bubbles: true })
            )
            await vi.runAllTimersAsync()
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'left',
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

        it('should not process move when game is over', async () => {
            const { processMove, startGame } = await import('./game')
            // Make startGame return a state with gameOver=true
            vi.mocked(startGame).mockReturnValueOnce({
                board: Array(4)
                    .fill(null)
                    .map(() => Array(4).fill(null)),
                score: 0,
                maxTile: 0,
                gameStarted: true,
                gameOver: true,
                lastMoveAnimations: [],
            })
            gameInst = await init2048Game()
            gameInst!.start()
            vi.mocked(processMove).mockClear()

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
            )
            expect(processMove).not.toHaveBeenCalled()
        })

        it('should not process move while animating (rapid key presses)', async () => {
            const { processMove } = await import('./game')
            const { playAnimations } = await import('./renderer')

            // Make processMove return state with non-empty animations so handleMove
            // actually suspends on `await playAnimations(...)`.
            vi.mocked(processMove).mockReturnValueOnce({
                state: {
                    board: Array(4)
                        .fill(null)
                        .map(() => Array(4).fill(null)),
                    score: 10,
                    maxTile: 2,
                    gameStarted: true,
                    gameOver: false,
                    // non-empty so the `await playAnimations` branch is taken
                    lastMoveAnimations: [{ dummy: true }] as any,
                },
                totalMerges: 1,
                callbacksToInvoke: [],
            })

            // Keep the promise pending so handleMove stays suspended with isAnimating=true
            let resolveAnimation: () => void
            const pendingAnimation = new Promise<void>(res => {
                resolveAnimation = res
            })
            vi.mocked(playAnimations).mockReturnValueOnce(pendingAnimation)

            gameInst = await init2048Game()
            gameInst!.start()
            vi.mocked(processMove).mockClear()

            // First event: handleMove suspends at await playAnimations, isAnimating=true
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
            )
            expect(vi.mocked(processMove)).toHaveBeenCalledTimes(1)

            // Second event: handleKeyDown finds isAnimating=true → returns early
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
            )
            expect(vi.mocked(processMove)).toHaveBeenCalledTimes(1)

            // Resolve animation and await completion to avoid async work leaking into afterEach
            resolveAnimation!()
            await pendingAnimation
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

            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)
            expect(document.getElementById('final-score')!.textContent).toBe(
                '0'
            )
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

            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'achievementsEarned' })
            )
            dispatchSpy.mockRestore()
        })
    })

    describe('callbacks optional chain branches', () => {
        it('should skip callbacks.onGameOver when callbacks has no onGameOver (line 162)', async () => {
            // callbacks defined but no onGameOver → second ?. short-circuits
            const onScoreChange = vi.fn()
            gameInst = await init2048Game({ onScoreChange })
            gameInst!.start()
            const state = gameInst!.getState() as any
            state.gameStarted = true
            // Should not throw even though onGameOver is undefined
            await expect(gameInst!.endGame()).resolves.not.toThrow()
            await vi.runAllTimersAsync()
        })

        it('should call callbacks.onGameOver when provided (line 162 non-null branch)', async () => {
            // callbacks defined WITH onGameOver → second ?. proceeds → onGameOver is called
            const onGameOver = vi.fn()
            gameInst = await init2048Game({ onGameOver })
            gameInst!.start()
            const state = gameInst!.getState() as any
            state.gameStarted = true
            await gameInst!.endGame()
            await vi.runAllTimersAsync()
            expect(onGameOver).toHaveBeenCalled()
        })

        it('should skip callbacks.onWin when callbacks has no onWin (line 173)', async () => {
            // callbacks defined but no onWin → second ?. short-circuits
            const { processMove } = await import('./game')
            const onScoreChange = vi.fn()
            vi.mocked(processMove).mockImplementationOnce(
                (state: any, _dir, totalMerges, cbs: any) => ({
                    state: { ...state, lastMoveAnimations: [] },
                    totalMerges: totalMerges + 1,
                    callbacksToInvoke: [() => cbs?.onWin?.()],
                })
            )
            gameInst = await init2048Game({ onScoreChange })
            gameInst!.start()
            // Should not throw even though onWin is undefined
            expect(() =>
                document.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'ArrowRight',
                        bubbles: true,
                    })
                )
            ).not.toThrow()
            await vi.runAllTimersAsync()
        })

        it('should call callbacks.onWin when provided (line 173 non-null branch)', async () => {
            // callbacks defined WITH onWin → second ?. proceeds → onWin is called
            const { processMove } = await import('./game')
            const onWin = vi.fn()
            vi.mocked(processMove).mockImplementationOnce(
                (state: any, _dir, totalMerges, cbs: any) => ({
                    state: { ...state, lastMoveAnimations: [] },
                    totalMerges: totalMerges + 1,
                    callbacksToInvoke: [() => cbs?.onWin?.()],
                })
            )
            gameInst = await init2048Game({ onWin })
            gameInst!.start()
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                })
            )
            await vi.runAllTimersAsync()
            expect(onWin).toHaveBeenCalled()
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

            expect(onScoreChange).toHaveBeenCalledWith(10)
        })
    })

    describe('onGameOver with gameWon', () => {
        it('should show win title when gameWon is true', async () => {
            const { endGame } = await import('./game')
            vi.mocked(endGame).mockReturnValueOnce({
                state: { gameOver: true } as any,
                stats: {
                    finalScore: 2048,
                    maxTile: 2048,
                    moveCount: 100,
                    mergeCount: 50,
                    gameWon: true,
                },
            })

            gameInst = await init2048Game()
            gameInst!.start()
            await gameInst!.endGame()
            await vi.runAllTimersAsync()

            const title = document.getElementById('game-over-title')!
            expect(title.textContent).toBe('🎉 You Win!')
        })

        it('should log error when saveGameScore onError is called', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockImplementationOnce(
                async (_gameId, _score, _onSuccess, onError) => {
                    onError?.(new Error('network error'))
                    return { success: false }
                }
            )
            const errorSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})

            gameInst = await init2048Game()
            gameInst!.start()
            await gameInst!.endGame()
            await vi.runAllTimersAsync()

            expect(errorSpy).toHaveBeenCalledWith(
                'Failed to submit score:',
                expect.any(Error)
            )
            errorSpy.mockRestore()
        })
    })

    describe('onWin callback', () => {
        it('should show win notification when onWin is triggered', async () => {
            const { processMove } = await import('./game')
            vi.mocked(processMove).mockImplementationOnce(
                (state: any, _dir, totalMerges, callbacks: any) => ({
                    state: {
                        ...state,
                        score: state.score + 2048,
                        lastMoveAnimations: [],
                    },
                    totalMerges: totalMerges + 1,
                    callbacksToInvoke: [() => callbacks?.onWin?.()],
                })
            )

            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                })
            )
            // Advance time slightly but NOT past the 3000ms hide-again timer
            await vi.advanceTimersByTimeAsync(100)

            const winNotification = document.getElementById('win-notification')!
            expect(winNotification.classList.contains('hidden')).toBe(false)
        })

        it('should hide win notification after 3000ms', async () => {
            const { processMove } = await import('./game')
            vi.mocked(processMove).mockImplementationOnce(
                (state: any, _dir, totalMerges, callbacks: any) => ({
                    state: {
                        ...state,
                        score: state.score + 2048,
                        lastMoveAnimations: [],
                    },
                    totalMerges: totalMerges + 1,
                    callbacksToInvoke: [() => callbacks?.onWin?.()],
                })
            )

            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                })
            )
            await vi.advanceTimersByTimeAsync(3001)

            const winNotification = document.getElementById('win-notification')!
            expect(winNotification.classList.contains('hidden')).toBe(true)
        })
    })

    describe('handleMove early return guard', () => {
        it('should return early when game is not started', async () => {
            gameInst = await init2048Game()
            // Do NOT start game - gameStarted is false
            const { processMove } = await import('./game')
            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                })
            )
            expect(processMove).not.toHaveBeenCalled()
        })
    })

    describe('playAnimations path', () => {
        it('should call playAnimations when lastMoveAnimations is non-empty', async () => {
            const { processMove } = await import('./game')
            const { playAnimations } = await import('./renderer')
            vi.mocked(processMove).mockImplementationOnce(
                (state: any, _dir, totalMerges) => ({
                    state: {
                        ...state,
                        score: state.score + 10,
                        lastMoveAnimations: [
                            { type: 'move', tileId: '1', from: 0, to: 1 },
                        ],
                    },
                    totalMerges: totalMerges + 1,
                    callbacksToInvoke: [],
                })
            )

            gameInst = await init2048Game()
            gameInst!.start()

            document.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                })
            )
            await vi.runAllTimersAsync()

            expect(playAnimations).toHaveBeenCalled()
        })
    })

    describe('touch early returns', () => {
        it('should return early from touchstart when game is not started', async () => {
            gameInst = await init2048Game()
            // Do NOT start game
            const container = document.getElementById('game-2048-container')!
            expect(() =>
                container.dispatchEvent(
                    new TouchEvent('touchstart', {
                        touches: [{ clientX: 100, clientY: 100 } as Touch],
                    })
                )
            ).not.toThrow()
        })

        it('should return early from touchend when game is not started', async () => {
            gameInst = await init2048Game()
            // Do NOT start game
            const container = document.getElementById('game-2048-container')!
            expect(() =>
                container.dispatchEvent(
                    new TouchEvent('touchend', {
                        changedTouches: [
                            { clientX: 250, clientY: 100 } as Touch,
                        ],
                    })
                )
            ).not.toThrow()
        })

        it('should handle vertical down swipe', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            const container = document.getElementById('game-2048-container')!
            container.dispatchEvent(
                new TouchEvent('touchstart', {
                    touches: [{ clientX: 100, clientY: 100 } as Touch],
                })
            )

            // Vertical down swipe: large deltaY, small deltaX
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 103, clientY: 250 } as Touch],
            })
            container.dispatchEvent(touchEnd)
            await vi.runAllTimersAsync()
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'down',
                expect.any(Number),
                expect.any(Object)
            )
        })

        it('should handle left swipe', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            const container = document.getElementById('game-2048-container')!
            container.dispatchEvent(
                new TouchEvent('touchstart', {
                    touches: [{ clientX: 250, clientY: 100 } as Touch],
                })
            )

            // Left swipe: large negative deltaX, small deltaY
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 100, clientY: 103 } as Touch],
            })
            container.dispatchEvent(touchEnd)
            await vi.runAllTimersAsync()
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'left',
                expect.any(Number),
                expect.any(Object)
            )
        })

        it('should handle vertical up swipe', async () => {
            const { processMove } = await import('./game')
            gameInst = await init2048Game()
            gameInst!.start()

            const container = document.getElementById('game-2048-container')!
            container.dispatchEvent(
                new TouchEvent('touchstart', {
                    touches: [{ clientX: 100, clientY: 250 } as Touch],
                })
            )

            // Vertical up swipe: large negative deltaY
            const touchEnd = new TouchEvent('touchend', {
                changedTouches: [{ clientX: 103, clientY: 100 } as Touch],
            })
            container.dispatchEvent(touchEnd)
            await vi.runAllTimersAsync()
            expect(processMove).toHaveBeenCalledWith(
                expect.any(Object),
                'up',
                expect.any(Number),
                expect.any(Object)
            )
        })
    })
})
