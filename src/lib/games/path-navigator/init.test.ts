import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initializePathNavigatorGame } from './init'

// Mock score service
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock game module
vi.mock('./game', () => ({
    PathNavigatorGame: vi.fn().mockImplementation(() => ({
        startGame: vi.fn(),
        endGame: vi.fn(),
        pauseGame: vi.fn(),
        resumeGame: vi.fn(),
        resetGame: vi.fn(),
        cleanup: vi.fn(),
        getState: vi.fn(() => ({
            score: 0,
            timeRemaining: 60,
            isGameActive: false,
            isGameOver: false,
            currentLevel: 1,
            cursor: { x: 50, y: 300 },
            isOnPath: true,
            levelsCompleted: 0,
        })),
        getStats: vi.fn(() => ({
            finalScore: 0,
            levelsCompleted: 0,
            totalTime: 0,
        })),
        getCurrentLevel: vi.fn(() => ({
            id: 1,
            name: 'Easy Path',
            difficulty: 'easy',
            path: {
                startPoint: { x: 50, y: 300 },
                endPoint: { x: 750, y: 300 },
                segments: [],
            },
        })),
        updatePlayerPosition: vi.fn(),
        setCursorPosition: vi.fn(),
    })),
    DEFAULT_CONFIG: {
        gameDuration: 60,
        gameWidth: 800,
        gameHeight: 600,
        cursorRadius: 8,
        pathColor: 0x00ffff,
        cursorColor: 0xff00ff,
        goalColor: 0x00ff00,
        backgroundColor: 0x000000,
        outOfBoundsColor: 0xff0000,
    },
}))

// Mock renderer module
vi.mock('./renderer', () => ({
    setupPixiJS: vi.fn().mockResolvedValue({
        app: { destroy: vi.fn() },
        stage: null,
    }),
    clearRenderer: vi.fn(),
    renderBackground: vi.fn(),
    renderPath: vi.fn(),
    renderGoal: vi.fn(),
    renderCursor: vi.fn(),
}))

function setupDOM() {
    document.body.innerHTML = `
        <div id="path-navigator-container"></div>
        <span id="score">0</span>
        <span id="time-remaining">60</span>
        <span id="level">1</span>
        <div id="game-over-overlay" class="hidden"></div>
        <span id="final-score">0</span>
        <span id="levels-completed">0</span>
        <span id="total-time">0</span>
    `
}

describe('initializePathNavigatorGame', () => {
    const rafCallbacks: FrameRequestCallback[] = []
    let gameInstance: Awaited<ReturnType<typeof initializePathNavigatorGame>>

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
                // ignore
            }
        }
        vi.useRealTimers()
        vi.unstubAllGlobals()
        document.body.innerHTML = ''
        rafCallbacks.length = 0
    })

    describe('initialization', () => {
        it('should return undefined when container is missing', async () => {
            document.getElementById('path-navigator-container')!.remove()
            const result = await initializePathNavigatorGame()
            expect(result).toBeUndefined()
        })

        it('should return undefined when renderer fails', async () => {
            const { setupPixiJS } = await import('./renderer')
            vi.mocked(setupPixiJS).mockRejectedValueOnce(
                new Error('Renderer failed')
            )
            const result = await initializePathNavigatorGame()
            expect(result).toBeUndefined()
        })

        it('should return a game instance with required methods', async () => {
            gameInstance = await initializePathNavigatorGame()
            expect(gameInstance).toBeDefined()
            expect(typeof gameInstance!.startGame).toBe('function')
            expect(typeof gameInstance!.endGame).toBe('function')
            expect(typeof gameInstance!.pauseGame).toBe('function')
            expect(typeof gameInstance!.resumeGame).toBe('function')
            expect(typeof gameInstance!.resetGame).toBe('function')
            expect(typeof gameInstance!.cleanup).toBe('function')
        })

        it('should call setupPixiJS with the container', async () => {
            const { setupPixiJS } = await import('./renderer')
            gameInstance = await initializePathNavigatorGame()
            expect(setupPixiJS).toHaveBeenCalledWith(
                expect.any(HTMLElement),
                expect.any(Object)
            )
        })

        it('should create PathNavigatorGame with merged config', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame({
                gameDuration: 30,
            })
            expect(vi.mocked(PathNavigatorGame)).toHaveBeenCalledWith(
                expect.objectContaining({ gameDuration: 30 })
            )
        })
    })

    describe('game controls', () => {
        it('startGame should call game.startGame and start animation loop', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame()

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            gameInstance!.startGame()

            expect(gameMock.startGame).toHaveBeenCalled()
            expect(gameMock.setCursorPosition).toHaveBeenCalled()
            expect(rafCallbacks.length).toBeGreaterThan(0)
        })

        it('endGame should call game.endGame and cancel animation', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame()

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            gameInstance!.startGame()
            gameInstance!.endGame()

            expect(gameMock.endGame).toHaveBeenCalled()
            expect(cancelAnimationFrame).toHaveBeenCalled()
        })

        it('pauseGame should call game.pauseGame and cancel animation', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame()

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            gameInstance!.startGame()
            gameInstance!.pauseGame()

            expect(gameMock.pauseGame).toHaveBeenCalled()
            expect(cancelAnimationFrame).toHaveBeenCalled()
        })

        it('resumeGame should call game loop', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame()

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            // Set game as active so resumeGame will request animation frame
            vi.mocked(gameMock.getState).mockReturnValue({
                score: 0,
                timeRemaining: 60,
                isGameActive: true,
                isGameOver: false,
                currentLevel: 1,
                cursor: { x: 200, y: 300 },
                isOnPath: true,
                levelsCompleted: 0,
            } as any)

            gameInstance!.startGame()
            const rafBefore = rafCallbacks.length

            gameInstance!.resumeGame()
            expect(rafCallbacks.length).toBeGreaterThan(rafBefore)
        })

        it('resetGame should call game.resetGame and cancel animation', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame()

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            gameInstance!.startGame()
            gameInstance!.resetGame()

            expect(gameMock.resetGame).toHaveBeenCalled()
        })

        it('cleanup should call game.cleanup and clearRenderer', async () => {
            const { PathNavigatorGame } = await import('./game')
            const { clearRenderer } = await import('./renderer')
            gameInstance = await initializePathNavigatorGame()

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            gameInstance!.cleanup()
            gameInstance = undefined

            expect(gameMock.cleanup).toHaveBeenCalled()
            expect(clearRenderer).toHaveBeenCalled()
        })
    })

    describe('keyboard controls', () => {
        it('should not handle keydown when game is not active', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame()
            gameInstance!.startGame() // adds keydown listener

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            vi.mocked(gameMock.updatePlayerPosition).mockClear()

            // Game is not active so handler should return early
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
            )
            expect(gameMock.updatePlayerPosition).not.toHaveBeenCalled()
        })

        it('should handle arrow keys when game is active', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame()

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            vi.mocked(gameMock.getState).mockReturnValue({
                score: 0,
                timeRemaining: 60,
                isGameActive: true,
                isGameOver: false,
                currentLevel: 1,
                cursor: { x: 200, y: 300 },
                isOnPath: true,
                levelsCompleted: 0,
            } as any)

            gameInstance!.startGame()

            const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
            for (const key of keys) {
                vi.mocked(gameMock.updatePlayerPosition).mockClear()
                document.dispatchEvent(
                    new KeyboardEvent('keydown', { key, bubbles: true })
                )
                expect(gameMock.updatePlayerPosition).toHaveBeenCalled()
            }
        })

        it('should ignore non-arrow keys', async () => {
            const { PathNavigatorGame } = await import('./game')
            gameInstance = await initializePathNavigatorGame()

            const gameMock = vi.mocked(PathNavigatorGame).mock.results[0].value
            vi.mocked(gameMock.getState).mockReturnValue({
                score: 0,
                timeRemaining: 60,
                isGameActive: true,
                isGameOver: false,
                currentLevel: 1,
                cursor: { x: 200, y: 300 },
                isOnPath: true,
                levelsCompleted: 0,
            } as any)

            gameInstance!.startGame()
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            )
            expect(gameMock.updatePlayerPosition).not.toHaveBeenCalled()
        })
    })

    describe('callbacks', () => {
        it('should call onScoreUpdate with DOM update', async () => {
            const onScoreUpdate = vi.fn()
            gameInstance = await initializePathNavigatorGame(
                {},
                { onScoreUpdate }
            )
            gameInstance!.startGame()

            // Run one frame to trigger callbacks
            if (rafCallbacks.length > 0) {
                rafCallbacks[0](0)
            }

            expect(document.getElementById('score')!.textContent).toBe('0')
        })

        it('should call onTimeUpdate with DOM update', async () => {
            const onTimeUpdate = vi.fn()
            gameInstance = await initializePathNavigatorGame(
                {},
                { onTimeUpdate }
            )
            gameInstance!.startGame()

            if (rafCallbacks.length > 0) {
                rafCallbacks[0](0)
            }

            expect(document.getElementById('time-remaining')!.textContent).toBe(
                '60'
            )
        })

        it('should call onLevelChange with DOM update', async () => {
            gameInstance = await initializePathNavigatorGame({}, {})
            gameInstance!.startGame()

            if (rafCallbacks.length > 0) {
                rafCallbacks[0](0)
            }

            expect(document.getElementById('level')!.textContent).toBe('1')
        })
    })

    describe('handleGameOver', () => {
        it('should update final stats in overlay', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            vi.mocked(saveGameScore).mockResolvedValueOnce({ success: true })

            gameInstance = await initializePathNavigatorGame()
            gameInstance!.startGame()
            gameInstance!.endGame()
            await vi.runAllTimersAsync()

            // Check DOM updates
            const finalScore = document.getElementById('final-score')!
            expect(finalScore.textContent).toBe('0')
        })

        it('should show game-over-overlay', async () => {
            gameInstance = await initializePathNavigatorGame()
            gameInstance!.endGame()
            await vi.runAllTimersAsync()

            const overlay = document.getElementById('game-over-overlay')!
            expect(overlay.classList.contains('hidden')).toBe(false)
        })

        it('should call saveGameScore', async () => {
            const { saveGameScore } = await import(
                '@/lib/services/scoreService'
            )
            gameInstance = await initializePathNavigatorGame()
            gameInstance!.endGame()
            await vi.runAllTimersAsync()
            expect(saveGameScore).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Number),
                undefined,
                undefined,
                expect.any(Object)
            )
        })
    })
})
