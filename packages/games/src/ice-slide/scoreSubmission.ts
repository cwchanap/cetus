import type { ScoreSubmissionContext } from '@cetus/shared/validations'
import type { IceSlideGameData } from './types'

export interface IceSlideScorePolicyInput {
    /** The run's numeric score; `IceSlideGameData` does not carry it. */
    score: number
    gameData: IceSlideGameData
    reason: 'win' | 'stop'
    /** Model status was `playing` when the stop was requested. */
    wasPlaying: boolean
}

export interface IceSlideScoreSubmission {
    score: number
    gameData: IceSlideGameData
    context?: ScoreSubmissionContext
}

/**
 * The one web/native Ice Slide score decision contract (HPA-535 Stage 3).
 * Returns the exact payload to POST, or null when nothing may be saved:
 * - a nonpositive score is never submitted;
 * - a Daily early Stop never submits (only a Daily win does);
 * - an already-stopped run never submits again;
 * - Campaign and Expedition early Stops submit only while still playing.
 * Daily wins carry `{mode:'daily', competitionKey:runKey, rulesetVersion}`,
 * Expedition runs `{mode:'expedition', rulesetVersion}` and Campaign stays
 * unscoped.
 */
export function iceSlideScoreSubmission(
    input: IceSlideScorePolicyInput
): IceSlideScoreSubmission | null {
    const { score, gameData, reason, wasPlaying } = input
    if (!(score > 0)) {
        return null
    }
    if (reason === 'stop') {
        if (!wasPlaying || gameData.mode === 'daily') {
            return null
        }
    }
    if (gameData.mode === 'daily') {
        return {
            score,
            gameData,
            context: {
                mode: 'daily',
                competitionKey: gameData.runKey,
                rulesetVersion: gameData.rulesetVersion,
            },
        }
    }
    if (gameData.mode === 'expedition') {
        return {
            score,
            gameData,
            context: {
                mode: 'expedition',
                rulesetVersion: gameData.rulesetVersion,
            },
        }
    }
    return { score, gameData }
}
