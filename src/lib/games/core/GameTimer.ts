import { GameEventEmitter } from './EventEmitter'

export interface GameTimerConfig {
    duration: number // in seconds
    countDown: boolean // true for countdown, false for count up
    autoStart: boolean
    onTick?: (timeRemaining: number) => void
    onComplete?: () => void
}

export class GameTimer extends GameEventEmitter {
    private config: GameTimerConfig
    private startTime: number = 0
    private pausedTime: number = 0
    private totalPausedDuration: number = 0
    private intervalId: number | null = null
    private isRunning: boolean = false
    private isPaused: boolean = false

    constructor(config: GameTimerConfig) {
        super()
        this.config = config

        if (config.autoStart) {
            this.start()
        }
    }

    /**
     * Start the timer
     */
    start(): void {
        if (this.isRunning) {
            return
        }

        this.startTime = Date.now()
        this.totalPausedDuration = 0
        this.isRunning = true
        this.isPaused = false

        this.intervalId = window.setInterval(() => {
            this.tick()
        }, 1000)

        this.emit('start')
    }

    /**
     * Pause the timer
     */
    pause(): void {
        if (!this.isRunning || this.isPaused) {
            return
        }

        this.pausedTime = Date.now()
        this.isPaused = true

        if (this.intervalId !== null) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }

        this.emit('pause')
    }

    /**
     * Resume the timer
     */
    resume(): void {
        if (!this.isRunning || !this.isPaused) {
            return
        }

        this.totalPausedDuration += Date.now() - this.pausedTime
        this.isPaused = false

        this.intervalId = window.setInterval(() => {
            this.tick()
        }, 1000)

        this.emit('resume')
    }

    /**
     * Stop the timer
     */
    stop(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }

        this.isRunning = false
        this.isPaused = false

        this.emit('end')
    }

    /**
     * Reset the timer
     */
    reset(): void {
        this.stop()
        this.startTime = 0
        this.pausedTime = 0
        this.totalPausedDuration = 0
    }

    /**
     * Get current time value
     */
    getCurrentTime(): number {
        if (!this.isRunning) {
            return this.config.countDown ? this.config.duration : 0
        }

        const now = this.isPaused ? this.pausedTime : Date.now()
        const elapsed = Math.floor(
            (now - this.startTime - this.totalPausedDuration) / 1000
        )

        if (this.config.countDown) {
            return Math.max(0, this.config.duration - elapsed)
        } else {
            return elapsed
        }
    }

    /**
     * Get elapsed time in seconds
     */
    getElapsedTime(): number {
        if (!this.isRunning) {
            return 0
        }

        const now = this.isPaused ? this.pausedTime : Date.now()
        return Math.floor(
            (now - this.startTime - this.totalPausedDuration) / 1000
        )
    }

    /**
     * Check if timer is complete
     */
    isComplete(): boolean {
        if (this.config.countDown) {
            return this.getCurrentTime() <= 0
        }
        return false // Count-up timers don't complete automatically
    }

    /**
     * Get timer status
     */
    getStatus(): {
        isRunning: boolean
        isPaused: boolean
        currentTime: number
        elapsedTime: number
        isComplete: boolean
    } {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            currentTime: this.getCurrentTime(),
            elapsedTime: this.getElapsedTime(),
            isComplete: this.isComplete(),
        }
    }

    /**
     * Internal tick method
     */
    private tick(): void {
        const currentTime = this.getCurrentTime()

        // Call config callback
        if (this.config.onTick) {
            this.config.onTick(currentTime)
        }

        // Emit time update event
        this.emit('time-update', { time: currentTime })

        // Check if timer is complete
        if (this.isComplete()) {
            this.stop()

            if (this.config.onComplete) {
                this.config.onComplete()
            }

            this.emit('time-complete')
        }
    }
}
