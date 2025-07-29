import type { BaseGame } from './BaseGame'
import type { BaseRenderer } from './BaseRenderer'
import type { BaseGameCallbacks, BaseGameConfig, ScoringConfig } from './types'
import type { GameID } from '@/lib/games'

export interface GameInitializerConfig<
    TGame extends BaseGame,
    TRenderer extends BaseRenderer,
> {
    gameId: GameID
    gameClass: new (...args: unknown[]) => TGame
    rendererClass: new (...args: unknown[]) => TRenderer
    gameConfig: BaseGameConfig
    scoringConfig?: ScoringConfig
    callbacks?: BaseGameCallbacks
    rendererConfig?: Record<string, unknown>
}

export interface GameElements {
    startBtn?: HTMLButtonElement
    endBtn?: HTMLButtonElement
    pauseBtn?: HTMLButtonElement
    resetBtn?: HTMLButtonElement
    playAgainBtn?: HTMLButtonElement
    scoreElement?: HTMLElement
    timeElement?: HTMLElement
    gameOverOverlay?: HTMLElement
}

export class GameInitializer<
    TGame extends BaseGame,
    TRenderer extends BaseRenderer,
> {
    private config: GameInitializerConfig<TGame, TRenderer>
    private game: TGame | null = null
    private renderer: TRenderer | null = null
    private elements: GameElements = {}

    constructor(config: GameInitializerConfig<TGame, TRenderer>) {
        this.config = config
    }

    /**
     * Initialize the game and renderer
     */
    async initialize(): Promise<{ game: TGame; renderer: TRenderer }> {
        // Find DOM elements
        this.findGameElements()

        // Create renderer
        this.renderer = new this.config.rendererClass(
            this.config.rendererConfig || {}
        )
        await this.renderer.initialize()

        // Create game
        const callbacks = this.createGameCallbacks()
        this.game = new this.config.gameClass(
            this.config.gameId,
            this.config.gameConfig,
            callbacks,
            this.config.scoringConfig
        )

        // Set up event handlers
        this.setupEventHandlers()

        // Set up achievement notifications
        this.setupAchievementHandling()

        return {
            game: this.game,
            renderer: this.renderer,
        }
    }

    /**
     * Find common game UI elements
     */
    private findGameElements(): void {
        this.elements = {
            startBtn: document.getElementById('start-btn') as HTMLButtonElement,
            endBtn: document.getElementById('end-btn') as HTMLButtonElement,
            pauseBtn: document.getElementById('pause-btn') as HTMLButtonElement,
            resetBtn: document.getElementById('reset-btn') as HTMLButtonElement,
            playAgainBtn: document.getElementById(
                'play-again-btn'
            ) as HTMLButtonElement,
            scoreElement: document.getElementById('score') || undefined,
            timeElement: document.getElementById('time-remaining') || undefined,
            gameOverOverlay:
                document.getElementById('game-over-overlay') || undefined,
        }
    }

    /**
     * Create game callbacks that update the UI
     */
    private createGameCallbacks(): BaseGameCallbacks {
        const callbacks: BaseGameCallbacks = {}

        // Start callback
        callbacks.onStart = () => {
            if (this.elements.startBtn && this.elements.endBtn) {
                this.elements.startBtn.style.display = 'none'
                this.elements.endBtn.style.display = 'inline-flex'
            }

            if (this.elements.gameOverOverlay) {
                this.elements.gameOverOverlay.classList.add('hidden')
            }

            // Call external callback if provided
            if (this.config.callbacks?.onStart) {
                this.config.callbacks.onStart()
            }
        }

        // End callback
        callbacks.onEnd = async (finalScore, stats) => {
            // Update final score in overlay
            const finalScoreElement = document.getElementById('final-score')
            if (finalScoreElement) {
                finalScoreElement.textContent = finalScore.toString()
            }

            // Show game over overlay
            if (this.elements.gameOverOverlay) {
                this.elements.gameOverOverlay.classList.remove('hidden')
            }

            // Reset button states
            if (this.elements.startBtn && this.elements.endBtn) {
                this.elements.startBtn.style.display = 'inline-flex'
                this.elements.endBtn.style.display = 'none'
            }

            // Call external callback if provided
            if (this.config.callbacks?.onEnd) {
                this.config.callbacks.onEnd(finalScore, stats)
            }
        }

        // Score update callback
        callbacks.onScoreUpdate = score => {
            if (this.elements.scoreElement) {
                this.elements.scoreElement.textContent = score.toString()
            }

            // Call external callback if provided
            if (this.config.callbacks?.onScoreUpdate) {
                this.config.callbacks.onScoreUpdate(score)
            }
        }

        // Time update callback
        callbacks.onTimeUpdate = timeRemaining => {
            if (this.elements.timeElement) {
                this.elements.timeElement.textContent = timeRemaining.toString()
            }

            // Call external callback if provided
            if (this.config.callbacks?.onTimeUpdate) {
                this.config.callbacks.onTimeUpdate(timeRemaining)
            }
        }

        // Pause callback
        callbacks.onPause = () => {
            // Call external callback if provided
            if (this.config.callbacks?.onPause) {
                this.config.callbacks.onPause()
            }
        }

        // Resume callback
        callbacks.onResume = () => {
            // Call external callback if provided
            if (this.config.callbacks?.onResume) {
                this.config.callbacks.onResume()
            }
        }

        return callbacks
    }

    /**
     * Set up standard button event handlers
     */
    private setupEventHandlers(): void {
        if (!this.game) {
            return
        }

        // Start button
        if (this.elements.startBtn) {
            this.elements.startBtn.addEventListener('click', () => {
                this.game?.start()
            })
        }

        // End button
        if (this.elements.endBtn) {
            this.elements.endBtn.addEventListener('click', () => {
                this.game?.end()
            })
        }

        // Pause button
        if (this.elements.pauseBtn) {
            this.elements.pauseBtn.addEventListener('click', () => {
                const state = this.game?.getState()
                if (state?.isPaused) {
                    this.game?.resume()
                } else {
                    this.game?.pause()
                }
            })
        }

        // Reset button
        if (this.elements.resetBtn) {
            this.elements.resetBtn.addEventListener('click', () => {
                this.game?.reset()
            })
        }

        // Play again button
        if (this.elements.playAgainBtn) {
            this.elements.playAgainBtn.addEventListener('click', () => {
                if (this.elements.gameOverOverlay) {
                    this.elements.gameOverOverlay.classList.add('hidden')
                }

                // Reset button states
                if (this.elements.startBtn && this.elements.endBtn) {
                    this.elements.startBtn.style.display = 'inline-flex'
                    this.elements.endBtn.style.display = 'none'
                }

                this.game?.reset()
            })
        }
    }

    /**
     * Set up achievement notification handling
     */
    private setupAchievementHandling(): void {
        if (!this.game) {
            return
        }

        // Listen for game end events to show achievement notifications
        this.game.on('end', event => {
            const data = event.data as { newAchievements?: string[] }
            if (data?.newAchievements && data.newAchievements.length > 0) {
                // Show achievement notifications using global function
                if (typeof window.showAchievementAward === 'function') {
                    window.showAchievementAward(data.newAchievements)
                }
            }
        })
    }

    /**
     * Get the initialized game instance
     */
    getGame(): TGame | null {
        return this.game
    }

    /**
     * Get the initialized renderer instance
     */
    getRenderer(): TRenderer | null {
        return this.renderer
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        if (this.game) {
            this.game.destroy()
            this.game = null
        }

        if (this.renderer) {
            this.renderer.destroy()
            this.renderer = null
        }

        // Clear element references
        this.elements = {}
    }
}

// Type augmentation for global achievement function
declare global {
    interface Window {
        showAchievementAward?: (achievements: string[]) => void
    }
}
