import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initSnakeGame } from './init'

// Mock the game module
vi.mock('./game', () => ({
    createGameState: vi.fn(() => ({
        snake: [{ x: 10, y: 10 }],
        food: [],
        direction: 'right',
        score: 0,
        gameStarted: false,
        gameOver: false,
        paused: false,
        maxLength: 1,
        foodsEaten: 0,
        gameTime: 0,
    })),
    startGame: vi.fn(),
    togglePause: vi.fn(),
    resetGame: vi.fn(state => ({ ...state, score: 0, gameOver: false })),
    gameLoop: vi.fn(),
    updateUI: vi.fn(),
    changeDirection: vi.fn(),
    endGame: vi.fn().mockResolvedValue(undefined),
    GAME_CONSTANTS: {
        GRID_WIDTH: 20,
        GRID_HEIGHT: 20,
        CELL_SIZE: 25,
    },
}))

// Mock the renderer module
vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn().mockResolvedValue({
        app: null,
        stage: null,
        gridLayer: null,
        gameLayer: null,
    }),
    drawGrid: vi.fn(),
    draw: vi.fn(),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="snake-container"></div>
        <span id="final-score">0</span>
        <span id="final-length">3</span>
        <span id="final-foods">0</span>
        <span id="final-time">0s</span>
        <div id="game-over-overlay" class="hidden"></div>
        <button id="start-btn" style="display:inline-flex">Start</button>
        <button id="end-btn" style="display:none">End</button>
        <button id="pause-btn">Pause</button>
        <button id="reset-btn">Reset</button>
        <button id="restart-btn">Restart</button>
    `
}

describe('initSnakeGame', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    let gameInstance: Awaited<ReturnType<typeof initSnakeGame>>

    beforeEach(() => {
        setupDOM()
        vi.clearAllMocks()
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb)
            return rafCallbacks.length
        })
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        gameInstance = undefined
    })

    afterEach(() => {
        if (gameInstance) {
            try {
                gameInstance.cleanup()
            } catch {
                // ignore cleanup errors
            }
        }
        vi.useRealTimers()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
        rafCallbacks.length = 0
    })

    describe('initialization', () => {
        it('should return undefined when snake-container is missing', async () => {
            document.getElementById('snake-container')!.remove()
            const result = await initSnakeGame()
            expect(result).toBeUndefined()
        })

        it('should return a game instance with required methods', async () => {
            gameInstance = await initSnakeGame()
            expect(gameInstance).toBeDefined()
            expect(typeof gameInstance!.restart).toBe('function')
            expect(typeof gameInstance!.getState).toBe('function')
            expect(typeof gameInstance!.endGame).toBe('function')
            expect(typeof gameInstance!.cleanup).toBe('function')
        })

        it('should call setupPixiJS with the game container', async () => {
            const { setupPixiJS } = await import('./renderer')
            gameInstance = await initSnakeGame()
            expect(setupPixiJS).toHaveBeenCalledWith(
                expect.any(HTMLElement),
                expect.any(Object)
            )
        })

        it('should call drawGrid after setting up renderer', async () => {
            const { drawGrid } = await import('./renderer')
            gameInstance = await initSnakeGame()
            expect(drawGrid).toHaveBeenCalled()
        })

        it('should call updateUI after setup', async () => {
            const { updateUI } = await import('./game')
            gameInstance = await initSnakeGame()
            expect(updateUI).toHaveBeenCalled()
        })

        it('should start the draw loop with requestAnimationFrame', async () => {
            gameInstance = await initSnakeGame()
            // rafCallbacks are populated by our stubbed requestAnimationFrame
            expect(rafCallbacks.length).toBeGreaterThan(0)
        })
    })

    describe('game instance methods', () => {
        it('restart should call resetGame', async () => {
            const { resetGame } = await import('./game')
            gameInstance = await initSnakeGame()
            gameInstance!.restart()
            expect(resetGame).toHaveBeenCalled()
        })

        it('getState should return the current game state', async () => {
            gameInstance = await initSnakeGame()
            const state = gameInstance!.getState()
            expect(state).toBeDefined()
            expect(state).toHaveProperty('score')
        })

        it('endGame should call the game endGame function', async () => {
            const { endGame } = await import('./game')
            gameInstance = await initSnakeGame()
            await gameInstance!.endGame()
            expect(endGame).toHaveBeenCalled()
        })

        it('cleanup should cancel animation frame', async () => {
            gameInstance = await initSnakeGame()
            gameInstance!.cleanup()
            gameInstance = undefined // prevent double cleanup in afterEach
            expect(cancelAnimationFrame).toHaveBeenCalled()
        })

        it('cleanup should call app.destroy if renderer has an app', async () => {
            const { setupPixiJS } = await import('./renderer')
            const mockDestroy = vi.fn()
            vi.mocked(setupPixiJS).mockResolvedValueOnce({
                app: { destroy: mockDestroy } as any,
                stage: null as any,
                gridLayer: null as any,
                gameLayer: null as any,
            })

            gameInstance = await initSnakeGame()
            gameInstance!.cleanup()
            gameInstance = undefined
            expect(mockDestroy).toHaveBeenCalledWith(true, {
                children: true,
                texture: true,
            })
        })
    })

    describe('button event listeners', () => {
        it('clicking start-btn should call startGame', async () => {
            const { startGame } = await import('./game')
            gameInstance = await initSnakeGame()
            document.getElementById('start-btn')!.click()
            expect(startGame).toHaveBeenCalled()
        })

        it('clicking pause-btn should call togglePause', async () => {
            const { togglePause } = await import('./game')
            gameInstance = await initSnakeGame()
            document.getElementById('pause-btn')!.click()
            expect(togglePause).toHaveBeenCalled()
        })

        it('clicking reset-btn should call resetGame', async () => {
            const { resetGame } = await import('./game')
            gameInstance = await initSnakeGame()
            document.getElementById('reset-btn')!.click()
            expect(resetGame).toHaveBeenCalled()
        })

        it('clicking restart-btn should call resetGame', async () => {
            const { resetGame } = await import('./game')
            gameInstance = await initSnakeGame()
            document.getElementById('restart-btn')!.click()
            expect(resetGame).toHaveBeenCalled()
        })
    })

    describe('keyboard controls', () => {
        it('should ignore keypresses when game is not started', async () => {
            const { changeDirection } = await import('./game')
            gameInstance = await initSnakeGame()
            for (const key of [
                'ArrowUp',
                'ArrowDown',
                'ArrowLeft',
                'ArrowRight',
                'w',
                'a',
                's',
                'd',
            ]) {
                document.dispatchEvent(
                    new KeyboardEvent('keydown', { key, bubbles: true })
                )
            }
            expect(changeDirection).not.toHaveBeenCalled()
        })

        it('should handle all arrow key variants when game is started', async () => {
            const { changeDirection, createGameState } = await import('./game')
            // Make the state report gameStarted: true
            vi.mocked(createGameState).mockReturnValueOnce({
                snake: [{ x: 10, y: 10 }],
                food: [],
                direction: 'right',
                score: 0,
                gameStarted: true,
                gameOver: false,
                paused: false,
                maxLength: 1,
                foodsEaten: 0,
                gameTime: 0,
            } as any)

            gameInstance = await initSnakeGame()
            const state = gameInstance!.getState() as any
            state.gameStarted = true

            const keys = [
                'ArrowLeft',
                'ArrowRight',
                'ArrowUp',
                'ArrowDown',
                'a',
                'd',
                'w',
                's',
                'A',
                'D',
                'W',
                'S',
            ]
            for (const key of keys) {
                document.dispatchEvent(
                    new KeyboardEvent('keydown', { key, bubbles: true })
                )
            }

            const expectedDirections = [
                'left',
                'right',
                'up',
                'down',
                'left',
                'right',
                'up',
                'down',
                'left',
                'right',
                'up',
                'down',
            ]
            expect(changeDirection.mock.calls.length).toBe(keys.length)
            expectedDirections.forEach((dir, i) => {
                expect(changeDirection.mock.calls[i][1]).toBe(dir)
            })
        })

        it('should handle p/P for pause when game is started', async () => {
            const { togglePause } = await import('./game')
            gameInstance = await initSnakeGame()
            const state = gameInstance!.getState() as any
            state.gameStarted = true

            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'p', bubbles: true })
            )
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'P', bubbles: true })
            )
            expect(togglePause).toHaveBeenCalled()
        })
    })

    describe('onGameOver callback in enhanced state', () => {
        it('should update final stats and show overlay', async () => {
            gameInstance = await initSnakeGame()
            const state = gameInstance!.getState() as any

            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(42, {
                    maxLength: 5,
                    foodsEaten: 3,
                    gameTime: 15000,
                })

                expect(
                    document.getElementById('final-score')!.textContent
                ).toBe('42')
                expect(
                    document.getElementById('final-length')!.textContent
                ).toBe('5')
                expect(
                    document.getElementById('final-foods')!.textContent
                ).toBe('3')
                expect(document.getElementById('final-time')!.textContent).toBe(
                    '15s'
                )
                expect(
                    document
                        .getElementById('game-over-overlay')!
                        .classList.contains('hidden')
                ).toBe(false)
            }
        })

        it('should update button visibility on game over', async () => {
            gameInstance = await initSnakeGame()
            const state = gameInstance!.getState() as any

            if (typeof state.onGameOver === 'function') {
                await state.onGameOver(0, {
                    maxLength: 1,
                    foodsEaten: 0,
                    gameTime: 0,
                })

                const startBtn = document.getElementById(
                    'start-btn'
                ) as HTMLButtonElement
                const endBtn = document.getElementById(
                    'end-btn'
                ) as HTMLButtonElement
                expect(startBtn.style.display).toBe('inline-flex')
                expect(endBtn.style.display).toBe('none')
            }
        })

        it('should handle missing DOM elements gracefully', async () => {
            // Remove all optional elements
            document.getElementById('final-score')!.remove()
            document.getElementById('final-length')!.remove()
            document.getElementById('final-foods')!.remove()
            document.getElementById('final-time')!.remove()
            document.getElementById('game-over-overlay')!.remove()
            document.getElementById('start-btn')!.remove()
            document.getElementById('end-btn')!.remove()

            gameInstance = await initSnakeGame()
            const state = gameInstance!.getState() as any

            if (typeof state.onGameOver === 'function') {
                await expect(
                    state.onGameOver(0, {
                        maxLength: 1,
                        foodsEaten: 0,
                        gameTime: 0,
                    })
                ).resolves.toBeUndefined()
            }
        })
    })

    describe('draw loop', () => {
        it('should call draw via requestAnimationFrame', async () => {
            const { draw } = await import('./renderer')
            gameInstance = await initSnakeGame()

            // Manually run the first RAF callback to simulate draw loop
            if (rafCallbacks.length > 0) {
                rafCallbacks[0](0)
            }

            expect(draw).toHaveBeenCalled()
        })

        it('should stop draw loop after cleanup', async () => {
            const { draw } = await import('./renderer')
            gameInstance = await initSnakeGame()
            gameInstance!.cleanup()
            gameInstance = undefined

            const drawCallsBefore = vi.mocked(draw).mock.calls.length

            // Try to run more RAF callbacks - draw should not be called again
            if (rafCallbacks.length > 0) {
                rafCallbacks[rafCallbacks.length - 1](0)
            }

            expect(vi.mocked(draw).mock.calls.length).toBe(drawCallsBefore)
        })
    })
})
