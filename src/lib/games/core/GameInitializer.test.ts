import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameInitializer } from './GameInitializer'
import { BaseGame } from './BaseGame'
import { BaseRenderer } from './BaseRenderer'
import { GameID } from '@/lib/games'
import type {
    BaseGameCallbacks,
    BaseGameState,
    BaseGameStats,
    RendererConfig,
} from './types'

// Mock the scoreService
vi.mock('@/lib/services/scoreService', () => ({
    saveGameScore: vi.fn().mockResolvedValue(undefined),
}))

// Concrete BaseGame implementation for testing
class TestGame extends BaseGame {
    createInitialState(): BaseGameState {
        return {
            score: 0,
            timeRemaining: 60,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
        }
    }
    update(_dt: number): void {}
    render(): void {}
    cleanup(): void {}
    getGameStats(): BaseGameStats {
        return {
            finalScore: this.scoreManager.getScore(),
            timeElapsed: 0,
            gameCompleted: false,
        }
    }
}

// Concrete BaseRenderer implementation for testing
class TestRenderer extends BaseRenderer {
    async setup(): Promise<void> {}
    render(_state: unknown): void {}
    resize(_width: number, _height: number): void {}
    cleanup(): void {}
}

describe('GameInitializer', () => {
    let container: HTMLElement
    let initializers: GameInitializer<TestGame, TestRenderer>[] = []

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'game-container'
        document.body.appendChild(container)
    })

    afterEach(() => {
        vi.useRealTimers()
        for (const initializer of initializers) {
            try {
                initializer.destroy()
            } catch {
                // continue cleaning up remaining initializers
            }
        }
        initializers = []
        if (container.parentNode) {
            document.body.removeChild(container)
        }
        vi.clearAllMocks()
        vi.unstubAllGlobals()
    })

    const makeInitializer = (callbacks: Partial<BaseGameCallbacks> = {}) => {
        const initializer = new GameInitializer<TestGame, TestRenderer>({
            gameId: GameID.TETRIS,
            gameClass: TestGame as unknown as new (
                ...args: unknown[]
            ) => TestGame,
            rendererClass: TestRenderer as unknown as new (
                ...args: unknown[]
            ) => TestRenderer,
            gameConfig: {
                duration: 60,
                achievementIntegration: false,
                pausable: true,
                resettable: true,
            },
            rendererConfig: {
                type: 'dom',
                container: '#game-container',
            } as RendererConfig,
            callbacks,
        })
        initializers.push(initializer)
        return initializer
    }

    describe('initialize', () => {
        it('should create game and renderer instances', async () => {
            const initializer = makeInitializer()
            const { game, renderer } = await initializer.initialize()

            expect(game).toBeInstanceOf(TestGame)
            expect(renderer).toBeInstanceOf(TestRenderer)
        })

        it('should return the same instances from getGame and getRenderer', async () => {
            const initializer = makeInitializer()
            const { game, renderer } = await initializer.initialize()

            expect(initializer.getGame()).toBe(game)
            expect(initializer.getRenderer()).toBe(renderer)
        })
    })

    describe('button event handlers', () => {
        it('should wire start button to game.start', async () => {
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            const endBtn = document.createElement('button')
            endBtn.id = 'end-btn'
            document.body.appendChild(startBtn)
            document.body.appendChild(endBtn)

            const initializer = makeInitializer()
            const { game } = await initializer.initialize()

            const startSpy = vi.spyOn(game, 'start')
            startBtn.click()
            expect(startSpy).toHaveBeenCalled()

            document.body.removeChild(startBtn)
            document.body.removeChild(endBtn)
        })

        it('should wire end button to game.end', async () => {
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            const endBtn = document.createElement('button')
            endBtn.id = 'end-btn'
            document.body.appendChild(startBtn)
            document.body.appendChild(endBtn)

            const initializer = makeInitializer()
            const { game } = await initializer.initialize()
            game.start()

            const endSpy = vi.spyOn(game, 'end')
            endBtn.click()
            expect(endSpy).toHaveBeenCalled()

            document.body.removeChild(startBtn)
            document.body.removeChild(endBtn)
        })

        it('should wire pause button to toggle pause/resume', async () => {
            const pauseBtn = document.createElement('button')
            pauseBtn.id = 'pause-btn'
            document.body.appendChild(pauseBtn)

            const initializer = makeInitializer()
            const { game } = await initializer.initialize()
            game.start()

            const pauseSpy = vi.spyOn(game, 'pause')
            pauseBtn.click()
            expect(pauseSpy).toHaveBeenCalled()

            const resumeSpy = vi.spyOn(game, 'resume')
            pauseBtn.click()
            expect(resumeSpy).toHaveBeenCalled()

            document.body.removeChild(pauseBtn)
        })

        it('should wire reset button to game.reset', async () => {
            const resetBtn = document.createElement('button')
            resetBtn.id = 'reset-btn'
            document.body.appendChild(resetBtn)

            const initializer = makeInitializer()
            const { game } = await initializer.initialize()
            game.start()

            const resetSpy = vi.spyOn(game, 'reset')
            resetBtn.click()
            expect(resetSpy).toHaveBeenCalled()

            document.body.removeChild(resetBtn)
        })

        it('should wire play-again button to hide overlay and reset game', async () => {
            const playAgainBtn = document.createElement('button')
            playAgainBtn.id = 'play-again-btn'
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            startBtn.style.display = 'none'
            const endBtn = document.createElement('button')
            endBtn.id = 'end-btn'
            const overlay = document.createElement('div')
            overlay.id = 'game-over-overlay'
            document.body.appendChild(playAgainBtn)
            document.body.appendChild(startBtn)
            document.body.appendChild(endBtn)
            document.body.appendChild(overlay)

            const initializer = makeInitializer()
            const { game } = await initializer.initialize()
            game.start()
            await game.end()

            const resetSpy = vi.spyOn(game, 'reset')
            playAgainBtn.click()
            expect(resetSpy).toHaveBeenCalled()
            expect(overlay.classList.contains('hidden')).toBe(true)

            document.body.removeChild(playAgainBtn)
            document.body.removeChild(startBtn)
            document.body.removeChild(endBtn)
            document.body.removeChild(overlay)
        })
    })

    describe('callbacks', () => {
        it('should call external onStart callback', async () => {
            const onStart = vi.fn()
            const initializer = makeInitializer({ onStart })
            const { game } = await initializer.initialize()
            game.start()
            expect(onStart).toHaveBeenCalled()
        })

        it('should call external onEnd callback', async () => {
            const onEnd = vi.fn()
            const initializer = makeInitializer({ onEnd })
            const { game } = await initializer.initialize()
            game.start()
            await game.end()
            expect(onEnd).toHaveBeenCalled()
        })

        it('should call external onScoreUpdate callback when score changes', async () => {
            const onScoreUpdate = vi.fn()
            const initializer = makeInitializer({ onScoreUpdate })
            const { game } = await initializer.initialize()
            game.start()
            game.addScore(50, 'test')
            expect(onScoreUpdate).toHaveBeenCalledWith(50)
        })

        it('should call external onTimeUpdate callback', async () => {
            vi.useFakeTimers()
            const onTimeUpdate = vi.fn()
            const initializer = makeInitializer({ onTimeUpdate })
            const { game } = await initializer.initialize()
            game.start()
            vi.advanceTimersByTime(1000)
            expect(onTimeUpdate).toHaveBeenCalled()
        })

        it('should call external onPause callback', async () => {
            const onPause = vi.fn()
            const initializer = makeInitializer({ onPause })
            const { game } = await initializer.initialize()
            game.start()
            game.pause()
            expect(onPause).toHaveBeenCalled()
        })

        it('should call external onResume callback', async () => {
            const onResume = vi.fn()
            const initializer = makeInitializer({ onResume })
            const { game } = await initializer.initialize()
            game.start()
            game.pause()
            game.resume()
            expect(onResume).toHaveBeenCalled()
        })
    })

    describe('UI element updates', () => {
        it('should update score element on score change', async () => {
            const scoreEl = document.createElement('div')
            scoreEl.id = 'score'
            document.body.appendChild(scoreEl)

            const initializer = makeInitializer()
            const { game } = await initializer.initialize()
            game.start()
            game.addScore(100, 'test')
            expect(scoreEl.textContent).toBe('100')

            document.body.removeChild(scoreEl)
        })

        it('should update time element on time change', async () => {
            vi.useFakeTimers()
            const timeEl = document.createElement('div')
            timeEl.id = 'time-remaining'
            document.body.appendChild(timeEl)

            const initializer = makeInitializer()
            const { game } = await initializer.initialize()
            game.start()
            vi.advanceTimersByTime(1000)
            expect(timeEl.textContent).not.toBe('')

            document.body.removeChild(timeEl)
        })

        it('should show game-over overlay on game end', async () => {
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            const endBtn = document.createElement('button')
            endBtn.id = 'end-btn'
            const overlay = document.createElement('div')
            overlay.id = 'game-over-overlay'
            overlay.classList.add('hidden')
            const finalScoreEl = document.createElement('div')
            finalScoreEl.id = 'final-score'
            document.body.appendChild(startBtn)
            document.body.appendChild(endBtn)
            document.body.appendChild(overlay)
            document.body.appendChild(finalScoreEl)

            const initializer = makeInitializer()
            const { game } = await initializer.initialize()
            game.start()
            game.addScore(42, 'test')
            await game.end()

            expect(overlay.classList.contains('hidden')).toBe(false)
            expect(finalScoreEl.textContent).toBe('42')

            document.body.removeChild(startBtn)
            document.body.removeChild(endBtn)
            document.body.removeChild(overlay)
            document.body.removeChild(finalScoreEl)
        })
    })

    describe('achievement handling', () => {
        it('should call window.showAchievementAward on game end with achievements', async () => {
            const showAchievementAward = vi.fn()
            vi.stubGlobal('showAchievementAward', showAchievementAward)

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ newAchievements: ['first_win'] }),
            })
            vi.stubGlobal('fetch', fetchMock)

            const achInitializer = new GameInitializer<TestGame, TestRenderer>({
                gameId: GameID.TETRIS,
                gameClass: TestGame as unknown as new (
                    ...args: unknown[]
                ) => TestGame,
                rendererClass: TestRenderer as unknown as new (
                    ...args: unknown[]
                ) => TestRenderer,
                gameConfig: {
                    duration: 60,
                    achievementIntegration: true,
                    pausable: false,
                    resettable: false,
                },
                rendererConfig: {
                    type: 'dom',
                    container: '#game-container',
                } as RendererConfig,
            })
            initializers.push(achInitializer)

            const { game } = await achInitializer.initialize()
            game.start()
            await game.end()

            expect(showAchievementAward).toHaveBeenCalledWith(['first_win'])
        })
    })

    describe('destroy', () => {
        it('should destroy game and renderer and clear references', async () => {
            const initializer = makeInitializer()
            const { game, renderer } = await initializer.initialize()

            const gameDestroySpy = vi.spyOn(game, 'destroy')
            const rendererDestroySpy = vi.spyOn(renderer, 'destroy')

            initializer.destroy()

            expect(gameDestroySpy).toHaveBeenCalled()
            expect(rendererDestroySpy).toHaveBeenCalled()
            expect(initializer.getGame()).toBeNull()
            expect(initializer.getRenderer()).toBeNull()
        })

        it('should be safe to call destroy before initialize', () => {
            const initializer = makeInitializer()
            expect(() => initializer.destroy()).not.toThrow()
        })

        it('should remove button listeners on destroy so re-initialize does not double-fire', async () => {
            const startBtn = document.createElement('button')
            startBtn.id = 'start-btn'
            const endBtn = document.createElement('button')
            endBtn.id = 'end-btn'
            document.body.appendChild(startBtn)
            document.body.appendChild(endBtn)

            const initializer = makeInitializer()
            const { game: game1 } = await initializer.initialize()
            const startSpy1 = vi.spyOn(game1, 'start')

            initializer.destroy()

            // Re-initialize — a new game is created and new listeners registered
            const { game: game2 } = await initializer.initialize()
            const startSpy2 = vi.spyOn(game2, 'start')

            startBtn.click()

            // The old listener must have been removed; only the new one fires
            expect(startSpy1).not.toHaveBeenCalled()
            expect(startSpy2).toHaveBeenCalledTimes(1)

            document.body.removeChild(startBtn)
            document.body.removeChild(endBtn)
        })
    })

    describe('private guards when game is null', () => {
        it('setupEventHandlers early-returns when this.game is null (line 208)', () => {
            const config = {
                gameId: GameID.TETRIS,
                gameClass: TestGame,
                rendererClass: TestRenderer,
                gameConfig: {
                    duration: 60,
                    achievementIntegration: false,
                    pausable: true,
                    resettable: true,
                },
            }
            const initializer = new GameInitializer(config)
            initializers.push(initializer)
            // game is null before initialize() is called — calling private method directly must not throw
            expect(() =>
                (initializer as any).setupEventHandlers()
            ).not.toThrow()
        })

        it('setupAchievementHandling early-returns when this.game is null (line 267)', () => {
            const config = {
                gameId: GameID.TETRIS,
                gameClass: TestGame,
                rendererClass: TestRenderer,
                gameConfig: {
                    duration: 60,
                    achievementIntegration: false,
                    pausable: true,
                    resettable: true,
                },
            }
            const initializer = new GameInitializer(config)
            initializers.push(initializer)
            expect(() =>
                (initializer as any).setupAchievementHandling()
            ).not.toThrow()
        })
    })
})
