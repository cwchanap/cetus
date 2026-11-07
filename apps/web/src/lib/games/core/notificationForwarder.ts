// Thin web adapter (HPA-425 Stage 1) over the portable forwarder in
// `@cetus/app-core`: keeps the existing import path and forwards rewards to
// the web `window.*` toast sinks registered by the AppNotifications island.
// The structured-end filtering and reward delivery live in app-core; mobile
// passes its own mounted-account-scoped banner sink instead.
import { forwardBaseGameResults as forwardPortableResults } from '@cetus/app-core'
import type { BaseGame } from '@cetus/games/core/BaseGame'

export function forwardBaseGameResults(
    game: Pick<BaseGame, 'on' | 'off'>
): () => void {
    return forwardPortableResults(game, {
        onAchievements: achievements => {
            if (
                typeof window !== 'undefined' &&
                typeof window.showAchievementAward === 'function'
            ) {
                window.showAchievementAward(achievements)
            }
        },
        onChallenges: updates => {
            if (
                typeof window !== 'undefined' &&
                typeof window.showChallengeComplete === 'function'
            ) {
                window.showChallengeComplete(updates)
            }
        },
    })
}
