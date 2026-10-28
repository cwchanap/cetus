// Shared BaseGame-only web notification forwarder (HPA-393 §2): every
// standard React-controlled BaseGame screen attaches exactly one 'end'
// listener through this helper instead of a per-game toast bridge. It
// forwards only structured end payloads — numeric `score` plus object
// `stats`, the same discrimination rule as the app-core adapter — so the
// timer's bare 'end' is ignored, preserves BaseGame's stale-run filtering
// (stale runs carry undefined reward fields), and never resubmits scores.
import type { BaseGame } from '@cetus/games/core/BaseGame'
import type { ChallengeUpdates, GameEvent } from '@cetus/games/core/types'
import type { AchievementNotification } from '@cetus/shared/achievements'

export function forwardBaseGameResults(
    game: Pick<BaseGame, 'on' | 'off'>
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
            if (
                typeof window !== 'undefined' &&
                typeof window.showAchievementAward === 'function'
            ) {
                window.showAchievementAward(payload.newAchievements)
            }
        }
        if (payload.challengeUpdates?.completedChallenges?.length) {
            if (
                typeof window !== 'undefined' &&
                typeof window.showChallengeComplete === 'function'
            ) {
                window.showChallengeComplete(payload.challengeUpdates)
            }
        }
    }
    game.on('end', onGameEnd)
    // GameEventEmitter.off is already a no-op for unregistered listeners,
    // so calling the remover twice is safe.
    return () => {
        game.off('end', onGameEnd)
    }
}
