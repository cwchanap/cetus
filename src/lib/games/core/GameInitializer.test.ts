import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameInitializer } from './GameInitializer'
import { BaseGame } from './BaseGame'
import { BaseRenderer } from './BaseRenderer'
import { GameID } from '@/lib/games'
import type { BaseGameState, BaseGameStats, RendererConfig } from './types'

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

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'game-container'
        document.body.appendChild(container)
    })

    afterEach(() => {
        document.body.removeChild(container)
        vi.clearAllMocks()
    })

    const makeInitializer = (callbacks = {}) =>
        new GameInitializer<TestGame, TestRenderer>({
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
            game.destroy()
            vi.useRealTimers()
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
            game.destroy()
            vi.useRealTimers()
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
                    achievementIntegration: true,
                    pausable: false,
                    resettable: false,
                },
                rendererConfig: {
                    type: 'dom',
                    container: '#game-container',
                } as RendererConfig,
            })

            const { game } = await initializer.initialize()
            game.start()
            await game.end()

            expect(showAchievementAward).toHaveBeenCalledWith(['first_win'])

            vi.unstubAllGlobals()
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
    })
})
