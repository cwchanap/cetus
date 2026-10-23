export interface PatternPulseRoundScoreInput {
    sequenceLength: number
    streak: number
    averageResponseMs: number
}

export function calculatePatternPulseRoundScore({
    sequenceLength,
    streak,
    averageResponseMs,
}: PatternPulseRoundScoreInput): number {
    const completionPoints = Math.max(0, Math.floor(sequenceLength)) * 100
    const streakBonus = Math.max(0, Math.floor(streak) - 1) * 50
    const responseMs = Math.max(0, averageResponseMs)
    const speedBonus = Math.max(
        0,
        Math.min(200, 200 - Math.floor(responseMs / 5))
    )
    return completionPoints + streakBonus + speedBonus
}
