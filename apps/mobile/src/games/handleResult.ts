import type { HandleSessionHandlers } from '@cetus/app-core'
import { createRunGuard, type BaseGameStats } from '@cetus/games'
import type { GameID } from '@cetus/shared/games'
import type { ScoreSubmitter } from '@cetus/shared/scores'
import type {
    ScorePlatform,
    ScoreSubmissionContext,
} from '@cetus/shared/validations'

import type { NativeGameProjection } from './registry'
import type { NativeRewardDelivery } from './rewards'

export interface HandleScoredFinish {
    score: number
    stats: BaseGameStats
    gameData: Record<string, unknown>
    context?: ScoreSubmissionContext
}

export interface HandleLocalFinish {
    score: number
    stats: BaseGameStats
}

export interface HandleResultOptions {
    gameId: GameID
    platform: ScorePlatform
    submitScore: ScoreSubmitter
    handlers: HandleSessionHandlers<NativeGameProjection>
    /** Fires for committed saves only, including a stale prior run's save. */
    onRewards: (delivery: NativeRewardDelivery) => void
    /** Fires once per new run, before its first model callback. */
    onRunStart: () => void
    /** True once the runtime disposed/account-switched: no UI may update. */
    isDisposed: () => boolean
}

/**
 * One handle-game result helper for Circuit Hacker, Satellite Sync and Ice
 * Slide. `beginRun` opens a token and resets the visible score/time; a
 * score-eligible finish publishes a provisional `pending` result, issues
 * exactly ONE injected POST, then settles the SAME run to `saved` or
 * `unconfirmed`. A non-saving finish publishes a local result with no
 * `saveStatus` at all. Stale prior-run completions never overwrite a newer
 * run's result, `idle` invalidates any in-flight run, yet a prior run's
 * committed awards still forward once (matching BaseGame); disposal
 * suppresses everything. No retries. `finishAndSave` takes an optional
 * per-call `onSaved` fired on the same committed-save edge as `onRewards`.
 */
export function createHandleResult(options: HandleResultOptions) {
    const guard = createRunGuard()
    // Guards duplicate finish callbacks for one run (no second POST).
    let finishedRun: number | null = null

    const settle = (
        runId: number,
        result: Parameters<
            HandleSessionHandlers<NativeGameProjection>['onEnd']
        >[0]
    ): void => {
        if (options.isDisposed() || guard.isStale(runId)) {
            return
        }
        options.handlers.onEnd(result)
    }

    return {
        beginRun(timeRemaining: number): void {
            guard.next()
            finishedRun = null
            options.handlers.onScore?.(0)
            options.handlers.onTime?.(timeRemaining)
            // onStart also clears a previous run's result (createHandleSession).
            options.handlers.onStart()
            options.onRunStart()
        },

        finishAndSave(finish: HandleScoredFinish, onSaved?: () => void): void {
            const runId = guard.current()
            if (options.isDisposed() || finishedRun === runId) {
                return
            }
            finishedRun = runId
            options.handlers.onScore?.(finish.score)
            options.handlers.onEnd({
                score: finish.score,
                stats: finish.stats,
                saveStatus: 'pending',
            })
            void (async () => {
                let outcome: Awaited<ReturnType<ScoreSubmitter>>
                try {
                    outcome = await options.submitScore({
                        gameId: options.gameId,
                        score: finish.score,
                        gameData: finish.gameData,
                        context: finish.context,
                        platform: options.platform,
                    })
                } catch {
                    settle(runId, {
                        score: finish.score,
                        stats: finish.stats,
                        saveStatus: 'unconfirmed',
                    })
                    return
                }
                if (options.isDisposed()) {
                    return
                }
                settle(runId, {
                    score: finish.score,
                    stats: finish.stats,
                    newAchievements: outcome.success
                        ? outcome.newAchievements
                        : undefined,
                    challengeUpdates: outcome.success
                        ? outcome.challengeUpdates
                        : undefined,
                    saveStatus: outcome.success ? 'saved' : 'unconfirmed',
                    saveCode: outcome.success ? undefined : outcome.code,
                })
                // A committed save earns its awards even if a newer run already
                // replaced the result; one delivery, never a second POST.
                if (outcome.success) {
                    options.onRewards({
                        achievements: outcome.newAchievements,
                        challenges: outcome.challengeUpdates,
                    })
                    onSaved?.()
                }
            })()
        },

        finishLocal(finish: HandleLocalFinish): void {
            const runId = guard.current()
            if (options.isDisposed() || finishedRun === runId) {
                return
            }
            finishedRun = runId
            options.handlers.onScore?.(finish.score)
            // No saveStatus key: this outcome never reaches the score API.
            options.handlers.onEnd({ score: finish.score, stats: finish.stats })
        },

        idle(): void {
            // Stop / failed-start boundary: invalidate the current run token
            // so an in-flight save can no longer settle the previous run's
            // result over fresh UI. Committed rewards still forward
            // independently in finishAndSave.
            guard.next()
            finishedRun = null
            options.handlers.onIdle?.()
        },
    }
}

export type HandleResultHelper = ReturnType<typeof createHandleResult>
