import { describe, expect, it } from 'vitest'
import {
    DAILY_SCORING_CONFIG,
    EXPEDITION_SCORING_CONFIG,
    SCORING_CONFIG,
    iceSlideScoringConfig,
    isIceSlideObjectiveMode,
    levelScore,
    timeBonus,
} from './scoring'
import { ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS } from './expedition'

describe('Ice Slide scoring configuration', () => {
    it('preserves Campaign scoring defaults', () => {
        expect(
            levelScore({
                levelNumber: 2,
                parMoves: 4,
                movesUsed: 4,
                crystalsCollected: 1,
            })
        ).toBe(400 + 25 + 50)
        expect(timeBonus(0)).toBe(1800)
        expect(timeBonus(360)).toBe(0)
    })

    it('locks the Daily scoring configuration', () => {
        expect(
            levelScore(
                {
                    levelNumber: 2,
                    parMoves: 4,
                    movesUsed: 4,
                    crystalsCollected: 1,
                    optionalStarsEarned: 2,
                },
                DAILY_SCORING_CONFIG
            )
        ).toBe(400 + 25 + 50 + 200)
        expect(timeBonus(0, DAILY_SCORING_CONFIG)).toBe(1500)
        expect(timeBonus(299, DAILY_SCORING_CONFIG)).toBe(5)
        expect(timeBonus(300, DAILY_SCORING_CONFIG)).toBe(0)
        expect(timeBonus(301, DAILY_SCORING_CONFIG)).toBe(0)
    })

    it('applies the Expedition risk multiplier after all objective bonuses', () => {
        expect(
            levelScore(
                {
                    levelNumber: 3,
                    parMoves: 4,
                    movesUsed: 4,
                    crystalsCollected: 1,
                    optionalStarsEarned: 3,
                    scoreMultiplierBps:
                        ICE_SLIDE_EXPEDITION_RISK_MULTIPLIER_BPS,
                },
                EXPEDITION_SCORING_CONFIG
            )
        ).toBe(Math.floor((600 + 25 + 50 + 300) * 1.25))
    })

    it('maps objective modes and scoring configs explicitly', () => {
        expect(isIceSlideObjectiveMode('campaign')).toBe(false)
        expect(isIceSlideObjectiveMode('daily')).toBe(true)
        expect(isIceSlideObjectiveMode('expedition')).toBe(true)

        expect(iceSlideScoringConfig('campaign')).toBe(SCORING_CONFIG)
        expect(iceSlideScoringConfig('daily')).toBe(DAILY_SCORING_CONFIG)
        expect(iceSlideScoringConfig('expedition')).toBe(
            EXPEDITION_SCORING_CONFIG
        )
    })

    it('uses a 360-second Expedition completion budget', () => {
        expect(EXPEDITION_SCORING_CONFIG).toEqual({
            objectiveStarBonus: 100,
            timeBudgetSeconds: 360,
            timeBonusPerSec: 5,
        })
        expect(EXPEDITION_SCORING_CONFIG.timeBudgetSeconds).toBe(
            SCORING_CONFIG.timeBudgetSeconds
        )
        expect(timeBonus(300, EXPEDITION_SCORING_CONFIG)).toBe(300)
        expect(timeBonus(360, EXPEDITION_SCORING_CONFIG)).toBe(0)
    })
})
