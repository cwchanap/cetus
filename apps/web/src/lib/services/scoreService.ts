/**
 * Score Service - Centralized score management for all games
 *
 * This module is the thin web adapter over `@cetus/api-client`: score
 * submission and best-score lookups ride the shared typed client (relative
 * base URL, ambient browser fetch). Game simulations receive the submitter
 * via the injected `submitScore` config — there is no implicit fallback.
 * The transport contracts (`ScoreData`, `ScoreSubmissionResult`,
 * `ScoreSubmitter`) are canonically defined in `@cetus/shared/scores`.
 */

import { type GameID, getGameById } from '@cetus/shared/games'
import type { GameData } from '@cetus/shared/game-data'
import type {
    ScoreSubmissionContext,
    ScorePlatform,
} from '@cetus/shared/validations'
import type {
    ScoreData,
    ScoreSubmissionResult,
    ScoreSubmitter,
} from '@cetus/shared/scores'
import { createApiClient } from '@cetus/api-client/api-client'

export interface SaveScoreOptions {
    isStale?: () => boolean
    context?: ScoreSubmissionContext
    submitScore?: ScoreSubmitter
    platform?: ScorePlatform
}

// The client's default fetchImpl already binds the ambient global fetch
// lazily at call time, so tests and hosts can stub globalThis.fetch after
// import.
const api = createApiClient()

/**
 * Submit a score to the server with comprehensive error handling
 */
export async function submitScore(
    scoreData: ScoreData
): Promise<ScoreSubmissionResult> {
    return api.submitScore(scoreData)
}

/**
 * Save score and handle achievements display
 */
export async function saveGameScore(
    gameId: GameID,
    score: number,
    onSuccess?: (result: ScoreSubmissionResult) => void,
    onError?: (error: string, result?: ScoreSubmissionResult) => void,
    gameData?: GameData | Record<string, unknown>,
    options?: SaveScoreOptions
): Promise<void> {
    if (score <= 0) {
        return
    }

    try {
        const scoreData: ScoreData = { gameId, score }
        if (gameData !== undefined) {
            scoreData.gameData = gameData
        }
        if (options?.context !== undefined) {
            scoreData.context = options.context
        }
        if (options?.platform !== undefined) {
            scoreData.platform = options.platform
        }
        // Invoke the injected submitter as a method of the options object so
        // a host-supplied method keeps a defined `this`.
        const result = await (options?.submitScore
            ? options.submitScore(scoreData)
            : submitScore(scoreData))

        if (options?.isStale?.()) {
            return
        }

        if (result.success) {
            // Handle newly earned achievements
            if (result.newAchievements && result.newAchievements.length > 0) {
                // Show achievement award notifications
                if (
                    typeof window !== 'undefined' &&
                    window.showAchievementAward
                ) {
                    window.showAchievementAward(result.newAchievements)
                }
            }

            // Handle completed challenges
            if (result.challengeUpdates?.completedChallenges?.length) {
                if (
                    typeof window !== 'undefined' &&
                    window.showChallengeComplete
                ) {
                    window.showChallengeComplete(result.challengeUpdates)
                }
            }

            onSuccess?.(result)
        } else {
            const message = result.error || 'Failed to save score'
            if (result.code === 'NETWORK_ERROR') {
                onError?.(message)
            } else {
                onError?.(message, result)
            }
        }
    } catch (_error) {
        if (options?.isStale?.()) {
            return
        }
        onError?.('Network error occurred')
    }
}

/**
 * Get user's best score for a specific game.
 *
 * Returns the best score as a number, or null when the user has no score.
 *
 * Note: this adapter intentionally collapses every non-success path — network
 * errors, non-2xx responses, and the server's retryable 503
 * `SCORE_CONTEXT_UNAVAILABLE` state (see `src/pages/api/scores/best.ts`) — to
 * the same null result used for "no score yet". This is the documented client
 * contract: callers cannot distinguish a transient score-context outage from
 * a genuine empty best score, and should treat null as "no score to show".
 * If a future caller needs to retry on the unavailable state, switch this to
 * a discriminated result that propagates `SCORE_CONTEXT_UNAVAILABLE`.
 */
export async function getUserBestScore(gameId: GameID): Promise<number | null> {
    try {
        const result = await api.getBestScore(gameId)
        return result.bestScore
    } catch (_error) {
        return null
    }
}

/**
 * Format game name for display
 */
export function formatGameName(gameId: GameID): string {
    const game = getGameById(gameId as GameID)
    return game?.name ?? gameId.charAt(0).toUpperCase() + gameId.slice(1)
}

/**
 * Format score for display
 */
export function formatScore(score: number): string {
    return score.toLocaleString()
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}
