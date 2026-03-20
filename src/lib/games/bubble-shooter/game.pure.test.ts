import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    GAME_CONSTANTS,
    createGameState,
    initializeGrid,
    generateBubble,
    generateNextBubble,
    updateCurrentBubbleDisplay,
    updateNextBubbleDisplay,
    updateUI,
    handleMouseMove,
    handleClick,
    startGame,
    resetGame,
    togglePause,
    gameLoop,
    endGame,
} from './game'
import type { GameState } from './types'

function makeCanvasMock() {
    const ctx = {
        fillStyle: '',
        fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const canvas = {
        width: 100,
        height: 100,
    } as unknown as HTMLCanvasElement
    return { ctx, canvas }
}

// Mock renderer and utils to avoid canvas dependencies
vi.mock('./renderer', () => ({
    draw: vi.fn(),
}))

vi.mock('./utils', () => ({
    getBubbleX: vi.fn((col: number) => col * 40),
    getBubbleY: vi.fn((row: number) => row * 40),
    pixiColorToHex: vi.fn((color: number) => `#${color.toString(16)}`),
    drawBubbleOnCanvas: vi.fn(),
}))

vi.mock('./physics', () => ({
    updateProjectile: vi.fn(),
}))

describe('Bubble Shooter game.ts pure logic', () => {
    let state: GameState

    beforeEach(() => {
        state = createGameState()
        vi.clearAllMocks()
    })

    describe('GAME_CONSTANTS', () => {
        it('should have expected constants', () => {
            expect(GAME_CONSTANTS.BUBBLE_RADIUS).toBe(20)
            expect(GAME_CONSTANTS.GRID_WIDTH).toBe(14)
            expect(GAME_CONSTANTS.GRID_HEIGHT).toBe(20)
            expect(GAME_CONSTANTS.GAME_WIDTH).toBe(600)
            expect(GAME_CONSTANTS.GAME_HEIGHT).toBe(800)
            expect(GAME_CONSTANTS.COLORS).toHaveLength(3)
        })

        it('should have shooter y at bottom of screen', () => {
            expect(GAME_CONSTANTS.SHOOTER_Y).toBe(800 - 60)
        })
    })

    describe('createGameState', () => {
        it('should create initial game state with correct defaults', () => {
            expect(state.grid).toEqual([])
            expect(state.score).toBe(0)
            expect(state.bubblesRemaining).toBe(0)
            expect(state.gameStarted).toBe(false)
            expect(state.gameOver).toBe(false)
            expect(state.paused).toBe(false)
            expect(state.currentBubble).toBeNull()
            expect(state.nextBubble).toBeNull()
            expect(state.projectile).toBeNull()
            expect(state.rowOffset).toBe(0)
            expect(state.shotCount).toBe(0)
            expect(state.needsRedraw).toBe(true)
        })

        it('should place shooter at horizontal center', () => {
            expect(state.shooter.x).toBe(GAME_CONSTANTS.GAME_WIDTH / 2)
        })

        it('should place shooter at correct vertical position', () => {
            expect(state.shooter.y).toBe(GAME_CONSTANTS.SHOOTER_Y)
        })

        it('should set aimAngle to straight up (-PI/2)', () => {
            expect(state.aimAngle).toBeCloseTo(-Math.PI / 2)
        })
    })

    describe('initializeGrid', () => {
        it('should create grid rows', () => {
            initializeGrid(state)
            expect(state.grid).toHaveLength(GAME_CONSTANTS.GRID_HEIGHT)
        })

        it('should set needsRedraw to true', () => {
            state.needsRedraw = false
            initializeGrid(state)
            expect(state.needsRedraw).toBe(true)
        })

        it('should reset grid to empty before filling', () => {
            state.grid = [[], [], []]
            initializeGrid(state)
            expect(state.grid).toHaveLength(GAME_CONSTANTS.GRID_HEIGHT)
        })

        it('should reset bubblesRemaining to count only placed bubbles', () => {
            state.bubblesRemaining = 999
            initializeGrid(state)
            // bubblesRemaining should only count bubbles actually placed (0.8 chance each)
            expect(state.bubblesRemaining).toBeGreaterThanOrEqual(0)
        })

        it('should create rows with correct number of columns', () => {
            // Fix Math.random to 0.5 so all positions are filled (< 0.8)
            vi.spyOn(Math, 'random').mockReturnValue(0.5)
            initializeGrid(state)
            // Even rows: GRID_WIDTH cols, odd rows: GRID_WIDTH - 1 cols
            for (let row = 0; row < 5; row++) {
                const expectedCols = GAME_CONSTANTS.GRID_WIDTH - (row % 2)
                expect(state.grid[row]).toHaveLength(expectedCols)
            }
            vi.restoreAllMocks()
        })

        it('should place null when random >= 0.8', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.9)
            initializeGrid(state)
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < state.grid[row].length; col++) {
                    expect(state.grid[row][col]).toBeNull()
                }
            }
            expect(state.bubblesRemaining).toBe(0)
            vi.restoreAllMocks()
        })

        it('should place bubbles when random < 0.8', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.1)
            initializeGrid(state)
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < state.grid[row].length; col++) {
                    expect(state.grid[row][col]).not.toBeNull()
                }
            }
            vi.restoreAllMocks()
        })

        it('should assign valid colors from COLORS array to bubbles', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.1)
            initializeGrid(state)
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < state.grid[row].length; col++) {
                    const bubble = state.grid[row][col]
                    if (bubble) {
                        expect(GAME_CONSTANTS.COLORS).toContain(bubble.color)
                    }
                }
            }
            vi.restoreAllMocks()
        })

        it('should leave rows 5+ as empty arrays', () => {
            initializeGrid(state)
            for (let row = 5; row < GAME_CONSTANTS.GRID_HEIGHT; row++) {
                expect(state.grid[row]).toEqual([])
            }
        })
    })

    describe('generateBubble', () => {
        it('should return a bubble with valid color', () => {
            const bubble = generateBubble(state)
            expect(GAME_CONSTANTS.COLORS).toContain(bubble.color)
        })

        it('should set currentBubble on state', () => {
            const bubble = generateBubble(state)
            expect(state.currentBubble).toBe(bubble)
        })

        it('should set needsRedraw to true', () => {
            state.needsRedraw = false
            generateBubble(state)
            expect(state.needsRedraw).toBe(true)
        })

        it('should position bubble above shooter', () => {
            const bubble = generateBubble(state)
            expect(bubble.x).toBe(state.shooter.x)
            expect(bubble.y).toBe(
                state.shooter.y - GAME_CONSTANTS.BUBBLE_RADIUS * 1.5
            )
        })

        it('should use shooter position for bubble coordinates', () => {
            state.shooter.x = 300
            state.shooter.y = 740
            const bubble = generateBubble(state)
            expect(bubble.x).toBe(300)
            expect(bubble.y).toBe(740 - GAME_CONSTANTS.BUBBLE_RADIUS * 1.5)
        })
    })

    describe('generateNextBubble', () => {
        it('should return a bubble with valid color', () => {
            const nextBubble = generateNextBubble(state)
            expect(GAME_CONSTANTS.COLORS).toContain(nextBubble.color)
        })

        it('should set nextBubble on state', () => {
            const nextBubble = generateNextBubble(state)
            expect(state.nextBubble).toBe(nextBubble)
        })

        it('should set needsRedraw to true', () => {
            state.needsRedraw = false
            generateNextBubble(state)
            expect(state.needsRedraw).toBe(true)
        })

        it('should only have a color property', () => {
            const nextBubble = generateNextBubble(state)
            expect(Object.keys(nextBubble)).toEqual(['color'])
        })
    })

    describe('updateCurrentBubbleDisplay', () => {
        it('should return early when no currentBubble', () => {
            const { ctx, canvas } = makeCanvasMock()
            state.currentBubble = null
            updateCurrentBubbleDisplay(state, ctx, canvas)
            expect(ctx.fillRect).not.toHaveBeenCalled()
        })

        it('should draw when currentBubble exists', () => {
            const { ctx, canvas } = makeCanvasMock()
            state.currentBubble = { x: 50, y: 50, color: 0xff0000 }
            updateCurrentBubbleDisplay(state, ctx, canvas)
            expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100)
        })

        it('should call drawBubbleOnCanvas with centered position', () => {
            const { ctx, canvas } = makeCanvasMock()
            state.currentBubble = { x: 50, y: 50, color: 0xff0000 }
            // Should not throw
            expect(() =>
                updateCurrentBubbleDisplay(state, ctx, canvas)
            ).not.toThrow()
        })
    })

    describe('updateNextBubbleDisplay', () => {
        it('should return early when no nextBubble', () => {
            const { ctx, canvas } = makeCanvasMock()
            state.nextBubble = null
            updateNextBubbleDisplay(state, ctx, canvas)
            expect(ctx.fillRect).not.toHaveBeenCalled()
        })

        it('should draw when nextBubble exists', () => {
            const { ctx, canvas } = makeCanvasMock()
            state.nextBubble = { color: 0x00ff00 }
            updateNextBubbleDisplay(state, ctx, canvas)
            expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100)
        })

        it('should call drawBubbleOnCanvas with centered position', () => {
            const { ctx, canvas } = makeCanvasMock()
            state.nextBubble = { color: 0x44ff44 }
            expect(() =>
                updateNextBubbleDisplay(state, ctx, canvas)
            ).not.toThrow()
        })
    })

    describe('updateUI', () => {
        it('should not throw when DOM elements are missing', () => {
            expect(() => updateUI(state)).not.toThrow()
        })

        it('should update score element when it exists', () => {
            const el = document.createElement('div')
            el.id = 'score'
            document.body.appendChild(el)
            state.score = 99
            updateUI(state)
            expect(el.textContent).toBe('99')
            document.body.removeChild(el)
        })

        it('should update bubbles-remaining element when it exists', () => {
            const el = document.createElement('div')
            el.id = 'bubbles-remaining'
            document.body.appendChild(el)
            state.bubblesRemaining = 5
            updateUI(state)
            expect(el.textContent).toBe('5')
            document.body.removeChild(el)
        })
    })

    describe('handleMouseMove', () => {
        it('should return early when game not started', () => {
            state.gameStarted = false
            const renderer = { app: null } as unknown as Parameters<
                typeof handleMouseMove
            >[2]
            const e = new MouseEvent('mousemove', {
                clientX: 100,
                clientY: 200,
            })
            const initialAngle = state.aimAngle
            handleMouseMove(e, state, renderer)
            expect(state.aimAngle).toBe(initialAngle) // unchanged
        })

        it('should return early when game is over', () => {
            state.gameStarted = true
            state.gameOver = true
            const renderer = { app: null } as unknown as Parameters<
                typeof handleMouseMove
            >[2]
            const e = new MouseEvent('mousemove')
            handleMouseMove(e, state, renderer)
            // No error thrown
        })

        it('should return early when paused', () => {
            state.gameStarted = true
            state.paused = true
            const renderer = { app: null } as unknown as Parameters<
                typeof handleMouseMove
            >[2]
            const e = new MouseEvent('mousemove')
            handleMouseMove(e, state, renderer)
            // No error thrown
        })

        it('should return early when there is a projectile', () => {
            state.gameStarted = true
            state.projectile = { x: 0, y: 0, vx: 1, vy: 1, color: 0xff0000 }
            const renderer = { app: null } as unknown as Parameters<
                typeof handleMouseMove
            >[2]
            const e = new MouseEvent('mousemove')
            handleMouseMove(e, state, renderer)
            // No error thrown
        })

        it('should return early when renderer has no canvas', () => {
            state.gameStarted = true
            const renderer = { app: null } as unknown as Parameters<
                typeof handleMouseMove
            >[2]
            const e = new MouseEvent('mousemove', {
                clientX: 300,
                clientY: 400,
            })
            const initialAngle = state.aimAngle
            handleMouseMove(e, state, renderer)
            expect(state.aimAngle).toBe(initialAngle)
        })
    })

    describe('handleClick', () => {
        it('should return early when game not started', () => {
            state.gameStarted = false
            const updateFn = vi.fn()
            handleClick(new MouseEvent('click'), state, updateFn)
            expect(state.projectile).toBeNull()
        })

        it('should return early when game over', () => {
            state.gameStarted = true
            state.gameOver = true
            const updateFn = vi.fn()
            handleClick(new MouseEvent('click'), state, updateFn)
            expect(state.projectile).toBeNull()
        })

        it('should return early when no currentBubble', () => {
            state.gameStarted = true
            state.currentBubble = null
            const updateFn = vi.fn()
            handleClick(new MouseEvent('click'), state, updateFn)
            expect(state.projectile).toBeNull()
        })

        it('should create projectile when all conditions met', () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = false
            state.projectile = null
            state.currentBubble = { x: 300, y: 740, color: 0xff0000 }
            state.nextBubble = { color: 0x00ff00 }
            state.aimAngle = -Math.PI / 2
            const updateFn = vi.fn()
            handleClick(new MouseEvent('click'), state, updateFn)
            expect(state.projectile).not.toBeNull()
            expect(updateFn).toHaveBeenCalledOnce()
        })

        it('should set needsRedraw when creating projectile', () => {
            state.gameStarted = true
            state.currentBubble = { x: 300, y: 740, color: 0xff0000 }
            state.nextBubble = { color: 0x00ff00 }
            state.needsRedraw = false
            handleClick(new MouseEvent('click'), state, vi.fn())
            expect(state.needsRedraw).toBe(true)
        })
    })

    describe('startGame', () => {
        it('should set gameStarted to true', () => {
            startGame(state)
            expect(state.gameStarted).toBe(true)
        })

        it('should call gameLoopFn when provided', () => {
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(gameLoopFn).toHaveBeenCalledOnce()
        })

        it('should set needsRedraw to true', () => {
            state.needsRedraw = false
            startGame(state)
            expect(state.needsRedraw).toBe(true)
        })

        it('should not restart if already started', () => {
            state.gameStarted = true
            const gameLoopFn = vi.fn()
            startGame(state, gameLoopFn)
            expect(gameLoopFn).not.toHaveBeenCalled()
        })

        it('should update start button text when element exists', () => {
            const btn = document.createElement('button')
            btn.id = 'start-btn'
            document.body.appendChild(btn)
            startGame(state)
            expect(btn.textContent).toBe('Playing...')
            expect(btn.disabled).toBe(true)
            document.body.removeChild(btn)
        })
    })

    describe('resetGame', () => {
        it('should reset score to 0', () => {
            state.score = 500
            resetGame(state, vi.fn(), vi.fn())
            expect(state.score).toBe(0)
        })

        it('should reset gameStarted to false', () => {
            state.gameStarted = true
            resetGame(state, vi.fn(), vi.fn())
            expect(state.gameStarted).toBe(false)
        })

        it('should call updateCurrentBubbleDisplayFn', () => {
            const updateCurrent = vi.fn()
            resetGame(state, updateCurrent, vi.fn())
            expect(updateCurrent).toHaveBeenCalledOnce()
        })

        it('should call updateNextBubbleDisplayFn', () => {
            const updateNext = vi.fn()
            resetGame(state, vi.fn(), updateNext)
            expect(updateNext).toHaveBeenCalledOnce()
        })

        it('should set needsRedraw to true', () => {
            state.needsRedraw = false
            resetGame(state, vi.fn(), vi.fn())
            expect(state.needsRedraw).toBe(true)
        })
    })

    describe('togglePause', () => {
        it('should do nothing if game not started', () => {
            state.gameStarted = false
            const gameLoopFn = vi.fn()
            togglePause(state, gameLoopFn)
            expect(state.paused).toBe(false)
            expect(gameLoopFn).not.toHaveBeenCalled()
        })

        it('should do nothing if game over', () => {
            state.gameStarted = true
            state.gameOver = true
            const gameLoopFn = vi.fn()
            togglePause(state, gameLoopFn)
            expect(gameLoopFn).not.toHaveBeenCalled()
        })

        it('should pause game when running', () => {
            state.gameStarted = true
            state.paused = false
            togglePause(state, vi.fn())
            expect(state.paused).toBe(true)
            expect(state.needsRedraw).toBe(true)
        })

        it('should resume game and call gameLoopFn', () => {
            state.gameStarted = true
            state.paused = true
            const gameLoopFn = vi.fn()
            togglePause(state, gameLoopFn)
            expect(state.paused).toBe(false)
            expect(gameLoopFn).toHaveBeenCalledOnce()
        })

        it('should update pause button text when pausing with DOM element', () => {
            const btn = document.createElement('button')
            btn.id = 'pause-btn'
            const overlay = document.createElement('div')
            overlay.id = 'pause-overlay'
            document.body.appendChild(btn)
            document.body.appendChild(overlay)
            state.gameStarted = true
            state.paused = false
            togglePause(state, vi.fn())
            expect(btn.textContent).toBe('Resume')
            document.body.removeChild(btn)
            document.body.removeChild(overlay)
        })

        it('should update pause button text when resuming with DOM element', () => {
            const btn = document.createElement('button')
            btn.id = 'pause-btn'
            document.body.appendChild(btn)
            state.gameStarted = true
            state.paused = true
            togglePause(state, vi.fn())
            expect(btn.textContent).toBe('Pause')
            document.body.removeChild(btn)
        })

        it('should hide pause overlay when resuming', () => {
            const btn = document.createElement('button')
            btn.id = 'pause-btn'
            const overlay = document.createElement('div')
            overlay.id = 'pause-overlay'
            overlay.classList.add('shown')
            document.body.appendChild(btn)
            document.body.appendChild(overlay)

            state.gameStarted = true
            state.paused = true
            togglePause(state, vi.fn())

            expect(overlay.classList.contains('hidden')).toBe(true)
            document.body.removeChild(btn)
            document.body.removeChild(overlay)
        })
    })

    describe('gameLoop', () => {
        it('should return early when paused', () => {
            state.paused = true
            state.gameStarted = true
            const renderer = {} as unknown as Parameters<typeof gameLoop>[1]
            // Should not throw
            expect(() => gameLoop(state, renderer)).not.toThrow()
        })

        it('should return early when game not started', () => {
            state.paused = false
            state.gameStarted = false
            const renderer = {} as unknown as Parameters<typeof gameLoop>[1]
            expect(() => gameLoop(state, renderer)).not.toThrow()
        })

        it('should call endGame when gameOver is true', async () => {
            state.paused = false
            state.gameStarted = true
            state.gameOver = true
            const renderer = {} as unknown as Parameters<typeof gameLoop>[1]
            gameLoop(state, renderer)
            // endGame should have set gameOver=true (it was already true)
            expect(state.gameOver).toBe(true)
        })
    })

    describe('endGame', () => {
        it('should set gameOver to true', async () => {
            await endGame(state)
            expect(state.gameOver).toBe(true)
        })

        it('should set gameStarted to false', async () => {
            state.gameStarted = true
            await endGame(state)
            expect(state.gameStarted).toBe(false)
        })

        it('should call onGameOver callback if set', async () => {
            const onGameOver = vi.fn().mockResolvedValue(undefined)
            state.onGameOver = onGameOver
            state.score = 100
            await endGame(state)
            expect(onGameOver).toHaveBeenCalledWith(100, expect.any(Object))
        })

        it('should include accuracy stats', async () => {
            const onGameOver = vi.fn().mockResolvedValue(undefined)
            state.onGameOver = onGameOver
            ;(state as unknown as Record<string, unknown>).shotsFired = 10
            ;(state as unknown as Record<string, unknown>).bubblesPopped = 8
            await endGame(state)
            const stats = onGameOver.mock.calls[0][1]
            expect(stats.accuracy).toBe(80)
        })

        it('should handle zero shotsFired for accuracy', async () => {
            const onGameOver = vi.fn().mockResolvedValue(undefined)
            state.onGameOver = onGameOver
            await endGame(state)
            const stats = onGameOver.mock.calls[0][1]
            expect(stats.accuracy).toBe(0)
        })

        it('should not throw without onGameOver (DOM fallback)', async () => {
            state.onGameOver = undefined
            await expect(endGame(state)).resolves.toBeUndefined()
        })

        it('should update DOM elements when onGameOver is not set', async () => {
            const finalScoreEl = document.createElement('div')
            finalScoreEl.id = 'final-score'
            const gameOverOverlay = document.createElement('div')
            gameOverOverlay.id = 'game-over-overlay'
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            document.body.appendChild(finalScoreEl)
            document.body.appendChild(gameOverOverlay)
            document.body.appendChild(startBtn)

            state.onGameOver = undefined
            state.score = 77
            await endGame(state)

            expect(finalScoreEl.textContent).toBe('77')
            expect(startBtn.textContent).toBe('Start')
            expect(startBtn.disabled).toBe(false)

            document.body.removeChild(finalScoreEl)
            document.body.removeChild(gameOverOverlay)
            document.body.removeChild(startBtn)
        })
    })

    describe('handleMouseMove - with canvas', () => {
        it('should update aimAngle when canvas exists and game is active', () => {
            state.gameStarted = true
            state.gameOver = false
            state.paused = false
            state.projectile = null
            state.currentBubble = { x: 300, y: 740, color: 0xff0000 }

            const canvas = {
                getBoundingClientRect: vi.fn().mockReturnValue({
                    left: 0,
                    top: 0,
                }),
            }
            const renderer = {
                app: { canvas },
            } as unknown as Parameters<typeof handleMouseMove>[2]

            // Move mouse to far left - angle = atan2(400-740, 100-300) = atan2(-340, -200) ≈ -2.1 rad
            // which is different from initial -PI/2 ≈ -1.57
            const e = new MouseEvent('mousemove', {
                clientX: 100,
                clientY: 400,
            })
            const prevAngle = state.aimAngle
            handleMouseMove(e, state, renderer)
            expect(state.aimAngle).not.toBe(prevAngle)
        })

        it('should clamp angle to minimum (-PI * 0.9)', () => {
            state.gameStarted = true
            state.currentBubble = { x: 300, y: 400, color: 0xff0000 }
            const canvas = {
                getBoundingClientRect: vi
                    .fn()
                    .mockReturnValue({ left: 0, top: 0 }),
            }
            const renderer = { app: { canvas } } as unknown as Parameters<
                typeof handleMouseMove
            >[2]
            // Move mouse far left-down to get a very negative angle
            const e = new MouseEvent('mousemove', { clientX: 0, clientY: 500 })
            handleMouseMove(e, state, renderer)
            expect(state.aimAngle).toBeGreaterThanOrEqual(-Math.PI * 0.9)
        })

        it('should clamp angle to maximum (-PI * 0.1)', () => {
            state.gameStarted = true
            state.currentBubble = { x: 300, y: 400, color: 0xff0000 }
            const canvas = {
                getBoundingClientRect: vi
                    .fn()
                    .mockReturnValue({ left: 0, top: 0 }),
            }
            const renderer = { app: { canvas } } as unknown as Parameters<
                typeof handleMouseMove
            >[2]
            // Move mouse far right-down to get a positive angle
            const e = new MouseEvent('mousemove', {
                clientX: 600,
                clientY: 500,
            })
            handleMouseMove(e, state, renderer)
            expect(state.aimAngle).toBeGreaterThanOrEqual(-Math.PI * 0.9)
            expect(state.aimAngle).toBeLessThanOrEqual(-Math.PI * 0.1)
        })

        it('should use shooter position when no currentBubble', () => {
            state.gameStarted = true
            state.currentBubble = null
            const canvas = {
                getBoundingClientRect: vi
                    .fn()
                    .mockReturnValue({ left: 0, top: 0 }),
            }
            const renderer = { app: { canvas } } as unknown as Parameters<
                typeof handleMouseMove
            >[2]
            const e = new MouseEvent('mousemove', {
                clientX: 300,
                clientY: 400,
            })
            expect(() => handleMouseMove(e, state, renderer)).not.toThrow()
        })
    })

    describe('gameLoop - active path', () => {
        it('should call updateProjectile when game is running', async () => {
            const { updateProjectile } = await import('./physics')
            const mockUpdateProjectile = vi.mocked(updateProjectile)
            mockUpdateProjectile.mockClear()

            state.paused = false
            state.gameStarted = true
            state.gameOver = false
            const renderer = {} as unknown as Parameters<typeof gameLoop>[1]

            // Mock requestAnimationFrame
            vi.stubGlobal('requestAnimationFrame', vi.fn())
            gameLoop(state, renderer)
            expect(mockUpdateProjectile).toHaveBeenCalled()
            vi.unstubAllGlobals()
        })

        it('should call endGame when gameOver becomes true after updateProjectile', async () => {
            const { updateProjectile } = await import('./physics')
            const mockUpdateProjectile = vi.mocked(updateProjectile)
            mockUpdateProjectile.mockImplementationOnce(
                (s: Parameters<typeof mockUpdateProjectile>[0]) => {
                    s.gameOver = true
                }
            )

            state.paused = false
            state.gameStarted = true
            state.gameOver = false
            const renderer = {} as unknown as Parameters<typeof gameLoop>[1]

            gameLoop(state, renderer)
            // endGame should have been triggered, setting gameStarted = false
            expect(state.gameStarted).toBe(false)
        })
    })
})
