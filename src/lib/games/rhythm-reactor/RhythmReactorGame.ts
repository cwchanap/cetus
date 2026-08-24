import { GameID } from '@/lib/games'
import { BaseGame } from '@/lib/games/core/BaseGame'
import type { BaseGameCallbacks } from '@/lib/games/core/types'
import { createRhythmReactorChart } from './chart'
import {
    calculateRhythmReactorAccuracy,
    calculateRhythmReactorHitPoints,
} from './scoring'
import {
    RHYTHM_REACTOR_RULES,
    type RhythmReactorConfig,
    type RhythmReactorGameData,
    type RhythmReactorHitResult,
    type RhythmReactorJudgment,
    type RhythmReactorState,
    type RhythmReactorStats,
} from './types'

const TIME_EPSILON = 1e-9

export function createRhythmReactorConfig(
    overrides: Partial<RhythmReactorConfig> = {}
): RhythmReactorConfig {
    return {
        ...RHYTHM_REACTOR_RULES,
        achievementIntegration: true,
        pausable: false,
        resettable: true,
        chart: createRhythmReactorChart(),
        ...overrides,
    }
}

export class RhythmReactorGame extends BaseGame<
    RhythmReactorState,
    RhythmReactorConfig,
    RhythmReactorStats
> {
    private elapsedSimSeconds = 0

    constructor(
        config: RhythmReactorConfig = createRhythmReactorConfig(),
        callbacks: BaseGameCallbacks = {}
    ) {
        super(GameID.RHYTHM_REACTOR, config, callbacks, {
            basePoints: 0,
            timeBonus: false,
        })
    }

    createInitialState(): RhythmReactorState {
        return {
            score: 0,
            timeRemaining: this.config.duration,
            isActive: false,
            isPaused: false,
            isGameOver: false,
            gameStarted: false,
            elapsedSeconds: 0,
            pendingNotes: this.config.chart.map(note => ({ ...note })),
            perfectHits: 0,
            goodHits: 0,
            misses: 0,
            strayPresses: 0,
            combo: 0,
            maxCombo: 0,
            stability: this.config.initialStability,
            lastJudgment: null,
        }
    }

    update(deltaTime: number): void {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            !Number.isFinite(deltaTime) ||
            deltaTime <= 0
        ) {
            return
        }

        const step = Math.min(deltaTime, this.config.maxUpdateDelta)
        if (!Number.isFinite(step) || step <= 0) {
            return
        }

        this.elapsedSimSeconds = Math.min(
            this.config.duration,
            this.elapsedSimSeconds + step
        )
        this.state.elapsedSeconds = this.elapsedSimSeconds
        this.expireOverdueNotes()
        this.emitStateChange()
    }

    hitLane(laneIndex: number): RhythmReactorHitResult {
        if (
            !this.state.isActive ||
            this.state.isPaused ||
            this.state.isGameOver ||
            !Number.isInteger(laneIndex) ||
            laneIndex < 0 ||
            laneIndex >= this.config.laneCount
        ) {
            return { accepted: false, judgment: null, points: 0 }
        }

        // Judgment sequence: expire overdue notes first, then pick the nearest
        // note inside this lane's miss window (each note is consumed at most
        // once), apply inclusive perfect/good timing windows, or record a
        // stray press when nothing qualifies.
        this.expireOverdueNotes()

        let candidateIndex = -1
        let candidateDistance = Infinity
        for (
            let index = 0;
            index < this.state.pendingNotes.length;
            index += 1
        ) {
            const note = this.state.pendingNotes[index]
            if (note.laneIndex !== laneIndex) {
                continue
            }

            const distance = Math.abs(
                this.elapsedSimSeconds - note.hitTimeSeconds
            )
            if (
                distance <= this.config.missWindowSeconds + TIME_EPSILON &&
                distance < candidateDistance
            ) {
                candidateIndex = index
                candidateDistance = distance
            }
        }

        if (candidateIndex < 0) {
            this.registerStrayPress()
            this.emitStateChange()
            return { accepted: true, judgment: 'miss', points: 0 }
        }

        const note = this.state.pendingNotes.splice(candidateIndex, 1)[0]
        const offset = Math.abs(this.elapsedSimSeconds - note.hitTimeSeconds)
        let judgment: RhythmReactorJudgment
        let points = 0

        if (offset <= this.config.perfectWindowSeconds + TIME_EPSILON) {
            judgment = 'perfect'
            points = this.applySuccessfulHit(judgment)
        } else if (offset <= this.config.goodWindowSeconds + TIME_EPSILON) {
            judgment = 'good'
            points = this.applySuccessfulHit(judgment)
        } else {
            judgment = 'miss'
            this.registerNoteMiss(1)
        }

        this.emitStateChange()
        return { accepted: true, judgment, points }
    }

    render(): void {}

    cleanup(): void {}

    getGameStats(): RhythmReactorStats {
        const hits = this.state.perfectHits + this.state.goodHits
        return {
            finalScore: this.state.score,
            timeElapsed: Math.floor(this.getTimerStatus().elapsedTime),
            gameCompleted: this.state.isGameOver,
            hits,
            perfectHits: this.state.perfectHits,
            goodHits: this.state.goodHits,
            misses: this.state.misses,
            strayPresses: this.state.strayPresses,
            maxCombo: this.state.maxCombo,
            accuracy: calculateRhythmReactorAccuracy(
                this.state.perfectHits,
                this.state.goodHits,
                this.state.misses,
                this.state.strayPresses
            ),
            finalStability: this.state.stability,
        }
    }

    protected getGameData(): Record<string, unknown> {
        const hits = this.state.perfectHits + this.state.goodHits
        const data = {
            hits,
            perfectHits: this.state.perfectHits,
            goodHits: this.state.goodHits,
            misses: this.state.misses,
            strayPresses: this.state.strayPresses,
            maxCombo: this.state.maxCombo,
            accuracy: calculateRhythmReactorAccuracy(
                this.state.perfectHits,
                this.state.goodHits,
                this.state.misses,
                this.state.strayPresses
            ),
            finalStability: this.state.stability,
        } satisfies RhythmReactorGameData
        return data
    }

    protected handleTimeUp(): void {
        const remaining = this.state.pendingNotes.length
        this.state.pendingNotes = []
        this.elapsedSimSeconds = this.config.duration
        this.state.elapsedSeconds = this.config.duration
        if (remaining > 0) {
            this.registerNoteMiss(remaining)
        }
        this.emitStateChange()
        super.handleTimeUp()
    }

    protected onGameStart(): void {
        this.emitStateChange()
    }

    protected onGameReset(): void {
        this.elapsedSimSeconds = 0
        this.emitStateChange()
    }

    private expireOverdueNotes(): number {
        const overdueNotes = this.state.pendingNotes.filter(
            note =>
                this.elapsedSimSeconds -
                    (note.hitTimeSeconds + this.config.missWindowSeconds) >
                TIME_EPSILON
        )
        if (overdueNotes.length === 0) {
            return 0
        }

        this.state.pendingNotes = this.state.pendingNotes.filter(
            note =>
                this.elapsedSimSeconds -
                    (note.hitTimeSeconds + this.config.missWindowSeconds) <=
                TIME_EPSILON
        )
        this.registerNoteMiss(overdueNotes.length)
        return overdueNotes.length
    }

    private registerNoteMiss(count: number = 1): void {
        this.state.misses += count
        this.state.combo = 0
        this.state.stability = Math.max(
            0,
            Math.min(
                100,
                this.state.stability - count * this.config.missStabilityLoss
            )
        )
        this.state.lastJudgment = 'miss'
    }

    private registerStrayPress(): void {
        this.state.strayPresses += 1
        this.state.combo = 0
        this.state.stability = Math.max(
            0,
            Math.min(100, this.state.stability - this.config.strayStabilityLoss)
        )
        this.state.lastJudgment = 'miss'
    }

    private applySuccessfulHit(judgment: 'perfect' | 'good'): number {
        if (judgment === 'perfect') {
            this.state.perfectHits += 1
            this.state.stability += this.config.perfectStabilityGain
        } else {
            this.state.goodHits += 1
            this.state.stability += this.config.goodStabilityGain
        }

        this.state.combo += 1
        this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo)
        if (this.state.combo % this.config.comboStabilityInterval === 0) {
            this.state.stability += this.config.comboStabilityBonus
        }
        this.state.stability = Math.max(0, Math.min(100, this.state.stability))
        this.state.lastJudgment = judgment

        const points = calculateRhythmReactorHitPoints(
            judgment,
            this.state.combo
        )
        this.addScore(points, 'note_hit')
        return points
    }

    private emitStateChange(): void {
        if (this.callbacks.onStateChange) {
            this.callbacks.onStateChange(this.getState())
        }
        this.emit('state-change', { state: this.getState() })
    }
}
