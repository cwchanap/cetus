import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { GameID } from '@/lib/games'
import { calculatePatternPulseRoundScore } from './scoring'
import {
    PATTERN_PULSE_TIMING,
    createPatternPulseConfig,
    type PatternPad,
    type PatternPulseConfig,
    type PatternPulseState,
    type PatternPulseStats,
} from './types'

export class PatternPulseGame extends BaseGame<
    PatternPulseState,
    PatternPulseConfig,
    PatternPulseStats
> {
    private scheduledTimeoutId: ReturnType<typeof setTimeout> | null = null
    private playbackIndex = 0
    private lastInputAtMs = 0
    private responseTotalMs = 0

    constructor(
        config: PatternPulseConfig = createPatternPulseConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.PATTERN_PULSE, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): PatternPulseState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            phase: 'idle',
            outcome: 'playing',
            sequence: Array.from(
                { length: this.config.initialSequenceLength },
                () => this.nextPad()
            ),
            inputIndex: 0,
            activePad: null,
            feedback: null,
            completedRounds: 0,
            mistakes: 0,
            streak: 0,
            maxStreak: 0,
            longestSequence: 0,
        }
    }

    pressPad(pad: PatternPad): boolean {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            this.state.phase !== 'input'
        ) {
            return false
        }

        if (pad !== this.state.sequence[this.state.inputIndex]) {
            this.state.mistakes++
            this.state.streak = 0
            this.state.inputIndex = 0
            this.responseTotalMs = 0
            this.state.feedback = 'wrong'
            this.state.activePad = pad

            if (this.state.mistakes >= this.config.mistakeLimit) {
                this.clearScheduled()
                this.state.outcome = 'mistakes'
                this.state.phase = 'ended'
                this.emitStateChange()
                void this.end().catch(error =>
                    console.error(
                        'PatternPulseGame end failed (mistakes)',
                        error
                    )
                )
                return true
            }

            this.state.phase = 'feedback'
            this.emitStateChange()
            this.schedule(
                () => this.beginPlayback(),
                PATTERN_PULSE_TIMING.feedbackMs
            )
            return true
        }

        const nowMs = Date.now()
        this.responseTotalMs += Math.max(0, nowMs - this.lastInputAtMs)
        this.lastInputAtMs = nowMs
        this.state.inputIndex++

        if (this.state.inputIndex < this.state.sequence.length) {
            this.emitStateChange()
            return true
        }

        const sequenceLength = this.state.sequence.length
        const averageResponseMs = this.responseTotalMs / sequenceLength
        this.state.completedRounds++
        this.state.streak++
        this.state.maxStreak = Math.max(this.state.maxStreak, this.state.streak)
        this.state.longestSequence = Math.max(
            this.state.longestSequence,
            sequenceLength
        )
        this.addScore(
            calculatePatternPulseRoundScore({
                sequenceLength,
                streak: this.state.streak,
                averageResponseMs,
            }),
            'sequence_complete'
        )
        this.state.phase = 'feedback'
        this.state.feedback = 'correct'
        this.state.activePad = null
        this.emitStateChange()
        this.schedule(() => {
            this.state.sequence = [...this.state.sequence, this.nextPad()]
            this.beginPlayback()
        }, PATTERN_PULSE_TIMING.feedbackMs)

        return true
    }

    update(_deltaTime: number): void {}
    render(): void {}

    getConfig(): PatternPulseConfig {
        return { ...this.config }
    }

    protected handleTimeUp(): void {
        this.clearScheduled()
        this.state.phase = 'ended'
        this.state.outcome = 'timeout'
        this.state.feedback = null
        this.state.activePad = null
        this.emitStateChange()
        super.handleTimeUp()
    }

    protected getGameData(): Record<string, unknown> {
        return {
            completedRounds: this.state.completedRounds,
            longestSequence: this.state.longestSequence,
            mistakes: this.state.mistakes,
            maxStreak: this.state.maxStreak,
        }
    }

    protected onGameReset(): void {
        this.clearScheduled()
        this.playbackIndex = 0
        this.lastInputAtMs = 0
        this.responseTotalMs = 0
        this.emitStateChange()
    }

    getGameStats(): PatternPulseStats {
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(this.getTimerStatus().elapsedTime),
            gameCompleted: this.state.isGameOver,
            outcome: this.state.outcome,
            completedRounds: this.state.completedRounds,
            longestSequence: this.state.longestSequence,
            mistakes: this.state.mistakes,
            maxStreak: this.state.maxStreak,
        }
    }

    cleanup(): void {
        this.clearScheduled()
    }

    protected onGameStart(): void {
        this.beginPlayback()
    }

    private nextPad(): PatternPad {
        const value = Math.floor(this.config.rng() * 4)
        return Math.max(0, Math.min(3, value)) as PatternPad
    }

    private pulseMs(): number {
        return Math.max(
            PATTERN_PULSE_TIMING.minPulseMs,
            PATTERN_PULSE_TIMING.initialPulseMs -
                this.state.completedRounds * PATTERN_PULSE_TIMING.pulseStepMs
        )
    }

    private schedule(callback: () => void, delayMs: number): void {
        this.clearScheduled()
        this.scheduledTimeoutId = setTimeout(() => {
            this.scheduledTimeoutId = null
            callback()
        }, delayMs)
    }

    private clearScheduled(): void {
        if (this.scheduledTimeoutId !== null) {
            clearTimeout(this.scheduledTimeoutId)
            this.scheduledTimeoutId = null
        }
    }

    private beginPlayback(): void {
        this.clearScheduled()
        this.playbackIndex = 0
        this.state.phase = 'watch'
        this.state.feedback = null
        this.state.activePad = null
        this.emitStateChange()
        this.schedule(
            () => this.playNextCue(),
            PATTERN_PULSE_TIMING.prePlaybackDelayMs
        )
    }

    private playNextCue(): void {
        if (!this.state.isActive || this.state.isGameOver) {
            return
        }

        if (this.playbackIndex >= this.state.sequence.length) {
            this.beginInput()
            return
        }

        this.state.activePad = this.state.sequence[this.playbackIndex]
        this.emitStateChange()
        this.schedule(() => {
            if (!this.state.isActive || this.state.isGameOver) {
                return
            }

            this.state.activePad = null
            this.emitStateChange()
            this.schedule(() => {
                if (!this.state.isActive || this.state.isGameOver) {
                    return
                }

                this.playbackIndex++
                this.playNextCue()
            }, PATTERN_PULSE_TIMING.pulseGapMs)
        }, this.pulseMs())
    }

    private beginInput(): void {
        if (!this.state.isActive || this.state.isGameOver) {
            return
        }

        this.state.inputIndex = 0
        this.responseTotalMs = 0
        this.lastInputAtMs = Date.now()
        this.state.phase = 'input'
        this.emitStateChange()
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}
