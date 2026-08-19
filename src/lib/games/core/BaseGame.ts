import { GameEventEmitter } from './EventEmitter'
import { GameTimer } from './GameTimer'
import { ScoreManager } from './ScoreManager'
import { createRunGuard } from './runGuard'
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
    private runGuard = createRunGuard()
    private finalTimerSnapshot: {
        currentTime: number
        elapsedTime: number
    } | null = null

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
    /**
     * Advance game logic by elapsed time in seconds.
     */
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

        if (this.state.gameStarted && this.state.isGameOver) {
            // Bypass the public resettable guard: a completed run must be
            // cleared before the next run starts even when manual reset() is
            // disabled. reset() still enforces config.resettable for callers.
            this.resetInternal()
        }

        this.runGuard.next()
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

        const liveTimer = this.timer.getStatus()
        const finalCurrentTime = liveTimer.isRunning
            ? liveTimer.currentTime
            : Math.max(0, this.state.timeRemaining)
        const finalElapsedTime = liveTimer.isRunning
            ? liveTimer.elapsedTime
            : Math.max(0, this.config.duration - finalCurrentTime)

        this.finalTimerSnapshot = {
            currentTime: finalCurrentTime,
            elapsedTime: finalElapsedTime,
        }

        this.state.isActive = false
        this.state.isGameOver = true
        this.timer.stop()

        // Apply time bonus if applicable
        this.scoreManager.applyTimeBonus(finalCurrentTime)

        // Get final stats
        const finalStats = this.getGameStats()
        const finalScore = this.scoreManager.getScore()

        // Save score
        const runId = this.runGuard.current()
        const saveResult = await this.scoreManager.saveFinalScore(
            this.getGameData(),
            () => this.runGuard.isStale(runId)
        )

        this.emit('end', {
            score: finalScore,
            stats: finalStats,
            newAchievements: this.runGuard.isStale(runId)
                ? undefined
                : saveResult.newAchievements,
            challengeUpdates: this.runGuard.isStale(runId)
                ? undefined
                : saveResult.challengeUpdates,
        })

        // Suppress end-of-run callbacks for discarded runs so stale score/stat
        // updates do not leak into a newer run that started during the await.
        if (this.runGuard.isStale(runId)) {
            return
        }

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

        this.resetInternal()
    }

    /**
     * Internal reset sequence shared by reset() and the completed-run branch
     * of start(). Does NOT enforce config.resettable — callers are responsible
     * for the guard (reset() checks it; start() bypasses it intentionally so a
     * completed run is always cleared before the next one).
     */
    private resetInternal(): void {
        this.finalTimerSnapshot = null
        this.runGuard.next()
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
        this.end().catch(err =>
            console.error('BaseGame handleTimeUp end failed', err)
        )
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
        const status = this.timer.getStatus()
        if (!this.finalTimerSnapshot) {
            return status
        }
        return {
            ...status,
            currentTime: this.finalTimerSnapshot.currentTime,
            elapsedTime: this.finalTimerSnapshot.elapsedTime,
            isComplete: this.finalTimerSnapshot.currentTime <= 0,
        }
    }

    protected setDuration(seconds: number): boolean {
        if (this.state.isActive || !this.timer.setDuration(seconds)) {
            return false
        }
        this.config.duration = seconds
        this.state.timeRemaining = seconds
        this.finalTimerSnapshot = null
        return true
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
