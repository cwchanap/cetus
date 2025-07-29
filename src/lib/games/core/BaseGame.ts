import { GameEventEmitter } from './EventEmitter'
import { GameTimer } from './GameTimer'
import { ScoreManager } from './ScoreManager'
import type {
    BaseGameState,
    BaseGameConfig,
    BaseGameCallbacks,
    BaseGameStats,
    ScoringConfig,
} from './types'
import type { GameID } from '@/lib/games'

export abstract class BaseGame<
    TState extends BaseGameState = BaseGameState,
    TConfig extends BaseGameConfig = BaseGameConfig,
    TStats extends BaseGameStats = BaseGameStats,
> extends GameEventEmitter {
    protected state: TState
    protected config: TConfig
    protected callbacks: BaseGameCallbacks
    protected timer: GameTimer
    protected scoreManager: ScoreManager
    protected gameId: GameID

    constructor(
        gameId: GameID,
        config: TConfig,
        callbacks: BaseGameCallbacks = {},
        scoringConfig: ScoringConfig = { basePoints: 10 }
    ) {
        super()

        this.gameId = gameId
        this.config = config
        this.callbacks = callbacks

        // Initialize timer
        this.timer = new GameTimer({
            duration: config.duration,
            countDown: true,
            autoStart: false,
            onTick: timeRemaining => {
                this.updateTime(timeRemaining)
            },
            onComplete: () => {
                this.handleTimeUp()
            },
        })

        // Initialize score manager
        this.scoreManager = new ScoreManager({
            gameId,
            scoringConfig,
            achievementIntegration: config.achievementIntegration,
            onScoreUpdate: score => {
                this.updateScore(score)
            },
        })

        // Initialize state
        this.state = this.createInitialState()

        // Set up event forwarding
        this.setupEventForwarding()
    }

    /**
     * Abstract methods that each game must implement
     */
    abstract createInitialState(): TState
    abstract update(deltaTime: number): void
    abstract render(): void
    abstract getGameStats(): TStats
    abstract cleanup(): void

    /**
     * Start the game
     */
    start(): void {
        if (this.state.isActive) {
            return
        }

        this.state.isActive = true
        this.state.gameStarted = true
        this.state.isGameOver = false
        this.state.isPaused = false

        this.timer.start()
        this.emit('start')

        if (this.callbacks.onStart) {
            this.callbacks.onStart()
        }

        this.onGameStart()
    }

    /**
     * Pause the game
     */
    pause(): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            !this.config.pausable
        ) {
            return
        }

        this.state.isPaused = true
        this.timer.pause()
        this.emit('pause')

        if (this.callbacks.onPause) {
            this.callbacks.onPause()
        }

        this.onGamePause()
    }

    /**
     * Resume the game
     */
    resume(): void {
        if (!this.state.isActive || !this.state.isPaused) {
            return
        }

        this.state.isPaused = false
        this.timer.resume()
        this.emit('resume')

        if (this.callbacks.onResume) {
            this.callbacks.onResume()
        }

        this.onGameResume()
    }

    /**
     * End the game
     */
    async end(): Promise<void> {
        if (!this.state.isActive) {
            return
        }

        this.state.isActive = false
        this.state.isGameOver = true
        this.timer.stop()

        // Apply time bonus if applicable
        const timeRemaining = this.timer.getCurrentTime()
        this.scoreManager.applyTimeBonus(timeRemaining)

        // Get final stats
        const finalStats = this.getGameStats()
        const finalScore = this.scoreManager.getScore()

        // Save score
        const saveResult = await this.scoreManager.saveFinalScore(
            this.getGameData()
        )

        this.emit('end', {
            score: finalScore,
            stats: finalStats,
            newAchievements: saveResult.newAchievements,
        })

        if (this.callbacks.onEnd) {
            this.callbacks.onEnd(finalScore, finalStats)
        }

        this.onGameEnd(finalScore, finalStats)
    }

    /**
     * Reset the game
     */
    reset(): void {
        if (!this.config.resettable) {
            return
        }

        this.timer.reset()
        this.scoreManager.reset()
        this.state = this.createInitialState()

        this.onGameReset()
    }

    /**
     * Update score
     */
    protected updateScore(score: number): void {
        this.state.score = score

        if (this.callbacks.onScoreUpdate) {
            this.callbacks.onScoreUpdate(score)
        }

        this.emit('score-update', { score })
    }

    /**
     * Update time
     */
    protected updateTime(timeRemaining: number): void {
        this.state.timeRemaining = timeRemaining

        if (this.callbacks.onTimeUpdate) {
            this.callbacks.onTimeUpdate(timeRemaining)
        }

        this.emit('time-update', { time: timeRemaining })
    }

    /**
     * Handle time up event
     */
    protected handleTimeUp(): void {
        this.end()
    }

    /**
     * Get current game state
     */
    getState(): TState {
        return { ...this.state }
    }

    /**
     * Get timer status
     */
    getTimerStatus() {
        return this.timer.getStatus()
    }

    /**
     * Get score manager
     */
    getScoreManager(): ScoreManager {
        return this.scoreManager
    }

    /**
     * Add points to score
     */
    addScore(points: number, reason?: string): void {
        this.scoreManager.addPoints(points, reason)
    }

    /**
     * Subtract points from score
     */
    subtractScore(points: number, reason?: string): void {
        this.scoreManager.subtractPoints(points, reason)
    }

    /**
     * Hook methods that subclasses can override
     */
    protected onGameStart(): void {
        // Override in subclasses if needed
    }

    protected onGamePause(): void {
        // Override in subclasses if needed
    }

    protected onGameResume(): void {
        // Override in subclasses if needed
    }

    protected onGameEnd(_finalScore: number, _finalStats: TStats): void {
        // Override in subclasses if needed
    }

    protected onGameReset(): void {
        // Override in subclasses if needed
    }

    /**
     * Get game-specific data for achievement checking
     */
    protected getGameData(): Record<string, unknown> {
        // Override in subclasses to provide game-specific data
        return {}
    }

    /**
     * Set up event forwarding from timer and score manager
     */
    private setupEventForwarding(): void {
        // Forward timer events
        this.timer.on('start', () => this.emit('start'))
        this.timer.on('pause', () => this.emit('pause'))
        this.timer.on('resume', () => this.emit('resume'))
        this.timer.on('end', () => this.emit('end'))
        this.timer.on('time-update', event =>
            this.emit('time-update', event.data)
        )

        // Forward score manager events
        this.scoreManager.on('score-update', event =>
            this.emit('score-update', event.data)
        )
    }

    /**
     * Destroy the game instance and clean up resources
     */
    destroy(): void {
        this.timer.stop()
        this.timer.removeAllListeners()
        this.scoreManager.removeAllListeners()
        this.removeAllListeners()
        this.cleanup()
    }
}
