// Portable BaseGame-only notification forwarder (HPA-425 Stage 1): hosts
// attach exactly one 'end' listener per BaseGame screen through this helper
// instead of a per-screen toast bridge. It forwards only structured end
// payloads — numeric `score` plus object `stats`, the same discrimination
// rule as the app-core session adapter — so the timer's bare 'end' is
// ignored, and it never resubmits scores. Reward fields describe what the
// completed run's committed save actually earned, so they are delivered
// even when the run went stale while its save was in flight (the payload's
// runId is what lets the session adapter keep the stale score/stats out of
// the result projection — a separate concern).
import type { BaseGame, ChallengeUpdates, GameEvent } from '@cetus/games'
import type { AchievementNotification } from '@cetus/shared/achievements'

/** Host-supplied reward sinks — e.g. web's window.* toasts or one
 *  mounted-account-scoped mobile banner. */
export interface ForwardBaseGameResultsHandlers {
    onAchievements: (achievements: AchievementNotification[]) => void
    onChallenges: (updates: ChallengeUpdates) => void
}

export function forwardBaseGameResults(
    game: Pick<BaseGame, 'on' | 'off'>,
    handlers: ForwardBaseGameResultsHandlers
): () => void {
    const onGameEnd = (event: GameEvent): void => {
        const data = event.data
        // Bare timer end carries no payload; structured end has score + stats.
        if (
            !data ||
            typeof data.score !== 'number' ||
            typeof data.stats !== 'object' ||
            data.stats === null
        ) {
            return
        }
        const payload = data as {
            newAchievements?: AchievementNotification[]
            challengeUpdates?: ChallengeUpdates
        }
        if (payload.newAchievements && payload.newAchievements.length > 0) {
            handlers.onAchievements(payload.newAchievements)
        }
        if (payload.challengeUpdates?.completedChallenges?.length) {
            handlers.onChallenges(payload.challengeUpdates)
        }
    }
    game.on('end', onGameEnd)
    // GameEventEmitter.off is already a no-op for unregistered listeners,
    // so calling the remover twice is safe.
    return () => {
        game.off('end', onGameEnd)
    }
}
