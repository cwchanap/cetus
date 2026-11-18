import { describe, expect, it } from 'vitest'
import type { IceSlideGameData } from './types'
import { iceSlideScoreSubmission } from './scoreSubmission'

const gameData = (
    mode: IceSlideGameData['mode'],
    overrides: Partial<IceSlideGameData> = {}
): IceSlideGameData => ({
    levelsCleared: 1,
    totalMoves: 4,
    crystalsCollected: 0,
    elapsedSeconds: 30,
    solved: false,
    perfectLevels: 1,
    mode,
    runKey:
        mode === 'campaign'
            ? 'ice-slide:campaign:g1:r1'
            : mode === 'daily'
              ? 'ice-slide:daily:2026-08-12:g1:r1'
              : // A real Expedition runKey's hash is irrelevant to the policy.
                'ice-slide:expedition:00000000:g1:r2',
    runSchemaVersion: 1,
    generatorVersion: 1,
    rulesetVersion: mode === 'expedition' ? 2 : 1,
    stagesTotal: mode === 'campaign' ? 8 : mode === 'daily' ? 5 : 6,
    starsEarned: 0,
    falls: 0,
    resets: 0,
    stageSignatures: [],
    routeChoices: [],
    undoChargesAvailable: 0,
    undoChargesUsed: 0,
    starsPossible: 0,
    stageObjectiveIds: [],
    stageScoreMultipliersBps: [],
    ...overrides,
})

describe('iceSlideScoreSubmission — the shared web/native policy', () => {
    it('never submits a nonpositive score, on a win or a stop', () => {
        for (const reason of ['win', 'stop'] as const) {
            for (const mode of ['campaign', 'daily', 'expedition'] as const) {
                expect(
                    iceSlideScoreSubmission({
                        score: 0,
                        gameData: gameData(mode),
                        reason,
                        wasPlaying: true,
                    })
                ).toBeNull()
                expect(
                    iceSlideScoreSubmission({
                        score: -5,
                        gameData: gameData(mode),
                        reason,
                        wasPlaying: true,
                    })
                ).toBeNull()
            }
        }
    })

    it('keeps Campaign unscoped on a win and a positive early stop', () => {
        const data = gameData('campaign')
        for (const reason of ['win', 'stop'] as const) {
            const submission = iceSlideScoreSubmission({
                score: 225,
                gameData: data,
                reason,
                wasPlaying: reason === 'stop',
            })
            expect(submission).toEqual({ score: 225, gameData: data })
            expect(submission).not.toHaveProperty('context')
        }
    })

    it('submits a Daily win with the exact daily context', () => {
        const data = gameData('daily', { solved: true })
        expect(
            iceSlideScoreSubmission({
                score: 900,
                gameData: data,
                reason: 'win',
                wasPlaying: false,
            })
        ).toEqual({
            score: 900,
            gameData: data,
            context: {
                mode: 'daily',
                competitionKey: 'ice-slide:daily:2026-08-12:g1:r1',
                rulesetVersion: 1,
            },
        })
    })

    it('never submits a Daily early Stop, positive or not', () => {
        const data = gameData('daily')
        expect(
            iceSlideScoreSubmission({
                score: 0,
                gameData: data,
                reason: 'stop',
                wasPlaying: true,
            })
        ).toBeNull()
        expect(
            iceSlideScoreSubmission({
                score: 1200,
                gameData: data,
                reason: 'stop',
                wasPlaying: true,
            })
        ).toBeNull()
    })

    it('submits Expedition wins and positive early stops with the expedition context', () => {
        const data = gameData('expedition')
        for (const reason of ['win', 'stop'] as const) {
            expect(
                iceSlideScoreSubmission({
                    score: 640,
                    gameData: data,
                    reason,
                    wasPlaying: reason === 'stop',
                })
            ).toEqual({
                score: 640,
                gameData: data,
                context: { mode: 'expedition', rulesetVersion: 2 },
            })
        }
    })

    it('never re-submits an already-stopped run', () => {
        for (const mode of ['campaign', 'expedition'] as const) {
            expect(
                iceSlideScoreSubmission({
                    score: 400,
                    gameData: gameData(mode),
                    reason: 'stop',
                    wasPlaying: false,
                })
            ).toBeNull()
        }
    })

    it('returns the same gameData object so one payload is POSTed', () => {
        const data = gameData('campaign')
        const submission = iceSlideScoreSubmission({
            score: 10,
            gameData: data,
            reason: 'win',
            wasPlaying: false,
        })
        expect(submission?.gameData).toBe(data)
    })
})
