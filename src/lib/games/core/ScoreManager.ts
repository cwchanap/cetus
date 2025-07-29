import { GameEventEmitter } from './EventEmitter'
import { saveGameScore } from '@/lib/services/scoreService'
import type { GameID } from '@/lib/games'
import type { ScoringConfig } from './types'

export interface ScoreManagerConfig {
    gameId: GameID
    scoringConfig: ScoringConfig
    achievementIntegration: boolean
    onScoreUpdate?: (score: number) => void
}

export class ScoreManager extends GameEventEmitter {
    private config: ScoreManagerConfig
    private currentScore: number = 0
    private scoreHistory: Array<{
        points: number
        reason: string
        timestamp: number
    }> = []

    constructor(config: ScoreManagerConfig) {
        super()
        this.config = config
    }

    /**
     * Add points to the current score
     */
    addPoints(points: number, reason: string = 'game_action'): void {
        const adjustedPoints = Math.round(
            points * (this.config.scoringConfig.bonusMultiplier || 1)
        )
        this.currentScore += adjustedPoints

        // Ensure score doesn't go below 0
        this.currentScore = Math.max(0, this.currentScore)

        // Record in history
        this.scoreHistory.push({
            points: adjustedPoints,
            reason,
            timestamp: Date.now(),
        })

        // Call config callback
        if (this.config.onScoreUpdate) {
            this.config.onScoreUpdate(this.currentScore)
        }

        // Emit score update event
        this.emit('score-update', {
            score: this.currentScore,
            points: adjustedPoints,
            reason,
        })
    }

    /**
     * Subtract points from the current score
     */
    subtractPoints(points: number, reason: string = 'penalty'): void {
        this.addPoints(-points, reason)
    }

    /**
     * Calculate time bonus based on remaining time
     */
    calculateTimeBonus(timeRemaining: number): number {
        if (!this.config.scoringConfig.timeBonus || timeRemaining <= 0) {
            return 0
        }

        // Standard time bonus: 5 points per second remaining
        return timeRemaining * 5
    }

    /**
     * Apply time bonus to score
     */
    applyTimeBonus(timeRemaining: number): void {
        const bonus = this.calculateTimeBonus(timeRemaining)
        if (bonus > 0) {
            this.addPoints(bonus, 'time_bonus')
        }
    }

    /**
     * Get current score
     */
    getScore(): number {
        return this.currentScore
    }

    /**
     * Get score history
     */
    getScoreHistory(): Array<{
        points: number
        reason: string
        timestamp: number
    }> {
        return [...this.scoreHistory]
    }

    /**
     * Reset score to 0
     */
    reset(): void {
        this.currentScore = 0
        this.scoreHistory = []

        if (this.config.onScoreUpdate) {
            this.config.onScoreUpdate(0)
        }

        this.emit('score-update', { score: 0, points: 0, reason: 'reset' })
    }

    /**
     * Save final score (with achievement integration if enabled)
     */
    async saveFinalScore(
        gameData?: Record<string, unknown>
    ): Promise<{ success: boolean; newAchievements?: string[] }> {
        try {
            if (this.config.achievementIntegration) {
                // Use the enhanced save method that checks achievements
                const response = await fetch('/api/scores', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        gameId: this.config.gameId,
                        score: this.currentScore,
                        gameData,
                    }),
                })

                if (response.ok) {
                    const result = await response.json()
                    return {
                        success: true,
                        newAchievements: result.newAchievements,
                    }
                } else {
                    return { success: false }
                }
            } else {
                // Use the simple save method
                await saveGameScore(this.config.gameId, this.currentScore)
                return { success: true }
            }
        } catch (_error) {
            // Error is handled by returning success: false
            return { success: false }
        }
    }

    /**
     * Get score statistics
     */
    getStats(): {
        totalScore: number
        totalActions: number
        averagePointsPerAction: number
        highestSingleScore: number
        scoreBreakdown: Record<string, number>
    } {
        const scoreBreakdown: Record<string, number> = {}
        let highestSingleScore = 0

        this.scoreHistory.forEach(entry => {
            scoreBreakdown[entry.reason] =
                (scoreBreakdown[entry.reason] || 0) + entry.points
            if (entry.points > highestSingleScore) {
                highestSingleScore = entry.points
            }
        })

        return {
            totalScore: this.currentScore,
            totalActions: this.scoreHistory.length,
            averagePointsPerAction:
                this.scoreHistory.length > 0
                    ? this.currentScore / this.scoreHistory.length
                    : 0,
            highestSingleScore,
            scoreBreakdown,
        }
    }
}
