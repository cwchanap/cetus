/**
 * Score submission transport contracts, shared across hosts.
 *
 * These are the canonical types for submitting a finished run to the
 * application API. Web's browser fetch transport lives in
 * `apps/web/src/lib/services/scoreService.ts`; game simulations only ever
 * see an injected `ScoreSubmitter`, so they stay host- and DOM-free.
 *
 * The success payload reuses the canonical POST /api/scores wire DTO
 * (`ScoreSubmitResponse` in `./api-dto`); failure shapes are the public
 * client-side error codes below.
 */

import type { AchievementNotification } from './achievements'
import type { ChallengeUpdatesPayload } from './api-dto'
import type { GameData } from './game-data'
import type { GameID } from './games'
import type { ScorePlatform, ScoreSubmissionContext } from './validations'

/**
 * Public score-submission failure codes surfaced to callers. The obsolete
 * `TRANSPORT_UNAVAILABLE` code was retired with the implicit browser
 * transport fallback (HPA-447 Stage 2): hosts must inject a submitter.
 */
export type ScoreSubmissionPublicErrorCode =
    'SCORE_CONTEXT_UNAVAILABLE' | 'UNAUTHENTICATED' | 'NETWORK_ERROR'

/** Request body for POST /api/scores. */
export interface ScoreData {
    gameId: GameID
    score: number
    gameData?: GameData | Record<string, unknown>
    context?: ScoreSubmissionContext
    platform?: ScorePlatform
}

/** Result of a score submission as reported by the transport. */
export interface ScoreSubmissionResult {
    success: boolean
    newAchievements?: AchievementNotification[]
    challengeUpdates?: ChallengeUpdatesPayload
    error?: string
    code?: ScoreSubmissionPublicErrorCode
}

/**
 * Transport seam for score submission: the web host POSTs to /api/scores;
 * other hosts inject their own transport.
 */
export type ScoreSubmitter = (data: ScoreData) => Promise<ScoreSubmissionResult>
